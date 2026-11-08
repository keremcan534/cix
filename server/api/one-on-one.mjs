// 1v1 ("birebir yayıncılık"): paid messages, voice and video calls, the heart level between two people, and
// Eşleşme (random voice or video matches).
//
//   GET  /api/one-on-one?with=          → { pair }   what a message or a call to them costs me now, the heart level
//   POST /api/calls         { to, mode, ref } → { call }   rings them (mode voice | video)
//   GET  /api/calls/current               → { call }   my open call (ringing or live), or null
//   POST /api/calls/beat    { id }        → { call }   "still here", every few seconds from both phones
//   POST /api/calls/answer  { id }        → { call, token }
//   POST /api/calls/join    { id }        → { token }  a live call's LiveKit token (after a reconnect)
//   POST /api/calls/end     { id }        → { call }   hang up, decline or cancel
//   POST /api/match/join    { mode }      → { state, call, rights }   (state: waiting | matched)
//   POST /api/match/state                 → { state, call, rights }   (state: idle | waiting | matched)
//   POST /api/match/leave                 → { state, call, rights }
//
// Who pays: between a streamer (an approved agency streamer) and anyone else, the other one pays and the streamer
// earns the same number of diamonds. Messages are free when the two follow each other, calls open at a heart
// level (heart_voice_level, heart_video_level). Between two streamers, or two people who aren't: messages and
// calls are free, and calls need a mutual follow. In a match of two people who aren't streamers the man pays and
// nobody earns. Non-streamers get match_free free matches in 24 hours, each at most match_free_seconds long.
// Prices are live settings (live-registry.mjs, "Birebir ve eşleşme"); a call keeps the price it started with.
//
// A minute is paid when it starts: the first when the call goes live, the next at 60 s, and so on. A payer who
// can't pay the next minute is cut off. Both phones say they are still there (beat); a call nobody hears from in
// 30 s ends, and so does a free match at its time. A call's voice and video go through LiveKit room call-<id>,
// which is deleted when the call ends, so nobody stays in it unpaid.
import crypto from 'node:crypto';

import { recordIncome } from './agency-lib.mjs';
import { HttpError, REF, auth, blockedBetween, db, env, limit, readJson, tx, userId } from './core.mjs';
import { live } from './live-settings.mjs';
import { deleteVoiceRoom, liveKitJwt } from './live.mjs';
import { notify } from './push.mjs';
import { assertMay } from './sanctions.mjs';
import { giftDiamonds, paidCoins, spendCoins } from './wallet.mjs';

/** Heart points (coins the two spent on each other: gifts, paid messages, paid minutes) needed for each level. */
export const HEART_LEVELS = [0, 300, 1500, 5000, 15_000, 40_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000];
export const heartLevel = (points) => HEART_LEVELS.findLastIndex((p) => points >= p);
const MODES = ['voice', 'video'];
const MODE_TEXT = { voice: 'Sesli', video: 'Görüntülü' };
/** A call nobody answers stops ringing; a call nobody hears from ends. Seconds. */
const RING_S = 40;
const LOST_S = 30;
/** A waiting phone that stops asking leaves the queue. */
const QUEUE_S = 12;
const TOKEN_TTL = 600;

const streamerSql = (x) => `EXISTS (SELECT 1 FROM agency_streamers s WHERE s.streamer_id = ${x} AND s.ended_at IS NULL AND s.contract = 'approved')`;
const insufficient = () => Object.assign(new HttpError(409, 'Yetersiz jeton'), { extra: { code: 'insufficient' } });

/** Heart points between two people, both ways. */
export async function heartPoints(c, a, b) {
  const r = await c.query(
    `SELECT (SELECT coalesce(sum(total), 0) FROM gift_events WHERE (sender = $1 AND recipient = $2) OR (sender = $2 AND recipient = $1))
          + (SELECT coalesce(sum(coins), 0) FROM paid_events WHERE (payer = $1 AND earner = $2) OR (payer = $2 AND earner = $1)) AS points`,
    [a, b],
  );
  return Number(r.rows[0].points);
}

