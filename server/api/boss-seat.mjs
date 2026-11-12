// Patron koltuğu (Güncelleme 4, madde 13): one seat in a room whose owner turned it on (Oda ayarları, Lv.3). Money
// decides it on the server, in the gift's own transaction, so no phone can sit itself down.
//
// Otomatik (rules.bossMode 'auto'), boss-rules.mjs bossStep:
//   1. While the seat is empty, whoever sends at least M coins in one send in the room sits on it (M: Canlı ayarlar
//      boss_seat_coins, 25.000).
//   2. A sitting lasts N minutes (boss_seat_minutes, 10); every further gift of the holder in that time adds N more.
//   3. Once the holder has sat more than 5 seconds, someone else's single send larger than everything the holder
//      spent in this sitting takes the seat (a new sitting of N minutes starts).
// Davet (rules.bossMode 'invite'): gifts don't move the seat. The owner seats someone (no end); the holder may get
// up, the owner may take them off. Switching the mode or the seat off empties it.
// A send counts with the coins it cost: a plain gift (gifts.mjs) and a Şanslı send (lucky.mjs, all its recipients
// together). A gift from Çantam costs nothing and doesn't count. Someone banned from the room never sits, and a ban
// takes the holder off (rooms.mjs).
// Every phone learns the holder from the server: the room read (rooms.mjs out: room.boss as old apps read it, and
// room.bossSeat with the mode, the sitting and the numbers) after a 'room' packet; a 'boss' packet says what happened
// for the chat line (app lib/live/room-bus parseServerBoss). A sitting that ended is empty on every read; the sweep
// (BOSS_SWEEP_MS, default 15 s) clears it and tells the room.
//
//   POST /api/rooms/boss { room, action: 'seat', user } → { room }   the owner seats someone (Davet)
//   POST /api/rooms/boss { room, action: 'clear' }       → { room }   the owner takes the holder off (Davet)
//   POST /api/rooms/boss { room, action: 'leave' }       → { room }   the holder gets up
import { BOSS_HOLD_MS, bossStep } from './boss-rules.mjs';
import { HttpError, auth, blockedBetween, db, env, limit, readJson, userId } from './core.mjs';
import { live } from './live-settings.mjs';
import { announceRoom, roomPacket } from './live.mjs';
import { BOSS_SEAT_MIN_LEVEL, rulesOf } from './room-rules.mjs';
// rooms.mjs imports this file too; its functions are only used inside handlers, after both have loaded.
import { liveKitName, roomLevel, roomOut, roomRow, withVoiceCounts } from './rooms.mjs';

const ms = (t) => (t ? new Date(t).getTime() : null);
const EMPTY = 'boss_id = NULL, boss_since = NULL, boss_until = NULL, boss_spent = 0';

/**
 * What every phone reads about the seat with the room (rooms.mjs out): `boss` the holder while their sitting runs
 * (old apps read only this), `bossSeat` the mode, the sitting (left: seconds to its end, null without one) and the
 * numbers the sheet shows; null while the seat is off.
 */
export function bossOf(r, now = Date.now()) {
  const rules = rulesOf(r.rules);
  const until = ms(r.boss_until);
  const sitting = !!r.boss_id && rules.bossSeat && (until === null ? rules.bossMode === 'invite' : until > now);
  const holder = sitting ? { id: r.boss_id, name: r.boss_name ?? 'Üye', avatarUrl: r.boss_avatar ?? null } : null;
  const s = live();
  return {
    boss: holder,
    bossSeat: rules.bossSeat
      ? {
          mode: rules.bossMode,
          holder,
          since: holder ? r.boss_since : null,
          until: holder ? r.boss_until : null,
          left: holder && until !== null ? Math.max(0, Math.ceil((until - now) / 1000)) : null,
          spent: holder ? Number(r.boss_spent ?? 0) : 0,
          minCoins: s.bossSeatCoins,
          minutes: s.bossSeatMinutes,
          holdSeconds: BOSS_HOLD_MS / 1000,
        }
      : null,
  };
}

