// Anlar: short posts with an optional photo, likes and comments, kept on the server so every phone sees them.
//
//   GET  /api/moments?tab=recent|popular|friends&topic=&user=&before=  → { moments, posting }   (50 per page, newest
//                                                                         first; popular: the last 7 days by likes and
//                                                                         comments; posting: whether I may post, below)
//   POST /api/moments          { text, imageUrl?, topic?, ref }        → { moment, replay }
//   POST /api/moments/delete   { id }                                  → { deleted: true }  (the writer or staff)
//   POST /api/moments/like     { id, like }                            → { liked, likes }
//   GET  /api/moments/comments?id=                                     → { comments }  (oldest first, with likes)
//   POST /api/moments/comment  { id, text, ref }                       → { comment, comments }
//   POST /api/moments/comment/delete { id }                            → { deleted: true }  (its writer, the post's writer or staff)
//   POST /api/moments/comment/like   { id, like }                      → { liked, likes }
//
// Posting needs Yankı Lv.5 (POST_CHARM points: diamonds received in gifts, wallet.mjs charmPoints); staff may always
// post. Commenting and liking are open to everyone. Posts and comments also go through the spam filter
// (spam-filter.mjs: swearing, sexual text, ads and other apps), refused with 400 code text_blocked.
//
// Nobody sees the posts and comments of someone either side has blocked, of a deleted account or of a banned one.
// Text is checked for contact details like every public text (contact-filter.mjs), and a mute that covers public
// text (sanctions.mjs 'post') stops posting and commenting. A photo must be one this person uploaded to the
// app's storage (media.mjs, kind 'moment'). Posts and comments are reported with POST /api/report
// ('moment' / 'comment'); staff remove them from the report (Yönetim › Şikâyetler) or here.
import { HttpError, LIVE_SANCTION, REF, ageOf, auth, blockedBetween, db, env, int, limit, publicText, readJson, userId } from './core.mjs';
import { looksOf } from './economy.mjs';
import { notify } from './push.mjs';
import { assertMay } from './sanctions.mjs';
import { SPAM_MESSAGES, checkSpam } from './spam-filter.mjs';
import { charmPoints } from './wallet.mjs';
import { removeFiles, verifyUpload } from './media.mjs';

const PAGE = 50;
/** The topics the app offers (app/src/data/social-ui.ts MOMENT_TOPICS). */
export const TOPICS = ['date', 'pk', 'ootd', 'travel', 'music'];
const TABS = ['recent', 'popular', 'friends'];

const isStaff = (u) => u.role === 'moderator' || u.role === 'admin';

/** Yankı Lv.5 starts at 250 points (app/src/data/charm.ts CHARM_XP). MOMENT_CHARM: tests post without it. */
export const POST_LEVEL = 5;
export const POST_CHARM = (() => {
  const n = Number(env.MOMENT_CHARM ?? 250);
  return Number.isSafeInteger(n) && n >= 0 ? n : 250;
})();

/** Whether `me` may post: staff always, others from Yankı Lv.5. */
async function posting(me) {
  const points = await charmPoints(db, me.id);
  return { allowed: isStaff(me) || points >= POST_CHARM, needLevel: POST_LEVEL, need: POST_CHARM, points };
}

/** Refuses swearing, sexual text and ads (spam-filter.mjs); `field` is the request's key. Returns `s`. */
function noSpam(s, field) {
  const r = checkSpam(s);
  if (r.ok) return s;
  throw Object.assign(new HttpError(400, SPAM_MESSAGES[r.category]), { extra: { code: 'text_blocked', category: r.category, field } });
}

/** Hidden from $1 (the reader): a writer either side blocked, a deleted or banned account. `a` is the writer's id. */
const hiddenWriter = (a) => `(wu.deleted_at IS NOT NULL
  OR EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = ${a}) OR (b.blocker = ${a} AND b.blocked = $1))
  OR EXISTS (SELECT 1 FROM user_sanctions s WHERE s.user_id = ${a} AND s.sanction_type = 'account_ban' AND ${LIVE_SANCTION}))`;

