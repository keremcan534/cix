// Destek talepleri (Destek › Yeni talep and Taleplerim; Yönetim › Destek): a person writes to the support team under a
// category, with up to 3 evidence photos (media.mjs kind ticket: ticket/<their id>/…), and both sides write in the
// ticket's thread until one of them closes it. Staff are admins and moderators. The person sees staff replies as
// "Destek", never a name. A staff reply reaches them as a personal Similar Ekibi notice (team.mjs) and a push; neither
// carries the reply's text, which may hold an IBAN or a phone number.
//
//   GET  /api/support/tickets                                              → { tickets, open, maxOpen }  (mine, newest first)
//   POST /api/support/tickets { category, text, photos?, feedback?, ref }  → { ticket, replay }
//   POST /api/support/reply   { id, text }                                 → { ticket }  (an answered or closed ticket opens again)
//   POST /api/support/close   { id }                                       → { ticket }
//   GET  /api/admin/support?status=waiting|answered|closed                 → { tickets, waiting }  (staff)
//   GET  /api/admin/support/ticket?id=                                     → { ticket }  (staff)
//   POST /api/admin/support/reply  { id, text, close? }                    → { ticket }  (staff)
//   POST /api/admin/support/status { id, status: open|answered|closed }    → { ticket }  (staff)
//
// Limits, so the queue can't be flooded: at most MAX_OPEN tickets that aren't closed, MAX_PER_DAY new ones in 24 hours,
// MAX_MESSAGES lines in one thread, and replies at most 20 a minute.
// No contact filter here (contact-filter.mjs): only the person and staff read a ticket, never other users, and support
// often needs exactly what the filter refuses (the account's phone number, a withdrawal's IBAN, an e-mail address, a
// payment reference, a link to the problem). Refusing it, and counting it towards the automatic mute, would punish
// people for asking for help. Blocks don't apply either: the person writes to the team, not to someone they can see.
// Kept: a ticket, its photos and its thread while the account exists. A closed ticket and its photos are deleted
// RETAIN_DAYS (365) after it was closed; every ticket goes with the account (social.mjs eraseAccount).
import { HttpError, REF, auth, db, env, int, limit, readJson, text, tx } from './core.mjs';
import { removeFiles, verifyUpload } from './media.mjs';
import { notify } from './push.mjs';

/** The app's categories (app/src/data/catalog.ts TICKET_CATEGORIES). */
export const CATEGORIES = ['Teknik', 'Üyelik', 'Kazanç', 'Ödeme', 'Güvenlik', 'Ajans', 'Şikâyet', 'İtiraz', 'Moderasyon kararı', 'Hesap kısıtlaması', 'Ajans transferi', 'Oyun sonucu'];
export const MAX_OPEN = 3;
export const MAX_PER_DAY = 5;
export const MAX_PHOTOS = 3;
const MAX_MESSAGES = 200;
const RETAIN_DAYS = 365;
const STAFF_STATUS = ['open', 'answered', 'closed'];

const numberOf = (id) => `TK-${10_000 + Number(id)}`;

async function staff(req) {
  const u = await auth(req);
  if (u.role !== 'moderator' && u.role !== 'admin') throw new HttpError(403, 'Yetkili hesabı gerekli');
  return u;
}

const idOf = (v) => {
  const id = typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : int(v, 1, Number.MAX_SAFE_INTEGER);
  if (!id) throw new HttpError(400, 'Geçersiz talep');
  return id;
};

/** Only photos this person put in the storage for a ticket (ticket/<their id>/…), at most MAX_PHOTOS. */
function photosOf(v, me) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > MAX_PHOTOS) throw new HttpError(400, `En fazla ${MAX_PHOTOS} fotoğraf eklenebilir`);
  const base = (env.S3_PUBLIC_URL ?? '').replace(/\/$/, '');
  const mine = `${base}/ticket/${me.id}/`;
  for (const p of v) {
    if (!base || typeof p !== 'string' || p.length > 500 || !p.startsWith(mine) || !/^[A-Za-z0-9._-]+$/.test(p.slice(mine.length))) throw new HttpError(400, 'Geçersiz fotoğraf');
  }
  return [...new Set(v)];
}

/**
 * A ticket as the person (or, with `staffView`, staff) sees it. Lines are 'user' or 'support'; only staff see which
 * staff member wrote one.
 */
