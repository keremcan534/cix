// The contact filter against the shared red-team corpus (test/contact-filter-corpus.json): every block text is
// refused with its category, every allow text passes, and numbers typed over several messages are caught.
//   node --test test/contact-filter.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIES, CONTACT_MESSAGE, DEFAULT_RULES, checkSequence, checkText, isNumberOnly, resetRules, setRules } from '../contact-filter.mjs';

const corpus = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'contact-filter-corpus.json'), 'utf8'));
// Invisible characters written out so a failure list is readable.
const show = (t) => JSON.stringify(t).replace(/[​-‏⁠﻿­̀-ͯ]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const verdict = (r) => (r.ok ? 'allowed' : r.category);

/** Sends the messages one by one as the API does; the category of the first refusal, or null. */
function sendAll(messages) {
  const sent = [];
  for (const m of messages) {
    let r = checkText(m);
    if (r.ok) r = checkSequence(sent, m);
    if (!r.ok) return { at: sent.length, category: r.category };
    sent.push(m);
  }
  return null;
}

describe('corpus', () => {
  test('the corpus is well formed', () => {
    assert.deepEqual(corpus.meta.categoryPriority, CATEGORIES);
    assert.ok(corpus.block.length > 500 && corpus.allow.length > 400);
    for (const c of corpus.block) assert.ok(CATEGORIES.includes(c.category), c.text);
  });

  for (const category of CATEGORIES) {
    const cases = corpus.block.filter((c) => c.category === category);
    test(`block: ${category} (${cases.length})`, () => {
      const wrong = cases.map((c) => [c.text, checkText(c.text)]).filter(([, r]) => r.ok || r.category !== category);
      assert.equal(wrong.length, 0, `\n${wrong.length} of ${cases.length} not refused as ${category}:\n${wrong.map(([t, r]) => `  ${show(t)} → ${verdict(r)}`).join('\n')}`);
    });
  }

  test(`allow (${corpus.allow.length})`, () => {
    const wrong = corpus.allow.map((c) => [c, checkText(c.text)]).filter(([, r]) => !r.ok);
    assert.equal(wrong.length, 0, `\n${wrong.length} of ${corpus.allow.length} refused:\n${wrong.map(([c, r]) => `  ${show(c.text)} → ${r.category}  (${c.why})`).join('\n')}`);
  });

  test(`sequences that must be refused by their last message (${corpus.sequences.block.length})`, () => {
    const wrong = corpus.sequences.block.map((s) => [s, sendAll(s.messages)]).filter(([s, r]) => !r || r.category !== s.category);
    assert.equal(wrong.length, 0, `\n${wrong.map(([s, r]) => `  ${show(s.messages)} → ${r ? r.category : 'all allowed'} (want ${s.category})`).join('\n')}`);
  });

  test(`sequences where every message passes (${corpus.sequences.allow.length})`, () => {
    const wrong = corpus.sequences.allow.map((s) => [s, sendAll(s.messages)]).filter(([, r]) => r);
    assert.equal(wrong.length, 0, `\n${wrong.map(([s, r]) => `  ${show(s.messages)} → message ${r.at + 1} refused as ${r.category} (${s.why})`).join('\n')}`);
  });
});

describe('details', () => {
  test('the refusal message is the agreed one', () => {
    assert.equal(CONTACT_MESSAGE, 'Güvenliğin için telefon numarası, IBAN, e-posta, bağlantı veya sosyal medya hesabı paylaşılamaz.');
  });

  test('in-app IDs and everyday numbers pass', () => {
    for (const t of ['ID: 100000000001', 'ID 107919123456', 'oda 10000000', 'odam 87654321', 'Aile 1234567', 'hesabımda 150000 jeton var', 'etkinlik 05.11.2026 21.30', '', '   ', '🙂']) {
      assert.deepEqual(checkText(t), { ok: true }, t);
    }
  });

  test('a phone number next to a time-like pair is still a phone number', () => {
    assert.equal(checkText('beni 0532 123 12.34 ara').category, 'phone');
  });

  test('a link typed a letter at a time is a link; spaced letters alone are not', () => {
    for (const t of ['w w w . o r n e k . c o m', 'o r n e k . n e t', 'w w w ornek']) assert.equal(checkText(t).category, 'link', t);
    for (const t of ['o o o çok güzel', 's e l a m', '1 . 2 . 3', 'O da geldi. net olarak söyledim']) assert.ok(checkText(t).ok, t);
  });

  test('the first match in priority order is reported', () => {
    assert.equal(checkText('insta: ayse 0532 123 45 67').category, 'phone');
    assert.equal(checkText('wp yaz TR33 0006 1005 1978 6457 8413 26').category, 'iban');
    assert.equal(checkText('ig: @ayse').category, 'handle');
  });

  test('number-only messages', () => {
    for (const t of ['0532', '123', '+90', 'yüz yirmi üç', '０５３２', 'TR33 0006 1005']) assert.ok(isNumberOnly(t), t);
    for (const t of ['x99', '30 olur mu', 'sen?', '0532 123 45 67 88 99 00 11', '']) assert.ok(!isNumberOnly(t), t);
  });

  test('a sequence is read only through the trailing number-only messages', () => {
    assert.ok(checkSequence(['0532', '123', 'naber'], '45').ok);
    assert.equal(checkSequence(['naber', '0532', '123', '45'], '67').category, 'phone');
    assert.ok(checkSequence([], '0532').ok);
  });

  test('live settings override the lists and go back to the defaults', () => {
    assert.ok(checkText('kuşgram hesabım').ok);
    setRules({ words: { ...DEFAULT_RULES.words, social: [...DEFAULT_RULES.words.social, 'kusgram'] } });
    try {
      assert.equal(checkText('kuşgram hesabım').category, 'social');
    } finally {
      resetRules();
    }
    assert.ok(checkText('kuşgram hesabım').ok);
  });

  test('long texts are checked quickly', () => {
    const texts = ['i n s t a '.repeat(100), 'selam naber 12 '.repeat(66), 'yüz '.repeat(250), 'a'.repeat(1000)];
    const t0 = performance.now();
    for (const t of texts) checkText(t);
    assert.ok(performance.now() - t0 < 2000, `${Math.round(performance.now() - t0)} ms`);
  });
});