/** A post with its counts, as $1 (the reader) sees it. */
const POST = `SELECT m.*, wu.name, wu.avatar_url, CASE WHEN wu.gender_hidden THEN NULL ELSE wu.gender END AS gender, wu.birth_date,
    (SELECT count(*) FROM moment_likes l WHERE l.moment = m.id)::int AS likes,
    (SELECT count(*) FROM moment_comments c JOIN users cu ON cu.id = c.author WHERE c.moment = m.id AND c.deleted_at IS NULL AND cu.deleted_at IS NULL)::int AS comments,
    EXISTS (SELECT 1 FROM moment_likes l WHERE l.moment = m.id AND l.user_id = $1) AS liked
  FROM moments m JOIN users wu ON wu.id = m.author
  WHERE m.deleted_at IS NULL AND NOT ${hiddenWriter('m.author')}`;

const writer = (x, looks) => ({
  id: x.author,
  name: x.name,
  avatarUrl: x.avatar_url ?? null,
  gender: x.gender ?? null,
  age: x.birth_date ? ageOf(x.birth_date) : null,
  vipLevel: looks?.vipLevel ?? 0,
  frame: looks?.frame ?? null,
});

async function withWriters(rows) {
  const looks = await looksOf([...new Set(rows.map((x) => x.author))]);
  return rows.map((x) => ({
    id: String(x.id),
    author: writer(x, looks[x.author]),
    text: x.body,
    imageUrl: x.image_url ?? null,
    topic: x.topic ?? null,
    likes: x.likes,
    comments: x.comments,
    liked: x.liked,
    createdAt: x.created_at,
  }));
}

const momentId = (v) => {
  const id = typeof v === 'string' && /^\d{1,18}$/.test(v) ? Number(v) : int(v, 1, Number.MAX_SAFE_INTEGER);
  if (!id || !Number.isSafeInteger(id)) throw new HttpError(400, 'Geçersiz an');
  return id;
};

/** A post $1 may see, or 404. */
async function visible(me, id) {
  const r = await db.query(`${POST} AND m.id = $2`, [me.id, id]);
  if (!r.rowCount) throw new HttpError(404, 'Bu an artık yok');
  return r.rows[0];
}

/** Only a photo this person put in the storage for a moment (media.mjs: moment/<their id>/...). */
function photoOf(v, me) {
  if (v === undefined || v === null || v === '') return null;
  const base = (env.S3_PUBLIC_URL ?? '').replace(/\/$/, '');
  const mine = `${base}/moment/${me.id}/`;
  if (!base || typeof v !== 'string' || v.length > 500 || !v.startsWith(mine) || !/^[A-Za-z0-9._-]+$/.test(v.slice(mine.length)))
    throw new HttpError(400, 'Geçersiz fotoğraf');
  return v;
}

async function comments(me, id) {
  const r = await db.query(
    `SELECT c.*, wu.name, wu.avatar_url, CASE WHEN wu.gender_hidden THEN NULL ELSE wu.gender END AS gender, wu.birth_date,
        (SELECT count(*) FROM moment_comment_likes l WHERE l.comment = c.id)::int AS likes,
        EXISTS (SELECT 1 FROM moment_comment_likes l WHERE l.comment = c.id AND l.user_id = $1) AS liked
       FROM moment_comments c JOIN users wu ON wu.id = c.author
      WHERE c.moment = $2 AND c.deleted_at IS NULL AND NOT ${hiddenWriter('c.author')}
      ORDER BY c.id LIMIT 300`,
    [me.id, id],
  );
  const looks = await looksOf([...new Set(r.rows.map((x) => x.author))]);
  return r.rows.map((x) => ({ id: String(x.id), author: writer(x, looks[x.author]), text: x.body, likes: x.likes, liked: x.liked, createdAt: x.created_at }));
}

