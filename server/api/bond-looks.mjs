// Bağ işaretleri (docs/BAGLAR.md "Panelden bağ işaretleri", migration 107): the mark drawn between two bonded people
// (on the mics when they sit side by side, on the profile's Bağlar row) as staff design it in the panel, level by level
// for each bond kind, so a new design needs no app update.
//
//   GET  /api/admin/bond-looks                                         → { kinds, levels, looks, limits, storage, svga }
//   POST /api/admin/bond-looks/save  { kind, level, art?, motion?, size? } → { look }   (art / motion null: taken off)
//   POST /api/admin/bond-looks/clear { kind, level }                   → { look: null }
//   POST /api/admin/bond-looks/svga  { source }                        → { art, motion, px, bytes }
//
// A level's design: a still picture (`art`: a transparent, square PNG or WebP uploaded as media.mjs shopframe, made at
// most 512 px / 512 KB for phones) and/or a moving one (`motion`: a transparent, square animated WebP, 64–512 px, up
// to 3 MB; an SVGA goes through /svga first, which makes both, as Yönetim › Mağaza does for frames), and `size`: how
// big it is drawn, 1–3 times the app's own mark. Phones draw the moving one when there is one, else the still one. A
// level with no design takes the nearest lower level's; below the kind's first design the app draws its own mark.
//
// What phones get: GET /api/catalog?bondlooks=1 `bondLooks` (catalogLooks: kind → level → design), and bondLooksRev()
// is part of the catalog's and /api/config's `v`. An older app never asks and draws its own marks.
//
// Admins only; every change is an audit_events row (before, after, the panel user, from where). Kept in memory
// (refreshBondLooks after every change here, and every BOND_LOOKS_POLL_MS for another process's).
import crypto from 'node:crypto';

import { KINDS, MAX_LEVEL } from './bond-rules.mjs';
import { HttpError, auth, clientIp, db, env, limit, readJson, tx } from './core.mjs';
import { canSvga, fitPicture, imageInfo, svgaFrame } from './custom-gifts.mjs';
import { keyOf, readStored, removeFiles, storageOn, verifyUpload, writeStored } from './media.mjs';
import { panelDetail } from './panel.mjs';

const positive = (v, d) => {
  const n = Number(v ?? d);
  return Number.isSafeInteger(n) && n > 0 ? n : d;
};
const POLL_MS = positive(env.BOND_LOOKS_POLL_MS ?? env.CUSTOM_GIFTS_POLL_MS, 5000);

export const BOND_LOOK_LIMITS = Object.freeze({
  // The still picture: any size up to the upload's is taken; phones get at most servePx / serveBytes.
  artBytes: 4 * 1024 * 1024,
  artPxMin: 64,
  artPxMax: 1024,
  servePx: 512,
  serveBytes: 512 * 1024,
  // The moving one is drawn on every seat pair that shows it, so small.
  motionBytes: 3 * 1024 * 1024,
  motionPxMin: 64,
  motionPxMax: 512,
  sizeMin: 1,
  sizeMax: 3,
});
const L = BOND_LOOK_LIMITS;

// --- The table in memory ---------------------------------------------------------------------------------------
/** rev: the largest bond_looks.rev; rows: `${kind}:${level}` → the row's view (empty ones too). */
let snap = { rev: 0, rows: new Map() };

const viewOf = (r) =>
  Object.freeze({
    kind: r.kind,
    level: Number(r.level),
    art: r.art_url ? Object.freeze({ url: r.art_url, v: r.art_v, px: r.art_px ?? null }) : null,
    motion: r.motion_url ? Object.freeze({ url: r.motion_url, v: r.motion_v, px: r.motion_px ?? null, bytes: r.motion_bytes ?? null }) : null,
    size: Number(r.size) || 1,
    rev: Number(r.rev),
    updatedAt: r.updated_at ?? null,
    updatedBy: r.updated_by ?? null,
  });
const keyFor = (kind, level) => `${kind}:${level}`;
const filled = (x) => !!(x && (x.art || x.motion));

/** Reads the table again (never back to an older copy). */
export async function refreshBondLooks(q = db) {
  const r = await q.query('SELECT * FROM bond_looks ORDER BY kind, level');
  const rev = r.rows.reduce((m, x) => Math.max(m, Number(x.rev)), 0);
  if (rev >= snap.rev) snap = { rev, rows: new Map(r.rows.map((x) => [keyFor(x.kind, x.level), viewOf(x)])) };
  return snap;
}

