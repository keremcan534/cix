// Profil izleri (lib/profile-marks; server/api/profile-marks.mjs): the server's answers read without trusting them, the
// lines the room and the profile say, and the gift sheet's rule for people who refuse marks.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  APP_MARKS,
  activeMark,
  leftText,
  markLine,
  markNotice,
  marksAfter,
  ownMarkNote,
  parseGiftMark,
  parseMarkNews,
  parseMarkRules,
  parseMarks,
  refusalLine,
  refusingMarks,
  type ProfileMark,
} from '@/lib/profile-marks';
import * as rules from '../../server/api/profile-mark-rules.mjs';

const NOW = Date.parse('2026-11-19T12:00:00Z');
const H = 3_600_000;
const iso = (t: number) => new Date(t).toISOString();

describe('Profil izleri: sunucunun cevabı', () => {
  test('hediyenin kuralı: yalnız bırakır/temizler ve geçerli tür; süre yalnız bırakanda', () => {
    assert.deepEqual(parseGiftMark({ role: 'leave', kind: 'kaka', hours: 24 }), { role: 'leave', kind: 'kaka', hours: 24 });
    assert.deepEqual(parseGiftMark({ role: 'clean', kind: 'kaka', hours: 5 }), { role: 'clean', kind: 'kaka' });
    assert.deepEqual(parseGiftMark({ role: 'leave', kind: 'kaka', hours: 999 }), { role: 'leave', kind: 'kaka' });
    for (const bad of [null, 'leave', { role: 'smear', kind: 'kaka' }, { role: 'leave', kind: 'Kaka!' }, { role: 'leave' }, []]) assert.equal(parseGiftMark(bad), null, JSON.stringify(bad));
  });

  test('katalogdaki kurallar: eski sunucu söylemez (null); kapalıyken on false; kaydedilen kopya aynen geri okunur', () => {
    assert.equal(parseMarkRules(undefined, []), null);
    const list = [{ id: 'k1', mark: { role: 'leave', kind: 'kaka', hours: 24 } }, { id: 'k2', mark: { role: 'clean', kind: 'kaka' } }, { id: 'g6' }, { id: 'bad id', mark: { role: 'leave', kind: 'kaka' } }];
    const r = parseMarkRules({ on: true, hours: 24 }, list);
    assert.deepEqual(r, { on: true, hours: 24, gifts: { k1: { role: 'leave', kind: 'kaka', hours: 24 }, k2: { role: 'clean', kind: 'kaka' } } });
    assert.deepEqual(parseMarkRules(JSON.parse(JSON.stringify(r))), r, 'kopya');
    assert.deepEqual(parseMarkRules({ on: false, hours: 0 }, []), { on: false, hours: 0, gifts: {} });
    assert.equal(parseMarkRules({ on: 'evet' }, list), null);
  });

  test('bir kişinin izleri: bozuk girdi atlanır, aynı türden en uzun kalan tutulur, kim bıraktı yalnız gelirse', () => {
    const marks = parseMarks([
      { kind: 'kaka', gift: 'k1', emoji: '💩', until: iso(NOW + 2 * H) },
      { kind: 'kaka', gift: 'k1', emoji: '💩', until: iso(NOW + 5 * H), from: { id: 'a', name: '  Ali ' } },
      { kind: 'camur', gift: 'a7', until: iso(NOW + H), from: null },
      { kind: 'kaka', gift: 'k1', until: 'dün' },
      { kind: 'KAKA', gift: 'k1', until: iso(NOW + H) },
      'kaka',
      null,
    ]);
    assert.deepEqual(marks, [
      { kind: 'kaka', gift: 'k1', emoji: '💩', until: NOW + 5 * H, from: { id: 'a', name: 'Ali' } },
      { kind: 'camur', gift: 'a7', emoji: '💩', until: NOW + H, from: null },
    ]);
    for (const bad of [undefined, null, 'x', 7, {}]) assert.deepEqual(parseMarks(bad), []);
  });

  test('hediye paketinin izi: bırakma süresiyle, temizleme sade; bozuksa yok', () => {
    assert.deepEqual(parseMarkNews({ role: 'leave', kind: 'kaka', gift: 'k1', emoji: '💩', until: iso(NOW + 24 * H), hours: 24, clean: '💧', again: true }), {
      role: 'leave',
      kind: 'kaka',
      gift: 'k1',
      emoji: '💩',
      until: NOW + 24 * H,
      hours: 24,
      clean: '💧',
      again: true,
    });
    assert.deepEqual(parseMarkNews({ role: 'clean', kind: 'kaka', gift: 'k2' }), { role: 'clean', kind: 'kaka', gift: 'k2', emoji: '💧' });
    assert.equal(parseMarkNews({ role: 'leave', kind: 'kaka', gift: 'k1' }), null, 'süresiz bırakma');
    assert.equal(parseMarkNews(null), null);
    assert.equal(parseMarkNews({ role: 'leave', kind: 'kaka', gift: '<k1>', until: iso(NOW) }), null);
  });
});

