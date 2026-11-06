/// <reference types="node" />
// The app refuses contact details before it sends (lib/contact-filter.ts); the server refuses them again
// (server/api/contact-filter.mjs). If the two drift apart, the app would send a text the server refuses, or
// refuse one the server accepts. This runs the shared red-team corpus through the app's filter and pins the
// lists, thresholds and verdicts of both sides together.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CATEGORIES,
  CONTACT_MESSAGE,
  CONTACT_TITLE,
  DEFAULT_RULES,
  checkSequence,
  checkText,
  contactRefusal,
  isContactBlocked,
  isNumberOnly,
  messageRefusal,
  normalizeText,
  noteSent,
  onContactRefusal,
  refusalTitle,
  resetRules,
  setRules,
  usernameText,
  type ContactVerdict,
} from '@/lib/contact-filter';
// Plain JavaScript module of the server; TypeScript reads it through allowJs.
import * as server from '../../server/api/contact-filter.mjs';

type Corpus = {
  meta: { categoryPriority: string[] };
  block: { text: string; category: string }[];
  allow: { text: string; why?: string }[];
  sequences: { block: { messages: string[]; category: string }[]; allow: { messages: string[]; why?: string }[] };
};
const corpus = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../server/api/test/contact-filter-corpus.json'), 'utf8')) as Corpus;

const serverCheck = server.checkText as (text: unknown) => ContactVerdict;
const serverSequence = server.checkSequence as (previous: string[], current: string) => ContactVerdict;
const serverNumberOnly = server.isNumberOnly as (text: unknown) => boolean;

