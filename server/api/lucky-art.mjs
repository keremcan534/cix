// Şanslı hediye paketlerinin kendi ikonu ve videosu (Güncelleme 7 madde 10, docs/LUCKY_HEDIYE.md): staff give a
// package (lk1–lk4, or one they added in Şanslı hediye ayarı, lucky.mjs) an icon and a video in the panel, with no app
// update. Uploaded, checked and converted exactly as a gift's (custom-gifts.mjs checkIcon, videoOf and its converter;
// a pasted link through the gifts' fetch), kept in lucky_art (migration 100), never in custom_gifts: no gift route
// (giftOf, catalogGifts, giftFx, customGiftIds) reads this table, so a package can't be sent as a plain gift nor shown
// among the catalog's gifts. The package's name, emoji, price, odds and on/off stay in lucky_config.
//
//   POST /api/admin/lucky/art        { id, icon?, video?, iconLink?, videoLink? } → { art }
//        icon: an uploaded gift icon (null takes it off: the app's own picture for lk1–lk4, the emoji for the others);
//        video: { kind: 'stacked', url } or { kind: 'source', url, fill?, opaque? } as a gift's (null takes it off)
//   POST /api/admin/lucky/art/remove { id }                                     → { art }   icon and video off
//   POST /api/admin/lucky/fetch      { slot: 'icon'|'video', url }              → as POST /api/admin/gifts/fetch
//   GET|HEAD /api/fx/l/<id>.mp4                                                 → the package's video (public)
//
// What phones get: GET /api/lucky gives each package `icon` (null: none of the panel's) and `fx` ({ url, bytes, ms } or
// null); the room's Şanslı packet carries `icon`. The videos are in the catalog's `fx` only for an app that asks
// (?lucky=1; kind 'gift', id the package's), and only for packages on sale, at /api/fx/l/: an older app's filter
// refuses that address anyway, so it never downloads a clip it can't play. luckyArtRev() is part of the catalog's and
// /api/config's `v`, so a change here makes the phones read the catalog again.
//
// Admins only; every change is an audit_events row (before, after, the panel user, from where).
import { artUrl } from './art.mjs';
import { HttpError, auth, clientIp, db, env, limit, readJson, tx } from './core.mjs';
import { LIMITS, addVideoTable, canConvert, canSvga, checkIcon, customGiftRoutes, kickJobs, videoOf } from './custom-gifts.mjs';
import { FX_PATH } from './fx.mjs';
import { linkOf } from './link-fetch.mjs';
import { DEFAULT_CONFIG, LUCKY_ID } from './lucky-rules.mjs';
import { keyOf, removeFiles, sendFile, storageOn } from './media.mjs';
import { panelDetail } from './panel.mjs';

const positive = (v, d) => {
  const n = Number(v ?? d);
  return Number.isSafeInteger(n) && n > 0 ? n : d;
};
const POLL_MS = positive(env.LUCKY_ART_POLL_MS ?? env.CUSTOM_GIFTS_POLL_MS, 5000);

// --- The table in memory ---------------------------------------------------------------------------------------
/** rows: id → the stored row; rev: the largest rev; config: the settings' version and the packages on sale. */
let snap = { rev: 0, rows: new Map(), version: 0, onSale: new Set() };

/** The packages in force (lucky.mjs current(); read here so this file never imports lucky.mjs). */
async function packages(q = db) {
  const r = (await q.query('SELECT config, version FROM lucky_config WHERE id = 1')).rows[0];
  return r ? { gifts: r.config.gifts, version: Number(r.version) } : { gifts: DEFAULT_CONFIG.gifts, version: 1 };
}

/** Reads the rows and the packages on sale again (after every change here, a settings save, and the poll). */
export async function refreshLuckyArt(q = db) {
  const [r, p] = await Promise.all([q.query('SELECT * FROM lucky_art'), packages(q)]);
  snap = {
    rev: r.rows.reduce((m, x) => Math.max(m, Number(x.rev)), 0),
    rows: new Map(r.rows.map((x) => [x.id, x])),
    version: p.version,
    onSale: new Set(p.gifts.filter((g) => g.enabled).map((g) => g.id)),
  };
}
addVideoTable({ table: 'lucky_art', rev: 'lucky_art_rev', what: 'lucky', refresh: () => refreshLuckyArt() });

let timer = null;
/** Picks up another process's changes, and goes on with a conversion a restart cut off or a retry put off. */
export function startLuckyArt() {
  if (timer) return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await db.query(
        `SELECT (SELECT coalesce(max(rev), 0) FROM lucky_art) AS rev, (SELECT coalesce(max(version), 1) FROM lucky_config) AS version,
                (SELECT count(*) FROM lucky_art WHERE job_status = 'processing') AS jobs`,
      );
      if (Number(r.rows[0].rev) !== snap.rev || Number(r.rows[0].version) !== snap.version) await refreshLuckyArt();
      if (Number(r.rows[0].jobs) > 0) kickJobs();
    } catch (e) {
      console.error('lucky art sync failed', String(e?.message ?? e).slice(0, 200));
    } finally {
      busy = false;
    }
  };
  timer = setInterval(tick, POLL_MS);
  timer.unref();
  void tick();
}
export function stopLuckyArt() {
  clearInterval(timer);
  timer = null;
}

