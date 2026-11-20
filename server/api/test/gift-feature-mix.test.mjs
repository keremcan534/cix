// Güncelleme 7's gift features together (Bağlar, Profil izleri, Global hediye, Şanslı hediye): the rules where one
// feature meets another, as custom-gifts.mjs checkMarkPrices and global-gifts.mjs globalRefusal keep them.
// - A gift that leaves or cleans a profile mark (Kaka, Su, an admin's) is never global: the save is refused both ways
//   (ticking Global on a marked gift, giving a mark to a global one, both at once), and rows that say both anyway are
//   not announced and the catalog doesn't call them global.
// - A bond gift and Koruma Kartı leave or clean no mark (bonds.mjs bondGiftOf never applies one).
// - A repeat bond gift between two who have the bond is an ordinary gift: bond points, no mark, no announcement.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startApi } from './harness.mjs';
import { bucketEnv, png, standInBucket } from './stand-in-bucket.mjs';

const PORT = 24000 + (process.pid % 900);
standInBucket(PORT);
const h = startApi({ ...bucketEnv(PORT), CUSTOM_GIFTS_POLL_MS: '200', LIVE_BEAT_MS: '200' });
const { call } = h;
const q = async (s, p) => (await h.sql.query(s, p)).rows;
const rnd = () => Math.random().toString(36).slice(2, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = async (p, what = 'istek') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const refused = async (p, code, re) => {
  const [st, j] = await p;
  assert.equal(st, code, `beklenen ${code}, gelen ${st}: ${j.error}`);
  if (re) assert.match(j.error, re);
  return j;
};

let admin, ali, ayse, dinleyen, room;
const update = (body) => call('POST', '/api/admin/gifts/update', body, admin.session);
const panelGift = async (id) => (await ok(call('GET', '/api/admin/gifts?builtin=1', null, admin.session), 'panel')).gifts.find((g) => g.id === id);
const catalogGift = async (id) => (await ok(call('GET', '/api/catalog?gifts=2&family=1&marks=1'), 'katalog')).gifts.find((g) => g.id === id);
const send = (from, to, giftId, price, extra = {}) => call('POST', '/api/gifts/send', { to: to.user.id, giftId, count: 1, price, place: 'profile', ref: `mix-${rnd()}`, ...extra }, from.session);
async function setLive(changes) {
  const [, view] = await call('GET', '/api/admin/live-settings', null, admin.session);
  await ok(call('POST', '/api/admin/live-settings', { changes, reason: 'Hediye özellikleri testi', baseV: view.v, confirm: true }, admin.session), 'canlı ayar');
}
async function icon() {
  const body = png(256, 256);
  const up = await ok(call('POST', '/api/media/upload-url', { kind: 'gifticon', contentType: 'image/png', size: body.length }, admin.session), 'yükleme adresi');
  assert.equal((await fetch(up.uploadUrl, { method: 'PUT', headers: up.headers, body })).status, 200);
  return up.publicUrl;
}
/** A live line asking for global gifts; `globals()` gives the ones that came before a ping on it. */
async function line(session) {
  const ctl = new AbortController();
  const res = await fetch(`${h.base}/api/live?global=1`, { headers: { authorization: `Bearer ${session}` }, signal: ctl.signal });
  assert.equal(res.status, 200);
  const events = [];
  (async () => {
    const dec = new TextDecoder();
    let raw = '';
    try {
      for await (const chunk of res.body) {
        raw += dec.decode(chunk, { stream: true });
        let i;
        while ((i = raw.indexOf('\n\n')) >= 0) {
          for (const l of raw.slice(0, i).split('\n')) if (l.startsWith('data: ')) events.push(JSON.parse(l.slice(6)));
          raw = raw.slice(i + 2);
        }
      }
    } catch {
      // closed
    }
  })();
  const globals = async () => {
    await ok(call('POST', '/api/live/ping', {}, session), 'ping');
    for (const end = Date.now() + 4000; !events.some((e) => e.type === 'ping'); await sleep(20)) if (Date.now() > end) throw new Error('ping gelmedi');
    events.splice(events.findIndex((e) => e.type === 'ping'), 1);
    return events.splice(0).filter((e) => e.type === 'global_gift');
  };
  return { globals, close: () => ctl.abort() };
}

describe('Hediye özellikleri birlikte', () => {
  before(async () => {
    admin = await h.account('Karışım Yöneticisi', 'admin');
    ali = await h.signUp('Ali Gönderen');
    ayse = await h.signUp('Ayşe Alan');
    dinleyen = await h.signUp('Deniz Dinleyen');
    await h.credit(ali.user.id, 1_000_000);
    // Only a send in a server room is announced (global-gifts.mjs): the sends below that could be go in Ayşe's room.
    room = (await ok(call('POST', '/api/rooms', { title: 'Karışım Odası' }, ayse.session), 'oda')).room.id;
    // The minimum Global price low enough for Su (1.999), and no wait between two announcements.
    await setLive({ global_gift_min_price: 1000, global_gift_gap_seconds: 0 });
  });

  test('profil izi olan hediye global olamaz: iki yönde, birlikte de; hiçbir şey değişmez', async () => {
    // Su cleans a mark: ticking Global is refused, nothing saved, no audit row.
    await refused(update({ id: 'k2', global: true }), 400, /Profil izi bırakan ya da temizleyen hediye global olamaz/);
    assert.equal((await panelGift('k2')).global, false);
    assert.equal((await q("SELECT count(*)::int AS n FROM audit_events WHERE action = 'gift.update' AND detail->>'gift' = 'k2'"))[0].n, 0);
    // Kaka made dear enough (Su dearer still): the same.
    await ok(update({ id: 'k2', price: 5000 }), 'Su 5.000');
    await ok(update({ id: 'k1', price: 2000 }), 'Kaka 2.000');
    await refused(update({ id: 'k1', global: true }), 400, /global olamaz/);
    // A global gift can't be given a mark afterwards.
    await ok(update({ id: 'c6', global: true }), 'c6 global');
    await refused(update({ id: 'c6', mark: { role: 'clean', kind: 'kaka' } }), 400, /global olamaz/);
    const c6 = await panelGift('c6');
    assert.equal(c6.global, true);
    assert.equal(c6.mark, null);
    // Taking Global off makes the mark possible; then Global is refused again.
    await ok(update({ id: 'c6', global: false, mark: { role: 'leave', kind: 'camur' } }), 'c6 iz bırakır');
    await refused(update({ id: 'c6', global: true }), 400, /global olamaz/);
    await ok(call('POST', '/api/admin/gifts/reset', { id: 'c6', fields: ['mark', 'global'] }, admin.session), 'c6 geri');
    // An admin's new gift with both: refused, no row.
    const art = await icon();
    await refused(call('POST', '/api/admin/gifts', { name: 'Çamur Topu', price: 1500, cat: 'gameplay', icon: art, global: true, mark: { role: 'leave', kind: 'camur' } }, admin.session), 400, /global olamaz/);
    assert.equal((await q("SELECT count(*)::int AS n FROM custom_gifts WHERE name = 'Çamur Topu'"))[0].n, 0);
    // One of the two alone is fine.
    const mine = (await ok(call('POST', '/api/admin/gifts', { name: 'Çamur Topu', price: 1500, cat: 'gameplay', icon: art, global: true }, admin.session), 'yalnız global')).gift;
    await refused(update({ id: mine.id, mark: { role: 'leave', kind: 'camur' } }), 400, /global olamaz/);
    await ok(call('POST', '/api/admin/gifts/delete', { id: mine.id }, admin.session), 'sil');
    for (const id of ['k1', 'k2']) await ok(call('POST', '/api/admin/gifts/reset', { id }, admin.session), `${id} geri`);
  });

  test('bağ hediyesi ve Koruma Kartı iz bırakamaz, temizleyemez', async () => {
    for (const id of ['bag-kardes', 'bag-kanka', 'koruma']) {
      await refused(update({ id, mark: { role: 'leave', kind: 'kaka' } }), 400, /Bağ hediyesi ve Koruma Kartı profil izi/);
      await refused(update({ id, mark: { role: 'clean', kind: 'kaka' } }), 400, /Bağ hediyesi ve Koruma Kartı profil izi/);
      assert.equal((await panelGift(id)).mark, null, id);
    }
    await sleep(300);
    assert.equal((await catalogGift('bag-kardes')).mark, undefined);
    // "No mark" stays possible (it is what they have).
    await ok(update({ id: 'bag-kardes', mark: null }), 'iz yok');
    await ok(call('POST', '/api/admin/gifts/reset', { id: 'bag-kardes', fields: ['mark'] }, admin.session), 'geri');
  });

  test('satırlar ikisini birden dese de: katalog global demez, duyuru gitmez, iz kalır', async () => {
    // As if written by hand (or by an older server): Su's row says global.
    await q("INSERT INTO custom_gifts (id, builtin, global) VALUES ('k2', true, true) ON CONFLICT (id) DO UPDATE SET global = true, rev = nextval('custom_gift_rev')");
    await sleep(500);
    assert.equal((await catalogGift('k2')).global, undefined, 'katalog global demez');
    assert.deepEqual((await catalogGift('k2')).mark, { role: 'clean', kind: 'kaka' });
    const l = await line(dinleyen.session);
    try {
      await l.globals();
      // Kaka, then Su: the mark comes and goes as always; no announcement.
      assert.equal((await ok(send(ali, ayse, 'k1', 999, { room }), 'kaka')).mark.role, 'leave');
      assert.equal((await ok(send(ali, ayse, 'k2', 1999, { room }), 'su')).mark.role, 'clean');
      // A global gift right after, as the control: only it is announced.
      await ok(update({ id: 'c6', global: true }), 'c6 global');
      await sleep(300);
      const c6 = await ok(send(ali, ayse, 'c6', 699_999, { room }), 'c6');
      assert.equal(c6.mark, undefined);
      for (const end = Date.now() + 3000; Date.now() < end; await sleep(100)) {
        const got = await l.globals();
        if (got.length) {
          assert.deepEqual(got.map((e) => e.gift.id), ['c6']);
          return;
        }
      }
      assert.fail('c6 duyurulmadı');
    } finally {
      l.close();
      await q("UPDATE custom_gifts SET global = NULL, rev = nextval('custom_gift_rev') WHERE id = 'k2'");
      await ok(call('POST', '/api/admin/gifts/reset', { id: 'c6', fields: ['global'] }, admin.session), 'c6 geri');
    }
  });

  test('bağı olana tekrar bağ hediyesi: bağ puanı, iz yok, duyuru yok', async () => {
    const [st, j] = await call('POST', '/api/bonds/request', { to: ayse.user.id, kind: 'kanka', ref: rnd(), price: 500 }, ali.session);
    assert.equal(st, 200, j.error);
    const req = (await ok(call('GET', '/api/bonds/requests', null, ayse.session), 'istekler')).incoming[0];
    await ok(call('POST', '/api/bonds/respond', { id: req.id, accept: true }, ayse.session), 'kabul');
    const before = (await q("SELECT gift_coins FROM bonds WHERE status = 'active' AND kind = 'kanka'"))[0];
    const l = await line(dinleyen.session);
    try {
      await l.globals();
      const r = await ok(send(ali, ayse, 'bag-kanka', 500, { room }), 'tekrar bağ hediyesi');
      assert.equal(r.mark, undefined);
      const after = (await q("SELECT gift_coins FROM bonds WHERE status = 'active' AND kind = 'kanka'"))[0];
      assert.equal(Number(after.gift_coins) - Number(before.gift_coins), 500);
      await sleep(300);
      assert.deepEqual(await l.globals(), []);
    } finally {
      l.close();
    }
  });
});