describe('Profil izleri: gösterilen iz', () => {
  const a: ProfileMark = { kind: 'kaka', gift: 'k1', emoji: '💩', until: NOW + H };
  test('görünen iz: süresi dolmamış olanlardan en uzun kalanı', () => {
    assert.equal(activeMark([], NOW), null);
    assert.equal(activeMark([{ ...a, until: NOW - 1 }], NOW), null);
    assert.deepEqual(activeMark([a, { ...a, kind: 'camur', until: NOW + 2 * H }], NOW)?.kind, 'camur');
  });

  test('yeni haber: bırakma türünü değiştirir (birikmez), temizleme kaldırır', () => {
    const left = marksAfter([a], { role: 'leave', kind: 'kaka', gift: 'k1', emoji: '💩', until: NOW + 24 * H });
    assert.deepEqual(left, [{ kind: 'kaka', gift: 'k1', emoji: '💩', until: NOW + 24 * H }]);
    assert.deepEqual(marksAfter(left, { role: 'clean', kind: 'kaka', gift: 'k2', emoji: '💧' }), []);
    assert.deepEqual(marksAfter([a], { role: 'clean', kind: 'camur', gift: 'x', emoji: '🚿' }), [a], 'başka tür kalır');
  });

  test('kalan süre: saat ya da dakika', () => {
    assert.equal(leftText(NOW + 24 * H, NOW), '24 saat');
    assert.equal(leftText(NOW + 23 * H + 1, NOW), '24 saat');
    assert.equal(leftText(NOW + 35 * 60_000, NOW), '35 dakika');
    assert.equal(leftText(NOW - 5, NOW), '1 dakika');
  });
});

describe('Profil izleri: söylenenler', () => {
  test('alıcının satırı sunucununkiyle aynı; isimden sonra ek yok', () => {
    assert.equal(markNotice('Ali', '💩', 24, '💧'), 'Ali sana 💩 attı; 24 saat kalır ya da biri 💧 gönderene kadar');
    assert.equal(markNotice('Ali', '💩', 24, null), 'Ali sana 💩 attı; 24 saat kalır');
    assert.equal(markNotice('Ali', '💩', 6, '💧'), rules.markNotice('Ali', '💩', 6, '💧'));
  });

  test('odanın satırı: bana, başkasına; temizlenince', () => {
    const leave = { role: 'leave' as const, kind: 'kaka', gift: 'k1', emoji: '💩', until: NOW + 24 * H, hours: 24, clean: '💧' };
    assert.equal(markLine(leave, 'Ali', 'me', 'Ben'), 'Ali sana 💩 attı; 24 saat kalır ya da biri 💧 gönderene kadar');
    assert.equal(markLine(leave, 'Ali', 'x', 'Ayşe'), '💩 Ayşe: profilinde 24 saat iz kalır ya da biri 💧 gönderene kadar');
    const clean = { role: 'clean' as const, kind: 'kaka', gift: 'k2', emoji: '💧' };
    assert.equal(markLine(clean, 'Can', 'me', 'Ben'), '💧 Can profilindeki izi temizledi');
    assert.equal(markLine(clean, 'Can', 'x', 'Ayşe'), '💧 Can, Ayşe kişisinin profilindeki izi temizledi');
  });

  test('kendi profilimdeki not: kim, ne kadar, ne temizler', () => {
    const m: ProfileMark = { kind: 'kaka', gift: 'k1', emoji: '💩', until: NOW + 3 * H, from: { id: 'a', name: 'Ali' } };
    assert.equal(ownMarkNote(m, '💧', NOW), 'Ali bıraktı. Profilindeki 💩 izi 3 saat sonra gider ya da biri 💧 gönderince temizlenir.');
    assert.equal(ownMarkNote({ ...m, from: null }, null, NOW), 'Profilindeki 💩 izi 3 saat sonra gider.');
  });

  test('hediye paneli: iz istemeyen alıcı; tek kişi, hepsi, bazıları', () => {
    const no = new Set(['b', 'c']);
    const refuses = (id: string) => no.has(id);
    assert.deepEqual(refusingMarks(APP_MARKS.k1, ['a', 'b'], refuses), ['b']);
    assert.deepEqual(refusingMarks(APP_MARKS.k2, ['a', 'b'], refuses), [], 'temizleyen herkese gider');
    assert.deepEqual(refusingMarks(null, ['b'], refuses), []);
    const name = (id: string) => ({ b: 'Banu', c: 'Cem' })[id] ?? id;
    const kaka = { name: 'Kaka' };
    assert.equal(refusalLine(kaka, ['b'], name, 1), 'Banu, profiline iz bırakılmasını kapattı. Kaka ona gönderilemez.');
    assert.equal(refusalLine(kaka, ['b', 'c'], name, 2), 'Seçtiğin kişiler profillerine iz bırakılmasını kapattı. Kaka onlara gönderilemez.');
    assert.equal(refusalLine(kaka, ['b'], name, 3), '1 kişi profiline iz bırakılmasını kapattı; Kaka yalnız diğer 2 kişiye gider.');
  });
});
