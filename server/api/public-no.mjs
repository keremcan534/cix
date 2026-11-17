// Everyone's own number (users.public_no, 082; docs/KIMLIK_NUMARASI.md): the 12-digit ID a profile shows, given by the
// server and never changed, and a room's ID, which is its owner's. Anyone can be found by it, so nobody needs the
// account's uuid ("Sunucu hesabı"): the app's search, an agency invite by ID, the PK room search and staff searches
// (admin.mjs, the panel). What older apps show is found too: a special ID someone has (the shop's "ID 777") and an
// open room's old 8-digit ID (rooms.mjs roomCode, a hash of that room's own id, new every time it opens).
//
//   GET /api/lookup?no=<digits> → { user: { id, name, avatarUrl, publicNo }, room: { id, title, code } | null }
//        404 when nobody has it or they blocked me; 30 a minute.
//   GET /api/admin/lookup?no=<digits> → { user: { id, name, username, publicNo, role }, room } (admins, the panel:
//        every field there that takes an account takes the person's number instead, panel.mjs PANEL_ROUTES)
import { HttpError, auth, db, limit, publicNoOf } from './core.mjs';
import { roomCode } from './rooms.mjs';

/** A number as a person types or pastes it: digits, spaces and dashes ("1005 7925 9012", "ID 777"). */
const digitsOf = (v) => (typeof v === 'string' ? v.replace(/^\s*ID\s*/i, '').replace(/[\s-]/g, '') : '');

/**
 * The account (not deleted) a number names: its own 12-digit number, a special ID someone has now (one owner each,
 * economy.mjs), or an open room's old 8-digit ID (its owner). null when it names nobody. Staff searches reach further:
 * `anyRoom`, a room closed since (the latest with that ID: a report from an older app names it); `deleted`, a deleted
 * account (its sanctions and devices stay).
 */
export async function whoIs(no, q = db, { anyRoom = false, deleted = false } = {}) {
  const s = digitsOf(no);
  if (!/^\d{1,12}$/.test(s)) return null;
  const alive = deleted ? '' : ' AND deleted_at IS NULL';
  if (s.length === 12) return (await q.query(`SELECT * FROM users WHERE public_no = $1${alive}`, [s])).rows[0] ?? null;
  const special = await q.query(
    `SELECT u.* FROM entitlements e JOIN users u ON u.id = e.user_id
      WHERE e.kind = 'specialId' AND e.sku = $1 AND e.revoked_at IS NULL AND e.starts_at <= now() AND (e.ends_at IS NULL OR e.ends_at > now())
        AND u.deleted_at IS NULL
      LIMIT 1`,
    [`id-${s.replace(/^0+(?=\d)/, '')}`],
  );
  if (special.rowCount) return special.rows[0];
  if (s.length !== 8) return null;
  // The old ID is a hash of the room's own id (rooms.mjs roomCode), so it is matched here, not in SQL.
  const rooms = await q.query(`SELECT id, owner FROM rooms${anyRoom ? '' : ' WHERE closed_at IS NULL'} ORDER BY created_at DESC`);
  const room = rooms.rows.find((r) => roomCode(r.id) === s);
  return room ? ((await q.query(`SELECT * FROM users WHERE id = $1${alive}`, [room.owner])).rows[0] ?? null) : null;
}

/** The open room of an account, if it has one (one at most: rooms_one_open_per_owner). */
export const openRoomOf = async (uid, q = db) => (await q.query('SELECT id, title FROM rooms WHERE owner = $1 AND closed_at IS NULL', [uid])).rows[0] ?? null;

export const lookupRoutes = {
  /** A person, and their room if it is open, by the number they gave me (or an older app's room or special ID). */
  async 'GET /api/lookup'(req, url) {
    const me = await auth(req);
    limit(`lookup:${me.id}`, 30, 'Çok fazla arama, biraz bekle');
    const u = await whoIs(url.searchParams.get('no'));
    // Someone who blocked me isn't found, as their profile shows me nothing; one I blocked is (to unblock them).
    const blocked = u && u.id !== me.id ? (await db.query('SELECT 1 FROM blocks WHERE blocker = $1 AND blocked = $2', [u.id, me.id])).rowCount > 0 : false;
    if (!u || blocked) throw new HttpError(404, 'Bu numarada kimse yok: numarayı kontrol et');
    const room = await openRoomOf(u.id);
    return {
      user: { id: u.id, name: u.name, avatarUrl: u.avatar_url ?? null, publicNo: publicNoOf(u) },
      room: room ? { id: room.id, title: room.title, code: publicNoOf(u) } : null,
    };
  },

  /** Staff: the account a number names (no block between staff and people), for the panel's account fields. */
  async 'GET /api/admin/lookup'(req, url) {
    const me = await auth(req);
    if (me.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
    const u = await whoIs(url.searchParams.get('no'));
    if (!u) throw new HttpError(404, 'Bu numarada hesap yok: kişinin profilindeki ID’yi yazın');
    const room = await openRoomOf(u.id);
    return {
      user: { id: u.id, name: u.name, username: u.username ?? null, publicNo: publicNoOf(u), role: u.role },
      room: room ? { id: room.id, title: room.title, code: publicNoOf(u) } : null,
    };
  },
};