/**
 * A paid send of `coins` by `sender` in server room `roomId`, inside the gift's transaction (after its coins moved):
 * the seat follows the Otomatik rule. Returns what happened, for announceBoss once the transaction is committed.
 */
export async function bossGift(c, { roomId, sender, coins }) {
  if (!roomId || !(coins > 0)) return [];
  const r = (
    await c.query(
      `SELECT r.rules, r.boss_id, r.boss_since, r.boss_until, r.boss_spent, u.room_xp, now() AS now
         FROM rooms r JOIN users u ON u.id = r.owner WHERE r.id = $1 AND r.closed_at IS NULL FOR UPDATE OF r`,
      [roomId],
    )
  ).rows[0];
  if (!r) return [];
  const rules = rulesOf(r.rules);
  if (!rules.bossSeat || rules.bossMode !== 'auto' || roomLevel(r.room_xp ?? 0) < BOSS_SEAT_MIN_LEVEL) return [];
  if ((await c.query('SELECT 1 FROM room_bans WHERE room_id = $1 AND user_id = $2 AND (until IS NULL OR until > now())', [roomId, sender])).rowCount) return [];
  const seat = r.boss_id ? { holder: r.boss_id, since: ms(r.boss_since) ?? 0, until: ms(r.boss_until), spent: Number(r.boss_spent) } : null;
  const s = live();
  const step = bossStep(seat, { sender, coins }, { coins: s.bossSeatCoins, minutes: s.bossSeatMinutes }, ms(r.now));
  const events = [];
  if (step.before) events.push({ event: 'expired', user: step.before });
  if (step.event) events.push({ event: step.event, user: sender });
  if (!events.length) return [];
  const n = step.seat;
  await c.query('UPDATE rooms SET boss_id = $2, boss_since = $3, boss_until = $4, boss_spent = $5 WHERE id = $1', [
    roomId,
    n?.holder ?? null,
    n ? new Date(n.since) : null,
    n?.until ? new Date(n.until) : null,
    n?.spent ?? 0,
  ]);
  return events;
}

/**
 * Tells the room what happened to the seat: a 'boss' packet for each chat line (sat, took, expired, left, removed;
 * mode: the owner changed the seat; none for 'extended' or null) and a 'room' packet so every phone reads the holder
 * again. Best effort.
 */
export async function announceBoss(roomId, events) {
  if (!events.length) return;
  const name = liveKitName(roomId);
  const ids = [...new Set(events.map((e) => e.user).filter(Boolean))];
  const names = new Map((await db.query('SELECT id, name FROM users WHERE id = ANY($1::uuid[])', [ids])).rows.map((x) => [x.id, x.name]));
  for (const e of events) {
    if (!e.event || e.event === 'extended') continue;
    await roomPacket(name, { type: 'boss', event: e.event, user: e.user ?? null, name: e.user ? (names.get(e.user) ?? 'Üye') : null, ...(e.mode && { mode: e.mode }) });
  }
  announceRoom(name);
}

/**
 * Empties the seat of room `roomId` (only when `only` holds it, if given); the room hears `event` about its holder
 * (null: no line, as when the owner changes the seat). Returns the holder taken off, or null when it was empty.
 */
export async function clearBoss(roomId, event, only = null) {
  const r = await db.query(
    `UPDATE rooms r SET ${EMPTY}
       FROM (SELECT id, boss_id, boss_until FROM rooms WHERE id = $1 FOR UPDATE) old
      WHERE r.id = old.id AND old.boss_id IS NOT NULL AND ($2::uuid IS NULL OR old.boss_id = $2)
      RETURNING old.boss_id, (old.boss_until IS NULL OR old.boss_until > now()) AS sitting`,
    [roomId, only],
  );
  if (!r.rowCount) return null;
  const x = r.rows[0];
  // A sitting that had already ended (the sweep hadn't come by) ends with its own line.
  await announceBoss(roomId, [{ event: x.sitting ? event : 'expired', user: x.boss_id }]);
  return x.boss_id;
}