let timer = null;
/** Picks up another process's changes. */
export function startBondLooks() {
  if (timer) return;
  let busy = false;
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await db.query('SELECT coalesce(max(rev), 0) AS rev FROM bond_looks');
      if (Number(r.rows[0].rev) !== snap.rev) await refreshBondLooks();
    } catch (e) {
      console.error('bond looks sync failed', String(e?.message ?? e).slice(0, 200));
    } finally {
      busy = false;
    }
  }, POLL_MS);
  timer.unref();
}
export function stopBondLooks() {
  clearInterval(timer);
  timer = null;
}

/** Added to the catalog's and /api/config's `v`: grows with every change here. */
export const bondLooksRev = () => snap.rev;

/**
 * GET /api/catalog?bondlooks=1 `bondLooks`: { [kind]: { [level]: { art?: { url, v, px }, motion?: { url, v, px }, size } } },
 * only the levels staff designed (a phone takes the nearest lower one for the rest).
 */
export function catalogLooks() {
  const out = {};
  for (const x of snap.rows.values()) {
    if (!filled(x)) continue;
    (out[x.kind] ??= {})[x.level] = {
      ...(x.art ? { art: { url: x.art.url, v: x.art.v, ...(x.art.px ? { px: x.art.px } : {}) } } : {}),
      ...(x.motion ? { motion: { url: x.motion.url, v: x.motion.v, ...(x.motion.px ? { px: x.motion.px } : {}) } } : {}),
      size: x.size,
    };
  }
  return out;
}

// --- Checking what staff upload ---------------------------------------------------------------------------------
const bad = (m) => new HttpError(400, m);
/** An uploaded shopframe picture, read: { info, buf, key }; a Turkish 400 when it isn't one. */
async function pictureAt(url, what, max) {
  const key = typeof url === 'string' ? keyOf(url) : null;
  if (!key?.startsWith('shopframe/')) throw bad(`${what} önce yükleyin`);
  await verifyUpload(url, 'shopframe');
  const buf = await readStored(key, max);
  const info = imageInfo(buf);
  if (!info) throw bad(`${what} PNG ya da WebP olmalı`);
  return { info, buf, key };
}
const square = (info) => Math.abs(info.width - info.height) <= Math.max(2, info.width * 0.02);

/**
 * The still picture at `url`: transparent, square, still, 64–1024 px. { url (the one to keep: a smaller copy when the
 * upload is over 512 px or 512 KB), upload (the upload that copy replaced, to remove once saved; null: kept), px }.
 */
async function artAt(url) {
  const { info, buf, key } = await pictureAt(url, 'Durağan resmi', L.artBytes);
  if (info.animated) throw bad('Bu resim hareketli: onu "Hareketli hali"ne yükleyin; durağan resim kımıldamayan bir PNG ya da WebP olmalı');
  if (!info.alpha) throw bad('Resimde saydamlık yok: işaretin çevresi saydam olmalı');
  if (!square(info)) throw bad(`Resim kare olmalı (bu ${info.width} × ${info.height})`);
  if (info.width < L.artPxMin || info.width > L.artPxMax) throw bad(`Resim ${L.artPxMin}–${L.artPxMax} piksel olmalı (bu ${info.width})`);
  if (buf.length <= L.serveBytes && info.width <= L.servePx) return { url, upload: null, px: info.width };
  const small = await fitPicture(buf, key, { maxPx: L.servePx, maxBytes: L.serveBytes, what: 'Bağ işareti', size: `${info.width} × ${info.height}` });
  const px = imageInfo(await readStored(keyOf(small), L.serveBytes))?.width ?? Math.min(info.width, L.servePx);
  return { url: small, upload: url, px };
}
/** The moving one at `url`: a transparent, square animated WebP, 64–512 px, up to 3 MB. */
async function motionAt(url) {
  const { info, buf } = await pictureAt(url, 'Hareketli hali', L.motionBytes);
  if (info.type !== 'webp' || !info.animated) throw bad('Hareketli hali hareketli bir WebP olmalı (GIF ya da durağan resim değil; SVGA için "SVGA yükle"yi kullanın)');
  if (!info.alpha) throw bad('Hareketli halde saydamlık yok: işaretin çevresi saydam olmalı');
  if (!square(info)) throw bad(`Hareketli hali kare olmalı (bu ${info.width} × ${info.height})`);
  if (info.width < L.motionPxMin || info.width > L.motionPxMax) throw bad(`Hareketli hali ${L.motionPxMin}–${L.motionPxMax} piksel olmalı (bu ${info.width}); telefon onu küçük çizer, büyüğü boşuna yer kaplar`);
  return { url, px: info.width, bytes: buf.length };
}

