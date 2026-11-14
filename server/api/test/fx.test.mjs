// Gift and entry videos from the server (fx.mjs): the catalog lists every clip with its size, length and a
// version from its content; the file goes out as itself, in parts when asked, kept for good by the phone; a gift
// hidden in Canlı ayarlar takes its clip out of the list.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { FX_VIDEOS, mp4Duration } from '../fx.mjs';
import { startApi } from './harness.mjs';

const h = startApi({ LIVE_POLL_MS: '200' });
const { call } = h;
const DIR = path.join(import.meta.dirname, '..', 'fx');
const ok = async (p) => {
  const [st, j] = await p;
  assert.equal(st, 200, j.error);
  return j;
};
const catalog = async () => ok(call('GET', '/api/catalog'));

/** The smallest MP4 the parser needs: moov › mvhd (version 0 or 1) with a timescale and a duration. */
function mp4(version, timescale, duration) {
  const body = Buffer.alloc(version === 1 ? 32 : 20);
  body[0] = version;
  if (version === 1) {
    body.writeUInt32BE(timescale, 20);
    body.writeBigUInt64BE(BigInt(duration), 24);
  } else {
    body.writeUInt32BE(timescale, 12);
    body.writeUInt32BE(duration, 16);
  }
  const sized = (type, inner) => {
    const b = Buffer.concat([Buffer.alloc(4), Buffer.from(type, 'latin1'), inner]);
    b.writeUInt32BE(b.length, 0);
    return b;
  };
  return Buffer.concat([sized('ftyp', Buffer.from('isom0000')), sized('moov', sized('mvhd', body)), sized('mdat', Buffer.alloc(16))]);
}

describe('hediye videoları sunucudan', () => {
  test('MP4 süresi başlıktan okunur; bozuk dosya 0', () => {
    assert.equal(mp4Duration(mp4(0, 1000, 6000)), 6000);
    assert.equal(mp4Duration(mp4(1, 90_000, 720_000)), 8000);
    assert.equal(mp4Duration(Buffer.from('bozuk dosya')), 0);
    assert.equal(mp4Duration(Buffer.alloc(0)), 0);
    // The real clips: 5 s each, the dragon a little longer.
    for (const name of new Set([...Object.values(FX_VIDEOS.gift), ...Object.values(FX_VIDEOS.entry)])) {
      const ms = mp4Duration(fs.readFileSync(path.join(DIR, name)));
      assert.ok(ms >= 3000 && ms <= 12_000, `${name}: ${ms} ms`);
    }
  });

  test('katalog her klibi adres, boyut, süre ve içerik sürümüyle verir', async () => {
    const { fx } = await catalog();
    const want = Object.entries(FX_VIDEOS).flatMap(([kind, map]) => Object.keys(map).map((id) => `${kind}:${id}`));
    assert.deepEqual(fx.map((x) => `${x.kind}:${x.id}`).sort(), want.sort());
    for (const x of fx) {
      const name = FX_VIDEOS[x.kind][x.id];
      assert.match(x.url, new RegExp(`^/api/fx/${name.replace('.', '\\.')}\\?v=[0-9a-f]{12}$`));
      assert.equal(x.bytes, fs.statSync(path.join(DIR, name)).size);
      assert.ok(x.ms > 0);
    }
  });

  test('dosya kendisi olarak gelir: tamamı, parçası, değişmediyse 304, olmayan 404', async () => {
    const { fx } = await catalog();
    const roket = fx.find((x) => x.id === 'g6');
    const disk = fs.readFileSync(path.join(DIR, 'roket.mp4'));

    const all = await fetch(`${h.base}${roket.url}`);
    assert.equal(all.status, 200);
    assert.equal(all.headers.get('content-type'), 'video/mp4');
    assert.equal(all.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(Number(all.headers.get('content-length')), disk.length);
    assert.ok(Buffer.from(await all.arrayBuffer()).equals(disk));

    const part = await fetch(`${h.base}${roket.url}`, { headers: { Range: 'bytes=100-199' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), `bytes 100-199/${disk.length}`);
    assert.ok(Buffer.from(await part.arrayBuffer()).equals(disk.subarray(100, 200)));

    const tail = await fetch(`${h.base}${roket.url}`, { headers: { Range: 'bytes=-50' } });
    assert.equal(tail.status, 206);
    assert.ok(Buffer.from(await tail.arrayBuffer()).equals(disk.subarray(disk.length - 50)));

    const beyond = await fetch(`${h.base}${roket.url}`, { headers: { Range: `bytes=${disk.length + 5}-` } });
    assert.equal(beyond.status, 416);
    assert.equal(beyond.headers.get('content-range'), `bytes */${disk.length}`);
    await beyond.body?.cancel();

    const same = await fetch(`${h.base}${roket.url}`, { headers: { 'If-None-Match': all.headers.get('etag') } });
    assert.equal(same.status, 304);

    const head = await fetch(`${h.base}${roket.url}`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers.get('content-length')), disk.length);

    for (const bad of ['/api/fx/yok.mp4', '/api/fx/..%2Fcatalog.mjs', '/api/fx/../index.mjs', '/api/fx/Roket.MP4', '/api/fx/']) {
      const r = await fetch(`${h.base}${bad}`);
      assert.equal(r.status, 404, bad);
      await r.body?.cancel();
    }
  });

  test('Canlı ayarlar’da gizlenen hediyenin klibi listeden çıkar', async () => {
    const admin = await h.account('Yönetici', 'admin');
    const SETTINGS = '/api/admin/live-settings';
    const setLive = async (changes) => {
      const view = await ok(call('GET', SETTINGS, null, admin.session));
      return ok(call('POST', SETTINGS, { changes, reason: 'Video testi', baseV: view.v, confirm: true }, admin.session));
    };
    await setLive({ gifts_hidden: ['g6'] });
    const until = Date.now() + 5000;
    let fx;
    do {
      ({ fx } = await catalog());
      if (!fx.some((x) => x.id === 'g6')) break;
      await new Promise((r) => setTimeout(r, 100));
    } while (Date.now() < until);
    assert.ok(!fx.some((x) => x.id === 'g6'), 'gizli hediyenin klibi listede kaldı');
    assert.ok(fx.some((x) => x.id === 'h13'));
    assert.ok(fx.some((x) => x.kind === 'entry' && x.id === 'dragon'));
    await setLive({ gifts_hidden: null });
  });
});
