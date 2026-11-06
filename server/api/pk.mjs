// Oda içi PK on the server, so everyone in the room sees the same PK, score and result.
//
//   GET  /api/rooms/pk?room=                                                   → { pk, now }
//   POST /api/rooms/pk        { room, mode: solo|team, durationMin, participants? | red?, blue?, ref } → { pk, now }
//   POST /api/rooms/pk/cancel { room }                                         → { pk, now }
//
// Only the room's owner or a room admin starts or cancels one. Normal PK (solo): the people listed (2–20) compete
// alone. Takım PK (team): Red against Blue, 1–8 each. Everyone listed must be on a mic now (their LiveKit `seat`
// attribute; not checked when no voice server is set). Who competes is fixed at the start. A gift paid in the room
// while it runs scores its coins for the recipient (and their team) once, in the gift's own transaction
// (scorePkGift); gifts to someone who isn't competing, before the countdown ends or after the end don't score.
// The PK's coins and diamonds are the gift's own: PK points never move money. A start or cancel is announced to
// the room's voice connection ({ type: 'pk' }), and gifts are already announced, so the phones reload the PK.
// `pk` is the room's running PK, or its last one for RESULT_MS after it ended (the result screen), else null.
// Cross-room PK has no server side yet.
import { HttpError, REF, UUID, auth, db, env, int, limit, readJson } from './core.mjs';
import { roomService, voiceParticipants } from './live.mjs';

/** The countdown before gifts score (PK_PREP_MS only for tests). */
const PREP_MS = Number(env.PK_PREP_MS ?? 5_000);
const RESULT_MS = 10 * 60_000;
const DURATIONS = [15, 30, 60, 120];
const SOLO_MAX = 20;
const TEAM_MAX = 8;

/** A room id from input: the server room's id or its LiveKit name (oda-<id>). */
const roomIdOf = (v) => {
  const s = typeof v === 'string' ? v.replace(/^oda-/, '') : '';
  if (!UUID.test(s)) throw new HttpError(400, 'Geçersiz oda');
  return s;
};
const ids = (v, min, max, what) => {
  const list = Array.isArray(v) ? [...new Set(v)] : [];
  if (list.length !== (Array.isArray(v) ? v.length : -1) || list.some((x) => typeof x !== 'string' || !UUID.test(x))) throw new HttpError(400, `Geçersiz ${what}`);
  if (list.length < min || list.length > max) throw new HttpError(400, `${what} ${min}–${max} kişi olmalı`);
  return list;
};

async function staffRoom(me, roomId) {
  const r = await db.query('SELECT id, owner, closed_at FROM rooms WHERE id = $1', [roomId]);
  if (!r.rowCount) throw new HttpError(404, 'Oda bulunamadı');
  if (r.rows[0].closed_at) throw new HttpError(410, 'Oda kapandı');
  const staff = r.rows[0].owner === me.id || (await db.query('SELECT 1 FROM room_admins WHERE room_id = $1 AND user_id = $2', [roomId, me.id])).rowCount > 0;
  if (!staff) throw new HttpError(403, 'PK’yı oda sahibi veya yöneticiler başlatabilir');
  return r.rows[0];
}

/** A PK whose time is up is closed (once; later reads find it done). */
const closeEnded = (roomId) => db.query("UPDATE room_pks SET status = 'done' WHERE room_id = $1 AND status = 'active' AND end_at <= now()", [roomId]);

/** Best effort, like a gift's announcement: never slows or fails the PK. */
function announce(roomId, pkId) {
  const room = `oda-${roomId}`;
  const data = Buffer.from(JSON.stringify({ type: 'pk', pk: String(pkId) })).toString('base64');
  roomService('SendData', { room, data, kind: 'RELIABLE' }, { roomAdmin: true, room }).catch((e) => console.error('livekit SendData pk', room, String(e).slice(0, 200)));
}

/** What the phones draw: the PK, its points per sender → recipient, and everyone named in it. */
async function view(row) {
  if (!row) return null;
  const pairs = await db.query(
    `SELECT sender, recipient, team, sum(points)::bigint AS points, count(*)::int AS gifts FROM room_pk_gifts
      WHERE pk_id = $1 GROUP BY sender, recipient, team ORDER BY points DESC, sender, recipient LIMIT 2000`,
    [row.id],
  );
  const named = [...new Set([...row.participants, ...pairs.rows.flatMap((p) => [p.sender, p.recipient])])];
  const people = await db.query('SELECT id, name, avatar_url FROM users WHERE id = ANY($1::uuid[])', [named]);
  return {
    id: String(row.id),
    room: row.room_id,
    mode: row.mode,
    status: row.status,
    startedBy: row.started_by,
    durationMin: row.duration_min,
    participants: row.participants,
    red: row.red,
    blue: row.blue,
    startAt: row.start_at.toISOString(),
    endAt: row.end_at.toISOString(),
    cancelled: row.status === 'cancelled',
    pairs: pairs.rows.map((p) => ({ from: p.sender, to: p.recipient, team: p.team, points: Number(p.points), gifts: p.gifts })),
    people: people.rows.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatar_url ?? null })),
  };
}
const answer = async (row) => ({ pk: await view(row), now: new Date().toISOString() });

