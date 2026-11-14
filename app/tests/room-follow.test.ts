/// <reference types="node" />
// Following a room, the membership button and the member list (lib/room-follow): what the phone knows about a
// follow, Odalarım › Katıl as one list, the button's words per join mode, the list's order, filters and labels, and
// the "room opened" notice (lib/room-social).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { FollowerRoomInvite } from '@/lib/api';
import type { Room } from '@/data/mock';
import {
  addMemberPage,
  daysAway,
  demoFollowers,
  demoJoinMode,
  demoLastSeen,
  filterMemberRows,
  forgetRoomFollows,
  isStaffRole,
  joinButton,
  lastSeenText,
  memberStrip,
  membershipOf,
  myRoomMark,
  myRoomRows,
  putRoomFollow,
  roomFollowOf,
  roomPeopleCount,
  sortMemberRows,
  subscribeRoomFollow,
  toggledFollow,
  type MemberRow,
} from '@/lib/room-follow';
import { roomInviteNotices } from '@/lib/room-social';

const NOW = Date.parse('2026-11-10T20:00:00Z');
const MIN = 60_000;
const DAY = 86_400_000;
const room = (id: string, listeners: number, p: Partial<Room> = {}): Room => ({ id, title: `Oda ${id}`, category: 'Sohbet', cover: '', hostId: `h-${id}`, listeners, seatUserIds: [], tags: [], ...p });
const row = (id: string, p: Partial<MemberRow> = {}): MemberRow => ({ id, name: id, role: 'member', inRoom: false, lastSeen: null, ...p });

describe('Oda takibi (telefonun bildiği)', () => {
  test('oda okuması yazar, kalp değiştirir; aynı değer dinleyenleri uyandırmaz; hesap değişince unutulur', () => {
    let woke = 0;
    const off = subscribeRoomFollow(() => woke++);
    assert.equal(roomFollowOf('r-a'), null);
    putRoomFollow('r-a', { following: false, followers: 4 });
    assert.deepEqual([roomFollowOf('r-a'), woke], [{ following: false, followers: 4 }, 1]);
    const same = roomFollowOf('r-a');
    putRoomFollow('r-a', { following: false, followers: 4 });
    assert.equal(roomFollowOf('r-a'), same, 'aynı nesne kalır');
    assert.equal(woke, 1);
    putRoomFollow('r-a', toggledFollow(same!));
    assert.deepEqual([roomFollowOf('r-a'), woke], [{ following: true, followers: 5 }, 2]);
    forgetRoomFollows();
    assert.deepEqual([roomFollowOf('r-a'), woke], [null, 3]);
    forgetRoomFollows();
    assert.equal(woke, 3, 'boşken uyandırmaz');
    off();
  });

  test('kalbe dokununca sayı bir artar ya da azalır, sıfırın altına inmez', () => {
    assert.deepEqual(toggledFollow({ following: false, followers: 0 }), { following: true, followers: 1 });
    assert.deepEqual(toggledFollow({ following: true, followers: 1 }), { following: false, followers: 0 });
    assert.deepEqual(toggledFollow({ following: true, followers: 0 }), { following: false, followers: 0 });
    assert.equal(demoFollowers({ id: 'r3', listeners: 100 }), demoFollowers({ id: 'r3', listeners: 100 }), 'örnek sayı her bakışta aynı');
    assert.ok(demoFollowers({ id: 'r3', listeners: 100 }) > 0);
  });
});

describe('Odalarım › Katıl', () => {
  test('üye olduklarım ve takip ettiklerim tek liste: açıklar önce (kalabalık üstte), kapalılar sonda, her oda bir kez', () => {
    const a = room('a', 3);
    const b = room('b', 40);
    const c = room('c', 0);
    const d = room('d', 12);
    const e = room('e', 0);
    const rows = myRoomRows([a, b], [{ room: c, closed: true }, { room: b, closed: false }, { room: d, closed: false }, { room: e, closed: true }]);
    assert.deepEqual(rows.map((r) => [r.room.id, r.member, r.followed, r.closed]), [
      ['b', true, true, false],
      ['d', false, true, false],
      ['a', true, false, false],
      ['c', false, true, true],
      ['e', false, true, true],
    ]);
    assert.deepEqual(rows.map(myRoomMark), ['Üye · Takipte', 'Takipte', 'Üye', 'Takipte', 'Takipte']);
    assert.deepEqual(myRoomRows([], []), []);
    assert.deepEqual(myRoomRows([a], []).map((r) => r.room.id), ['a']);
  });
});

