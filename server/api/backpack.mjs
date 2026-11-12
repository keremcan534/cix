// Çantam: catalog gifts a person got free from a reward the server decided, sent later from the gift panel's Çantam
// shelf without coins.
//
//   GET  /api/backpack                                        → { items, sources }
//   POST /api/backpack/send { to, giftId, count, room, ref }  → { user, replay, total, items }
//
// What fills it (grantBackpack, inside the reward's own transaction): Görevler's call task (call-log.mjs) gives
// backpack_call_task Kalp a day (Canlı ayarlar, live-registry.mjs; 0 stops it), the demo's "Görev ödülü". The demo's
// other sources (the daily check-in, events) have no reward on the server, so nothing else puts gifts in here.
//
// A send takes the gifts out (never below 0, in the same transaction) and makes a gift event, so the room's stage,
// Yankı and the boards count it like any gift. The recipient gets the gift's value in diamonds, locked as diamonds
// from free coins are (channel 'cantam', the store lock: 7 days), never withdrawable at once. No coins moved, so
// nothing that counts coins counts it: no Cömertlik, no spending limit, no bond, room level or PK points. No agency
// commission: its income event is a 'bonus' (agency-lib.mjs income_types, off by default), which also keeps the
// agency job's backfill from booking the gift as paid income. The receiver rules of a paid gift hold (not myself, no
// deleted account, no block either way, no hidden gift); a send is only in a server room, where the shelf is.
// Kept while the account exists and deleted with it (social.mjs eraseAccount): what is in the backpack and each move
// in and out. The gift events stay as accounting records like any gift.
import { recordIncome } from './agency-lib.mjs';
import { GIFTS, GIFT_COUNTS } from './catalog.mjs';
import { HttpError, REF, auth, blockedBetween, db, int, limit, readJson, selfUser, tx, userId } from './core.mjs';
import { ROOM, announceGift, liveKitRoom } from './gifts.mjs';
import { BACKPACK_TASK_GIFT } from './live-registry.mjs';
import { live } from './live-settings.mjs';
import { LOCK_HOURS, giftDiamonds } from './wallet.mjs';

/** Where gifts come from: the label the panel shows, and the gift and count the live settings give now. */
const SOURCES = {
  call_task: { label: 'Görev ödülü', gift: () => BACKPACK_TASK_GIFT, count: (s) => s.backpackCallTask },
};

/** What `source` gives now, or null (switched off, or its gift hidden). */
function grantOf(source, s = live()) {
  const x = SOURCES[source];
  const giftId = x?.gift();
  const count = x ? x.count(s) : 0;
  return giftId && GIFTS.has(giftId) && count > 0 && !s.giftsHidden.has(giftId) ? { giftId, count } : null;
}

/** The sources that give something now, for the panel's empty shelf and Görevler. */
const sourcesNow = (s = live()) =>
  Object.entries(SOURCES).flatMap(([key, x]) => {
    const g = grantOf(key, s);
    return g ? [{ key, label: x.label, ...g }] : [];
  });

/**
 * Puts the gifts `source` gives now in `userId`'s backpack, once per `ref` (a repeat adds nothing). In the reward's
 * transaction. Returns { giftId, count } added, or null.
 */
export async function grantBackpack(c, userId, source, ref) {
  const g = grantOf(source);
  if (!g) return null;
  const r = await c.query('INSERT INTO backpack_moves (user_id, gift_id, delta, source, ref) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, source, ref) DO NOTHING RETURNING id', [
    userId,
    g.giftId,
    g.count,
    source,
    ref,
  ]);
  if (!r.rowCount) return null;
  await c.query(
    `INSERT INTO backpack_items (user_id, gift_id, count) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, gift_id) DO UPDATE SET count = backpack_items.count + EXCLUDED.count, updated_at = now()`,
    [userId, g.giftId, g.count],
  );
  return g;
}

/** What is in my backpack: gifts still in the catalog and not hidden, each with where the last of it came from. */
export async function itemsOf(q, userId) {
  const hidden = live().giftsHidden;
  const r = await q.query(
    `SELECT i.gift_id, i.count,
            (SELECT m.source FROM backpack_moves m WHERE m.user_id = i.user_id AND m.gift_id = i.gift_id AND m.delta > 0 ORDER BY m.id DESC LIMIT 1) AS source
       FROM backpack_items i WHERE i.user_id = $1 AND i.count > 0 ORDER BY i.gift_id`,
    [userId],
  );
  return r.rows
    .filter((x) => GIFTS.has(x.gift_id) && !hidden.has(x.gift_id))
    .map((x) => ({ giftId: x.gift_id, count: x.count, source: x.source, label: SOURCES[x.source]?.label ?? 'Çanta' }));
}

