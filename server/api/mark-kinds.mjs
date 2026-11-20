// Muzip hediyeler: the kinds of profile mark as data (docs/PROFIL_IZLERI.md, migration 105). A kind is the word a gift
// that leaves a mark and the gifts that clean it share (custom_gifts mark_kind: kaka, kirik-cam, …); its row says how
// phones draw it, so a new joke pair (Çamur Bombası → Köpük Banyosu) needs no app update: staff make the kind, upload
// its overlay picture and make the two gifts in the panel (docs/HEDIYE_YONETIMI.md).
//
//   GET  /api/admin/mark-kinds                                                   → { kinds, limits, on, hours }
//   POST /api/admin/mark-kinds        { kind, name, art?, minutes?, stack?, enabled? } → { kind }
//   POST /api/admin/mark-kinds/update { kind, …any of name, art (null: off), minutes (null: Canlı ayar), stack, enabled } → { kind }
//   POST /api/admin/mark-kinds/delete { kind }                                   → { deleted }  (refused while a gift uses it)
//
// A kind: `name` (1–24 letters: Kaka İzi, Kırık Cam), `art` the overlay drawn over the photo (an uploaded media.mjs
// markart, checked here: a still square PNG or WebP, real transparency, the face left open, profile-mark-rules.mjs
// markArtProblem with tools/mark-art-check.py; made at most 512 px / 300 KB for phones; null: the app's own compiled
// picture where it has one, else the gift's badge), `minutes` its mark's time when the gift says none (null: Canlı
// ayarlar › Profil izleri), `stack` how the record keeps the same kind again (either way the newest sender's mark
// shows, never ending sooner than the one before: refresh, the default, ends the old row; replace sets it aside as
// 'replaced'), `enabled` (false: its gifts are plain gifts and its marks don't show, an instant stop for one kind).
// One mark at a time: while one shows, a gift of another kind leaves none (a plain gift; profile-marks.mjs markGift).
// An overlay is one kind's own: a picture another kind uses is refused (taking it off one would take it off both).
//
// What phones get: GET /api/catalog?marks=2 `marks.kinds` (kindsCatalog: the enabled ones, art only once checked, with
// its version), and markKindsRev() is part of the catalog's and /api/config's `v`. An app before kinds (marks=1, G7)
// never reads them: it draws its compiled Kaka İzi and the gift's badge for any other kind.
//
// Admins only; every change is an audit_events row (before, after, the panel user, from where). Kept in memory
// (refreshMarkKinds after every change here, and every MARK_KINDS_POLL_MS for another process's).
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { HttpError, auth, clientIp, db, env, limit, readJson, tx } from './core.mjs';
import { allGifts, fitPicture, imageInfo } from './custom-gifts.mjs';
import { live } from './live-settings.mjs';
import { keyOf, kindMax, readStored, removeFiles, verifyUpload } from './media.mjs';
import { panelDetail } from './panel.mjs';
import { KIND, MARK_ART, MINUTES, markArtProblem } from './profile-mark-rules.mjs';

const positive = (v, d) => {
  const n = Number(v ?? d);
  return Number.isSafeInteger(n) && n > 0 ? n : d;
};
const POLL_MS = positive(env.MARK_KINDS_POLL_MS ?? env.CUSTOM_GIFTS_POLL_MS, 5000);
const PYTHON = env.PYTHON || 'python3';
const CHECK_TOOL = path.join(import.meta.dirname, 'tools', 'mark-art-check.py');
export const STACKS = ['refresh', 'replace'];
const NAME_MAX = 24;

// --- The table in memory ---------------------------------------------------------------------------------------
/** rev: the largest mark_kinds.rev; rows: kind → the row as stored (deleted ones too, for history). */
let snap = { rev: 0, rows: new Map() };

const viewOf = (r) =>
  Object.freeze({
    kind: r.kind,
    name: r.name,
    art: r.art_url ? Object.freeze({ url: r.art_url, v: r.art_v, px: r.art_px ?? null, bytes: r.art_bytes ?? null, checked: r.art_checked === true, stats: r.art_stats ?? null }) : null,
    minutes: r.minutes ?? null,
    stack: STACKS.includes(r.stack) ? r.stack : 'refresh',
    enabled: r.enabled !== false,
    deleted: !!r.deleted_at,
    rev: Number(r.rev),
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
    updatedBy: r.updated_by ?? null,
  });