describe('Üyelik düğmesi', () => {
  test('açık odada "Üye ol", başvurulu odada "Başvur", kapalıda ve doluda basılmaz', () => {
    assert.deepEqual([joinButton('open', 3, 50).label, joinButton('open', 3, 50).disabled], ['Üye ol', false]);
    assert.deepEqual([joinButton('apply', 3, 50).label, joinButton('apply', 3, 50).disabled], ['Başvur', false]);
    assert.deepEqual([joinButton('closed', 3, 50).label, joinButton('closed', 3, 50).disabled], ['Üye alımı kapalı', true]);
    assert.deepEqual([joinButton('open', 50, 50).label, joinButton('open', 50, 50).disabled], ['Üye kapasitesi dolu', true]);
    assert.match(joinButton('open', 1_200, 1_200).hint, /1\.200/);
    // An application is still taken when the room is full: the owner decides who gets the place.
    assert.equal(joinButton('apply', 50, 50).disabled, false);
  });

  test('demo: mikrofonu üyelere ayıran, şifreli ya da özel oda başvuru ister; diğerleri açıktır', () => {
    assert.equal(demoJoinMode({}), 'open');
    assert.equal(demoJoinMode({ micPermission: 'everyone', roomType: 'music' }), 'open');
    assert.equal(demoJoinMode({ micPermission: 'members' }), 'apply');
    assert.equal(demoJoinMode({ password: '1234' }), 'apply');
    assert.equal(demoJoinMode({ roomType: 'private' }), 'apply');
  });

  test('yönetici yetkili olarak üyedir: katıl ya da ayrıl düğmesi yok; bilinmeyen yanıt üye değil sayılır', () => {
    assert.deepEqual(['owner', 'admin', 'member', 'pending', null, 'yeni'].map(membershipOf), ['owner', 'staff', 'member', 'pending', 'none', 'none']);
  });
});

describe('Oda üyeleri sayısı', () => {
  test('kartta sahip ve yöneticiler de sayılır, her kişi bir kez (Güncelleme 5: "0 / 5.000" iki kişi varken)', () => {
    // The client's card: the owner and a Yönetici, nobody joined: 2, not 0, and no "+" bubble after the two faces.
    assert.deepEqual(memberStrip(['me', 'kerem'], ['me', 'kerem'], 2, 12), { row: ['me', 'kerem'], more: 0 });
    // An older server (or a slow read) with only the members in the list still draws the staff first.
    assert.deepEqual(memberStrip(['me', 'kerem'], [], 2, 12), { row: ['me', 'kerem'], more: 0 });
    // More people than the row: the bubble is the rest of the count.
    const many = Array.from({ length: 30 }, (_, i) => `u${i}`);
    assert.deepEqual(memberStrip(['h', 'a1'], ['h', 'a1', ...many], 32, 12), { row: ['h', 'a1', ...many.slice(0, 10)], more: 20 });
    // My own demo room: the staff and the members, each once.
    assert.equal(roomPeopleCount(['me', 'u3'], ['me', 'u3', 'u5']), 3);
    assert.equal(roomPeopleCount(['me'], ['me']), 1);
  });
});

