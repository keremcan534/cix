// Alarms behind /api/health (docs/SUNUCU.md, "Hata izleme ve acil durum"). The uptime check (uptime.yml) fails,
// and GitHub e-mails, when the health answer carries any warning code. The public answer has the codes only;
// GET /api/admin/alerts (admin) has the details: who, how much, since when.
//
//   disk_low            free space on / under ALERT_DISK_FREE_PCT % (15)
//   errors_5xx          more than ALERT_5XX_15M server errors (5xx) in the last 15 minutes (20)
//   finance_sync_stale  FINANCE_API_KEY is set but the last good round is older than 15 minutes (or never)
//   finance_sync_failed events the finance panel refused are waiting (finance_sync_failed)
//   refunds_high        more than ALERT_REFUNDS_1H store refunds in the last hour (3)
//   diamonds_spike      one account received more than ALERT_DIAMONDS_1H diamonds in the last hour (500.000)
//   test_topups_high    more than ALERT_TEST_TOPUP_1H coins of test top-ups in the last hour (500.000)
//   mail_quota_high     today's e-mail codes passed ALERT_MAIL_QUOTA_PCT % (80) of the free daily quota of the mail
//                       providers (mail.mjs); at 100 % e-mail sign-in stops until midnight UTC
//   mail_failing        the last 10 e-mail codes could not be sent by any provider
//   alerts_error        the checks themselves failed (see the API log)
//
// The checks read the last hour of the ledger, so the public answer is computed at most once a minute
// (ALERT_CACHE_S): the health endpoint has no rate limit.
import fs from 'node:fs';

import { HttpError, auth, db, env } from './core.mjs';
import { MAIL_DAILY, mailFailing, mailProviders } from './mail.mjs';
import { lastFailures, recent5xx } from './reporting.mjs';

const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
const T = {
  diskFreePct: num(env.ALERT_DISK_FREE_PCT, 15),
  errors15m: num(env.ALERT_5XX_15M, 20),
  financeStaleMin: num(env.ALERT_FINANCE_STALE_MIN, 15),
  refunds1h: num(env.ALERT_REFUNDS_1H, 3),
  diamonds1h: num(env.ALERT_DIAMONDS_1H, 500_000),
  testTopup1h: num(env.ALERT_TEST_TOPUP_1H, 500_000),
  mailQuotaPct: num(env.ALERT_MAIL_QUOTA_PCT, 80),
};
const CACHE_MS = num(env.ALERT_CACHE_S, 60) * 1000;
const FINANCE_ON = !!env.FINANCE_API_KEY;

