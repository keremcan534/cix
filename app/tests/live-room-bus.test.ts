/// <reference types="node" />
// Live room bus (lib/live/room-bus): the signals the phones send each other in a server room, and the mic
// attribute. Wire format must survive Turkish letters and emoji; anything malformed from another phone is dropped.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  decodeSignal,
  encodeSignal,
  getLivePeers,
  onServerBag,
  onServerBoss,
  onServerSeat,
  onSignal,
  parseRoomMeta,
  parseRoomState,
  parseSeat,
  parseServerBoss,
  parseServerClosed,
  parseServerFx,
  parseServerGift,
  parseServerLucky,
  parseSignal,
  reportPeers,
  reportRoomMeta,
  reportServerSeat,
  reportSignal,
  type RoomSignal,
} from '@/lib/live/room-bus';

test('sinyal: Türkçe harf ve emoji bozulmadan gider gelir', () => {
  const msg: RoomSignal = { t: 'chat', text: 'Çağrı şöyle dedi: ğüşiöç İĞÜŞÖÇ 🌹🎉' };
  const bytes = encodeSignal(msg);
  assert.deepEqual(decodeSignal(bytes), msg);
  // Same bytes as the platform's own UTF-8 encoder.
  assert.deepEqual([...bytes], [...new TextEncoder().encode(JSON.stringify(msg))]);
});

test('sinyal: bozuk veya eksik olan atılır, uzun yazı kısaltılır', () => {
  assert.equal(parseSignal(null), null);
  assert.equal(parseSignal({ t: 'chat', text: '   ' }), null);
  assert.equal(parseSignal({ t: 'para', amount: 1000 }), null);
  assert.equal(decodeSignal(new Uint8Array([123, 34])), null);
  const long = parseSignal({ t: 'chat', text: 'a'.repeat(1000) });
  assert.equal(long?.t === 'chat' && long.text.length, 300);
});

test('hediye: bir telefonun gönderdiği hediye hiç gösterilmez, yalnızca sunucunun duyurusu', () => {
  // A phone could otherwise draw a gift nobody paid for.
  assert.equal(parseSignal({ t: 'gift', giftId: 'g1', count: 5, to: ['x'] }), null);
  assert.equal(parseSignal({ type: 'gift', giftId: 'g1', count: 5, from: 'a', to: 'b', eventId: 1 }), null);
  const ok = { type: 'gift', giftId: 'g4', count: 5, from: 'u-a', to: 'u-b', eventId: 42 };
  assert.deepEqual(parseServerGift(ok), { from: 'u-a', msg: { t: 'gift', giftId: 'g4', count: 5, to: ['u-b'], eventId: 42 } });
  assert.equal(parseServerGift({ ...ok, count: 0 }), null);
  assert.equal(parseServerGift({ ...ok, count: 1.5 }), null);
  assert.equal(parseServerGift({ ...ok, count: 10_001 }), null);
  assert.equal(parseServerGift({ ...ok, eventId: 0 }), null);
  assert.equal(parseServerGift({ ...ok, eventId: '42' }), null);
  assert.equal(parseServerGift({ ...ok, to: ['u-b'] }), null);
  assert.equal(parseServerGift({ ...ok, from: '' }), null);
  assert.equal(parseServerGift({ ...ok, type: 'para' }), null);
  assert.equal(parseServerGift(null), null);

  const got: string[] = [];
  const off = onSignal('oda-h', (from, msg) => got.push(msg.t === 'gift' ? `${from}>${msg.to.join()}:${msg.giftId}x${msg.count}#${msg.eventId}` : `${from}:chat`));
  reportSignal('oda-h', 'u-x', { t: 'gift', giftId: 'g9', count: 99, to: ['u-y'] }); // a phone: dropped
  reportSignal('oda-h', 'u-x', ok); // the server's format, but from a phone: dropped
  reportSignal('oda-h', null, ok);
  reportSignal('oda-h', null, ok); // the same gift again (reconnect): shown once
  reportSignal('oda-h', null, { ...ok, eventId: 43, count: 1 });
  reportSignal('oda-h', null, { t: 'chat', text: 'sunucudan sohbet değil' }); // the server sends no chat here
  off();
  assert.deepEqual(got, ['u-a>u-b:g4x5#42', 'u-a>u-b:g4x1#43']);
});

