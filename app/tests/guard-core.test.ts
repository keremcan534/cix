/// <reference types="node" />
// Koruma on the phone (lib/guard-core): the server's answers read without trusting them, the points as people read
// them, and the rules page saying the server's numbers (server/api/guard-rules.mjs).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { GUARD_CARD, GUARD_RULES_TEXT, guardPoints, parseGuardArea, parseGuardMine, parseGuardPerson, parseGuardSettings } from '@/lib/guard-core';
import { GIFTS } from '@/data/mock';
// Plain JavaScript module of the server; TypeScript reads it through allowJs.
import * as server from '../../server/api/guard-rules.mjs';

const ID = '7d3c1a52-9a7e-4a52-9f4e-2f1c0b6a1d10';
const person = { id: ID, name: 'Deniz', avatarUrl: 'https://x.test/a.webp', points: 12_400, days: 3 };

describe('Koruma uygulamada', () => {
  test('kişi: bozuk kimlik, ad ya da sayı gelirse gösterilmez; bozuk fotoğraf adresi düşer', () => {
    assert.deepEqual(parseGuardPerson(person), person);
    assert.equal(parseGuardPerson({ ...person, id: 'u1' }), null);
    assert.equal(parseGuardPerson({ ...person, name: '  ' }), null);
    assert.equal(parseGuardPerson({ ...person, points: -1 }), null);
    assert.equal(parseGuardPerson({ ...person, points: 1.5 }), null);
    assert.equal(parseGuardPerson({ ...person, days: '3' }), null);
    assert.equal(parseGuardPerson(null), null);
    assert.equal(parseGuardPerson({ ...person, avatarUrl: 'javascript:alert(1)' })?.avatarUrl, null);
  });

  test('profil alanı: bozuk cevap boş alan olur, çökmez', () => {
    assert.deepEqual(parseGuardArea({ guardian: person, ward: null, mine: { points: 5, days: 1 }, off: false }), {
      guardian: person,
      ward: null,
      mine: { points: 5, days: 1 },
      off: false,
    });
    assert.deepEqual(parseGuardArea('bozuk'), { guardian: null, ward: null, mine: null, off: false });
    assert.deepEqual(parseGuardArea({ guardian: { id: ID }, mine: { points: 'x' }, off: 'true' }), { guardian: null, ward: null, mine: null, off: false });
  });

  test('Benim Koruma: bozuk satır atlanır, en çok 50; ayarlar eksikse varsayılan', () => {
    const many = Array.from({ length: 60 }, () => person);
    const m = parseGuardMine({ guardians: [person, { bad: true }, person], wards: many, settings: { off: true, threshold: 1000, thresholdMax: 50_000, thresholdNextAt: '2026-11-24T10:00:00Z' } });
    assert.equal(m.guardians.length, 2);
    assert.equal(m.wards.length, 50);
    assert.deepEqual(m.settings, { off: true, threshold: 1000, thresholdMax: 50_000, thresholdNextAt: '2026-11-24T10:00:00Z' });
    assert.deepEqual(parseGuardMine(null), { guardians: [], wards: [], settings: { off: false, threshold: 0, thresholdMax: 0, thresholdNextAt: null } });
    assert.equal(parseGuardSettings({ thresholdNextAt: 'dün' }).thresholdNextAt, null);
  });

  test('puan yazımı: 950, 5.000, 12,4 B, 296,49 B, 1,25 Mn', () => {
    assert.deepEqual([950, 5000, 12_400, 296_490, 1_250_000].map(guardPoints), ['950', '5.000', '12,4 B', '296,49 B', '1,25 Mn']);
  });

  test('kurallar sayfası sunucunun sayılarını söyler; kart hediye kataloğunda', () => {
    assert.equal(GUARD_CARD, server.GUARD_CARD);
    const text = GUARD_RULES_TEXT.flatMap((s) => s.lines).join(' ');
    const r = server.GUARD_RULES;
    assert.ok(text.includes(`${r.dropFrom.toLocaleString('tr-TR')} puan ve üstünde puanın %${Math.round(r.dropShare * 100)}’u`), 'yüzde düşüş');
    assert.ok(text.includes(`${r.dropFrom.toLocaleString('tr-TR')}’in altında ${r.dropFlat.toLocaleString('tr-TR')} puan düşer`), 'sabit düşüş');
    assert.ok(text.includes('haftada bir') && r.thresholdEveryDays === 7, 'eşik haftada bir');
    assert.ok(GIFTS.some((g) => g.id === GUARD_CARD), 'Koruma Kartı hediyelerde');
  });
});