/**
 * Part of the catalog's and /api/config's `v`: a new icon or video, or (once any package has art: the rows are never
 * deleted, so this only grows) a settings save, which may put a package with a video on or off sale. 0 on a server
 * where no package has art.
 */
export const luckyArtRev = () => (snap.rows.size ? snap.rev + snap.version : 0);

const fxUrl = (id, v) => `${FX_PATH}l/${id}.mp4?v=${v}`;
const fxOf = (x) => (x?.video_url ? { url: fxUrl(x.id, x.video_v), bytes: Number(x.video_bytes), ms: Number(x.video_ms ?? 0) } : null);

/** What GET /api/lucky adds to a package: its icon (null: none of the panel's) and its video (null: none). */
export function luckyArtOf(id) {
  const x = snap.rows.get(id);
  return { icon: x?.icon_url ?? null, fx: fxOf(x) };
}

/** The catalog's `fx` rows for an app that asks (?lucky=1): the videos of the packages on sale. */
export const luckyFx = () =>
  [...snap.rows.values()].filter((x) => x.video_url && snap.onSale.has(x.id)).map((x) => ({ kind: 'gift', id: x.id, ...fxOf(x) }));

/** GET or HEAD /api/fx/l/<id>.mp4: a package's video (one off sale too, for the panel's preview). */
export async function sendLuckyFx(req, res, name) {
  const m = /^(lk[a-z0-9]{1,20})\.mp4$/.exec(name);
  const x = m ? snap.rows.get(m[1]) : null;
  const key = x?.video_url ? keyOf(x.video_url) : null;
  if (!key) return void res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('Bulunamadı');
  await sendFile(req, res, key);
}

// --- What the panel sees ---------------------------------------------------------------------------------------
/** A package's art as the panel shows it; `original`: the app's own picture (lk1–lk4), null for a package of the panel's. */
const artView = (id, x) => ({
  id,
  icon: x?.icon_url ?? null,
  iconLink: x?.icon_link ?? null,
  video: fxOf(x),
  videoLink: x?.video_link ?? null,
  // preview: what a refused video came out as (its background and all), for the panel to show.
  job: x?.job_status ? { status: x.job_status, error: x.job_error ?? null, preview: x.job_preview ?? null } : null,
  original: { icon: artUrl('gifts', id) },
  updatedAt: x?.updated_at ?? null,
});

/** GET /api/admin/lucky's additions: each package's art (`ids`, the settings' order) and what an upload may be. */
export async function luckyArtAdmin(ids) {
  return {
    art: ids.map((id) => artView(id, snap.rows.get(id))),
    artLimits: {
      iconBytes: LIMITS.iconBytes,
      iconMinPx: LIMITS.iconMinPx,
      iconMaxPx: LIMITS.iconMaxPx,
      videoBytes: LIMITS.videoBytes,
      sourceBytes: LIMITS.sourceBytes,
      svgaBytes: LIMITS.svgaBytes,
      videoMinMs: LIMITS.videoMinMs,
      videoMaxMs: LIMITS.videoMaxMs,
      fills: LIMITS.fills,
    },
    convert: await canConvert(),
    svga: await canSvga(),
    storage: storageOn(),
  };
}

// --- Admin routes ----------------------------------------------------------------------------------------------
async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}
/** What the audit keeps of a row. */
const auditOf = (r) =>
  r && {
    icon: r.icon_url ?? null,
    iconLink: r.icon_link ?? null,
    video: r.video_url ?? null,
    videoLink: r.video_link ?? null,
    job: r.job_status ?? null,
  };
const audited = (c, a, req, action, detail) =>
  c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, NULL, $3, $4)', [a.id, action, JSON.stringify({ ...detail, ...panelDetail(a) }), clientIp(req)]);
/** A package that is in the settings now (on sale or not): its art can be set; an unknown id is refused. */
async function packageOf(v) {
  if (typeof v !== 'string' || !LUCKY_ID.test(v)) throw new HttpError(400, 'Geçersiz Şanslı paket');
  const p = (await packages()).gifts.find((g) => g.id === v);
  if (!p) throw new HttpError(404, 'Şanslı paket bulunamadı: önce paketi Şanslı hediye ayarında kaydet');
  return p;
}
const linkField = (v) => (v === undefined ? undefined : v === null || v === '' ? null : linkOf(v));
const writeLimit = (a) => limit(`lucky-art:${a.id}`, 30, 'Çok fazla kayıt, biraz bekle');

