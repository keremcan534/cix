// Gifts at the server's price, and the rankings they feed.
//
//   GET  /api/catalog                                             → { gifts, counts, packs, svipXp }
//   POST /api/gifts/send  { to, giftId, count, room?, ref }       → { user, replay, total }
//   GET  /api/rankings?board=wealth|charm&period=day|week|month   → { rows }
//
// The sender's coins become the recipient's diamonds 1 to 1 (app/src/data/rules.ts creatorDiamondsPerCoin);
// the app only says which gift and how many, never the price. Agency commission and bonuses are platform
// liabilities settled separately, not moved here. Rankings follow Turkey's calendar (Europe/Istanbul).
import { HttpError, auth, blockedBetween, db, int, move, once, readJson, userId } from './core.mjs';
import { GIFTS, GIFT_COUNTS, PACKS, SVIP_XP, svipLevel } from './catalog.mjs';
import { notify } from './push.mjs';

const ROOM = /^[A-Za-z0-9_-]{1,64}$/;
const BOARDS = { wealth: 'sender', charm: 'recipient' };
const PERIODS = ['day', 'week', 'month'];

export const giftRoutes = {
  /** Public: the app can show prices before sign-in and cache them. */
  async 'GET /api/catalog'() {
    return {
      gifts: [...GIFTS.values()],
      counts: GIFT_COUNTS,
      packs: PACKS.map(({ id, productId, coins, firstBonus }) => ({ id, productId, coins, firstBonus })),
      svipXp: SVIP_XP,
    };
  },

  async 'POST /api/gifts/send'(req) {
    const u = await auth(req);
    const b = await readJson(req);
    const gift = GIFTS.get(b.giftId);
    if (!gift) throw new HttpError(400, 'Bu hediye artık yok');
    const count = int(b.count ?? 1, 1, 10_000);
    if (!count || !GIFT_COUNTS.includes(count)) throw new HttpError(400, `Adet ${GIFT_COUNTS.join(', ')} olabilir`);
    const to = userId(b.to, 'alıcı');
    if (to === u.id) throw new HttpError(400, 'Kendine hediye gönderemezsin');
    const room = b.room === undefined || b.room === null ? null : String(b.room);
    if (room !== null && !ROOM.test(room)) throw new HttpError(400, 'Geçersiz oda');
    if (gift.minSvip && svipLevel(Number(u.svip_xp)) < gift.minSvip) throw new HttpError(403, `${gift.name} SVIP${gift.minSvip} ve üstü için`);
    if (await blockedBetween(u.id, to)) throw new HttpError(403, 'Bu kişiye hediye gönderemezsin');
    const total = gift.price * count;
    const label = count > 1 ? `${gift.name} ×${count}` : gift.name;
    const out = await once(u.id, 'coin', b.ref, async (c) => {
      // Lock both rows in id order so two people gifting each other at once can't deadlock.
      const locked = await c.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE', [[u.id, to]]);
      if (locked.rowCount < 2) throw new HttpError(404, 'Alıcı bulunamadı');
      await c.query('INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, room, ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [u.id, to, gift.id, count, gift.price, total, room, b.ref]);
      await move(c, u.id, 'coin', -total, `Hediye gönderildi: ${label}`, b.ref, to);
      await move(c, to, 'diamond', total, `Hediye alındı: ${label}`, `${b.ref}-in`, u.id);
    });
    // In a room the recipient sees it on stage; elsewhere (profile, chat) they get a notification.
    if (!out.replay && !room) notify([to], { title: 'Hediye geldi', body: `${u.name} sana ${label} gönderdi`, data: { type: 'gift', from: u.id } });
    return { ...out, total };
  },

  async 'GET /api/rankings'(req, url) {
    await auth(req);
    const side = BOARDS[url.searchParams.get('board') ?? 'wealth'];
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
