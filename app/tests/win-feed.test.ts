/// <reference types="node" />
// Win banners: the made-up "other rooms" feed exists only in the offline demo; Oyun Salonu wins are never news for
// someone who cannot see Oyun Salonu, while a Şanslı win shows for everyone (Güncelleme 5, madde 9). Another phone's
// Şanslı wins from the live line (lib/live/win-news) join the line once each, a run of one person's wins merged.
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import { getWinNews, shiftWinNews, startWinFeed, stopWinFeed } from '@/lib/broadcast';
import { winNewsHidden } from '@/lib/games';
import type { LineEvent } from '@/lib/live/line-events';
import { takeWinEvent, winOfLine } from '@/lib/live/win-news';

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
  const lucky = { source: 'Şanslı › Şans Yoncası' };
  const salon = { source: 'Oyun Merkezi › Şans Çarkı', casino: true };
  const unflagged = { source: 'Oyun Merkezi › Ejder ile Kaplan' };
  const other = { source: 'Oda yarışması' };
  afterEach(() => live(false));

  test('Cömertlik Lv.2 altında Oyun Salonu kazançları gösterilmez; Şanslı kazancı ve şans dışı haber herkese gösterilir', () => {
    for (const lv of [0, 1]) {
      assert.equal(winNewsHidden(lucky, lv), false, 'Şanslı kazancı herkese');
      assert.equal(winNewsHidden(salon, lv), true);
      assert.equal(winNewsHidden(unflagged, lv), true, 'işaretsiz Oyun Merkezi kazancı da şans oyunudur');
      assert.equal(winNewsHidden(other, lv), false);
    }
  });

  test('demoda Lv.2 ve üstü hepsini görür', () => {
    assert.equal(winNewsHidden(lucky, 2), false);
    assert.equal(winNewsHidden(salon, 2), false);
  });

  test('jetonlu oyunlar hesaba kapalıysa Oyun Salonu kazancı gösterilmez; Şanslı gösterilir', () => {
    assert.equal(winNewsHidden(salon, 9, false), true);
    assert.equal(winNewsHidden(unflagged, 9, false), true);
    assert.equal(winNewsHidden(lucky, 9, false), false);
    assert.equal(winNewsHidden(other, 9, false), false);
  });

  test('canlı modda Oyun Salonu sunucuda: kazancı demodaki gibi Lv.2’den görünür', () => {
    live(true);
    assert.equal(winNewsHidden(salon, 9), false);
    assert.equal(winNewsHidden(salon, 1), true);
    assert.equal(winNewsHidden(lucky, 2), false);
    assert.equal(winNewsHidden(lucky, 1), false);
  });
});

describe('Başka odalardaki Şanslı kazançları (canlı hat)', () => {
  beforeEach(clear);
  afterEach(clear);
  const ev = (over: Partial<LineEvent> = {}): LineEvent => ({
    type: 'win',
    id: 7,
    uid: 'u-1',
    name: 'Ece',
    avatar: 'https://cdn.example.com/avatar/u-1/a.jpg',
    gift: 'Şans Yoncası',
    emoji: '🍀',
    mult: 5,
    coins: 100,
    wins: 1,
    room: 'Gece Sohbeti',
    ...over,
  });

  test('bandın sözleri sunucudan; adını gizleyen "Bir kullanıcı", fotoğrafsız', () => {
    assert.deepEqual(winOfLine(ev()), {
      id: 7,
      news: { userName: 'Ece', uid: 'u-1', key: 'u-1:Şans Yoncası', avatar: 'https://cdn.example.com/avatar/u-1/a.jpg', source: 'Şanslı › Şans Yoncası', roomTitle: 'Gece Sohbeti', mult: 5, amount: 100 },
    });
    assert.deepEqual(winOfLine(ev({ uid: null, name: null, avatar: null, room: null, wins: 3 }))?.news, { userName: 'Bir kullanıcı', source: 'Şanslı › Şans Yoncası', mult: 5, amount: 100, wins: 3 });
    // A name without its id is no name; a photo off our https storage is not drawn.
    assert.equal(winOfLine(ev({ uid: null }))?.news.userName, 'Bir kullanıcı');
    assert.equal(winOfLine(ev({ avatar: 'http://x.com/a.jpg' }))?.news.avatar, undefined);
    for (const bad of [{ type: 'message' }, ev({ id: 0 }), ev({ id: '7' }), ev({ coins: 0 }), ev({ coins: 1.5 }), ev({ gift: '' }), ev({ gift: 'x'.repeat(31) })]) assert.equal(winOfLine(bad), null);
  });

  test('her kazanç bir kez; aynı kişinin aynı hediyedeki kazançları beklerken tek bant olur', () => {
    assert.equal(takeWinEvent({ type: 'ping' }), false, 'başka olay');
    assert.equal(takeWinEvent(ev({ id: 101 })), true);
    takeWinEvent(ev({ id: 101 })); // the line reconnected and brought it again
    assert.equal(getWinNews().length, 1);
    takeWinEvent(ev({ id: 102, mult: 2, coins: 40 })); // waits behind the one showing
    takeWinEvent(ev({ id: 103, mult: 10, coins: 200 })); // joins 102
    takeWinEvent(ev({ id: 104, uid: null, name: null })); // no name: never merged with anyone
    takeWinEvent(ev({ id: 105, gift: 'Altın Nal', coins: 1000 })); // another gift: its own banner
    const q = getWinNews();
    assert.deepEqual(
      q.map((n) => [n.userName, n.amount, n.mult, n.wins ?? 1]),
      [
        ['Ece', 100, 5, 1],
        ['Ece', 240, 10, 2],
        ['Bir kullanıcı', 100, 5, 1],
        ['Ece', 1000, 5, 1],
      ],
    );
    assert.equal(q[3].source, 'Şanslı › Altın Nal');
  });
});
