// Spam rules for direct messages (owners, 26 Nov 2026): lib/message-quality, the same as server/api/message-quality.mjs.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { checkQuality, dupKey } from '@/lib/message-quality';

describe('Mesaj spam kuralları', () => {
  test('tek harf, tek rakam ve uzun tekrar reddedilir; emoji ve normal mesaj geçer', () => {
    for (const bad of ['a', '5', 'k!', ' x ', 'ş', 'aaaaaa', '??????', 'Merhabaaaaaa']) assert.equal(checkQuality(bad).ok, false, bad);
    for (const good of ['ok', 'Selam! 👋', '👍', '😂😂', 'hahaha', 'Nasılsın?', '12 jeton', 'iyi geceler!!']) assert.equal(checkQuality(good).ok, true, good);
  });

  test('tekrar karşılaştırması büyük harf, boşluk ve sondaki noktalamayı saymaz', () => {
    assert.equal(dupKey('Merhaba!'), dupKey('merhaba'));
    assert.equal(dupKey('Nasılsın  ?'), dupKey('nasılsın'));
    assert.notEqual(dupKey('Merhaba'), dupKey('Merhaba canım'));
  });

  test('uygulamadaki kopya sunucununkiyle aynı', () => {
    const body = (f: string) => {
      const s = fs.readFileSync(f, 'utf8');
      return s.slice(s.indexOf('export const QUALITY_MESSAGE')).replace(/: string|: \{[^)]*\} \| \{[^)]*\}/g, '').replace(/\r\n/g, '\n');
    };
    const app = body(path.resolve(import.meta.dirname, '../src/lib/message-quality.ts'));
    const server = body(path.resolve(import.meta.dirname, '../../server/api/message-quality.mjs'));
    assert.equal(app, server);
  });
});
