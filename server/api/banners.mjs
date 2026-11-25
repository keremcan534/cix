// Banner Yönetimi (owners, 25 Nov 2026; docs/BANNER_YONETIMI.md): the management's banners at the top of Odalar,
// before the ranking boards. Each has a picture (an upload, media kind notice, or one of the app's own: `art`), a
// title, an optional line and button, a link in the app, an optional start and end, on/off and a place in the order.
// The panel (finance-control, Duyuru ve etkinlik › Banner Yönetimi) runs the admin routes.
//
//   GET  /api/admin/banners                    → { banners, now }        every banner not removed, in order, with its
//                                                                         state and the last 7 days' views and clicks
//   POST /api/admin/banners       { id?, title, subtitle?, cta?, link?, imageUrl?, art?, showText?, accent?,
//                                   startsAt?, endsAt?, enabled? }      → { banner }   new (no id) or changed
//   POST /api/admin/banners/toggle { id, enabled }                      → { banner }
//   POST /api/admin/banners/order  { ids }                              → { banners }  the new order (all of them)
//   POST /api/admin/banners/remove { id }                               → { removed }
//   GET  /api/admin/banners/stats?days=7|30|90                          → { days, rows: [{ id, day, views, clicks }] }
//   POST /api/banners/seen   { ids }   a phone showed these (once a day per person and banner)   → { ok }
//   POST /api/banners/click  { id }    a tap on one (once a day per person and banner)           → { ok }
//
// The phones read the live ones in GET /api/room-banners (team.mjs): `banners` for an app that asks (?banners=1);
// an older app gets them in `events` as a notice slide (title, line, picture, link), so it shows them too.
import { HttpError, auth, db, int, readJson, text } from './core.mjs';
import { photoOf } from './team.mjs';
import { verifyUpload } from './media.mjs';

const LINK = /^\/(?!\/)[A-Za-z0-9/_?=&.%-]{0,119}$/;
const ART = /^[a-z0-9-]{1,40}$/;
export const ACCENTS = ['mor', 'pembe', 'altin', 'turkuaz'];
const MAX_LIVE = 10;

async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}
const idOf = (v) => (typeof v === 'string' && /^\d{1,18}$/.test(v) ? v : typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? String(v) : null);
const timeOf = (v, what) => {
  if (v === undefined || v === null || v === '') return null;
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  if (!Number.isFinite(t)) throw new HttpError(400, `${what} geçerli bir tarih olmalı`);
  return new Date(t);
};

/**
 * A banner's state now: removed ones aren't shown at all. expired (its end passed), draft (never switched on), off
 * (switched off), scheduled (on, its start not yet come), live.
 */
export function stateOf(b, now = new Date()) {
  if (b.ends_at && b.ends_at <= now) return 'expired';
  if (!b.enabled) return b.first_on_at ? 'off' : 'draft';
  if (b.starts_at && b.starts_at > now) return 'scheduled';
  return 'live';
}

const view = (b, now) => ({
  id: String(b.id),
  title: b.title,
  subtitle: b.subtitle,
  cta: b.cta,
  link: b.link ?? null,
  imageUrl: b.image_url ?? null,
  art: b.art ?? null,
  showText: b.show_text,
  accent: b.accent,
  startsAt: b.starts_at?.toISOString() ?? null,
  endsAt: b.ends_at?.toISOString() ?? null,
  enabled: b.enabled,
  sort: b.sort,
  state: stateOf(b, now),
  updatedAt: b.updated_at.toISOString(),
});
/** What a phone draws of a live banner. */
export const phoneView = (b) => ({
  id: String(b.id),
  title: b.title,
  subtitle: b.subtitle,
  cta: b.cta,
  link: b.link ?? null,
  imageUrl: b.image_url ?? null,
  art: b.art ?? null,
  showText: b.show_text,
  accent: b.accent,
  endsAt: b.ends_at?.toISOString() ?? null,
});

/** The banners the phones show now, in order (at most MAX_LIVE). */
export async function liveBanners(q = db) {
  const r = await q.query(
    `SELECT * FROM banners WHERE removed_at IS NULL AND enabled AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())
      ORDER BY sort, id LIMIT ${MAX_LIVE}`,
  );
  return r.rows;
}

const audit = (c, actor, action, detail) => c.query("INSERT INTO audit_events (actor, action, target, detail) VALUES ($1, $2, NULL, $3)", [actor, action, JSON.stringify(detail)]);
const plain = (b) => b && Object.fromEntries(Object.entries(b).filter(([k]) => !['created_at', 'updated_at', 'created_by', 'updated_by'].includes(k)));

