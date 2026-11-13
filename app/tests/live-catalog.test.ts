/// <reference types="node" />
// The live catalog (lib/live/catalog-live): what the server says about hidden gifts, a campaign and the Çevir
// rate, read without trusting it. No saved copy, an older server or a malformed answer leaves the compiled
// values (all gifts, RULES, no campaign); the app never hides every gift.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { GIFTS } from '@/data/mock';
import { RULES } from '@/data/rules';
import { exchangeOwnDiamonds, selfExchangeRate } from '@/lib/coins-bank';
import { activeCampaign, campaignCoins, liveRules, parseLiveCatalog, parseSavedLiveCatalog, rateChangedMessage, validRate, visibleGifts, type LiveCatalog } from '@/lib/live/catalog-live';
// Plain JavaScript modules of the server; TypeScript reads them through allowJs.
import * as server from '../../server/api/catalog.mjs';
import * as registry from '../../server/api/live-registry.mjs';

type ServerGift = { id: string; name: string; price: number; cat: string; minSvip: number };
type ServerPack = { id: string; productId: string; coins: number; firstBonus: number };

const HOUR = 3600_000;
const NOW = Date.parse('2026-11-05T12:00:00Z');
const iso = (t: number) => new Date(t).toISOString();
/** GET /api/catalog as gifts.mjs builds it, with some gifts left out and the live fields. */
function body(o: { hidden?: string[]; campaign?: unknown; usdTry?: unknown; v?: unknown } = {}) {
  return {
    gifts: [...(server.GIFTS as Map<string, ServerGift>).values()].filter((g) => !o.hidden?.includes(g.id)),
    counts: server.GIFT_COUNTS,
    packs: (server.PACKS as ServerPack[]).map(({ id, productId, coins, firstBonus }) => ({ id, productId, coins, firstBonus })),
    svipXp: server.SVIP_XP,
    purchases: { testTopup: false, stores: { android: true, ios: false } },
    campaign: o.campaign ?? null,
    exchange: { usdTry: 'usdTry' in o ? o.usdTry : 49.8, minDiamonds: 100 },
    v: o.v ?? 7,
  };
}
const campaign = (percent = 20, from = NOW - HOUR, to = NOW + 24 * HOUR) => ({ percent, startsAt: iso(from), endsAt: iso(to), label: 'Kış kampanyası' });
const ids = (list: { id: string }[]) => list.map((g) => g.id);

describe('Canlı katalog: hediye rafı', () => {
  test('sunucunun listelediği hediyeler, uygulamadaki sırayla (kesişim)', () => {
    const c = parseLiveCatalog(body({ hidden: ['g2', 'h5', 'v12'] }));
    const shown = visibleGifts(GIFTS, c);
    assert.equal(shown.length, GIFTS.length - 3);
    assert.deepEqual(ids(shown), ids(GIFTS).filter((id) => !['g2', 'h5', 'v12'].includes(id)));
    // A gift only a newer app knows is not added; names, art and prices stay the compiled ones.
    const extra = parseLiveCatalog({ gifts: [{ id: 'g1' }, { id: 'z99' }] });
    assert.deepEqual(visibleGifts(GIFTS, extra), [GIFTS.find((g) => g.id === 'g1')]);
  });

  test('boş sunucu tablosu (eski sunucu gibi): 57 hediyenin hepsi', () => {
    const c = parseLiveCatalog(body());
    assert.equal(visibleGifts(GIFTS, c).length, 57);
    assert.equal(c.packs.length, 9);
  });

  test('kayıt yoksa, liste boşsa veya bozuksa uygulamadaki listenin tamamı', () => {
    assert.equal(visibleGifts(GIFTS, null), GIFTS);
    for (const gifts of [[], 'g1', null, undefined, 42, {}, [{ id: 'g1' }, 'g2'], [{ id: 'g1' }, { name: 'adsız' }], [{ id: 7 }], [{ id: 'g1;DROP' }], [null]]) {
      const c = parseLiveCatalog({ ...body(), gifts });
      assert.equal(c.giftIds, null, JSON.stringify(gifts));
      assert.equal(visibleGifts(GIFTS, c), GIFTS, JSON.stringify(gifts));
    }
    for (const raw of [null, undefined, 'x', 42, [], true]) assert.equal(visibleGifts(GIFTS, parseLiveCatalog(raw)), GIFTS, String(raw));
  });

  test('hiçbir hediye kalmayacaksa (yalnızca tanınmayan kimlikler) hiçbiri gizlenmez', () => {
    const c = parseLiveCatalog({ gifts: [{ id: 'yeni1' }, { id: 'yeni2' }] });
    assert.deepEqual(c.giftIds, ['yeni1', 'yeni2']);
    assert.equal(visibleGifts(GIFTS, c), GIFTS);
  });

  test('alt liste (İkili, Aile sohbeti): gizlenenler düşer; hepsi gizlenirse alt listenin tamamı, raf boş açılmaz', () => {
    // data/kabile CP_GIFT_IDS and CHAT_GIFT_IDS, as iliski.tsx and sohbet.tsx pass them.
    const subset = (list: string[]) => list.map((id) => GIFTS.find((g) => g.id === id)!);
    const cp = subset(['c9', 'c12', 'c1']);
    const chat = subset(['g1', 'g2', 'g3', 'g4', 'g5']);
    assert.deepEqual(ids(visibleGifts(cp, parseLiveCatalog(body({ hidden: ['c12'] })))), ['c9', 'c1']);
    // Other gifts stay listed, so the whole-shelf guard alone would not catch this.
    const noCp = parseLiveCatalog(body({ hidden: ['c1', 'c9', 'c12'] }));
    assert.equal(visibleGifts(GIFTS, noCp).length, GIFTS.length - 3);
    assert.equal(visibleGifts(cp, noCp), cp);
    assert.equal(visibleGifts(chat, parseLiveCatalog(body({ hidden: ['g1', 'g2', 'g3', 'g4', 'g5'] }))), chat);
  });
});

