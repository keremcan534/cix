// Voice and video minutes for the finance panel (media-minutes.mjs, 084): LiveKit's signed webhooks add a session's
// time to the day's total of its kind when it ends (a voice room's time, its mics' time, a call's by voice or video),
// with nobody in the rows; listening is a day's room time less its speaking. finance-sync.test.mjs sends the days.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { rnd, startApi } from './harness.mjs';

const h = startApi();
const { call, signUp } = h;

const sign = (body, secret = 'testsecret') => {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const hp = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'testkey', nbf: now - 5, exp: now + 300, sha256: crypto.createHash('sha256').update(body).digest('base64') })}`;
  return `${hp}.${crypto.createHmac('sha256', secret).update(hp).digest('base64url')}`;
};
const hook = async (event, extra = {}) => {
  const body = JSON.stringify({ event, id: `EV_${rnd(4)}`, createdAt: String(Math.floor(Date.now() / 1000)), ...extra });
  const [st, j] = await call('POST', '/api/livekit/webhook', body, null, { authorization: sign(body), 'content-type': 'application/webhook+json' });
  assert.equal(st, 200, j?.error);
};
/** Today's (Turkey) seconds by kind. */
const today = async () =>
  Object.fromEntries((await h.sql.query("SELECT kind, seconds::int AS s FROM media_minutes WHERE day = (now() AT TIME ZONE 'Europe/Istanbul')::date")).rows.map((r) => [r.kind, r.s]));
const near = (got, want, what) => assert.ok(Math.abs(got - want) <= 3, `${what}: ${got}, beklenen ~${want}`);
const tracks = async () => (await h.sql.query('SELECT track FROM voice_tracks ORDER BY track')).rows.map((r) => r.track);
/** A live 1v1 call between two people, free (no minute is charged while the test runs). */
const liveCall = async (mode, a, b) =>
  (await h.sql.query("INSERT INTO calls (kind, mode, caller, callee, ref, status, free, started_at) VALUES ('call', $1, $2, $3, $4, 'live', true, now()) RETURNING id", [mode, a.user.id, b.user.id, `t-${rnd(6)}`]))
    .rows[0].id;

describe('Ses ve görüntü dakikaları (finans paneli için)', () => {
  test('odada konuşma ve dinleme süresi; mikrofonu açıkken çıkanınki ve oda kapanınca açık kalanınki de sayılır', async () => {
    const owner = await signUp('Konuşan');
    const guest = await signUp('Dinleyen');
    const [, j] = await call('POST', '/api/rooms', { title: 'Dakika Odası' }, owner.session);
    const room = { name: `oda-${j.room.id}` };
    const o = { identity: owner.user.id, sid: 'PA_o' };
    const g = { identity: guest.user.id, sid: 'PA_g' };
    await hook('participant_joined', { room, participant: o });
    await hook('participant_joined', { room, participant: g });
    // The mic: LiveKit's JSON leaves the track type out for audio (its enum's 0). A camera track is no speaking.
    await hook('track_published', { room, participant: o, track: { sid: 'TR_mic', source: 'MICROPHONE' } });
    await hook('track_published', { room, participant: g, track: { sid: 'TR_cam', type: 'VIDEO', source: 'CAMERA' } });
    assert.deepEqual(await tracks(), ['TR_mic']);

    await h.sql.query("UPDATE voice_tracks SET started_at = now() - interval '2 minutes'");
    await h.sql.query("UPDATE room_presence SET joined_at = now() - interval '10 minutes' WHERE room = $1", [room.name]);
    await hook('track_unpublished', { room, participant: o, track: { sid: 'TR_mic' } });
    await hook('participant_left', { room, participant: o });
    await hook('participant_left', { room, participant: g });
    const m = await today();
    near(m.speaker, 120, 'konuşma');
    near(m.room, 1200, 'odada iki kişi 10 dakika');

    // Back with a new connection: an old connection's leave doesn't turn the new one's mic off.
    const o2 = { ...o, sid: 'PA_o2' };
    await hook('participant_joined', { room, participant: o2 });
    await hook('participant_joined', { room, participant: g });
    await hook('track_published', { room, participant: o2, track: { sid: 'TR_mic2' } });
    await hook('track_published', { room, participant: g, track: { sid: 'TR_mic3', type: 'AUDIO' } });
    await h.sql.query("UPDATE voice_tracks SET started_at = now() - interval '1 minute'");
    await hook('participant_left', { room, participant: o });
    assert.deepEqual(await tracks(), ['TR_mic2', 'TR_mic3'], 'eski bağlantının ayrılması yenisinin mikrofonunu kapatmaz');
    // Leaving with the mic on, and the room finishing with one on, both count.
    await hook('participant_left', { room, participant: o2 });
    await hook('room_finished', { room });
    near((await today()).speaker - m.speaker, 120, 'açıkken çıkan ve oda kapanınca açık kalan');
    assert.deepEqual(await tracks(), []);

    // The totals have nobody in them.
    const cols = (await h.sql.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'media_minutes' ORDER BY ordinal_position")).rows;
    assert.deepEqual(cols.map((c) => c.column_name), ['day', 'kind', 'seconds']);
  });

  test('sesli ve görüntülü arama: iki kişinin süresi türüne göre; arama odası oda süresine ve konuşmaya karışmaz', async () => {
    const a = await signUp('Arayan');
    const b = await signUp('Aranan');
    const m0 = await today();
    const leave = async (id, secs) => {
      const room = { name: `call-${id}` };
      for (const [u, sid] of [[a, 'PA_a'], [b, 'PA_b']]) await hook('participant_joined', { room, participant: { identity: u.user.id, sid } });
      // A call's audio is no voice room's speaking.
      await hook('track_published', { room, participant: { identity: a.user.id, sid: 'PA_a' }, track: { sid: `TR_${id}` } });
      assert.deepEqual(await tracks(), []);
      await h.sql.query('UPDATE room_presence SET joined_at = now() - make_interval(secs => $2) WHERE room = $1', [room.name, secs]);
      for (const [u, sid] of [[a, 'PA_a'], [b, 'PA_b']]) await hook('participant_left', { room, participant: { identity: u.user.id, sid } });
      await h.sql.query("UPDATE calls SET status = 'ended', ended_at = now() WHERE id = $1", [id]);
    };
    await leave(await liveCall('video', a, b), 90);
    await leave(await liveCall('voice', a, b), 30);
    const m = await today();
    near(m.call_video - (m0.call_video ?? 0), 180, 'görüntülü: iki kişi 90 saniye');
    near(m.call_voice - (m0.call_voice ?? 0), 60, 'sesli: iki kişi 30 saniye');
    assert.equal(m.room ?? 0, m0.room ?? 0, 'arama oda süresi değil');
    assert.equal(m.speaker ?? 0, m0.speaker ?? 0, 'arama konuşma süresi değil');
  });
});