// --- The panel's routes -----------------------------------------------------------------------------------------
async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}
const writeLimit = (a) => limit(`bond-looks-admin:${a.id}`, 60, 'Çok fazla deneme, biraz bekle');
const audited = (c, actor, action, detail, ip = '') =>
  c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, NULL, $3, $4)', [actor, action, JSON.stringify(detail), ip]);

function kindIn(v) {
  if (typeof v !== 'string' || !Object.hasOwn(KINDS, v)) throw bad(`Bağ türü şunlardan biri olmalı: ${Object.keys(KINDS).join(', ')}`);
  return v;
}
function levelIn(v) {
  if (!Number.isInteger(v) || v < 1 || v > MAX_LEVEL) throw bad(`Seviye 1–${MAX_LEVEL} arasında bir tam sayı olmalı`);
  return v;
}
function sizeIn(v) {
  const n = Number(v);
  if (typeof v !== 'number' || !Number.isFinite(n) || n < L.sizeMin || n > L.sizeMax) throw bad(`Boyut ${L.sizeMin}–${L.sizeMax} kat arasında olmalı`);
  return Math.round(n * 100) / 100;
}
const version = () => crypto.randomBytes(6).toString('hex');

/** Every design's files that no other level uses once `kind`/`level` stops using them: removed after a save. */
function unused(old, kept) {
  const inUse = new Set();
  for (const x of snap.rows.values()) {
    if (x.kind === old.kind && x.level === old.level) continue;
    for (const p of [x.art, x.motion]) if (p) inUse.add(keyOf(p.url));
  }
  for (const p of kept) if (p) inUse.add(keyOf(p));
  return [old.art?.url, old.motion?.url].filter((u) => u && !inUse.has(keyOf(u)));
}

/** A design as the panel shows it. */
const staffLook = (x) => (filled(x) ? { kind: x.kind, level: x.level, art: x.art, motion: x.motion, size: x.size, updatedAt: x.updatedAt } : null);
const auditView = (x) => (filled(x) ? { art: x.art?.url ?? null, motion: x.motion?.url ?? null, size: x.size } : null);

