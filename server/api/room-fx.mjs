// Hareketli in rooms: a paid animation (Kelebekler, Gül Buketi, Altın Yağmuru…) sent in a server room plays on every
// phone in it. The app sends only the animation's id; the server takes the catalog price (catalog.mjs ROOM_ANIMS)
// and then tells the room (LiveKit SendData, a packet with no sending participant), so no phone can show a paid
// animation nobody paid for. Free reactions never come here: the phones send those to each other (app
// lib/live/room-bus), and a phone drops a paid one that comes from another phone.
//
//   POST /api/rooms/animation { room, animationId, ref } → { user, replay, eventId, price }
//
// The coins go to the platform (no one earns diamonds from a room animation) and count for Cömertlik like any spend
// (wheel.mjs wealthPoints). Reward coins ('odul') can't pay for one (spendCoins 'paid').
import { ROOM_ANIMS, animOnSale } from './catalog.mjs';
import { HttpError, auth, claimRef, db, limit, once, readJson } from './core.mjs';
import { ROOM, announceGift, liveKitRoom } from './gifts.mjs';
import { spendCoins } from './wallet.mjs';

export const roomFxRoutes = {
  async 'POST /api/rooms/animation'(req) {
    const u = await auth(req);
    const b = await readJson(req);
    const raw = b.room === undefined || b.room === null ? '' : String(b.room);
    const room = ROOM.test(raw) ? liveKitRoom(raw) : null;
    if (!room) throw new HttpError(400, 'Animasyon yalnızca bir odada gönderilir');
    const a = typeof b.animationId === 'string' ? ROOM_ANIMS.get(b.animationId) : undefined;
    if (!a || !animOnSale(a)) throw new HttpError(400, 'Bu animasyon şu an kullanılamıyor');
    const open = await db.query('SELECT 1 FROM rooms WHERE id = $1 AND closed_at IS NULL', [room.slice(4)]);
    if (!open.rowCount) throw new HttpError(404, 'Oda kapalı');
    limit(`room-anim:${u.id}`, 30, 'Çok sık animasyon gönderiyorsun, biraz bekle');
    let eventId = null;
    const out = await once(u.id, 'coin', b.ref, async (c) => {
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [u.id]);
      await claimRef(c, u.id, 'coin', b.ref);
      await spendCoins(c, u.id, a.price, `Animasyon: ${a.name}`, b.ref, null, { detail: { room, animation: a.id } });
      const r = await c.query('INSERT INTO room_animations (room, sender, animation_id, price, ref) VALUES ($1,$2,$3,$4,$5) RETURNING id', [room, u.id, a.id, a.price, b.ref]);
      eventId = Number(r.rows[0].id);
    });
    if (out.replay) {
      // once() keys on (sender, coin, ref), shared with gifts and bags: only an animation of this ref is its replay.
      const was = (await db.query('SELECT id, price FROM room_animations WHERE sender = $1 AND ref = $2', [u.id, b.ref])).rows[0];
      if (!was) throw new HttpError(409, 'Geçersiz istek kimliği');
      return { ...out, eventId: Number(was.id), price: was.price };
    }
    announceGift(room, { type: 'anim', animationId: a.id, from: u.id, eventId });
    return { ...out, eventId, price: a.price };
  },
};
