// Voice and video time by kind and day (084), for the finance panel's cost estimate: finance-sync.mjs sends each
// finished day as usage events, priced per person-minute on the panel's Tarifeler page (Oracle bills our own LiveKit
// by traffic, so a minute's price is its traffic's). Seconds are added when a session ends, with nobody in the rows.
//   room        a person's time in a voice room (oda-…), speaking or listening: live.mjs's presence rows
//   speaker     a voice room's mic on: a published audio track, from LiveKit's track webhooks (live.mjs). The app
//               mutes a mic rather than unpublishing it and LiveKit sends no webhook for a mute, so this is time
//               on a mic, muted or not, until its track, its person's connection or its room ends
//   call_voice  a person's time in a 1v1 voice call or match (call-<id>), each of the two counted
//   call_video  the same for video
// Listening is a day's room time less its speaking. A session counts on the (Turkey) day it ends. Every function
// here swallows its errors: a webhook must never fail on bookkeeping.
import { db } from './core.mjs';

const TODAY = "(now() AT TIME ZONE 'Europe/Istanbul')::date";
const CALL = /^call-(\d{1,18})$/;
/** LiveKit's track type: AUDIO is its enum's 0, which the webhook's JSON leaves out. */
const AUDIO = new Set([undefined, null, 'AUDIO', 0]);

/** Adds the seconds since each start to today's `kind`. */
async function add(kind, starts) {
  const s = starts.reduce((sum, t) => sum + Math.max(0, (Date.now() - new Date(t).getTime()) / 1000), 0);
  if (s < 0.5) return;
  await db.query(
    `INSERT INTO media_minutes (day, kind, seconds) VALUES (${TODAY}, $1, $2)
     ON CONFLICT (day, kind) DO UPDATE SET seconds = media_minutes.seconds + EXCLUDED.seconds`,
    [kind, Math.round(s)],
  );
}
const quietly = (fn) => async (...a) => {
  try {
    await fn(...a);
  } catch (e) {
    console.error('media minutes', String(e?.message ?? e).slice(0, 200));
  }
};

/** LiveKit sessions that ended (presence rows: room, joined_at): a voice room's time, or a call's by its kind. */
export const sessionsEnded = quietly(async (rows) => {
  const room = rows.filter((x) => x.room.startsWith('oda-')).map((x) => x.joined_at);
  await add('room', room);
  for (const x of rows) {
    const m = CALL.exec(x.room);
    if (!m) continue;
    const k = (await db.query('SELECT mode FROM calls WHERE id = $1', [m[1]])).rows[0];
    if (k) await add(k.mode === 'video' ? 'call_video' : 'call_voice', [x.joined_at]);
  }
});

/** A track published in a voice room: its mic is on from now (only audio: a camera seat's video isn't speaking). */
export const trackPublished = quietly(async (room, identity, sid, track) => {
  const id = typeof track?.sid === 'string' ? track.sid.slice(0, 64) : '';
  if (!room.startsWith('oda-') || !id || !identity || !AUDIO.has(track.type)) return;
  await db.query('INSERT INTO voice_tracks (track, room, identity, sid) VALUES ($1, $2, $3, $4) ON CONFLICT (track) DO NOTHING', [id, room, identity, sid ?? '']);
});

const ended = async (sql, params) => add('speaker', (await db.query(`DELETE FROM voice_tracks WHERE ${sql} RETURNING started_at`, params)).rows.map((r) => r.started_at));
/** A mic turned off (its track unpublished). */
export const trackUnpublished = quietly(async (track) => typeof track?.sid === 'string' && (await ended('track = $1', [track.sid.slice(0, 64)])));
/** A person's connection left a room: its mics are off (not those of a newer connection after a reconnect). */
export const connectionEnded = quietly(async (room, identity, sid) => await ended("room = $1 AND identity = $2 AND (sid = $3 OR $3 = '')", [room, identity, sid ?? '']));
/** A room started again or finished: whatever was on in it is off. */
export const roomEnded = quietly(async (room) => await ended('room = $1', [room]));

/** A day's person-minutes (two decimals): speaking, listening (the room's time less its speaking), calls. */
export async function dayMinutes(day) {
  const s = Object.fromEntries((await db.query('SELECT kind, seconds FROM media_minutes WHERE day = $1', [day])).rows.map((x) => [x.kind, Number(x.seconds)]));
  const min = (v) => Math.round((Math.max(0, v) / 60) * 100) / 100;
  return { speaker: min(s.speaker ?? 0), listener: min((s.room ?? 0) - (s.speaker ?? 0)), call_voice: min(s.call_voice ?? 0), call_video: min(s.call_video ?? 0) };
}