/** The two people as 1v1 sees them: who pays, the message price, the heart level, which calls are open. */
export async function pairOf(c, me, other) {
  const s = live();
  const x = (
    await c.query(
      `SELECT ${streamerSql('$1')} AS me_s, ${streamerSql('$2')} AS other_s,
              EXISTS (SELECT 1 FROM follows WHERE follower = $1 AND followee = $2) AS i_follow,
              EXISTS (SELECT 1 FROM follows WHERE follower = $2 AND followee = $1) AS they_follow`,
      [me, other],
    )
  ).rows[0];
  const mutual = x.i_follow && x.they_follow;
  const paid = x.me_s !== x.other_s;
  const payer = paid ? (x.me_s ? other : me) : null;
  const points = await heartPoints(c, me, other);
  const level = heartLevel(points);
  const call = (mode) => {
    const need = mode === 'voice' ? s.heartVoice : s.heartVideo;
    if (!paid) return { open: mutual, price: 0, why: mutual ? null : 'Arama için karşılıklı takip gerekli' };
    return { open: level >= need, price: mode === 'voice' ? s.callVoice : s.callVideo, why: level >= need ? null : `${MODE_TEXT[mode]} arama kalp seviyesi ${need} olunca açılır` };
  };
  return {
    streamer: x.other_s,
    meStreamer: x.me_s,
    mutual,
    payer,
    earner: paid ? (x.me_s ? me : other) : null,
    iPay: payer === me,
    dmPrice: payer === me && !mutual ? s.dmPrice : 0,
    heart: { points, level, next: HEART_LEVELS[level + 1] ?? null, floor: HEART_LEVELS[level], voiceAt: s.heartVoice, videoAt: s.heartVideo },
    calls: { voice: call('voice'), video: call('video') },
  };
}

/**
 * One paid 1v1 item inside a transaction (both accounts locked): the payer's coins, the earner's diamonds (none
 * when nobody earns), the paid_events row and the agency income. A short balance is a 409 and changes nothing.
 */
export async function payOneOnOne(c, { kind, payer, earner, coins, ref, label, income, messageId = null, callId = null }) {
  const parts = await spendCoins(c, payer, coins, label, ref, earner, { detail: { oneOnOne: kind, ...(callId && { call: callId }), ...(messageId && { message: messageId }) } });
  if (earner) await giftDiamonds(c, { sender: payer, recipient: earner, parts, total: coins, ref, reason: label });
  await c.query('INSERT INTO paid_events (kind, payer, earner, coins, message_id, call_id, ref) VALUES ($1,$2,$3,$4,$5,$6,$7)', [kind, payer, earner, coins, messageId, callId, ref]);
  // Never fails the payment: runs in a savepoint (agency-lib.mjs).
  if (earner) await recordIncome(c, earner, kind === 'message' ? 'message' : 'call', income, coins);
}

// --- Calls ---------------------------------------------------------------------------------------------------
const CALL_SELECT = `SELECT k.*, extract(epoch FROM now() - k.started_at) AS elapsed, now() AS now,
       a.name AS caller_name, a.avatar_url AS caller_avatar, b.name AS callee_name, b.avatar_url AS callee_avatar
  FROM calls k JOIN users a ON a.id = k.caller JOIN users b ON b.id = k.callee`;
const callById = async (c, id, lock = false) => (await c.query(`${CALL_SELECT} WHERE k.id = $1${lock ? ' FOR UPDATE OF k' : ''}`, [id])).rows[0] ?? null;
const openCallOf = async (c, uid) => (await c.query(`${CALL_SELECT} WHERE (k.caller = $1 OR k.callee = $1) AND k.status IN ('ringing', 'live') ORDER BY k.id DESC LIMIT 1`, [uid])).rows[0] ?? null;
const lockUsers = (c, ids) => c.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[...new Set(ids)]]);
export const callRoom = (id) => `call-${id}`;

