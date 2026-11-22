// Direct messages, stored on the server so they survive reinstalls and reach the other phone.
//
//   POST /api/messages       { to, text, image?, event?, ref } → { message, replay, price?, coins? }
//   GET  /api/messages?with=&before=                → { messages }       (newest first, 50 per page)
//   GET  /api/conversations                         → { conversations }  (last message and unread count)
//   POST /api/messages/read  { with }               → { read }
// Messages to or from someone either side has blocked are refused, and so are messages the recipient's "Bana
// kimler mesaj gönderebilir?" doesn't allow (privacy.mjs dmRefusal: 403, code privacy). A new message rings the
// recipient's phone (push.mjs); an open app polls. At most 30 messages a minute per person, against spam. A message that
// shares a phone number, IBAN, e-mail, link or social media account is refused (contact-filter.mjs).
// A message from someone who isn't a streamer to a streamer they don't follow each other with costs dm_price
// coins (one-on-one.mjs pairOf), taken with the message; the answer then carries the sender's coins. The coins wait
// for the streamer's answer (message-holds.mjs): answered within reply_minutes they become her diamonds, otherwise
// they go back to the sender. An answer of hers settles them at once (the answer carries `reward`).
// A quick reply ({ quick: n }, a woman streamer, auto-chat.mjs) takes its words from the pool and one of her daily
// rights; the answer carries `quick` (what is left). Automatic messages are sent by the server itself (auto-chat.mjs).
// A photo (image: a photo this person put in the storage for a chat, media.mjs dm/<their id>/…) goes with a
// streamer from the heart level, otherwise between people who follow each other (pairOf photo); its text is
// optional.
// An event sent to a friend (event: an approved Etkinlik Merkezi event, events.mjs) carries the event: new apps draw
// it as the event's card ({ event: { id, title, startsAt } }), older ones only show the text, which says it in words.
// A gift sent from the chat (gifts.mjs, place chat) is a line the server writes with the gift: it carries
// { gift: { id, count } } (GIFT_LINE), from which new apps draw the gift's card and play its animation once; older ones
// show its text. Only the server can write such a line, so a typed "Hediye gönderdi: …" (the look of one, a scam
// lure) is refused (fakeGiftLine).
import { HttpError, REF, auth, blockedBetween, contactError, countRefusal, db, env, int, limit, publicText, readJson, tx, userId } from './core.mjs';
import { noteAutoReply, quickAfter, quickReplyOf, takeQuota } from './auto-chat.mjs';
import { live } from './live-settings.mjs';
import { HOLD_COLUMNS, answerHolds, holdMessage, holdView, replySeconds } from './message-holds.mjs';
import { systemNotice } from './system-notices.mjs';
import { bondTalk } from './bonds.mjs';
import { checkSequence, getRules, isNumberOnly } from './contact-filter.mjs';
import { verifyUpload } from './media.mjs';
import { pairOf, payOneOnOne, wantsMessagePush } from './one-on-one.mjs';
import { dmRefusal } from './privacy.mjs';
import { line } from './live-line.mjs';
import { notify } from './push.mjs';
import { assertMay } from './sanctions.mjs';

const PAGE = 50;
/**
 * Both people's rows, in id order, before a message names them. The message's keys are checked against both rows
 * (sender first): without this a message could hold one person's row and wait for the other's while a gift, a bond or
 * a refund that locks both in id order waits the other way round (test/money-fuzz.test.mjs found it).
 */