/** Reads the table again (never back to an older copy). */
export async function refreshMarkKinds(q = db) {
  const r = await q.query('SELECT * FROM mark_kinds ORDER BY created_at, kind');
  const rev = r.rows.reduce((m, x) => Math.max(m, Number(x.rev)), 0);
  if (rev >= snap.rev) snap = { rev, rows: new Map(r.rows.map((x) => [x.kind, viewOf(x)])) };
  return snap;
}

let timer = null;
/** Picks up another process's changes. */
export function startMarkKinds() {
  if (timer) return;
  let busy = false;
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await db.query('SELECT coalesce(max(rev), 0) AS rev FROM mark_kinds');
      if (Number(r.rows[0].rev) !== snap.rev) await refreshMarkKinds();
    } catch (e) {
      console.error('mark kinds sync failed', String(e?.message ?? e).slice(0, 200));
    } finally {
      busy = false;
    }
  }, POLL_MS);
  timer.unref();
}
export function stopMarkKinds() {
  clearInterval(timer);
  timer = null;
}

/** Added to the catalog's and /api/config's `v`: grows with every change here (the seeds are 0, so a deploy moves nothing). */
export const markKindsRev = () => snap.rev;

/** A kind that isn't deleted, as stored; undefined for none. */
export const markKindOf = (kind) => {
  const k = typeof kind === 'string' ? snap.rows.get(kind) : undefined;
  return k && !k.deleted ? k : undefined;
};
/**
 * Whether marks of `kind` are left and shown: its row is enabled. A kind with no row at all (a gift saved before 105
 * named a word nobody made: the migration made one for each, so only a database edit) works as before; a deleted one
 * doesn't.
 */
export function markKindOn(kind) {
  const k = typeof kind === 'string' ? snap.rows.get(kind) : undefined;
  return k ? k.enabled && !k.deleted : true;
}

/**
 * GET /api/catalog?marks=2 `marks.kinds`: every enabled kind, { name, stack, minutes? (when it has its own), art?
 * ({ url, v, px }: only once the server checked it) }. A phone draws a kind missing here as it drew before: the app's
 * compiled picture, else the gift's badge.
 */
export function kindsCatalog() {
  const out = {};
  for (const k of snap.rows.values()) {
    if (k.deleted || !k.enabled) continue;
    out[k.kind] = {
      name: k.name,
      stack: k.stack,
      ...(k.minutes ? { minutes: k.minutes } : {}),
      ...(k.art?.checked ? { art: { url: k.art.url, v: k.art.v, ...(k.art.px ? { px: k.art.px } : {}) } } : {}),
    };
  }
  return out;
}

// --- The overlay picture (tools/mark-art-check.py) -----------------------------------------------------------------
/**
 * The environment the tool runs in: where programs are and UTF-8, nothing of the API's own (its database password and
 * keys never reach a program that reads files the admins uploaded).
 */
const PYTHON_ENV = Object.freeze({ PATH: env.PATH || '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', PYTHONIOENCODING: 'utf-8' });
function python(args, timeout) {
  return new Promise((resolve) => {
    let child;
    try {
      child = execFile(PYTHON, args, { env: PYTHON_ENV, timeout, killSignal: 'SIGKILL', maxBuffer: 64 * 1024, windowsHide: true }, (e, out, err) =>
        resolve({ code: !e ? 0 : typeof e.code === 'number' && !e.killed ? e.code : -1, out: String(out ?? ''), err: String(err || e?.message || '') }),
      );
    } catch (e) {
      return resolve({ code: -1, out: '', err: String(e?.message ?? e) });
    }
    // Checking gives way to the API's own work.
    if (child.pid) {
      try {
        os.setPriority(child.pid, 10);
      } catch {}
    }
  });
}