/** A call as one of its two people sees it. */
function view(k, me) {
  const mine = k.caller === me;
  return {
    id: Number(k.id),
    kind: k.kind,
    mode: k.mode,
    status: k.status,
    endReason: k.end_reason,
    incoming: !mine && k.kind === 'call',
    other: mine ? { id: k.callee, name: k.callee_name, avatarUrl: k.callee_avatar ?? null } : { id: k.caller, name: k.caller_name, avatarUrl: k.caller_avatar ?? null },
    iPay: k.payer === me,
    iEarn: k.earner === me,
    price: k.price,
    free: k.free,
    maxSeconds: k.max_seconds,
    createdAt: k.created_at,
    startedAt: k.started_at,
    endedAt: k.ended_at,
    minutes: k.minutes,
    coins: Number(k.coins),
    serverNow: k.now,
  };
}

/** A LiveKit token for the call's room, with the camera only in a video call. */
const tokenFor = (k, u) =>
  liveKitJwt(
    { sub: u.id, name: u.name, video: { room: callRoom(k.id), roomJoin: true, canPublish: true, canPublishSources: k.mode === 'video' ? ['microphone', 'camera'] : ['microphone'], canSubscribe: true, canPublishData: false } },
    TOKEN_TTL,
  );

const minuteLabel = (k, n) => `${MODE_TEXT[k.mode]} ${k.kind === 'match' ? 'eşleşme' : 'arama'} · ${n}. dakika`;

/** Charges minute n of a live call (both accounts locked). */
async function chargeMinute(c, k, n) {
  const ref = `call-${k.id}-${n}`;
  await payOneOnOne(c, { kind: k.kind === 'match' ? `match_${k.mode}` : `${k.mode}_call`, payer: k.payer, earner: k.earner, coins: k.price, ref, label: minuteLabel(k, n), income: `call:${k.id}:${n}`, callId: Number(k.id) });
  await c.query('UPDATE calls SET minutes = $2, coins = coins + $3 WHERE id = $1', [k.id, n, k.price]);
}

/** Ends a call (lock held). A ringing call is declined (by the callee), cancelled (by the caller) or missed. */
async function endCall(c, k, reason, by = null) {
  const status = k.status !== 'ringing' ? 'ended' : by === k.callee ? 'declined' : by === k.caller ? 'cancelled' : 'missed';
  await c.query('UPDATE calls SET status = $2, end_reason = $3, ended_by = $4, ended_at = now() WHERE id = $1', [k.id, status, reason, by]);
}

/** What a live call owes or whether it is over now: minutes due, a free match's end, phones gone quiet. */
const dueOf = (k) => {
  if (k.status !== 'live') return null;
  const elapsed = Number(k.elapsed);
  const quiet = (Date.parse(k.now) - Math.min(Date.parse(k.caller_seen), Date.parse(k.callee_seen))) / 1000;
  if (k.free && k.max_seconds && elapsed >= k.max_seconds) return 'time';
  if (quiet > LOST_S) return 'lost';
  if (k.payer && k.price > 0 && k.minutes < Math.floor(elapsed / 60) + 1) return 'minute';
  return null;
};

/** Brings a live call up to date in its own transaction: charges due minutes or ends it. Returns the call after. */
async function settle(id) {
  let ended = false;
  const k = await tx(async (c) => {
    const peek = await callById(c, id);
    if (!peek || !dueOf(peek)) return peek;
    await lockUsers(c, [peek.caller, peek.callee]);
    const k = await callById(c, id, true);
    const due = dueOf(k);
    if (due === 'time' || due === 'lost') {
      await endCall(c, k, due);
      ended = true;
    } else if (due === 'minute') {
      const upTo = Math.floor(Number(k.elapsed) / 60) + 1;
      for (let n = k.minutes + 1; n <= upTo; n++) {
        try {
          await chargeMinute(c, k, n);
        } catch (e) {
          if (e.extra?.code !== 'insufficient' && e.extra?.code !== 'reward_coins_only') throw e;
          await endCall(c, k, 'coins');
          ended = true;
          break;
        }
      }
    }
    return callById(c, id);
  });
  if (ended) closeRoom(id);
  return k;
}

