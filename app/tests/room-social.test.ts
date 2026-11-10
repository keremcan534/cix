/// <reference types="node" />
// Room social features of a live build (lib/room-social, server/api/room-social.mjs): a server mic invite as the
// presence model's, the server poll counted down on the phone, follower invites as notices, the room share's text,
// the room packets, the push target and the Odalar row chips from the server.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { FollowerRoomInvite, ServerMicInvite, ServerPoll } from '@/lib/api';
import { checkText } from '@/lib/contact-filter';
import { onServerInvite, onServerPoll, reportSignal } from '@/lib/live/room-bus';
import { pushTarget } from '@/lib/push-target';
import { FOLLOWER_INVITE_COOLDOWN_MS } from '@/lib/room-invites';
import {
  FRESH_INVITE_MS,
  MAX_INVITE_NOTICES,
  followerInviteAt,
  inviteKey,
  inviteSeat,
  livePoll,
  localInvite,
  roomInviteNotices,
  roomShareText,
  serverInviteId,
} from '@/lib/room-social';
import { matchesTab, popularScore, roomBadge, rowExtra } from '@/data/rooms-ui';
import { ROOMS, type Room } from '@/data/mock';

const NOW = Date.parse('2026-11-10T20:00:00Z');
const invite = (p: Partial<ServerMicInvite> = {}): ServerMicInvite => ({
  id: 7,
  room: 'room-1',
  from: { id: 'srv-owner', name: 'Sahip' },
  to: { id: 'srv-me', name: 'Ben' },
  seat: 3,
  status: 'pending',
  note: '',
  expiresIn: 30_000,
  createdAt: '2026-11-10T19:59:59Z',
  ...p,
});

describe('Mikrofon daveti (sunucu)', () => {
  test('sunucunun daveti bu telefonun kimlikleriyle, süresi sunucunun kalan süresinden', () => {
    const local = localInvite(invite({ expiresIn: 12_000 }), (id) => (id === 'srv-me' ? 'me' : id), NOW);
    assert.deepEqual(local, { id: 'srv-7', roomId: 'room-1', fromId: 'srv-owner', toId: 'me', seat: 3, status: 'pending', at: NOW - 18_000, expiresAt: NOW + 12_000 });
    const any = localInvite(invite({ seat: null, status: 'expired', expiresIn: 0, note: 'Yanıt verilmedi' }), (id) => id, NOW);
    assert.equal('seat' in any, false, 'herhangi bir mikrofon');
    assert.deepEqual([any.status, any.expiresAt, any.note], ['expired', NOW, 'Yanıt verilmedi']);
    assert.equal(serverInviteId(inviteKey(41)), 41);
    assert.equal(serverInviteId('INV-abc'), null, 'demonun daveti sunucuya gitmez');
  });

  test('kabulde mikrofon: davetin kendi mikrofonu, yoksa sahibinkinden sonraki ilk boş ve kilitsiz', () => {
    assert.equal(inviteSeat(4, ['h', null, null, null, null], []), 4);
    assert.equal(inviteSeat(undefined, ['h', 'u1', null, null], [2]), 3);
    assert.equal(inviteSeat(undefined, ['h', 'u1', 'u2'], []), -1);
  });

  test('davet ve anket paketleri yalnızca sunucudan, o odanın dinleyicilerine', () => {
    const news: unknown[] = [];
    let polls = 0;
    const offI = onServerInvite('oda-s', (n) => news.push(n));
    const offP = onServerPoll('oda-s', () => polls++);
    reportSignal('oda-s', 'u-x', { type: 'invite', to: 'a', from: 'b' }); // a phone: dropped
    reportSignal('oda-s', 'u-x', { type: 'poll', id: '1' });
    reportSignal('oda-t', null, { type: 'invite', to: 'a', from: 'b' }); // another room
    reportSignal('oda-s', null, { type: 'invite', id: '3', to: 'a', from: 'b' });
    reportSignal('oda-s', null, { type: 'invite' });
    reportSignal('oda-s', null, { type: 'poll', id: '9' });
    offI();
    offP();
    reportSignal('oda-s', null, { type: 'poll', id: '9' }); // after leaving
    assert.deepEqual(news, [{ to: 'a', from: 'b' }, { to: null, from: null }]);
    assert.equal(polls, 1);
  });
});

describe('Oda anketi (sunucu)', () => {
  const poll = (p: Partial<ServerPoll> = {}): ServerPoll => ({
    id: 5,
    room: 'room-1',
    question: 'Hangi şarkı?',
    options: [
      { text: 'Pop', votes: 2 },
      { text: 'Rock', votes: 1 },
    ],
    total: 3,
    myVote: 0,
    live: true,
    endsIn: 60,
    closed: false,
    by: { id: 'srv-owner', name: 'Sahip' },
    ...p,
  });

  test('kalan süre bu telefonda sayılır; bitince kapanır', () => {
    const p = livePoll(poll(), NOW + 60_000, NOW + 15_200);
    assert.deepEqual([p.id, p.endsIn, p.closed, p.myVote, p.options.map((o) => o.votes)], ['5', 45, false, 0, [2, 1]]);
    const ended = livePoll(poll(), NOW + 60_000, NOW + 61_000);
    assert.deepEqual([ended.endsIn, ended.closed], [0, true]);
    assert.deepEqual([livePoll(poll({ closed: true }), NOW + 60_000, NOW).endsIn, livePoll(poll({ closed: true }), NOW + 60_000, NOW).closed], [0, true]);
  });

  test('gizli sonuçlar 0 gelir (kart onları göstermez)', () => {
    const p = livePoll(poll({ live: false, myVote: null, total: null, options: [{ text: 'A', votes: null }, { text: 'B', votes: null }] }), NOW + 30_000, NOW);
    assert.deepEqual(p.options, [{ text: 'A', votes: 0 }, { text: 'B', votes: 0 }]);
    assert.equal(p.live, false);
  });
});

