// Direct messages, stored on the server so they survive reinstalls and reach the other phone.
//
//   POST /api/messages       { to, text, ref }      → { message, replay }
//   GET  /api/messages?with=&before=                → { messages }       (newest first, 50 per page)
//   GET  /api/conversations                         → { conversations }  (last message and unread count)
//   POST /api/messages/read  { with }               → { read }
// Messages to or from someone either side has blocked are refused. Delivery to an open app is polling for
// now; a push / realtime channel comes with the notifications step.
import { HttpError, REF, auth, blockedBetween, db, readJson, text, userId } from './core.mjs';

const PAGE = 50;
const out = (m) => ({ id: Number(m.id), from: m.sender, to: m.recipient, text: m.body, createdAt: m.created_at, readAt: m.read_at });

export const messageRoutes = {
  async 'POST /api/messages'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const to = userId(b.to, 'alıcı');
    if (to === me.id) throw new HttpError(400, 'Kendine mesaj gönderemezsin');
    const body = text(b.text, 1, 1000, 'Mesaj');
    if (!REF.test(b.ref ?? '')) throw new HttpError(400, 'Geçersiz istek kimliği');
    const peer = await db.query('SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL', [to]);
    if (!peer.rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
    if (await blockedBetween(me.id, to)) throw new HttpError(403, 'Bu kişiye mesaj gönderemezsin');
    const r = await db.query('INSERT INTO messages (sender, recipient, body, ref) VALUES ($1,$2,$3,$4) ON CONFLICT (sender, ref) DO NOTHING RETURNING *', [me.id, to, body, b.ref]);
    if (r.rowCount) return { message: out(r.rows[0]), replay: false };
    const prev = await db.query('SELECT * FROM messages WHERE sender = $1 AND ref = $2', [me.id, b.ref]);
    return { message: out(prev.rows[0]), replay: true };
  },

  async 'GET /api/messages'(req, url) {
    const me = await auth(req);
    const peer = userId(url.searchParams.get('with'));
    const before = Number(url.searchParams.get('before') ?? 0);
    const r = await db.query(
      `SELECT * FROM messages
        WHERE LEAST(sender, recipient) = LEAST($1::uuid, $2::uuid) AND GREATEST(sender, recipient) = GREATEST($1::uuid, $2::uuid)
          AND ($3::bigint = 0 OR id < $3)
        ORDER BY id DESC LIMIT ${PAGE}`,
      [me.id, peer, Number.isSafeInteger(before) && before > 0 ? before : 0],
    );
    return { messages: r.rows.map(out) };
  },

  async 'GET /api/conversations'(req) {
    const me = await auth(req);
    const r = await db.query(
      `SELECT DISTINCT ON (peer) peer, m.*, u.name AS peer_name, u.avatar_url AS peer_avatar,
              (SELECT count(*) FROM messages x WHERE x.sender = peer AND x.recipient = $1 AND x.read_at IS NULL) AS unread
         FROM (SELECT *, CASE WHEN sender = $1 THEN recipient ELSE sender END AS peer FROM messages WHERE sender = $1 OR recipient = $1) m
         JOIN users u ON u.id = m.peer
        ORDER BY peer, m.id DESC`,
      [me.id],
    );
    const conversations = r.rows
      .map((x) => ({ user: { id: x.peer, name: x.peer_name, avatarUrl: x.peer_avatar }, last: out(x), unread: Number(x.unread) }))
      .sort((a, b) => b.last.id - a.last.id);
    return { conversations };
  },

  async 'POST /api/messages/read'(req) {
    const me = await auth(req);
    const peer = userId((await readJson(req)).with);
    const r = await db.query('UPDATE messages SET read_at = now() WHERE recipient = $1 AND sender = $2 AND read_at IS NULL', [me.id, peer]);
    return { read: r.rowCount };
  },
};
