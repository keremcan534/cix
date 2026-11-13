// Ortak ekran (room-video.mjs): the owner and the room's admins open a YouTube video and play, pause, seek or close it
// for everyone; it goes into the LiveKit metadata so every phone shows the same video at the same point. Only a
// valid video id is kept; others, and admins of a room that keeps its tools to the owner, are refused. A fake
// LiveKit records what the API asks of it.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

const lkCalls = [];
const LK_PORT = 23000 + (process.pid % 900);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    lkCalls.push({ method: req.url.split('/').pop(), body: JSON.parse(body || '{}') });
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  });
});
await new Promise((r) => lk.listen(LK_PORT, '127.0.0.1', r));
after(() => new Promise((r) => (lk.closeAllConnections?.(), lk.close(r))));

const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}` });
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const status = async (p) => (await p)[0];
const lastMeta = (room) => {
  const c = lkCalls.filter((x) => x.method === 'UpdateRoomMetadata' && x.body.room === `oda-${room}`).pop();
  return c && JSON.parse(c.body.metadata);
};
const VID = 'dQw4w9WgXcQ';

describe('Ortak ekran (YouTube)', () => {
  test('sahip ve yönetici açar, oynatır, duraklatır, kapatır; her telefon metadatadan aynısını görür', async () => {
    const owner = await signUp('Ekran Sahibi');
    const admin = await signUp('Ekran Yöneticisi');
    const guest = await signUp('Ekran İzleyici');
    const room = (await ok(call('POST', '/api/rooms', { title: `Sinema ${rnd(2)}` }, owner.session), 'oda')).room.id;
    await ok(call('POST', '/api/rooms/admin', { room, user: admin.user.id }, owner.session), 'yönetici');
    const set = (video, who = owner) => call('POST', '/api/rooms/video', { room, video }, who.session);

    const before = Date.now();
    const opened = await ok(set({ videoId: VID, status: 'playing', position: 12.34 }), 'aç');
    assert.equal(opened.video.videoId, VID);
    assert.equal(opened.video.status, 'playing');
    assert.equal(opened.video.position, 12.3);
    assert.equal(opened.video.by, owner.user.id);
    assert.ok(opened.video.updatedAt >= before && opened.video.updatedAt <= Date.now());
    assert.ok(Date.parse(opened.serverNow) > 0);
    assert.deepEqual(lastMeta(room).video, opened.video, 'metadata taşır');

    const paused = await ok(set({ videoId: VID, status: 'paused', position: 40 }, admin), 'yönetici duraklatır');
    assert.equal(paused.video.status, 'paused');
    assert.equal(paused.video.by, admin.user.id);
    assert.equal(lastMeta(room).video.status, 'paused');

    assert.equal(await status(set({ videoId: VID, status: 'playing', position: 0 }, guest)), 403, 'izleyici yönetemez');
    await ok(set(null), 'kapat');
    assert.equal(lastMeta(room).video, null);
  });

  test('yalnız geçerli video kimliği, durum ve konum; sahibe ayrılmış odada yönetici yönetemez; kapalı odada olmaz', async () => {
    const owner = await signUp('Kural Sahibi');
    const admin = await signUp('Kural Yöneticisi');
    const room = (await ok(call('POST', '/api/rooms', { title: `Kural ${rnd(2)}` }, owner.session), 'oda')).room.id;
    await ok(call('POST', '/api/rooms/admin', { room, user: admin.user.id }, owner.session), 'yönetici');
    const set = (video, who = owner) => call('POST', '/api/rooms/video', { room, video }, who.session);

    for (const bad of [
      { videoId: 'https://youtube.com/watch?v=dQw4w9WgXcQ', status: 'playing', position: 0 },
      { videoId: 'kısa', status: 'playing', position: 0 },
      { videoId: VID, status: 'ended', position: 0 },
      { videoId: VID, status: 'playing', position: -1 },
      { videoId: VID, status: 'playing', position: '5' },
      'dQw4w9WgXcQ',
    ])
      assert.equal(await status(set(bad)), 400, JSON.stringify(bad));

    await q('UPDATE rooms SET rules = $2 WHERE id = $1', [room, JSON.stringify({ manageFunctions: 'owner' })]);
    assert.equal(await status(set({ videoId: VID, status: 'playing', position: 0 }, admin)), 403, 'yalnız sahip');
    await ok(set({ videoId: VID, status: 'playing', position: 0 }), 'sahip açar');

    await q('UPDATE rooms SET closed_at = now() WHERE id = $1', [room]);
    assert.equal(await status(set({ videoId: VID, status: 'paused', position: 0 })), 410, 'kapalı oda');
  });
});