function view(t, lines, staffView = false) {
  return {
    id: String(t.id),
    number: numberOf(t.id),
    category: t.category,
    feedback: t.feedback,
    text: t.body,
    photos: t.photos,
    status: t.status,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    closedAt: t.closed_at,
    messages: lines.map((m) => ({
      id: String(m.id),
      from: m.staff ? 'support' : 'user',
      text: m.body,
      createdAt: m.created_at,
      ...(staffView && m.staff ? { by: { id: m.author, name: m.author_name } } : {}),
    })),
    ...(staffView ? { user: { id: t.user_id, name: t.user_name, username: t.username ?? null, since: t.user_since }, closedBy: t.closed_by_name ?? null } : {}),
  };
}

/** The threads of these tickets, by ticket id. */
async function linesOf(q, ids) {
  const by = new Map(ids.map((id) => [String(id), []]));
  if (!ids.length) return by;
  const r = await q.query(
    'SELECT m.*, u.name AS author_name FROM support_messages m JOIN users u ON u.id = m.author WHERE m.ticket_id = ANY($1::bigint[]) ORDER BY m.id',
    [ids],
  );
  for (const m of r.rows) by.get(String(m.ticket_id))?.push(m);
  return by;
}

const STAFF_SELECT = `SELECT t.*, u.name AS user_name, u.username, u.created_at AS user_since, cb.name AS closed_by_name
  FROM support_tickets t JOIN users u ON u.id = t.user_id LEFT JOIN users cb ON cb.id = t.closed_by`;

async function staffTicket(q, id) {
  const t = (await q.query(`${STAFF_SELECT} WHERE t.id = $1`, [id])).rows[0];
  if (!t) throw new HttpError(404, 'Talep bulunamadı');
  return view(t, (await linesOf(q, [t.id])).get(String(t.id)), true);
}

async function myTicket(q, id) {
  const t = (await q.query('SELECT * FROM support_tickets WHERE id = $1', [id])).rows[0];
  return view(t, (await linesOf(q, [t.id])).get(String(t.id)));
}

/** Tickets not closed, for the MAX_OPEN rule. */
const openCount = async (c, uid) => (await c.query("SELECT count(*)::int AS n FROM support_tickets WHERE user_id = $1 AND status <> 'closed'", [uid])).rows[0].n;
const tooMany = () => Object.assign(new HttpError(429, `En fazla ${MAX_OPEN} açık talebin olabilir. Çözülen bir talebini kapatıp tekrar dene.`), { extra: { code: 'tickets_open' } });

/** One line in a ticket's thread (the ticket row locked); refused past MAX_MESSAGES. */
async function addLine(c, ticket, author, isStaff, body) {
  const n = (await c.query('SELECT count(*)::int AS n FROM support_messages WHERE ticket_id = $1', [ticket])).rows[0].n;
  if (n >= MAX_MESSAGES) throw new HttpError(409, 'Bu talep çok uzadı; gerekirse yeni bir talep aç');
  await c.query('INSERT INTO support_messages (ticket_id, author, staff, body) VALUES ($1, $2, $3, $4)', [ticket, author, isStaff, body]);
}

/** How often the clean-up runs (SUPPORT_PRUNE_MS; tests run it on every list). */
const PRUNE_MS = (() => {
  const n = Number(env.SUPPORT_PRUNE_MS ?? 3_600_000);
  return Number.isFinite(n) && n >= 0 ? n : 3_600_000;
})();
let prunedAt = 0;
/** Once an hour: closed tickets past RETAIN_DAYS go, their photos with them. Never fails a request. */
async function prune() {
  if (Date.now() - prunedAt < PRUNE_MS) return;
  prunedAt = Date.now();
  try {
    const r = await db.query(`DELETE FROM support_tickets WHERE status = 'closed' AND closed_at < now() - interval '${RETAIN_DAYS} days' RETURNING photos`);
    const photos = r.rows.flatMap((x) => x.photos);
    if (photos.length) removeFiles(photos);
  } catch (e) {
    console.error('support prune', e.message);
  }
}

/** Tells the person a staff member answered ticket `t`: a personal Similar Ekibi notice and a push, without the text. */
async function tellAnswered(c, t, by) {
  const no = numberOf(t.id);
  await c.query("INSERT INTO team_notices (kind, title, body, link, target, created_by) VALUES ('notice', $1, $2, '/destek?tab=talepler', $3, $4)", [
    `Destek yanıtı · #${no}`,
    `#${no} numaralı talebine destek ekibinden yanıt geldi. Destek › Taleplerim’den okuyabilirsin.`,
    t.user_id,
    by,
  ]);
  return () => notify([t.user_id], { title: 'Destek yanıtı', body: `#${no} numaralı talebine yanıt geldi`, data: { type: 'support', ticket: String(t.id) } });
}

