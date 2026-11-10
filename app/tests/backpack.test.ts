/// <reference types="node" />
// Çantam's shelf (lib/backpack) and the live Jeton Noktası screen's checks and transfer lines (lib/coins-bank). The
// server decides and checks every amount (server/api/backpack.mjs, jeton.mjs); these say early what it will refuse.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_RULES } from '@/data/rules';
import { bagCounts, bagLabel, bagNeed, bagShort } from '@/lib/backpack';
import { BANK_SALE_MAX, bankSaleError, diamondSaleError, transferLine, type TransferLike } from '@/lib/coins-bank';
import { BACKPACK_BIG, bigChange, valueText } from '@/lib/live-settings-format';
import * as registry from '../../server/api/live-registry.mjs';

describe('Çantam rafı', () => {
  const items = [
    { giftId: 'g2', count: 3, label: 'Görev ödülü' },
    { giftId: 'g1', count: 0, label: 'Görev ödülü' },
  ];
  test('adetler yalnız olan hediyeler, kaynak etiketi sunucudan', () => {
    assert.deepEqual(bagCounts(items), { g2: 3 });
    assert.equal(bagLabel(items, 'g2'), 'Görev ödülü');
    assert.equal(bagLabel(items, 'g9'), 'Çanta');
  });
  test('bir gönderim kişi başına adet kadar alır; yetmezse gönderilmez', () => {
    assert.equal(bagNeed(1, 3), 3);
    assert.equal(bagShort({ g2: 3 }, 'g2', 1, 3), false);
    assert.equal(bagShort({ g2: 3 }, 'g2', 5, 1), true);
    assert.equal(bagShort({}, 'g2', 1, 1), true);
  });
});

describe('Jeton Noktası', () => {
  test('banka satışı: alıcı, tam jeton, stok ve dekont', () => {
    const ok = { to: 'u1', coins: 1000, stock: 5000, paymentRef: 'HAVALE-1' };
    assert.equal(bankSaleError(ok), null);
    assert.match(bankSaleError({ ...ok, to: null }) ?? '', /kişiyi seç/);
    assert.match(bankSaleError({ ...ok, coins: 0 }) ?? '', /Geçerli/);
    assert.match(bankSaleError({ ...ok, coins: 1.5 }) ?? '', /Geçerli/);
    assert.match(bankSaleError({ ...ok, coins: 6000 }) ?? '', /Stokta 5\.000 jeton var/);
    assert.match(bankSaleError({ ...ok, coins: BANK_SALE_MAX + 1, stock: BANK_SALE_MAX * 2 }) ?? '', /en çok/);
    assert.match(bankSaleError({ ...ok, paymentRef: '  ' }) ?? '', /dekont/);
    assert.match(bankSaleError({ ...ok, paymentRef: 'x'.repeat(101) }) ?? '', /100 karakter/);
  });

  test('elmas bozdurma: en az çevirme alt sınırı, en çok çekilebilir kısım', () => {
    assert.equal(diamondSaleError(1000, 5000, DEFAULT_RULES), null);
    assert.match(diamondSaleError(DEFAULT_RULES.exchangeMinDiamonds - 1, 5000, DEFAULT_RULES) ?? '', /En az/);
    assert.match(diamondSaleError(6000, 5000, DEFAULT_RULES) ?? '', /Kilitli elmaslar/);
    assert.match(diamondSaleError(0, 5000, DEFAULT_RULES) ?? '', /Geçerli/);
  });

  test('işlem satırı: kim, ne ve hangi tarafta', () => {
    const bank = { id: 'b', name: 'Nokta' };
    const host = { id: 'h', name: 'Hande' };
    const buyer = { id: 'u', name: 'Ufuk' };
    const sale: TransferLike = { kind: 'bank_sale', from: bank, to: buyer, coins: 1000, diamonds: null, valueTl: null, paymentRef: 'HAVALE-1' };
    assert.deepEqual(transferLine(sale, 'b'), { title: 'Jeton satışı', detail: 'Ufuk · Dekont HAVALE-1', amount: '-1.000 jeton', incoming: false });
    assert.deepEqual(transferLine(sale, 'u'), { title: 'Jeton Noktası yüklemesi', detail: 'Nokta', amount: '+1.000 jeton', incoming: true });
    const bozdur: TransferLike = { kind: 'diamond_sale', from: host, to: bank, coins: 434, diamonds: 1000, valueTl: 9.96, paymentRef: null };
    assert.deepEqual(transferLine(bozdur, 'h'), { title: 'Elmas bozdurdun', detail: 'Nokta · 9,96 TL', amount: '-1.000 elmas', incoming: false });
    assert.deepEqual(transferLine(bozdur, 'b'), { title: 'Elmas bozdurma', detail: 'Hande · 1.000 elmas · 9,96 TL', amount: '+434 jeton', incoming: true });
    const toptan: TransferLike = { kind: 'wholesale', from: null, to: bank, coins: 10_000, diamonds: null, valueTl: 230, paymentRef: 'DEKONT-1' };
    assert.equal(transferLine(toptan, 'b').title, 'Toptan jeton alımı');
  });
});

describe('Canlı ayarlar: Çantam', () => {
  test('ikinci onay sunucuyla aynı; değer metni', () => {
    const isBig = registry.isBig as (k: string, b: unknown, a: unknown) => boolean;
    assert.equal(BACKPACK_BIG, (registry.REGISTRY.backpack_call_task.bounds as { big: number }).big);
    for (const a of [0, 1, 2, 3, 5, null]) assert.equal(bigChange('backpack_call_task', 1, a), isBig('backpack_call_task', 1, a), String(a));
    assert.equal(valueText('backpack_call_task', 0), 'Verilmiyor');
    assert.equal(valueText('backpack_call_task', 1), 'Günde 1 adet');
    assert.equal(registry.DEFAULTS.backpack_call_task, 1, 'demodaki gibi bir Kalp');
  });
});