/** What the tool measured of `buf`: { width, height, frames, clear, face }; a 400 for a file it can't read, a 503 when it can't run here. */
async function measureArt(buf) {
  let dir = null;
  try {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mark-art-'));
    const file = path.join(dir, 'picture');
    await fs.promises.writeFile(file, buf);
    const r = await python(['-I', CHECK_TOOL, file, '--face', String(MARK_ART.faceRadius)], 60_000);
    if (r.code === 3) throw new HttpError(400, 'İz resmi okunamadı: bozuk ya da yarım bir PNG veya WebP');
    let j = null;
    try {
      j = r.code === 0 ? JSON.parse(r.out) : null;
    } catch {}
    if (!j || !['clear', 'face', 'frames'].every((k) => Number.isFinite(j[k]))) {
      console.error('mark art check', r.code, r.err.slice(-300));
      throw new HttpError(503, 'Sunucu iz resmini şu an denetleyemiyor; biraz sonra yeniden deneyin');
    }
    return j;
  } finally {
    if (dir) fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * The overlay at `url` (uploaded as media.mjs markart), checked and made ready for phones: { url (the one to keep: a
 * smaller copy when the upload is over 512 px or 300 KB), upload (the upload it replaced, to remove once saved; null:
 * kept as uploaded), px, bytes, stats: { clear, face }, checked }. A Turkish 400 when it can't be used. A stand-in
 * storage (most tests: UPLOAD_VERIFY 0) has nothing to read: kept unchecked, and phones don't get it.
 */
export async function checkMarkArt(url) {
  const key = typeof url === 'string' ? keyOf(url) : null;
  if (!key?.startsWith('markart/')) throw new HttpError(400, 'İz resmini önce yükleyin');
  await verifyUpload(url, 'markart');
  if (env.UPLOAD_VERIFY === '0') return { url, upload: null, px: null, bytes: null, stats: null, checked: false };
  const buf = await readStored(key, kindMax('markart'));
  const info = imageInfo(buf);
  const early = markArtProblem(info, null);
  if (early) throw new HttpError(400, early);
  const m = await measureArt(buf);
  const problem = markArtProblem(info, m);
  if (problem) throw new HttpError(400, problem);
  const stats = { clear: Math.round(m.clear * 1000) / 1000, face: Math.round(m.face * 1000) / 1000 };
  if (buf.length <= MARK_ART.serveBytes && info.width <= MARK_ART.servePx) return { url, upload: null, px: info.width, bytes: buf.length, stats, checked: true };
  const small = await fitPicture(buf, key, { maxPx: MARK_ART.servePx, maxBytes: MARK_ART.serveBytes, what: 'İz resmi', size: `${info.width} × ${info.height}` });
  const out = await readStored(keyOf(small), MARK_ART.serveBytes);
  return { url: small, upload: url, px: imageInfo(out)?.width ?? Math.min(info.width, MARK_ART.servePx), bytes: out.length, stats, checked: true };
}

// --- The panel's routes -----------------------------------------------------------------------------------------
async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}
const writeLimit = (a) => limit(`mark-kinds-admin:${a.id}`, 60, 'Çok fazla deneme, biraz bekle');
const audited = (c, actor, action, detail, ip = '') =>
  c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, NULL, $3, $4)', [actor, action, JSON.stringify(detail), ip]);

const kindIn = (v) => {
  const k = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!KIND.test(k)) throw new HttpError(400, 'Tür anahtarı küçük harf, rakam ve tireyle kısa bir kelime olmalı (ör. kirik-cam, camur); boşluk ve alt çizgi olmaz');
  return k;
};
function nameIn(v) {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  // eslint-disable-next-line no-control-regex
  if (!s || s.length > NAME_MAX || /[\u0000-\u001f\u007f<>]/.test(s)) throw new HttpError(400, `İzin adı 1–${NAME_MAX} harf olmalı (ör. Kırık Cam)`);
  return s;
}
function minutesIn(v) {
  if (v === null) return null;
  if (!Number.isInteger(v) || v < MINUTES.min || v > MINUTES.max) throw new HttpError(400, `Süre ${MINUTES.min}–${MINUTES.max.toLocaleString('tr-TR')} dakika arasında bir tam sayı olmalı (boş: Canlı ayarlardaki süre)`);
  return v;
}
function stackIn(v) {
  if (!STACKS.includes(v)) throw new HttpError(400, 'Aynı iz yeniden gelince: "refresh" (eski kayıt süresi bitti olur) ya da "replace" (eski kayıt yerine geçti olur) olmalı');
  return v;
}
function enabledIn(v) {
  if (typeof v !== 'boolean') throw new HttpError(400, 'Açık ya da kapalı olmalı');
  return v;
}

/** Refuses an overlay (`url`) another kind that isn't deleted already uses: removing it from one would take it from both. */
async function artFree(url, kind) {
  const key = typeof url === 'string' ? keyOf(url) : null;
  if (!key) return;
  const r = await db.query('SELECT kind, name, art_url FROM mark_kinds WHERE art_url IS NOT NULL AND deleted_at IS NULL AND kind <> $1', [kind]);
  const other = r.rows.find((k) => keyOf(k.art_url) === key);
  if (other) throw new HttpError(400, `Bu resim "${other.name}" türünde kullanılıyor; her tür için ayrı bir resim yükleyin`);
}
/** The overlay `url` checked (checkMarkArt) once no other kind uses it. */
const artFor = async (url, kind) => {
  await artFree(url, kind);
  return checkMarkArt(url);
};
/** A save that failed after the overlay was made smaller: the upload and its copy go (nothing points at either). */
const dropArt = (art) => art?.upload && removeFiles([art.upload, art.url]);

