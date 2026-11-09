// Gifts at the server's price, and the rankings they feed.
//
//   GET  /api/catalog                                             → { gifts, counts, packs, svipXp, purchases, campaign, exchange, v }
//   POST /api/gifts/send  { to, giftId, count, room?, place?, ref } → { user, replay, total }  (place: chat|moment|profile)
//   GET  /api/rankings?board=wealth|charm|agency&period=day|week|month → { rows }  (agency: rows carry agency, not user)
//
// The sender's coins become the recipient's diamonds 1 to 1 (app/src/data/rules.ts creatorDiamondsPerCoin);
// the app only says which gift and how many, never the price. The recipient's diamonds are also the base of
// the agency commission: recordIncome writes the income event and its commission records (agency-lib.mjs)
// in the same transaction; the commission is a platform liability paid on top, the diamonds aren't touched.
// Rankings follow Turkey's calendar (Europe/Istanbul).
//
// Canlı ayarlar (live-settings.mjs): a hidden gift or pack is left out of the catalog, and a hidden gift is
// refused (400 "Bu hediye artık yok", nothing moves; old apps still show it). The catalog also says which
// campaign runs now, the Çevir rate and the settings' version (v), which the app compares with /api/config.
// Prices stay compiled.
// A gift sent in a server room is announced to the room's voice connection from here, after it is paid
// (LiveKit SendData, so no phone can fake one); the phones draw only these, never a peer's own claim.
import { recordIncome } from './agency-lib.mjs';
import { addBondCoins } from './bonds.mjs';
import { HttpError, auth, blockedBetween, claimRef, db, int, once, readJson, userId } from './core.mjs';
import { EXCHANGE, GIFTS, GIFT_COUNTS, PACKS, SVIP_XP, svipLevel } from './catalog.mjs';
import { live } from './live-settings.mjs';
import { scorePkGift } from './pk.mjs';
import { notify } from './push.mjs';
import { purchaseOptions } from './purchases.mjs';
import { giftCoins } from './wallet.mjs';
import { announceRoom, roomService } from './live.mjs';
import { refreshBoss, roomLevel } from './rooms.mjs';

export const ROOM = /^[A-Za-z0-9_-]{1,64}$/;
const BOARDS = { wealth: 'sender', charm: 'recipient' };
export const PERIODS = ['day', 'week', 'month'];
const SINCE = `date_trunc($1, now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'`;

/**
 * The top `n` of a board this day, week or month (Turkey's calendar): wealth = coins given in gifts, charm =
 * diamonds received, agency = the diamonds its streamers earned (the commission base, refunds taken off).
 */
export async function topBoard(board, period, n = 50) {
  if (board === 'agency') {
    const r = await db.query(
      `SELECT a.id, a.name, o.avatar_url, sum(c.base_diamonds) AS score
         FROM agency_commissions c JOIN agencies a ON a.id = c.agency_id LEFT JOIN users o ON o.id = a.owner_id
        WHERE c.occurred_at >= ${SINCE} AND a.status = 'approved'
        GROUP BY a.id, a.name, o.avatar_url HAVING sum(c.base_diamonds) > 0 ORDER BY score DESC, a.id LIMIT $2`,
      [period, n],
    );
    return r.rows.map((x, i) => ({ rank: i + 1, agency: { id: x.id, name: x.name, avatarUrl: x.avatar_url ?? null }, score: Number(x.score) }));
  }
  const side = BOARDS[board];
  const r = await db.query(
    `SELECT u.id, u.name, u.avatar_url, sum(g.total) AS score
       FROM gift_events g JOIN users u ON u.id = g.${side}
      WHERE g.created_at >= ${SINCE} AND u.deleted_at IS NULL
      GROUP BY u.id ORDER BY score DESC, u.id LIMIT $2`,
    [period, n],
  );
  return r.rows.map((x, i) => ({ rank: i + 1, user: { id: x.id, name: x.name, avatarUrl: x.avatar_url ?? null }, score: Number(x.score) }));
}
export const PLACES = ['chat', 'moment', 'profile'];
/** A server room's LiveKit name (rooms.mjs liveKitName), from its id or that name; null for anything else. */
export const liveKitRoom = (room) => {
  const m = /^(?:oda-)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(room ?? '');
  return m ? `oda-${m[1]}` : null;
};