describe('Takipçilere davet ve paylaşım (sunucu)', () => {
  test('sunucunun bekleme süresinden son gönderim zamanı', () => {
    assert.equal(followerInviteAt(0, NOW), undefined);
    assert.equal(followerInviteAt(FOLLOWER_INVITE_COOLDOWN_MS - 60_000, NOW), NOW - 60_000);
    assert.equal(followerInviteAt(FOLLOWER_INVITE_COOLDOWN_MS * 2, NOW), NOW, 'uzun bekleme de en fazla 24 saat');
  });

  const inv = (id: number, minAgo: number): FollowerRoomInvite => ({ id, room: { id: `room-${id}`, title: `Oda ${id}` }, host: { id: `h${id}`, name: `Sahip ${id}` }, at: new Date(NOW - minAgo * 60_000).toISOString() });

  test('ilk okumada yalnızca son bir saatin davetleri; sonra işaretten yeniler, en yenisi üstte', () => {
    const first = roomInviteNotices([inv(1, 10), inv(2, FRESH_INVITE_MS / 60_000 + 5)], null, NOW);
    assert.deepEqual(first.notices.map((n) => n.href), ['/oda/room-1']);
    assert.equal(first.notices[0].body, 'Sahip 1 seni "Oda 1" odasına davet ediyor');
    assert.equal(first.mark, NOW - 10 * 60_000);
    const next = roomInviteNotices([inv(3, 1), inv(4, 2), inv(1, 10)], first.mark, NOW);
    assert.deepEqual(next.notices.map((n) => n.href), ['/oda/room-4', '/oda/room-3'], 'eskiden yeniye: en yenisi listenin üstüne');
    assert.equal(next.mark, NOW - 60_000);
    assert.deepEqual(roomInviteNotices([], next.mark, NOW), { notices: [], mark: next.mark });
  });

  test('bir seferde en fazla üç davet bildirimi (en yeniler)', () => {
    const many = [1, 2, 3, 4, 5].map((i) => inv(i, i));
    const r = roomInviteNotices(many, NOW - 60 * 60_000, NOW);
    assert.equal(r.notices.length, MAX_INVITE_NOTICES);
    assert.deepEqual(r.notices.map((n) => n.href), ['/oda/room-3', '/oda/room-2', '/oda/room-1']);
  });

  test('paylaşım mesajı iletişim filtresinden geçer ve oda numarasını taşır', () => {
    const t = roomShareText('Gece Sohbeti', '12345678');
    assert.ok(t.endsWith('Oda ID: 12345678'));
    assert.ok(t.includes('"Gece Sohbeti"'));
    assert.equal(checkText(t).ok, true);
  });

  test('oda daveti bildirimine dokununca oda açılır', () => {
    assert.equal(pushTarget({ type: 'room_invite', room: 'abc' }), '/oda/abc');
    assert.equal(pushTarget({ type: 'room_invite' }), '/bildirimler');
  });
});

describe('Odalar satırı (sunucu)', () => {
  const server = (serverChips: Room['serverChips'], listeners = 5): Room => ({ ...ROOMS[0], id: '0c7f4a1e-0000-4000-8000-000000000001', listeners, serverChips });

  test('sunucunun bildiği ajans, aile, PK ve haftanın sırası; uydurma yok', () => {
    const plain = server({ pk: false });
    assert.equal(roomBadge(plain), null);
    assert.deepEqual(rowExtra(plain), { pk: false });
    const ag = roomBadge(server({ pk: false, agency: 'Kıyı Ajans', family: 'Gece Ailesi' }));
    assert.deepEqual([ag?.label, ag?.icon], ['Kıyı Ajans', 'business'], 'ajans önce');
    assert.deepEqual([roomBadge(server({ pk: false, family: 'Gece Ailesi' }))?.label, roomBadge(server({ pk: false, family: 'Gece Ailesi' }))?.icon], ['Gece Ailesi', 'people']);
    assert.equal(matchesTab(server({ pk: true }), 'PK'), true);
    assert.equal(matchesTab(plain, 'PK'), false);
    assert.ok(popularScore(server({ pk: false, weekRank: 1 }, 1)) > popularScore(server({ pk: false }, 900)), 'haftanın ilk odası önde');
  });

  test('demo odaları kendi tablosundan, değişmeden', () => {
    const r2 = ROOMS.find((r) => r.id === 'r2')!;
    assert.deepEqual([rowExtra(r2).top, rowExtra(r2).pk], [1, true]);
    assert.equal(roomBadge(r2)?.icon, undefined);
    assert.ok(roomBadge(r2)?.label);
  });
});
