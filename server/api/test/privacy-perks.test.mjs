// Gizlilik as a VIP / Rütbe right (owners, 26 Nov 2026; privacy.mjs PRIVACY_PERKS, levels.mjs): an account without the
// right can't move its choice off the default; one with it can; a right that lapses puts the choice back.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startApi } from './harness.mjs';

const h = startApi({ PRIVACY_PERKS: '1' });
const { call, signUp } = h;
const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const vipPoints = async (level) => (await ok(call('GET', '/api/catalog?levels=1'), 'katalog')).levels?.vip?.levels?.find((l) => l.level === level)?.points;

describe('Gizlilik: VIP ve Rütbe ayrıcalığı', () => {
  test('normal kullanıcı değiştiremez; VIP olunca açılır; VIP düşünce ayar varsayılana döner', async () => {
    const u = await signUp('Gizli');
    const none = await ok(call('GET', '/api/me/privacy', null, u.session), 'okuma');
    assert.deepEqual(none.perks, []);
    assert.deepEqual(none.perkLevels.privacy_room, { vip: 2, noble: 1 });
    const [st, j] = await call('PATCH', '/api/me/privacy', { showCurrentRoom: false }, u.session);
    assert.deepEqual([st, j.code], [403, 'privacy_perk']);
    assert.match(j.error, /VIP 2 ya da Rütbe/);
    // Kimler ulaşabilir stays for everyone; "Kimse" for marks is a right.
    await ok(call('PATCH', '/api/me/privacy', { dmFrom: 'following', marksFrom: 'everyone' }, u.session), 'herkese açık seçim');
    assert.equal((await call('PATCH', '/api/me/privacy', { marksFrom: 'nobody' }, u.session))[0], 403);

    const points = (await vipPoints(4)) ?? 1e9;
    await q('UPDATE users SET svip_xp = $2 WHERE id = $1', [u.user.id, points]);
    const vip = await ok(call('GET', '/api/me/privacy', null, u.session), 'VIP 4');
    assert.deepEqual(new Set(vip.perks), new Set(['privacy_room', 'privacy_global', 'privacy_online']));
    await ok(call('PATCH', '/api/me/privacy', { showCurrentRoom: false, showOnline: false, globalHideName: true }, u.session), 'VIP ile');
    assert.equal((await call('PATCH', '/api/me/privacy', { profilePublic: false }, u.session))[0], 403, 'VIP 6 ayrıcalığı');

    // The VIP is gone: the next read puts every choice past the rights back.
    await q('UPDATE users SET svip_xp = 0 WHERE id = $1', [u.user.id]);
    const back = (await ok(call('GET', '/api/me/privacy', null, u.session), 'düşünce')).privacy;
    assert.deepEqual([back.showCurrentRoom, back.showOnline, back.globalHideName, back.dmFrom], [true, true, false, 'following']);
  });
});
