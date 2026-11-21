/// <reference types="node" />
// Seviye ve VIP ayarları on the phone (lib/levels-live-core, GET /api/catalog?levels=1 `levels`, server/api/levels.mjs
// levelsPayload): the server's points, names, prices, days, groups, perks, level drop and plans, read without
// trusting them. A malformed part falls back to the app's compiled table for that part alone; no settings at all (demo,
// an older server) is the compiled app. The pictures and colours stay the app's.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { CHARM_TIERS, CHARM_XP } from '@/data/charm';
import { NOBLE_DAYS, NOBLE_SHOWN, NOBLE_TIERS, SVIP_LEVELS, SVIP_SHOWN, VIP_COMPARE, VIP_PLANS } from '@/data/status';
import { WEALTH_TIERS, WEALTH_XP, levelCurve } from '@/data/wealth';
import { WHEEL_NEED_LEVEL } from '@/data/wheel';
import {
  casinoLevelOf,
  charmLevelFor,
  curvePerkFrom,
  decayLineOf,
  nobleChanged,
  nobleRightsCount,
  nobleRightsOf,
  nobleTiersOf,
  parseLiveLevels,
  subPlansOf,
  subRightsOf,
  svipLevelFor,
  tierFor,
  tiersOf,
  vipLevelsOf,
  vipRightsOf,
  wealthLevelFor,
} from '@/lib/levels-live-core';
import { parseLiveCatalog, parseSavedLiveCatalog } from '@/lib/live/catalog-live';

const groups = (list: [string, number, number][]) => list.map(([name, from, to]) => ({ from, to, name }));
/** levelsPayload as server/api/levels.mjs builds it from today's values. */
const today = () => ({
  rev: 0,
  perks: [{ key: 'badge', name: 'Rozet' }],
  vip: {
    levels: SVIP_LEVELS.map((l) => ({ level: l.level, points: l.xp, name: `VIP ${l.level}` })),
    perks: [
      { key: 'badge', from: 1 },
      { key: 'frame', from: 1 },
      { key: 'hide_levels', from: 1 },
      { key: 'room_password', from: 1 },
      { key: 'vip_store', from: 1 },
      { key: 'vip_gifts', from: 1 },
      { key: 'silent_visit', from: 7 },
    ],
    decay: null,
  },
  noble: {
    levels: NOBLE_TIERS.map((t) => ({ level: t.tier, name: t.name, price: t.price, days: NOBLE_DAYS })),
    perks: [
      { key: 'badge', from: 1 },
      { key: 'room_password', from: 1 },
      { key: 'hide_levels', from: 1 },
      { key: 'entry_greeting', from: 1 },
      { key: 'frame', from: 1 },
    ],
  },
  wealth: { points: WEALTH_XP, groups: groups(WEALTH_TIERS.map((t) => [t.name, t.from, t.to])), perks: [{ key: 'badge', from: 1 }, { key: 'casino', from: 2 }], decay: null },
  charm: {
    points: CHARM_XP,
    groups: groups(CHARM_TIERS.map((t) => [t.name, t.from, t.to])),
    perks: [{ key: 'badge', from: 1 }, { key: 'discover_boost', from: 1 }, { key: 'moments_post', from: 5 }],
    decay: null,
  },
  sub: {
    plans: VIP_PLANS.map((p) => ({ productId: `vip_${p.days}d`, days: p.days, label: p.label, tl: p.tl, was: p.was })),
    perks: [{ key: 'visitors', from: 1 }, { key: 'hide_levels', from: 1 }],
  },
});

