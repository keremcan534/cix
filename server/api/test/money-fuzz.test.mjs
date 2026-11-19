// Many people moving money at once, in random order (docs/PARA_DENETIMI.md): top-ups, purchases, gifts, Çevir,
// bonds (requests, answers, bond gifts again, ends), Şanslı çanta, Şanslı hediye (a stale sheet's price and version too), paid messages waiting for the streamer's answer (answers, quick replies, time running out), the shop, Oyun Salonu (Canlı Yörünge's fuel and escapes too), Jeton Noktası sales and diamond
// sales, store refunds, with some
// requests sent twice at the same moment. Whatever the order, no request may fail with a server error, and the
// harness's money checks after this file (money-check.mjs) must find every coin and diamond where the ledger says.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

// Locks of 0 days: gifted diamonds can leave at once, so Çevir and diamond sales run on them too.
// Canlı Yörünge's rounds run fast: a 0,4 s window and a climb of e^(3t).
const h = startApi({ BOND_SWEEP_MS: '200', BAG_SWEEP_MS: '200', HOLD_SWEEP_MS: '200', AUTO_CHAT_SWEEP_MS: '0', LOCK_DAYS_STORE: '0', LOCK_DAYS_JETON: '0', TEST_TOPUP_DAILY: '100000000', AGENCY_JOBS: '0', ROCKET_BET_MS: '400', ROCKET_IGNITE_MS: '0', ROCKET_PAUSE_MS: '100', ROCKET_RATE: '3' });
const { call, signUp } = h;
const q = async (sql, args) => (await h.sql.query(sql, args)).rows;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};

// A seeded random, so a failing run can be replayed with the same MONEY_FUZZ_SEED.
let seed = Number(process.env.MONEY_FUZZ_SEED ?? Date.now() % 100000);
const random = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const pick = (list) => list[Math.floor(random() * list.length)];
const OPS = Number(process.env.MONEY_FUZZ_OPS ?? 500);

