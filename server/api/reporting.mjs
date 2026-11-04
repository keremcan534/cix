// Error reporting to Sentry (or anything that speaks its envelope protocol), without a dependency: one small
// fetch per event. Off unless SENTRY_DSN is set (docs/SUNUCU.md, "Hata izleme ve acil durum").
//
//  - the request handler hands every failed request to failed(): 5xx answers are counted for the health
//    warnings (alerts.mjs) and sent; 4xx and switched-off features (features.mjs) are neither.
//  - console.error is wrapped, so the background work that only logs (finance sync, push, store consume,
//    unhandled rejections, a lost Postgres connection) is sent too, without touching those files.
//  - an uncaught exception is sent before the process exits as it did before (Docker restarts it).
//
// Never sent: request bodies, query strings, headers, user ids. Phone-number-like digit runs in messages are
// masked. Each distinct error is sent at most once per 10 minutes (later copies are counted into the next
// one), and at most 60 events an hour in all, so a loop can't flood the account.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';

const env = process.env;
const RELEASE = (() => {
  try {
    return fs.readFileSync(new URL('./version.txt', import.meta.url), 'utf8').trim() || 'dev';
  } catch {
    return 'dev';
  }
})();
const ENVIRONMENT = env.SENTRY_ENVIRONMENT || 'production';
const REPEAT_MS = 10 * 60_000;
const HOURLY_MAX = 60;

/** { url, key } of the envelope endpoint, or null when the DSN is empty or malformed. */
export function parseDsn(dsn) {
  try {
    const u = new URL(String(dsn ?? '').trim());
    const id = u.pathname.split('/').filter(Boolean).pop();
    if (!u.username || !id || !/^\d+$/.test(id)) return null;
    const prefix = u.pathname.slice(0, u.pathname.lastIndexOf(`/${id}`));
    return { url: `${u.protocol}//${u.host}${prefix}/api/${id}/envelope/`, key: u.username, dsn: `${u.protocol}//${u.username}@${u.host}${prefix}/${id}` };
  } catch {
    return null;
  }
}

const TARGET = parseDsn(env.SENTRY_DSN);
export const reportingOn = () => !!TARGET;

/** Masks digit runs that could be a phone number (10+ digits, spaces and dashes allowed). */
export const scrub = (s) => String(s ?? '').replace(/\+?\d(?:[\s-]?\d){9,}/g, '[numara]').slice(0, 2000);