const closeRoom = (id) => void deleteVoiceRoom(callRoom(id)).catch((e) => console.error('call room delete', id, String(e).slice(0, 200)));

/** The caller's or callee's call, or a 404. */
async function ownCall(c, id, me) {
  const k = Number.isSafeInteger(id) && id > 0 ? await callById(c, id) : null;
  if (!k || (k.caller !== me && k.callee !== me)) throw new HttpError(404, 'Arama bulunamadı');
  return k;
}

// --- Matches -------------------------------------------------------------------------------------------------
/** Free matches left in the last 24 hours, and when the oldest of them frees up again. */
async function rightsOf(c, me) {
  const s = live();
  const r = await c.query("SELECT count(*)::int AS n, min(created_at) AS oldest FROM calls WHERE kind = 'match' AND free AND payer = $1 AND created_at > now() - interval '24 hours'", [me.id]);
  const used = r.rows[0].n;
  const streamer = (await c.query(`SELECT ${streamerSql('$1')} AS yes`, [me.id])).rows[0].yes;
  return {
    streamer,
    free: s.matchFree,
    freeLeft: Math.max(0, s.matchFree - used),
    nextFreeAt: used >= s.matchFree && r.rows[0].oldest ? new Date(Date.parse(r.rows[0].oldest) + 24 * 3600_000).toISOString() : null,
    seconds: s.matchSeconds,
    price: { voice: s.matchVoice, video: s.matchVideo },
  };
}

/** Who pays in a match of a and b ({ id, gender, streamer }): the non-streamer with a streamer, else the man. */
function matchRoles(a, b) {
  if (a.streamer !== b.streamer) return a.streamer ? { payer: b.id, earner: a.id } : { payer: a.id, earner: b.id };
  if (a.streamer) return { payer: null, earner: null };
  return { payer: a.gender === 'Erkek' ? a.id : b.gender === 'Erkek' ? b.id : null, earner: null };
}

async function matchState(c, me) {
  const k = await openCallOf(c, me.id);
  const rights = await rightsOf(c, me);
  if (k?.kind === 'match') return { state: 'matched', call: view(k, me.id), rights };
  const q = await c.query('UPDATE match_queue SET seen_at = now() WHERE user_id = $1 RETURNING mode', [me.id]);
  return { state: q.rowCount ? 'waiting' : 'idle', mode: q.rows[0]?.mode ?? null, call: null, rights };
}

