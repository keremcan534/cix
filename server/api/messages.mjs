// Direct messages, stored on the server so they survive reinstalls and reach the other phone.
//
//   POST /api/messages       { to, text, image?, ref } → { message, replay, price?, coins? }
//   GET  /api/messages?with=&before=                → { messages }       (newest first, 50 per page)
//   GET  /api/conversations                         → { conversations }  (last message and unread count)
//   POST /api/messages/read  { with }               → { read }
// Messages to or from someone either side has blocked are refused. A new message rings the recipient's
// phone (push.mjs); an open app polls. At most 30 messages a minute per person, against spam. A message that
// shares a phone number, IBAN, e-mail, link or social media account is refused (contact-filter.mjs).
// A message from someone who isn't a streamer to a streamer they don't follow each other with costs dm_price
// coins (one-on-one.mjs pairOf), paid with the message; the answer then carries the sender's coins.
// A photo (image: a photo this person put in the storage for a chat, media.mjs dm/<their id>/…) goes with a
// streamer from the heart level, otherwise between people who follow each other (pairOf photo); its text is
// optional.
import { HttpError, REF, auth, blockedBetween, contactError, countRefusal, db, env, limit, publicText, readJson, tx, userId } from './core.mjs';
import { bondTalk } from './bonds.mjs';
import { checkSequence, getRules, isNumberOnly } from './contact-filter.mjs';
import { verifyUpload } from './media.mjs';
import { pairOf, payOneOnOne } from './one-on-one.mjs';
import { line } from './live-line.mjs';
import { notify } from './push.mjs';
import { assertMay } from './sanctions.mjs';

const PAGE = 50;
const out = (m) => ({ id: Number(m.id), from: m.sender, to: m.recipient, text: m.body, image: m.image_url ?? null, createdAt: m.created_at, readAt: m.read_at });
/** The text a photo without words carries (the conversation list and the notification show it). */
export const PHOTO_TEXT = 'Fotoğraf';

/** Only a photo this person put in the storage for a chat (media.mjs: dm/<their id>/...), or null for none. */
function photoOf(v, me) {
  if (v === undefined || v === null || v === '') return null;
  const base = (env.S3_PUBLIC_URL ?? '').replace(/\/$/, '');
  const mine = `${base}/dm/${me.id}/`;
  if (!base || typeof v !== 'string' || v.length > 500 || !v.startsWith(mine) || !/^[A-Za-z0-9._-]+$/.test(v.slice(mine.length)))
    throw new HttpError(400, 'Geçersiz fotoğraf');
  return v;
}

/**
 * A number typed a few digits at a time ("0532", "123", "45", "67"): a number-only message is read together
 * with the sender's number-only messages to the same person just before it, within a few minutes.
 */
async function assertNoSplitNumber(me, to, body, ref) {
  if (!isNumberOnly(body)) return;
  const { windowSeconds, maxMessages } = getRules().sequence;
  const r = await db.query(
    `SELECT body FROM messages
      WHERE sender = $1 AND recipient = $2 AND ref <> $3 AND created_at > now() - make_interval(secs => $4)
      ORDER BY id DESC LIMIT $5`,
    [me.id, to, ref, windowSeconds, maxMessages - 1],
  );
  const verdict = checkSequence(r.rows.map((m) => m.body).reverse(), body);
  if (verdict.ok) return;
  throw contactError(verdict.category, 'text', await countRefusal(me.id, verdict.category, 'dm.sequence'));
}