/** The owner turned the seat on or off or changed its mode: the seat starts empty and the room hears the new mode. */
export async function bossRulesChanged(roomId, rules) {
  await db.query(`UPDATE rooms SET ${EMPTY} WHERE id = $1 AND boss_id IS NOT NULL`, [roomId]);
  await announceBoss(roomId, [{ event: 'mode', mode: rules.bossSeat ? rules.bossMode : 'off' }]);
}

/** Sittings whose time is up leave the seat, and their rooms hear it. Returns how many ended. */
export async function sweepBoss() {
  const r = await db.query(
    `UPDATE rooms r SET ${EMPTY}
       FROM (SELECT id, boss_id FROM rooms WHERE boss_until IS NOT NULL AND boss_until <= now() ORDER BY boss_until LIMIT 200 FOR UPDATE SKIP LOCKED) old
      WHERE r.id = old.id RETURNING r.id, old.boss_id`,
  );
  for (const x of r.rows) await announceBoss(x.id, [{ event: 'expired', user: x.boss_id }]);
  return r.rowCount;
}

let timer = null;
/** BOSS_SWEEP_MS: tests run it often; otherwise every 15 seconds. */
export function startBossSweep() {
  if (timer) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    await sweepBoss().catch((e) => console.error('boss seat sweep', e.message));
    running = false;
  };
  const every = Number(env.BOSS_SWEEP_MS);
  timer = setInterval(run, Number.isFinite(every) && every >= 100 ? every : 15_000);
  timer.unref();
  void run();
}
export function stopBossSweep() {
  clearInterval(timer);
  timer = null;
}

export const bossSeatRoutes = {
  /**
   * Davet mode: the owner seats someone on the Patron koltuğu (no end) or takes them off. Either mode: the holder
   * gets up. In Otomatik mode only gifts seat anyone.
   */
  async 'POST /api/rooms/boss'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.room);
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    const rules = rulesOf(room.rules);
    if (!rules.bossSeat) throw new HttpError(409, 'Bu odada patron koltuğu kapalı');
    if (!['seat', 'clear', 'leave'].includes(b.action)) throw new HttpError(400, 'Geçersiz işlem');
    limit(`roomboss:${me.id}`, 30, 'Çok sık işlem yaptın, biraz bekle');
    if (b.action === 'leave') {
      if (!(await clearBoss(room.id, 'left', me.id))) throw new HttpError(409, 'Patron koltuğunda değilsin');
    } else {
      if (room.owner !== me.id) throw new HttpError(403, 'Patron koltuğuna oturtmayı yalnızca oda sahibi yapar');
      if (rules.bossMode !== 'invite') throw new HttpError(409, 'Otomatik modda koltuğa hediyeyle oturulur');
      if (b.action === 'clear') {
        if (!(await clearBoss(room.id, 'removed'))) throw new HttpError(409, 'Patron koltuğu zaten boş');
      } else {
        const target = userId(b.user);
        if (!(await db.query('SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL', [target])).rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
        const ban = await db.query('SELECT 1 FROM room_bans WHERE room_id = $1 AND user_id = $2 AND (until IS NULL OR until > now())', [room.id, target]);
        if (ban.rowCount || (await blockedBetween(room.owner, target))) throw new HttpError(403, 'Bu kişi patron koltuğuna oturamaz');
        const r = await db.query(
          `UPDATE rooms r SET boss_id = $2, boss_since = now(), boss_until = NULL, boss_spent = 0
             FROM (SELECT id, boss_id, boss_until FROM rooms WHERE id = $1 FOR UPDATE) old
            WHERE r.id = old.id RETURNING old.boss_id, (old.boss_until IS NULL OR old.boss_until > now()) AS sitting`,
          [room.id, target],
        );
        const was = r.rows[0]?.boss_id ?? null;
        const events = was && was !== target ? [{ event: r.rows[0].sitting ? 'removed' : 'expired', user: was }] : [];
        if (was !== target) events.push({ event: 'sat', user: target });
        await announceBoss(room.id, events);
      }
    }
    const [fresh] = await withVoiceCounts([await roomRow(room.id)]);
    return { room: roomOut(fresh) };
  },
};
