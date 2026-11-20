// Gizlilik saved on the server (lib/privacy-sync), Arkadaşlarım (lib/friend-rows) and Aramalar from the server's call
// history (lib/call-rows): the pure parts behind Ayarlar and Mesajlar in a live build.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { ServerCallLog, ServerPrivacy } from '@/lib/api';
import type { User } from '@/data/mock';
import { liveCallRows } from '@/lib/call-rows';
import { friendRows } from '@/lib/friend-rows';
import { marksShown, privacyBody, privacySync } from '@/lib/privacy-sync';

const SERVER: ServerPrivacy = { profilePublic: true, showOnline: true, showLastSeen: true, showCurrentRoom: true, dmFrom: 'everyone', callsFrom: 'everyone', invitesFrom: 'everyone', voiceCalls: true, videoCalls: true, messagePush: true, pushCloseOnly: true };

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

describe('Gizlilik: profil izleri, geri alınmış (marksFrom bilmeyen) sunucuda', () => {
  const OLD: ServerPrivacy = { ...SERVER, profileMarks: true };
  const NEW: ServerPrivacy = { ...SERVER, profileMarks: true, marksFrom: 'following' };

  test('marksFrom bilmeyen sunucuya anahtar kendi adıyla gider; bilen sunucuya seçim olduğu gibi', () => {
    const s = privacySync();
    s.loaded(OLD);
    assert.deepEqual(privacyBody('marksFrom', 'nobody', s.known()), { profileMarks: false }, 'anahtar açılınca: kimse');
    assert.deepEqual(privacyBody('marksFrom', 'following', s.known()), { profileMarks: true }, 'anahtar kapanınca');
    assert.deepEqual(privacyBody('marksFrom', 'everyone', s.known()), { profileMarks: true });
    assert.deepEqual(privacyBody('profileMarks', false, s.known()), { profileMarks: false });
    assert.deepEqual(privacyBody('dmFrom', 'mutual', s.known()), { dmFrom: 'mutual' }, 'başka ayar etkilenmez');
    const fresh = privacySync();
    fresh.loaded(NEW);
    assert.deepEqual(privacyBody('marksFrom', 'nobody', fresh.known()), { marksFrom: 'nobody' });
    // Not read yet: sent as chosen (this server knows it).
    assert.deepEqual(privacyBody('marksFrom', 'following', privacySync().known()), { marksFrom: 'following' });
  });

  test('cevaptan gösterilen: iki ayar ya da eski sunucunun anahtarı (açık: herkes, kapalı: kimse)', () => {
    assert.deepEqual(marksShown(NEW), { marksFrom: 'following', profileMarks: true });
    assert.deepEqual(marksShown(OLD), { marksFrom: 'everyone', profileMarks: true });
    assert.deepEqual(marksShown({ ...OLD, profileMarks: false }), { marksFrom: 'nobody', profileMarks: false });
    assert.equal(marksShown(SERVER), null, 'profil izinden önceki sunucu');
    const s = privacySync();
    s.loaded(OLD);
    const id = s.begin('marksFrom');
    s.saved('marksFrom', id, { ...OLD, profileMarks: false });
    assert.deepEqual(marksShown(s.known()), { marksFrom: 'nobody', profileMarks: false }, 'son cevap bilinir');
  });
});

describe('Arkadaşlarım', () => {
  const people: Record<string, Partial<User>> = { a: { online: false }, b: { online: true }, c: { online: false }, d: { online: true } };
  const person = (id: string) => ({ id, name: id, ...people[id] }) as User;

  test('yalnızca karşılıklı takipleşenler, önce çevrimiçi; tek yönlüler, engellenen ve ben yokum', () => {
    const rows = friendRows(new Set(['a', 'b', 'c', 'x', 'me']), new Set(['a', 'c', 'd', 'x', 'me']), new Set(['x']), person);
    assert.deepEqual(
      rows.map((f) => f.user.id),
      ['a', 'c'],
    );
    const online = friendRows(new Set(['a', 'b', 'd']), new Set(['a', 'b', 'd']), new Set(), person);
    assert.deepEqual(
      online.map((f) => f.user.id),
      ['b', 'd', 'a'],
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