describe('Seviye ve VIP ayarları: okuma', () => {
  test('ayar yoksa ya da bozuksa uygulamanın kendi tabloları', () => {
    for (const raw of [undefined, null, 'x', 5, []]) assert.equal(parseLiveLevels(raw), null, String(raw));
    assert.deepEqual(vipLevelsOf(null).map((l) => [l.level, l.xp, l.name]), SVIP_LEVELS.map((l) => [l.level, l.xp, `VIP ${l.level}`]));
    assert.equal(svipLevelFor(null, SVIP_LEVELS[2].xp), 3);
    assert.equal(wealthLevelFor(null, WEALTH_XP[7]), 7);
    assert.equal(charmLevelFor(null, CHARM_XP[5] - 1), 4);
    assert.equal(tiersOf(null, 'wealth'), WEALTH_TIERS);
    assert.deepEqual(nobleTiersOf(null).map((t) => [t.name, t.price, t.days]), NOBLE_TIERS.map((t) => [t.name, t.price, NOBLE_DAYS]));
    assert.equal(vipRightsOf(null), SVIP_SHOWN);
    assert.equal(nobleRightsOf(null), NOBLE_SHOWN);
    assert.equal(casinoLevelOf(null), WHEEL_NEED_LEVEL);
    assert.equal(curvePerkFrom(null, 'charm', 'moments'), undefined);
    assert.deepEqual(subPlansOf(null).map((p) => [p.productId, p.tl, p.was]), VIP_PLANS.map((p) => [`vip_${p.days}d`, p.tl, p.was]));
    assert.equal(subRightsOf(null).compare, VIP_COMPARE);
    assert.equal(decayLineOf(null, 'vip'), null);
  });

  test("bugünkü değerlerle sunucunun gönderdiği, uygulamanın gösterdiğiyle aynı", () => {
    const l = parseLiveLevels(today())!;
    assert.ok(l.vip && l.noble && l.wealth && l.charm && l.sub);
    assert.deepEqual(vipLevelsOf(l).map((x) => [x.level, x.xp, x.art]), SVIP_LEVELS.map((x) => [x.level, x.xp, x.art]));
    assert.deepEqual(tiersOf(l, 'charm').map((t) => [t.name, t.from, t.to, t.art]), CHARM_TIERS.map((t) => [t.name, t.from, t.to, t.art]));
    for (const t of [1, 2, 3, 4, 5]) assert.equal(nobleChanged(l, t), false, `kademe ${t}`);
    assert.equal(casinoLevelOf(l), WHEEL_NEED_LEVEL);
    assert.deepEqual([curvePerkFrom(l, 'charm', 'moments'), curvePerkFrom(l, 'charm', 'rank'), curvePerkFrom(l, 'wealth', 'badge')], [5, 1, 1]);
    // The same rights the app lists today, where the server gives them.
    const vip = vipRightsOf(l);
    for (const r of SVIP_SHOWN.filter((x) => x.name !== 'Üyelere özel hediyeler')) assert.equal(vip.find((x) => x.name === r.name)?.level, r.level, r.name);
    assert.ok(nobleRightsOf(l).some((r) => r.name === 'Oda kilitleme' && r.level === 1));
    assert.deepEqual(subRightsOf(l).compare, VIP_COMPARE);
  });

  test('panelde değişenler: ad, puan, 12 VIP seviyesi, gruplar, Rütbe fiyatı ve günü, haklar, paketler', () => {
    const raw = today();
    raw.vip.levels = Array.from({ length: 12 }, (_, i) => ({ level: i + 1, points: (i + 1) * 1_000_000, name: i === 0 ? 'Bronz' : `VIP ${i + 1}` }));
    raw.vip.perks = [{ key: 'silent_visit', from: 3 }, { key: 'badge', from: 1 }, { key: 'chat_bubble', from: 1 }];
    raw.noble.levels[1] = { level: 2, name: 'Kaptan', price: 70_000, days: 15 };
    const wealth = levelCurve(20, 40_000_000);
    raw.wealth = { ...raw.wealth, points: wealth, groups: groups([['Başlangıç', 0, 9], ['Usta', 10, 50]]), perks: [{ key: 'badge', from: 1 }, { key: 'casino', from: 4 }] };
    raw.charm = { ...raw.charm, perks: [{ key: 'badge', from: 1 }, { key: 'moments_post', from: 3 }] };
    raw.sub.plans = [{ productId: 'vip_30d', days: 30, label: 'Aylık', tl: 300, was: 0 }];
    raw.sub.perks = [{ key: 'visitors', from: 1 }];
    const l = parseLiveLevels(raw)!;

    const vip = vipLevelsOf(l);
    assert.equal(vip.length, 12);
    assert.deepEqual([vip[0].name, vip[0].xp, vip[0].art], ['Bronz', 1_000_000, SVIP_LEVELS[0].art]);
    assert.equal(vip[11].art, SVIP_LEVELS[9].art, 'VIP 10 sonrası son resim');
    assert.deepEqual([svipLevelFor(l, 999_999), svipLevelFor(l, 3_500_000), svipLevelFor(l, 99e9)], [0, 3, 12]);
    // Unknown keys (not built in this app) are left out; the list follows the server's levels.
    assert.deepEqual(vipRightsOf(l).map((r) => [r.name, r.level]), [['VIP rozeti', 1], ['Sessiz ziyaret', 3]]);
    // A 15-day main term: no other packages until staff set them.
    assert.deepEqual(nobleTiersOf(l)[1], { ...NOBLE_TIERS[1], name: 'Kaptan', price: 70_000, days: 15, plans: [{ days: 15, price: 70_000, was: 70_000, save: 0 }] });
    assert.deepEqual([nobleChanged(l, 1), nobleChanged(l, 2)], [false, true]);
    assert.equal(wealthLevelFor(l, wealth[10]), 10);
    const tiers = tiersOf(l, 'wealth');
    assert.deepEqual(tiers.map((t) => [t.name, t.from, t.to]), [['Başlangıç', 0, 9], ['Usta', 10, 50]]);
    assert.deepEqual([tierFor(tiers, 30).name, tierFor(tiers, 30).art], ['Usta', WEALTH_TIERS[1].art]);
    assert.equal(casinoLevelOf(l), 4);
    assert.deepEqual([curvePerkFrom(l, 'charm', 'moments'), curvePerkFrom(l, 'charm', 'rank')], [3, null], 'kapatılan hak listede yok');
    assert.deepEqual(subPlansOf(l), [{ productId: 'vip_30d', days: 30, label: 'Aylık', tl: 300, was: 0, save: 0 }]);
    assert.deepEqual(subRightsOf(l).compare, [['Profiline bakanları gör', false, true]]);
  });

  test('bozuk bir bölüm yalnız kendisini uygulamanınkine bırakır', () => {
    const raw = today() as Record<string, unknown> & ReturnType<typeof today>;
    const bad = {
      ...raw,
      vip: { ...raw.vip, levels: [{ points: 5, name: 'A' }, { points: 5, name: 'B' }] },
      wealth: { ...raw.wealth, points: WEALTH_XP.slice(0, 50) },
      charm: { ...raw.charm, groups: groups([['A', 0, 10], ['B', 12, 50]]) },
      noble: { ...raw.noble, levels: raw.noble.levels.slice(0, 4) },
      sub: { plans: [{ productId: 'hack', days: 7, label: 'x', tl: 1, was: 0 }], perks: [] },
    };
    const l = parseLiveLevels(bad)!;
    assert.deepEqual([l.vip, l.wealth, l.charm, l.noble, l.sub], [null, null, null, null, null]);
    assert.equal(vipLevelsOf(l).length, SVIP_LEVELS.length);
    assert.equal(wealthLevelFor(l, WEALTH_XP[9]), 9);
    // A malformed perk or level drop entry is dropped, the rest stays.
    const ok = parseLiveLevels({ ...today(), vip: { ...today().vip, perks: [{ key: 'BAD KEY', from: 1 }, { key: 'frame', from: 99 }, { key: 'badge', from: 2 }], decay: { on: true, idleDays: 0 } } })!;
    assert.deepEqual([ok.vip?.perks, ok.vip?.decay], [[{ key: 'badge', from: 2 }], null]);
  });

  test('seviye düşmesi açıkken sayfalar kuralı kendi cümlesiyle yazar', () => {
    const raw = today();
    const l = parseLiveLevels({ ...raw, vip: { ...raw.vip, decay: { idleDays: 30, drop: 1, everyDays: 30, floor: 0 } }, charm: { ...raw.charm, decay: { idleDays: 14, drop: 2, everyDays: 7, floor: 3 } } })!;
    assert.equal(decayLineOf(l, 'vip'), '30 gün jeton yüklemezsen VIP seviyen 1 düşer; hareketsizlik sürdükçe her 30 günde bir yeniden düşer. Yeniden yükledikçe puanın her zamanki gibi artar.');
    assert.match(decayLineOf(l, 'charm')!, /^14 gün hediye almazsan Yankı seviyen 2 düşer; hareketsizlik sürdükçe 7 günde bir yeniden düşer, Lv\.3 seviyesinin altına inmez\./);
    assert.equal(decayLineOf(l, 'wealth'), null);
  });

  test('katalog ayarları saklar; ayarsız eski kopya eski sayılır', () => {
    const c = parseLiveCatalog({ gifts: [], packs: [], fx: [], v: 3, levels: today() });
    assert.ok(c.levels?.vip);
    const back = parseSavedLiveCatalog(JSON.stringify({ ...c, fetchedAt: 5 }))!;
    assert.deepEqual(back.catalog.levels, c.levels);
    assert.equal(back.fetchedAt, 5);
    const older = { ...c, fetchedAt: 5 } as Record<string, unknown>;
    delete older.levels;
    assert.equal(parseSavedLiveCatalog(JSON.stringify(older))!.fetchedAt, 0, 'yeni APK hemen yeniden okur');
    assert.equal(parseLiveCatalog({ gifts: [] }).levels, null, 'eski sunucu');
  });
});