/** Pairs me with the person waiting longest who fits (opposite gender, same mode, no block, not just matched). */
async function pairUp(me, mode) {
  return tx(async (c) => {
    // One pairing at a time, so two people can't both take the same waiting person.
    await c.query('SELECT pg_advisory_xact_lock(28028)');
    const s = live();
    const mine = (await c.query(`SELECT ${streamerSql('$1')} AS streamer`, [me.id])).rows[0];
    const self = { id: me.id, gender: me.gender, streamer: mine.streamer };
    const cands = await c.query(
      `SELECT q.user_id AS id, u.gender, ${streamerSql('q.user_id')} AS streamer
         FROM match_queue q JOIN users u ON u.id = q.user_id AND u.deleted_at IS NULL
        WHERE q.mode = $2 AND q.user_id <> $1 AND q.gender IS NOT NULL AND q.gender <> $3 AND q.seen_at > now() - make_interval(secs => $4)
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = q.user_id) OR (b.blocker = q.user_id AND b.blocked = $1))
          AND NOT EXISTS (SELECT 1 FROM calls x WHERE x.kind = 'match' AND x.created_at > now() - interval '10 minutes'
                            AND ((x.caller = $1 AND x.callee = q.user_id) OR (x.caller = q.user_id AND x.callee = $1)))
          AND NOT EXISTS (SELECT 1 FROM calls x WHERE x.status IN ('ringing', 'live') AND q.user_id IN (x.caller, x.callee))
        ORDER BY q.joined_at LIMIT 5`,
      [me.id, mode, me.gender, QUEUE_S],
    );
    for (const other of cands.rows) {
      const { payer, earner } = matchRoles(self, other);
      let free = false;
      let price = 0;
      if (payer) {
        const used = (await c.query("SELECT count(*)::int AS n FROM calls WHERE kind = 'match' AND free AND payer = $1 AND created_at > now() - interval '24 hours'", [payer])).rows[0].n;
        free = used < s.matchFree;
        price = free ? 0 : mode === 'voice' ? s.matchVoice : s.matchVideo;
      }
      await lockUsers(c, [me.id, other.id]);
      if (price > 0 && (await paidCoins(c, payer)) < price) {
        // The one waiting can't pay any more: out of the queue (their phone shows it). I can't: refused.
        if (payer !== other.id) throw insufficient();
        await c.query('DELETE FROM match_queue WHERE user_id = $1', [other.id]);
        continue;
      }
      const k = await c.query(
        `INSERT INTO calls (kind, mode, caller, callee, payer, earner, price, free, max_seconds, status, started_at, ref)
         VALUES ('match', $1, $2, $3, $4, $5, $6, $7, $8, 'live', now(), $9) RETURNING id`,
        [mode, other.id, me.id, payer, earner, price, free, free ? s.matchSeconds : null, `match-${crypto.randomBytes(8).toString('hex')}`],
      );
      const call = await callById(c, k.rows[0].id, true);
      if (price > 0) await chargeMinute(c, call, 1);
      await c.query('DELETE FROM match_queue WHERE user_id = ANY($1::uuid[])', [[me.id, other.id]]);
      return { state: 'matched', call: view(await callById(c, call.id), me.id) };
    }
    // Nobody fits yet: I wait (a new mode starts the wait again).
    await c.query(
      `INSERT INTO match_queue (user_id, mode, gender) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET seen_at = now(), gender = EXCLUDED.gender,
         joined_at = CASE WHEN match_queue.mode = EXCLUDED.mode THEN match_queue.joined_at ELSE now() END, mode = EXCLUDED.mode`,
      [me.id, mode, me.gender],
    );
    return { state: 'waiting', mode, call: null };
  });
}

// --- Sweep ---------------------------------------------------------------------------------------------------
/** Unanswered calls stop ringing, live calls are charged or ended, quiet phones leave the queue. */
export async function sweepCalls() {
  const missed = await db.query(
    `UPDATE calls k SET status = 'missed', end_reason = 'timeout', ended_at = now() FROM users a
      WHERE a.id = k.caller AND k.status = 'ringing' AND (k.created_at < now() - make_interval(secs => $1) OR k.caller_seen < now() - make_interval(secs => $2))
      RETURNING k.id, k.callee, k.mode, a.name`,
    [RING_S, LOST_S],
  );
  for (const m of missed.rows) notify([m.callee], { title: m.name, body: `Cevapsız ${MODE_TEXT[m.mode].toLowerCase()} arama`, data: { type: 'call', call: Number(m.id), missed: true } });
  const open = await db.query("SELECT id FROM calls WHERE status = 'live'");
  for (const { id } of open.rows) await settle(id).catch((e) => console.error('call settle', id, e.message));
  await db.query('DELETE FROM match_queue WHERE seen_at < now() - make_interval(secs => $1)', [QUEUE_S]);
}

