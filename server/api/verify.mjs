// Kimlik ve yüz doğrulaması (owners, 26 Nov 2026: "yüz doğrulamaya ihtiyacımız var"; docs/YUZ_DOGRULAMA.md).
// Two checks through Didit (didit.me; our processor, EU/Ireland), each opened by the person under its own explicit
// consent (verify-rules.mjs CONSENT; KVKK m.6 and UK GDPR art. 9: face matching is biometric data):
//   - 'id': ID document + liveness + the face against the document (a Didit KYC workflow, DIDIT_KYC_WORKFLOW). For
//     taking money out: it confirms 18 or over, the document's sex against the account's gender (the cash-out rule
//     depends on it, streamer-rule.mjs), the same document on another account, and keeps the name on the document
//     for the payout's account holder (withdraw.mjs holder_matches_id). Only someone who may take money out opens one.
//   - 'face': liveness + the face against the person's profile photo (a Didit Biometric Authentication workflow fed
//     the photo as portrait_image, DIDIT_FACE_WORKFLOW). Optional: the blue badge (profileOf verified) while that
//     photo stays (users.verified_avatar).
// Only the outcome is kept (identity_checks): never an image or a face template. The provider's copy is deleted
// KEEP_DAYS after the decision, at once when consent is withdrawn or the account is deleted (the sweep). A check that
// a rule flags (verify-rules.mjs idReasons) goes to staff (review), who decide in the panel; a staff decision is never
// overridden by the provider. Without the keys (.env) a kind is off and nothing requires it.
//
//   GET  /api/verify                               → { on, id, face, verified, idVerified, consent }
//   POST /api/verify/start { kind, consent }       → { url, check }   consent: the text's version the phone showed;
//                                                      another one is a 409 consent_changed { consent }
//   POST /api/verify/refresh { kind }              → { check, verified, idVerified }   (back from the browser)
//   POST /api/verify/withdraw { kind }             → { verified, idVerified }   consent withdrawn: our result goes,
//                                                      the provider's copy is deleted
//   POST /api/verify/webhook                       Didit → us, signed (verify-rules.mjs signatureOk); we then read
//                                                      the decision from Didit's API ourselves
//   GET  /api/admin/verify?status=&user=&kind=     → { checks, labels }                     (admin, panel)
//   POST /api/admin/verify/decide { id, approve, note }       → { check }   review/declined → approved/declined (audited)
//   POST /api/admin/verify/reset { user, kind, note }         → { reset }   the person must verify again (audited)
//   POST /api/admin/verify/manual { user, docName, docSex, adult, note } → { check }   the alternative without a face
//                                                      scan (KVKK): staff checked the ID themselves (audited)
//
// An older app reads none of this; it shows `verified` on its own profile (me-view.ts) and the cash-out refusal's
// sentence (code id_required) when Canlı ayarlar require the ID check.
import crypto from 'node:crypto';

import { HttpError, auth, clientIp, db, env, int, limit, readJson, readRaw, tx, userId } from './core.mjs';
import { live } from './live-settings.mjs';
import { keyOf, readStored } from './media.mjs';
import { panelDetail } from './panel.mjs';
import { cashOutOf } from './streamer-rule.mjs';
import {
  ABANDON_HOURS,
  CONSENT,
  DAILY_TRIES,
  KEEP_DAYS,
  KINDS,
  OPEN_MINUTES,
  PRICE_USD,
  REASON_LABEL,
  STATUS_LABEL,
  docHash,
  idReasons,
  providerReady,
  readDecision,
  signatureOk,
  stateOf,
} from './verify-rules.mjs';

const API = () => String(env.DIDIT_API_URL ?? 'https://verification.didit.me').replace(/\/+$/, '');
/** Where the provider's page sends the person when done: the app's screen (expo-router), by its own scheme. */
const CALLBACK = () => env.VERIFY_CALLBACK ?? 'similarclub://kimlik-dogrulama';
/** The key of the duplicate-document mark (verify-rules.mjs docHash). */
const HASH_KEY = () => env.VERIFY_HASH_KEY || env.DIDIT_WEBHOOK_SECRET || '';
const PORTRAIT_BYTES = 2 * 1024 * 1024;
/**
 * The person as the provider knows them: a stable mark made from the account's id with our key, never the id. Stable,
 * so the provider's duplicate-face search tells two accounts apart from one person trying twice.
 */