/** The gifts that leave or clean `kind` now (custom-gifts.mjs allGifts: the admins' and the app's own as changed). */
const giftsOf = (kind) =>
  allGifts()
    .filter((g) => g.mark && (g.mark.role === 'leave' || g.mark.role === 'clean') && g.mark.kind === kind)
    .map((g) => ({ id: g.id, name: g.name, role: g.mark.role, ...(g.mark.role === 'leave' ? { minutes: g.mark.minutes ?? null } : {}), enabled: g.enabled }));

/** A kind as the panel shows it: what phones draw, the gifts that use it, and how many marks of it show now. */
const staffKind = (k, showing = 0) => ({
  kind: k.kind,
  name: k.name,
  art: k.art ? { url: k.art.url, v: k.art.v, px: k.art.px, bytes: k.art.bytes, checked: k.art.checked, stats: k.art.stats } : null,
  minutes: k.minutes,
  stack: k.stack,
  enabled: k.enabled,
  gifts: giftsOf(k.kind),
  showing,
  updatedAt: k.updatedAt,
});
const auditView = (k) => (k ? { name: k.name, art: k.art ? { url: k.art.url, v: k.art.v } : null, minutes: k.minutes, stack: k.stack, enabled: k.enabled } : null);
const fresh = async (kind) => {
  await refreshMarkKinds();
  return snap.rows.get(kind);
};
const showingOf = async (kinds) => {
  const r = await db.query('SELECT kind, count(*)::int AS n FROM profile_marks WHERE cleared_at IS NULL AND expires_at > now() AND kind = ANY($1::text[]) GROUP BY kind', [kinds]);
  return new Map(r.rows.map((x) => [x.kind, x.n]));
};

