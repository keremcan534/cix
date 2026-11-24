// Özel albüm (owners, 24 Nov 2026: "yayıncılar için özel albüm, bir coins bedeli olacaktı"): an approved agency
// streamer keeps up to PRIVATE_ALBUM_MAX photos that others open with coins. The owners' rules:
//   - the price is one for everyone, Canlı ayarlar › Özel albüm (live privateAlbumPrice); 0 closes the album
//     (nobody opens one, no streamer adds to one; whoever opened one before still sees it);
//   - the coins become the streamer's diamonds as a gift's do (wallet.mjs giftDiamonds, each portion locked by the
//     coins that paid), and the agency's commission runs as for a gift (income 'gift');
//   - photos show at once, no review first; a reported one comes off in the panel (Kullanıcılar, Şikâyetler);
//   - only a streamer in an approved agency with an approved contract has one (as GET /api/user's agency).
// Opening is for good: whoever opened an album sees it as it grows, even if the streamer leaves the agency later.
// A locked album says only how many photos it holds: no address of a photo reaches anyone who hasn't opened it.
//
//   GET  /api/user/private-album?id=                → { on, price, count, max, mine, can, unlocked, photos }
//   POST /api/me/private-album { url }               → the same, for me (a photo I uploaded as kind 'private')
//   POST /api/me/private-album/remove { id }         → the same (my photo and its file go)
//   POST /api/user/private-album/unlock { user, price, ref } → { album, user, replay }
//     price: what the phone showed; another price now is a 409 price_changed { price } and nothing moves. ref: the
//     request's own id (once): a retry of an unlock that went through gets its replay.
//   GET  /api/admin/private-album?user=              → { user, photos (removed ones too), unlocks, coins }   (admin, panel)
//   POST /api/admin/private-album/remove { user, id, reason } → { removed }                         (admin, panel; audited)
//
// An older app reads none of this. Money: private_album_unlocks is checked against the ledger (money-check.mjs
// album), the finance panel gets each unlock as a gift named 'ozel_album' (finance-sync.mjs).
import { recordIncome } from './agency-lib.mjs';
import { HttpError, auth, claimRef, clientIp, db, env, int, limit, once, readJson, tx, userId } from './core.mjs';
import { live } from './live-settings.mjs';
import { keyOf, readStored, removeFiles, storageOn, verifyUpload } from './media.mjs';
import { panelDetail } from './panel.mjs';
import { giftDiamonds, spendCoins } from './wallet.mjs';

/** How many photos an album holds at most. */
export const PRIVATE_ALBUM_MAX = 12;
const PHOTO_BYTES = 8 * 1024 * 1024;
const fmt = (n) => Number(n).toLocaleString('tr-TR');
const err = (status, message, code, extra = {}) => Object.assign(new HttpError(status, message), { extra: { code, ...extra } });

/** Whether `uid` is a streamer who may have an album: in an approved agency, with an approved contract, now. */
export async function mayHaveAlbum(uid, q = db) {
  const r = await q.query(
    `SELECT 1 FROM agency_streamers s JOIN agencies a ON a.id = s.agency_id
      WHERE s.streamer_id = $1 AND s.ended_at IS NULL AND s.contract = 'approved' AND a.status = 'approved' LIMIT 1`,
    [uid],
  );
  return r.rowCount > 0;
}

/** A photo file's kind by its first bytes (JPEG, PNG, WebP, HEIC), or null for anything else. */
export function photoKind(b) {
  if (!Buffer.isBuffer(b) || b.length < 16) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) return 'png';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (b.toString('latin1', 4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(b.toString('latin1', 8, 12))) return 'heic';
  return null;
}

const shownPhotos = async (uid, q = db) =>
  (await q.query('SELECT id, url, created_at FROM private_album_photos WHERE user_id = $1 AND removed_at IS NULL ORDER BY id DESC', [uid])).rows.map((x) => ({ id: Number(x.id), url: x.url, at: x.created_at }));

/** Neither of the two blocked the other (a block hides the album both ways, as the profile). */
async function notBlocked(me, other, q = db) {
  const r = await q.query('SELECT 1 FROM blocks WHERE (blocker = $1 AND blocked = $2) OR (blocker = $2 AND blocked = $1) LIMIT 1', [me, other]);
  return r.rowCount === 0;
}

/** `owner`'s album as `me` sees it: its photos only to its owner and to whoever opened it. */
async function albumFor(me, owner) {
  const price = live().privateAlbumPrice;
  const mine = me === owner;
  const [can, photos, opened] = await Promise.all([
    mayHaveAlbum(owner),
    shownPhotos(owner),
    mine ? Promise.resolve(false) : db.query('SELECT 1 FROM private_album_unlocks WHERE viewer = $1 AND owner = $2', [me, owner]).then((r) => r.rowCount > 0),
  ]);
  const sees = mine || opened;
  return {
    on: price > 0,
    price,
    // Someone else's album that can't be opened now (closed, or they aren't a streamer any more) counts nothing,
    // unless I opened it before.
    count: sees || (can && price > 0) ? photos.length : 0,
    max: PRIVATE_ALBUM_MAX,
    mine,
    // Mine: whether I may add photos now.
    ...(mine && { can: can && price > 0 }),
    unlocked: opened,
    photos: sees ? photos : [],
  };
}