/** Every check, with its details. Each warning: { code, message (Turkish), value, threshold, details? }. */
export async function checkAll() {
  const out = [];
  const add = (code, message, value, threshold, details) => out.push({ code, message, value, threshold, ...(details ? { details } : {}) });

  try {
    const s = fs.statfsSync('/');
    const pct = Math.round((Number(s.bavail) / Number(s.blocks)) * 1000) / 10;
    if (pct < T.diskFreePct) add('disk_low', `Diskte %${pct} boş yer kaldı`, pct, T.diskFreePct);
  } catch (e) {
    add('alerts_error', `Disk okunamadı: ${e.message}`, null, null);
  }

  const errors = recent5xx(15 * 60_000);
  if (errors > T.errors15m) add('errors_5xx', `Son 15 dakikada ${errors} sunucu hatası`, errors, T.errors15m, lastFailures(10));

  if (FINANCE_ON) {
    const s = (await db.query('SELECT last_ok_at, last_error, now() - last_ok_at > make_interval(mins => $1) AS stale FROM finance_sync WHERE id = 1', [T.financeStaleMin])).rows[0];
    if (!s?.last_ok_at || s.stale)
      add('finance_sync_stale', 'Finans paneline aktarım durdu', s?.last_ok_at ?? null, T.financeStaleMin, { lastOkAt: s?.last_ok_at ?? null, lastError: s?.last_error ?? null });
  }
  const failed = Number((await db.query('SELECT count(*) AS n FROM finance_sync_failed')).rows[0].n);
  if (failed > 0) add('finance_sync_failed', `Finans panelinin reddettiği ${failed} olay bekliyor`, failed, 0);

  const refunds = (await db.query("SELECT target, detail, created_at FROM audit_events WHERE action = 'purchase.refund' AND created_at > now() - interval '1 hour' ORDER BY id DESC")).rows;
  if (refunds.length > T.refunds1h)
    add(
      'refunds_high',
      `Son 1 saatte ${refunds.length} mağaza iadesi`,
      refunds.length,
      T.refunds1h,
      refunds.slice(0, 20).map((r) => ({ user: r.target, purchase: r.detail?.purchase ?? null, coins: r.detail?.coins ?? null, at: r.created_at })),
    );

  const top = (
    await db.query(
      `SELECT l.user_id, u.name, sum(l.amount) AS n FROM ledger l JOIN users u ON u.id = l.user_id
        WHERE l.currency = 'diamond' AND l.amount > 0 AND l.created_at > now() - interval '1 hour'
        GROUP BY l.user_id, u.name HAVING sum(l.amount) > $1 ORDER BY n DESC LIMIT 10`,
      [T.diamonds1h],
    )
  ).rows;
  if (top.length)
    add(
      'diamonds_spike',
      `Bir hesap son 1 saatte ${Number(top[0].n).toLocaleString('tr-TR')} elmas aldı`,
      Number(top[0].n),
      T.diamonds1h,
      top.map((r) => ({ user: r.user_id, name: r.name, diamonds: Number(r.n) })),
    );

  const tests = (
    await db.query(
      `SELECT l.user_id, sum(l.amount) AS n FROM ledger l
        WHERE l.currency = 'coin' AND l.amount > 0 AND l.channel = 'test' AND l.created_at > now() - interval '1 hour'
        GROUP BY l.user_id ORDER BY n DESC`,
    )
  ).rows;
  const testTotal = tests.reduce((a, r) => a + Number(r.n), 0);
  if (testTotal > T.testTopup1h)
    add(
      'test_topups_high',
      `Son 1 saatte ${testTotal.toLocaleString('tr-TR')} test jetonu yüklendi`,
      testTotal,
      T.testTopup1h,
      tests.slice(0, 10).map((r) => ({ user: r.user_id, coins: Number(r.n) })),
    );

  // The providers with a daily cap ('log' has none); together they are the day's e-mail codes.
  const capped = mailProviders.filter((p) => MAIL_DAILY[p]);
  if (capped.length) {
    const rows = (await db.query("SELECT provider, sent FROM mail_quota WHERE day = (now() AT TIME ZONE 'UTC')::date AND provider = ANY($1::text[])", [capped])).rows;
    const sent = rows.reduce((a, r) => a + r.sent, 0);
    const cap = capped.reduce((a, p) => a + MAIL_DAILY[p], 0);
    const pct = Math.round((sent / cap) * 1000) / 10;
    if (pct > T.mailQuotaPct)
      add('mail_quota_high', `Bugünkü ücretsiz e-posta kotasının %${pct} kullanıldı (${sent}/${cap})`, pct, T.mailQuotaPct, Object.fromEntries(capped.map((p) => [p, { sent: rows.find((r) => r.provider === p)?.sent ?? 0, cap: MAIL_DAILY[p] }])));
  }
  if (mailFailing()) add('mail_failing', 'Son 10 e-posta kodu hiçbir sağlayıcıyla gönderilemedi', 10, 10);
  return out;
}

let cached = { at: 0, codes: [] };
let running = null;

/** The warning codes for the public health answer (no ids, no amounts), reused for ALERT_CACHE_S. */
export async function warningCodes() {
  if (Date.now() - cached.at < CACHE_MS) return cached.codes;
  running ??= checkAll()
    .then((w) => [...new Set(w.map((x) => x.code))])
    .catch((e) => {
      console.error('health checks failed', e.message);
      return ['alerts_error'];
    })
    .then((codes) => ((cached = { at: Date.now(), codes }), codes))
    .finally(() => (running = null));
  return running;
}

export const alertRoutes = {
  async 'GET /api/admin/alerts'(req) {
    const u = await auth(req);
    if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
    return { warnings: await checkAll(), thresholds: T, financeSync: FINANCE_ON, recentFailures: lastFailures(20) };
  },
};
