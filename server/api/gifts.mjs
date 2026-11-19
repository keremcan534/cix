// Gifts at the server's price, and the rankings they feed.
//
//   GET  /api/catalog[?gifts=2][&family=1][&emoji=1][&levels=1][&shop=1]     → { gifts, counts, packs, vipPlans, svipXp, purchases, campaign, exchange, fx, v, emoji?, levels?, shop? }
//   POST /api/gifts/send  { to, giftId, count, price?, room?, place?, ref } → { user, replay, total }  (place: chat|moment|profile|family)
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
// Every gift is listed and sent at the price Yönetim › Hediyeler (custom-gifts.mjs) gives it: an admin's own, or one
// of the app's with what was changed about it. `price` in a send is the price the phone showed (a newer app sends it);
// checkShownPrice refuses a gift whose price moved meanwhile, and one of the app's re-priced gifts from an older app.
// gifts=2 in the catalog: the phone draws what the server says about the app's own gifts too (name, emoji, price,
// shelf, order, icon) and trusts its list alone (giftsFormat: 2); without it the re-priced ones are left out.
// levels=1: Seviye ve VIP ayarları as the finance panel set them (levels.mjs levelsPayload); `v` grows with them too.
// shop=1: the shop's frames and entry effects as Yönetim › Mağaza has them (shop-items.mjs shopCatalog); `v` too.
// A members-only gift needs its own VIP level and at least the one the settings open `vip_gifts` at (vipItemNeed).
// A gift sent in a server room is announced to the room's voice connection from here, after it is paid
// (LiveKit SendData, so no phone can fake one); the phones draw only these, never a peer's own claim.
import { recordIncome } from './agency-lib.mjs';
import { KINDS as BOND_KINDS, addBondCoins, maxOf as bondMax } from './bonds.mjs';
import { HttpError, auth, blockedBetween, claimRef, db, env, int, once, readJson, userId } from './core.mjs';
import { EXCHANGE, GIFT_COUNTS, PACKS, VIP_SUBS } from './catalog.mjs';
import { docsNow, levelsPayload, levelsRev, svipLevel, vipItemNeed } from './levels.mjs';
import { shopCatalog, shopFx, shopItemsRev } from './shop-items.mjs';
import { catalogGifts, checkShownPrice, customGiftsRev, giftFx, giftOf, replacedClips } from './custom-gifts.mjs';
import { emojiCatalog, emojiRev } from './emoji.mjs';
import { fxCatalog } from './fx.mjs';
import { live } from './live-settings.mjs';
import { familyRulesOf, roomNumbersOf } from './live-registry.mjs';
import { scorePkGift } from './pk.mjs';
import { notify } from './push.mjs';
import { purchaseOptions } from './purchases.mjs';
import { giftCoins } from './wallet.mjs';
import { announceRoom, roomService } from './live.mjs';
import { roomLevel } from './rooms.mjs';
import { announceBoss, bossGift } from './boss-seat.mjs';
import { GUARD_CARD, guardRules, guardStarted, startGuard } from './guards.mjs';
import { fuelRocket, launchRockets, rocketFx, rocketVideosRev } from './room-rocket.mjs';

export const ROOM = /^[A-Za-z0-9_-]{1,64}$/;
const BOARDS = { wealth: 'sender', charm: 'recipient' };
export const PERIODS = ['day', 'week', 'month'];
const SINCE = `date_trunc($1, now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'`;

/**
 * How long a board is kept, in ms (RANKINGS_CACHE_MS, default 30 s; 0: every call reads it). A board sums the period's
 * gift events, the costliest query under load (docs/YUK_TESTI.md): everyone opening Sıralama at once shares one read,
 * a call while it runs waits for the same one.
 */
const BOARD_MS = Math.max(0, Number(env.RANKINGS_CACHE_MS ?? 30_000) || 0);
const boards = new Map();

/**
 * The top `n` of a board this day, week or month (Turkey's calendar): wealth = coins given in gifts, charm =
 * diamonds received, agency = the diamonds its streamers earned (the commission base, refunds taken off). Kept for
 * BOARD_MS.
 */
export async function topBoard(board, period, n = 50) {
  if (!BOARD_MS) return readBoard(board, period, n);
  const key = `${board}:${period}:${n}`;
  const hit = boards.get(key);
  if (hit && Date.now() - hit.at < BOARD_MS) return hit.rows;
  const rows = readBoard(board, period, n);
  boards.set(key, { at: Date.now(), rows });
  rows.catch(() => boards.get(key)?.rows === rows && boards.delete(key));
  return rows;
}

