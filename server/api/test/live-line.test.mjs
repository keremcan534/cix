// The live line (live-line.mjs): an open GET /api/live hears at once what happens for its person (a follow, a
// message and its reading, a call ringing, answered and ended), only as a type and ids, never the content.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ AUTO_MUTE_REFUSALS: '0', LIVE_BEAT_MS: '200' });
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};

/** Opens a line for a session; `next(type)` waits for the next event of that type (2 s at most). */
async function open(session) {
  const ctl = new AbortController();
  const res = await fetch(`${h.base}/api/live`, { headers: { authorization: `Bearer ${session}` }, signal: ctl.signal });
  const events = [];
  let raw = '';
  let wake = () => {};
  (async () => {
    const dec = new TextDecoder();
    try {
      for await (const chunk of res.body) {
        raw += dec.decode(chunk, { stream: true });
        let i;
        while ((i = raw.indexOf('\n\n')) >= 0) {
          const block = raw.slice(0, i);
          raw = raw.slice(i + 2);
          for (const l of block.split('\n')) if (l.startsWith('data: ')) events.push(JSON.parse(l.slice(6)));
          wake();
        }
      }
    } catch {
      // closed
    }
  })();
  const next = async (type) => {
    const end = Date.now() + 2000;
    for (;;) {
      const at = events.findIndex((e) => e.type === type);
      if (at >= 0) return events.splice(at, 1)[0];
      if (Date.now() > end) throw new Error(`no ${type} event (got ${JSON.stringify(events)})`);
      await new Promise((r) => {
        wake = r;
        setTimeout(r, 50);
      });
    }
  };
  return { res, events, next, close: () => ctl.abort() };
}

describe('Anlık hat', () => {
  test('girişsiz açılmaz; açık hat beklerken kapanmaz', async () => {
    assert.equal((await fetch(`${h.base}/api/live`)).status, 401);
    const a = await signUp('Hat');
    const line = await open(a.session);
    assert.equal(line.res.status, 200);
    assert.match(line.res.headers.get('content-type'), /text\/event-stream/);
    // Several beats go by (LIVE_BEAT_MS 200) and the line is still open.
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(line.res.bodyUsed, true);
    line.close();
  });

  test('takip, mesaj, okundu ve arama anında gelir; içerik gelmez', async () => {
    const a = await signUp('Ayla');
    const b = await signUp('Bora');
    const la = await open(a.session);
    const lb = await open(b.session);

    await ok(call('POST', '/api/follow', { to: a.user.id }, b.session), 'takip');
    assert.deepEqual(await la.next('follow'), { type: 'follow', from: b.user.id });
    await ok(call('POST', '/api/follow', { to: b.user.id }, a.session), 'geri takip');
    await lb.next('follow');

    await ok(call('POST', '/api/messages', { to: a.user.id, text: 'gizli selam', ref: rnd(6) }, b.session), 'mesaj');
    const m = await la.next('message');
    assert.equal(m.from, b.user.id);
    assert.ok(!JSON.stringify(m).includes('gizli'), 'mesajın yazısı hatta gitmez');
    assert.ok(!JSON.stringify(m).includes('Bora'), 'ad da gitmez');

    await ok(call('POST', '/api/messages/read', { with: b.user.id }, a.session), 'okundu');
    assert.deepEqual(await lb.next('message_read'), { type: 'message_read', from: a.user.id });

    const { call: k } = await ok(call('POST', '/api/calls', { to: a.user.id, mode: 'voice', ref: rnd(6) }, b.session), 'ara');
    assert.equal((await la.next('call')).call, k.id, 'aranan çalmayı hemen duyar');
    await ok(call('POST', '/api/calls/answer', { id: k.id }, a.session), 'aç');
    assert.equal((await lb.next('call')).call, k.id, 'arayan açıldığını hemen duyar');
    await la.next('call');
    await ok(call('POST', '/api/calls/end', { id: k.id }, b.session), 'kapat');
    assert.equal((await la.next('call')).call, k.id, 'kapandığını ikisi de duyar');
    await lb.next('call');

    la.close();
    lb.close();
  });

  test('bir kişinin en fazla 3 hattı açık kalır; en eskisi kapanır', async () => {
    const a = await signUp('Çok Hat');
    const lines = [];
    for (let i = 0; i < 4; i++) lines.push(await open(a.session));
    await new Promise((r) => setTimeout(r, 300));
    const b = await signUp('Takipçi');
    await ok(call('POST', '/api/follow', { to: a.user.id }, b.session), 'takip');
    for (const l of lines.slice(1)) await l.next('follow');
    assert.equal(lines[0].events.filter((e) => e.type === 'follow').length, 0, 'en eski hat kapandı');
    for (const l of lines) l.close();
  });
});