/** The send of mine with this ref, or null: { total } of its gift event. */
async function sentOf(userId, ref) {
  const r = await db.query("SELECT g.total FROM backpack_moves m JOIN gift_events g ON g.id = m.gift_event WHERE m.user_id = $1 AND m.source = 'send' AND m.ref = $2", [userId, ref]);
  return r.rowCount ? { total: Number(r.rows[0].total) } : null;
}

const answer = async (userId, replay, total) => {
  const u = (await db.query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
  return { user: selfUser(u), replay, total, items: await itemsOf(db, userId) };
};

export const backpackRoutes = {
  async 'GET /api/backpack'(req) {
    const u = await auth(req);
    return { items: await itemsOf(db, u.id), sources: sourcesNow() };
  },

  async 'POST /api/backpack/send'(req) {
    const u = await auth(req);
    // Read once: a send that passed the check before a hide is committed; the next one is refused.
    const s = live();
    const b = await readJson(req);
    if (!REF.test(b.ref ?? '')) throw new HttpError(400, 'Geçersiz istek kimliği');
    const gift = GIFTS.get(b.giftId);
    if (!gift) throw new HttpError(400, 'Bu hediye artık yok');
    const count = int(b.count ?? 1, 1, 10_000);
    if (!count || !GIFT_COUNTS.includes(count)) throw new HttpError(400, `Adet ${GIFT_COUNTS.join(', ')} olabilir`);
    const to = userId(b.to, 'alıcı');
    if (to === u.id) throw new HttpError(400, 'Kendine hediye gönderemezsin');
    const room = b.room === undefined || b.room === null ? '' : String(b.room);
    const lkRoom = ROOM.test(room) ? liveKitRoom(room) : null;
    if (!lkRoom) throw new HttpError(400, 'Çantadan hediye yalnızca bir odada gönderilir');
    // A copy of a send that went through gets its answer again, before any check that may have changed since.
    const done = await sentOf(u.id, b.ref);
    if (done) return answer(u.id, true, done.total);
    if (await blockedBetween(u.id, to)) throw new HttpError(403, 'Bu kişiye hediye gönderemezsin');
    limit(`backpack:${u.id}`, 60);
    const total = gift.price * count;
    const label = count > 1 ? `${gift.name} ×${count}` : gift.name;
    let eventId = null;
    try {
      await tx(async (c) => {
        // Lock both rows in id order, as a paid gift does (gifts.mjs), so two sends at once can't deadlock.
        const locked = await c.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE', [[u.id, to]]);
        if (locked.rowCount < 2) throw new HttpError(404, 'Alıcı bulunamadı');
        if (s.giftsHidden.has(gift.id)) throw new HttpError(400, 'Bu hediye artık yok');
        // The gift event first: a second copy of this request waits on its (sender, ref) and then fails as a replay.
        const g = await c.query("INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, room, ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [
          u.id,
          to,
          gift.id,
          count,
          gift.price,
          total,
          room,
          b.ref,
        ]);
        eventId = Number(g.rows[0].id);
        const left = await c.query('UPDATE backpack_items SET count = count - $3, updated_at = now() WHERE user_id = $1 AND gift_id = $2 AND count >= $3 RETURNING count', [u.id, gift.id, count]);
        if (!left.rowCount) {
          const have = Number((await c.query('SELECT count FROM backpack_items WHERE user_id = $1 AND gift_id = $2', [u.id, gift.id])).rows[0]?.count ?? 0);
          throw Object.assign(new HttpError(409, `Çantanda ${have} ${gift.name} var, bu gönderim için ${count} gerekiyor`), { extra: { code: 'bag_short', have } });
        }
        await c.query("INSERT INTO backpack_moves (user_id, gift_id, delta, source, ref, gift_event) VALUES ($1, $2, $3, 'send', $4, $5)", [u.id, gift.id, -count, b.ref, eventId]);
        // Free value: the store lock, like gifted coins from a free source (wallet.mjs CHANNELS 'cantam').
        const parts = [{ lot: null, channel: 'cantam', amount: total, lockHours: LOCK_HOURS.store }];
        await giftDiamonds(c, { sender: u.id, recipient: to, parts, total, label, ref: b.ref, giftEvent: eventId, reason: `Çanta hediyesi alındı: ${label}` });
        // Income without commission ('bonus'); never fails the send (a savepoint inside).
        await recordIncome(c, to, 'bonus', `gift:${eventId}`, total);
      });
    } catch (e) {
      if (e.code !== '23505') throw e;
      // The same ref went first: this send's replay, or another gift's ref (refused, nothing moved).
      const again = await sentOf(u.id, b.ref);
      if (!again) throw new HttpError(409, 'Geçersiz istek kimliği');
      return answer(u.id, true, again.total);
    }
    // The room sees it on stage like any gift. It cost no coins, so it doesn't move the Patron koltuğu (boss-seat.mjs).
    announceGift(lkRoom, { giftId: gift.id, count, from: u.id, to, eventId });
    return answer(u.id, false, total);
  },
};
