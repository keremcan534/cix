// Profil izleri (lib/profile-marks; server/api/profile-marks.mjs): the server's answers read without trusting them, the
// lines the room and the profile say, and the gift sheet's rule for people who refuse marks.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  APP_MARKS,
  activeMark,
  durationText,
  leftText,
  markLayerOf,
  markLine,
  markMinutes,
  markNotice,
  marksAfter,
  ownMarkNote,
  parseGiftMark,
  parseMarkKinds,
  parseMarkNews,
  parseMarkRules,
  parseMarks,
  keepingMarks,
  keptAfterLine,
  keptLine,
  parseMarkNote,
  previewFaceOf,
  refusalLine,
  refusingMarks,
  shelfNoteOf,
  type ProfileMark,
} from '@/lib/profile-marks';
import * as rules from '../../server/api/profile-mark-rules.mjs';

const serverRules = rules;

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
    assert.deepEqual(r, { on: true, hours: 24, gifts: { k1: { role: 'leave', kind: 'kaka', hours: 24 }, k2: { role: 'clean', kind: 'kaka' } }, kinds: {} }, 'G7 sunucusu: tür yok');
    assert.deepEqual(parseMarkRules(JSON.parse(JSON.stringify(r))), r, 'kopya');
    assert.deepEqual(parseMarkRules({ on: false, hours: 0 }, []), { on: false, hours: 0, gifts: {}, kinds: {} });
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

  test('yeni haber: bırakma kendi türünü değiştirir (birikmez), temizleme kaldırır, başka tür olduğu gibi kalır', () => {
    const left = marksAfter([a], { role: 'leave', kind: 'kaka', gift: 'k1', emoji: '💩', until: NOW + 24 * H });
    assert.deepEqual(left, [{ kind: 'kaka', gift: 'k1', emoji: '💩', until: NOW + 24 * H }]);
    assert.deepEqual(marksAfter(left, { role: 'clean', kind: 'kaka', gift: 'k2', emoji: '💧' }), []);
    assert.deepEqual(marksAfter([a], { role: 'clean', kind: 'camur', gift: 'x', emoji: '🚿' }), [a], 'başka tür kalır');
    // The server sends a leave only when no other kind shows (one mark at a time); one kept from before stays.
    assert.deepEqual(marksAfter([a], { role: 'leave', kind: 'kirik-cam', gift: 'p8', emoji: '🩴', until: NOW + 2 * H }), [a, { kind: 'kirik-cam', gift: 'p8', emoji: '🩴', until: NOW + 2 * H }]);
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
    assert.equal(markNotice('Ali', '💩', 24 * 60, '💧'), 'Ali sana 💩 attı; 24 saat kalır ya da biri 💧 gönderene kadar');
    assert.equal(markNotice('Ali', '💩', 24 * 60, null), 'Ali sana 💩 attı; 24 saat kalır');
    assert.equal(markNotice('Ali', '🩴', 90, '🪟'), 'Ali sana 🩴 attı; 1 saat 30 dakika kalır ya da biri 🪟 gönderene kadar');
    for (const m of [5, 45, 60, 90, 360, 1440, 2880, 10_080]) assert.equal(markNotice('Ali', '💩', m, '💧'), rules.markNotice('Ali', '💩', m, '💧'), `${m} dakika`);
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
    const kaka = { name: 'Kaka Şakası' };
    assert.equal(refusalLine(kaka, ['b'], name, 1), 'Banu, profiline iz bırakılmasını kapattı. Kaka Şakası ona gönderilemez.');
    assert.equal(refusalLine(kaka, ['b', 'c'], name, 2), 'Seçtiğin kişiler profillerine iz bırakılmasını kapattı. Kaka Şakası onlara gönderilemez.');
    assert.equal(refusalLine(kaka, ['b'], name, 3), '1 kişi profiline iz bırakılmasını kapattı; Kaka Şakası yalnız diğer 2 kişiye gider.');
    // Only the people they follow (and not me): said so, with the server's words.
    const why = (id: string) => (id === 'b' ? ('following' as const) : ('nobody' as const));
    assert.equal(refusalLine(kaka, ['b'], name, 1, why), 'Banu, profiline yalnız takip ettiği kişilerin iz bırakmasına izin veriyor. Kaka Şakası ona gönderilemez.');
    assert.equal(refusalLine(kaka, ['b', 'c'], name, 2, why), 'Seçtiğin kişiler senden iz kabul etmiyor. Kaka Şakası onlara gönderilemez.');
    assert.equal(refusalLine(kaka, ['b', 'c'], name, 5, why), '2 kişi senden iz kabul etmiyor; Kaka Şakası yalnız diğer 3 kişiye gider.');
  });
});