export const luckyArtRoutes = {
  /**
   * A package's icon and video: each given replaces the old one (whose file is then deleted), null takes it off,
   * undefined leaves it. A source video turns into the stacked one in the background (the video in use stays till
   * then). iconLink / videoLink: where a file fetched from a link came from (POST /api/admin/lucky/fetch).
   */
  async 'POST /api/admin/lucky/art'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 8192);
    const p = await packageOf(b.id);
    const id = p.id;
    const now = snap.rows.get(id);
    let icon;
    let iconUpload = null;
    if (b.icon === null) icon = null;
    else if (b.icon !== undefined && b.icon !== (now?.icon_url ?? null)) {
      if (typeof b.icon !== 'string' || !b.icon) throw new HttpError(400, 'İkonu önce yükle');
      ({ url: icon, upload: iconUpload } = await checkIcon(b.icon));
    }
    const video = await videoOf(b.video);
    const iconLink = linkField(b.iconLink);
    const videoLink = linkField(b.videoLink);
    if (icon === undefined && video === undefined && iconLink === undefined && videoLink === undefined) throw new HttpError(400, 'Değişiklik yok');
    const drop = [];
    const row = await tx(async (c) => {
      await c.query('INSERT INTO lucky_art (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [id]);
      const r = (await c.query('SELECT * FROM lucky_art WHERE id = $1 FOR UPDATE', [id])).rows[0];
      const vals = [id];
      const sets = [];
      const set = (col, v) => {
        vals.push(v);
        sets.push(`${col} = $${vals.length}`);
      };
      if (icon !== undefined) {
        set('icon_url', icon);
        set('icon_link', icon === null ? null : (iconLink ?? null));
        if (r.icon_url !== icon) drop.push(r.icon_url);
      } else if (iconLink !== undefined && r.icon_url) set('icon_link', iconLink);
      if (video === null || video?.kind === 'stacked') {
        set('video_url', video?.url ?? null);
        set('video_bytes', video?.bytes ?? null);
        set('video_ms', video?.ms ?? null);
        set('video_v', video?.v ?? null);
        set('video_link', video ? (videoLink ?? null) : null);
        sets.push('job_status = NULL', 'job_source = NULL', 'job_error = NULL', 'job_tries = 0', 'job_preview = NULL');
        if (r.video_url !== (video?.url ?? null)) drop.push(r.video_url);
        drop.push(r.job_source, r.job_preview);
      } else if (video?.kind === 'source') {
        set('job_source', video.url);
        set('job_fill', video.fill);
        set('job_opaque', video.opaque === true);
        set('video_link', videoLink ?? null);
        sets.push("job_status = 'processing'", 'job_error = NULL', 'job_tries = 0', 'job_at = now()', 'job_preview = NULL');
        drop.push(r.job_source, r.job_preview);
      } else if (videoLink !== undefined && (r.video_url || r.job_source)) set('video_link', videoLink);
      if (!sets.length) throw new HttpError(400, 'Değişiklik yok');
      sets.push('updated_at = now()', "rev = nextval('lucky_art_rev')");
      const after = (await c.query(`UPDATE lucky_art SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals)).rows[0];
      await audited(c, a, req, 'lucky.art', { lucky: id, name: p.name, before: auditOf(r), after: auditOf(after) });
      return after;
    });
    // A file the row still holds (the same one sent again) is never in `drop`; one a gift holds media.mjs keeps.
    removeFiles([...drop, iconUpload].filter(Boolean));
    await refreshLuckyArt();
    if (video?.kind === 'source') kickJobs();
    return { art: artView(id, row) };
  },

  /** Icon and video both off: the app's own picture (or the emoji) and no video. Its files go. */
  async 'POST /api/admin/lucky/art/remove'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 1024);
    if (typeof b.id !== 'string' || !LUCKY_ID.test(b.id)) throw new HttpError(400, 'Geçersiz Şanslı paket');
    const id = b.id;
    const r = await tx(async (c) => {
      const r = (await c.query('SELECT * FROM lucky_art WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!r) return null;
      const after = (
        await c.query(
          `UPDATE lucky_art SET icon_url = NULL, icon_link = NULL, video_url = NULL, video_bytes = NULL, video_ms = NULL, video_v = NULL, video_link = NULL,
                  job_status = NULL, job_source = NULL, job_error = NULL, job_tries = 0, job_fill = NULL, job_preview = NULL,
                  updated_at = now(), rev = nextval('lucky_art_rev') WHERE id = $1 RETURNING *`,
          [id],
        )
      ).rows[0];
      await audited(c, a, req, 'lucky.art_remove', { lucky: id, before: auditOf(r), after: auditOf(after) });
      return { before: r, after };
    });
    if (r) removeFiles([r.before.icon_url, r.before.video_url, r.before.job_source, r.before.job_preview].filter(Boolean));
    await refreshLuckyArt();
    return { art: artView(id, r?.after ?? null) };
  },

  /** A file from a link the admin pasted, for a package's icon or video: the gifts' own fetch (same checks and audit). */
  'POST /api/admin/lucky/fetch': (req, url) => customGiftRoutes['POST /api/admin/gifts/fetch'](req, url),
};