/** Stack frames in Sentry's order (oldest call first). */
export function framesOf(stack) {
  const frames = [];
  for (const line of String(stack ?? '').split('\n').slice(1)) {
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    if (!m) continue;
    const file = m[2].replace(/^file:\/\//, '');
    frames.push({ function: m[1] ?? '?', filename: file, lineno: Number(m[3]), colno: Number(m[4]), in_app: !file.includes('node_modules') && !file.startsWith('node:') });
  }
  return frames.reverse();
}

/** The Sentry event for an error or a message. */
export function eventOf({ error, message, level = 'error', tags = {}, extra = {} }) {
  const ev = {
    event_id: crypto.randomUUID().replaceAll('-', ''),
    timestamp: Date.now() / 1000,
    platform: 'node',
    logger: 'api',
    level,
    release: RELEASE,
    environment: ENVIRONMENT,
    server_name: os.hostname(),
    tags,
    extra,
  };
  if (error instanceof Error) {
    ev.exception = { values: [{ type: error.name || 'Error', value: scrub(error.message), stacktrace: { frames: framesOf(error.stack) } }] };
    if (error.code) ev.tags = { ...ev.tags, code: String(error.code).slice(0, 32) };
  } else ev.message = { formatted: scrub(message ?? String(error)) };
  return ev;
}

// --- Sending, with the repeat and hourly limits ----------------------------------------------------------------
const seen = new Map();
let hour = { start: Date.now(), n: 0 };
const pending = new Set();

function send(ev, fingerprint) {
  if (!TARGET) return;
  const now = Date.now();
  const s = seen.get(fingerprint);
  if (s && now < s.until) return void s.repeats++;
  if (now - hour.start > 3_600_000) hour = { start: now, n: 0 };
  if (hour.n >= HOURLY_MAX) return;
  hour.n++;
  if (s?.repeats) ev.extra = { ...ev.extra, repeatsSinceLast: s.repeats };
  seen.set(fingerprint, { until: now + REPEAT_MS, repeats: 0 });
  if (seen.size > 500) seen.delete(seen.keys().next().value);
  const body = `${JSON.stringify({ event_id: ev.event_id, sent_at: new Date().toISOString(), dsn: TARGET.dsn })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(ev)}\n`;
  const p = fetch(TARGET.url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-sentry-envelope', 'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${TARGET.key}, sentry_client=similar-api/1.0` },
    body,
    signal: AbortSignal.timeout(5_000),
  })
    .then((r) => r.body?.cancel())
    .catch(() => {})
    .finally(() => pending.delete(p));
  pending.add(p);
}

/** Waits (at most `ms`) for the events on their way. */
export const flush = (ms = 2_000) => Promise.race([Promise.allSettled([...pending]), new Promise((r) => setTimeout(r, ms).unref())]);

const reported = new WeakSet();

/** Sends an error (with what it was doing, e.g. { method, path }). */
export function reportError(error, tags = {}, extra = {}) {
  if (error && typeof error === 'object') reported.add(error);
  const ev = eventOf({ error, tags, extra });
  send(ev, `${tags.path ?? ''}|${error?.name}|${String(error?.message ?? error).slice(0, 120)}`);
}

/** Sends a message without a stack (level: error | warning | info). */
export function reportMessage(message, level = 'error', tags = {}, extra = {}) {
  send(eventOf({ message, level, tags, extra }), `${tags.path ?? ''}|${String(message).slice(0, 120)}`);
}

// --- The request handler's failures: 5xx counted and reported ---------------------------------------------------
const fails = [];
const KEEP_MS = 60 * 60_000;

/**
 * A failed request. 4xx (the caller's mistake) and a switched-off feature are ignored; any other 5xx is counted
 * (alerts.mjs) and reported. An HttpError 5xx (e.g. "store not configured") goes as a warning message, any other
 * error as an exception.
 */
export function failed(e, method, path) {
  const status = typeof e?.code === 'number' ? e.code : 500;
  if (status < 500 || e?.feature) return;
  const now = Date.now();
  fails.push({ at: now, method, path, status, message: scrub(e?.message ?? String(e)).slice(0, 200) });
  while (fails.length && (fails[0].at < now - KEEP_MS || fails.length > 1000)) fails.shift();
  if (typeof e?.code === 'number') reportMessage(`${status} ${method} ${path}: ${e.message}`, 'warning', { method, path, status: String(status) });
  else reportError(e, { method, path, status: '500' });
}

/** How many 5xx answers in the last `ms`. */
export const recent5xx = (ms) => fails.filter((f) => f.at >= Date.now() - ms).length;
/** The last few 5xx answers (newest first) for the admin view. */
export const lastFailures = (n = 20) =>
  fails
    .slice(-n)
    .reverse()
    .map((f) => ({ ...f, at: new Date(f.at).toISOString() }));

// --- console.error and uncaught exceptions --------------------------------------------------------------------
if (TARGET) {
  const original = console.error.bind(console);
  console.error = (...args) => {
    original(...args);
    try {
      const error = args.find((a) => a instanceof Error);
      if (error && reported.has(error)) return;
      const text = args
        .filter((a) => !(a instanceof Error))
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ')
        .slice(0, 500);
      if (error) reportError(error, { source: 'console' }, text ? { log: scrub(text) } : {});
      else reportMessage(text, 'error', { source: 'console' });
    } catch {
      // Reporting must never break logging.
    }
  };
  process.on('uncaughtException', (e) => {
    console.error('uncaught exception', e);
    // As before: the process ends and Docker restarts it, once the report had its chance to leave.
    void flush(2_000).finally(() => process.exit(1));
  });
  console.log(`error reporting on → ${new URL(TARGET.url).host}`);
}