test('kilitli mikrofonlar oda bilgisinden gelir; kişi listesi değişince kalır, başka odada sıfırlanır', () => {
  assert.deepEqual(parseRoomMeta('{"lockedSeats":[5,2,2,0,100,1.5,"3",7]}'), [2, 5, 7]);
  assert.deepEqual(parseRoomMeta(''), []);
  assert.deepEqual(parseRoomMeta(undefined), []);
  assert.deepEqual(parseRoomMeta('bozuk'), []);
  assert.deepEqual(parseRoomMeta('null'), []);
  assert.deepEqual(parseRoomMeta('{"lockedSeats":"2"}'), []);

  reportRoomMeta('oda-k', '{"lockedSeats":[3]}');
  assert.deepEqual(getLivePeers('oda-k').lockedSeats, [3]);
  reportPeers('oda-k', [{ identity: 'u1', name: 'Ali', seat: 1, speaking: false, micOn: true }]);
  assert.deepEqual(getLivePeers('oda-k').lockedSeats, [3]);
  assert.equal(getLivePeers('oda-k').peers.length, 1);
  reportRoomMeta('oda-k', '{"lockedSeats":[]}');
  assert.deepEqual(getLivePeers('oda-k').lockedSeats, []);
  assert.equal(getLivePeers('oda-k').peers.length, 1);
  reportRoomMeta('oda-k', '{"lockedSeats":[4]}');
  reportPeers('oda-l', []);
  assert.deepEqual(getLivePeers('oda-l').lockedSeats, []);
  assert.deepEqual(getLivePeers('oda-k').lockedSeats, []); // not the current room any more
  reportPeers(null, []);
});

test('kişilerin ve benim odaya giriş zamanım (ses sunucusunun saati) görüntüyle gelir', () => {
  const me = 1_700_000_100_000;
  // The join times travel with the people (a change of one is a new list), and my own with them.
  reportPeers('oda-g', [{ identity: 'u1', name: 'Ali', seat: null, speaking: false, micOn: false, joinedAt: me - 9_000 }], false, me);
  const first = getLivePeers('oda-g');
  assert.equal(first.meJoinedAt, me);
  assert.equal(first.peers[0].joinedAt, me - 9_000);
  reportPeers('oda-g', [{ identity: 'u1', name: 'Ali', seat: null, speaking: false, micOn: false, joinedAt: me - 9_000 }], false, me);
  assert.equal(getLivePeers('oda-g'), first, 'aynı liste: aynı görüntü');
  reportPeers('oda-g', [{ identity: 'u1', name: 'Ali', seat: null, speaking: false, micOn: false, joinedAt: me + 60_000 }], false, me);
  assert.equal(getLivePeers('oda-g').peers[0].joinedAt, me + 60_000, 'yeniden bağlanan yeni zamanla gelir');
  reportPeers(null, []);
  assert.equal(getLivePeers('oda-g').meJoinedAt, 0);
});

test('oda durumu (düzen, mikrofon sayısı, kuyruk) oda bilgisinden gelir; bozuk olan atılır', () => {
  // Only the server writes micQueue, and it writes everything at once: without it there is no state.
  assert.equal(parseRoomState('{"lockedSeats":[2]}'), null);
  assert.equal(parseRoomState(''), null);
  assert.equal(parseRoomState('bozuk'), null);
  assert.equal(parseRoomState('null'), null);
  assert.deepEqual(parseRoomState('{"lockedSeats":[],"layoutId":"sofra","micCount":12,"micQueue":true,"queue":["u1","u2","u1"],"seatColor":"pembe"}'), {
    layoutId: 'sofra',
    micCount: 12,
    micQueue: true,
    queue: ['u1', 'u2'],
    music: null,
    video: null,
    seatColor: 'pembe',
  });
  assert.deepEqual(parseRoomState('{"layoutId":5,"micCount":0,"micQueue":false,"queue":[1,"",null,"u3"],"seatColor":"mor"}'), { layoutId: null, micCount: null, micQueue: false, queue: ['u3'], music: null, video: null, seatColor: null });
  assert.deepEqual(parseRoomState(`{"layoutId":"${'x'.repeat(41)}","micCount":2.5,"micQueue":false,"queue":"u1"}`), { layoutId: null, micCount: null, micQueue: false, queue: [], music: null, video: null, seatColor: null });

  reportRoomMeta('oda-d', '{"lockedSeats":[1],"layoutId":null,"micCount":8,"micQueue":true,"queue":["u9"]}');
  assert.deepEqual(getLivePeers('oda-d').state, { layoutId: null, micCount: 8, micQueue: true, queue: ['u9'], music: null, video: null, seatColor: null });
  assert.deepEqual(getLivePeers('oda-d').lockedSeats, [1]);
  reportRoomMeta('oda-d', '{"lockedSeats":[1],"layoutId":null,"micCount":8,"micQueue":false,"queue":[]}');
  assert.equal(getLivePeers('oda-d').state?.micQueue, false);
  assert.equal(getLivePeers('oda-e').state, null); // another room
  reportPeers(null, []);
});

