/// <reference types="node" />
// Win banners: the made-up "other rooms" feed exists only in the offline demo, and wins of chance are never news
// for someone below Cömertlik Lv.2 (Uğurlu included), nor Oyun Salonu wins for someone who cannot see it.
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import { getWinNews, shiftWinNews, startWinFeed, stopWinFeed } from '@/lib/broadcast';
import { winNewsHidden } from '@/lib/games';

const live = (on: boolean) => {
  if (on) process.env.EXPO_PUBLIC_API_URL = 'https://api.test';
  else delete process.env.EXPO_PUBLIC_API_URL;
};
const clear = () => getWinNews().forEach((n) => shiftWinNews(n.id));

describe('Uydurma kazanç akışı', () => {
  beforeEach(() => {
    clear();
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  });
  afterEach(() => {
    stopWinFeed();
    mock.timers.reset();
    live(false);
    clear();
  });

  test('demoda örnek kazançlar gelir (karşılaştırma için)', () => {
    startWinFeed();
    mock.timers.tick(12_000);
    assert.equal(getWinNews().length, 1);
  });

  test('canlı modda hiç uydurma kazanç duyurulmaz', () => {
    live(true);
    startWinFeed();
    mock.timers.tick(10 * 60_000);
    assert.equal(getWinNews().length, 0);
  });
});

describe('Kazanç bandı kime gösterilmez', () => {
  const lucky = { source: 'Uğurlu › Şans Yoncası' };
  const salon = { source: 'Oyun Merkezi › Şans Çarkı', casino: true };
  const unflagged = { source: 'Oyun Merkezi › Ejder ile Kaplan' };
  const other = { source: 'Oda yarışması' };
  afterEach(() => live(false));

  test('Cömertlik Lv.2 altında Uğurlu ve Oyun Salonu kazançları gösterilmez; şans dışı haber gösterilir', () => {
    for (const lv of [0, 1]) {
      assert.equal(winNewsHidden(lucky, lv), true);
      assert.equal(winNewsHidden(salon, lv), true);
      assert.equal(winNewsHidden(unflagged, lv), true, 'işaretsiz Oyun Merkezi kazancı da şans oyunudur');
      assert.equal(winNewsHidden(other, lv), false);
    }
  });

  test('demoda Lv.2 ve üstü hepsini görür', () => {
    assert.equal(winNewsHidden(lucky, 2), false);
    assert.equal(winNewsHidden(salon, 2), false);
  });

  test('canlı modda Oyun Salonu yok: kazancı seviye ne olursa olsun gösterilmez', () => {
    live(true);
    assert.equal(winNewsHidden(salon, 9), true);
    assert.equal(winNewsHidden(lucky, 2), false);
    assert.equal(winNewsHidden(lucky, 1), true);
  });
});
