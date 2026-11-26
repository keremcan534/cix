// "Kimler ulaşabilir": the message and call choices are gone (owners, 27 Nov 2026; privacy.mjs REACH_CHOICES, the
// default): a choice saved before doesn't refuse anyone, and every app reads "Herkes". Blocks still hold.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ REACH_CHOICES: '0' });
const { call, signUp } = h;

describe('Mesaj ve arama seçenekleri kapalı', () => {
  test('eski "yalnız takip ettiklerim" seçimi kimseyi durdurmaz, Herkes görünür', async () => {
    const [owner, stranger] = await Promise.all([signUp('Eski Seçim'), signUp('Yabancı')]);
    await h.sql.query("INSERT INTO privacy_settings (user_id, dm_from, calls_from) VALUES ($1, 'mutual', 'nobody')", [owner.user.id]);
    const [st, j] = await call('GET', '/api/me/privacy', null, owner.session);
    assert.equal(st, 200, j.error);
    assert.deepEqual([j.privacy.dmFrom, j.privacy.callsFrom], ['everyone', 'everyone']);
    const [sent, m] = await call('POST', '/api/messages', { to: owner.user.id, text: 'Merhaba nasılsın', ref: rnd(6) }, stranger.session);
    assert.equal(sent, 200, m.error);
  });
});