export const messageRoutes = {
  async 'POST /api/messages'(req) {
    const me = await auth(req);
    // A mute that covers DMs (sanctions.mjs) stops them here, by the server's clock.
    await assertMay(me, 'dm');
    limit(`msg:${me.id}`, 30, 'Çok hızlı mesaj gönderiyorsun, biraz bekle');
    const b = await readJson(req);
    const to = userId(b.to, 'alıcı');
    if (to === me.id) throw new HttpError(400, 'Kendine mesaj gönderemezsin');
    const image = photoOf(b.image, me);
    if (image) await verifyUpload(image, 'dm');
    const body = image && (b.text === undefined || b.text === null || String(b.text).trim() === '') ? PHOTO_TEXT : await publicText(b.text, 1, 1000, 'Mesaj', me, 'dm', 'text');
    if (!REF.test(b.ref ?? '')) throw new HttpError(400, 'Geçersiz istek kimliği');
    const peer = await db.query('SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL', [to]);
    if (!peer.rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
    if (await blockedBetween(me.id, to)) throw new HttpError(403, 'Bu kişiye mesaj gönderemezsin');
    if (!(image && body === PHOTO_TEXT)) await assertNoSplitNumber(me, to, body, b.ref);
    if (image) {
      const gate = (await pairOf(db, me.id, to)).photo;
      if (!gate.open) throw new HttpError(403, gate.why);
    }
    const insert = (c) =>
      c.query('INSERT INTO messages (sender, recipient, body, image_url, ref) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (sender, ref) DO NOTHING RETURNING *', [me.id, to, body, image, b.ref]);
    const replay = async () => ({ message: out((await db.query('SELECT * FROM messages WHERE sender = $1 AND ref = $2', [me.id, b.ref])).rows[0]), replay: true });
    let row;
    let price = 0;
    if ((await pairOf(db, me.id, to)).dmPrice > 0) {
      // A paid message: sent and paid together, or neither (a short balance is a 409, code insufficient).
      const prev = await db.query('SELECT 1 FROM messages WHERE sender = $1 AND ref = $2', [me.id, b.ref]);
      if (prev.rowCount) return replay();
      row = await tx(async (c) => {
        await c.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[me.id, to]]);
        const pair = await pairOf(c, me.id, to);
        const r = await insert(c);
        if (!r.rowCount) return null;
        price = pair.dmPrice;
        const id = Number(r.rows[0].id);
        if (price > 0) await payOneOnOne(c, { kind: 'message', payer: me.id, earner: pair.earner, coins: price, ref: `msg-${id}`, label: 'Mesaj ücreti', income: `msg:${id}`, messageId: id });
        return r.rows[0];
      }).catch((e) => {
        if (e.code === '23505') return null;
        throw e;
      });
    } else {
      row = (await insert(db)).rows[0];
    }
    if (!row) return replay();
    notify([to], { title: me.name, body: image ? `${PHOTO_TEXT} gönderdi` : body, data: { type: 'message', from: me.id } });
    // Talking back and forth raises a bond; never fails the message.
    bondTalk(me.id, to, Number(row.id)).catch((e) => console.error('bond talk', e.message));
    if (!price) return { message: out(row), replay: false };
    const coins = Number((await db.query('SELECT coins FROM users WHERE id = $1', [me.id])).rows[0].coins);
    return { message: out(row), replay: false, price, coins };
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
      // The newest message with each person (from the sender and recipient indexes), the 200 latest talks.
      `SELECT l.peer, m.*, u.name AS peer_name, u.avatar_url AS peer_avatar,
              (SELECT count(*) FROM messages x WHERE x.recipient = $1 AND x.sender = l.peer AND x.read_at IS NULL) AS unread
         FROM (SELECT peer, max(id) AS id FROM (
                 SELECT recipient AS peer, id FROM messages WHERE sender = $1
                 UNION ALL
                 SELECT sender AS peer, id FROM messages WHERE recipient = $1) t
               GROUP BY peer ORDER BY max(id) DESC LIMIT 200) l
         JOIN messages m ON m.id = l.id
         JOIN users u ON u.id = l.peer
        ORDER BY m.id DESC`,
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
    // The writer's open chat turns its ticks blue at once.
    if (r.rowCount) line([peer], 'message_read', { from: me.id });
    return { read: r.rowCount };
  },
};