describe('Canlı katalog: çevirme kuru', () => {
  test('sunucunun kuru 40–75 içindeyse kullanılır, diğer kurallar aynı kalır', () => {
    for (const usdTry of [40, 49.8, 55.55, 75]) {
      const r = liveRules(parseLiveCatalog(body({ usdTry })));
      assert.equal(r.usdTry, usdTry);
      assert.deepEqual({ ...r, usdTry: RULES.usdTry }, RULES);
    }
    assert.equal(liveRules(parseLiveCatalog(body({ usdTry: 49.8 }))), RULES, 'varsayılan kur: aynı kurallar');
    const c = parseLiveCatalog(body({ usdTry: 52.1 }));
    assert.equal(liveRules(c), liveRules(c), 'kur değişmedikçe aynı nesne');
  });

  test('bozuk veya sınır dışı kur RULES’a döner', () => {
    for (const usdTry of ['55', NaN, Infinity, -50, 0, 39.99, 75.01, 498, null, [55], { v: 55 }]) {
      const c = parseLiveCatalog(body({ usdTry }));
      assert.equal(c.usdTry, null, String(usdTry));
      assert.equal(liveRules(c), RULES, String(usdTry));
    }
    assert.equal(liveRules(parseLiveCatalog({ gifts: [] })), RULES, 'exchange yok (eski sunucu)');
    assert.equal(liveRules(null), RULES);
    // Even a hand-made catalog with a bad rate (not from parseLiveCatalog) falls back.
    const bad: LiveCatalog = { v: 1, giftIds: null, packs: [], campaign: null, usdTry: 498 };
    assert.equal(liveRules(bad), RULES);
    assert.equal(validRate(40), true);
    assert.equal(validRate(75.0001), false);
  });

  test('canlı kurla Çevir önizlemesi: aşağı yuvarlanmış jeton', () => {
    const r = liveRules(parseLiveCatalog(body({ usdTry: 55.55 })));
    const q = exchangeOwnDiamonds(10_000, 10_000, r);
    assert.ok(q.ok);
    if (q.ok) assert.equal(q.coins, Math.floor(10_000 * selfExchangeRate({ ...RULES, usdTry: 55.55 })));
  });

  test('kur değişti (409): yeni tutar söylenir, elmasın yerinde olduğu da', () => {
    assert.equal(rateChangedMessage(10_000, { usdTry: 45, coins: 3814 }), 'Çevirme kuru az önce değişti: 10.000 elmas artık 3.814 jeton ediyor. Elmasların yerinde; uygunsa yeniden dene.');
    // No amount from the server: worked out at its new rate.
    const sum = Math.floor(10_000 * selfExchangeRate({ ...RULES, usdTry: 45 }));
    assert.match(rateChangedMessage(10_000, { usdTry: 45 }), new RegExp(`${sum.toLocaleString('tr-TR').replace('.', '\\.')} jeton`));
    for (const data of [{}, { usdTry: 'x', coins: -1 }, { usdTry: 498, coins: 1.5 }]) {
      assert.equal(rateChangedMessage(10_000, data), 'Çevirme kuru az önce değişti. Elmasların yerinde; yeni tutara bakıp yeniden dene.', JSON.stringify(data));
    }
  });
});