describe('Muzip hediyeler: türler, dakika, çizim', () => {
  const art = { url: 'https://api.example.com/api/media/f/markart/u/camur.png', v: '0123456789ab', px: 512 };
  test('katalogdaki türler (marks=2): bozuk resim atlanır (uygulamanınki kalır), bozuk tür atlanır, hiç çökmez', () => {
    const kinds = parseMarkKinds({
      kaka: { name: 'Kaka İzi', stack: 'refresh' },
      'kirik-cam': { name: '  Kırık   Cam ', stack: 'replace', minutes: 1440, art: { url: 'javascript:alert(1)', v: '0123456789ab' } },
      camur: { name: 'Çamur', minutes: 30, art },
      'bad kind': { name: 'X' },
      noname: { name: '' },
      boya: { name: 'Boya', minutes: 2, stack: 'stack', art: { url: art.url, v: 'v1' } },
    });
    assert.deepEqual(kinds, {
      kaka: { name: 'Kaka İzi', stack: 'refresh' },
      'kirik-cam': { name: 'Kırık Cam', stack: 'replace', minutes: 1440 },
      camur: { name: 'Çamur', stack: 'refresh', minutes: 30, art },
      boya: { name: 'Boya', stack: 'refresh' },
    });
    for (const bad of [undefined, null, 'x', 7, [], [{ kaka: {} }]]) assert.deepEqual(parseMarkKinds(bad), {}, JSON.stringify(bad));
    const rules = parseMarkRules({ on: true, hours: 24, minutes: 1440, kinds: { camur: { name: 'Çamur', art } }, serverNow: '2026-11-20T12:00:00Z' }, [{ id: 'a9', mark: { role: 'leave', kind: 'camur', hours: 1, minutes: 30 } }]);
    assert.deepEqual(rules?.gifts.a9, { role: 'leave', kind: 'camur', hours: 1, minutes: 30 });
    assert.deepEqual(rules?.kinds.camur.art, art);
    assert.deepEqual(parseMarkRules(JSON.parse(JSON.stringify(rules))), rules, 'kaydedilen kopya türleri de tutar');
    assert.deepEqual(parseMarkRules({ on: true, hours: 24, kinds: 'bozuk' }, [])?.kinds, {});
  });

  test('süre: hediyenin dakikası, yoksa saati, yoksa türün, yoksa Canlı ayar', () => {
    const rules = parseMarkRules({ on: true, hours: 12, kinds: { camur: { name: 'Çamur', minutes: 45 } } }, []);
    assert.equal(markMinutes({ role: 'leave', kind: 'kaka', hours: 2, minutes: 90 }, rules), 90);
    assert.equal(markMinutes({ role: 'leave', kind: 'kaka', hours: 2 }, rules), 120);
    assert.equal(markMinutes({ role: 'leave', kind: 'camur' }, rules), 45);
    assert.equal(markMinutes({ role: 'leave', kind: 'kaka' }, rules), 720);
    assert.equal(markMinutes({ role: 'leave', kind: 'kaka' }, null), 1440);
    assert.deepEqual(parseGiftMark({ role: 'leave', kind: 'camur', hours: 1, minutes: 30 }), { role: 'leave', kind: 'camur', hours: 1, minutes: 30 });
    assert.deepEqual(parseGiftMark({ role: 'leave', kind: 'camur', minutes: 3 }), { role: 'leave', kind: 'camur' }, '5 dakikadan az: yok sayılır');
    assert.deepEqual([durationText(5), durationText(90), durationText(1440), durationText(2880), durationText(10_080)], ['5 dakika', '1 saat 30 dakika', '24 saat', '2 gün', '7 gün']);
    for (const m of [5, 59, 60, 61, 1439, 1440, 4320]) assert.equal(durationText(m), serverRules.durationText(m), `${m} dakika: sunucuyla aynı`);
  });

  test('hediye paketi: dakika; bilinmeyen alan yok sayılır; eski sunucunun paketi (saat) de okunur', () => {
    const news = parseMarkNews({ role: 'leave', kind: 'kirik-cam', gift: 'p8', emoji: '🩴', until: iso(NOW + 90 * 60_000), hours: 2, minutes: 90, clean: '🪟', again: false, replaced: ['kaka', 'BAD', 7] });
    assert.deepEqual(news, { role: 'leave', kind: 'kirik-cam', gift: 'p8', emoji: '🩴', until: NOW + 90 * 60_000, hours: 2, minutes: 90, clean: '🪟', again: false });
    assert.equal(markLine(news!, 'Ali', 'me', 'Ben'), 'Ali sana 🩴 attı; 1 saat 30 dakika kalır ya da biri 🪟 gönderene kadar');
    assert.equal(markLine(news!, 'Ali', 'x', 'Ayşe'), '🩴 Ayşe: profilinde 1 saat 30 dakika iz kalır ya da biri 🪟 gönderene kadar');
    const old = parseMarkNews({ role: 'leave', kind: 'kaka', gift: 'k1', emoji: '💩', until: iso(NOW + 24 * H), hours: 24, clean: '💧' });
    assert.equal(old?.minutes, undefined);
    assert.equal(markLine(old!, 'Ali', 'me', 'Ben'), 'Ali sana 💩 attı; 24 saat kalır ya da biri 💧 gönderene kadar');
  });

  test('çizim: yüklenen resim → uygulamanın kendi resmi → hediye rozeti; kaka suyla, ötekiler parıltıyla temizlenir', () => {
    const kinds = parseMarkKinds({ camur: { name: 'Çamur', art }, kaka: { name: 'Kaka İzi', art: { ...art, url: 'https://x.example/kaka.png' } }, 'kirik-cam': { name: 'Kırık Cam' } });
    // An unknown kind (made in the panel, none of the app's own) is drawn from the catalog's picture: no code for it.
    assert.deepEqual(markLayerOf('camur', kinds), { art: { uri: `${art.url}?v=${art.v}` }, compiled: null, badge: false, wash: 'sparkle' });
    // Its picture didn't load: the badge alone.
    assert.deepEqual(markLayerOf('camur', kinds, `${art.url}?v=${art.v}`), { art: null, compiled: null, badge: true, wash: 'sparkle' });
    // Kaka İzi with an uploaded picture: that one; it didn't load: the app's own, with the badge as before.
    assert.equal(markLayerOf('kaka', kinds).art?.uri, `https://x.example/kaka.png?v=${art.v}`);
    assert.deepEqual(markLayerOf('kaka', kinds, `https://x.example/kaka.png?v=${art.v}`), { art: null, compiled: 'kaka', badge: true, wash: 'water' });
    // Kırık Cam with none uploaded: the app's own placeholder, whole (no badge).
    assert.deepEqual(markLayerOf('kirik-cam', kinds), { art: null, compiled: 'kirik-cam', badge: false, wash: 'sparkle' });
    // A server before kinds (G7's catalog): the app's own, else the badge.
    assert.deepEqual(markLayerOf('kaka', {}), { art: null, compiled: 'kaka', badge: true, wash: 'water' });
    assert.deepEqual(markLayerOf('domates', undefined), { art: null, compiled: null, badge: true, wash: 'sparkle' });
    // An address with its own query keeps it.
    assert.equal(markLayerOf('x', parseMarkKinds({ x: { name: 'X', art: { url: 'https://a.example/f.png?k=1', v: art.v } } })).art?.uri, `https://a.example/f.png?k=1&v=${art.v}`);
  });

  test('Muzip rafının notu: tek çift, birkaç çift, hiç; "harca" yok', () => {
    assert.equal(shelfNoteOf([]), null);
    const one = shelfNoteOf([{ leave: { emoji: '💩', name: 'Kaka Şakası' }, minutes: 1440, clean: { emoji: '💧', name: 'Temizlik Suyu' } }]);
    assert.equal(one, '💩 Kaka Şakası alıcının profil fotoğrafında 24 saat iz bırakır; 💧 Temizlik Suyu izi temizler. Kimlerin iz bırakabileceğini herkes Ayarlar › Gizlilik’ten seçer.');
    const many = shelfNoteOf([
      { leave: { emoji: '💩', name: 'Kaka Şakası' }, minutes: 1440, clean: { emoji: '💧', name: 'Temizlik Suyu' } },
      { leave: { emoji: '🩴', name: 'Terlik Geldi!' }, minutes: 1440, clean: { emoji: '🪟', name: 'Cam Tamiri' } },
      { leave: { emoji: '❄️', name: 'Kar Topu' }, minutes: 90, clean: null },
      { leave: { emoji: '🍅', name: 'Domates At' }, minutes: 60, clean: null },
    ]);
    assert.equal(many, 'Bazı hediyeler alıcının profil fotoğrafında iz bırakır: 💩 Kaka Şakası (24 saat, 💧 temizler), 🩴 Terlik Geldi! (24 saat, 🪟 temizler), ❄️ Kar Topu (1 saat 30 dakika) ve 1 hediye daha. Aynı anda tek iz kalır. Kimlerin iz bırakabileceğini herkes Ayarlar › Gizlilik’ten seçer.');
    for (const line of [one, many]) assert.ok(!/harca|temizlet|satın/i.test(line ?? ''), 'harcamaya itmez');
  });
});

