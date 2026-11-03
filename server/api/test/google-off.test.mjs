// Google sign-in without GOOGLE_CLIENT_IDS: off (503) and not counted as a server failure; like every
// /api/auth/ route it shares the per-IP sign-in limit (RATE_AUTH). A remote GOOGLE_JWKS_URL is ignored.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startApi } from './harness.mjs';

const h = startApi({ GOOGLE_CLIENT_IDS: ' , ', GOOGLE_JWKS_URL: 'https://evil.example.com/certs', RATE_AUTH: '3', ALERT_DISK_FREE_PCT: '0', ALERT_5XX_15M: '0', ALERT_CACHE_S: '0' });

describe('Google ile giriş kapalı', () => {
  test('503, sağlık uyarısı yok; sınırdan sonra 429', async () => {
    const [st, j] = await h.call('POST', '/api/auth/google', { idToken: 'a.b.c' });
    assert.equal(st, 503);
    assert.equal(j.error, 'Google ile giriş henüz açık değil');
    const health = await (await fetch(`${h.base}/api/health`)).json();
    assert.deepEqual(health.warnings, []);
    const more = [];
    for (let i = 0; i < 3; i++) more.push((await h.call('POST', '/api/auth/google', { idToken: 'a.b.c' }))[0]);
    assert.deepEqual(more, [503, 503, 429]);
  });
});