const vendorOf = (uid) => `u-${crypto.createHmac('sha256', HASH_KEY() || 'similar-verify').update(String(uid)).digest('hex').slice(0, 32)}`;
const err = (status, message, code, extra = {}) => Object.assign(new HttpError(status, message), { extra: { code, ...extra } });
const unreachable = () => new HttpError(502, 'Doğrulama hizmetine şu an ulaşılamıyor, biraz sonra tekrar dene');
const kindOf = (v) => {
  if (!KINDS.includes(v)) throw new HttpError(400, 'Doğrulama türü id ya da face olmalı');
  return v;
};

// --- Didit ------------------------------------------------------------------------------------------------
/** One call to Didit's API with our key: its JSON answer; a 502 when it can't be reached or refuses. */
async function didit(method, path, body, headers = {}) {
  let res;
  try {
    res = await fetch(API() + path, {
      method,
      headers: { 'x-api-key': env.DIDIT_API_KEY ?? '', accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    console.error('didit unreachable', e?.cause?.code ?? e?.name);
    throw unreachable();
  }
  const raw = await res.text();
  let j = null;
  try {
    j = raw ? JSON.parse(raw) : null;
  } catch {
    // Not JSON: an error page.
  }
  if (!res.ok) {
    // The path without ids; never the answer's body (it may name the person).
    console.error('didit', method, path.replace(/[0-9a-f-]{20,}/gi, ':id'), res.status);
    throw Object.assign(unreachable(), { providerStatus: res.status });
  }
  return j && typeof j === 'object' ? j : {};
}

/** The provider's copy of a session deleted (images, document data). True once it is gone (404: already gone). */
async function deleteAtProvider(sessionId) {
  try {
    await didit('DELETE', `/v3/session/${encodeURIComponent(sessionId)}/delete/`);
    return true;
  } catch (e) {
    return e.providerStatus === 404;
  }
}

// --- Reading --------------------------------------------------------------------------------------------
/** A check as the person (and the app) see it. */
const checkView = (r) =>
  r && {
    id: Number(r.id),
    kind: r.kind,
    status: r.status,
    label: STATUS_LABEL[r.status] ?? r.status,
    at: r.created_at,
    decidedAt: r.decided_at,
    // The person may know why their own check waits (no staff names, no other account).
    reasons: (r.reasons ?? []).filter((x) => x !== 'duplicate_document' && x !== 'duplicate_face'),
    url: r.status === 'pending' ? r.session_url : null,
  };

/** The latest check of each kind for `uid`. */
async function latest(uid, q = db) {
  // A withdrawn check waiting for the provider's copy to go (the sweep) is no longer the person's.
  const r = await q.query("SELECT DISTINCT ON (kind) * FROM identity_checks WHERE user_id = $1 AND NOT 'withdrawn' = ANY(reasons) ORDER BY kind, id DESC", [uid]);
  return Object.fromEntries(KINDS.map((k) => [k, r.rows.find((x) => x.kind === k) ?? null]));
}

/** Whether `uid` has an approved ID check (the cash-out requirement, streamer-rule.mjs). */
export async function idVerified(uid, q = db) {
  return (await q.query("SELECT 1 FROM identity_checks WHERE user_id = $1 AND kind = 'id' AND status = 'approved' LIMIT 1", [uid])).rowCount > 0;
}

/** The name on `uid`'s approved document, or null (withdraw.mjs compares a payout's account holder with it). */
export async function idName(uid, q = db) {
  return (await q.query("SELECT doc_name FROM identity_checks WHERE user_id = $1 AND kind = 'id' AND status = 'approved' AND doc_name IS NOT NULL ORDER BY id DESC LIMIT 1", [uid])).rows[0]?.doc_name ?? null;
}

async function state(u) {
  const l = await latest(u.id);
  const fresh = (await db.query('SELECT avatar_url, verified_avatar FROM users WHERE id = $1', [u.id])).rows[0] ?? u;
  return {
    on: { id: providerReady(env, 'id') && live().verifyMonthlyUsd > 0, face: providerReady(env, 'face') && live().verifyMonthlyUsd > 0 },
    id: checkView(l.id),
    face: checkView(l.face),
    verified: !!fresh.verified_avatar && fresh.verified_avatar === fresh.avatar_url,
    idVerified: await idVerified(u.id),
    // Whether money out needs the ID check now (Canlı ayarlar › Kimlik doğrulama).
    payoutNeedsId: live().verifyPayout === 1 && providerReady(env, 'id'),
    consent: CONSENT,
  };
}

/**
 * Reads the provider's decision for check `row` and records what it means. A staff decision stays; the provider's
 * status is still noted. Locks the account first, then the check (the order account deletion uses).
 */
async function refresh(row) {
  if (!row?.session_id) return row;
  const d = await didit('GET', `/v3/session/${encodeURIComponent(row.session_id)}/decision/`);
  const r = readDecision(d);
  return tx(async (c) => {
    const u = (await c.query('SELECT id, gender, avatar_url, deleted_at FROM users WHERE id = $1 FOR NO KEY UPDATE', [row.user_id])).rows[0];
    const x = (await c.query('SELECT * FROM identity_checks WHERE id = $1 FOR UPDATE', [row.id])).rows[0];
    if (!u || !x) return x ?? row;
    // A withdrawn consent, a deleted account or a provider copy already deleted: nothing of the person comes back.
    if (u.deleted_at || x.provider_deleted_at || (x.reasons ?? []).includes('withdrawn')) return x;
    const provider = r.status ?? x.provider_status;
    if (x.decided_by) {
      await c.query('UPDATE identity_checks SET provider_status = $2 WHERE id = $1', [x.id, provider]);
      return { ...x, provider_status: provider };
    }
    let status = stateOf(provider);
    let reasons = [];
    const set = { doc_name: x.doc_name, doc_sex: x.doc_sex, doc_adult: x.doc_adult, doc_country: x.doc_country, doc_hash: x.doc_hash };
    if (status === 'review') reasons = ['provider_review'];
    if (x.kind === 'id' && (status === 'approved' || status === 'review')) {
      const hash = docHash(HASH_KEY(), r.country, r.docNo);
      Object.assign(set, { doc_name: r.name?.slice(0, 120) ?? null, doc_sex: r.sex, doc_adult: r.adult, doc_country: r.country, doc_hash: hash });
      const dup =
        !!hash &&
        (await c.query("SELECT 1 FROM identity_checks WHERE doc_hash = $1 AND user_id <> $2 AND status IN ('approved', 'review') LIMIT 1", [hash, x.user_id])).rowCount > 0;
      if (status === 'approved') {
        reasons = idReasons(r, u.gender, dup);
        if (reasons.length) status = 'review';
      } else {
        reasons = [...reasons, ...idReasons(r, u.gender, dup).filter((y) => y !== 'no_age' && y !== 'no_name' && y !== 'no_sex')];
      }
    }
    const done = status === 'approved' || status === 'declined' || status === 'expired';
    await c.query(
      `UPDATE identity_checks SET status = $2, provider_status = $3, reasons = $4, doc_name = $5, doc_sex = $6, doc_adult = $7, doc_country = $8,
         doc_hash = $9, decided_at = CASE WHEN $10 THEN coalesce(decided_at, now()) ELSE NULL END, session_url = CASE WHEN $2 = 'pending' THEN session_url ELSE NULL END
        WHERE id = $1`,
      [x.id, status, provider, reasons, set.doc_name, set.doc_sex, set.doc_adult, set.doc_country, set.doc_hash, done],
    );
    if (x.kind === 'face') await badge(c, u, x, status);
    return (await c.query('SELECT * FROM identity_checks WHERE id = $1', [x.id])).rows[0];
  });
}

/** The blue badge after face check `x` became `status`: on for the photo it matched (if still the photo), else off. */
async function badge(c, u, x, status) {
  if (status === 'approved' && x.avatar_url && x.avatar_url === u.avatar_url) await c.query('UPDATE users SET verified_avatar = $2 WHERE id = $1', [u.id, x.avatar_url]);
  else if (status !== 'approved') await c.query('UPDATE users SET verified_avatar = NULL WHERE id = $1 AND verified_avatar = $2', [u.id, x.avatar_url]);
}

/** Spent this month on opened sessions (USD, list prices): the Canlı ayarlar budget stops new ones past it. */
async function spentThisMonth() {
  const r = await db.query("SELECT kind, count(*)::int AS n FROM identity_checks WHERE provider = 'didit' AND created_at >= date_trunc('month', now()) GROUP BY kind");
  return r.rows.reduce((s, x) => s + (PRICE_USD[x.kind] ?? 0) * x.n, 0);
}

/** The profile photo as the provider's reference portrait: base64 of a JPEG, PNG or WebP of at most 2 MB. */
async function portraitOf(avatarUrl, uid) {
  const key = keyOf(avatarUrl, uid);
  if (!key) throw err(409, 'Önce kendi çektiğin bir profil fotoğrafı yükle; rozet o fotoğrafa verilir.', 'no_photo');
  const buf = await readStored(key, PORTRAIT_BYTES).catch((e) => {
    if (e instanceof HttpError && e.code === 400) throw err(409, 'Profil fotoğrafın en çok 2 MB olmalı; daha küçük bir fotoğraf yükleyip tekrar dene.', 'photo_too_big');
    throw e;
  });
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const png = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
  if (!jpeg && !png && !webp) throw err(409, 'Profil fotoğrafın bu doğrulama için uygun değil; JPEG ya da PNG bir fotoğraf yükleyip tekrar dene.', 'photo_type');
  return buf.toString('base64');
}

// --- The provider copy's deletion (the sweep) ---------------------------------------------------------------
let sweepTimer = null;
let sweeping = false;
/**
 * Closes sessions never finished (ABANDON_HOURS), deletes the provider's copy of checks decided more than KEEP_DAYS
 * ago (and of every check of a deleted account or a withdrawn consent: verify.mjs and social.mjs date those back),
 * and removes the rows of deleted accounts once their copy is gone. Reports how many it handled.
 */
export async function sweepChecks() {
  if (sweeping) return { closed: 0, deleted: 0 };
  sweeping = true;
  try {
    const closed = await db.query(
      `UPDATE identity_checks SET status = 'expired', decided_at = now(), session_url = NULL
        WHERE status = 'pending' AND created_at < now() - make_interval(hours => $1) RETURNING id`,
      [ABANDON_HOURS],
    );
    let deleted = 0;
    if (env.DIDIT_API_KEY) {
      const due = await db.query(
        `SELECT id, session_id FROM identity_checks
          WHERE session_id IS NOT NULL AND provider_deleted_at IS NULL AND decided_at < now() - make_interval(days => $1)
          ORDER BY decided_at LIMIT 200`,
        [KEEP_DAYS],
      );
      for (const x of due.rows) {
        if (!(await deleteAtProvider(x.session_id))) continue;
        await db.query('UPDATE identity_checks SET provider_deleted_at = now() WHERE id = $1', [x.id]);
        deleted++;
      }
    }
    // A deleted account's rows, and a withdrawn consent's leftovers, go once the provider holds nothing more (or there
    // never was a provider session).
    await db.query(
      `DELETE FROM identity_checks i USING users u
        WHERE u.id = i.user_id AND (u.deleted_at IS NOT NULL OR 'withdrawn' = ANY(i.reasons)) AND (i.session_id IS NULL OR i.provider_deleted_at IS NOT NULL)`,
    );
    return { closed: closed.rowCount, deleted };
  } finally {
    sweeping = false;
  }
}
/** The sweep soon (account deletion, a withdrawn consent): the provider's copy shouldn't wait for the next hour. */
export function sweepSoon() {
  setTimeout(() => sweepChecks().catch((e) => console.error('verify sweep', e?.message)), 1000).unref();
}
export function startVerifySweep() {
  const every = Number(env.VERIFY_SWEEP_MS ?? 3_600_000);
  if (!(every > 0)) return;
  sweepTimer = setInterval(() => sweepChecks().catch((e) => console.error('verify sweep', e?.message)), every);
  sweepTimer.unref();
}
export function stopVerifySweep() {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}

/**
 * What account deletion does to the checks, inside its transaction `c` (social.mjs eraseAccount): the document data
 * and the photo's address go at once, every check is dated back so the sweep deletes the provider's copy at once,
 * and the sweep then removes the rows.
 */
export async function eraseChecks(c, uid) {
  await c.query(
    `UPDATE identity_checks SET doc_name = NULL, doc_sex = NULL, doc_adult = NULL, doc_country = NULL, doc_hash = NULL, avatar_url = NULL,
       session_url = NULL, consent_ip = NULL, status = CASE WHEN status = 'pending' THEN 'expired' ELSE status END,
       decided_at = coalesce(decided_at, now()) - make_interval(days => $2 + 1)
      WHERE user_id = $1`,
    [uid, KEEP_DAYS],
  );
  await c.query('UPDATE users SET verified_avatar = NULL WHERE id = $1', [uid]);
}

// --- Staff ------------------------------------------------------------------------------------------------
async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}
/** A check as staff see it: the document data, the reasons in words, the provider's session (for its console). */
const staffView = (r) => ({
  id: Number(r.id),
  user: { id: r.user_id, name: r.user_name ?? null, publicNo: r.public_no === null || r.public_no === undefined ? null : String(r.public_no), gender: r.gender ?? null },
  kind: r.kind,
  status: r.status,
  label: STATUS_LABEL[r.status] ?? r.status,
  reasons: r.reasons ?? [],
  reasonLabels: (r.reasons ?? []).map((x) => REASON_LABEL[x] ?? x),
  provider: r.provider,
  providerStatus: r.provider_status,
  sessionId: r.session_id,
  doc: r.kind === 'id' ? { name: r.doc_name, sex: r.doc_sex, adult: r.doc_adult, country: r.doc_country } : null,
  avatarUrl: r.avatar_url,
  consent: { version: r.consent_version, at: r.consent_at },
  at: r.created_at,
  decidedAt: r.decided_at,
  decidedBy: r.decided_by,
  note: r.note,
  providerDeletedAt: r.provider_deleted_at,
});
const STAFF_SELECT = 'SELECT i.*, u.name AS user_name, u.public_no, u.gender FROM identity_checks i JOIN users u ON u.id = i.user_id';
const noteOf = (v) => (typeof v === 'string' ? v.trim().slice(0, 300) || null : null);
async function staffAudit(c, a, action, target, detail, req) {
  await c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, $3, $4, $5)', [a.id, action, target, JSON.stringify({ ...detail, ...panelDetail(a) }), clientIp(req)]);
}

export const verifyRoutes = {
  async 'GET /api/verify'(req) {
    return state(await auth(req));
  },

  /**
   * Opens a session with the provider (or gives back the open one) and answers its page's address; the app opens it
   * in the browser. Refused: the provider not set up or the month's budget spent (503), consent of another version
   * (409 consent_changed), an ID check for someone who may not take money out or already verified, no profile photo
   * for the face check, more than DAILY_TRIES a day.
   */
  async 'POST /api/verify/start'(req) {
    const u = await auth(req);
    const b = await readJson(req, 2048);
    const kind = kindOf(b.kind);
    limit(`verify-start:${u.id}`, 5);
    if (!providerReady(env, kind) || !(live().verifyMonthlyUsd > 0)) throw err(503, 'Doğrulama şu an kapalı; açılınca buradan yapabilirsin.', 'verify_off');
    if (b.consent !== CONSENT[kind].version) throw err(409, 'Aydınlatma metni güncellendi; yeni metni okuyup onayla.', 'consent_changed', { consent: CONSENT });
    if (kind === 'id') {
      const s = await cashOutOf(db, u.id, { id: false });
      if (!s.allowed) throw err(403, s.why, s.code);
      if (await idVerified(u.id)) throw err(409, 'Kimliğin zaten doğrulandı.', 'already');
    }
    const me = (await db.query('SELECT avatar_url, verified_avatar FROM users WHERE id = $1', [u.id])).rows[0];
    if (kind === 'face' && me.verified_avatar && me.verified_avatar === me.avatar_url) throw err(409, 'Profil fotoğrafın zaten doğrulandı.', 'already');

    // The open session, if it is recent: the same page again (a second tap, the app reopened).
    const open = (await db.query("SELECT * FROM identity_checks WHERE user_id = $1 AND kind = $2 AND status = 'pending'", [u.id, kind])).rows[0];
    if (open) {
      const age = Date.now() - new Date(open.created_at).getTime();
      // Another tap is opening it right now.
      if (!open.session_id && age < 60_000) throw err(409, 'Doğrulama zaten açılıyor, birkaç saniye bekle.', 'opening');
      const fresh = await refresh(open).catch(() => open);
      if (fresh.status === 'pending' && fresh.session_url && age < OPEN_MINUTES * 60_000 && (kind === 'id' || fresh.avatar_url === me.avatar_url)) {
        return { url: fresh.session_url, check: checkView(fresh) };
      }
      if (fresh.status === 'approved' || fresh.status === 'review') return { url: null, check: checkView(fresh) };
      // Stale (or for an older photo): closed, and the provider's unfinished session deleted, so it can't be handed
      // back for the new one.
      if (fresh.status === 'pending') {
        await db.query("UPDATE identity_checks SET status = 'expired', decided_at = now(), session_url = NULL WHERE id = $1 AND status = 'pending'", [fresh.id]);
        if (fresh.session_id && (await deleteAtProvider(fresh.session_id))) await db.query('UPDATE identity_checks SET provider_deleted_at = now() WHERE id = $1', [fresh.id]);
      }
    }
    const tries = (await db.query("SELECT count(*)::int AS n FROM identity_checks WHERE user_id = $1 AND kind = $2 AND provider = 'didit' AND created_at > now() - interval '1 day'", [u.id, kind])).rows[0].n;
    if (tries >= DAILY_TRIES) throw err(429, `Bugün ${DAILY_TRIES} kez denedin; yarın tekrar dene.`, 'tries');
    if ((await spentThisMonth()) + PRICE_USD[kind] > live().verifyMonthlyUsd) throw err(503, 'Doğrulama bu ay için doldu; birkaç gün sonra tekrar dene.', 'budget');

    const portrait = kind === 'face' ? await portraitOf(me.avatar_url, u.id) : null;
    let row;
    try {
      row = (
        await db.query('INSERT INTO identity_checks (user_id, kind, consent_version, consent_ip, avatar_url) VALUES ($1, $2, $3, $4, $5) RETURNING *', [
          u.id,
          kind,
          CONSENT[kind].version,
          clientIp(req),
          kind === 'face' ? me.avatar_url : null,
        ])
      ).rows[0];
    } catch (e) {
      // Two taps at once: the other one opened it.
      if (e?.code === '23505') throw err(409, 'Doğrulama zaten açılıyor, birkaç saniye bekle.', 'opening');
      throw e;
    }
    let s;
    try {
      s = await didit(
        'POST',
        '/v3/session/',
        {
          workflow_id: kind === 'face' ? env.DIDIT_FACE_WORKFLOW : env.DIDIT_KYC_WORKFLOW,
          vendor_data: vendorOf(u.id),
          callback: CALLBACK(),
          language: 'tr',
          ...(portrait ? { portrait_image: portrait } : {}),
        },
        { 'Idempotency-Key': `similar-check-${row.id}` },
      );
    } catch (e) {
      await db.query('DELETE FROM identity_checks WHERE id = $1', [row.id]);
      throw e;
    }
    const sid = typeof s.session_id === 'string' ? s.session_id.slice(0, 120) : null;
    const url = typeof s.url === 'string' && /^https:\/\//.test(s.url) ? s.url.slice(0, 1000) : null;
    if (!sid || !url) {
      await db.query('DELETE FROM identity_checks WHERE id = $1', [row.id]);
      console.error('didit session without id or url');
      throw unreachable();
    }
    try {
      row = (await db.query('UPDATE identity_checks SET session_id = $2, session_url = $3, provider_status = $4 WHERE id = $1 RETURNING *', [row.id, sid, url, typeof s.status === 'string' ? s.status : null])).rows[0];
    } catch (e) {
      // The provider handed back a session another check of ours already holds (its unfinished one).
      await db.query('DELETE FROM identity_checks WHERE id = $1', [row.id]);
      if (e?.code === '23505') throw err(409, 'Doğrulama zaten açılıyor, birkaç saniye bekle.', 'opening');
      throw e;
    }
    return { url, check: checkView(row) };
  },

  /** The app back from the provider's page: asks the provider now instead of waiting for the webhook. */
  async 'POST /api/verify/refresh'(req) {
    const u = await auth(req);
    const b = await readJson(req, 1024);
    const kind = kindOf(b.kind);
    limit(`verify-refresh:${u.id}`, 20);
    const row = (await db.query("SELECT * FROM identity_checks WHERE user_id = $1 AND kind = $2 AND status IN ('pending', 'review') AND decided_by IS NULL ORDER BY id DESC LIMIT 1", [u.id, kind])).rows[0];
    const done = row && providerReady(env, kind) ? await refresh(row) : null;
    const s = await state(u);
    return { check: checkView(done) ?? s[kind], verified: s.verified, idVerified: s.idVerified };
  },

  /**
   * Consent withdrawn (KVKK m.11, UK GDPR art. 7(3)): every check of that kind goes from our records (an audit row
   * says only that it happened), the badge with it, and the provider's copy is deleted at once. Money already paid
   * out keeps its own record (withdrawals).
   */
  async 'POST /api/verify/withdraw'(req) {
    const u = await auth(req);
    const b = await readJson(req, 1024);
    const kind = kindOf(b.kind);
    limit(`verify-withdraw:${u.id}`, 10);
    // The provider's copy first, outside any lock; a session it couldn't delete is retried by the sweep.
    const open = (await db.query('SELECT id, session_id FROM identity_checks WHERE user_id = $1 AND kind = $2 AND session_id IS NOT NULL AND provider_deleted_at IS NULL', [u.id, kind])).rows;
    const left = [];
    for (const x of open) {
      if (!env.DIDIT_API_KEY || !(await deleteAtProvider(x.session_id))) left.push(x.id);
    }
    await tx(async (c) => {
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR NO KEY UPDATE', [u.id]);
      // What the provider still holds keeps a row with nothing of the person's in it, for the sweep to finish.
      if (left.length) {
        await c.query(
          `UPDATE identity_checks SET status = 'expired', reasons = '{withdrawn}', doc_name = NULL, doc_sex = NULL, doc_adult = NULL, doc_country = NULL,
             doc_hash = NULL, avatar_url = NULL, session_url = NULL, consent_ip = NULL, decided_at = now() - make_interval(days => $2 + 1)
            WHERE id = ANY($1::bigint[])`,
          [left, KEEP_DAYS],
        );
        console.error('verify withdraw: provider copy not deleted yet, the sweep retries');
      }
      const r = await c.query('DELETE FROM identity_checks WHERE user_id = $1 AND kind = $2 AND NOT (id = ANY($3::bigint[])) RETURNING id', [u.id, kind, left]);
      if (kind === 'face') await c.query('UPDATE users SET verified_avatar = NULL WHERE id = $1', [u.id]);
      await c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, $3, $4, $5)', [
        u.id,
        'verify.withdraw',
        u.id,
        JSON.stringify({ kind, checks: r.rowCount + left.length, providerPending: left.length }),
        clientIp(req),
      ]);
    });
    if (left.length) sweepSoon();
    const s = await state(u);
    return { verified: s.verified, idVerified: s.idVerified };
  },

  /** Didit → us when a session changes. Only a signed call is read; the decision itself is fetched from Didit. */
  async 'POST /api/verify/webhook'(req) {
    const raw = await readRaw(req, 1_000_000);
    if (!signatureOk(raw, req.headers, env.DIDIT_WEBHOOK_SECRET)) throw new HttpError(401, 'İmza geçersiz');
    let e;
    try {
      e = JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'Geçersiz JSON');
    }
    const sid = typeof e?.session_id === 'string' ? e.session_id : null;
    const row = sid && (await db.query('SELECT * FROM identity_checks WHERE session_id = $1', [sid])).rows[0];
    // Not ours (another application on the account, a check already withdrawn): answered, so Didit doesn't retry.
    if (!row) return { ok: true };
    await refresh(row);
    return { ok: true };
  },

  async 'GET /api/admin/verify'(req, url) {
    await admin(req);
    const status = url.searchParams.get('status');
    const kind = url.searchParams.get('kind');
    const user = url.searchParams.get('user');
    const where = [];
    const args = [];
    if (status) {
      if (!STATUS_LABEL[status]) throw new HttpError(400, 'Geçersiz durum');
      args.push(status);
      where.push(`i.status = $${args.length}`);
    }
    if (kind) {
      args.push(kindOf(kind));
      where.push(`i.kind = $${args.length}`);
    }
    if (user) {
      args.push(userId(user, 'kişi'));
      where.push(`i.user_id = $${args.length}`);
    }
    const r = await db.query(`${STAFF_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY i.id DESC LIMIT 200`, args);
    return { checks: r.rows.map(staffView), labels: { status: STATUS_LABEL, reason: REASON_LABEL } };
  },

  /** Staff decide a check in review (or approve a declined one after an appeal). Audited with before and after. */
  async 'POST /api/admin/verify/decide'(req) {
    const a = await admin(req);
    const b = await readJson(req, 2048);
    const id = int(b.id, 1, Number.MAX_SAFE_INTEGER);
    if (!id) throw new HttpError(400, 'Geçersiz doğrulama');
    if (typeof b.approve !== 'boolean') throw new HttpError(400, 'approve true ya da false olmalı');
    const note = noteOf(b.note);
    const row = await tx(async (c) => {
      const owner = (await c.query('SELECT user_id FROM identity_checks WHERE id = $1', [id])).rows[0];
      if (!owner) throw new HttpError(404, 'Doğrulama bulunamadı');
      const u = (await c.query('SELECT id, avatar_url FROM users WHERE id = $1 FOR NO KEY UPDATE', [owner.user_id])).rows[0];
      const x = (await c.query('SELECT * FROM identity_checks WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!['review', 'declined', 'approved'].includes(x.status)) throw new HttpError(409, 'Bu doğrulama henüz tamamlanmadı');
      const status = b.approve ? 'approved' : 'declined';
      const y = (
        await c.query('UPDATE identity_checks SET status = $2, decided_by = $3, decided_at = now(), note = $4 WHERE id = $1 RETURNING *', [id, status, a.id, note])
      ).rows[0];
      if (x.kind === 'face') await badge(c, u, y, status);
      await staffAudit(c, a, 'verify.decide', x.user_id, { check: id, kind: x.kind, note, before: { status: x.status, reasons: x.reasons }, after: { status } }, req);
      return y;
    });
    return { check: staffView({ ...row }) };
  },

  /** The person must verify again (a stolen photo found later, a mistake): the check is declined; audited. */
  async 'POST /api/admin/verify/reset'(req) {
    const a = await admin(req);
    const b = await readJson(req, 2048);
    const uid = userId(b.user, 'kişi');
    const kind = kindOf(b.kind);
    const note = noteOf(b.note);
    const reset = await tx(async (c) => {
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR NO KEY UPDATE', [uid]);
      const r = await c.query(
        `UPDATE identity_checks SET status = 'declined', reasons = array_append(reasons, 'staff_reset'), decided_by = $3, decided_at = now(), note = $4
          WHERE user_id = $1 AND kind = $2 AND status IN ('approved', 'review', 'pending') RETURNING id, status`,
        [uid, kind, a.id, note],
      );
      if (kind === 'face') await c.query('UPDATE users SET verified_avatar = NULL WHERE id = $1', [uid]);
      await staffAudit(c, a, 'verify.reset', uid, { kind, note, checks: r.rows.map((x) => Number(x.id)), before: { open: r.rowCount }, after: { status: 'declined' } }, req);
      return r.rowCount;
    });
    return { reset };
  },

  /**
   * The alternative to a face scan (KVKK: whoever doesn't consent must have another way, without a penalty): staff
   * checked the person's ID themselves (in a video call, at the office) and record it as an approved ID check.
   */
  async 'POST /api/admin/verify/manual'(req) {
    const a = await admin(req);
    const b = await readJson(req, 2048);
    const uid = userId(b.user, 'kişi');
    const docName = typeof b.docName === 'string' ? b.docName.trim().slice(0, 120) : '';
    if (docName.length < 3) throw new HttpError(400, 'Kimlikteki ad soyad gerekli');
    if (!['F', 'M'].includes(b.docSex)) throw new HttpError(400, 'Kimlikteki cinsiyet F ya da M olmalı');
    if (b.adult !== true) throw new HttpError(400, '18 yaşından küçük biri doğrulanamaz');
    const note = noteOf(b.note);
    if (!note) throw new HttpError(400, 'Nasıl doğrulandığını not olarak yaz');
    const row = await tx(async (c) => {
      const u = (await c.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL FOR NO KEY UPDATE', [uid])).rows[0];
      if (!u) throw new HttpError(404, 'Kullanıcı bulunamadı');
      await c.query("UPDATE identity_checks SET status = 'expired', decided_at = now(), session_url = NULL WHERE user_id = $1 AND kind = 'id' AND status = 'pending'", [uid]);
      const y = (
        await c.query(
          `INSERT INTO identity_checks (user_id, kind, status, provider, consent_version, doc_name, doc_sex, doc_adult, decided_at, decided_by, note)
           VALUES ($1, 'id', 'approved', 'manual', 'manual', $2, $3, true, now(), $4, $5) RETURNING *`,
          [uid, docName, b.docSex, a.id, note],
        )
      ).rows[0];
      await staffAudit(c, a, 'verify.manual', uid, { check: Number(y.id), note, before: null, after: { status: 'approved', docSex: b.docSex } }, req);
      return y;
    });
    return { check: staffView(row) };
  },
};