/** Everyone listed must be on a mic in the room's voice connection now. */
async function onMics(roomId, list) {
  let here;
  try {
    here = await voiceParticipants(`oda-${roomId}`);
  } catch (e) {
    console.error('livekit ListParticipants', roomId, String(e).slice(0, 200));
    throw new HttpError(502, 'Ses sunucusuna şu an ulaşılamadı, biraz sonra tekrar dene');
  }
  if (here === null) return; // no voice server (development and tests)
  const seated = new Set(here.filter((p) => p.seat !== null).map((p) => p.identity));
  const gone = list.filter((u) => !seated.has(u));
  if (!gone.length) return;
  const names = (await db.query('SELECT name FROM users WHERE id = ANY($1::uuid[]) ORDER BY name', [gone])).rows.map((u) => u.name);
  throw new HttpError(409, `${names.join(', ') || 'Seçilen kişiler'} artık mikrofonda değil. Yeniden dene.`);
}

/**
 * Called by POST /api/gifts/send inside its transaction, after the coins moved. Never fails the gift: it runs in
 * a savepoint and a problem only costs the PK points. One row per gift (gift_events id), so a replay can't add more.
 */
export async function scorePkGift(c, { room, eventId, sender, recipient, coins }) {
  const roomId = typeof room === 'string' ? room.replace(/^oda-/, '') : '';
  if (!UUID.test(roomId)) return;
  await c.query('SAVEPOINT pk_score');
  try {
    const r = await c.query("SELECT id, mode, participants, red FROM room_pks WHERE room_id = $1 AND status = 'active' AND start_at <= now() AND end_at > now()", [roomId]);
    const pk = r.rows[0];
    if (pk && pk.participants.includes(recipient)) {
      const team = pk.mode === 'team' ? (pk.red.includes(recipient) ? 'red' : 'blue') : null;
      await c.query('INSERT INTO room_pk_gifts (pk_id, gift_event, sender, recipient, team, points) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING', [pk.id, eventId, sender, recipient, team, coins]);
    }
    await c.query('RELEASE SAVEPOINT pk_score');
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT pk_score');
    console.error('pk score', roomId, String(e).slice(0, 200));
  }
}

export const pkRoutes = {
  async 'GET /api/rooms/pk'(req, url) {
    await auth(req);
    const roomId = roomIdOf(url.searchParams.get('room'));
    await closeEnded(roomId);
    const row = (await db.query('SELECT * FROM room_pks WHERE room_id = $1 ORDER BY id DESC LIMIT 1', [roomId])).rows[0];
    const fresh = row && (row.status === 'active' || Date.now() - (row.cancelled_at ?? row.end_at).getTime() < RESULT_MS);
    return answer(fresh ? row : null);
  },

  async 'POST /api/rooms/pk'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const roomId = roomIdOf(b.room);
    await staffRoom(me, roomId);
    if (typeof b.ref !== 'string' || !REF.test(b.ref)) throw new HttpError(400, 'Geçersiz istek kimliği');
    // A retry of a start that went through gets that PK back.
    const again = (await db.query('SELECT * FROM room_pks WHERE started_by = $1 AND ref = $2', [me.id, b.ref])).rows[0];
    if (again) {
      if (again.room_id !== roomId) throw new HttpError(409, 'Geçersiz istek kimliği');
      return answer(again);
    }
    const mode = b.mode === 'solo' || b.mode === 'team' ? b.mode : null;
    if (!mode) throw new HttpError(400, 'Geçersiz PK türü');
    const duration = int(b.durationMin, 15, 120);
    if (!DURATIONS.includes(duration)) throw new HttpError(400, 'Bu süre seçilemez. İzinli süreler: 15, 30, 60, 120 dakika.');
    let participants;
    let red = [];
    let blue = [];
    if (mode === 'solo') participants = ids(b.participants, 2, SOLO_MAX, 'Normal PK');
    else {
      red = ids(b.red, 1, TEAM_MAX, 'Kırmızı Takım');
      blue = ids(b.blue, 1, TEAM_MAX, 'Mavi Takım');
      if (red.some((u) => blue.includes(u))) throw new HttpError(400, 'Bir kişi iki takımda birden olamaz');
      participants = [...red, ...blue];
    }
    limit(`pkstart:${me.id}`, 10, 'Çok sık PK başlattın, biraz bekle');
    const known = await db.query('SELECT count(*)::int AS n FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL', [participants]);
    if (known.rows[0].n !== participants.length) throw new HttpError(404, 'Kullanıcı bulunamadı');
    await onMics(roomId, participants);
    await closeEnded(roomId);
    let row;
    try {
      row = (
        await db.query(
          `INSERT INTO room_pks (room_id, mode, started_by, ref, duration_min, participants, red, blue, start_at, end_at)
           VALUES ($1, $2, $3, $4, $5::int, $6, $7, $8, now() + $9::int * interval '1 millisecond', now() + $9::int * interval '1 millisecond' + $5::int * interval '1 minute')
           RETURNING *`,
          [roomId, mode, me.id, b.ref, duration, participants, red, blue, PREP_MS],
        )
      ).rows[0];
    } catch (e) {
      if (e.code !== '23505') throw e;
      const same = (await db.query('SELECT * FROM room_pks WHERE started_by = $1 AND ref = $2', [me.id, b.ref])).rows[0];
      if (same) return answer(same);
      throw new HttpError(409, 'Bu odada zaten devam eden bir PK var');
    }
    announce(roomId, row.id);
    return answer(row);
  },

  async 'POST /api/rooms/pk/cancel'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const roomId = roomIdOf(b.room);
    await staffRoom(me, roomId);
    const r = await db.query("UPDATE room_pks SET status = 'cancelled', cancelled_by = $2, cancelled_at = now() WHERE room_id = $1 AND status = 'active' AND end_at > now() RETURNING *", [roomId, me.id]);
    if (!r.rowCount) throw new HttpError(404, 'Odada devam eden PK yok');
    announce(roomId, r.rows[0].id);
    return answer(r.rows[0]);
  },
};