export const supportRoutes = {
  async 'GET /api/support/tickets'(req) {
    const me = await auth(req);
    void prune();
    const r = await db.query('SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY id DESC LIMIT 50', [me.id]);
    const lines = await linesOf(db, r.rows.map((t) => t.id));
    return {
      tickets: r.rows.map((t) => view(t, lines.get(String(t.id)))),
      open: r.rows.filter((t) => t.status !== 'closed').length,
      maxOpen: MAX_OPEN,
    };
  },

  async 'POST /api/support/tickets'(req) {
    const me = await auth(req);
    limit(`support:${me.id}`, 10, 'Çok hızlı talep açıyorsun, biraz bekle');
    const b = await readJson(req);
    if (!CATEGORIES.includes(b.category)) throw new HttpError(400, 'Geçersiz kategori');
    const body = text(b.text, 10, 2000, 'Açıklama');
    const photos = photosOf(b.photos, me);
    if (!REF.test(b.ref ?? '')) throw new HttpError(400, 'Geçersiz istek kimliği');
    const replay = async () => {
      const t = (await db.query('SELECT id FROM support_tickets WHERE user_id = $1 AND ref = $2', [me.id, b.ref])).rows[0];
      return t ? { ticket: await myTicket(db, t.id), replay: true } : null;
    };
    const seen = await replay();
    if (seen) return seen;
    // A photo must really be in the storage, within the type and size of a ticket's photo.
    for (const p of photos) await verifyUpload(p, 'ticket');
    try {
      const id = await tx(async (c) => {
        // One request at a time per person, so the limits below can't be passed by sending many at once.
        await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [me.id]);
        if ((await openCount(c, me.id)) >= MAX_OPEN) throw tooMany();
        const today = (await c.query("SELECT count(*)::int AS n FROM support_tickets WHERE user_id = $1 AND created_at > now() - interval '24 hours'", [me.id])).rows[0].n;
        if (today >= MAX_PER_DAY) throw Object.assign(new HttpError(429, `Bir günde en fazla ${MAX_PER_DAY} talep açılabilir. Açık talebine yazmaya devam edebilirsin.`), { extra: { code: 'tickets_day' } });
        const r = await c.query('INSERT INTO support_tickets (user_id, category, feedback, body, photos, ref) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [
          me.id,
          b.category,
          b.feedback === true,
          body,
          photos,
          b.ref,
        ]);
        return r.rows[0].id;
      });
      return { ticket: await myTicket(db, id), replay: false };
    } catch (e) {
      // Two copies of the same request at once: the second hits (user_id, ref).
      if (e.code === '23505') return (await replay()) ?? Promise.reject(e);
      throw e;
    }
  },

  async 'POST /api/support/reply'(req) {
    const me = await auth(req);
    limit(`support-reply:${me.id}`, 20, 'Çok hızlı yazıyorsun, biraz bekle');
    const b = await readJson(req);
    const id = idOf(b.id);
    const body = text(b.text, 1, 2000, 'Mesaj');
    await tx(async (c) => {
      const t = (await c.query('SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, me.id])).rows[0];
      if (!t) throw new HttpError(404, 'Talep bulunamadı');
      // Writing on a closed ticket opens it again, within the open-ticket limit.
      if (t.status === 'closed' && (await openCount(c, me.id)) >= MAX_OPEN) throw tooMany();
      await addLine(c, id, me.id, false, body);
      await c.query(
        `UPDATE support_tickets SET status = CASE WHEN status IN ('answered', 'closed') THEN 'reopened' ELSE status END,
                updated_at = now(), closed_at = NULL, closed_by = NULL WHERE id = $1`,
        [id],
      );
    });
    return { ticket: await myTicket(db, id) };
  },

  async 'POST /api/support/close'(req) {
    const me = await auth(req);
    const id = idOf((await readJson(req)).id);
    const r = await db.query(
      `UPDATE support_tickets SET status = 'closed', closed_at = now(), closed_by = $2, updated_at = now()
        WHERE id = $1 AND user_id = $2 AND status <> 'closed' RETURNING id`,
      [id, me.id],
    );
    if (!r.rowCount && !(await db.query('SELECT 1 FROM support_tickets WHERE id = $1 AND user_id = $2', [id, me.id])).rowCount) throw new HttpError(404, 'Talep bulunamadı');
    return { ticket: await myTicket(db, id) };
  },

  /**
   * The queue: 'waiting' (open or written to again, the longest waiting first), 'answered' (waiting for the person)
   * or 'closed' (newest first). Each with its person, how many lines and the last one. `waiting` counts the queue.
   */
  async 'GET /api/admin/support'(req, url) {
    await staff(req);
    void prune();
    const status = url.searchParams.get('status') ?? 'waiting';
    const where = { waiting: "t.status IN ('open', 'reopened')", answered: "t.status = 'answered'", closed: "t.status = 'closed'" }[status];
    if (!where) throw new HttpError(400, 'Geçersiz durum');
    const order = status === 'waiting' ? 't.updated_at ASC' : status === 'closed' ? 't.closed_at DESC' : 't.updated_at DESC';
    const r = await db.query(
      `${STAFF_SELECT.replace('SELECT t.*', `SELECT t.*, (SELECT count(*) FROM support_messages m WHERE m.ticket_id = t.id) AS lines,
              (SELECT row_to_json(x) FROM (SELECT m.staff, left(m.body, 140) AS body, m.created_at FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) x) AS last`)}
        WHERE ${where} ORDER BY ${order} LIMIT 200`,
    );
    const waiting = (await db.query("SELECT count(*)::int AS n FROM support_tickets WHERE status IN ('open', 'reopened')")).rows[0].n;
    return {
      tickets: r.rows.map((t) => ({
        ...view(t, [], true),
        lines: Number(t.lines),
        last: t.last ? { from: t.last.staff ? 'support' : 'user', text: t.last.body, createdAt: t.last.created_at } : null,
      })),
      waiting,
    };
  },

  async 'GET /api/admin/support/ticket'(req, url) {
    await staff(req);
    return { ticket: await staffTicket(db, idOf(url.searchParams.get('id'))) };
  },

  /** A staff reply; `close` also closes the ticket. The person is told (tellAnswered). */
  async 'POST /api/admin/support/reply'(req) {
    const me = await staff(req);
    limit(`support-staff:${me.id}`, 60, 'Çok hızlı yazıyorsun, biraz bekle');
    const b = await readJson(req);
    const id = idOf(b.id);
    const body = text(b.text, 1, 2000, 'Yanıt');
    const close = b.close === true;
    const tell = await tx(async (c) => {
      const t = (await c.query('SELECT * FROM support_tickets WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!t) throw new HttpError(404, 'Talep bulunamadı');
      await addLine(c, id, me.id, true, body);
      await c.query(
        `UPDATE support_tickets SET status = $2, updated_at = now(),
                closed_at = CASE WHEN $2 = 'closed' THEN now() END, closed_by = CASE WHEN $2 = 'closed' THEN $3::uuid END WHERE id = $1`,
        [id, close ? 'closed' : 'answered', me.id],
      );
      return tellAnswered(c, t, me.id);
    });
    tell();
    return { ticket: await staffTicket(db, id) };
  },

  async 'POST /api/admin/support/status'(req) {
    const me = await staff(req);
    const b = await readJson(req);
    const id = idOf(b.id);
    if (!STAFF_STATUS.includes(b.status)) throw new HttpError(400, 'Durum open, answered veya closed olmalı');
    const r = await db.query(
      `UPDATE support_tickets SET status = $2, updated_at = now(),
              closed_at = CASE WHEN $2 = 'closed' THEN coalesce(closed_at, now()) END, closed_by = CASE WHEN $2 = 'closed' THEN coalesce(closed_by, $3::uuid) END
        WHERE id = $1 RETURNING id`,
      [id, b.status, me.id],
    );
    if (!r.rowCount) throw new HttpError(404, 'Talep bulunamadı');
    return { ticket: await staffTicket(db, id) };
  },
};

/** The data copy (my-data.mjs): my tickets with their threads, staff shown only as "Destek". */
export async function ticketsOf(q, uid) {
  const r = await q.query('SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY id', [uid]);
  const lines = await linesOf(q, r.rows.map((t) => t.id));
  return r.rows.map((t) => view(t, lines.get(String(t.id))));
}