// Rütbe (21 Nov 2026, the owners' sample screens): 7, 30 and 90-day packages, the longer cheaper a day, and every right
// in the page's order, the ones not built yet as "Yakında" (not counted).
describe('Rütbe paketleri ve hakları', () => {
  test('uygulamanın paketleri: 7, 30, 90 gün; uzun paket günde daha ucuz; indirim haftalığa göre', () => {
    const t = nobleTiersOf(null)[0];
    assert.equal(t.name, 'Şövalye');
    assert.deepEqual(t.plans.map((p) => p.days), [7, 30, 90]);
    const [week, month, three] = t.plans;
    assert.equal(month.price, t.price, 'ana süre 30 gün');
    assert.ok(week.price / 7 > month.price / 30 && month.price / 30 > three.price / 90, 'uzun paket günde ucuz');
    assert.equal(week.save, 0);
    // Round prices move it a point or two.
    assert.ok(month.save >= 6 && month.save <= 11, `ay %${month.save}`);
    assert.ok(three.save >= 11 && three.save <= 16, `üç ay %${three.save}`);
    assert.equal(three.was, Math.round((week.price / 7) * 90));
  });
  test('sunucunun paketleri: kendi fiyatlarıyla; bozuk olan dışarıda', () => {
    const raw = { noble: { levels: NOBLE_TIERS.map((t) => ({ level: t.tier, name: t.name, price: t.price, days: 30, plans: [{ days: 7, price: 5000 }, { days: 'x', price: 1 }] })), perks: [] } };
    const t = nobleTiersOf(parseLiveLevels(raw))[0];
    assert.deepEqual(t.plans.map((p) => [p.days, p.price]), [[7, 5000], [30, NOBLE_TIERS[0].price]]);
  });
  test('haklar: hepsi sırasıyla; yapılmayan "Yakında" ve sayılmaz; sunucunun kapattığı hak çıkar, açtığı seviyesine gider', () => {
    const all = nobleRightsOf(null);
    assert.equal(all.length, NOBLE_TIERS.at(-1)!.rights);
    assert.ok(all.some((r) => r.soon) && all.some((r) => !r.soon));
    assert.deepEqual(nobleRightsCount(all, 5), { have: all.filter((r) => !r.soon).length, all: all.length });
    assert.ok(nobleRightsCount(all, 1).have < nobleRightsCount(all, 5).have);
    const raw = { noble: { levels: NOBLE_TIERS.map((t) => ({ level: t.tier, name: t.name, price: t.price, days: 30 })), perks: [{ key: 'badge', from: 1 }, { key: 'silent_visit', from: 5 }] } };
    const live = nobleRightsOf(parseLiveLevels(raw));
    assert.equal(live.find((r) => r.perk === 'silent_visit')?.level, 5);
    assert.equal(live.some((r) => r.perk === 'frame'), false, 'kapalı hak gösterilmez');
    assert.equal(live.filter((r) => r.soon).length, all.filter((r) => r.soon).length);
  });
});