describe('Muzip hediyeler: profilde iz varken (sahiplerin kararı, 20 Kasım 2026)', () => {
  const NOW2 = Date.parse('2026-11-20T12:00:00Z');
  const kakaRule = { role: 'leave', kind: 'kaka' } as const;
  const marks: Record<string, ProfileMark[]> = {
    a: [{ kind: 'kirik-cam', gift: 'p8', emoji: '🩴', until: NOW2 + 3_600_000 }],
    b: [{ kind: 'kaka', gift: 'k1', emoji: '💩', until: NOW2 + 3_600_000 }],
    c: [{ kind: 'kirik-cam', gift: 'p8', emoji: '🩴', until: NOW2 - 1 }],
    d: [],
  };
  const of = (id: string) => marks[id] ?? [];
  const name = (id: string) => ({ a: 'Ayşe', b: 'Banu', c: 'Cem', d: 'Deniz' })[id] ?? id;

  test('başka türden görünen iz: hediye ona düz gider; aynı tür, süresi geçmiş ya da izi olmayan için değil', () => {
    assert.deepEqual(keepingMarks(kakaRule, ['a', 'b', 'c', 'd'], of, NOW2), ['a']);
    assert.deepEqual(keepingMarks({ role: 'clean', kind: 'kaka' }, ['a'], of, NOW2), [], 'temizleyen hediye için yok');
    assert.deepEqual(keepingMarks(null, ['a'], of, NOW2), [], 'düz hediye');
    // A photo with both (left from before one at a time): the same kind is there, so its own mark is refreshed.
    assert.deepEqual(keepingMarks(kakaRule, ['x'], () => [...marks.a, ...marks.b], NOW2), []);
  });

  test('gönderimden önce söylenen: tek kişi, hepsi, bazıları; "harca" yok', () => {
    const g = { name: 'Kaka Şakası' };
    assert.equal(keptLine(g, ['a'], name, 1), 'Ayşe, profilinde zaten bir iz var. Kaka Şakası iz bırakmaz, düz hediye olarak gider.');
    assert.equal(keptLine(g, ['a', 'c'], name, 2), 'Seçtiğin kişilerin profilinde zaten bir iz var. Kaka Şakası iz bırakmaz, onlara düz hediye olarak gider.');
    assert.equal(keptLine(g, ['a'], name, 3), '1 kişinin profilinde zaten bir iz var; Kaka Şakası onlara düz hediye olarak gider, diğer 2 kişiye iz bırakır.');
    for (const line of [keptLine(g, ['a'], name, 1), keptLine(g, ['a'], name, 3)]) assert.ok(!/harca|temizlet|satın/i.test(line));
  });

  test('gönderimden sonra: sunucunun cümlesi (markNote) aynen; birden çoksa tek satır; bozuksa yok', () => {
    const note = 'Ayşe, profilinde zaten bir iz var; Kaka Şakası düz hediye olarak gitti.';
    assert.equal(parseMarkNote(note), note);
    assert.equal(parseMarkNote(`  ${note}\n`), note);
    for (const bad of [undefined, null, 7, '', '   ', 'x'.repeat(301), { text: note }]) assert.equal(parseMarkNote(bad), null);
    assert.equal(keptAfterLine({ name: 'Kaka Şakası' }, []), null);
    assert.equal(keptAfterLine({ name: 'Kaka Şakası' }, [note]), note);
    assert.equal(keptAfterLine({ name: 'Kaka Şakası' }, [note, note]), '2 kişinin profilinde zaten bir iz vardı; Kaka Şakası onlara düz hediye olarak gitti.');
  });

  test('sunucunun cümlesi (server/api/profile-mark-rules.mjs keptNote) okunur ve aynen gösterilir', () => {
    const note = serverRules.keptNote('Ayşe', 'Kaka Şakası');
    assert.equal(parseMarkNote(note), 'Ayşe, profilinde zaten bir iz var; Kaka Şakası düz hediye olarak gitti.');
    assert.equal(keptAfterLine({ name: 'Kaka Şakası' }, [note]), note);
  });
});