let timer = null;
export function startCallSweep() {
  if (timer) return;
  const run = () => sweepCalls().catch((e) => console.error('call sweep', e.message));
  const every = Number(env.CALL_SWEEP_MS);
  timer = setInterval(run, Number.isFinite(every) && every >= 100 ? every : 5_000);
  timer.unref();
}
export function stopCallSweep() {
  clearInterval(timer);
  timer = null;
}

// --- Routes --------------------------------------------------------------------------------------------------
const modeOf = (v) => {
  if (!MODES.includes(v)) throw new HttpError(400, 'Arama türü sesli ya da görüntülü olmalı');
  return v;
};
const idOf = (b) => Number(b?.id);

export const oneOnOneRoutes = {
  async 'GET /api/one-on-one'(req, url) {
    const me = await auth(req);
    const other = userId(url.searchParams.get('with'));
    if (other === me.id) throw new HttpError(400, 'Kendinle birebir yok');
    const u = await db.query('SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL', [other]);
    if (!u.rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
    const { payer: _p, earner: _e, ...pair } = await pairOf(db, me.id, other);
    return { pair };
  },

  async 'POST /api/calls'(req) {
    const me = await auth(req);
    await assertMay(me, 'call');
    limit(`call:${me.id}`, 10, 'Çok sık arıyorsun, biraz bekle');
    const b = await readJson(req);
    const to = userId(b.to, 'aranan');
    const mode = modeOf(b.mode);
    if (to === me.id) throw new HttpError(400, 'Kendini arayamazsın');
    if (!REF.test(b.ref ?? '')) throw new HttpError(400, 'Geçersiz istek kimliği');
    const prev = await db.query('SELECT id FROM calls WHERE caller = $1 AND ref = $2', [me.id, b.ref]);
    if (prev.rowCount) return { call: view(await callById(db, prev.rows[0].id), me.id), replay: true };
    const peer = await db.query('SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL', [to]);
    if (!peer.rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
    if (await blockedBetween(me.id, to)) throw new HttpError(403, 'Bu kişiyi arayamazsın');
    const id = await tx(async (c) => {
      await lockUsers(c, [me.id, to]);
      const pair = await pairOf(c, me.id, to);
      const gate = pair.calls[mode];
      if (!gate.open) throw Object.assign(new HttpError(403, gate.why), { extra: { code: 'locked' } });
      if (await openCallOf(c, me.id)) throw new HttpError(409, 'Zaten bir görüşmedesin');
      if (await openCallOf(c, to)) throw Object.assign(new HttpError(409, 'Şu an başka bir görüşmede'), { extra: { code: 'busy' } });
      if (pair.payer === me.id && gate.price > 0 && (await paidCoins(c, me.id)) < gate.price) throw insufficient();
      const r = await c.query('INSERT INTO calls (kind, mode, caller, callee, payer, earner, price, ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [
        'call',
        mode,
        me.id,
        to,
        gate.price > 0 ? pair.payer : null,
        gate.price > 0 ? pair.earner : null,
        gate.price,
        b.ref,
      ]);
      return r.rows[0].id;
    }).catch(async (e) => {
      // Two copies of the same request at once: the second hits (caller, ref).
      if (e.code !== '23505') throw e;
      return (await db.query('SELECT id FROM calls WHERE caller = $1 AND ref = $2', [me.id, b.ref])).rows[0]?.id ?? Promise.reject(e);
    });
    const k = await callById(db, id);
    notify([to], { title: me.name, body: `${MODE_TEXT[mode]} arıyor`, data: { type: 'call', from: me.id, call: Number(id), mode } });
    return { call: view(k, me.id), replay: false };
  },

  async 'GET /api/calls/current'(req) {
    const me = await auth(req);
    const k = await openCallOf(db, me.id);
    return { call: k ? view(k, me.id) : null };
  },

  async 'POST /api/calls/beat'(req) {
    const me = await auth(req);
    const k = await ownCall(db, idOf(await readJson(req)), me.id);
    if (k.status === 'ringing' || k.status === 'live') await db.query(`UPDATE calls SET ${k.caller === me.id ? 'caller_seen' : 'callee_seen'} = now() WHERE id = $1`, [k.id]);
    return { call: view(await settle(k.id), me.id) };
  },

  async 'POST /api/calls/answer'(req) {
    const me = await auth(req);
    await assertMay(me, 'call');
    const id = idOf(await readJson(req));
    const peek = await ownCall(db, id, me.id);
    if (peek.callee !== me.id || peek.kind !== 'call') throw new HttpError(403, 'Bu aramayı sen açamazsın');
    let cut = false;
    await tx(async (c) => {
      await lockUsers(c, [peek.caller, peek.callee]);
      const k = await callById(c, id, true);
      if (k.status === 'live') return;
      if (k.status !== 'ringing') throw new HttpError(409, 'Arama sona erdi');
      await c.query("UPDATE calls SET status = 'live', started_at = now(), caller_seen = now(), callee_seen = now() WHERE id = $1", [id]);
      if (!k.payer || k.price <= 0) return;
      try {
        await chargeMinute(c, k, 1);
      } catch (e) {
        if (e.extra?.code !== 'insufficient' && e.extra?.code !== 'reward_coins_only') throw e;
        await endCall(c, { ...k, status: 'live' }, 'coins');
        cut = true;
      }
    });
    const k = await callById(db, id);
    if (cut) return { call: view(k, me.id), token: null };
    return { call: view(k, me.id), token: tokenFor(k, me) };
  },

  async 'POST /api/calls/join'(req) {
    const me = await auth(req);
    const k = await ownCall(db, idOf(await readJson(req)), me.id);
    if (k.status !== 'live') throw new HttpError(409, 'Arama sona erdi');
    return { token: tokenFor(k, me) };
  },

  async 'POST /api/calls/end'(req) {
    const me = await auth(req);
    const id = idOf(await readJson(req));
    const peek = await ownCall(db, id, me.id);
    let ended = false;
    if (peek.status === 'ringing' || peek.status === 'live') {
      await tx(async (c) => {
        const k = await callById(c, id, true);
        if (k.status !== 'ringing' && k.status !== 'live') return;
        await endCall(c, k, 'hangup', me.id);
        ended = k.status === 'live';
      });
    }
    if (ended) closeRoom(id);
    return { call: view(await callById(db, id), me.id) };
  },

  async 'POST /api/match/join'(req) {
    const me = await auth(req);
    await assertMay(me, 'call');
    limit(`match:${me.id}`, 30, 'Çok sık deniyorsun, biraz bekle');
    const mode = modeOf((await readJson(req)).mode);
    if (!me.gender) throw Object.assign(new HttpError(400, 'Eşleşme için profilinde cinsiyetini seç'), { extra: { code: 'gender' } });
    const open = await openCallOf(db, me.id);
    if (open?.kind === 'match') return matchState(db, me);
    if (open) throw new HttpError(409, 'Zaten bir görüşmedesin');
    // A man who isn't a streamer pays once his free matches are used: refused before he waits if he can't.
    const rights = await rightsOf(db, me);
    if (!rights.streamer && me.gender === 'Erkek' && rights.freeLeft === 0 && (await paidCoins(db, me.id)) < rights.price[mode]) throw insufficient();
    const out = await pairUp(me, mode);
    return { ...out, rights: await rightsOf(db, me) };
  },

  async 'POST /api/match/state'(req) {
    const me = await auth(req);
    return matchState(db, me);
  },

  async 'POST /api/match/leave'(req) {
    const me = await auth(req);
    await db.query('DELETE FROM match_queue WHERE user_id = $1', [me.id]);
    return matchState(db, me);
  },
};
