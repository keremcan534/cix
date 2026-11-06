// Gifts at the server's price, and the rankings they feed.
//
//   GET  /api/catalog                                             → { gifts, counts, packs, svipXp, purchases, campaign, exchange, v }
//   POST /api/gifts/send  { to, giftId, count, room?, ref }       → { user, replay, total }
//   GET  /api/rankings?board=wealth|charm&period=day|week|month   → { rows }
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
import { recordIncome } from './agency-lib.mjs';
import { addBondCoins } from './bonds.mjs';
import { HttpError, auth, blockedBetween, claimRef, db, int, once, readJson, userId } from './core.mjs';
import { EXCHANGE, GIFTS, GIFT_COUNTS, PACKS, SVIP_XP, svipLevel } from './catalog.mjs';
import { live } from './live-settings.mjs';
import { notify } from './push.mjs';
import { purchaseOptions } from './purchases.mjs';
import { giftCoins } from './wallet.mjs';

const ROOM = /^[A-Za-z0-9_-]{1,64}$/;
const BOARDS = { wealth: 'sender', charm: 'recipient' };
const PERIODS = ['day', 'week', 'month'];

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
    if (gift.minSvip && svipLevel(Number(u.svip_xp)) < gift.minSvip) throw new HttpError(403, `${gift.name} İnci ${gift.minSvip} ve üstü için`);
    if (await blockedBetween(u.id, to)) throw new HttpError(403, 'Bu kişiye hediye gönderemezsin');
    const total = gift.price * count;
    const label = count > 1 ? `${gift.name} ×${count}` : gift.name;
    const out = await once(u.id, 'coin', b.ref, async (c) => {
      // Lock both rows in id order so two people gifting each other at once can't deadlock.
      const locked = await c.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE', [[u.id, to]]);
      if (locked.rowCount < 2) throw new HttpError(404, 'Alıcı bulunamadı');
      await claimRef(c, u.id, 'coin', b.ref);
      // After the ref check: a retry of a gift that went through before the hide gets its replay, not a 400.
      if (s.giftsHidden.has(gift.id)) throw new HttpError(400, 'Bu hediye artık yok');
      const g = await c.query('INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, room, ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [u.id, to, gift.id, count, gift.price, total, room, b.ref]);
      // The diamonds stay locked by where the coins came from (wallet.mjs): store 7 days, Jeton Noktası 1 day.
      await giftCoins(c, { sender: u.id, recipient: to, total, label, ref: b.ref, giftEvent: Number(g.rows[0].id) });
      await addBondCoins(c, u.id, to, total);
      // Never fails the gift: runs in a savepoint, and the agency job backfills a missed one from gift_events.
      await recordIncome(c, to, 'gift', `gift:${g.rows[0].id}`, total);
    });
    // In a room the recipient sees it on stage; elsewhere (profile, chat) they get a notification.
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
    const side = Object.hasOwn(BOARDS, board) ? BOARDS[board] : null;
    const period = url.searchParams.get('period') ?? 'week';
    if (!side || !PERIODS.includes(period)) throw new HttpError(400, 'Geçersiz sıralama');
    const r = await db.query(
      `SELECT u.id, u.name, u.avatar_url, sum(g.total) AS score
         FROM gift_events g JOIN users u ON u.id = g.${side}
        WHERE g.created_at >= date_trunc($1, now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul' AND u.deleted_at IS NULL
        GROUP BY u.id ORDER BY score DESC, u.id LIMIT 50`,
      [period],
    );
    return { rows: r.rows.map((x, i) => ({ rank: i + 1, user: { id: x.id, name: x.name, avatarUrl: x.avatar_url ?? null }, score: Number(x.score) })) };
  },
};