describe('Canlı katalog: kampanya', () => {
  test('süren kampanya gösterilir; telefonun saatine göre bitmişse gösterilmez', () => {
    const c = parseLiveCatalog(body({ campaign: campaign(20, NOW - HOUR, NOW + HOUR) }));
    assert.deepEqual(activeCampaign(NOW, c), { percent: 20, startsAt: iso(NOW - HOUR), endsAt: iso(NOW + HOUR), label: 'Kış kampanyası' });
    assert.equal(activeCampaign(NOW + HOUR, c), null, 'bitiş anında biter (sunucu gibi)');
    assert.equal(activeCampaign(NOW + 2 * HOUR, c), null);
    assert.equal(activeCampaign(NOW, parseLiveCatalog(body())), null, 'kampanya yok');
    assert.equal(activeCampaign(NOW, null), null);
  });

  test('bozuk kampanya yok sayılır', () => {
    const good = campaign();
    for (const bad of [
      'evet',
      42,
      [good],
      { ...good, percent: 0 },
      { ...good, percent: 101 },
      { ...good, percent: 12.5 },
      { ...good, percent: '20' },
      { ...good, startsAt: 'dün' },
      { ...good, endsAt: undefined },
      { ...good, endsAt: good.startsAt },
      { ...good, startsAt: iso(NOW + 2 * HOUR), endsAt: iso(NOW + HOUR) },
    ]) {
      assert.equal(parseLiveCatalog(body({ campaign: bad })).campaign, null, JSON.stringify(bad));
    }
    const label = parseLiveCatalog(body({ campaign: { ...good, label: '  Yılbaşı\n  kampanyası  ' + 'x'.repeat(60) } })).campaign;
    assert.equal(label?.label.startsWith('Yılbaşı kampanyası x'), true);
    assert.equal(label?.label.length, 40);
  });

  test('paket başına kampanya jetonu aşağı yuvarlanır', () => {
    assert.equal(campaignCoins(100_000, 20), 20_000);
    assert.equal(campaignCoins(999, 5), 49);
    assert.equal(campaignCoins(1_000, 35), 350);
    for (const [coins, percent] of [[0, 20], [-5, 20], [1000, 0], [NaN, 20], [1000, Infinity]]) assert.equal(campaignCoins(coins, percent), 0, `${coins} × ${percent}`);
  });

  test('uygulamanın kampanya hesabı sunucunun campaignBonus’u ile aynı', () => {
    const coinsList = [...(server.PACKS as ServerPack[]).map((p) => p.coins), 1, 7, 999, 12_345, 33_333, 999_999];
    for (let percent = 5; percent <= 50; percent += 5) {
      const k = campaign(percent);
      for (const coins of coinsList) assert.equal(campaignCoins(coins, percent), registry.campaignBonus(coins, k, NOW), `${coins} jeton, %${percent}`);
      // Outside the window the server gives nothing and the app shows nothing.
      const c = parseLiveCatalog(body({ campaign: k }));
      assert.equal(registry.campaignBonus(1000, k, Date.parse(k.endsAt)), 0);
      assert.equal(activeCampaign(Date.parse(k.endsAt), c), null);
    }
  });
});

describe('Canlı katalog: telefondaki kopya', () => {
  test('kaydedilen kopya aynen geri okunur', () => {
    const c = parseLiveCatalog(body({ hidden: ['g1'], campaign: campaign(), usdTry: 52.3, v: 12 }));
    const back = parseSavedLiveCatalog(JSON.stringify({ ...c, fetchedAt: NOW }));
    assert.deepEqual(back, { catalog: c, fetchedAt: NOW });
    assert.equal(c.v, 12);
    assert.equal(c.giftIds?.length, 56);
  });

  test('bozuk kopya hiç kullanılmaz; bozuk alanlar derlenmiş değere döner', () => {
    for (const raw of [null, '', '{', '42', '[]', 'null']) assert.equal(parseSavedLiveCatalog(raw), null, String(raw));
    const back = parseSavedLiveCatalog(JSON.stringify({ v: -3, giftIds: 'g1', packs: [{ productId: 'kötü' }], campaign: { percent: 900 }, usdTry: 498, fetchedAt: 'dün' }));
    assert.deepEqual(back, { catalog: { v: 0, giftIds: null, packs: [], campaign: null, usdTry: null }, fetchedAt: 0 });
  });

  test('eski sunucu: v, kampanya ve kur yok; paketler yine okunur', () => {
    const c = parseLiveCatalog({ gifts: [...(server.GIFTS as Map<string, ServerGift>).values()], packs: [{ id: 'p1', productId: 'coins_1000', coins: 1000, firstBonus: 1000 }] });
    assert.deepEqual(c, { v: 0, giftIds: ids([...(server.GIFTS as Map<string, ServerGift>).values()]), packs: [{ productId: 'coins_1000', coins: 1000, firstBonus: 1000 }], campaign: null, usdTry: null });
  });
});
