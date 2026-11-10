// Oda oyunları at a table in a room (Ludo, Renk Kartları, XOX; rules: room-games-rules.mjs): free games the people in
// a room play together. The server keeps the one table a room has, rolls every die and deals every card, checks
// each move (seat, turn) and tells the room after every change (LiveKit packet 'table': "read the table again",
// app lib/live/room-bus), so every phone shows the same table. A player's cards go only to that player.
//
//   GET  /api/rooms/table?room=                        → { table }   (null: no table in the room)
//   POST /api/rooms/table { room, action, game?, move? } → { table }
//     action: open { game } (room staff), join, start (whoever opened it, or staff; the first seat once the opener
//             left), move { move }, leave, again (a seated player, after a hand), close (as start)
//
// A turn has TURN_MS; when it runs out the table plays for that seat (Ludo rolls, Renk Kartları plays its first
// card that fits or draws) and after MISSES such turns in a row the seat leaves. In XOX the one whose time ran out
// loses. This is applied whenever someone reads or acts on the table, so no clock runs here.
// People who block each other (either way) don't sit at one table. Someone banned from the room can't play in it.
// Kept: the table while it is played; one nobody touched for a day goes when a new table opens, and a deleted
// account's tables go with it (social.mjs eraseAccount). Nothing here is money.
import crypto from 'node:crypto';

import { HttpError, auth, db, limit, readJson, tx } from './core.mjs';
import { liveKitName, rankOf, roomRow } from './rooms.mjs';
import { roomService } from './live.mjs';
import { MISSES, TABLE_GAMES, TURN_MS, autoMove, leaveTable, moveTable, openTable, startTable, viewOf } from './room-games-rules.mjs';

const rnd = (n) => crypto.randomInt(0, n);

/** Best effort, like the room's other packets: never slows or fails the request. */
function announce(roomId, version) {
  const room = liveKitName(roomId);
  const data = Buffer.from(JSON.stringify({ type: 'table', version })).toString('base64');
  roomService('SendData', { room, data, kind: 'RELIABLE' }, { roomAdmin: true, room }).catch((e) => console.error('livekit SendData table', room, String(e).slice(0, 200)));
}

async function openRoom(id, uid) {
  const room = await roomRow(id);
  if (room.closed_at) throw new HttpError(404, 'Oda kapalı');
  const ban = await db.query('SELECT 1 FROM room_bans WHERE room_id = $1 AND user_id = $2 AND (until IS NULL OR until > now())', [room.id, uid]);
  if (ban.rowCount) throw new HttpError(403, 'Bu odaya giriş yasağın var');
  return room;
}

const namesOf = async (c, seats) => {
  const r = await c.query('SELECT id, name, avatar_url FROM users WHERE id = ANY($1::uuid[])', [seats]);
  const by = new Map(r.rows.map((x) => [x.id, x]));
  return seats.map((id) => ({ id, name: by.get(id)?.name ?? 'Üye', avatarUrl: by.get(id)?.avatar_url ?? null }));
};

/** The table as `uid` sees it. */
async function view(c, row, uid) {
  if (!row) return null;
  const seats = await namesOf(c, row.state.seats);
  const mySeat = row.state.seats.indexOf(uid);
  const { seats: _ids, misses: _m, ...state } = viewOf(row.state, mySeat);
  return {
    room: row.room_id,
    game: row.game,
    name: TABLE_GAMES[row.game].name,
    min: TABLE_GAMES[row.game].min,
    max: TABLE_GAMES[row.game].max,
    ...state,
    seats,
    mySeat,
    openedBy: row.opened_by,
    openedAt: row.created_at,
    turnEndsAt: row.state.status === 'playing' ? new Date(new Date(row.turn_at).getTime() + TURN_MS).toISOString() : null,
    version: row.version,
  };
}

/** Plays for every seat whose time ran out (inside a transaction, the row locked). Returns the row, changed or not. */
async function settle(c, row) {
  let t = row.state;
  let at = new Date(row.turn_at).getTime();
  let changed = false;
  for (let i = 0; i < 40 && t.status === 'playing' && at + TURN_MS <= Date.now(); i++) {
    const names = (await namesOf(c, t.seats)).map((x) => x.name);
    const seat = t.turn;
    if (t.game === 'xox') t = { ...t, status: 'over', winner: 1 - seat, log: `${names[seat]} için süre doldu · 🏆 ${names[1 - seat]} kazandı!` };
    else if (t.misses[seat] + 1 >= MISSES) t = leaveTable(t, seat, names);
    else {
      const r = moveTable(t, seat, autoMove(t), names, rnd);
      t = { ...r.table, misses: r.table.misses.map((m, k) => (k === seat ? t.misses[seat] + 1 : m)) };
    }
    at += TURN_MS;
    changed = true;
  }
  // The turn now on started when the last one ran out.
  return changed ? save(c, row, t, at) : row;
}

async function save(c, row, state, turnAt = Date.now()) {
  const r = await c.query(
    'UPDATE room_tables SET state = $2, seats = $3, version = version + 1, turn_at = to_timestamp($4 / 1000.0), updated_at = now() WHERE room_id = $1 RETURNING *',
    [row.room_id, JSON.stringify(state), state.seats, turnAt],
  );
  return r.rows[0];
}

