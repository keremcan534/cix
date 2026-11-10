// Oda Süslemesi (the picture behind a server room's stage) and Oda Kapağı (the picture on the room's card in lists).
// They are two things: the background is free, paid or the owner's own picture; the cover is a free upload.
//
//   GET  /api/rooms/decor?room=                                → { decor }                       (owner or Süper Yönetici)
//   POST /api/rooms/decor/pick   { room, pick: 'free', bgId }  → { room, decor }   bgId: a free background, null = the theme's stage
//   POST /api/rooms/decor/pick   { room, pick: 'custom' | sku } → { room, decor }  what the owner has: their picture, a paid one
//   POST /api/rooms/decor/buy    { room, sku, price, ref }     → { user, replay, room, decor }   (owner; a paid background)
//   POST /api/rooms/decor/custom { room, url, price?, ref? }   → { user?, replay?, charged, room, decor }   (owner)
//   POST /api/rooms/decor/custom/remove { room }               → { room, decor }                 (owner)
//   POST /api/rooms/cover        { room, url | null }          → { room }                        (owner or Süper Yönetici)
//   GET  /api/admin/rooms/background?room=                     (staff) → { room, owner, url, until }
//   POST /api/admin/rooms/background/remove { room, reason }   (staff) → { removed }
//
// Who: the owner or a Süper Yönetici picks what the room shows and changes the cover (the rule the room's name
// and bulletin have); only the owner pays, and only the owner uploads, replaces or removes their own picture.
// Ücretsiz: catalog.mjs ROOM_COVERS, each opened by the room's level, kept on the room (rooms.bg_id).
// Ücretli: catalog.mjs ROOM_BGS, bought for a term and owned like a shop item (economy.mjs entitlements, kind
//   'roombg'): a re-buy adds to the term, a store refund takes the item back, account deletion revokes it.
// Özel: the owner pays the live price (5.000 jeton) and their own picture is the room's background for the live
//   number of days (30). In that time they replace it without paying again (3 a minute, CUSTOM_CHANGES a day) and may
//   remove it. A picture staff take down for breaking the rules ends the term with it, without a refund.
// What a room shows is worked out on every read (backgroundOf): a term that ended is not shown, so the room is back
// on its last free background at once; the sweep then deletes an ended picture's file within minutes, and a closed
// room's cover. Every change tells the phones in the room to read it again (live.mjs announceRoom).
// What was paid for belongs to the owner, not to one room (room_decor): it follows them into a room they open again.
// There is no automatic check of what a picture shows: people report the room and staff remove the picture here.
// Kept: room_decor while the account exists (the picture as above); deleted with the account (eraseDecor).
import { ROOM_BGS, ROOM_COVERS } from './catalog.mjs';
import { HttpError, UUID, auth, claimRef, db, env, limit, once, readJson, text } from './core.mjs';
import { grantInTx, statusOf } from './economy.mjs';
import { assertOn } from './features.mjs';
import { announceRoom } from './live.mjs';
import { live } from './live-settings.mjs';
import { keyOf, removeFiles, verifyUpload } from './media.mjs';
// rooms.mjs imports this file too; its functions are only used inside handlers, after both have loaded.
import { liveKitName, rankOf, roomLevel, roomOut, roomRow, withVoiceCounts } from './rooms.mjs';
import { audit } from './sanctions.mjs';
import { spendCoins } from './wallet.mjs';

const OWNER = 3;
const SUPER = 2;
/** How many times a day the owner may replace their picture inside a term. */
export const CUSTOM_CHANGES = 10;
const fmt = (n) => n.toLocaleString('tr-TR');
const err = (status, message, code, extra = {}) => Object.assign(new HttpError(status, message), { extra: { code, ...extra } });

/** Whether a paid background may be bought now: its picture is in the released app, or this server sells them all. */
const onSale = (item) => item.sale || env.ROOM_BG_PREVIEW === '1';

/**
 * What every phone draws behind the stage of a room row read with rooms.mjs ROOM_SELECT: the owner's own picture
 * while its term runs, a paid background while the owner owns it, else the free one (`id` null: the theme's stage).
 */