describe('İz önizleme: ?foto= yalnız uygulamanın sunucusundaki dosya', () => {
  const API = 'https://130-61-230-94.sslip.io';
  test('kendi sunucusunun /api/media/f/ dosyası olur; başka adres, yol oyunu ya da bozuk girdi olmaz', () => {
    assert.equal(previewFaceOf(`${API}/api/media/f/avatar/u1/abc.jpg`, API), `${API}/api/media/f/avatar/u1/abc.jpg`);
    assert.equal(previewFaceOf(`${API}/api/media/f/avatar/u1/abc.jpg?v=3`, `${API}/`), `${API}/api/media/f/avatar/u1/abc.jpg?v=3`);
    for (const bad of [
      'https://kotu.example/yuz.jpg',
      `${API}.kotu.example/api/media/f/a.jpg`,
      `${API}/api/media/f/../admin`,
      `${API}/api/other/f/a.jpg`,
      `${API}/api/media/f/a b.jpg`,
      `${API}/api/media/f/a.jpg"onerror`,
      `javascript:alert(1)`,
      42,
      undefined,
    ])
      assert.equal(previewFaceOf(bad, API), null, String(bad));
    assert.equal(previewFaceOf(`${API}/api/media/f/a.jpg`, ''), null, 'sunucusuz (demo): yalnız kendi fotoğrafım');
  });
});
