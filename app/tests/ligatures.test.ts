/// <reference types="node" />
// The brand face's "fi" ligature drops the i's dot ("Profil" read as "Profıl"): every Text and TextInput turns the
// common ligatures off (lib/ligatures, components/text), keeping a style's own fontVariant; on the phones, whose
// renderer ignores that part of fontVariant, Text keeps f and i apart with a zero-width non-joiner.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { NO_LIGATURES, ZWNJ, breakFi, fontVariantOf } from '@/lib/ligatures';

describe('fi bağlacı (Profil, Profıl değil)', () => {
  test('yazının kendi fontVariant ayarı korunur, bağlaçlar kapatılır', () => {
    assert.deepEqual(fontVariantOf(undefined), [NO_LIGATURES]);
    assert.deepEqual(fontVariantOf(null), [NO_LIGATURES]);
    assert.deepEqual(fontVariantOf([]), [NO_LIGATURES]);
    assert.equal(fontVariantOf(undefined), fontVariantOf(null), 'her seferinde aynı dizi');
    assert.deepEqual(fontVariantOf(['tabular-nums']), ['tabular-nums', NO_LIGATURES]);
    assert.deepEqual(fontVariantOf('small-caps  tabular-nums'), ['small-caps', 'tabular-nums', NO_LIGATURES]);
    assert.deepEqual(fontVariantOf(''), [NO_LIGATURES]);
    // A style that says something about ligatures itself keeps its choice.
    assert.deepEqual(fontVariantOf(['common-ligatures']), ['common-ligatures']);
    assert.deepEqual(fontVariantOf(['no-common-ligatures', 'tabular-nums']), ['no-common-ligatures', 'tabular-nums']);
  });

  test('telefonda f ile i arasına görünmez ayırıcı girer; başka harf değişmez', () => {
    assert.equal(breakFi('Profil çerçevesi'), `Prof${ZWNJ}il çerçevesi`);
    assert.equal(breakFi('fifi'), `f${ZWNJ}if${ZWNJ}i`);
    assert.equal(breakFi('office'), `off${ZWNJ}ice`, '"ffi": yalnız i\'den önce');
    for (const same of ['Sessiz ziyaret', 'fıstık', 'Fİ', 'flört', 'kaffe', '']) assert.equal(breakFi(same), same);
    // What a screen reader or a search compares is the same word once the invisible character is taken out.
    assert.equal(breakFi('Profili düzenle').replaceAll(ZWNJ, ''), 'Profili düzenle');
  });

  test('Text ve TextInput bağlaçları kapatır; telefonda Text ayırıcıyı ekler, seçilebilir yazıda eklemez', () => {
    const src = fs.readFileSync(path.resolve(import.meta.dirname, '../src/components/text.tsx'), 'utf8');
    const text = src.slice(src.indexOf('export function Text('), src.indexOf('export function TextInput('));
    const input = src.slice(src.indexOf('export function TextInput('));
    assert.match(src, /import \{[^}]*breakFi[^}]*fontVariantOf[^}]*\} from '@\/lib\/ligatures'/);
    // The outermost text gets the default; a nested one inherits it unless its own style sets a fontVariant.
    assert.match(text, /flat\?\.fontVariant !== undefined \? variantOf\(flat\.fontVariant\) : parent \? null : NO_LIGATURES/);
    assert.match(text, /style=\{\[NO_PAD, style, own, variant, scaledOf\(flat, !parent\)\]\}/, 'Text: varsayılan stilin ardından');
    assert.match(input, /flat\?\.fontVariant !== undefined \? variantOf\(flat\.fontVariant\) : NO_LIGATURES/);
    assert.match(input, /style=\{\[top, style, own, variant, scaledOf\(flat, true\)\]\}/, 'TextInput: varsayılan stilin ardından');
    assert.match(src, /const SPLIT_FI = Platform\.OS !== 'web';/, 'web fontVariant\'ı uygular; ayırıcı yalnız telefonda');
    assert.match(text, /SPLIT_FI && !rest\.selectable \? unjoinFi\(children\) : children/);
  });
});