async function readBoard(board, period, n) {
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
export const PLACES = ['chat', 'moment', 'profile', 'family'];
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
  async 'GET /api/catalog'(req, url) {
    const s = live();
    const now = Date.now();
    const c = s.campaign;
    const app2 = url?.searchParams.get('gifts') === '2';
    // The Aile ve Dost shelf (custom-gifts.mjs catalogGifts): only for a phone that has it.
    const family = url?.searchParams.get('family') === '1';
    return {
      // Every gift on the shelves in the shelves' order (custom-gifts.mjs): the admins' with their icon (an older app
      // skips them), the app's own as changed in the panel. Off the shelves (the app's paused ones unless put back,
      // catalog.mjs GIFTS_PAUSED) or hidden in Canlı ayarlar: left out, so older apps drop them too.
      gifts: catalogGifts({ app2, hidden: s.giftsHidden, family }),
      ...(app2 ? { giftsFormat: 2 } : {}),
      counts: GIFT_COUNTS,
      packs: PACKS.filter((p) => !s.packsHidden.has(p.id)).map(({ id, productId, coins, firstBonus }) => ({ id, productId, coins, firstBonus })),
      // Abonelik's store products (vip.mjs), sold through the same stores as the packs (`purchases`).
      // Every store product, shown or not (an older app shows its own plans and buys by product; which are shown and
      // their words are in `levels.sub`).
      vipPlans: VIP_SUBS.map(({ productId, days }) => ({ productId, days })),
      // The VIP levels' points as Seviye ayarları have them (an older app counts with its own).
      svipXp: docsNow().vip.levels.map((l) => l.points),
      // Which packs the app may offer: free test packs, and the stores this server can verify.
      purchases: purchaseOptions(),
      // Only while it runs by the server's clock; a purchase gets it by the store's purchase time (purchases.mjs).
      campaign: c && Date.parse(c.startsAt) <= now && now < Date.parse(c.endsAt) ? { percent: c.percent, startsAt: c.startsAt, endsAt: c.endsAt, label: c.label } : null,
      exchange: { usdTry: s.usdTry, minDiamonds: EXCHANGE.minDiamonds },
      // The gift and entry videos the phones download and keep (fx.mjs, and the admins' gifts'); an older app ignores it.
      fx: [...fxCatalog(s.giftsHidden, replacedClips()), ...giftFx(s.giftsHidden, family), ...shopFx(), ...rocketFx()],
      // The emoji panel's packs and stickers as they are now (emoji.mjs): only for an app that asks (emoji=1).
      ...(url?.searchParams.get('emoji') === '1' ? { emoji: emojiCatalog() } : {}),
      // Seviye ve VIP ayarları (levels.mjs): only for an app that asks (levels=1).
      ...(url?.searchParams.get('levels') === '1' ? { levels: levelsPayload() } : {}),
      // Yönetim › Mağaza (shop-items.mjs): only for an app that asks (shop=1).
      ...(url?.searchParams.get('shop') === '1' ? { shop: shopCatalog() } : {}),
      // Koruma's and Bağlar's numbers as Canlı ayarlar has them, for the screens that say them (an older app says its own).
      guard: guardRules(s),
      rooms: (({ micMinLevel, bossMinLevel, caps }) => ({ micMinLevel, bossMinLevel, caps }))(roomNumbersOf(s)),
      family: { themes: Object.fromEntries(familyRulesOf(s).themes.map((t) => [t.id, t.minLevel])) },
      bonds: { answerDays: s.bondAnswerDays, cooldownDays: s.bondCooldownDays, talkDaily: s.bondTalkDaily, max: Object.fromEntries(Object.keys(BOND_KINDS).map((k) => [k, bondMax(k, s)])) },
      // Grows with every live settings save, every change in Yönetim › Hediyeler and Emojiler, and every Seviye
      // ayarları save (as /api/config's).
      v: s.v + customGiftsRev() + emojiRev() + levelsRev() + shopItemsRev() + rocketVideosRev(),
    };
  },

  async 'POST /api/gifts/send'(req) {
    const u = await auth(req);
    // Read once: a gift that passed the check before a hide is committed; the next one is refused.
    const s = live();
    const b = await readJson(req);
    // One of the app's gifts (as changed in the panel) or an admin's on the shelves (custom-gifts.mjs), at this
    // server's price either way.
    const gift = giftOf(b.giftId);
    if (!gift) throw new HttpError(400, 'Bu hediye artık yok');
    const count = int(b.count ?? 1, 1, 10_000);
    if (!count || !GIFT_COUNTS.includes(count)) throw new HttpError(400, `Adet ${GIFT_COUNTS.join(', ')} olabilir`);
    const to = userId(b.to, 'alıcı');
    if (to === u.id) throw new HttpError(400, 'Kendine hediye gönderemezsin');
    const room = b.room === undefined || b.room === null ? null : String(b.room);
    if (room !== null && !ROOM.test(room)) throw new HttpError(400, 'Geçersiz oda');
    // Outside a room, where it was sent (Gelir's sources); older apps send none.
    const place = room === null && PLACES.includes(b.place) ? b.place : null;
    const needVip = vipItemNeed('vip_gifts', gift.minSvip);
    if (needVip && svipLevel(u.svip_xp) < needVip) throw new HttpError(403, `${gift.name} VIP ${needVip} ve üstü için`);
    if (await blockedBetween(u.id, to)) throw new HttpError(403, 'Bu kişiye hediye gönderemezsin');
    const total = gift.price * count;
    const label = count > 1 ? `${gift.name} ×${count}` : gift.name;
    let eventId = null;
    let levelUp = false;
    let boss = [];
    let guardNew = false;
    let rocket = null;
    const out = await once(u.id, 'coin', b.ref, async (c) => {
      // Lock both rows in id order so two people gifting each other at once can't deadlock.
      const locked = await c.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE', [[u.id, to]]);
      if (locked.rowCount < 2) throw new HttpError(404, 'Alıcı bulunamadı');
      await claimRef(c, u.id, 'coin', b.ref);
      // After the ref check: a retry of a gift that went through before the hide gets its replay, not a 400.
      if (s.giftsHidden.has(gift.id)) throw new HttpError(400, 'Bu hediye artık yok');
      // The price the phone showed (none from an older app): a gift whose price moved is refused, nothing moves.
      checkShownPrice(gift, b.price);
      // Koruma Kartı (guards.mjs): starts a Koruma before the gift's row, so its coins are the first points.
      if (gift.id === GUARD_CARD) guardNew = await startGuard(c, u.id, to);
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
      // A gift from a chat shows in that chat, for both of them (a line of its own; no message price). Its ref is a
      // server ref (':'), so no phone can take it first and hide the line or put its own words in it; the chat reads
      // the gift back from it (messages.mjs GIFT_LINE: this ref and this transaction's moment).
      if (place === 'chat') await c.query('INSERT INTO messages (sender, recipient, body, ref) VALUES ($1,$2,$3,$4) ON CONFLICT (sender, ref) DO NOTHING', [u.id, to, `Hediye gönderdi: ${label}`, `gift:${b.ref}`]);
      // A gift from the family chat: only to someone of my family, and the family chat shows it (family-more.mjs task).
      if (place === 'family') {
        const fam = await c.query(
          `SELECT a.family_id, u.name FROM family_members a JOIN family_members b ON b.family_id = a.family_id AND b.user_id = $2 JOIN users u ON u.id = $2
            WHERE a.user_id = $1`,
          [u.id, to],
        );
        if (!fam.rowCount) throw new HttpError(403, 'Aile sohbetinden yalnızca ailendeki birine hediye gönderebilirsin');
        await c.query('INSERT INTO family_messages (family_id, author, body) VALUES ($1, $2, $3)', [fam.rows[0].family_id, u.id, `Hediye gönderdi: ${label} → ${fam.rows[0].name}`.slice(0, 500)]);
      }
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
        // Patron koltuğu (boss-seat.mjs): this send may sit its sender down, extend their sitting or take the seat.
        boss = await bossGift(c, { roomId, sender: u.id, coins: total });
        // Oda roketi (room-rocket.mjs): the coins fill today's rocket; a level it fills launches once this commits.
        rocket = await fuelRocket(c, { roomId, sender: u.id, coins: total });
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
    // Patron koltuğu: the room hears who sat, took it or whose time ended.
    if (!out.replay && lkRoom) await announceBoss(lkRoom.slice(4), boss);
    // Oda roketi: a level this gift filled launches and is paid (not awaited: the gift is done).
    if (!out.replay && lkRoom && rocket) void launchRockets(lkRoom.slice(4), rocket);
    if (!out.replay && !room) notify([to], { title: 'Hediye geldi', body: `${u.name} sana ${label} gönderdi`, data: { type: 'gift', from: u.id } });
    if (!out.replay && guardNew) guardStarted(u, to);
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