test('sunucunun verdiği koltuk yalnızca o odanın dinleyicisine gider', () => {
  const got: (number | null)[] = [];
  const off = onServerSeat('oda-s', (seat) => got.push(seat));
  reportServerSeat('oda-s', 4);
  reportServerSeat('oda-t', 2);
  reportServerSeat('oda-s', null);
  off();
  reportServerSeat('oda-s', 6);
  assert.deepEqual(got, [4, null]);
});

test('koltuk özelliği: yalnızca sayı bir mikrofondur', () => {
  assert.equal(parseSeat('0'), 0);
  assert.equal(parseSeat('8'), 8);
  assert.equal(parseSeat(''), null);
  assert.equal(parseSeat(undefined), null);
  assert.equal(parseSeat('-1'), null);
  assert.equal(parseSeat('abc'), null);
});

test('sinyaller yalnızca kendi odasının dinleyicisine gider', () => {
  const got: string[] = [];
  const off = onSignal('oda-a', (from, msg) => got.push(`${from}:${msg.t}`));
  reportSignal('oda-a', 'u1', { t: 'chat', text: 'selam' });
  reportSignal('oda-b', 'u2', { t: 'chat', text: 'başka oda' });
  reportSignal('oda-a', 'u3', { t: 'bozuk' });
  off();
  reportSignal('oda-a', 'u4', { t: 'chat', text: 'kapandıktan sonra' });
  assert.deepEqual(got, ['u1:chat']);
  reportPeers(null, []);
});

test('sunucunun Şanslı paketi: doğru biçim okunur, bozuk olan bırakılır, aynı gönderim bir kez', () => {
  const ok = { type: 'lucky', giftId: 'lk2', name: 'Uğur Böceği', emoji: '🐞', count: 5, from: 'u-a', to: ['u-b', 'u-c'], eventIds: [7, 8], best: 50, bigWin: 5000 };
  assert.deepEqual(parseServerLucky(ok), {
    from: 'u-a',
    msg: { t: 'lucky', giftId: 'lk2', name: 'Uğur Böceği', emoji: '🐞', count: 5, to: ['u-b', 'u-c'], eventId: 7, best: 50, bigWin: 5000 },
  });
  assert.equal(parseServerLucky({ ...ok, eventIds: [] }), null);
  assert.equal(parseServerLucky({ ...ok, to: [] }), null);
  assert.equal(parseServerLucky({ ...ok, count: 0 }), null);
  assert.equal(parseServerLucky({ ...ok, type: 'gift' }), null);
  assert.equal(parseServerLucky({ ...ok, best: -1, bigWin: 'çok' })?.msg.bigWin, 0);

  const got: string[] = [];
  const off = onSignal('oda-l', (from, msg) => got.push(msg.t === 'lucky' ? `${from}:${msg.giftId}#${msg.eventId}` : msg.t));
  reportSignal('oda-l', 'u-x', ok); // from a phone: dropped
  reportSignal('oda-l', null, ok);
  reportSignal('oda-l', null, ok); // again after a reconnect: shown once
  off();
  assert.deepEqual(got, ['u-a:lk2#7']);
});

test('Şanslı çanta: yalnızca sunucunun çanta paketi o odanın çantalarını yeniden okutur', () => {
  let n = 0;
  const off = onServerBag('oda-c', () => n++);
  reportSignal('oda-c', 'u-x', { type: 'bag', id: 3, from: 'u-x' }); // from a phone: dropped
  reportSignal('oda-d', null, { type: 'bag', id: 3, from: 'u-a' }); // another room
  reportSignal('oda-c', null, { type: 'bag', id: 3, from: 'u-a' });
  off();
  reportSignal('oda-c', null, { type: 'bag', id: 4, from: 'u-a' }); // after leaving
  assert.equal(n, 1);
});

test('Patron koltuğu: yalnızca sunucunun paketi o odada sohbet satırı olur', () => {
  const ok = { type: 'boss', event: 'took', user: 'u-a', name: 'Ayla' };
  assert.deepEqual(parseServerBoss(ok), { event: 'took', user: 'u-a', name: 'Ayla', mode: null });
  assert.deepEqual(parseServerBoss({ type: 'boss', event: 'mode', user: null, name: null, mode: 'invite' }), { event: 'mode', user: null, name: null, mode: 'invite' });
  assert.equal(parseServerBoss({ ...ok, event: 'won' }), null);
  assert.equal(parseServerBoss({ ...ok, type: 'room' }), null);
  assert.equal(parseServerBoss(null), null);
  assert.equal(parseServerBoss({ ...ok, name: 'x'.repeat(81) })?.name, null, 'uzun ad okunmaz');
  const got: string[] = [];
  const off = onServerBoss('oda-p', (n) => got.push(`${n.event}:${n.user}`));
  reportSignal('oda-p', 'u-x', ok); // from a phone: dropped
  reportSignal('oda-q', null, ok); // another room
  reportSignal('oda-p', null, ok);
  off();
  reportSignal('oda-p', null, { ...ok, event: 'expired' }); // after leaving
  assert.deepEqual(got, ['took:u-a']);
});