async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}

export const privateAlbumRoutes = {
  async 'GET /api/user/private-album'(req, url) {
    const me = await auth(req);
    const id = userId(url.searchParams.get('id'));
    const u = (await db.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [id])).rows[0];
    if (!u || (id !== me.id && !(await notBlocked(me.id, id)))) throw new HttpError(404, 'Kullanıcı bulunamadı');
    return albumFor(me.id, id);
  },

  /** Adds a photo I uploaded (kind 'private', under my folder), read and checked here; at most PRIVATE_ALBUM_MAX. */
  async 'POST /api/me/private-album'(req) {
    const me = await auth(req);
    limit(`private-album:${me.id}`, 30, 'Çok hızlı ekliyorsun, biraz bekle');
    const b = await readJson(req, 2048);
    if (!storageOn()) throw new HttpError(503, 'Fotoğraf yükleme şu an açık değil');
    if (!(live().privateAlbumPrice > 0)) throw new HttpError(403, 'Özel albüm şu an kapalı');
    if (!(await mayHaveAlbum(me.id))) throw new HttpError(403, 'Özel albüm ajanstaki onaylı yayıncılar içindir');
    const base = (env.S3_PUBLIC_URL ?? '').replace(/\/$/, '');
    const mine = `${base}/private/${me.id}/`;
    if (typeof b.url !== 'string' || b.url.length > 500 || !b.url.startsWith(mine) || !/^[A-Za-z0-9._-]+$/.test(b.url.slice(mine.length))) throw new HttpError(400, 'Geçersiz fotoğraf');
    await verifyUpload(b.url, 'private');
    if (!photoKind(await readStored(keyOf(b.url, me.id), PHOTO_BYTES))) {
      removeFiles([b.url], me.id);
      throw new HttpError(400, 'Bu dosya bir fotoğraf değil; başka bir fotoğraf seç');
    }
    await tx(async (c) => {
      // One add at a time per person, so two at once can't pass the limit together.
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [me.id]);
      const n = Number((await c.query('SELECT count(*) AS n FROM private_album_photos WHERE user_id = $1 AND removed_at IS NULL', [me.id])).rows[0].n);
      if (n >= PRIVATE_ALBUM_MAX) throw new HttpError(409, `Özel albümde en fazla ${PRIVATE_ALBUM_MAX} fotoğraf olur; önce birini kaldır`);
      await c.query('INSERT INTO private_album_photos (user_id, url) VALUES ($1, $2) ON CONFLICT (user_id, url) DO NOTHING', [me.id, b.url]);
    });
    return albumFor(me.id, me.id);
  },

  /** Takes a photo out of my album; its file leaves the storage (one staff took down stays theirs to keep). */
  async 'POST /api/me/private-album/remove'(req) {
    const me = await auth(req);
    const b = await readJson(req, 1024);
    const id = int(b.id, 1, Number.MAX_SAFE_INTEGER);
    if (!id) throw new HttpError(400, 'Geçersiz fotoğraf');
    const r = await db.query('DELETE FROM private_album_photos WHERE id = $1 AND user_id = $2 AND removed_at IS NULL RETURNING url', [id, me.id]);
    if (r.rowCount) removeFiles([r.rows[0].url], me.id);
    return albumFor(me.id, me.id);
  },

  /**
   * Opens someone's album with coins: mine become their diamonds as a gift's do, once. The price the phone showed
   * must be the price now (else 409 price_changed and nothing moves); the checks that can change run after the ref,
   * so a retry of an unlock that went through gets its replay.
   */
  async 'POST /api/user/private-album/unlock'(req) {
    const me = await auth(req);
    const b = await readJson(req, 2048);
    const owner = userId(b.user);
    if (owner === me.id) throw new HttpError(400, 'Kendi özel albümün sana zaten açık');
    limit(`private-album-unlock:${me.id}`, 30, 'Çok hızlı denedin, biraz bekle');
    let took = 0;
    const paid = await once(me.id, 'coin', b.ref, async (c) => {
      // Both accounts in id order, as every two-person money route locks them.
      await c.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[me.id, owner]]);
      await claimRef(c, me.id, 'coin', b.ref);
      const o = (await c.query('SELECT id, name FROM users WHERE id = $1 AND deleted_at IS NULL', [owner])).rows[0];
      if (!o || !(await notBlocked(me.id, owner, c))) throw new HttpError(404, 'Kullanıcı bulunamadı');
      const price = live().privateAlbumPrice;
      if (!(price > 0)) throw err(403, 'Özel albüm şu an kapalı', 'closed');
      if (!(await mayHaveAlbum(owner, c))) throw err(409, 'Bu kişinin özel albümü şu an açılamıyor', 'unavailable');
      if ((await c.query('SELECT 1 FROM private_album_unlocks WHERE viewer = $1 AND owner = $2', [me.id, owner])).rowCount) throw err(409, 'Bu özel albümü zaten açtın', 'already');
      const count = Number((await c.query('SELECT count(*) AS n FROM private_album_photos WHERE user_id = $1 AND removed_at IS NULL', [owner])).rows[0].n);
      if (!count) throw err(409, 'Bu özel albümde henüz fotoğraf yok', 'empty');
      const shown = Number(b.price);
      if (!Number.isSafeInteger(shown) || shown !== price) throw err(409, `Fiyat değişti: şimdi ${fmt(price)} jeton`, 'price_changed', { price });
      const parts = await spendCoins(c, me.id, price, `Özel albüm: ${o.name}`, b.ref, owner, { detail: { privateAlbum: owner } });
      await giftDiamonds(c, { sender: me.id, recipient: owner, parts, total: price, ref: b.ref, reason: `Özel albüm açıldı: ${me.name}` });
      await c.query('INSERT INTO private_album_unlocks (viewer, owner, coins, ref) VALUES ($1, $2, $3, $4)', [me.id, owner, price, b.ref]);
      // The agency's commission as for a gift (never fails the unlock: agency-lib.mjs runs it in a savepoint).
      await recordIncome(c, owner, 'gift', `album:${me.id}:${b.ref}`, price);
      took = price;
    });
    // once() keys on (me, coin, ref), shared with gifts and the shop: only this unlock is its replay.
    if (paid.replay) {
      const was = await db.query('SELECT 1 FROM private_album_unlocks WHERE viewer = $1 AND owner = $2 AND ref = $3', [me.id, owner, b.ref]);
      if (!was.rowCount) throw new HttpError(409, 'Geçersiz istek kimliği');
    }
    return { album: await albumFor(me.id, owner), user: paid.user, replay: paid.replay, coins: took };
  },

  async 'GET /api/admin/private-album'(req, url) {
    await admin(req);
    const uid = userId(url.searchParams.get('user'), 'kişi');
    const u = (await db.query('SELECT id, name FROM users WHERE id = $1', [uid])).rows[0];
    if (!u) throw new HttpError(404, 'Kullanıcı bulunamadı');
    const [photos, unlocks, can] = await Promise.all([
      db.query(
        `SELECT p.id, p.url, p.created_at, p.removed_at, p.removed_reason, r.name AS removed_name
           FROM private_album_photos p LEFT JOIN users r ON r.id = p.removed_by WHERE p.user_id = $1 ORDER BY (p.removed_at IS NULL) DESC, p.id DESC`,
        [uid],
      ),
      db.query('SELECT count(*)::int AS n, coalesce(sum(coins), 0)::bigint AS coins FROM private_album_unlocks WHERE owner = $1', [uid]),
      mayHaveAlbum(uid),
    ]);
    return {
      user: { id: u.id, name: u.name },
      can,
      price: live().privateAlbumPrice,
      photos: photos.rows.map((p) => ({ id: Number(p.id), url: p.url, at: p.created_at, removed: p.removed_at ? { at: p.removed_at, reason: p.removed_reason, by: p.removed_name ?? null } : null })),
      unlocks: unlocks.rows[0].n,
      coins: Number(unlocks.rows[0].coins),
    };
  },

  /**
   * Takes a photo down (an offensive one, a complaint): it stops showing to everyone, the row and its file stay as
   * the record of what was shown. An audit_events row with the photo (before) and its state now (after).
   */
  async 'POST /api/admin/private-album/remove'(req) {
    const a = await admin(req);
    const b = await readJson(req, 2048);
    const uid = userId(b.user, 'kişi');
    const id = int(b.id, 1, Number.MAX_SAFE_INTEGER);
    if (!id) throw new HttpError(400, 'Geçersiz fotoğraf');
    const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, 200) || null : null;
    const removed = await tx(async (c) => {
      const p = (await c.query('SELECT id, url, created_at, removed_at FROM private_album_photos WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, uid])).rows[0];
      if (!p) throw new HttpError(404, 'Fotoğraf bulunamadı');
      if (p.removed_at) return false;
      await c.query('UPDATE private_album_photos SET removed_at = now(), removed_by = $2, removed_reason = $3 WHERE id = $1', [id, a.id, reason]);
      await c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, $3, $4, $5)', [
        a.id,
        'private_album.remove',
        uid,
        JSON.stringify({ user: uid, photo: id, reason, before: { url: p.url, at: p.created_at, shown: true }, after: { shown: false }, ...panelDetail(a) }),
        clientIp(req),
      ]);
      return true;
    });
    return { removed };
  },
};