/**
 * Tells everyone in the room's voice connection about a paid gift. Best effort: never slows or fails the gift.
 * A packet with its own type (lucky.mjs: 'lucky') keeps it.
 */
export function announceGift(room, packet) {
  const data = Buffer.from(JSON.stringify({ type: 'gift', ...packet })).toString('base64');
  roomService('SendData', { room, data, kind: 'RELIABLE' }, { roomAdmin: true, room }).catch((e) => console.error('livekit SendData', room, String(e).slice(0, 200)));
}

export const giftRoutes = {
  /** Public: the app can show prices before sign-in and cache them. */
  async 'GET /api/catalog'() {
    const s = live();
    const now = Date.now();
    const c = s.campaign;
    return {
      gifts: [...GIFTS.values()].filter((g) => !s.giftsHidden.has(g.id)),
      counts: GIFT_COUNTS,
      packs: PACKS.filter((p) => !s.packsHidden.has(p.id)).map(({ id, productId, coins, firstBonus }) => ({ id, productId, coins, firstBonus })),
      svipXp: SVIP_XP,
      // Which packs the app may offer: free test packs, and the stores this server can verify.
      purchases: purchaseOptions(),
      // Only while it runs by the server's clock; a purchase gets it by the store's purchase time (purchases.mjs).
      campaign: c && Date.parse(c.startsAt) <= now && now < Date.parse(c.endsAt) ? { percent: c.percent, startsAt: c.startsAt, endsAt: c.endsAt, label: c.label } : null,
      exchange: { usdTry: s.usdTry, minDiamonds: EXCHANGE.minDiamonds },
      v: s.v,
    };
  },

  async 'POST /api/gifts/send'(req) {
    const u = await auth(req);
    // Read once: a gift that passed the check before a hide is committed; the next one is refused.
    const s = live();
    const b = await readJson(req);
    const gift = GIFTS.get(b.giftId);
    if (!gift) throw new HttpError(400, 'Bu hediye artık yok');
    const count = int(b.count ?? 1, 1, 10_000);
    if (!count || !GIFT_COUNTS.includes(count)) throw new HttpError(400, `Adet ${GIFT_COUNTS.join(', ')} olabilir`);
    const to = userId(b.to, 'alıcı');
    if (to === u.id) throw new HttpError(400, 'Kendine hediye gönderemezsin');
    const room = b.room === undefined || b.room === null ? null : String(b.room);
    if (room !== null && !ROOM.test(room)) throw new HttpError(400, 'Geçersiz oda');
    // Outside a room, where it was sent (Gelir's sources); older apps send none.
    const place = room === null && PLACES.includes(b.place) ? b.place : null;
    if (gift.minSvip && svipLevel(Number(u.svip_xp)) < gift.minSvip) throw new HttpError(403, `${gift.name} İnci ${gift.minSvip} ve üstü için`);
    if (await blockedBetween(u.id, to)) throw new HttpError(403, 'Bu kişiye hediye gönderemezsin');
    const total = gift.price * count;
    const label = count > 1 ? `${gift.name} ×${count}` : gift.name;
    let eventId = null;
    let levelUp = false;
    const out = await once(u.id, 'coin', b.ref, async (c) => {
      // Lock both rows in id order so two people gifting each other at once can't deadlock.
      const locked = await c.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE', [[u.id, to]]);
      if (locked.rowCount < 2) throw new HttpError(404, 'Alıcı bulunamadı');
      await claimRef(c, u.id, 'coin', b.ref);
      // After the ref check: a retry of a gift that went through before the hide gets its replay, not a 400.
      if (s.giftsHidden.has(gift.id)) throw new HttpError(400, 'Bu hediye artık yok');
      const g = await c.query('INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, room, place, ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', [
        u.id,
        to,
        gift.id,
        count,
        gift.price,
        total,
        room,
        place,
        b.ref,
      ]);
      eventId = Number(g.rows[0].id);
      // A gift from a chat shows in that chat, for both of them (a line of its own; no message price).
      if (place === 'chat') await c.query('INSERT INTO messages (sender, recipient, body, ref) VALUES ($1,$2,$3,$4) ON CONFLICT (sender, ref) DO NOTHING', [u.id, to, `Hediye gönderdi: ${label}`, `gift-${b.ref}`]);
      // The diamonds stay locked by where the coins came from (wallet.mjs): store 7 days, Jeton Noktası 1 day.
      await giftCoins(c, { sender: u.id, recipient: to, total, label, ref: b.ref, giftEvent: Number(g.rows[0].id) });
      await addBondCoins(c, u.id, to, total);
      // Oda içi PK (pk.mjs): scores for the recipient while a PK runs in this room; never fails the gift.
      if (room) await scorePkGift(c, { room, eventId, sender: u.id, recipient: to, coins: total });
      // Room level (rooms.mjs roomLevel): the coins count as XP for the owner of the open server room.
      const roomId = liveKitRoom(room)?.slice(4);
      if (roomId) {
        const x = await c.query('UPDATE users SET room_xp = room_xp + $2 WHERE id = (SELECT owner FROM rooms WHERE id = $1 AND closed_at IS NULL) RETURNING room_xp', [roomId, total]);
        if (x.rowCount && roomLevel(Number(x.rows[0].room_xp)) > roomLevel(Number(x.rows[0].room_xp) - total)) levelUp = true;
      }
      // Never fails the gift: runs in a savepoint, and the agency job backfills a missed one from gift_events.
      await recordIncome(c, to, 'gift', `gift:${g.rows[0].id}`, total);
    });
    // once() keys on (sender, coin, ref), which spends, bonds and Jeton Noktası share: only a gift of this ref is
    // this gift's replay. Another feature's ref is refused, so a success always means the gift went.
    if (out.replay && !(await db.query('SELECT 1 FROM gift_events WHERE sender = $1 AND ref = $2', [u.id, b.ref])).rowCount) throw new HttpError(409, 'Geçersiz istek kimliği');
    // In a room the recipient sees it on stage; elsewhere (profile, chat) they get a notification.
    const lkRoom = liveKitRoom(room);
    if (!out.replay && eventId !== null && lkRoom) announceGift(lkRoom, { giftId: gift.id, count, from: u.id, to, eventId });
    // A new room level: the room's phones read the room again (more mics from Lv.8 on).
    if (!out.replay && levelUp && lkRoom) announceRoom(lkRoom);
    // Dümen koltuğu: a new top gifter of the room takes it.
    if (!out.replay && lkRoom) await refreshBoss(lkRoom.slice(4));
    if (!out.replay && !room) notify([to], { title: 'Hediye geldi', body: `${u.name} sana ${label} gönderdi`, data: { type: 'gift', from: u.id } });
    if (!out.replay) return { ...out, total };
    // A replay reports what that ref sent, not this body's gift and count (0: the ref was no gift).
    const sent = (await db.query('SELECT total FROM gift_events WHERE sender = $1 AND ref = $2', [u.id, b.ref])).rows[0];
    return { ...out, total: Number(sent?.total ?? 0) };
  },

  async 'GET /api/rankings'(req, url) {
    await auth(req);
    const board = url.searchParams.get('board') ?? 'wealth';
    // Own keys only: 'constructor' or '__proto__' would otherwise reach the SQL as a column name.
    const known = board === 'agency' || Object.hasOwn(BOARDS, board);
    const period = url.searchParams.get('period') ?? 'week';
    if (!known || !PERIODS.includes(period)) throw new HttpError(400, 'Geçersiz sıralama');
    return { rows: await topBoard(board, period) };
  },
};
