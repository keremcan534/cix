// Similar Ekibi (Mesajlar › Similar Ekibi) and the Odalar banners. The management writes notices: events, updates,
// rewards, rules and announcements, for everyone or for one person (a personal one also goes out as a push). A
// notice for everyone may run as an Odalar banner for 1–30 days. The Odalar banners also carry the top 3 agencies,
// receivers and senders of the day, week and month (gifts.mjs topBoard), read again at most once a minute.
//
//   GET  /api/team?before=                → { notices, unread }   everyone's and mine, newest first, 30 a page
//   GET  /api/team/unread                 → { unread }            new since I last opened it (30 days at most)
//   POST /api/team/seen { upTo }          → { unread }
//   GET  /api/room-banners                → { events, boards }    boards: { agency|charm|wealth: { day|week|month: rows } }
//   GET  /api/admin/team                  → { notices }           (admin) the latest 100, with whom each was for
//   POST /api/admin/team { kind, title, body?, imageUrl?, link?, target?, bannerDays? } → { notice }   (admin)
//   POST /api/admin/team/remove { id }    → { removed }           (admin)
//
// A link is a path in the app ('/siralama', '/oda/…'); a picture is one an admin uploaded (media.mjs kind notice).
import { HttpError, auth, db, env, int, limit, readJson, text, userId } from './core.mjs';
import { PERIODS, topBoard } from './gifts.mjs';
import { notify } from './push.mjs';
import { removeFiles } from './media.mjs';

export const KINDS = ['event', 'update', 'reward', 'rule', 'notice'];
const PAGE = 30;
const LINK = /^\/(?!\/)[A-Za-z0-9/_?=&.%-]{0,119}$/;
/** How long the banner boards are kept between reads (BANNER_CACHE_MS; tests read fresh). */
const CACHE_MS = (() => {
  const n = Number(env.BANNER_CACHE_MS ?? 60_000);
  return Number.isSafeInteger(n) && n >= 0 ? n : 60_000;
})();

async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}

const view = (x) => ({
  id: String(x.id),
  kind: x.kind,
  title: x.title,
  body: x.body,
  imageUrl: x.image_url ?? null,
  link: x.link ?? null,
  personal: x.target !== null,
  createdAt: x.created_at.toISOString(),
});

/** Notices I can read: everyone's and mine, not removed. */
const MINE = '(n.target IS NULL OR n.target = $1) AND n.removed_at IS NULL';

async function unread(me) {
  const r = await db.query(
    `SELECT count(*)::int AS n FROM team_notices n
      WHERE ${MINE} AND n.id > coalesce((SELECT last_id FROM team_notice_seen WHERE user_id = $1), 0)
        AND n.created_at > greatest($2::timestamptz - interval '7 days', now() - interval '30 days')`,
    [me.id, me.created_at],
  );
  return r.rows[0].n;
}

function photoOf(v) {
  if (v === undefined || v === null || v === '') return null;
  const base = (env.S3_PUBLIC_URL ?? '').replace(/\/$/, '');
  const dir = `${base}/notice/`;
  if (!base || typeof v !== 'string' || v.length > 500 || !v.startsWith(dir) || !/^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/.test(v.slice(dir.length))) throw new HttpError(400, 'Geçersiz görsel');
  return v;
}

let boards = null;
async function bannerBoards() {
  if (boards && Date.now() - boards.at < CACHE_MS) return boards.value;
  const value = {};
  for (const board of ['agency', 'charm', 'wealth']) {
    value[board] = {};
    for (const p of PERIODS) value[board][p] = await topBoard(board, p, 3);
  }
  boards = { at: Date.now(), value };
  return value;
}