/** True when `uid` and anyone at the table block each other (either way). */
async function blockedWith(c, uid, seats) {
  if (!seats.length) return false;
  const r = await c.query('SELECT 1 FROM blocks WHERE (blocker = $1 AND blocked = ANY($2::uuid[])) OR (blocked = $1 AND blocker = ANY($2::uuid[])) LIMIT 1', [uid, seats]);
  return r.rowCount > 0;
}

export const roomGameRoutes = {
  async 'GET /api/rooms/table'(req, url) {
    const me = await auth(req);
    const room = await openRoom(url.searchParams.get('room'), me.id);
    let row = (await db.query('SELECT * FROM room_tables WHERE room_id = $1', [room.id])).rows[0];
    if (row?.state.status === 'playing' && new Date(row.turn_at).getTime() + TURN_MS <= Date.now()) {
      const before = row.version;
      row = await tx(async (c) => settle(c, (await c.query('SELECT * FROM room_tables WHERE room_id = $1 FOR UPDATE', [room.id])).rows[0]));
      if (row && row.version !== before) announce(room.id, row.version);
    }
    return { table: await view(db, row, me.id) };
  },

  async 'POST /api/rooms/table'(req) {
    const me = await auth(req);
    limit(`table:${me.id}`, 60, 'Çok hızlı oynuyorsun, biraz bekle');
    const b = await readJson(req);
    const room = await openRoom(b.room, me.id);
    const action = b.action;
    if (!['open', 'join', 'start', 'move', 'leave', 'again', 'close'].includes(action)) throw new HttpError(400, 'Geçersiz işlem');
    const staff = (await rankOf(room, me.id)) > 0;
    if (action === 'open') {
      if (!Object.hasOwn(TABLE_GAMES, b.game ?? '')) throw new HttpError(400, 'Geçersiz oyun');
      if (!staff) throw new HttpError(403, 'Masayı oda sahibi veya yöneticiler açar');
    }
    const out = await tx(async (c) => {
      let row = (await c.query('SELECT * FROM room_tables WHERE room_id = $1 FOR UPDATE', [room.id])).rows[0];
      if (row) row = await settle(c, row);
      if (action === 'open') {
        if (row && row.state.status !== 'over' && row.state.seats.length) throw new HttpError(409, `Odada açık bir ${TABLE_GAMES[row.game].name} masası var`);
        // Tables nobody touched for a day go (every room's, a few at a time).
        await c.query("DELETE FROM room_tables WHERE room_id IN (SELECT room_id FROM room_tables WHERE updated_at < now() - interval '1 day' LIMIT 100)");
        const state = openTable(b.game, me.id);
        const r = await c.query(
          `INSERT INTO room_tables (room_id, game, opened_by, seats, state) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (room_id) DO UPDATE SET game = $2, opened_by = $3, seats = $4, state = $5, version = room_tables.version + 1, turn_at = now(), created_at = now(), updated_at = now()
           RETURNING *`,
          [room.id, b.game, me.id, state.seats, JSON.stringify(state)],
        );
        return r.rows[0];
      }
      if (!row) throw new HttpError(404, 'Odada açık masa yok');
      const t = row.state;
      const seat = t.seats.indexOf(me.id);
      const rules = TABLE_GAMES[row.game];
      const names = async () => (await namesOf(c, t.seats)).map((x) => x.name);
      // Whoever opened it, the room staff, or the first seat once the opener has left the table.
      const opener = row.opened_by === me.id || staff || (seat === 0 && !t.seats.includes(row.opened_by));
      if (action === 'close') {
        if (!opener) throw new HttpError(403, 'Masayı açan veya oda yönetimi kapatır');
        await c.query('DELETE FROM room_tables WHERE room_id = $1', [room.id]);
        return null;
      }
      if (action === 'join') {
        if (seat >= 0) return row;
        if (t.status === 'playing') throw new HttpError(409, 'Oyun başladı; el bitince katılabilirsin');
        if (t.seats.length >= rules.max) throw new HttpError(409, 'Masa dolu');
        if (await blockedWith(c, me.id, t.seats)) throw new HttpError(403, 'Bu masaya oturamazsın');
        let next = { ...t, seats: [...t.seats, me.id], misses: [...t.misses, 0] };
        // XOX starts as soon as its second player sits.
        if (row.game === 'xox' && next.seats.length === rules.max) next = startTable(next, rnd);
        return save(c, row, next);
      }
      if (action === 'start' || action === 'again') {
        if (action === 'start' ? !opener || t.status !== 'waiting' : seat < 0 || t.status !== 'over') throw new HttpError(409, 'Masa şu an başlatılamaz');
        if (t.seats.length < rules.min) throw new HttpError(409, `${rules.name} için en az ${rules.min} oyuncu gerekli`);
        return save(c, row, startTable(t, rnd));
      }
      if (seat < 0) throw new HttpError(403, 'Bu masada oturmuyorsun');
      if (action === 'leave') {
        const next = leaveTable(t, seat, await names());
        if (!next.seats.length) {
          await c.query('DELETE FROM room_tables WHERE room_id = $1', [room.id]);
          return null;
        }
        return save(c, row, next);
      }
      const r = moveTable(t, seat, b.move, await names(), rnd);
      if (!r.ok) throw new HttpError(409, r.reason);
      return save(c, row, r.table);
    });
    announce(room.id, out?.version ?? 0);
    return { table: await view(db, out, me.id) };
  },
};