export const markKindRoutes = {
  /** Every kind that isn't deleted, oldest first, with the gifts using each and the rules an upload must meet. */
  async 'GET /api/admin/mark-kinds'(req) {
    await admin(req);
    await refreshMarkKinds();
    const list = [...snap.rows.values()].filter((k) => !k.deleted);
    const showing = await showingOf(list.map((k) => k.kind));
    const s = live();
    return {
      kinds: list.map((k) => staffKind(k, showing.get(k.kind) ?? 0)),
      limits: { nameMax: NAME_MAX, minutes: MINUTES, bytes: kindMax('markart'), types: ['image/png', 'image/webp'], ...MARK_ART, stacks: STACKS },
      on: Number(s.markHours) > 0,
      hours: Number(s.markHours) || 0,
    };
  },

  /** A new kind (or a deleted one's key made again, with what this body says). */
  async 'POST /api/admin/mark-kinds'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 4096);
    const kind = kindIn(b.kind);
    const name = nameIn(b.name);
    const minutes = b.minutes === undefined ? null : minutesIn(b.minutes);
    const stack = b.stack === undefined ? 'refresh' : stackIn(b.stack);
    const enabled = b.enabled === undefined ? true : enabledIn(b.enabled);
    const art = b.art === undefined || b.art === null ? null : await artFor(b.art, kind);
    await tx(async (c) => {
      const had = (await c.query('SELECT * FROM mark_kinds WHERE kind = $1 FOR UPDATE', [kind])).rows[0];
      if (had && !had.deleted_at) throw new HttpError(409, `"${kind}" türü zaten var (${had.name}); onu düzenleyin`);
      const cols = [name, art?.url ?? null, art ? crypto.randomBytes(6).toString('hex') : null, art?.px ?? null, art?.bytes ?? null, art?.stats ? JSON.stringify(art.stats) : null, art?.checked ?? false, minutes, stack, enabled, a.id];
      if (had) {
        await c.query(
          `UPDATE mark_kinds SET name = $2, art_url = $3, art_v = $4, art_px = $5, art_bytes = $6, art_stats = $7, art_checked = $8, minutes = $9, stack = $10, enabled = $11,
                  updated_by = $12, updated_at = now(), deleted_at = NULL, rev = nextval('mark_kind_rev') WHERE kind = $1`,
          [kind, ...cols],
        );
      } else {
        await c.query(
          `INSERT INTO mark_kinds (kind, name, art_url, art_v, art_px, art_bytes, art_stats, art_checked, minutes, stack, enabled, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
          [kind, ...cols],
        );
      }
      await audited(c, a.id, 'markkind.create', { kind, before: had ? auditView(viewOf(had)) : null, after: { name, art: art ? { url: art.url } : null, minutes, stack, enabled }, ...panelDetail(a) }, clientIp(req));
    }).catch((e) => {
      dropArt(art);
      throw e;
    });
    if (art?.upload) removeFiles([art.upload]);
    return { kind: staffKind(await fresh(kind)) };
  },

  /** Changes a kind: any of its name, picture (null takes it off: the app's own, else the badge), minutes, stack, on/off. */
  async 'POST /api/admin/mark-kinds/update'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 4096);
    const kind = kindIn(b.kind);
    const set = {};
    if (b.name !== undefined) set.name = nameIn(b.name);
    if (b.minutes !== undefined) set.minutes = minutesIn(b.minutes);
    if (b.stack !== undefined) set.stack = stackIn(b.stack);
    if (b.enabled !== undefined) set.enabled = enabledIn(b.enabled);
    const art = b.art === undefined ? undefined : b.art === null ? null : await artFor(b.art, kind);
    if (art !== undefined) {
      set.art_url = art?.url ?? null;
      set.art_v = art ? crypto.randomBytes(6).toString('hex') : null;
      set.art_px = art?.px ?? null;
      set.art_bytes = art?.bytes ?? null;
      set.art_stats = art?.stats ? JSON.stringify(art.stats) : null;
      set.art_checked = art?.checked ?? false;
    }
    if (!Object.keys(set).length) throw new HttpError(400, 'Değişecek bir şey yok');
    let old = null;
    await tx(async (c) => {
      const had = (await c.query('SELECT * FROM mark_kinds WHERE kind = $1 AND deleted_at IS NULL FOR UPDATE', [kind])).rows[0];
      if (!had) throw new HttpError(404, 'İz türü bulunamadı');
      old = viewOf(had);
      const cols = Object.keys(set);
      await c.query(
        `UPDATE mark_kinds SET ${cols.map((col, i) => `${col} = $${i + 2}`).join(', ')}, updated_by = $${cols.length + 2}, updated_at = now(), rev = nextval('mark_kind_rev') WHERE kind = $1`,
        [kind, ...cols.map((col) => set[col]), a.id],
      );
      const after = viewOf((await c.query('SELECT * FROM mark_kinds WHERE kind = $1', [kind])).rows[0]);
      await audited(c, a.id, 'markkind.update', { kind, before: auditView(old), after: auditView(after), ...panelDetail(a) }, clientIp(req));
    }).catch((e) => {
      dropArt(art);
      throw e;
    });
    // The picture it replaced (and the upload a smaller copy was made from) goes once the new one is saved.
    if (art !== undefined) removeFiles([old?.art?.url, art?.upload].filter((u) => u && u !== art?.url));
    return { kind: staffKind(await fresh(kind), (await showingOf([kind])).get(kind) ?? 0) };
  },

  /**
   * Deletes a kind no gift uses (soft: marks and audit rows name it). Its marks still showing stop showing, as for a
   * kind turned off.
   */
  async 'POST /api/admin/mark-kinds/delete'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 1024);
    const kind = kindIn(b.kind);
    let old = null;
    await tx(async (c) => {
      const had = (await c.query('SELECT * FROM mark_kinds WHERE kind = $1 AND deleted_at IS NULL FOR UPDATE', [kind])).rows[0];
      if (!had) throw new HttpError(404, 'İz türü bulunamadı');
      // Gift saves hold the kind's row (FOR SHARE) while they check it (custom-gifts.mjs): one that names it now is
      // committed before this reads, or waits and then finds the kind gone. The app's own gifts' rules as in the app
      // (APP_MARKS) are only in memory: allGifts.
      const using = giftsOf(kind);
      const stored = await c.query("SELECT id, name FROM custom_gifts WHERE mark_kind = $1 AND mark_role IN ('leave', 'clean') AND deleted_at IS NULL", [kind]);
      const named = new Map([...stored.rows.map((g) => [g.id, g.name ?? g.id]), ...using.map((g) => [g.id, g.name])]);
      const names = [...new Set(named.values())];
      if (names.length) throw new HttpError(409, `Bu türü kullanan hediyeler var: ${names.join(', ')}. Önce onların profil izi kuralını değiştirin ya da kaldırın.`);
      old = viewOf(had);
      await c.query("UPDATE mark_kinds SET deleted_at = now(), updated_by = $2, updated_at = now(), rev = nextval('mark_kind_rev') WHERE kind = $1", [kind, a.id]);
      await audited(c, a.id, 'markkind.delete', { kind, before: auditView(old), after: null, ...panelDetail(a) }, clientIp(req));
    });
    await refreshMarkKinds();
    if (old?.art) removeFiles([old.art.url]);
    return { deleted: true };
  },
};