/** The fields of a save, checked; `prev` is the banner being changed (its values stay where a field isn't sent). */
async function fieldsOf(b, prev) {
  const has = (k) => b[k] !== undefined;
  const title = has('title') || !prev ? text(b.title, 2, 60, 'Başlık') : prev.title;
  const subtitle = has('subtitle') ? text(b.subtitle ?? '', 0, 120, 'Alt yazı') : (prev?.subtitle ?? '');
  const cta = has('cta') ? text(b.cta ?? '', 0, 24, 'Düğme yazısı') : (prev?.cta ?? '');
  let link = prev?.link ?? null;
  if (has('link')) {
    link = b.link === null || b.link === '' ? null : typeof b.link === 'string' && LINK.test(b.link.trim()) ? b.link.trim() : undefined;
    if (link === undefined) throw new HttpError(400, 'Bağlantı uygulamada bir yol olmalı (ör. /siralama, /magaza, /vip)');
  }
  if (cta && !link) throw new HttpError(400, 'Düğmesi olan bannerın bir bağlantısı olmalı');
  let imageUrl = prev?.image_url ?? null;
  if (has('imageUrl')) {
    imageUrl = photoOf(b.imageUrl);
    if (imageUrl && imageUrl !== prev?.image_url) await verifyUpload(imageUrl, 'notice');
  }
  let art = prev?.art ?? null;
  if (has('art')) {
    art = b.art === null || b.art === '' ? null : typeof b.art === 'string' && ART.test(b.art) ? b.art : undefined;
    if (art === undefined) throw new HttpError(400, 'Geçersiz hazır görsel');
  }
  if (has('imageUrl') && imageUrl) art = null;
  if (!imageUrl && !art) throw new HttpError(400, 'Banner için bir görsel yükleyin');
  const showText = has('showText') ? b.showText !== false : (prev?.show_text ?? true);
  const accent = has('accent') ? (ACCENTS.includes(b.accent) ? b.accent : null) : (prev?.accent ?? 'mor');
  if (!accent) throw new HttpError(400, `Renk: ${ACCENTS.join(', ')}`);
  const startsAt = has('startsAt') ? timeOf(b.startsAt, 'Başlangıç') : (prev?.starts_at ?? null);
  const endsAt = has('endsAt') ? timeOf(b.endsAt, 'Bitiş') : (prev?.ends_at ?? null);
  if (startsAt && endsAt && endsAt <= startsAt) throw new HttpError(400, 'Bitiş başlangıçtan sonra olmalı');
  if (has('endsAt') && endsAt && endsAt <= new Date() && (!prev || +endsAt !== +(prev.ends_at ?? 0))) throw new HttpError(400, 'Bitiş geçmişte olamaz');
  const enabled = has('enabled') ? b.enabled === true : (prev?.enabled ?? false);
  return { title, subtitle, cta, link, imageUrl, art, showText, accent, startsAt, endsAt, enabled };
}

/** One person's view or click of a banner counts once a day (in memory: a restart may count one twice). */
const counted = new Map();
let countedDay = '';
function firstToday(kind, user, id) {
  const day = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  if (day !== countedDay) {
    counted.clear();
    countedDay = day;
  }
  const key = `${kind}:${user}:${id}`;
  if (counted.has(key)) return false;
  if (counted.size > 500_000) return false;
  counted.set(key, true);
  return true;
}
const TODAY = "(now() AT TIME ZONE 'Europe/Istanbul')::date";
async function bump(ids, kind) {
  if (!ids.length) return;
  await db.query(
    `INSERT INTO banner_stats (banner_id, day, ${kind}) SELECT b.id, ${TODAY}, 1 FROM banners b WHERE b.id = ANY($1::bigint[]) AND b.removed_at IS NULL
     ON CONFLICT (banner_id, day) DO UPDATE SET ${kind} = banner_stats.${kind} + 1`,
    [ids],
  );
}