// Invisible characters written out so a failure list is readable.
const show = (t: unknown) => JSON.stringify(t).replace(/[​-‏⁠﻿­̀-ͯ]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const verdict = (r: ContactVerdict) => (r.ok ? 'allowed' : r.category);

/** Sends the messages one by one as the server does; the category of the first refusal, or null. */
function sendAll(messages: string[]) {
  const sent: string[] = [];
  for (const m of messages) {
    let r = checkText(m);
    if (r.ok) r = checkSequence(sent, m);
    if (!r.ok) return { at: sent.length, category: r.category };
    sent.push(m);
  }
  return null;
}

const everyText = [
  ...corpus.block.map((c) => c.text),
  ...corpus.allow.map((c) => c.text),
  ...corpus.sequences.block.flatMap((s) => s.messages),
  ...corpus.sequences.allow.flatMap((s) => s.messages),
];

describe('İletişim filtresi: ortak derlem uygulamada', () => {
  test('derlem düzgün', () => {
    assert.deepEqual(corpus.meta.categoryPriority, [...CATEGORIES]);
    assert.ok(corpus.block.length > 500 && corpus.allow.length > 400);
  });

  for (const category of CATEGORIES) {
    const cases = corpus.block.filter((c) => c.category === category);
    test(`engellenir: ${category} (${cases.length})`, () => {
      const wrong = cases.map((c) => [c.text, checkText(c.text)] as const).filter(([, r]) => r.ok || r.category !== category);
      assert.equal(wrong.length, 0, `\n${wrong.length} of ${cases.length} not refused as ${category}:\n${wrong.map(([t, r]) => `  ${show(t)} → ${verdict(r)}`).join('\n')}`);
    });
  }

  test(`geçer (${corpus.allow.length})`, () => {
    const wrong = corpus.allow.map((c) => [c, checkText(c.text)] as const).filter(([, r]) => !r.ok);
    assert.equal(wrong.length, 0, `\n${wrong.length} of ${corpus.allow.length} refused:\n${wrong.map(([c, r]) => `  ${show(c.text)} → ${verdict(r)}  (${c.why ?? ''})`).join('\n')}`);
  });

  test(`birkaç mesaja bölünmüş numara son mesajda engellenir (${corpus.sequences.block.length})`, () => {
    const wrong = corpus.sequences.block.map((s) => [s, sendAll(s.messages)] as const).filter(([s, r]) => !r || r.category !== s.category);
    assert.equal(wrong.length, 0, `\n${wrong.map(([s, r]) => `  ${show(s.messages)} → ${r ? r.category : 'all allowed'} (want ${s.category})`).join('\n')}`);
  });

  test(`her mesajı geçen diziler (${corpus.sequences.allow.length})`, () => {
    const wrong = corpus.sequences.allow.map((s) => [s, sendAll(s.messages)] as const).filter(([, r]) => r);
    assert.equal(wrong.length, 0, `\n${wrong.map(([s, r]) => `  ${show(s.messages)} → message ${(r?.at ?? 0) + 1} refused as ${r?.category} (${s.why ?? ''})`).join('\n')}`);
  });
});

describe('İletişim filtresi: uygulama ve sunucu aynı', () => {
  test('aynı mesaj, aynı kategoriler, aynı listeler ve eşikler', () => {
    assert.equal(CONTACT_MESSAGE, server.CONTACT_MESSAGE);
    assert.deepEqual([...CATEGORIES], server.CATEGORIES);
    assert.deepEqual(DEFAULT_RULES, server.DEFAULT_RULES);
  });

  test('her metinde aynı karar (derlem ve türevleri)', () => {
    // The corpus as written, plus each text in capitals, with a word on either side, and joined to the next
    // one, so the two ports are compared on more than the cases they were tuned on.
    const variants = everyText.flatMap((t, k) => [t, t.toLocaleUpperCase('tr'), `selam ${t} tamam mı`, `${t} ${everyText[(k + 1) % everyText.length]}`]);
    const wrong = variants.filter((t) => verdict(checkText(t)) !== verdict(serverCheck(t)));
    assert.equal(wrong.length, 0, `\n${wrong.map((t) => `  ${show(t)} → app ${verdict(checkText(t))}, server ${verdict(serverCheck(t))}`).join('\n')}`);
    assert.equal(normalizeText('İNSTAĞRAM ｗｐ'), (server.normalizeText as (t: string) => string)('İNSTAĞRAM ｗｐ'));
  });

  test('sayı-yalnız mesajlar ve diziler aynı', () => {
    const wrong = everyText.filter((t) => isNumberOnly(t) !== serverNumberOnly(t));
    assert.equal(wrong.length, 0, wrong.map(show).join('\n'));
    for (const s of [...corpus.sequences.block, ...corpus.sequences.allow]) {
      for (let k = 1; k < s.messages.length; k++) {
        const prev = s.messages.slice(0, k);
        assert.equal(verdict(checkSequence(prev, s.messages[k])), verdict(serverSequence(prev, s.messages[k])), show(s.messages.slice(0, k + 1)));
      }
    }
  });

  test('kullanıcı adı sunucudaki gibi okunur', () => {
    // social.mjs: name.trim().toLowerCase().replace(/[._]+/g, ' ')
    for (const u of ['insta_ayse', 'ayse.05321234567', 'elif5321234567', 'tg_elif', 'elif.yildiz', 'kerem_34']) {
      const own = usernameText(u);
      assert.equal(own, u.trim().toLowerCase().replace(/[._]+/g, ' '));
      assert.equal(verdict(checkText(own)), verdict(serverCheck(own)), u);
    }
    assert.equal(checkText(usernameText('insta_ayse')).ok, false);
    assert.equal(checkText(usernameText('elif.yildiz')).ok, true);
  });

  test('canlı ayarlar iki tarafta da listeleri değiştirir ve geri döner', () => {
    const extra = { words: { ...DEFAULT_RULES.words, social: [...DEFAULT_RULES.words.social, 'kusgram'] } };
    assert.ok(checkText('kuşgram hesabım').ok);
    setRules(extra);
    (server.setRules as (o: unknown) => void)(extra);
    try {
      assert.equal(verdict(checkText('kuşgram hesabım')), 'social');
      assert.equal(verdict(serverCheck('kuşgram hesabım')), 'social');
    } finally {
      resetRules();
      (server.resetRules as () => void)();
    }
    assert.ok(checkText('kuşgram hesabım').ok);
  });
});

describe('İletişim filtresi: ekranların kullandığı yardımcılar', () => {
  test('contactRefusal: engelde dostça mesaj, temizde null; yalnızca tür, yer ve zaman sayılır', () => {
    const heard: unknown[] = [];
    const off = onContactRefusal((r) => heard.push(r));
    try {
      assert.equal(contactRefusal('selam, 21:30 da odada görüşürüz', 'dm'), null);
      assert.equal(contactRefusal(['', null, 'Elif', 'instadan yaz'], 'profile.bio'), CONTACT_MESSAGE);
      assert.equal(contactRefusal('0532 123 45 67', 'room.chat'), CONTACT_MESSAGE);
    } finally {
      off();
    }
    assert.equal(heard.length, 2);
    const [first, second] = heard as Record<string, unknown>[];
    assert.deepEqual(Object.keys(first).sort(), ['at', 'category', 'place']);
    assert.deepEqual([first.category, first.place, second.category, second.place], ['social', 'profile.bio', 'phone', 'room.chat']);
    assert.ok(!JSON.stringify(heard).includes('insta') && !JSON.stringify(heard).includes('0532'), 'the refused text is never kept');
    contactRefusal('instadan yaz', 'dm');
    assert.equal(heard.length, 2, 'unsubscribed');
  });

  test('messageRefusal: aynı sohbette parça parça yazılan numara son parçada durur; başka sohbet ve eski mesajlar karışmaz', () => {
    const heard: { category: string; place: string }[] = [];
    const off = onContactRefusal((r) => heard.push(r));
    const t0 = 1_000_000;
    // Sends like a composer: refused lines are not remembered, sent ones are.
    const type = (thread: string, text: string, at: number) => {
      const r = messageRefusal(thread, text, 'group.test', at);
      if (!r) noteSent(thread, text, at);
      return r;
    };
    try {
      assert.equal(type('a', '0532', t0), null);
      assert.equal(type('a', '123', t0 + 1000), null);
      assert.equal(type('b', '45', t0 + 2000), null, 'another chat has its own memory');
      assert.equal(type('a', '45', t0 + 3000), null);
      assert.equal(type('a', '67', t0 + 4000), CONTACT_MESSAGE);
      assert.deepEqual(heard.at(-1), { category: 'phone', place: 'group.test.sequence', at: t0 + 4000 });
      // The window has passed: the earlier parts are forgotten.
      const later = t0 + (DEFAULT_RULES.sequence.windowSeconds + 1) * 1000;
      assert.equal(type('c', '0532', t0), null);
      assert.equal(type('c', '123', t0 + 500), null);
      assert.equal(type('c', '45', later), null);
      assert.equal(type('c', '67', later + 1000), null);
      // Everyday short numbers between words still go out.
      for (const [k, m] of ['kaç jeton attın?', '250', 'sen?', '500'].entries()) assert.equal(type('d', m, t0 + k * 1000), null, m);
      assert.equal(messageRefusal('e', 'wp 0532 123 45 67', 'dm', t0), CONTACT_MESSAGE, 'a single message is checked on its own');
      assert.equal(heard.at(-1)?.place, 'dm');
    } finally {
      off();
    }
  });

  test('refusalTitle: sunucunun iletişim reddi kendi başlığıyla, diğer hatalar ekranın başlığıyla', () => {
    const refusal = Object.assign(new Error(CONTACT_MESSAGE), { data: { code: 'contact_blocked' } });
    assert.equal(refusalTitle(refusal, 'Kaydedilemedi'), CONTACT_TITLE);
    assert.equal(refusalTitle(new Error('Sunucuya ulaşılamadı'), 'Kaydedilemedi'), 'Kaydedilemedi');
  });

  test('isContactBlocked yalnızca sunucunun contact_blocked cevabını tanır', () => {
    const refusal = Object.assign(new Error(CONTACT_MESSAGE), { status: 400, data: { error: CONTACT_MESSAGE, code: 'contact_blocked', category: 'phone' } });
    assert.ok(isContactBlocked(refusal));
    assert.ok(!isContactBlocked(Object.assign(new Error('Mesaj 1–1000 karakter olmalı'), { status: 400, data: { error: 'x' } })));
    assert.ok(!isContactBlocked(Object.assign(new Error('Susturuldun'), { status: 403, data: { code: 'muted' } })));
    assert.ok(!isContactBlocked(null) && !isContactBlocked({ data: { code: 'contact_blocked' } }));
  });
});