export const momentRoutes = {
  async 'GET /api/moments'(req, url) {
    const me = await auth(req);
    const p = url.searchParams;
    const tab = p.get('tab') ?? 'recent';
    if (!TABS.includes(tab)) throw new HttpError(400, 'Geçersiz sekme');
    const topic = p.get('topic');
    if (topic && !TOPICS.includes(topic)) throw new HttpError(400, 'Geçersiz konu');
    const user = p.get('user') ? userId(p.get('user')) : null;
    if (user && user !== me.id && (await blockedBetween(me.id, user))) throw new HttpError(403, 'Bu kişinin anlarını göremezsin');
    const before = Number(p.get('before') ?? 0);
    const args = [me.id];
    const where = [];
    if (topic) where.push(`m.topic = $${args.push(topic)}`);
    if (user) where.push(`m.author = $${args.push(user)}`);
    if (tab === 'friends') where.push('(m.author = $1 OR m.author IN (SELECT followee FROM follows WHERE follower = $1))');
    let order = 'p.id DESC';
    if (tab === 'popular' && !user) {
      where.push("m.created_at > now() - interval '7 days'");
      order = 'p.likes + 2 * p.comments DESC, p.id DESC';
    } else if (Number.isSafeInteger(before) && before > 0) where.push(`m.id < $${args.push(before)}`);
    const r = await db.query(`SELECT * FROM (${POST}${where.map((w) => ` AND ${w}`).join('')}) p ORDER BY ${order} LIMIT ${PAGE}`, args);
    return { moments: await withWriters(r.rows), posting: await posting(me) };
  },

  async 'POST /api/moments'(req) {
    const me = await auth(req);
    await assertMay(me, 'post');
    const may = await posting(me);
    if (!may.allowed) throw Object.assign(new HttpError(403, `Anlar'da paylaşım Yankı Lv.${POST_LEVEL} ve üstü için`), { extra: { code: 'charm', ...may } });
    const b = await readJson(req);
    if (!REF.test(b.ref ?? '')) throw new HttpError(400, 'Geçersiz istek kimliği');
    const image = photoOf(b.imageUrl, me);
    if (image) await verifyUpload(image, 'moment');
    if (b.topic !== undefined && b.topic !== null && !TOPICS.includes(b.topic)) throw new HttpError(400, 'Geçersiz konu');
    const body = noSpam(await publicText(b.text ?? '', image ? 0 : 1, 1000, 'An', me, 'moment.post', 'text'), 'text');
    // A retry of a post already stored is not counted against the pace.
    if (!(await db.query('SELECT 1 FROM moments WHERE author = $1 AND ref = $2', [me.id, b.ref])).rowCount) limit(`moment:${me.id}`, 3, 'Çok hızlı paylaşıyorsun, biraz bekle');
    const r = await db.query(
      'INSERT INTO moments (author, body, image_url, topic, ref) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (author, ref) DO NOTHING RETURNING id',
      [me.id, body, image, b.topic ?? null, b.ref],
    );
    const id = r.rowCount ? r.rows[0].id : (await db.query('SELECT id FROM moments WHERE author = $1 AND ref = $2', [me.id, b.ref])).rows[0].id;
    const row = await db.query(`${POST} AND m.id = $2`, [me.id, id]);
    if (!row.rowCount) throw new HttpError(404, 'Bu an artık yok');
    return { moment: (await withWriters(row.rows))[0], replay: !r.rowCount };
  },

  async 'POST /api/moments/delete'(req) {
    const me = await auth(req);
    const id = momentId((await readJson(req)).id);
    const r = await db.query('SELECT author, image_url FROM moments WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (!r.rowCount) throw new HttpError(404, 'Bu an artık yok');
    if (r.rows[0].author !== me.id && !isStaff(me)) throw new HttpError(403, 'Yalnızca kendi anını silebilirsin');
    await db.query('UPDATE moments SET deleted_at = now(), removed_by = $2 WHERE id = $1', [id, me.id]);
    // Its author deleting it takes the photo out of the storage too. One staff took down, or one with an open
    // report, keeps it: that is what the report or an appeal is decided on.
    if (r.rows[0].author === me.id && r.rows[0].image_url) {
      const open = await db.query("SELECT 1 FROM reports WHERE target_type = 'moment' AND target_id = $1 AND status = 'open' LIMIT 1", [String(id)]);
      if (!open.rowCount) removeFiles([r.rows[0].image_url], me.id);
    }
    return { deleted: true };
  },

  async 'POST /api/moments/like'(req) {
    const me = await auth(req);
    limit(`moment-like:${me.id}`, 60, 'Çok hızlı, biraz bekle');
    const b = await readJson(req);
    const id = momentId(b.id);
    if (typeof b.like !== 'boolean') throw new HttpError(400, 'like true veya false olmalı');
    await visible(me, id);
    if (b.like) await db.query('INSERT INTO moment_likes (moment, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, me.id]);
    else await db.query('DELETE FROM moment_likes WHERE moment = $1 AND user_id = $2', [id, me.id]);
    const n = await db.query('SELECT count(*)::int AS n FROM moment_likes WHERE moment = $1', [id]);
    return { liked: b.like, likes: n.rows[0].n };
  },

  async 'GET /api/moments/comments'(req, url) {
    const me = await auth(req);
    const id = momentId(url.searchParams.get('id'));
    await visible(me, id);
    return { comments: await comments(me, id) };
  },

  async 'POST /api/moments/comment'(req) {
    const me = await auth(req);
    await assertMay(me, 'post');
    const b = await readJson(req);
    const id = momentId(b.id);
    if (!REF.test(b.ref ?? '')) throw new HttpError(400, 'Geçersiz istek kimliği');
    const post = await visible(me, id);
    const body = noSpam(await publicText(b.text, 1, 300, 'Yorum', me, 'moment.comment', 'text'), 'text');
    limit(`moment-comment:${me.id}`, 20, 'Çok hızlı yorum yapıyorsun, biraz bekle');
    const r = await db.query(
      'INSERT INTO moment_comments (moment, author, body, ref) VALUES ($1,$2,$3,$4) ON CONFLICT (author, ref) DO NOTHING RETURNING id',
      [id, me.id, body, b.ref],
    );
    if (r.rowCount && post.author !== me.id) notify([post.author], { title: me.name, body: `Anına yorum yaptı: ${body.slice(0, 80)}`, data: { type: 'moment', id: String(id) } });
    const all = await comments(me, id);
    const cid = String(r.rowCount ? r.rows[0].id : (await db.query('SELECT id FROM moment_comments WHERE author = $1 AND ref = $2', [me.id, b.ref])).rows[0].id);
    return { comment: all.find((c) => c.id === cid) ?? null, comments: all };
  },

  async 'POST /api/moments/comment/delete'(req) {
    const me = await auth(req);
    const v = (await readJson(req)).id;
    const id = momentId(v);
    const r = await db.query('SELECT c.author, m.author AS post_author FROM moment_comments c JOIN moments m ON m.id = c.moment WHERE c.id = $1 AND c.deleted_at IS NULL', [id]);
    if (!r.rowCount) throw new HttpError(404, 'Bu yorum artık yok');
    const c = r.rows[0];
    if (c.author !== me.id && c.post_author !== me.id && !isStaff(me)) throw new HttpError(403, 'Bu yorumu silemezsin');
    await db.query('UPDATE moment_comments SET deleted_at = now(), removed_by = $2 WHERE id = $1', [id, me.id]);
    return { deleted: true };
  },

  async 'POST /api/moments/comment/like'(req) {
    const me = await auth(req);
    limit(`moment-like:${me.id}`, 60, 'Çok hızlı, biraz bekle');
    const b = await readJson(req);
    const id = momentId(b.id);
    if (typeof b.like !== 'boolean') throw new HttpError(400, 'like true veya false olmalı');
    // A comment I can see: on a post I can see, by a writer I can see.
    const r = await db.query(
      `SELECT c.moment FROM moment_comments c JOIN users wu ON wu.id = c.author WHERE c.id = $2 AND c.deleted_at IS NULL AND NOT ${hiddenWriter('c.author')}`,
      [me.id, id],
    );
    if (!r.rowCount) throw new HttpError(404, 'Bu yorum artık yok');
    await visible(me, Number(r.rows[0].moment));
    if (b.like) await db.query('INSERT INTO moment_comment_likes (comment, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, me.id]);
    else await db.query('DELETE FROM moment_comment_likes WHERE comment = $1 AND user_id = $2', [id, me.id]);
    const n = await db.query('SELECT count(*)::int AS n FROM moment_comment_likes WHERE comment = $1', [id]);
    return { liked: b.like, likes: n.rows[0].n };
  },
};
