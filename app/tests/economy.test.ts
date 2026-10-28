/// <reference types="node" />
// Economy rules: 5.000 diamonds = 1 USD, the coin packs, Coins Bank exchange (value-based, 3 %, main account only)
// and wholesale (2 %), Lucky host share (20 %) and the casino winnings balance.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_RULES, RULES, luckyHostDiamonds } from '@/data/rules';
import { RECHARGE_PACKS } from '@/data/status';
import { splitStake } from '@/lib/casino-odds';
import { convertDiamonds, diamondValueTl, exchangeRate, wholesaleQuote } from '@/lib/coins-bank';

const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

describe('Kurallar', () => {
  test('5.000 elmas = 1 USD; Coins Bank %2 toptan, %3 dönüşüm; Lucky yayıncı payı %20', () => {
    assert.equal(RULES.diamondsPerUsd, 5_000);
    assert.equal(RULES.coinsBankWholesaleFee, 0.02);
    assert.equal(RULES.coinsBankExchangeFee, 0.03);
    assert.equal(RULES.luckyHostShare, 0.2);
    assert.ok(close(diamondValueTl(1_000_000), 9_960, 1e-6), '1.000.000 💎 = 200 USD = 9.960 TL');
  });
});

describe('Jeton paketleri', () => {
  const perThousand = RECHARGE_PACKS.map((p) => (p.tl / p.coins) * 1000);
  test('9 paket, 1.000 ile 1.000.000 jeton arası; en büyük paket 23.599,99 TL', () => {
    assert.equal(RECHARGE_PACKS.length, 9);
    assert.deepEqual([RECHARGE_PACKS[0].coins, RECHARGE_PACKS[8].coins], [1_000, 1_000_000]);
    assert.equal(RECHARGE_PACKS[8].tl, 23_599.99);
    assert.equal(RECHARGE_PACKS[8].price, '23.599,99 TL');
  });
  test('büyük paket jetonu daha ucuz (1.000 jeton fiyatı hiç artmaz); ilk alım bonusu yalnız küçük paketlerde', () => {
    perThousand.slice(1).forEach((v, i) => assert.ok(v <= perThousand[i] + 1e-9, `${RECHARGE_PACKS[i + 1].coins}`));
    assert.deepEqual(RECHARGE_PACKS.filter((p) => p.firstBonus).map((p) => p.coins), [1_000, 5_000]);
  });
  test('her paket, jetonların tamamı hediye edilse ve hepsine ajans + oda sahibi + bonus ödense bile kâr bırakır', () => {
    for (const p of RECHARGE_PACKS) {
      const revenue = p.tl / 1.2; // KDV hariç
      const afterStore = revenue * 0.85; // %15 mağaza
      const payouts = (p.coins / RULES.diamondsPerUsd) * RULES.usdTry * (1 + RULES.agencyCommission + RULES.roomOwnerBonus + 0.05);
      assert.ok(afterStore - payouts > 0, `${p.coins} jeton: ${afterStore - payouts}`);
    }
  });
});

describe('Coins Bank', () => {
  test('elmas jetona yalnızca ana Coins Bank hesabında çevrilir', () => {
    const r = convertDiamonds('standard', 100_000);
    assert.equal(r.ok, false);
    assert.equal(convertDiamonds('coins_bank_main', 100_000).ok, true);
  });
  test('dönüşüm değere göre: 1 elmas = değeri × satış fiyatı × 1,03', () => {
    const rate = exchangeRate();
    assert.ok(close(rate, (1 / 5_000) * 49.8 * (1_000_000 / 23_599.99) * 1.03));
    assert.ok(close(rate, 0.4347, 1e-3), `oran ${rate}`);
    const q = convertDiamonds('coins_bank_main', 1_000_000);
    assert.ok(q.ok);
    if (!q.ok) return;
    assert.equal(q.coins, Math.floor(1_000_000 * rate));
    assert.ok(close(q.paidTl, 9_960, 1e-6), 'yayıncıya resmi değerin tamamı');
  });
  test('Coins Bank dönüşümde %3’ten fazla kazanamaz; jeton aşağı yuvarlanır', () => {
    for (const d of [1, 999, 50_000, 1_000_000, 123_456_789]) {
      const q = convertDiamonds('coins_bank_main', d);
      assert.ok(q.ok);
      if (!q.ok) continue;
      const saleTl = q.coins / RULES.coinsBankRetailCoinsPerTl;
      assert.ok(saleTl <= q.paidTl * 1.03 + 1e-9, `${d}: ${saleTl / q.paidTl}`);
      assert.ok(q.feeTl <= q.paidTl * 0.03 + 1e-9);
    }
  });
  test('kur veya elmas kuralı değişince oran kendiliğinden değişir (sabit sayı değil)', () => {
    const other = { ...DEFAULT_RULES, diamondsPerUsd: 10_000 };
    assert.ok(close(exchangeRate(other), exchangeRate() / 2));
    const fx = { ...DEFAULT_RULES, usdTry: 60 };
    assert.ok(close(exchangeRate(fx) / exchangeRate(), 60 / 49.8));
  });
  test('toptan alım: satış fiyatının %2 altı, yalnız ana hesap', () => {
    assert.equal(wholesaleQuote('standard', 1_000_000).ok, false);
    const q = wholesaleQuote('coins_bank_main', 1_000_000);
    assert.ok(q.ok);
    if (!q.ok) return;
    assert.ok(close(q.retailTl, 23_599.99, 1e-6));
    assert.ok(close(q.priceTl, 23_599.99 * 0.98, 1e-6));
    assert.ok(close(q.feeTl / q.retailTl, 0.02, 1e-12));
  });
  test('geçersiz miktarlar reddedilir', () => {
    for (const n of [0, -5, 1.5, Number.NaN]) {
      assert.equal(convertDiamonds('coins_bank_main', n).ok, false, `elmas ${n}`);
      assert.equal(wholesaleQuote('coins_bank_main', n).ok, false, `jeton ${n}`);
    }
  });
});

describe('Lucky ve casino bakiyesi', () => {
  test('Lucky hediyede alıcıya fiyatın %20’si elmas yazılır (aşağı yuvarlanır)', () => {
    assert.equal(luckyHostDiamonds(1_000), 200);
    assert.equal(luckyHostDiamonds(20), 4);
    assert.equal(luckyHostDiamonds(7), 1);
  });
  test('bahis önce oyun bakiyesinden, kalanı cüzdandan düşer', () => {
    assert.deepEqual(splitStake(100, 0), { fromGame: 0, fromWallet: 100 });
    assert.deepEqual(splitStake(100, 30), { fromGame: 30, fromWallet: 70 });
    assert.deepEqual(splitStake(100, 500), { fromGame: 100, fromWallet: 0 });
    assert.deepEqual(splitStake(100, -10), { fromGame: 0, fromWallet: 100 });
  });
});