export function backgroundOf(r) {
  if (r.bg_pick === 'custom' && r.bg_custom_url && r.bg_custom_live) return { kind: 'custom', id: null, url: r.bg_custom_url, until: r.bg_custom_until };
  if (r.bg_pick && r.bg_pick !== 'custom' && r.bg_paid_until && ROOM_BGS.has(r.bg_pick)) return { kind: 'paid', id: r.bg_pick, url: null, until: r.bg_paid_until };
  return { kind: 'free', id: r.bg_id ?? null, url: null, until: null };
}

/** One of `me`'s own uploads of `kind`, or a 400. */
function ownUpload(url, kind, me) {
  const key = typeof url === 'string' && url.length <= 500 ? keyOf(url, me.id) : null;
  if (!key || !key.startsWith(`${kind}/`)) throw new HttpError(400, 'Geçersiz görsel');
  return url;
}

const decorRow = async (owner) =>
  (await db.query('SELECT d.*, d.custom_until > now() AS custom_live, d.changes_day = current_date AS changes_today FROM room_decor d WHERE d.owner = $1', [owner])).rows[0] ?? null;
const iso = (t) => (t === null || t === undefined ? null : new Date(t).toISOString());

/** The room as everyone reads it now, and the phones in it told to read it again. */
async function changed(roomId) {
  announceRoom(liveKitName(roomId));
  const [fresh] = await withVoiceCounts([await roomRow(roomId)]);
  return fresh;
}
/** The owner's open room, if any, is told to read itself again (their picture ended or was taken down). */
async function announceOwner(owner) {
  for (const r of (await db.query('SELECT id FROM rooms WHERE owner = $1 AND closed_at IS NULL', [owner])).rows) announceRoom(liveKitName(r.id));
}

/** Oda Süslemesi and Oda Kapağı as the room's settings show them: what is chosen, what may be chosen, the prices. */
async function decorOf(room, rank) {
  const s = live();
  const d = await decorRow(room.owner);
  const st = await statusOf(db, room.owner);
  const level = roomLevel(room.owner_room_xp ?? 0);
  const term = !!d?.custom_live;
  return {
    serverNow: iso(st.now),
    level,
    canEdit: rank >= SUPER,
    owner: rank === OWNER,
    // The free background (null: the theme's stage), what is picked over it, and what the room shows now.
    bgId: room.bg_id ?? null,
    pick: d?.pick ?? null,
    showing: backgroundOf(room),
    free: ROOM_COVERS.map((c) => ({ id: c.id, minLevel: c.minLevel, open: level >= c.minLevel })),
    paid: {
      on: !s.roomDecorOff.has('paid'),
      items: [...ROOM_BGS.values()].map((x) => ({ sku: x.sku, name: x.name, price: x.price, days: x.days, onSale: onSale(x), until: iso(st.items.get(x.sku)?.until ?? null) })),
    },
    custom: {
      on: !s.roomDecorOff.has('custom'),
      price: s.roomBgCustomPrice,
      days: s.roomBgCustomDays,
      // Inside a paid term: its end, the picture (null once removed: a new one costs nothing) and today's changes left.
      until: term ? iso(d.custom_until) : null,
      url: term ? (d.custom_url ?? null) : null,
      changesLeft: term ? Math.max(0, CUSTOM_CHANGES - (d.changes_today ? d.changes : 0)) : CUSTOM_CHANGES,
      // Staff took the last picture down for breaking the rules (shown until the next purchase).
      removed: !term && !!d?.custom_removed_at,
    },
    cover: { url: room.cover_url ?? null },
  };
}

async function staffOf(req) {
  const u = await auth(req);
  if (u.role !== 'moderator' && u.role !== 'admin') throw new HttpError(403, 'Yetkili hesabı gerekli');
  return u;
}

/** The room and my rank in it, refused unless the room is open and I'm at least `need`. */
async function roomFor(me, id, need, refusal) {
  const room = await roomRow(id);
  const rank = await rankOf(room, me.id);
  if (rank < need) throw new HttpError(403, refusal);
  if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
  return { room, rank };
}
const EDITORS = 'Oda süslemesini ve kapağını oda sahibi veya Süper Yönetici değiştirebilir';

// --- Account deletion and the sweep ------------------------------------------------------------------------------
/**
 * Account deletion (social.mjs eraseAccount, same transaction): their decoration row goes, and so does every room's
 * cover they uploaded (their own rooms' and one they put up as someone's Süper Yönetici). The files themselves go
 * with media.mjs removeUserFiles; a cover someone else uploaded for their room goes with the sweep, once the room
 * is closed.
 */
