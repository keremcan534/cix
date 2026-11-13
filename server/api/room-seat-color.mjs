// Koltuk rengi: the color of a room's empty mics (the pouf pictures), the same on every phone. Only the owner picks
// it. Each color but the free turquoise is bought once for the room with the owner's coins and kept, so going back
// to a color the room has costs nothing. The server takes the price from its catalog (catalog.mjs SEAT_COLORS).
//
//   GET  /api/rooms/seat-color?room=<id>     → { color, owned }
//   POST /api/rooms/seat-color { room, color, ref } → { color, owned, price, user?, replay? }
//     color: a SEAT_COLORS id ('turkuaz': the default, stored as null). owned: the colors the room has bought.
//     price: what this call took (0 when the color was free or already the room's). user: my wallet after a purchase.
//
// rooms.seat_color goes into the LiveKit room metadata (rooms.mjs pushRoomMeta), so every phone repaints at once.
// Reward coins ('odul') can't pay for it (spendCoins 'paid'); the coins go to the platform.
import { SEAT_COLORS } from './catalog.mjs';
import { HttpError, auth, claimRef, db, limit, once, readJson } from './core.mjs';
import { pushRoomMeta, rankOf, roomRow } from './rooms.mjs';
import { spendCoins } from './wallet.mjs';

const ownedOf = async (roomId) => (await db.query('SELECT color FROM room_seat_colors WHERE room_id = $1 ORDER BY created_at, color', [roomId])).rows.map((r) => r.color);
/** The color a stored value stands for (an unknown one, say from a removed color, is the default). */
export const seatColorView = (v) => (typeof v === 'string' && SEAT_COLORS.has(v) ? v : null);

export const roomSeatColorRoutes = {
  async 'GET /api/rooms/seat-color'(req, url) {
    await auth(req);
    const room = await roomRow(url.searchParams.get('room'));
    return { color: seatColorView(room.seat_color) ?? 'turkuaz', owned: await ownedOf(room.id) };
  },

  async 'POST /api/rooms/seat-color'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.room);
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    if ((await rankOf(room, me.id)) < 3) throw new HttpError(403, 'Koltuk rengini yalnızca oda sahibi değiştirir');
    const color = typeof b.color === 'string' ? SEAT_COLORS.get(b.color) : undefined;
    if (!color) throw new HttpError(400, 'Geçersiz koltuk rengi');
    limit(`seatcolor:${me.id}`, 20, 'Çok sık değiştirdin, biraz bekle');
    const stored = color.price ? color.id : null;
    let paid = null;
    if (color.price && !(await ownedOf(room.id)).includes(color.id)) {
      // Two buys of one color at once: the second hits the (room, color) key and is refused, its coins untouched.
      paid = await once(me.id, 'coin', b.ref, async (c) => {
        await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [me.id]);
        await claimRef(c, me.id, 'coin', b.ref);
        await spendCoins(c, me.id, color.price, `Koltuk rengi: ${color.name}`, b.ref, null, { detail: { room: room.id, seatColor: color.id } });
        await c.query('INSERT INTO room_seat_colors (room_id, color, buyer, price, ref) VALUES ($1, $2, $3, $4, $5)', [room.id, color.id, me.id, color.price, b.ref]);
        await c.query('UPDATE rooms SET seat_color = $2 WHERE id = $1', [room.id, stored]);
      });
      // once() keys on (me, coin, ref), shared with gifts and the shop: only this color's purchase is its replay.
      if (paid.replay) {
        const was = await db.query('SELECT 1 FROM room_seat_colors WHERE buyer = $1 AND ref = $2 AND room_id = $3 AND color = $4', [me.id, b.ref, room.id, color.id]);
        if (!was.rowCount) throw new HttpError(409, 'Geçersiz istek kimliği');
      }
    } else {
      await db.query('UPDATE rooms SET seat_color = $2 WHERE id = $1', [room.id, stored]);
    }
    await pushRoomMeta(room.id);
    return { color: color.id, owned: await ownedOf(room.id), price: paid && !paid.replay ? color.price : 0, ...(paid && { user: paid.user, replay: paid.replay }) };
  },
};
