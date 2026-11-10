// Gizlilik saved on the server (lib/privacy-sync), Arkadaşlarım (lib/friend-rows) and Aramalar from the server's call
// history (lib/call-rows): the pure parts behind Ayarlar and Mesajlar in a live build.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { ServerCallLog, ServerPrivacy } from '@/lib/api';
import type { User } from '@/data/mock';
import { liveCallRows } from '@/lib/call-rows';
import { friendRows } from '@/lib/friend-rows';
import { privacySync } from '@/lib/privacy-sync';

const SERVER: ServerPrivacy = { profilePublic: true, showOnline: true, showLastSeen: true, showCurrentRoom: true, dmFrom: 'everyone', callsFrom: 'everyone', invitesFrom: 'everyone' };

describe('Gizlilik: hemen görünür, reddedilirse geri döner', () => {
  test('reddedilen değişiklik sunucunun son onayladığına döner', () => {
    const s = privacySync();
    s.loaded(SERVER);
    const id = s.begin('dmFrom');
    assert.equal(s.failed('dmFrom', id, 'everyone'), 'everyone');
  });

  test('aynı ayarın yeni bir değişikliği yoldayken eskisinin reddi bir şey değiştirmez', () => {
    const s = privacySync();
    s.loaded(SERVER);
    const first = s.begin('showOnline');
    const second = s.begin('showOnline');
    assert.equal(s.failed('showOnline', first, true), undefined);
    s.saved('showOnline', second, { ...SERVER, showOnline: false });
    // A later change refused: back to what the server took last.
    const third = s.begin('showOnline');
    assert.equal(s.failed('showOnline', third, true), false);
  });

  test('sunucu henüz okunmadıysa önceki değere döner; okuma yoldaki değişikliği ezmez', () => {
    const s = privacySync();
    const id = s.begin('callsFrom');
    assert.deepEqual(Object.keys(s.loaded(SERVER)).includes('callsFrom'), false, 'yoldaki değişiklik korunur');
    assert.equal(s.failed('callsFrom', id, 'following'), 'everyone', 'okunduktan sonra sunucununki');
    const other = privacySync();
    const n = other.begin('invitesFrom');
    assert.equal(other.failed('invitesFrom', n, 'following'), 'following');
  });

  test('hesap değişince hiçbir şey taşınmaz', () => {
    const s = privacySync();
    s.loaded({ ...SERVER, dmFrom: 'mutual' });
    s.reset();
    const id = s.begin('dmFrom');
    assert.equal(s.failed('dmFrom', id, 'following'), 'following');
  });
});

describe('Arkadaşlarım', () => {
  const people: Record<string, Partial<User>> = { a: { online: false }, b: { online: true }, c: { online: false }, d: { online: true } };
  const person = (id: string) => ({ id, name: id, ...people[id] }) as User;

  test('takip ettiklerim ve takipçilerim: önce karşılıklı, sonra çevrimiçi; engellenen ve ben yokum', () => {
    const rows = friendRows(new Set(['a', 'b', 'x', 'me']), new Set(['a', 'c', 'd', 'x']), new Set(['x']), person);
    assert.deepEqual(
      rows.map((f) => [f.user.id, f.iFollow, f.followsMe]),
      [
        ['a', true, true],
        ['b', true, false],
        ['d', false, true],
        ['c', false, true],
      ],
    );
  });
});

describe('Aramalar (sunucudan)', () => {
  const now = new Date('2026-11-10T15:00:00');
  const base = { seconds: 0, coins: 0, iPay: false, iEarn: false, other: { id: 'srv-1', name: 'Ece', avatarUrl: null }, at: '2026-11-10T14:05:00' };
  const local = (id: string) => (id === 'srv-1' ? 'srv-1' : 'me');

  test('yön, süre, nasıl bittiği, ücret ve kazanç', () => {
    const list: ServerCallLog[] = [
      { ...base, id: 5, mode: 'video', outgoing: true, status: 'ended', seconds: 754, coins: 1200, iPay: true },
      { ...base, id: 4, mode: 'voice', outgoing: false, status: 'ended', seconds: 61, coins: 300, iEarn: true },
      { ...base, id: 3, mode: 'voice', outgoing: false, status: 'missed' },
      { ...base, id: 2, mode: 'voice', outgoing: false, status: 'cancelled' },
      { ...base, id: 1, mode: 'video', outgoing: true, status: 'missed', at: '2026-11-09T21:00:00' },
      { ...base, id: 0, mode: 'voice', outgoing: true, status: 'declined' },
    ];
    assert.deepEqual(liveCallRows(list, local, now), [
      { id: 'call-5', userId: 'srv-1', kind: 'video', direction: 'out', duration: 754, time: '14:05', money: '1.200 jeton' },
      { id: 'call-4', userId: 'srv-1', kind: 'voice', direction: 'in', duration: 61, time: '14:05', money: '+300 elmas' },
      { id: 'call-3', userId: 'srv-1', kind: 'voice', direction: 'missed', duration: 0, time: '14:05' },
      { id: 'call-2', userId: 'srv-1', kind: 'voice', direction: 'missed', duration: 0, time: '14:05' },
      { id: 'call-1', userId: 'srv-1', kind: 'video', direction: 'out', duration: 0, time: 'Dün', note: 'Cevap yok' },
      { id: 'call-0', userId: 'srv-1', kind: 'voice', direction: 'out', duration: 0, time: '14:05', note: 'Reddedildi' },
    ]);
  });

  test('reddettiğim gelen arama', () => {
    const [row] = liveCallRows([{ ...base, id: 9, mode: 'voice', outgoing: false, status: 'declined' }], local, now);
    assert.equal(row.direction, 'in');
    assert.equal(row.note, 'Reddettin');
  });
});
