// Koltuk rengi: the color of a room's empty mics (the poufs, their cushion drawn in the color, the gold kept), the same
// on every phone. Only the owner picks it. The colors are Yönetim › Mağaza › Koltuk renkleri's (shop-items.mjs
// seatItem: the app's own, catalog.mjs SEAT_COLORS, and the admins' 'sc…'): a name, a price, days and a color. Silver
// (SEAT_DEFAULT) is every room's free default; any other is bought for the room with the owner's coins for its days
// (none: for good, as every color bought before them) and the room has it till then, so going back to it costs
// nothing. A color that runs out leaves the room: it is silver again on every phone within a minute (the sweep).
//
//   GET  /api/rooms/seat-color?room=<id>     → { color, owned, until }
//   POST /api/rooms/seat-color { room, color, ref, price?, days? } → { color, owned, until, price, user?, replay? }
//     color: a seat color's id (the default stored as none). owned: the colors the room has now; until: when each of
//     them runs out ({ id: ISO time }, none for good). price: what this call took. user: my wallet after a purchase.
//     price, days: what the phone showed for a color it buys; another price or days now is a 409 price_changed with
//     them, nothing taken. An older app sends neither: it may buy only an app's own color at the price it shows
//     (catalog.mjs SEAT_PRICES_OLD_APP), for good; else update_required.
//
// The room's color goes into the LiveKit room metadata (rooms.mjs pushRoomMeta, the default by its id so an older app
// shows silver too), so every phone repaints at once. Reward coins ('odul') can't pay for it (spendCoins 'paid'); the
// coins go to the platform.
import { SEAT_DEFAULT, SEAT_PRICES_OLD_APP } from './catalog.mjs';
import { HttpError, auth, claimRef, db, env, limit, once, readJson } from './core.mjs';
import { pushRoomMeta, rankOf, roomRow } from './rooms.mjs';
import { seatItem } from './shop-items.mjs';
import { spendCoins } from './wallet.mjs';

const DAY = 86_400_000;
const fmt = (n) => n.toLocaleString('tr-TR');
const err = (status, message, code, extra = {}) => Object.assign(new HttpError(status, message), { extra: { code, ...extra } });

/** The colors the room has now (bought and not run out), and when each runs out (none: for good). */
async function ownedOf(roomId) {
  const r = await db.query('SELECT color, ends_at FROM room_seat_colors WHERE room_id = $1 AND (ends_at IS NULL OR ends_at > now()) ORDER BY created_at, color', [roomId]);
  return { owned: r.rows.map((x) => x.color), until: Object.fromEntries(r.rows.filter((x) => x.ends_at).map((x) => [x.color, x.ends_at.toISOString()])) };
}

/**
 * The color as the phone showed it is the color as it is sold now, or nothing moves: a newer app sends the price and
 * days it showed; an older one shows its compiled list (an app's own color at its old price, kept for good).
 */
function shownOk(b, item) {
  const days = item.days ?? 0;
  if (b.price === undefined && b.days === undefined) {
    if (!item.builtin || SEAT_PRICES_OLD_APP[item.sku] !== item.price || days) throw err(409, 'Bu rengi almak için uygulamayı güncelle', 'update_required');
    return;
  }
  const shown = Number(b.price);
  if (!(Number.isSafeInteger(shown) && shown >= item.price)) throw err(409, `Fiyat değişti: şimdi ${fmt(item.price)} jeton`, 'price_changed', { price: item.price, days });
  if (Number(b.days ?? 0) !== days) throw err(409, days ? `Süre değişti: şimdi ${days} gün` : 'Süre değişti: artık süresiz', 'price_changed', { price: item.price, days });
}