export async function eraseDecor(c, id) {
  await c.query('DELETE FROM room_decor WHERE owner = $1', [id]);
  await c.query("UPDATE rooms SET cover_url = NULL WHERE cover_url IS NOT NULL AND position('/roomcover/' || $1::text || '/' in cover_url) > 0", [id]);
}

/**
 * What nobody sees any more leaves the storage: an owner's picture whose term ended (their open room is told to
 * read itself again) and the cover of a closed room. Returns how many pictures went.
 */
export async function sweepDecor() {
  const ended = await db.query(
    `UPDATE room_decor d SET custom_url = NULL, pick = CASE WHEN d.pick = 'custom' THEN NULL ELSE d.pick END, updated_at = now()
       FROM (SELECT owner, custom_url FROM room_decor WHERE custom_url IS NOT NULL AND custom_until <= now() ORDER BY custom_until LIMIT 200 FOR UPDATE SKIP LOCKED) old
      WHERE d.owner = old.owner RETURNING old.owner, old.custom_url AS url`,
  );
  removeFiles(ended.rows.map((x) => x.url));
  for (const x of ended.rows) await announceOwner(x.owner);
  const closed = await db.query(
    `UPDATE rooms r SET cover_url = NULL
       FROM (SELECT id, cover_url FROM rooms WHERE cover_url IS NOT NULL AND closed_at IS NOT NULL LIMIT 200 FOR UPDATE SKIP LOCKED) old
      WHERE r.id = old.id RETURNING old.cover_url AS url`,
  );
  removeFiles(closed.rows.map((x) => x.url));
  return ended.rowCount + closed.rowCount;
}

let timer = null;
/** ROOM_DECOR_SWEEP_MS: tests run it often; otherwise every 10 minutes. */
export function startDecorSweep() {
  if (timer) return;
  const run = () => sweepDecor().catch((e) => console.error('room decor sweep', e.message));
  const every = Number(env.ROOM_DECOR_SWEEP_MS);
  timer = setInterval(run, Number.isFinite(every) && every >= 100 ? every : 10 * 60_000);
  timer.unref();
  run();
}
export function stopDecorSweep() {
  clearInterval(timer);
  timer = null;
}

