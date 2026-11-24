// DJ modu (owners, 24 Nov 2026): a room's DJ or its owner plugs a mixer or DJ controller into the phone (a USB/OTG
// sound card or a cable) and sends the mix live to the room from their mic. The phone then sends the mic without any
// voice processing (no noise suppression, echo cancellation, gain control or AI cleaning) at music quality
// (`dj_live_kbps`, Canlı ayarlar › Odalar) instead of a voice's ~32 kbps, from the input the DJ picked (app
// components/room/dj-live, lib/livekit-engine setDjMode). The room's file music (music.mjs) is a separate thing and
// keeps working as it did.
//
//   GET  /api/rooms/dj-live?room=      → { may, on, kbps, perRoom, live: [{ id, publicNo, name }] }
//   POST /api/rooms/dj-live { room, on } → { on, kbps }
//
// Who: the room's owner and its DJs (room_djs) — the owners' choice; not admins (they are not DJs, music.mjs), not
// anyone else on a mic. Turning it on also needs: the room open, DJ modu not switched off (kbps 0), me in the voice
// room on a mic, and fewer than `dj_live_per_room` others in DJ modu there (each is a full music stream to every
// listener). The server then writes my `dj` participant attribute "1" in LiveKit, which every phone in the room shows
// ("canlı DJ"); off writes "". A phone could write its own attribute (canUpdateOwnMetadata, for its seat), so counts
// and the app's bar only take people who may. Taken off the DJs (music.mjs POST /api/rooms/dj) the attribute is
// cleared at once and that phone turns DJ modu off (it follows its own attribute); off the mic, the phone turns it off.
// Only the attribute is the server's: the sound itself never passes through us.
import { HttpError, UUID, auth, db, limit, readJson } from './core.mjs';
import { live } from './live-settings.mjs';
import { roomService, voiceParticipants } from './live.mjs';
import { liveKitName } from './rooms.mjs';

/** DJ modu's numbers now: kbps 0 = off. */
export const djRules = (s = live()) => ({ kbps: s.djLiveKbps ?? 96, perRoom: s.djLivePerRoom ?? 1 });

async function roomOf(id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(400, 'Geçersiz oda');
  const r = await db.query('SELECT id, owner, closed_at FROM rooms WHERE id = $1', [id]);
  if (!r.rowCount) throw new HttpError(404, 'Oda bulunamadı');
  return r.rows[0];
}

/** The people who may be in DJ modu in this room: its owner and its DJs. */
async function djsOf(room) {
  const r = await db.query('SELECT user_id FROM room_djs WHERE room_id = $1', [room.id]);
  return new Set([room.owner, ...r.rows.map((x) => x.user_id)]);
}

/** My `dj` attribute in the LiveKit room; false when LiveKit doesn't have me there. */
const writeDj = (room, uid, on) => roomService('UpdateParticipant', { room, identity: uid, attributes: { dj: on ? '1' : '' } }, { roomAdmin: true, room });

/** Someone left the room's DJs (music.mjs): out of DJ modu at once. Never throws. */
export function endDjLive(roomId, uid) {
  const name = liveKitName(roomId);
  writeDj(name, uid, false).catch((e) => console.error('livekit UpdateParticipant dj', name, String(e).slice(0, 200)));
}

/** Who is in DJ modu in the room now (only people who may), with their ID in the app; [] when LiveKit can't say. */
async function liveDjs(room, may) {
  const people = await voiceParticipants(liveKitName(room.id)).catch(() => null);
  const ids = (people ?? []).filter((p) => p.dj && may.has(p.identity)).map((p) => p.identity);
  if (!ids.length) return [];
  const r = await db.query('SELECT id, name, public_no FROM users WHERE id = ANY($1::uuid[])', [ids]);
  return r.rows.map((x) => ({ id: x.id, publicNo: x.public_no === null ? null : String(x.public_no), name: x.name ?? 'Üye' }));
}

export const djLiveRoutes = {
  async 'GET /api/rooms/dj-live'(req, url) {
    const me = await auth(req);
    const room = await roomOf(url.searchParams.get('room'));
    const { kbps, perRoom } = djRules();
    const djs = await djsOf(room);
    const list = room.closed_at ? [] : await liveDjs(room, djs);
    return { may: !room.closed_at && kbps > 0 && djs.has(me.id), on: list.some((x) => x.id === me.id), kbps, perRoom, live: list };
  },

  async 'POST /api/rooms/dj-live'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomOf(b.room);
    if (typeof b.on !== 'boolean') throw new HttpError(400, 'DJ modu açık ya da kapalı olmalı');
    const name = liveKitName(room.id);
    const { kbps, perRoom } = djRules();
    if (!b.on) {
      // Off is always allowed (and never fails the phone: it has already turned its sound back to a voice's).
      await writeDj(name, me.id, false).catch((e) => console.error('livekit UpdateParticipant dj', name, String(e).slice(0, 200)));
      return { on: false, kbps };
    }
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    if (kbps <= 0) throw new HttpError(403, 'DJ modu şu an kapalı');
    const djs = await djsOf(room);
    if (!djs.has(me.id)) throw new HttpError(403, 'DJ modunu oda sahibi ve odanın DJ’leri açar');
    limit(`djlive:${me.id}`, 20, 'Çok sık açıp kapattın, biraz bekle');
    const people = await voiceParticipants(name).catch(() => null);
    if (people === null) throw new HttpError(503, 'Ses sunucusu şu an bağlı değil');
    const mine = people.find((p) => p.identity === me.id);
    if (!mine) throw new HttpError(409, 'Önce odaya gir');
    if (mine.seat === null) throw new HttpError(409, 'DJ modu için önce mikrofona çık');
    const others = people.filter((p) => p.identity !== me.id && p.dj && djs.has(p.identity)).length;
    if (others >= perRoom) throw new HttpError(409, perRoom === 1 ? 'Odada şu an başka bir DJ canlı yayında' : `Odada aynı anda en çok ${perRoom} DJ canlı yayın yapabilir`);
    if (!(await writeDj(name, me.id, true))) throw new HttpError(409, 'Önce odaya gir');
    return { on: true, kbps };
  },
};