export const roomSeatColorRoutes = {
  async 'GET /api/rooms/seat-color'(req, url) {
    await auth(req);
    const room = await roomRow(url.searchParams.get('room'));
    const o = await ownedOf(room.id);
    const stored = typeof room.seat_color === 'string' && seatItem(room.seat_color) && o.owned.includes(room.seat_color) ? room.seat_color : null;
    return { color: stored ?? SEAT_DEFAULT, ...o };
  },

  async 'POST /api/rooms/seat-color'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.room);
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    if ((await rankOf(room, me.id)) < 3) throw new HttpError(403, 'Koltuk rengini yalnızca oda sahibi değiştirir');
    const color = seatItem(typeof b.color === 'string' ? b.color : undefined);
    if (!color) throw new HttpError(400, 'Geçersiz koltuk rengi');
    limit(`seatcolor:${me.id}`, 20, 'Çok sık değiştirdin, biraz bekle');
    const free = color.sku === SEAT_DEFAULT;
    const stored = free ? null : color.sku;
    let paid = null;
    let took = 0;
    if (!free && !(await ownedOf(room.id)).owned.includes(color.sku)) {
      paid = await once(me.id, 'coin', b.ref, async (c) => {
        await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [me.id]);
        await claimRef(c, me.id, 'coin', b.ref);
        // After the ref (a retry of a buy that went through gets its replay): the color as it is sold now.
        const now = seatItem(color.sku);
        if (!now?.enabled) throw new HttpError(400, `${color.name} artık satılmıyor; başka bir renk seç`);
        shownOk(b, now);
        await spendCoins(c, me.id, now.price, `Koltuk rengi: ${now.name}`, b.ref, null, { detail: { room: room.id, seatColor: now.sku, ...(now.days ? { days: now.days } : {}) } });
        // A color bought before and run out is bought again; one the room still has (two buys at once) is refused.
        const r = await c.query(
          `INSERT INTO room_seat_colors (room_id, color, buyer, price, ref, ends_at) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (room_id, color) DO UPDATE SET buyer = EXCLUDED.buyer, price = EXCLUDED.price, ref = EXCLUDED.ref, created_at = now(), ends_at = EXCLUDED.ends_at
           WHERE room_seat_colors.ends_at IS NOT NULL AND room_seat_colors.ends_at <= now()`,
          [room.id, now.sku, me.id, now.price, b.ref, now.days ? new Date(Date.now() + now.days * DAY) : null],
        );
        if (!r.rowCount) throw new HttpError(409, 'Bu renk zaten odanın');
        await c.query('UPDATE rooms SET seat_color = $2 WHERE id = $1', [room.id, stored]);
        took = now.price;
      });
      // once() keys on (me, coin, ref), shared with gifts and the shop: only this color's purchase is its replay.
      if (paid.replay) {
        const was = await db.query('SELECT 1 FROM room_seat_colors WHERE buyer = $1 AND ref = $2 AND room_id = $3 AND color = $4', [me.id, b.ref, room.id, color.sku]);
        if (!was.rowCount) throw new HttpError(409, 'Geçersiz istek kimliği');
      }
    } else {
      await db.query('UPDATE rooms SET seat_color = $2 WHERE id = $1', [room.id, stored]);
    }
    await pushRoomMeta(room.id);
    return { color: color.sku, ...(await ownedOf(room.id)), price: paid && !paid.replay ? took : 0, ...(paid && { user: paid.user, replay: paid.replay }) };
  },
};

let sweep = null;
/** Every minute (SEAT_COLOR_SWEEP_MS): a room whose color ran out is silver again, on every phone. */
export function startSeatColorSweep() {
  if (sweep) return;
  const ms = Number(env.SEAT_COLOR_SWEEP_MS ?? 60_000);
  sweep = setInterval(async () => {
    try {
      const r = await db.query(
        `UPDATE rooms r SET seat_color = NULL FROM room_seat_colors s
          WHERE s.room_id = r.id AND s.color = r.seat_color AND s.ends_at IS NOT NULL AND s.ends_at <= now() RETURNING r.id`,
      );
      for (const x of r.rows) await pushRoomMeta(x.id);
    } catch (e) {
      console.error('seat color sweep failed', String(e?.message ?? e).slice(0, 200));
    }
  }, Number.isSafeInteger(ms) && ms > 0 ? ms : 60_000);
  sweep.unref();
}