// --- Routes ------------------------------------------------------------------------------------------------------
export const roomDecorRoutes = {
  async 'GET /api/rooms/decor'(req, url) {
    const me = await auth(req);
    const room = await roomRow(url.searchParams.get('room'));
    const rank = await rankOf(room, me.id);
    if (rank < SUPER) throw new HttpError(403, EDITORS);
    return { decor: await decorOf(room, rank) };
  },

  /**
   * What the room shows: a free background (null: the theme's stage; each opens at its room level), or one of what
   * the owner has (their own picture inside its term, a paid background they own now). The free choice stays on
   * the room as the one it goes back to.
   */
  async 'POST /api/rooms/decor/pick'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const { room, rank } = await roomFor(me, b.room, SUPER, EDITORS);
    limit(`roomedit:${me.id}`, 30, 'Çok sık değiştirdin, biraz bekle');
    if (b.pick === 'free') {
      const c = b.bgId === null ? null : ROOM_COVERS.find((x) => x.id === b.bgId);
      if (c === undefined) throw new HttpError(400, 'Geçersiz süsleme');
      if (c && roomLevel(room.owner_room_xp ?? 0) < c.minLevel) throw new HttpError(403, `Bu süsleme Lv.${c.minLevel} odada açılır`);
      await db.query('UPDATE rooms SET bg_id = $2 WHERE id = $1', [room.id, c ? c.id : null]);
      await db.query('UPDATE room_decor SET pick = NULL, updated_at = now() WHERE owner = $1 AND pick IS NOT NULL', [room.owner]);
    } else if (b.pick === 'custom') {
      const d = await decorRow(room.owner);
      if (!d?.custom_live || !d.custom_url) throw new HttpError(409, 'Özel süsleme yok ya da süresi doldu');
      await db.query("UPDATE room_decor SET pick = 'custom', updated_at = now() WHERE owner = $1", [room.owner]);
    } else {
      const item = typeof b.pick === 'string' ? ROOM_BGS.get(b.pick) : undefined;
      if (!item) throw new HttpError(400, 'Geçersiz süsleme');
      if (!(await statusOf(db, room.owner)).items.has(item.sku)) throw new HttpError(403, 'Bu süsleme oda sahibinde yok ya da süresi doldu');
      await db.query('INSERT INTO room_decor (owner, pick) VALUES ($1, $2) ON CONFLICT (owner) DO UPDATE SET pick = $2, updated_at = now()', [room.owner, item.sku]);
    }
    const fresh = await changed(room.id);
    return { room: roomOut(fresh), decor: await decorOf(fresh, rank) };
  },

  /**
   * The owner buys a paid background for its term, at the server's price (`price` is what the app showed), and the
   * room shows it at once. One transaction: the item, the charge and the pick land together or not at all. Reward
   * coins may pay, as in the shop. Stops with Mağaza (features.mjs 'shop') and with its own live switch.
   */
  async 'POST /api/rooms/decor/buy'(req) {
    const me = await auth(req);
    limit(`buy:${me.id}`, 30);
    const b = await readJson(req);
    const { room, rank } = await roomFor(me, b.room, OWNER, 'Ücretli süslemeyi yalnızca oda sahibi satın alır');
    const item = typeof b.sku === 'string' ? ROOM_BGS.get(b.sku) : undefined;
    if (!item) throw new HttpError(400, 'Geçersiz süsleme');
    assertOn('shop');
    if (live().roomDecorOff.has('paid')) throw err(503, 'Ücretli süslemeler şu an satışta değil', 'decor_off');
    if (!onSale(item)) throw err(409, 'Bu süsleme yakında satışa çıkacak', 'not_on_sale');
    const out = await once(me.id, 'coin', b.ref, async (c) => {
      const u = (await c.query('SELECT coins FROM users WHERE id = $1 FOR UPDATE', [me.id])).rows[0];
      await claimRef(c, me.id, 'coin', b.ref);
      if (!(Number.isSafeInteger(b.price) && b.price >= item.price)) throw err(409, `Fiyat değişti: şimdi ${fmt(item.price)} jeton`, 'price_changed', { price: item.price });
      if (Number(u.coins) < item.price) throw err(409, 'Yetersiz jeton', 'insufficient');
      await grantInTx(c, me.id, item, { ref: b.ref, source: 'buy', price: item.price });
      await spendCoins(c, me.id, item.price, `Oda süslemesi: ${item.name} (${item.days} gün)`, b.ref, null, { use: 'items', detail: { sku: item.sku, kind: item.kind, days: item.days, room: room.id } });
      await c.query('INSERT INTO room_decor (owner, pick) VALUES ($1, $2) ON CONFLICT (owner) DO UPDATE SET pick = $2, updated_at = now()', [me.id, item.sku]);
    });
    // once() keys on (person, coin, ref), shared with gifts and the shop: only this background's buy is its replay.
    if (out.replay && !(await db.query('SELECT 1 FROM entitlements WHERE user_id = $1 AND ref = $2 AND sku = $3', [me.id, b.ref, item.sku])).rowCount) throw new HttpError(409, 'Geçersiz istek kimliği');
    const fresh = await changed(room.id);
    return { ...out, room: roomOut(fresh), decor: await decorOf(fresh, rank) };
  },

  /**
   * Özel süsleme: the owner's own picture (already in the storage, kind 'roombg') becomes the room's background.
   * Outside a term it is a purchase: the live price is charged (`price` is what the app showed; `ref` makes a
   * repeated request charge once) and the term starts. Inside a term the picture is only replaced, at no charge,
   * a few times a day. The picture it replaces leaves the storage.
   */
  async 'POST /api/rooms/decor/custom'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const { room, rank } = await roomFor(me, b.room, OWNER, 'Özel süslemeyi yalnızca oda sahibi yükler');
    const url = ownUpload(b.url, 'roombg', me);
    const before = await decorRow(me.id);
    /** A picture this request brought and nothing uses leaves the storage again. */
    const drop = () => void (url !== before?.custom_url && removeFiles([url], me.id));
    let out = { charged: false };
    try {
      await verifyUpload(url, 'roombg');
      if (before?.custom_live && before.custom_url === url) {
        // The picture the room already has (a purchase sent again after its answer was lost): nothing to change.
        await db.query("UPDATE room_decor SET pick = 'custom', updated_at = now() WHERE owner = $1 AND pick IS DISTINCT FROM 'custom'", [me.id]);
      } else if (before?.custom_live) {
        limit(`roombg:${me.id}`, 3, 'Çok sık değiştirdin, biraz bekle');
        // The daily cap is taken in the same statement that stores the picture, so two at once can't pass it together.
        const r = await db.query(
          `UPDATE room_decor SET custom_url = $2, pick = 'custom', updated_at = now(), changes_day = current_date,
                  changes = CASE WHEN changes_day = current_date THEN changes + 1 ELSE 1 END
            WHERE owner = $1 AND custom_until > now() AND (changes_day IS DISTINCT FROM current_date OR changes < $3) RETURNING 1`,
          [me.id, url, CUSTOM_CHANGES],
        );
        if (!r.rowCount) throw new HttpError(429, `Görseli günde en fazla ${CUSTOM_CHANGES} kez değiştirebilirsin`);
      } else {
        const s = live();
        assertOn('shop');
        if (s.roomDecorOff.has('custom')) throw err(503, 'Özel süsleme şu an satışta değil', 'decor_off');
        const price = s.roomBgCustomPrice;
        const days = s.roomBgCustomDays;
        const paid = await once(me.id, 'coin', b.ref, async (c) => {
          await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [me.id]);
          await claimRef(c, me.id, 'coin', b.ref);
          if (!(Number.isSafeInteger(b.price) && b.price >= price)) throw err(409, `Fiyat değişti: şimdi ${fmt(price)} jeton`, 'price_changed', { price });
          await spendCoins(c, me.id, price, `Oda süslemesi: özel görsel (${days} gün)`, b.ref, null, { detail: { room: room.id, decor: 'custom', days } });
          await c.query(
            `INSERT INTO room_decor (owner, pick, custom_url, custom_until, custom_paid_at, custom_price, custom_ref)
             VALUES ($1, 'custom', $2, now() + make_interval(days => $3::int), now(), $4, $5)
             ON CONFLICT (owner) DO UPDATE SET pick = 'custom', custom_url = $2, custom_until = now() + make_interval(days => $3::int), custom_paid_at = now(),
               custom_price = $4, custom_ref = $5, custom_removed_at = NULL, changes = 0, changes_day = NULL, updated_at = now()`,
            [me.id, url, days, price, b.ref],
          );
        });
        const now = await decorRow(me.id);
        // once() keys on (person, coin, ref), shared with gifts and the shop: only this purchase is its replay.
        if (paid.replay && now?.custom_ref !== b.ref) throw new HttpError(409, 'Geçersiz istek kimliği');
        // A repeated request that uploaded the picture again: the first one's picture is the room's.
        if (paid.replay && now.custom_url !== url) removeFiles([url], me.id);
        out = { ...paid, charged: !paid.replay };
      }
    } catch (e) {
      drop();
      throw e;
    }
    // The picture this one replaced (also one left from a term that ended before the sweep came by).
    if (before?.custom_url && before.custom_url !== url && !out.replay) removeFiles([before.custom_url]);
    const fresh = await changed(room.id);
    return { ...out, room: roomOut(fresh), decor: await decorOf(fresh, rank) };
  },

  /** The owner takes their picture off: the file is deleted, the room is back on its free background. The term
   *  they paid for runs on, so a new picture costs nothing until it ends. */
  async 'POST /api/rooms/decor/custom/remove'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const { room, rank } = await roomFor(me, b.room, OWNER, 'Özel süslemeyi yalnızca oda sahibi kaldırır');
    limit(`roomedit:${me.id}`, 30, 'Çok sık değiştirdin, biraz bekle');
    const r = await db.query(
      `UPDATE room_decor d SET custom_url = NULL, pick = CASE WHEN d.pick = 'custom' THEN NULL ELSE d.pick END, updated_at = now()
         FROM (SELECT owner, custom_url FROM room_decor WHERE owner = $1 FOR UPDATE) old WHERE d.owner = old.owner RETURNING old.custom_url AS url`,
      [me.id],
    );
    if (r.rows[0]?.url) removeFiles([r.rows[0].url]);
    const fresh = await changed(room.id);
    return { room: roomOut(fresh), decor: await decorOf(fresh, rank) };
  },

  /**
   * Oda Kapağı: the picture on the room's card (Odalar, the room card, Mesajlar). The owner or a Süper Yönetici
   * puts up one they uploaded (kind 'roomcover'), or takes it off with null: the lists then show what they showed
   * before. Free. The picture it replaces leaves the storage.
   */
  async 'POST /api/rooms/cover'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const { room } = await roomFor(me, b.room, SUPER, EDITORS);
    const url = b.url === null ? null : ownUpload(b.url, 'roomcover', me);
    limit(`roomcover:${me.id}`, 5, 'Çok sık değiştirdin, biraz bekle');
    try {
      if (url) await verifyUpload(url, 'roomcover');
    } catch (e) {
      removeFiles([url], me.id);
      throw e;
    }
    const r = await db.query(
      'UPDATE rooms r SET cover_url = $2 FROM (SELECT id, cover_url FROM rooms WHERE id = $1 FOR UPDATE) old WHERE r.id = old.id AND r.closed_at IS NULL RETURNING old.cover_url AS url',
      [room.id, url],
    );
    if (!r.rowCount) {
      if (url) removeFiles([url], me.id);
      throw new HttpError(410, 'Oda kapandı');
    }
    // Whoever uploaded the old one (the owner or a Süper Yönetici): its file goes.
    if (r.rows[0].url && r.rows[0].url !== url) removeFiles([r.rows[0].url]);
    return { room: roomOut(await changed(room.id)) };
  },

  /** Staff look at a room's own picture before deciding (the report queue's room reports). */
  async 'GET /api/admin/rooms/background'(req, url) {
    await staffOf(req);
    const id = String(url.searchParams.get('room') ?? '');
    if (!UUID.test(id)) throw new HttpError(400, 'Geçersiz oda');
    const r = (
      await db.query(
        `SELECT r.id, r.title, r.owner, r.cover_url, u.name AS owner_name, d.pick, d.custom_url, d.custom_until, d.custom_until > now() AS custom_live
           FROM rooms r JOIN users u ON u.id = r.owner LEFT JOIN room_decor d ON d.owner = r.owner WHERE r.id = $1`,
        [id],
      )
    ).rows[0];
    if (!r) throw new HttpError(404, 'Oda bulunamadı');
    const has = !!r.custom_live && !!r.custom_url;
    return { room: { id: r.id, title: r.title }, owner: { id: r.owner, name: r.owner_name }, url: has ? r.custom_url : null, until: has ? iso(r.custom_until) : null, shown: has && r.pick === 'custom', coverUrl: r.cover_url ?? null };
  },

  /**
   * Staff take a room's own picture down for breaking the rules: the file is deleted, the term the owner paid for
   * ends with it and nothing is refunded (the purchase text says so). The room is back on its free background at
   * once. Audited with the reason. A picture that is evidence of a sanction stays in the storage (media.mjs).
   */
  async 'POST /api/admin/rooms/background/remove'(req) {
    const me = await staffOf(req);
    const b = await readJson(req);
    if (typeof b.room !== 'string' || !UUID.test(b.room)) throw new HttpError(400, 'Geçersiz oda');
    const reason = text(b.reason, 3, 300, 'Neden');
    const room = (await db.query('SELECT id, owner FROM rooms WHERE id = $1', [b.room])).rows[0];
    if (!room) throw new HttpError(404, 'Oda bulunamadı');
    const r = await db.query(
      `UPDATE room_decor d SET custom_url = NULL, custom_until = now(), custom_removed_at = now(), pick = CASE WHEN d.pick = 'custom' THEN NULL ELSE d.pick END, updated_at = now()
         FROM (SELECT owner, custom_url, custom_until, custom_price FROM room_decor WHERE owner = $1 AND custom_url IS NOT NULL FOR UPDATE) old
        WHERE d.owner = old.owner RETURNING old.custom_url AS url, old.custom_until AS until, old.custom_price AS price`,
      [room.owner],
    );
    if (!r.rowCount) throw new HttpError(404, 'Bu odanın özel süslemesi yok');
    const old = r.rows[0];
    await audit(db, { actor: me.id, role: me.role, action: 'room_background_remove', target: room.owner, detail: { room: room.id, reason, until: iso(old.until), price: Number(old.price ?? 0) } });
    removeFiles([old.url]);
    await announceOwner(room.owner);
    return { removed: true };
  },
};