export const keyLock = (c, a, b) => c.query('SELECT 1 FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR KEY SHARE', [[a, b]]);
const out = (m, me = null) => ({
  id: Number(m.id),
  from: m.sender,
  to: m.recipient,
  text: m.body,
  image: m.image_url ?? null,
  createdAt: m.created_at,
  readAt: m.read_at,
  // Only on an event's message, so the others read as before.
  ...(m.event_id ? { event: { id: Number(m.event_id), title: m.event_title ?? null, startsAt: m.event_starts_at ?? null } } : {}),
  // Only on a gift's line (GIFT_LINE): the gift and how many.
  ...(m.gift_id ? { gift: { id: m.gift_id, count: Number(m.gift_count) } } : {}),
  // Only on an automatic message or a quick reply (auto-chat.mjs): new apps label it, older ones show the text.
  ...(m.source && m.source !== 'manual' ? { source: m.source } : {}),
  // A paid message waiting for its answer (message-holds.mjs): its reward to the streamer, its fee to the payer.
  ...(me ? holdView(m, me) : {}),
});
/**
 * The gift a message is the line of (gifts.mjs writes it in the gift's own transaction, ref `gift:<the gift's ref>`;
 * `gift-` before Nov 2026): the same sender, that ref and the same moment. A phone's ref can't hold ':' (core.mjs REF),
 * and a message a phone took a `gift-` ref for beforehand was written earlier than the gift, so it never matches.
 */
const GIFT_LINE = (m) =>
  `LEFT JOIN gift_events ge ON ge.sender = ${m}.sender AND left(${m}.ref, 5) IN ('gift:', 'gift-') AND ge.ref = substr(${m}.ref, 6) AND ge.created_at = ${m}.created_at`;
/** A message row with its event's title and start, its gift (GIFT_LINE), and its hold (out). */
const WITH_EVENT = `SELECT m.*, e.title AS event_title, e.starts_at AS event_starts_at, ge.gift_id, ge.count AS gift_count, ${HOLD_COLUMNS}
  FROM messages m LEFT JOIN events e ON e.id = m.event_id ${GIFT_LINE('m')} LEFT JOIN message_holds hd ON hd.message_id = m.id`;
/**
 * Text that looks like a gift's line ("Hediye gönderdi: Aslan"): only the server writes those, with the gift. Read
 * past case, spaces, invisible characters and leading symbols, so "🎁 HEDİYE  gönderdi :" is the same.
 */
export function fakeGiftLine(text) {
  const t = String(text ?? '').normalize('NFKC').replace(/[\p{Cf}]/gu, '').toLocaleLowerCase('tr-TR');
  return /^[^\p{L}\p{N}]*hed[iı]ye\s*g[öo]nderd[iı]\s*[:：\-–—→>]/u.test(t);
}
export const FAKE_GIFT_LINE = 'Hediye satırını yalnızca gerçek bir hediye yazar. Hediye göndermek için sohbetteki hediye düğmesini kullan.';
/** The text a photo without words carries (the conversation list and the notification show it). */
export const PHOTO_TEXT = 'Fotoğraf';