describe('Üye listesi', () => {
  const rows: MemberRow[] = [
    row('üye-eski', { lastSeen: NOW - 9 * DAY }),
    row('yönetici', { role: 'admin', lastSeen: NOW - 2 * DAY }),
    row('üye-odada', { inRoom: true, lastSeen: NOW - 30 * MIN }),
    row('sahip', { role: 'owner', inRoom: true }),
    row('süper', { role: 'super' }),
    row('üye-yeni', { lastSeen: NOW - 5 * MIN }),
  ];

  test('önce sahip ve yöneticiler, sonra odadakiler, sonra en son giren', () => {
    assert.deepEqual(sortMemberRows(rows).map((r) => r.id), ['sahip', 'süper', 'yönetici', 'üye-odada', 'üye-yeni', 'üye-eski']);
    assert.deepEqual(rows[0].id, 'üye-eski', 'verilen liste değişmez');
    assert.deepEqual([isStaffRole('owner'), isStaffRole('super'), isStaffRole('admin'), isStaffRole('member'), isStaffRole('pending')], [true, true, true, false, false]);
  });

  test('Odada ve Odada değil süzgeçleri; sonraki sayfa eklenirken aynı kişi iki kez girmez', () => {
    assert.deepEqual(filterMemberRows(rows, 'in').map((r) => r.id), ['üye-odada', 'sahip']);
    assert.deepEqual(filterMemberRows(rows, 'out').map((r) => r.id), ['üye-eski', 'yönetici', 'süper', 'üye-yeni']);
    assert.equal(filterMemberRows(rows, 'all').length, 6);
    assert.deepEqual(addMemberPage([row('a'), row('b')], [row('b'), row('c')]).map((r) => r.id), ['a', 'b', 'c']);
  });

  test('son giriş satırı: odadaysa "Şu an odada", değilse ne kadar önce; bilinmiyorsa boş', () => {
    assert.equal(lastSeenText({ inRoom: true, lastSeen: NOW - 9 * DAY }, NOW), 'Şu an odada');
    assert.equal(lastSeenText({ inRoom: false, lastSeen: null }, NOW), '');
    assert.equal(lastSeenText({ inRoom: false, lastSeen: NOW - 20_000 }, NOW), 'Son giriş: az önce');
    assert.equal(lastSeenText({ inRoom: false, lastSeen: NOW - 5 * MIN }, NOW), 'Son giriş: 5 dk önce');
    assert.equal(lastSeenText({ inRoom: false, lastSeen: NOW - 3 * 60 * MIN }, NOW), 'Son giriş: 3 sa önce');
    assert.equal(lastSeenText({ inRoom: false, lastSeen: NOW - 30 * 60 * MIN }, NOW), 'Son giriş: dün');
    assert.equal(lastSeenText({ inRoom: false, lastSeen: NOW - 9 * DAY }, NOW), 'Son giriş: 9 gün önce');
    // The server's clock a little ahead of the phone's never reads as the future.
    assert.equal(lastSeenText({ inRoom: false, lastSeen: NOW + 4_000 }, NOW), 'Son giriş: az önce');
  });

  test('kaç gündür gelmedi (otomatik çıkarma uyarısı): odadaki ve bilinmeyen için yok', () => {
    assert.equal(daysAway({ inRoom: false, lastSeen: NOW - 9 * DAY - 5 * MIN }, NOW), 9);
    assert.equal(daysAway({ inRoom: false, lastSeen: NOW - 5 * MIN }, NOW), 0);
    assert.equal(daysAway({ inRoom: true, lastSeen: NOW - 9 * DAY }, NOW), null);
    assert.equal(daysAway({ inRoom: false, lastSeen: null }, NOW), null);
    assert.equal(demoLastSeen('u7', NOW), demoLastSeen('u7', NOW), 'örnek tarih her bakışta aynı');
    assert.ok(demoLastSeen('u7', NOW) <= NOW && demoLastSeen('u7', NOW) > NOW - 41 * DAY);
  });
});

describe('Takip edilen oda açıldı bildirimi', () => {
  test('davetle aynı yoldan gelir, kendi sözleriyle; odaya götürür', () => {
    const at = (min: number) => new Date(NOW - min * MIN).toISOString();
    const invites: FollowerRoomInvite[] = [
      { id: 4, kind: 'open', room: { id: 'room-2', title: 'Gece Sohbeti' }, host: { id: 'srv-b', name: 'Bora' }, at: at(2) },
      { id: 9, room: { id: 'room-1', title: 'Karaoke' }, host: { id: 'srv-a', name: 'Ada' }, at: at(10) },
    ];
    const { notices, mark } = roomInviteNotices(invites, null, NOW);
    assert.deepEqual(notices, [
      { kind: 'social', icon: 'mic', title: 'Oda daveti', body: 'Ada seni "Karaoke" odasına davet ediyor', href: '/oda/room-1' },
      { kind: 'social', icon: 'mic', title: 'Takip ettiğin oda açıldı', body: '"Gece Sohbeti" odası şimdi açık', href: '/oda/room-2' },
    ]);
    assert.equal(mark, Date.parse(at(2)));
    assert.deepEqual(roomInviteNotices(invites, mark, NOW).notices, [], 'bir kez söylenir');
  });
});
