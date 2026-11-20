// VIP seti (vip-set.mjs, 106): at start the server adds the client's VIP 1–10 frames, chat bubbles and entry effects as
// the admins' own shop items, off the shelf, each given by a Seviye ödülü to whoever reaches its VIP level; their files
// go to the storage. Once: a restart adds nothing again, and a piece staff deleted stays deleted.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { SVIP_XP } from '../catalog.mjs';
import { startApi } from './harness.mjs';
import { CDN, bucketEnv, standInBucket } from './stand-in-bucket.mjs';

const PORT = 27000 + (process.pid % 900);
const bucket = standInBucket(PORT);
const h = startApi({ ...bucketEnv(PORT), VIP_SET: '1', SHOP_ITEMS_POLL_MS: '200' });
const { call } = h;
const ok = async (p, what = 'istek') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
/** vip-set.mjs vipSetId (not imported: the module loads the API's settings). */
const vipSetId = (kind, n) => `${{ frame: 'sf', bubble: 'sb', entry: 'se' }[kind]}${900_000 + n}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (text, args) => h.sql.query(text, args);
const vipTo = (who, n) => q('UPDATE users SET svip_xp = $2 WHERE id = $1', [who.user.id, SVIP_XP[n - 1]]);
async function waitFor(fn, what, ms = 60_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`zaman aşımı: ${what}`);
    await sleep(200);
  }
}
const added = async () => (await q('SELECT count(*)::int AS n FROM vip_set')).rows[0].n;

describe('VIP seti', () => {
  test('30 parça bir kez eklenir: satışta değil, VIP seviyesine bağlı, dosyaları depoda', async () => {
    await waitFor(async () => (await added()) === 30, 'VIP seti eklenmedi');
    const items = (await q("SELECT * FROM shop_items WHERE id = ANY($1) ORDER BY id", [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((n) => ['frame', 'bubble', 'entry'].map((k) => vipSetId(k, n)))])).rows;
    assert.equal(items.length, 30);
    for (const x of items) {
      assert.equal(x.enabled, false, `${x.id} satışta olmamalı`);
      assert.equal(x.days, 0, `${x.id} süresiz`);
      assert.ok(x.min_vip >= 1 && x.min_vip <= 10);
    }
    const frame = items.find((x) => x.id === vipSetId('frame', 6));
    assert.equal(frame.name, 'VIP 6 Çerçevesi');
    assert.ok(frame.art_url.startsWith(`${CDN}/shopframe/`) && frame.motion_url.endsWith('.webp'));
    const bubble = items.find((x) => x.id === vipSetId('bubble', 2));
    assert.equal(bubble.look.slice.w, bubble.art_px);
    const entry = items.find((x) => x.id === vipSetId('entry', 9));
    assert.ok(entry.video_url.includes('/giftvideo/') && entry.video_ms > 1000 && entry.icon_url);
    // Every address points at a file the storage really has.
    for (const url of items.flatMap((x) => [x.art_url, x.motion_url, x.video_url, x.icon_url]).filter(Boolean)) {
      assert.ok(bucket.stored.has(url.slice(CDN.length + 1)), `depoda yok: ${url}`);
    }
    const rules = (await q("SELECT level, sku FROM level_rewards WHERE system = 'vip' AND deleted_at IS NULL")).rows;
    assert.equal(rules.length, 30);
    assert.ok(rules.every((r) => Number(r.sku.slice(2)) - 900_000 === r.level), 'her ödül kendi seviyesinde');
    const audit = (await q("SELECT count(*)::int AS n FROM audit_events WHERE action = 'vip_set.add'")).rows[0].n;
    assert.equal(audit, 30);
  });

  test('telefonun kataloğunda raftan kalkmış olarak; giriş videosu sunulur', async () => {
    const u = await h.signUp('Katalog Okuyan');
    const cat = await ok(call('GET', '/api/catalog?shop=1', null, u.session), 'katalog');
    const ids = new Map(cat.shop.items.map((x) => [x.sku, x]));
    const frame = ids.get(vipSetId('frame', 1));
    assert.ok(frame, 'çerçeve katalogda');
    assert.equal(frame.off, true);
    assert.ok(ids.get(vipSetId('entry', 1))?.video, 'giriş efektinin videosu var');
    const res = await fetch(`${h.base}/api/fx/s/${vipSetId('entry', 1)}.mp4`);
    assert.equal(res.status, 200);
    assert.equal(Buffer.from(await res.arrayBuffer()).subarray(4, 8).toString(), 'ftyp', 'bir MP4');
  });

  test('VIP 3 olan 1–3 seviyelerin çerçeve, balon ve giriş efektini Çantam’da bulur; satın alınamaz', async () => {
    const u = await h.signUp('VIP Üç');
    await vipTo(u, 3);
    const eco = await ok(call('GET', '/api/economy', null, u.session), 'ekonomi');
    const mine = new Set(eco.items.map((x) => x.sku));
    for (const n of [1, 2, 3]) for (const k of ['frame', 'bubble', 'entry']) assert.ok(mine.has(vipSetId(k, n)), `${k}-${n} çantada`);
    assert.ok(!mine.has(vipSetId('frame', 4)), 'VIP 4 çerçevesi gelmez');
    const got = eco.items.find((x) => x.sku === vipSetId('frame', 3));
    assert.equal(got.source, 'level');
    assert.equal(got.origin, 'VIP 3');
    // Not on the shelf: a buy is refused and takes nothing.
    await h.credit(u.user.id, 2_000_000);
    const [st] = await call('POST', '/api/shop/buy', { sku: vipSetId('frame', 4), price: 1_000_000, ref: `vip-set-${Date.now()}` }, u.session);
    assert.notEqual(st, 200);
  });

  test('yeniden başlayınca bir şey eklenmez; silinen parça geri gelmez', async () => {
    const id = vipSetId('bubble', 10);
    await q('DELETE FROM level_rewards WHERE sku = $1', [id]);
    await q('UPDATE shop_items SET deleted_at = now() WHERE id = $1', [id]);
    await h.restart();
    await sleep(1500);
    assert.equal(await added(), 30);
    assert.equal((await q('SELECT count(*)::int AS n FROM shop_items WHERE id = $1 AND deleted_at IS NULL', [id])).rows[0].n, 0);
    assert.equal((await q("SELECT count(*)::int AS n FROM audit_events WHERE action = 'vip_set.add'")).rows[0].n, 30);
  });
});
