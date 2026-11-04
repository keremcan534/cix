// Health warnings and error reporting (alerts.mjs, reporting.mjs) with thresholds set so low that each check
// fires, and a fake Sentry that records the envelopes the API sends.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

const envelopes = [];
const sentry = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const [head, item, event] = body.trim().split('\n').map((l) => JSON.parse(l));
    envelopes.push({ path: req.url, auth: req.headers['x-sentry-auth'], head, item, event });
    res.writeHead(200).end('{}');
  });
});
await new Promise((r) => sentry.listen(0, '127.0.0.1', r));
sentry.unref();

const h = startApi({
  SENTRY_DSN: `http://publickey@127.0.0.1:${sentry.address().port}/42`,
  SENTRY_ENVIRONMENT: 'test',
  ALERT_DISK_FREE_PCT: '101',
  ALERT_5XX_15M: '0',
  ALERT_REFUNDS_1H: '0',
  ALERT_DIAMONDS_1H: '100',
  ALERT_TEST_TOPUP_1H: '1000',
  ALERT_CACHE_S: '0',
  FINANCE_API_KEY: 'test-key',
  FINANCE_INGEST_URL: 'http://127.0.0.1:1/api/ingest/events',
  // Rounds every 0.3 s with no wait, so once there are ledger rows a round fails (no panel) and logs it.
  FINANCE_SYNC_MS: '300',
  FINANCE_SYNC_LAG_S: '0',
  ALERT_FINANCE_STALE_MIN: '0',
  FEATURES_OFF: 'dm',
});
const { call } = h;
/** Envelopes for failed requests (the console ones come from background work). */
const fromRequests = () => envelopes.filter((e) => e.event.tags?.path);
const codes = async () => {
  const [st, j] = await call('GET', '/api/health');
  assert.equal(st, 200, 'warnings never change the health status');
  return j.warnings;
};
const waitFor = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.fail('timed out');
};

describe('health warnings', () => {
  let a;
  let b;

  test('disk, and a finance sync without a recent good round', async () => {
    assert.ok(h.logs.some((l) => l.includes('error reporting on → 127.0.0.1')));
    const w = await codes();
    assert.ok(w.includes('disk_low'));
    assert.ok(w.includes('finance_sync_stale'));
    for (const c of ['errors_5xx', 'refunds_high', 'diamonds_spike', 'test_topups_high', 'finance_sync_failed']) assert.ok(!w.includes(c), c);
  });

  test('a switched-off feature is neither a server error nor reported', async () => {
    a = await h.signUp();
    b = await h.signUp();
    assert.equal((await call('POST', '/api/messages', { to: b.user.id, text: 'selam', ref: rnd(6) }, a.session))[0], 503);
    assert.ok(!(await codes()).includes('errors_5xx'));
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(fromRequests().length, 0);
  });

  test('a 5xx answer counts and goes to Sentry, without the session or the body', async () => {
    const [st] = await call('POST', '/api/wallet/purchase', { platform: 'android', productId: 'coins_1000', token: 'x'.repeat(40) }, a.session);
    assert.equal(st, 503);
    assert.ok((await codes()).includes('errors_5xx'));
    await waitFor(() => fromRequests().length === 1);
    const e = fromRequests()[0];
    assert.equal(e.path, '/api/42/envelope/');
    assert.match(e.auth, /sentry_key=publickey/);
    assert.equal(e.item.type, 'event');
    assert.equal(e.event.level, 'warning');
    assert.equal(e.event.environment, 'test');
    assert.equal(e.event.tags.path, '/api/wallet/purchase');
    assert.match(e.event.message.formatted, /Google Play/);
    const raw = JSON.stringify(e);
    assert.ok(!raw.includes(a.session) && !raw.includes(a.user.id) && !raw.includes('xxxxxxxxxx'));
    // The same failure again within 10 minutes is counted, not sent again.
    await call('POST', '/api/wallet/purchase', { platform: 'android', productId: 'coins_1000', token: 'x'.repeat(40) }, a.session);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(fromRequests().length, 1);
  });

  test('money: test top-ups, diamonds to one account, refunds, refused finance events', async () => {
    assert.equal((await call('POST', '/api/wallet/test-topup', { amount: 5000, ref: rnd(6) }, a.session))[0], 200);
    assert.equal((await call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'g4', count: 1, ref: rnd(6) }, a.session))[0], 200);
    await h.sql.query("INSERT INTO audit_events (actor, action, target, detail) VALUES ($1, 'purchase.refund', $2, '{\"purchase\": 7, \"coins\": 1000}')", [a.user.id, b.user.id]);
    await h.sql.query("INSERT INTO finance_sync_failed (key, ledger_id, event, error, next_try) VALUES ('ledger-1', 1, '{}', 'kanal yok', now() + interval '1 hour')");
    const w = await codes();
    for (const c of ['test_topups_high', 'diamonds_spike', 'refunds_high', 'finance_sync_failed']) assert.ok(w.includes(c), c);
    // The public answer is codes only: no ids, no amounts.
    const [, j] = await call('GET', '/api/health');
    assert.ok(j.warnings.every((x) => typeof x === 'string'));
    const raw = JSON.stringify(j);
    assert.ok(!raw.includes(b.user.id) && !raw.includes('5000'));
  });

  test('background errors that are only logged are reported too (console.error)', async () => {
    // With ledger rows to send, the finance sync can't reach the panel and logs it.
    await waitFor(() => envelopes.some((e) => e.event.tags?.source === 'console' && /finance sync/.test(e.event.message?.formatted)), 6000);
  });

  test('GET /api/admin/alerts has the details', async () => {
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [a.user.id]);
    const [st, j] = await call('GET', '/api/admin/alerts', null, a.session);
    assert.equal(st, 200);
    const by = Object.fromEntries(j.warnings.map((w) => [w.code, w]));
    assert.deepEqual(by.diamonds_spike.details, [{ user: b.user.id, name: b.user.name, diamonds: 200 }]);
    assert.equal(by.diamonds_spike.threshold, 100);
    assert.equal(by.test_topups_high.value, 5000);
    assert.equal(by.refunds_high.details[0].purchase, 7);
    assert.equal(by.finance_sync_failed.value, 1);
    assert.ok('lastError' in by.finance_sync_stale.details);
    assert.equal(by.errors_5xx.value, 2);
    assert.equal(j.recentFailures[0].path, '/api/wallet/purchase');
    assert.match(by.disk_low.message, /boş yer/);
  });
});