describe('Para: aynı anda rastgele işlemler', () => {
  test(`${OPS} işlem, 8'er 8'er aynı anda: hiçbiri sunucu hatası vermez, para yerinde kalır`, async () => {
    const startSeed = seed;
    const admin = await signUp('Yönetici');
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
    const people = await Promise.all(Array.from({ length: 10 }, (_, i) => signUp(`Kişi ${i}`)));
    // Women's accounts: they may sell diamonds (streamer-rule.mjs). Half of them are older than the days to pick an
    // agency, so streamers the centre holds: a message from the others to them is paid and waits for an answer.
    await h.sql.query("UPDATE users SET gender = 'Kadın' WHERE id = ANY($1::uuid[])", [people.map((x) => x.user.id)]);
    await h.sql.query("UPDATE users SET created_at = now() - interval '4 days' WHERE id = ANY($1::uuid[])", [people.slice(0, 5).map((x) => x.user.id)]);
    const bank = await signUp('Jeton Noktası');
    await ok(call('POST', '/api/admin/jeton/bank', { user: bank.user.id, enabled: true }, admin.session), 'banka');
    await ok(call('POST', '/api/admin/jeton/wholesale', { bank: bank.user.id, coins: 500_000, paymentRef: 'DEKONT-1', ref: rnd(6) }, admin.session), 'toptan');
    for (const p of people) await ok(call('POST', '/api/wallet/test-topup', { amount: 10000, ref: rnd(6) }, p.session), 'yükleme');
    const room = (await ok(call('POST', '/api/rooms', { title: `Para ${rnd(2)}` }, people[0].session), 'oda')).room.id;
    // The shelf's gifts anyone may send (most are paused or for VIPs): Roket 1.999, and the like.
    const gifts = (await ok(call('GET', '/api/catalog?gifts=2'), 'katalog')).gifts.filter((g) => !g.minSvip && g.price <= 3000);
    assert.ok(gifts.length >= 1);
    const shop = [['fr-neon', 150], ['en-sparkle', 200], ['fr-silver', 800]];
    const other = (u) => {
      for (;;) {
        const x = pick(people);
        if (x !== u) return x;
      }
    };
    // Şanslı hediye is for adults (lucky.mjs); Cömertlik Lv.2 comes with what they spend here.
    await h.sql.query("UPDATE users SET birth_date = '1990-01-01' WHERE id = ANY($1::uuid[])", [people.map((x) => x.user.id)]);
    /** What Şanslı sheets showed (GET /api/lucky): its version and the packages' prices; an older one is a sheet left open. */
    const luckySeen = [];
    const bondIds = async () => (await q("SELECT id FROM bonds WHERE status = 'pending'")).map((r) => Number(r.id));
    // Bond gifts again (bonds.mjs): an ordinary gift between two who have that bond, at the price the shelf shows.
    const bondPrice = Object.fromEntries((await ok(call('GET', '/api/catalog?gifts=2&family=1'), 'katalog')).gifts.filter((g) => g.id.startsWith('bag-')).map((g) => [g.id, g.price]));
    const activeBond = async () => (await q("SELECT id, a, b, kind FROM bonds WHERE status = 'active' ORDER BY random() LIMIT 1"))[0];
    const personOf = (id) => people.find((p) => p.user.id === id);
    const bagIds = async () => (await q("SELECT id FROM lucky_bags WHERE status = 'open'")).map((r) => Number(r.id));

    /** One random request: [label, method, path, body, session], built when it runs. */
    const MIX = [
      [8, async (u) => ['yükleme', 'POST', '/api/wallet/test-topup', { amount: pick([1000, 5000]), ref: rnd(6) }, u.session]],
      [6, async (u) => ['satın alma', 'POST', '/api/wallet/purchase', { platform: 'test', productId: pick(['coins_1000', 'coins_5000']), transactionId: rnd(8) }, u.session]],
      [16, async (u) => {
        const g = pick(gifts);
        // Half in the room: its owner's room XP is a third account the gift locks (send-locks.mjs).
        const where = random() < 0.5 ? { room } : { place: pick(['profile', 'chat']) };
        return ['hediye', 'POST', '/api/gifts/send', { to: other(u).user.id, giftId: g.id, count: 1, price: g.price, ...where, ref: rnd(6) }, u.session];
      }],
      [6, async (u) => ['test hediyesi', 'POST', '/api/wallet/gift', { to: other(u).user.id, amount: 1 + Math.floor(random() * 500), ref: rnd(6) }, u.session]],
      [8, async (u) => ['çevir', 'POST', '/api/wallet/exchange', { diamonds: pick([100, 500, 1000]), ref: rnd(6) }, u.session]],
      [5, async (u) => ['bağ isteği', 'POST', '/api/bonds/request', { to: other(u).user.id, kind: pick(['kardes', 'kanka']), ref: rnd(6) }, u.session]],
      [5, async (u) => {
        const id = pick(await bondIds());
        return id ? ['bağ cevabı', 'POST', '/api/bonds/respond', { id, accept: random() < 0.6 }, u.session] : null;
      }],
      [3, async (u) => {
        const id = pick(await bondIds());
        return id ? ['bağ geri alma', 'POST', '/api/bonds/withdraw', { id }, u.session] : null;
      }],
      // Either side of an active bond sends its bond gift again (sometimes the wrong kind, refused); now and then one
      // ends it, racing the gifts.
      [5, async () => {
        const x = await activeBond();
        if (!x) return null;
        const [from, to] = random() < 0.5 ? [x.a, x.b] : [x.b, x.a];
        const giftId = random() < 0.9 ? `bag-${x.kind}` : x.kind === 'kanka' ? 'bag-kardes' : 'bag-kanka';
        return ['bağ hediyesi', 'POST', '/api/gifts/send', { to, giftId, count: pick([1, 5, 10]), price: bondPrice[giftId], ref: rnd(6) }, personOf(from).session];
      }],
      [1, async () => {
        const x = await activeBond();
        return x ? ['bağ bitirme', 'POST', '/api/bonds/end', { id: Number(x.id) }, personOf(random() < 0.5 ? x.a : x.b).session] : null;
      }],
      [4, async (u) => ['çanta', 'POST', '/api/lucky-bags', { room, kind: 'coins', amount: 1000, packets: 5, followersOnly: false, delay: 0, ref: rnd(6) }, u.session]],
      [6, async (u) => {
        const id = pick(await bagIds());
        return id ? ['çanta kapma', 'POST', '/api/lucky-bags/grab', { id }, u.session] : null;
      }],
      // A message: paid (and held) from someone who isn't a streamer to one who is; from a streamer, an answer that
      // settles what waits for her. A quick reply (only a streamer's, only to someone who wrote: else refused).
      [8, async (u) => ['mesaj', 'POST', '/api/messages', { to: other(u).user.id, text: pick(['Selam', 'Merhaba, nasılsın?', '.']), ref: rnd(6) }, u.session]],
      [2, async (u) => ['hazır cevap', 'POST', '/api/messages', { to: other(u).user.id, quick: 1, ref: rnd(6) }, u.session]],
      // A held message's time runs out now: the sweep gives its coins back, or pays an answer that came in time.
      [2, async () => {
        await q("UPDATE message_holds SET deadline_at = now() - interval '1 minute' WHERE message_id = (SELECT message_id FROM message_holds WHERE status = 'pending' ORDER BY random() LIMIT 1)");
        return null;
      }],
      [6, async (u) => {
        const [sku, price] = pick(shop);
        return ['mağaza', 'POST', '/api/shop/buy', { sku, price, ref: rnd(6) }, u.session];
      }],
      [6, async (u) => ['oyun', 'POST', '/api/casino/play', { game: 'jackpot', bet: 250, ref: rnd(8) }, u.session]],
      // Şanslı hediye at what a sheet showed (price and settings' version), now and then a stale one while the admin
      // re-prices a package: refused (409) with nothing moved, never a server error (Güncelleme 7 madde 10).
      [5, async (u) => {
        const [, cur] = await call('GET', '/api/lucky', null, u.session);
        if (cur?.version) luckySeen.push({ version: cur.version, price: Object.fromEntries(cur.gifts.map((g) => [g.id, g.price])) });
        const view = random() < 0.3 ? pick(luckySeen) : luckySeen[luckySeen.length - 1];
        const giftId = pick(['lk1', 'lk2']);
        return view ? ['şanslı', 'POST', '/api/lucky/send', { giftId, to: [other(u).user.id], count: pick([1, 10]), room, price: view.price[giftId], version: view.version, ref: rnd(8) }, u.session] : null;
      }],
      [1, async () => {
        const [, cur] = await call('GET', '/api/admin/lucky', null, admin.session);
        const config = structuredClone(cur.config);
        const g = config.gifts.find((x) => x.id === 'lk2');
        g.price = g.price === 100 ? 120 : 100;
        return ['şanslı ayarı', 'POST', '/api/admin/lucky/config', { config, version: cur.version }, admin.session];
      }],
      // Canlı Yörünge: fuel into the open round, an escape from the one in the air (the screen's read finds the round).
      [4, async (u) => {
        const round = (await call('GET', '/api/casino/rocket', null, u.session))[1]?.round?.id;
        return round ? ['roket yakıtı', 'POST', '/api/casino/rocket/bet', { round, bet: pick([250, 500]), ...(random() < 0.5 && { auto: pick([1.2, 1.5, 2]) }), ref: rnd(8) }, u.session] : null;
      }],
      [3, async () => {
        const [f] = await q("SELECT c.user_id, c.live_round FROM casino_rounds c JOIN rocket_rounds r ON r.id = c.live_round WHERE r.state = 'fly' AND c.cashed IS NULL ORDER BY random() LIMIT 1");
        const u = f && people.find((x) => x.user.id === f.user_id);
        return u ? ['roket kaçışı', 'POST', '/api/casino/rocket/escape', { round: Number(f.live_round) }, u.session] : null;
      }],
      [4, async (u) => ['jeton noktası satışı', 'POST', '/api/jeton/transfer', { to: u.user.id, coins: pick([500, 1500]), paymentRef: 'HAVALE-1', ref: rnd(6) }, bank.session]],
      [4, async (u) => ['elmas bozdurma', 'POST', '/api/jeton/sell-diamonds', { bank: bank.user.id, diamonds: pick([500, 1000]), ref: rnd(6) }, u.session]],
      [3, async () => {
        const p = pick(await q("SELECT id FROM purchases WHERE status <> 'refunded'"));
        return p ? ['iade', 'POST', '/api/admin/purchases/refund', { purchase: Number(p.id) }, admin.session] : null;
      }],
    ];
    const WEIGHT = MIX.reduce((s, [w]) => s + w, 0);
    const choose = () => {
      let r = random() * WEIGHT;
      for (const [w, fn] of MIX) if ((r -= w) <= 0) return fn;
      return MIX[0][1];
    };

    const seen = new Map();
    const failures = [];
    const note = (label, st, j) => {
      const k = `${label} ${st}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
      if (st >= 500 || st === 0) failures.push(`${label}: ${st} ${j?.error ?? ''}`);
    };
    const send = async (req) => {
      const [label, method, path, body, session] = req;
      try {
        const [st, j] = await call(method, path, body, session);
        note(label, st, j);
      } catch (e) {
        note(label, 0, { error: e.message });
      }
    };
    let left = OPS;
    const worker = async () => {
      while (left-- > 0) {
        const req = await choose()(pick(people));
        if (!req) continue;
        // One in ten goes out twice at the same moment, as a double tap or a retry does.
        if (random() < 0.1) await Promise.all([send(req), send(req)]);
        else await send(req);
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));

    // What is still waiting ends now: bags draw, bonds run out, and the sweeps settle them.
    await q("UPDATE lucky_bags SET closes_at = now() - interval '1 second' WHERE status = 'open'");
    await q("UPDATE bonds SET expires_at = now() - interval '1 second' WHERE status = 'pending'");
    await q("UPDATE message_holds SET deadline_at = now() - interval '1 minute' WHERE status = 'pending'");
    for (let i = 0; i < 50; i++) {
      const [w] = await q(
        "SELECT (SELECT count(*) FROM lucky_bags WHERE status = 'open') + (SELECT count(*) FROM bonds WHERE status = 'pending') + (SELECT count(*) FROM message_holds WHERE status = 'pending') + (SELECT count(*) FROM rocket_rounds WHERE state IN ('fly', 'settling')) AS n",
      );
      if (Number(w.n) === 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const summary = [...seen].sort().map(([k, n]) => `${k}: ${n}`).join(', ');
    assert.deepEqual(failures, [], `tohum ${startSeed}; ${summary}`);
    const [open] = await q("SELECT (SELECT count(*) FROM lucky_bags WHERE status = 'open') AS bags, (SELECT count(*) FROM bonds WHERE status = 'pending') AS bonds");
    assert.deepEqual([Number(open.bags), Number(open.bonds)], [0, 0], 'bekleyen çanta ve bağ kalmadı');
    // Enough of each kind actually went through for the run to mean something.
    for (const label of ['hediye', 'çevir', 'mağaza', 'oyun', 'satın alma', 'mesaj']) assert.ok((seen.get(`${label} 200`) ?? 0) > 0, `${label} hiç geçmedi (${summary})`);
    console.log(`para karıştırma: tohum ${startSeed}; ${summary}`);
  });
});