export const bannerRoutes = {
  async 'GET /api/admin/banners'(req) {
    await admin(req);
    const now = new Date();
    const r = await db.query(
      `SELECT b.*, coalesce(s.views, 0) AS views7, coalesce(s.clicks, 0) AS clicks7 FROM banners b
         LEFT JOIN LATERAL (SELECT sum(views)::int AS views, sum(clicks)::int AS clicks FROM banner_stats WHERE banner_id = b.id AND day > ${TODAY} - 7) s ON true
        WHERE b.removed_at IS NULL ORDER BY b.sort, b.id`,
    );
    return { banners: r.rows.map((b) => ({ ...view(b, now), views7: b.views7, clicks7: b.clicks7 })), now: now.toISOString(), maxLive: MAX_LIVE };
  },

  async 'POST /api/admin/banners'(req) {
    const me = await admin(req);
    const b = await readJson(req);
    const id = b.id === undefined || b.id === null ? null : idOf(b.id);
    if (b.id !== undefined && b.id !== null && !id) throw new HttpError(400, 'Geçersiz banner');
    const prev = id ? (await db.query('SELECT * FROM banners WHERE id = $1 AND removed_at IS NULL', [id])).rows[0] : null;
    if (id && !prev) throw new HttpError(404, 'Banner bulunamadı');
    const f = await fieldsOf(b, prev);
    const vals = [f.title, f.subtitle, f.cta, f.link, f.imageUrl, f.art, f.showText, f.accent, f.startsAt, f.endsAt, f.enabled, me.id];
    const row = (
      prev
        ? await db.query(
            `UPDATE banners SET title = $1, subtitle = $2, cta = $3, link = $4, image_url = $5, art = $6, show_text = $7, accent = $8, starts_at = $9, ends_at = $10,
               enabled = $11, first_on_at = coalesce(first_on_at, CASE WHEN $11 THEN now() END), updated_by = $12, updated_at = now() WHERE id = $13 RETURNING *`,
            [...vals, id],
          )
        : await db.query(
            `INSERT INTO banners (title, subtitle, cta, link, image_url, art, show_text, accent, starts_at, ends_at, enabled, first_on_at, created_by, updated_by, sort)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CASE WHEN $11 THEN now() END, $12, $12, (SELECT coalesce(max(sort), 0) + 1 FROM banners WHERE removed_at IS NULL)) RETURNING *`,
            vals,
          )
    ).rows[0];
    await audit(db, me.id, prev ? 'banner.update' : 'banner.create', { banner: String(row.id), before: plain(prev), after: plain(row) });
    return { banner: view(row, new Date()) };
  },

  async 'POST /api/admin/banners/toggle'(req) {
    const me = await admin(req);
    const b = await readJson(req);
    const id = idOf(b.id);
    if (!id || typeof b.enabled !== 'boolean') throw new HttpError(400, 'Geçersiz istek');
    const r = await db.query(
      `UPDATE banners SET enabled = $2, first_on_at = coalesce(first_on_at, CASE WHEN $2 THEN now() END), updated_by = $3, updated_at = now()
        WHERE id = $1 AND removed_at IS NULL RETURNING *`,
      [id, b.enabled, me.id],
    );
    if (!r.rowCount) throw new HttpError(404, 'Banner bulunamadı');
    await audit(db, me.id, 'banner.toggle', { banner: id, enabled: b.enabled });
    return { banner: view(r.rows[0], new Date()) };
  },

  async 'POST /api/admin/banners/order'(req) {
    const me = await admin(req);
    const b = await readJson(req);
    const ids = Array.isArray(b.ids) ? b.ids.map(idOf) : [];
    if (!ids.length || ids.some((x) => !x) || new Set(ids).size !== ids.length) throw new HttpError(400, 'Sıralama: bütün bannerların kimlikleri');
    const all = (await db.query('SELECT id::text AS id FROM banners WHERE removed_at IS NULL')).rows.map((x) => x.id);
    if (all.length !== ids.length || all.some((x) => !ids.includes(x))) throw new HttpError(409, 'Liste değişmiş; sayfayı yenileyip yeniden sıralayın');
    await db.query('UPDATE banners b SET sort = o.n, updated_by = $2, updated_at = now() FROM unnest($1::bigint[]) WITH ORDINALITY AS o(id, n) WHERE b.id = o.id', [ids, me.id]);
    await audit(db, me.id, 'banner.order', { ids });
    return bannerRoutes['GET /api/admin/banners'](req);
  },

  async 'POST /api/admin/banners/remove'(req) {
    const me = await admin(req);
    const id = idOf((await readJson(req)).id);
    if (!id) throw new HttpError(400, 'Geçersiz banner');
    const r = await db.query('UPDATE banners SET removed_at = now(), removed_by = $2, enabled = false WHERE id = $1 AND removed_at IS NULL RETURNING *', [id, me.id]);
    if (!r.rowCount) throw new HttpError(404, 'Banner bulunamadı');
    await audit(db, me.id, 'banner.remove', { banner: id, before: plain(r.rows[0]) });
    return { removed: true };
  },

  async 'GET /api/admin/banners/stats'(req, url) {
    await admin(req);
    const days = int(Number(url.searchParams.get('days') ?? 30), 1, 90) ?? 30;
    const r = await db.query(
      `SELECT banner_id::text AS id, day::text AS day, views, clicks FROM banner_stats WHERE day > ${TODAY} - $1::int ORDER BY day, banner_id`,
      [days],
    );
    return { days, rows: r.rows };
  },

  async 'POST /api/banners/seen'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const ids = (Array.isArray(b.ids) ? b.ids : []).slice(0, MAX_LIVE).map(idOf).filter(Boolean);
    await bump([...new Set(ids)].filter((id) => firstToday('v', me.id, id)), 'views');
    return { ok: true };
  },

  async 'POST /api/banners/click'(req) {
    const me = await auth(req);
    const id = idOf((await readJson(req)).id);
    if (!id) throw new HttpError(400, 'Geçersiz banner');
    if (firstToday('c', me.id, id)) await bump([id], 'clicks');
    return { ok: true };
  },
};