/** The approved event a message shares (its id, title and start), or null for none; a 400 for any other. */
async function eventOf(v) {
  if (v === undefined || v === null) return null;
  if (!Number.isSafeInteger(v) || v < 1) throw new HttpError(400, 'Geçersiz etkinlik');
  const r = await db.query("SELECT id, title, starts_at FROM events WHERE id = $1 AND status = 'approved'", [v]);
  if (!r.rowCount) throw new HttpError(400, 'Bu etkinlik paylaşılamaz');
  return r.rows[0];
}

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
    if (!REF.test(b.ref ?? '')) throw new HttpError(400, 'Geçersiz istek kimliği');
    // A quick reply: its words are the pool's, never the phone's (auto-chat.mjs).
    const quickNo = b.quick === undefined || b.quick === null ? null : int(b.quick, 1, 100);
    if (b.quick !== undefined && b.quick !== null && !quickNo) throw new HttpError(400, 'Geçersiz hazır cevap');
    const image = quickNo ? null : photoOf(b.image, me);
    if (image) await verifyUpload(image, 'dm');
    const ev = image || quickNo ? null : await eventOf(b.event);
    const body = quickNo
      ? await quickReplyOf(me, to, quickNo)
      : image && (b.text === undefined || b.text === null || String(b.text).trim() === '')
        ? PHOTO_TEXT
        : await publicText(b.text, 1, 1000, 'Mesaj', me, 'dm', 'text');
    // The look of a gift's line, typed (a fake gift to lure someone): nothing is stored or charged.
    if (!quickNo && fakeGiftLine(body)) throw Object.assign(new HttpError(400, FAKE_GIFT_LINE), { extra: { code: 'fake_gift' } });
    const source = quickNo ? 'quick_reply' : 'manual';
    const peer = await db.query('SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL', [to]);
    if (!peer.rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
    if (await blockedBetween(me.id, to)) throw new HttpError(403, 'Bu kişiye mesaj gönderemezsin');
    // Their "Bana kimler mesaj gönderebilir?" (privacy.mjs). A retry of a message already stored is answered below.
    const refused = await dmRefusal(db, me.id, to);
    if (refused && !(await db.query('SELECT 1 FROM messages WHERE sender = $1 AND ref = $2', [me.id, b.ref])).rowCount)
      throw Object.assign(new HttpError(403, refused), { extra: { code: 'privacy' } });
    if (!quickNo && !(image && body === PHOTO_TEXT)) await assertNoSplitNumber(me, to, body, b.ref);
    if (image) {
      const gate = (await pairOf(db, me.id, to)).photo;
      if (!gate.open) throw new HttpError(403, gate.why);
    }
    const insert = (c) =>
      c.query('INSERT INTO messages (sender, recipient, body, image_url, ref, event_id, source, template_no) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (sender, ref) DO NOTHING RETURNING *', [
        me.id,
        to,
        body,
        image,
        b.ref,
        ev?.id ?? null,
        source,
        quickNo,
      ]);
    const stored = async (id) => (await db.query(`${WITH_EVENT} WHERE m.id = $1`, [id])).rows[0];
    const replay = async () => ({ message: out((await db.query(`${WITH_EVENT} WHERE m.sender = $1 AND m.ref = $2`, [me.id, b.ref])).rows[0], me.id), replay: true });
    let row;
    let price = 0;
    let hold = null;
    let quickUsed = null;
    if ((await pairOf(db, me.id, to)).dmPrice > 0) {
      // A paid message: sent and paid together, or neither (a short balance is a 409, code insufficient). With the
      // reply rule on, the coins wait for the streamer's answer (message-holds.mjs).
      const prev = await db.query('SELECT 1 FROM messages WHERE sender = $1 AND ref = $2', [me.id, b.ref]);
      if (prev.rowCount) return replay();
      row = await tx(async (c) => {
        await c.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[me.id, to]]);
        const pair = await pairOf(c, me.id, to);
        const r = await insert(c);
        if (!r.rowCount) return null;
        price = pair.dmPrice;
        const id = Number(r.rows[0].id);
        if (price > 0 && replySeconds() > 0) hold = await holdMessage(c, { message: r.rows[0], payer: me.id, earner: pair.earner, coins: price });
        else if (price > 0) await payOneOnOne(c, { kind: 'message', payer: me.id, earner: pair.earner, coins: price, ref: `msg:${id}`, label: 'Mesaj ücreti', income: `msg:${id}`, messageId: id });
        return r.rows[0];
      }).catch((e) => {
        if (e.code === '23505') return null;
        throw e;
      });
    } else if (quickNo) {
      // One of today's quick replies, taken with the message: a refusal or a replay takes none.
      row = await tx(async (c) => {
        await keyLock(c, me.id, to);
        const r = await insert(c);
        if (!r.rowCount) return null;
        quickUsed = await takeQuota(c, me.id, 'quick', live().quickDaily);
        if (quickUsed === null) throw Object.assign(new HttpError(409, (await quickAfter(me, live().quickDaily)).done), { extra: { code: 'quick_quota' } });
        return r.rows[0];
      }).catch((e) => {
        if (e.code === '23505') return null;
        throw e;
      });
    } else {
      row = await tx(async (c) => {
        await keyLock(c, me.id, to);
        return (await insert(c)).rows[0];
      });
    }
    if (!row) return replay();
    // Their notification preferences decide; the message itself has arrived either way, and never waits for this.
    wantsMessagePush(db, to, me.id)
      .then((yes) => yes && notify([to], { title: me.name, body: image ? `${PHOTO_TEXT} gönderdi` : body, data: { type: 'message', from: me.id } }))
      .catch((e) => console.error('message push', e.message));
    // Talking back and forth raises a bond; never fails the message.
    bondTalk(me.id, to, Number(row.id)).catch((e) => console.error('bond talk', e.message));
    // An answer to an automatic message counts for the matching; never fails the message.
    noteAutoReply(me.id, to).catch((e) => console.error('auto reply', e.message));
    // My answer settles the paid messages of theirs waiting for it (message-holds.mjs). A failure here is settled by
    // the sweep, which reads this message: it never loses the reward.
    const won = await answerHolds(row).catch((e) => {
      console.error('answer holds', e.message);
      return null;
    });
    if (won?.count && live().messageNoticeMin > 0 && won.diamonds >= live().messageNoticeMin)
      void systemNotice({ target: me.id, category: 'message_reward', ref: `msgwin:${row.id}`, title: `💎 +${won.diamonds.toLocaleString('tr-TR')} elmas kazandın`, body: 'Gelen mesaja zamanında cevap verdin; kazancın hesabına aktarıldı.', data: { diamonds: won.diamonds, count: won.count, message: Number(row.id) }, link: '/gelir' });
    const view = out((await stored(row.id)) ?? row, me.id);
    const extra = {
      ...(won?.count ? { reward: { diamonds: won.diamonds, count: won.count } } : {}),
      ...(hold ? { hold } : {}),
      ...(quickNo ? { quick: await quickAfter(me, quickUsed) } : {}),
    };
    if (!price) return { message: view, replay: false, ...extra };
    const coins = Number((await db.query('SELECT coins FROM users WHERE id = $1', [me.id])).rows[0].coins);
    return { message: view, replay: false, price, coins, ...extra };
  },

  async 'GET /api/messages'(req, url) {
    const me = await auth(req);
    const peer = userId(url.searchParams.get('with'));
    const before = Number(url.searchParams.get('before') ?? 0);
    const r = await db.query(
      `${WITH_EVENT}
        WHERE LEAST(m.sender, m.recipient) = LEAST($1::uuid, $2::uuid) AND GREATEST(m.sender, m.recipient) = GREATEST($1::uuid, $2::uuid)
          AND ($3::bigint = 0 OR m.id < $3)
          -- A follow's line (social.mjs) is the person followed's only.
          AND NOT (m.source = 'follow' AND m.sender = $1)
        ORDER BY m.id DESC LIMIT ${PAGE}`,
      [me.id, peer, Number.isSafeInteger(before) && before > 0 ? before : 0],
    );
    // The server's clock: a reward's countdown runs against it, not the phone's.
    return { messages: r.rows.map((m) => out(m, me.id)), serverNow: new Date().toISOString() };
  },

  async 'GET /api/conversations'(req) {
    const me = await auth(req);
    const r = await db.query(
      // The newest message with each person (from the sender and recipient indexes), the 200 latest talks.
      `SELECT l.peer, m.*, u.name AS peer_name, u.avatar_url AS peer_avatar, ev.title AS event_title, ev.starts_at AS event_starts_at, ge.gift_id, ge.count AS gift_count,
              (SELECT count(*) FROM messages x WHERE x.recipient = $1 AND x.sender = l.peer AND x.read_at IS NULL) AS unread
         FROM (SELECT peer, max(id) AS id FROM (
                 SELECT recipient AS peer, id FROM messages WHERE sender = $1 AND source <> 'follow'
                 UNION ALL
                 SELECT sender AS peer, id FROM messages WHERE recipient = $1) t
               GROUP BY peer ORDER BY max(id) DESC LIMIT 200) l
         JOIN messages m ON m.id = l.id
         JOIN users u ON u.id = l.peer
         LEFT JOIN events ev ON ev.id = m.event_id
         ${GIFT_LINE('m')}
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