export const bondLookRoutes = {
  /** Every kind with its designed levels, and the rules an upload must meet. */
  async 'GET /api/admin/bond-looks'(req) {
    await admin(req);
    await refreshBondLooks();
    return {
      kinds: Object.entries(KINDS).map(([kind, k]) => ({ kind, label: k.label })),
      levels: MAX_LEVEL,
      looks: [...snap.rows.values()].filter(filled).map(staffLook),
      limits: { ...L, types: ['image/png', 'image/webp'] },
      storage: storageOn(),
      svga: await canSvga(),
    };
  },

  /**
   * Saves one level's design: what the body names changes (art / motion: an upload's address, null to take it off;
   * size), the rest stays. A design left with neither picture is taken off (as /clear).
   */
  async 'POST /api/admin/bond-looks/save'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 4096);
    const kind = kindIn(b.kind);
    const level = levelIn(b.level);
    const size = b.size === undefined ? undefined : sizeIn(b.size);
    if (b.art === undefined && b.motion === undefined && size === undefined) throw bad('Değişecek bir şey yok');
    const art = b.art === undefined || b.art === null ? b.art : await artAt(b.art);
    const motion = b.motion === undefined || b.motion === null ? b.motion : await motionAt(b.motion);
    let old = null;
    let now = null;
    try {
      await tx(async (c) => {
        const had = (await c.query('SELECT * FROM bond_looks WHERE kind = $1 AND level = $2 FOR UPDATE', [kind, level])).rows[0];
        old = had ? viewOf(had) : { kind, level, art: null, motion: null, size: 1 };
        const next = {
          art: art === undefined ? old.art : art ? { url: art.url, v: version(), px: art.px } : null,
          motion: motion === undefined ? old.motion : motion ? { url: motion.url, v: version(), px: motion.px, bytes: motion.bytes } : null,
          size: size ?? old.size,
        };
        if (!next.art && !next.motion) throw bad('Bir durağan resim ya da hareketli hal gerekli (ikisini birden kaldırmak için "Kaldır"ı kullanın)');
        const cols = [kind, level, next.art?.url ?? null, next.art?.v ?? null, next.art?.px ?? null, next.motion?.url ?? null, next.motion?.v ?? null, next.motion?.px ?? null, next.motion?.bytes ?? null, next.size, a.id];
        await c.query(
          `INSERT INTO bond_looks (kind, level, art_url, art_v, art_px, motion_url, motion_v, motion_px, motion_bytes, size, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (kind, level) DO UPDATE SET art_url = $3, art_v = $4, art_px = $5, motion_url = $6, motion_v = $7, motion_px = $8, motion_bytes = $9,
                  size = $10, updated_by = $11, updated_at = now(), rev = nextval('bond_look_rev')`,
          cols,
        );
        now = viewOf((await c.query('SELECT * FROM bond_looks WHERE kind = $1 AND level = $2', [kind, level])).rows[0]);
        await audited(c, a.id, 'bondlook.save', { kind, level, before: auditView(old), after: auditView(now), ...panelDetail(a) }, clientIp(req));
      });
    } catch (e) {
      // A smaller copy made for this save points nowhere now.
      if (art?.upload) removeFiles([art.url]);
      throw e;
    }
    const gone = unused(old, [now.art?.url, now.motion?.url]);
    if (art?.upload) gone.push(art.upload);
    if (gone.length) removeFiles(gone);
    await refreshBondLooks();
    return { look: staffLook(now) };
  },

  /** Takes a level's design off: that level takes the nearest lower design again (or the app's own mark). */
  async 'POST /api/admin/bond-looks/clear'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 1024);
    const kind = kindIn(b.kind);
    const level = levelIn(b.level);
    let old = null;
    await tx(async (c) => {
      const had = (await c.query('SELECT * FROM bond_looks WHERE kind = $1 AND level = $2 FOR UPDATE', [kind, level])).rows[0];
      old = had ? viewOf(had) : null;
      if (!filled(old)) throw new HttpError(404, 'Bu seviyenin bir tasarımı yok');
      await c.query(
        `UPDATE bond_looks SET art_url = NULL, art_v = NULL, art_px = NULL, motion_url = NULL, motion_v = NULL, motion_px = NULL, motion_bytes = NULL,
                size = 1, updated_by = $3, updated_at = now(), rev = nextval('bond_look_rev') WHERE kind = $1 AND level = $2`,
        [kind, level, a.id],
      );
      await audited(c, a.id, 'bondlook.clear', { kind, level, before: auditView(old), after: null, ...panelDetail(a) }, clientIp(req));
    });
    const gone = unused(old, []);
    if (gone.length) removeFiles(gone);
    await refreshBondLooks();
    return { look: null };
  },

  /**
   * An SVGA for a design, uploaded as a gift's source: answers the still picture and the moving WebP made from it
   * (custom-gifts.mjs svgaFrame, as Yönetim › Mağaza's frames), the addresses a design is then saved with. The SVGA
   * itself is deleted once it is converted.
   */
  async 'POST /api/admin/bond-looks/svga'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 2048);
    if (typeof b.source !== 'string' || !b.source) throw bad('SVGA dosyasını önce yükleyin');
    const out = await svgaFrame(b.source, L.motionBytes);
    const name = `shopframe/${keyOf(b.source).split('/')[1]}/bond-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('base64url')}`;
    const art = await writeStored(`${name}.png`, out.still, 'image/png');
    const motion = await writeStored(`${name}.webp`, out.motion, 'image/webp');
    removeFiles([b.source]);
    await audited(db, a.id, 'bondlook.svga', { art, motion, px: out.px, bytes: out.motion.length, ...panelDetail(a) }, clientIp(req));
    return { art, motion, px: out.px, bytes: out.motion.length };
  },
};
