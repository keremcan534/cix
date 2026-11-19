// Rules the owners change by hand in Canlı ayarlar (live-registry.mjs), against a real Postgres: Bağlar's limits and
// days, Koruma's numbers and Şanslı çanta's choices. Each change acts on the next request; what was already sent or
// set keeps its own; the catalog tells the phones.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { GIFTS } from '../catalog.mjs';
import { GUARD_CARD } from '../guard-rules.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi({ GUARD_SWEEP_MS: '200', BAG_SWEEP_MS: '200' });
const { call } = h;
const ok = async (p, what = 'istek') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j?.error ?? ''}`);
  return j;
};
const refused = async (p, code, re) => {
  const [st, j] = await p;
  assert.equal(st, code, JSON.stringify(j).slice(0, 200));
  if (re) assert.match(j.error, re);
  return j;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;

let admin;
async function setLive(changes) {
  admin ??= await h.account('Kural Yöneticisi', 'admin');
  const view = await ok(call('GET', '/api/admin/live-settings', null, admin.session), 'ayarlar');
  return ok(call('POST', '/api/admin/live-settings', { changes, reason: 'Kural testi', baseV: view.v, confirm: true }, admin.session), 'ayar kaydı');
}
const person = async (name, coins = 0) => {
  const u = await h.signUp(name);
  if (coins) await h.credit(u.user.id, coins);
  return u;
};
const catalog = () => ok(call('GET', '/api/catalog?gifts=2&family=1'), 'katalog');

describe('Canlı ayarlar › Bağlar', () => {
  after(() => setLive({ bond_max_kanka: null, bond_answer_days: null, bond_cooldown_days: null, bond_pending_max: null, bond_talk_daily: null }));

  test('tür sınırı, cevap süresi, bekleme ve bekleyen istek sınırı panelden; katalog söyler', async () => {
    const a = await person('Bağcı', 10_000);
    const [b, c, d] = await Promise.all(['Bir', 'İki', 'Üç'].map((n) => person(`Kanka ${n}`)));
    const ask = (to, kind = 'kanka') => call('POST', '/api/bonds/request', { to: to.user.id, kind, ref: rnd(8) }, a.session);
    await setLive({ bond_max_kanka: 1, bond_answer_days: 5, bond_cooldown_days: 0, bond_pending_max: 2 });
    const cat = await catalog();
    assert.deepEqual([cat.bonds.max.kanka, cat.bonds.max.kardes, cat.bonds.answerDays, cat.bonds.cooldownDays], [1, 3, 5, 0]);
    assert.equal((await ok(call('GET', '/api/bonds/info'))).kinds.find((k) => k.id === 'kanka').max, 1);
    // One Kanka at a time (the pending one counts for the asker).
    const first = await ok(ask(b), 'ilk kanka');
    await refused(ask(c), 409, /En fazla 1 Kanka|Zaten bir Kanka/);
    // Five days to answer, fixed when sent.
    const [{ days }] = await q("SELECT round(extract(epoch FROM expires_at - created_at) / 86400) AS days FROM bonds WHERE id = $1", [first.bond.id]);
    assert.equal(Number(days), 5);
    // Two pending at most.
    await ok(ask(c, 'kardes'), 'kardeş');
    await refused(ask(d, 'abla'), 409, /en fazla 2 bekleyen/);
    // No waiting after an end: the same two bond again at once.
    await ok(call('POST', '/api/bonds/respond', { id: first.bond.id, accept: true }, b.session), 'kabul');
    await ok(call('POST', '/api/bonds/end', { id: first.bond.id }, a.session), 'bitir');
    await setLive({ bond_pending_max: null });
    await ok(ask(b), 'hemen yeniden');
  });

  test('sohbet puanı 0: mesaj bağ puanı getirmez', async () => {
    await setLive({ bond_talk_daily: 0 });
    assert.equal((await catalog()).bonds.talkDaily, 0);
  });
});

describe('Canlı ayarlar › Koruma', () => {
  after(() => setLive({ guard_drop_from: null, guard_drop_pct: null, guard_drop_flat: null, guard_threshold_per_level: null, guard_threshold_days: null }));

  test('gece düşüşü, eşik sınırı ve aralığı panelden; katalog söyler', async () => {
    await setLive({ guard_drop_from: 10_000, guard_drop_pct: 25, guard_drop_flat: 300, guard_threshold_per_level: 1_000, guard_threshold_days: 2 });
    assert.deepEqual((await catalog()).guard, { dropFrom: 10_000, dropShare: 0.25, dropFlat: 300, listMax: 50, thresholdPerLevel: 1_000, thresholdEveryDays: 2 });
    const g = await person('Koruyan', 50_000);
    const [big, small] = await Promise.all([person('Büyük Korunan'), person('Küçük Korunan')]);
    for (const w of [big, small]) await ok(call('POST', '/api/gifts/send', { to: w.user.id, giftId: GUARD_CARD, count: 1, ref: rnd(8), price: GIFTS.get(GUARD_CARD).price, place: 'profile' }, g.session), 'kart');
    const setPair = (w, points) =>
      q(
        `UPDATE guards SET points = $3, decayed_on = NULL, gift_day = (now() AT TIME ZONE 'Europe/Istanbul')::date - 3, first_day = (now() AT TIME ZONE 'Europe/Istanbul')::date - 10
          WHERE guardian = $1 AND ward = $2 AND ended_at IS NULL`,
        [g.user.id, w.user.id, points],
      );
    await setPair(big, 20_000);
    await setPair(small, 8_000);
    let pts = [];
    for (let i = 0; i < 30; i++) {
      await sleep(100);
      pts = (await q('SELECT ward, points FROM guards WHERE guardian = $1 ORDER BY points DESC', [g.user.id])).map((r) => Number(r.points));
      if (pts[0] !== 20_000 && pts[1] !== 8_000) break;
    }
    assert.deepEqual(pts, [15_000, 7_700], '%25 ve 300 puan');
    // The threshold: at most 1.000 × (Yankı + 1); then two days until the next change.
    const w = await person('Eşikli');
    const set = (threshold) => call('POST', '/api/guard/settings', { threshold }, w.session);
    const s = await ok(set(1_000), 'eşik');
    assert.equal(s.settings.thresholdMax, 1_000);
    await refused(set(2_000), 400, /0–1\.000/);
    const next = Date.parse(s.settings.thresholdNextAt);
    assert.ok(Math.abs(next - Date.now() - 2 * 86_400_000) < 120_000, 'iki gün sonra');
    await refused(set(500), 429, /2 günde bir/);
  });
});

describe('Canlı ayarlar › Şanslı çanta', () => {
  after(() => setLive({ lucky_bag_coins: null, lucky_bag_coin_packets: null, lucky_bag_seconds: null }));

  test('seçenekler panelden; uygulama sunucunun listesini alır; açık kalma süresi', async () => {
    const owner = await person('Çanta Odası');
    const [, j] = await call('POST', '/api/rooms', { title: `Çanta ${rnd(2)}` }, owner.session);
    const room = j.room.id;
    const rich = await person('Çantacı', 20_000);
    const drop = (body) => call('POST', '/api/lucky-bags', { room, kind: 'coins', followersOnly: false, delay: 0, ref: rnd(8), ...body }, rich.session);
    await refused(call('POST', '/api/admin/live-settings', { changes: { lucky_bag_coins: '1000, 100000' }, reason: 'büyük', baseV: 0, confirm: true }, (admin ??= await h.account('Kural Yöneticisi', 'admin')).session), 400, /50\.000/);
    await setLive({ lucky_bag_coins: '2.000, 500', lucky_bag_coin_packets: '4, 8', lucky_bag_seconds: 60 });
    const view = await ok(call('GET', '/api/admin/live-settings', null, admin.session), 'ayarlar');
    assert.equal(view.settings.find((x) => x.key === 'lucky_bag_coins').value, '500, 2000', 'sıralı ve noktasız saklanır');
    const rules = (await ok(call('GET', `/api/lucky-bags?room=${room}`, null, rich.session), 'çantalar')).rules;
    assert.deepEqual([rules.coins, rules.coinPackets, rules.giftCounts, rules.windowSeconds], [[500, 2000], [4, 8], [10, 30, 99], 60]);
    await refused(drop({ amount: 1000, packets: 4 }), 400, /500, 2\.000 jeton/);
    await refused(drop({ amount: 500, packets: 5 }), 400, /Pay sayısı 4, 8/);
    const bag = (await ok(drop({ amount: 2000, packets: 8 }), 'çanta')).bag;
    const [{ secs }] = await q('SELECT extract(epoch FROM closes_at - opens_at) AS secs FROM lucky_bags WHERE id = $1', [bag.id]);
    assert.equal(Math.round(Number(secs)), 60);
  });
});