test('yetkilisiz kalan oda: sunucunun kapanış notu okunur, başkası okunmaz', () => {
  const n = parseServerClosed({ type: 'closed', reason: 'no_staff', minutes: 5 });
  assert.equal(n?.title, 'Oda kapandı');
  assert.match(n?.body ?? '', /^Odada 5 dakikadır oda sahibi ya da yönetici yoktu, bu yüzden oda kapandı\. Yetkilisi gelince oda yeniden açılır\.$/);
  assert.doesNotMatch(parseServerClosed({ type: 'closed', reason: 'no_staff', minutes: 'beş' })?.body ?? '', /dakika/);
  assert.equal(parseServerClosed({ type: 'closed', reason: 'owner' }), null);
  assert.equal(parseServerClosed({ type: 'room' }), null);
  assert.equal(parseServerClosed(null), null);
});

test('koltuk emojisi ve ücretsiz Hareketli telefondan gelir; biçimi bozuk olan atılır', () => {
  assert.deepEqual(parseSignal({ t: 'react', emoji: '🔥' }), { t: 'react', emoji: '🔥' });
  assert.deepEqual(parseSignal({ t: 'react', emoji: '⟦temel-kahkaha⟧' }), { t: 'react', emoji: '⟦temel-kahkaha⟧' });
  assert.equal(parseSignal({ t: 'react', emoji: '  ' }), null);
  assert.equal(parseSignal({ t: 'react', emoji: 'x'.repeat(41) }), null);
  assert.equal(parseSignal({ t: 'react', emoji: 7 }), null);
  assert.deepEqual(parseSignal({ t: 'anim', animationId: 'an-hearts' }), { t: 'anim', animationId: 'an-hearts' });
  assert.equal(parseSignal({ t: 'anim', animationId: 'AN HEARTS' }), null);
  assert.equal(parseSignal({ t: 'anim' }), null);
  // A paid one ("fx") from a phone is never taken: only the server announces it.
  assert.equal(parseSignal({ t: 'fx', animationId: 'an-dragon', eventId: 1 }), null);
});

test('sunucunun ücretli Hareketli paketi: doğru biçim okunur, telefondan gelen atılır, aynı olay bir kez', () => {
  const ok = { type: 'anim', animationId: 'an-coin-rain', from: 'u-a', eventId: 12 };
  assert.deepEqual(parseServerFx(ok), { from: 'u-a', msg: { t: 'fx', animationId: 'an-coin-rain', eventId: 12 } });
  assert.equal(parseServerFx({ ...ok, eventId: 0 }), null);
  assert.equal(parseServerFx({ ...ok, from: '' }), null);
  assert.equal(parseServerFx({ ...ok, animationId: '../x' }), null);
  assert.equal(parseServerFx({ ...ok, type: 'gift' }), null);

  const got: string[] = [];
  const off = onSignal('oda-fx', (from, msg) => got.push(msg.t === 'fx' ? `${from}:${msg.animationId}#${msg.eventId}` : msg.t));
  reportSignal('oda-fx', 'u-x', ok); // from a phone: dropped
  reportSignal('oda-fx', null, ok);
  reportSignal('oda-fx', null, ok); // again after a reconnect: shown once
  // A gift with the same number is another table's row: still shown.
  reportSignal('oda-fx', null, { type: 'gift', giftId: 'g1', count: 1, from: 'u-a', to: 'u-b', eventId: 12 });
  off();
  assert.deepEqual(got, ['u-a:an-coin-rain#12', 'gift']);
});

test('soru-cevap: soru ve seçim telefondan gelir; biçimi bozuk olan atılır', () => {
  assert.deepEqual(parseSignal({ t: 'q', id: 'q123', text: 'Yarın oda açık mı?' }), { t: 'q', id: 'q123', text: 'Yarın oda açık mı?' });
  assert.equal(parseSignal({ t: 'q', id: 'q123', text: '   ' }), null);
  assert.equal(parseSignal({ t: 'q', id: '../x', text: 'soru' }), null);
  assert.equal(parseSignal({ t: 'q', text: 'kimliksiz' }), null);
  assert.equal(parseSignal({ t: 'q', id: 'q1', text: 'a'.repeat(500) })?.t, 'q');
  assert.equal((parseSignal({ t: 'q', id: 'q1', text: 'a'.repeat(500) }) as { text: string }).text.length, 200);
  assert.deepEqual(parseSignal({ t: 'qpick', id: 'q123' }), { t: 'qpick', id: 'q123' });
  assert.equal(parseSignal({ t: 'qpick' }), null);
});