export const teamRoutes = {
  async 'GET /api/team'(req, url) {
    const me = await auth(req);
    const before = url.searchParams.get('before');
    const b = before && /^\d{1,18}$/.test(before) ? before : null;
    const r = await db.query(`SELECT n.* FROM team_notices n WHERE ${MINE} AND ($2::bigint IS NULL OR n.id < $2) ORDER BY n.id DESC LIMIT ${PAGE}`, [me.id, b]);
    return { notices: r.rows.map(view), unread: await unread(me) };
  },

  async 'GET /api/team/unread'(req) {
    const me = await auth(req);
    return { unread: await unread(me) };
  },

  async 'POST /api/team/seen'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    if (typeof b.upTo !== 'string' || !/^\d{1,18}$/.test(b.upTo)) throw new HttpError(400, 'Geçersiz istek');
    // Never past the newest notice I can read, so a made-up id can't hide the next ones.
    await db.query(
      `INSERT INTO team_notice_seen (user_id, last_id)
         SELECT $1, coalesce(max(n.id), 0) FROM team_notices n WHERE ${MINE} AND n.id <= $2
       ON CONFLICT (user_id) DO UPDATE SET last_id = greatest(team_notice_seen.last_id, EXCLUDED.last_id)`,
      [me.id, b.upTo],
    );
    return { unread: await unread(me) };
  },

  async 'GET /api/room-banners'(req) {
    await auth(req);
    const ev = await db.query("SELECT n.* FROM team_notices n WHERE n.banner AND n.target IS NULL AND n.removed_at IS NULL AND n.ends_at > now() ORDER BY n.id DESC LIMIT 5");
    return { events: ev.rows.map((x) => ({ ...view(x), endsAt: x.ends_at.toISOString() })), boards: await bannerBoards() };
  },

  async 'GET /api/admin/team'(req) {
    await admin(req);
    const r = await db.query(
      `SELECT n.*, t.name AS target_name, c.name AS by_name FROM team_notices n
         LEFT JOIN users t ON t.id = n.target LEFT JOIN users c ON c.id = n.created_by
        WHERE n.removed_at IS NULL ORDER BY n.id DESC LIMIT 100`,
    );
    return {
      notices: r.rows.map((x) => ({
        ...view(x),
        target: x.target ? { id: x.target, name: x.target_name } : null,
        banner: x.banner,
        endsAt: x.ends_at?.toISOString() ?? null,
        by: x.by_name ?? null,
      })),
    };
  },

  async 'POST /api/admin/team'(req) {
    const me = await admin(req);
    limit(`team:${me.id}`, 30, 'Çok fazla duyuru, biraz bekle');
    const b = await readJson(req);
    if (!KINDS.includes(b.kind)) throw new HttpError(400, 'Geçersiz duyuru türü');
    const title = text(b.title, 2, 80, 'Başlık');
    const body = text(b.body ?? '', 0, 1000, 'Metin');
    const imageUrl = photoOf(b.imageUrl);
    const link = b.link === undefined || b.link === null || b.link === '' ? null : typeof b.link === 'string' && LINK.test(b.link) ? b.link : null;
    if ((b.link ?? '') !== '' && !link) throw new HttpError(400, 'Bağlantı uygulamada bir yol olmalı (ör. /siralama)');
    let target = null;
    if (b.target !== undefined && b.target !== null && b.target !== '') {
      target = userId(b.target);
      const t = (await db.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [target])).rows[0];
      if (!t) throw new HttpError(404, 'Kullanıcı bulunamadı');
    }
    const days = b.bannerDays === undefined || b.bannerDays === null || b.bannerDays === 0 ? 0 : int(b.bannerDays, 1, 30);
    if (days === null) throw new HttpError(400, 'Banner 1–30 gün gösterilebilir');
    if (days && target) throw new HttpError(400, 'Kişiye özel duyuru banner olamaz');
    const r = await db.query(
      `INSERT INTO team_notices (kind, title, body, image_url, link, target, banner, ends_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $7 THEN now() + make_interval(days => $8) END, $9) RETURNING *`,
      [b.kind, title, body, imageUrl, link, target, days > 0, days, me.id],
    );
    if (target) notify([target], { title: 'Similar Ekibi', body: title, data: { type: 'team' } });
    return { notice: view(r.rows[0]) };
  },

  async 'POST /api/admin/team/remove'(req) {
    const me = await admin(req);
    const b = await readJson(req);
    if (typeof b.id !== 'string' || !/^\d{1,18}$/.test(b.id)) throw new HttpError(400, 'Geçersiz istek');
    const r = await db.query('UPDATE team_notices SET removed_at = now(), removed_by = $2 WHERE id = $1 AND removed_at IS NULL RETURNING id, image_url', [b.id, me.id]);
    if (!r.rowCount) throw new HttpError(404, 'Duyuru bulunamadı');
    // Its picture leaves the storage unless another notice still shows it.
    const image = r.rows[0].image_url;
    if (image && !(await db.query('SELECT 1 FROM team_notices WHERE image_url = $1 AND removed_at IS NULL LIMIT 1', [image])).rowCount) removeFiles([image]);
    return { removed: true };
  },
};
