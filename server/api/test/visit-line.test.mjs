// Profil ziyaretleri anlık (social.mjs recordVisit, owners 25 Nov 2026): the first visit of the day tells the owner
// (`visit`, with a push); every later one sends only a quiet `visitors` sign on the owner's open app, so Mesajlar and
// Ziyaretçiler read the list again at once, with no notice.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startApi } from './harness.mjs';

const h = startApi();
const { call, signUp } = h;
const lines = [];
after(() => lines.forEach((c) => c.abort()));

/** The owner's live line: `next(type)` waits for that event; `seen(type)` counts them so far. */
async function open(session) {
  const ctl = new AbortController();
  lines.push(ctl);
  const res = await fetch(`${h.base}/api/live`, { headers: { authorization: `Bearer ${session}` }, signal: ctl.signal });
  assert.equal(res.status, 200);
  const events = [];
  let raw = '';
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
        }
      }
    } catch {
      // closed
    }
  })();
  const next = async (type) => {
    const end = Date.now() + 3000;
    for (;;) {
      const at = events.findIndex((e) => e.type === type);
      if (at >= 0) return events.splice(at, 1)[0];
      if (Date.now() > end) throw new Error(`no ${type} event (got ${JSON.stringify(events)})`);
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  return { next, events };
}

describe('Profil ziyaretleri anlık', () => {
  test('ilk ziyaret bildirim, aynı gün sonrakiler sessiz yenileme', async () => {
    const owner = await signUp('Ziyaret Edilen');
    const guest = await signUp('Ziyaretçi');
    const live = await open(owner.session);
    await new Promise((r) => setTimeout(r, 200));
    const [st] = await call('GET', `/api/user?id=${owner.user.id}&visit=1`, null, guest.session);
    assert.equal(st, 200);
    await live.next('visit');
    // Again the same day: no notice, a quiet sign the app reads the list on.
    await call('GET', `/api/user?id=${owner.user.id}&visit=1`, null, guest.session);
    await live.next('visitors');
    assert.equal(live.events.filter((e) => e.type === 'visit').length, 0, 'ikinci bildirim yok');
  });
});
