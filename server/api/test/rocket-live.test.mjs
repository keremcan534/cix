// Canlı Yörünge (rocket-live.mjs, rocket-live-rules.mjs) against a real Postgres: the odds at every house share, the
// climb, fuel on board and its gates, escapes by hand and automatic, an escape that comes too late, the pad, the pool
// cutting a climb, one charge per request, the house book, the live line, and a restart in the middle of a round
// (the fuel on board goes back where it came from). The rounds run fast here: a 0,8 s window and a climb of e^t.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';
import { LIVE_DRAW, RATE, autoOf, crashOf, escapeReturn, houseOf, maskName, msTo, multAt, payoutOf, poolCap, reachChance } from '../rocket-live-rules.mjs';

const SPEED = 1;
const h = startApi({ ROCKET_BET_MS: '900', ROCKET_IGNITE_MS: '100', ROCKET_PAUSE_MS: '300', ROCKET_RATE: String(SPEED) });
const { call, signUp } = h;
const q = async (sql, args = []) => (await h.sql.query(sql, args)).rows;
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const ok = async (p, what = '') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const me = async (s) => (await call('GET', '/api/me', null, s))[1].user;
const topUp = async (s, amount) => {
  for (const pack of [10000, 5000, 1000]) {
    for (; amount >= pack; amount -= pack) assert.equal((await call('POST', '/api/wallet/test-topup', { amount: pack, ref: rnd(6) }, s))[0], 200);
  }
};
/** A signed-up person past Cömertlik Lv.2 with `coins` left: tops up and spends 1000 coins in the shop. */
async function player(name, coins) {
  const p = await signUp(name);
  await topUp(p.session, coins + 1000);
  for (const [sku, price] of [['fr-silver', 800], ['en-sparkle', 200]]) assert.equal((await call('POST', '/api/shop/buy', { sku, price, ref: rnd(6) }, p.session))[0], 200);
  return p;
}
const view = (s) => ok(call('GET', '/api/casino/rocket', null, s), 'roket');
const fuel = (s, round, body, ref = rnd(8)) => call('POST', '/api/casino/rocket/bet', { round, ref, ...body }, s);
const escape = (s, round) => call('POST', '/api/casino/rocket/escape', { round }, s);
const roundRow = async (id) => (await q('SELECT * FROM rocket_rounds WHERE id = $1', [id]))[0];
const fuels = (id) => q('SELECT user_id, bet, from_game, payout, cashed, auto, house, detail FROM casino_rounds WHERE live_round = $1 ORDER BY id', [id]);
const bank = async () => {
  const [b] = await q('SELECT wagered, house, pool, paid FROM casino_bank WHERE id = 1');
  return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Number(v)]));
};

/** Waits until round `id` is in one of `states`. */
async function inState(id, states, ms = 15_000) {
  const end = Date.now() + ms;
  for (;;) {
    const r = await roundRow(id);
    if (r && states.includes(r.state)) return r;
    if (Date.now() > end) throw new Error(`round ${id}: ${r?.state}, expected ${states}`);
    await sleep(20);
  }
}
/** The next round whose window has at least 500 ms left, after round `after` (reading the screen keeps the rounds going). */
async function nextRound(s, after = 0) {
  await view(s);
  const end = Date.now() + 15_000;
  for (;;) {
    const [r] = await q("SELECT * FROM rocket_rounds WHERE id > $1 AND state = 'bet' ORDER BY id DESC LIMIT 1", [after]);
    if (r && new Date(r.bet_until).getTime() - Date.now() > 500) return Number(r.id);
    if (Date.now() > end) throw new Error('no round opened');
    await sleep(20);
  }
}
/** Round `id` will blow up at `crash` hundredths (set before it launches). */
const rig = (id, crash) => q("UPDATE rocket_rounds SET crash = $2 WHERE id = $1 AND state = 'bet'", [id, crash]);
/** Sleeps until the climb of round `id` is past `x` hundredths. */
async function climbTo(id, x) {
  const r = await inState(id, ['fly']);
  await sleep(new Date(r.launched_at).getTime() + msTo(x, SPEED) + 15 - Date.now());
}

const SETTINGS = '/api/admin/live-settings';
let admin;
async function setLive(changes) {
  admin ??= await h.account('Yönetici', 'admin');
  const [, v] = await call('GET', SETTINGS, null, admin.session);
  const [st, j] = await call('POST', SETTINGS, { changes, reason: 'Canlı Yörünge testi', baseV: v.v, confirm: true }, admin.session);
  assert.equal(st, 200, j.error);
}

describe('Canlı Yörünge kuralları', () => {
  test('her kaçış en çok kasanın bıraktığı payı geri öder; rampada patlama payı kasa payı kadar', () => {
    for (const ret of [97, 80, 40, 10]) {
      assert.equal(reachChance(100, ret), ret / 100);
      for (const x of [101, 110, 150, 200, 333, 1000, 5000, 77_777, 100_000]) {
        const r = escapeReturn(x, ret);
        assert.ok(r <= ret / 100 + 1e-12, `${ret}/${x}: ${r}`);
        assert.ok(r > ret / 100 - 0.005, `${ret}/${x}: ${r}`);
      }
    }
    // Every draw counted for 40 %: 60 % on the pad, the rest as reachChance says.
    let pad = 0;
    let two = 0;
    let top = 0;
    for (let d = 0; d < LIVE_DRAW; d++) {
      const c = crashOf(d, 40);
      if (c === 0) pad++;
      else assert.ok(c >= 100 && c <= 100_000);
      if (c >= 200) two++;
      if (c === 100_000) top++;
    }
    assert.equal(pad, LIVE_DRAW * 0.6);
    assert.equal(two / LIVE_DRAW, reachChance(200, 40));
    assert.equal(top / LIVE_DRAW, reachChance(100_000, 40));
  });

  test('tırmanış: çarpan, zaman ve ödeme aynı eğriden', () => {
    assert.equal(multAt(0), 100);
    for (const rate of [RATE, 1]) {
      for (const x of [101, 150, 200, 215, 1000, 100_000]) {
        const t = msTo(x, rate);
        assert.ok(multAt(t, rate) >= x && multAt(t - 1, rate) < x, `${rate}/${x}`);
      }
    }
    // 2× in about 9,2 s, 10× in about 31 s at the screen's speed.
    assert.ok(Math.abs(msTo(200) - 9242) < 3);
    assert.ok(Math.abs(msTo(1000) - 30_701) < 3);
    assert.equal(payoutOf(1000, 215), 2150);
    assert.equal(payoutOf(250, 133), 332);
    assert.equal(houseOf(250, 60), 150);
    assert.equal(poolCap(2400, 1000), 240);
    assert.deepEqual([maskName('Ali'), maskName('Berkay'), maskName(' '), maskName('Şükrü')], ['A**', 'Ber**', 'Oyuncu', 'Şük**']);
    assert.deepEqual([autoOf(null), autoOf(2), autoOf(2.15), autoOf(1000)], [null, 200, 215, 100_000]);
    for (const bad of [1, 1.005, 0.5, 1000.01, '2', NaN]) assert.equal(autoOf(bad), undefined, String(bad));
  });
});

describe('Canlı Yörünge', () => {
  let a;
  let b;
  before(async () => {
    a = await player('Ali', 20_000);
    b = await player('Berkay', 20_000);
    await q('INSERT INTO casino_bank (id, pool, seed) VALUES (1, 2000000, 2000000) ON CONFLICT DO NOTHING');
  });
  after(() => q('UPDATE casino_bank SET pool = greatest(pool, 2000000) WHERE id = 1'));

  test('yakıt biner, elle kaçış o anın çarpanını öder, otomatik kaçış hedefinde; kasa defteri tutar', async () => {
    const id = await nextRound(a.session);
    await rig(id, 300);
    const book = await bank();
    const coins = (await me(a.session)).coins;
    const j = await ok(fuel(a.session, id, { bet: 1000 }), 'yakıt');
    assert.equal(j.round, id);
    assert.deepEqual([j.mine.fuel, j.mine.onBoard, j.mine.auto, j.mine.cashed], [1000, 1000, null, null]);
    assert.equal(j.user.coins, coins - 1000);
    await ok(fuel(b.session, id, { bet: 250, auto: 1.5 }), 'otomatik');
    // Everyone sees the fuel with masked names, never the crash point before the crash.
    const v = await view(b.session);
    assert.equal(v.round.id, id);
    assert.equal(v.round.phase, 'bet');
    assert.equal(v.round.crash, null);
    assert.deepEqual([v.round.players, v.round.fuel], [2, 1250]);
    assert.deepEqual(
      v.players.map((p) => [p.n, p.b, p.a]),
      [
        ['A**', 1000, null],
        ['Ber**', 250, 150],
      ],
    );
    assert.equal(v.mine.auto, 150);
    assert.equal(v.rate, SPEED);
    // No escape before the launch.
    const [st0, e0] = await escape(a.session, id);
    assert.equal(st0, 409);
    assert.match(e0.error, /kalkmadı/);

    await climbTo(id, 200);
    const [st, e] = await escape(a.session, id);
    assert.equal(st, 200, e.error);
    assert.ok(e.x >= 200 && e.x < 300, String(e.x));
    assert.equal(e.payout, payoutOf(1000, e.x));
    assert.equal(e.user.gameCoins, e.payout);
    assert.equal(e.mine.cashed, e.x);
    const [st2, e2] = await escape(a.session, id);
    assert.equal(st2, 409);
    assert.match(e2.error, /Zaten/);

    const r = await inState(id, ['done']);
    const rows = await fuels(id);
    assert.deepEqual(
      rows.map((x) => [Number(x.bet), Number(x.cashed), Number(x.payout), Number(x.house)]),
      [
        [1000, e.x, e.payout, 600],
        [250, 150, 375, 150],
      ],
    );
    assert.match(rows[1].detail, /1,50× otomatik kaçış/);
    assert.deepEqual([Number(r.total_bet), Number(r.house), Number(r.reserve), Number(r.paid)], [1250, 750, 3750, e.payout + 375]);
    const now = await bank();
    assert.deepEqual(now, { wagered: book.wagered + 1250, house: book.house + 750, pool: book.pool + 500 - e.payout - 375, paid: book.paid + e.payout + 375 });
    // Oyun Merkezi's history shows the fuel as a round; the next screen shows the crash point first.
    const casino = await ok(call('GET', '/api/casino', null, a.session));
    assert.equal(casino.rocketLive, true);
    assert.match(casino.mine[0].detail, new RegExp(`Canlı tur #${id}`));
    await sleep(50);
    const after = await view(a.session);
    assert.equal(after.history[0], 300);
  });

  test('geç kalan kaçış yanar; ulaşılmayan otomatik hedef yanar', async () => {
    const id = await nextRound(a.session);
    await rig(id, 120);
    await ok(fuel(a.session, id, { bet: 500, auto: 5 }));
    await ok(fuel(b.session, id, { bet: 250 }));
    await climbTo(id, 125);
    const [st, e] = await escape(b.session, id);
    assert.equal(st, 409);
    assert.match(e.error, /1,20×'te patladı/);
    await inState(id, ['done']);
    const rows = await fuels(id);
    assert.deepEqual(
      rows.map((x) => [Number(x.cashed), Number(x.payout)]),
      [
        [0, 0],
        [0, 0],
      ],
    );
    assert.match(rows[0].detail, /1,20×'te patladı/);
    const v = await view(a.session);
    assert.equal(v.round.id >= id, true);
    assert.equal(v.history[0], 120);
  });

  test('rampada patlama: bütün yakıt kalkışta yanar, geçmişte 1,00×', async () => {
    const id = await nextRound(a.session);
    await rig(id, 0);
    await ok(fuel(a.session, id, { bet: 250 }));
    const r = await inState(id, ['done']);
    assert.equal(Number(r.reserve), 0);
    assert.deepEqual((await fuels(id)).map((x) => [Number(x.cashed), Number(x.payout)]), [[0, 0]]);
    await sleep(200);
    const [st, e] = await escape(a.session, id);
    assert.equal(st, 409, JSON.stringify(e));
    const v = await view(a.session);
    assert.equal(v.history[0], 100);
  });

  test('havuz yetmezse yakıt alınmaz; yetmediği yerde tırmanış kesilir', async () => {
    await q('UPDATE casino_bank SET pool = 1000 WHERE id = 1');
    let id = await nextRound(a.session);
    const [st, e] = await fuel(a.session, id, { bet: 1000 });
    assert.equal(st, 409);
    assert.match(e.error, /Ödül havuzu/);
    await q('UPDATE casino_bank SET pool = 2000 WHERE id = 1');
    id = await nextRound(a.session, id);
    await rig(id, 1000);
    await ok(fuel(a.session, id, { bet: 1000, auto: 3 }));
    const r = await inState(id, ['done']);
    // 2000 in the pool and 400 of the stake: 2,40× of 1000 coins at most.
    assert.equal(r.cut, 240);
    assert.equal(Number(r.reserve), 2400);
    assert.deepEqual((await fuels(id)).map((x) => [Number(x.cashed), Number(x.payout)]), [[0, 0]]);
    assert.equal((await bank()).pool, 2400);
    assert.equal((await view(a.session)).history[0], 240);
    await q('UPDATE casino_bank SET pool = 2000000 WHERE id = 1');
  });

  test('kurallar: tur, basamak, otomatik kaçış, tur başına sınır, bakiye, kapanan pencere, Cömertlik, kapalı oyun', async () => {
    let id = await nextRound(a.session);
    const refused = async (p, code, re) => {
      const [st, j] = await p;
      assert.equal(st, code, JSON.stringify(j));
      assert.match(j.error, re);
    };
    await refused(fuel(a.session, id + 1, { bet: 250 }), 409, /tur kapandı/);
    await refused(fuel(a.session, id, { bet: 300 }), 400, /bahis/);
    for (const auto of [1, 1.005, 2000, '2']) await refused(fuel(a.session, id, { bet: 250, auto }), 400, /Otomatik kaçış/);
    await refused(escape(a.session, id), 409, /kalkmadı/);
    await ok(fuel(a.session, id, { bet: 250, auto: 2 }));
    await refused(fuel(a.session, id, { bet: 250 }), 409, /ilk yakıtla/);
    await ok(fuel(a.session, id, { bet: 250, auto: 2 }));
    await refused(escape(b.session, id), 409, /kalkmadı/);
    await inState(id, ['fly', 'done']);
    await refused(fuel(a.session, id, { bet: 250, auto: 2 }), 409, /kapandı/);
    // Without fuel on board there is nothing to escape with.
    const r = await roundRow(id);
    if (r.state === 'fly' && Date.now() > new Date(r.launched_at).getTime()) await refused(escape(b.session, id), 409, /yakıtın yok|patladı/);

    await setLive({ casino_max_bet: 1000 });
    id = await nextRound(a.session, id);
    await ok(fuel(a.session, id, { bet: 1000 }));
    await refused(fuel(a.session, id, { bet: 250 }), 409, /en çok 1\.000 jeton/);
    await setLive({ casino_max_bet: null });

    const poor = await player('Cimri', 0);
    id = await nextRound(a.session, id);
    await refused(fuel(poor.session, id, { bet: 250 }), 409, /Yetersiz/);
    const fresh = await signUp('Yeni');
    await topUp(fresh.session, 1000);
    await refused(fuel(fresh.session, id, { bet: 250 }), 403, /Cömertlik/);
    assert.equal((await me(fresh.session)).coins, 1000);

    await setLive({ casino_off: ['rocket'] });
    await refused(fuel(a.session, id, { bet: 250 }), 409, /kapalı/);
    assert.equal((await view(a.session)).game.active, false);
    await setLive({ casino_off: null });
    assert.equal((await view(a.session)).game.active, true);
  });

  test('aynı istek iki kez: bir kez düşer', async () => {
    const id = await nextRound(a.session);
    const purse = (u) => u.coins + u.gameCoins;
    const coins = purse(await me(b.session));
    const ref = rnd(8);
    const [x, y] = await Promise.all([fuel(b.session, id, { bet: 500 }, ref), fuel(b.session, id, { bet: 500 }, ref)]);
    assert.deepEqual([x[0], y[0]], [200, 200]);
    assert.deepEqual([x[1].replay, y[1].replay].sort(), [false, true]);
    const z = await ok(fuel(b.session, id, { bet: 500 }, ref));
    assert.equal(z.replay, true);
    assert.equal(purse(await me(b.session)), coins - 500);
    assert.equal((await fuels(id)).length, 1);
  });

  test('kasa payı canlı ayardan: yeni tur o payla açılır', async () => {
    await setLive({ rocket_house_pct: 20 });
    let id = await nextRound(a.session);
    // The round that was open when it changed keeps its share; the next one opens with 20 %.
    if ((await roundRow(id)).house_pct !== 20) id = await nextRound(a.session, id);
    assert.equal((await roundRow(id)).house_pct, 20);
    assert.equal((await view(a.session)).round.ret, 80);
    await rig(id, 0);
    await ok(fuel(a.session, id, { bet: 1000 }));
    await inState(id, ['done']);
    assert.equal(Number((await fuels(id))[0].house), 200);
    await setLive({ rocket_house_pct: null });
  });

  test('canlı hat: ekran açıkken tur olayları gelir, çarpan patlamadan önce yazılmaz; rocket=1 istemeyen hat almaz', async () => {
    const events = [];
    const plain = [];
    const ctl = new AbortController();
    const read = async (path, into) => {
      const res = await fetch(`${h.base}${path}`, { headers: { authorization: `Bearer ${b.session}` }, signal: ctl.signal });
      const dec = new TextDecoder();
      let raw = '';
      try {
        for await (const chunk of res.body) {
          raw += dec.decode(chunk, { stream: true });
          for (let i = raw.indexOf('\n\n'); i >= 0; i = raw.indexOf('\n\n')) {
            const block = raw.slice(0, i);
            raw = raw.slice(i + 2);
            for (const l of block.split('\n')) if (l.startsWith('data: ')) into.push(JSON.parse(l.slice(6)));
          }
        }
      } catch {
        // closed
      }
    };
    void read('/api/live?wins=1&rocket=1', events);
    void read('/api/live', plain);
    const id = await nextRound(b.session);
    await rig(id, 150);
    await ok(fuel(a.session, id, { bet: 250 }));
    await inState(id, ['done']);
    await sleep(400);
    ctl.abort();
    const rounds = events.filter((e) => e.type === 'rocket').map((e) => JSON.parse(e.round));
    const mine = rounds.filter((r) => r.round?.id === id);
    assert.ok(mine.some((r) => r.round.phase === 'bet' && r.players.some((p) => p.n === 'A**' && p.b === 250)), 'yakıt görüldü');
    assert.ok(mine.some((r) => r.round.phase === 'done' && r.round.crash === 150), 'patlama görüldü');
    for (const r of mine) if (r.round.phase !== 'done') assert.equal(r.round.crash, null);
    assert.equal(
      plain.filter((e) => e.type === 'rocket').length,
      0,
    );
  });

  test('yeniden başlatma: kalkmamış turun bütün yakıtı, havadakinin kaçmamış yakıtı geri döner', async () => {
    // Before launch: everything back.
    let id = await nextRound(a.session);
    const before = await me(a.session);
    await ok(fuel(a.session, id, { bet: 1000 }));
    await h.restart();
    let r = await roundRow(id);
    assert.equal(r.state, 'void');
    assert.equal((await fuels(id)).length, 0);
    const back = await me(a.session);
    assert.deepEqual([back.coins, back.gameCoins], [before.coins, before.gameCoins]);

    // In the air: the escape already paid stays; game coins and coins go back where they came from.
    await h.credit(b.user.id, 600, { currency: 'game' });
    const c = await player('Cem', 5000);
    id = await nextRound(a.session, id);
    await rig(id, 100_000);
    const a0 = await me(a.session);
    const b0 = await me(b.session);
    await ok(fuel(a.session, id, { bet: 1000 }));
    await ok(fuel(b.session, id, { bet: 1000 }));
    await ok(fuel(c.session, id, { bet: 500 }));
    const rows = await fuels(id);
    assert.deepEqual(
      rows.map((x) => Number(x.from_game)),
      [Math.min(1000, a0.gameCoins), Math.min(1000, b0.gameCoins), 0],
    );
    assert.ok(b0.gameCoins >= 600);
    await climbTo(id, 130);
    const e = await ok(escape(c.session, id), 'kaçış');
    const book = await bank();
    const flying = await roundRow(id);
    await h.restart();
    r = await roundRow(id);
    assert.equal(r.state, 'void');
    assert.equal(Number(r.paid), e.payout);
    assert.deepEqual(
      (await fuels(id)).map((x) => [Number(x.bet), Number(x.cashed)]),
      [[500, e.x]],
    );
    const [a1, b1] = [await me(a.session), await me(b.session)];
    assert.deepEqual([a1.coins, a1.gameCoins], [a0.coins, a0.gameCoins]);
    assert.deepEqual([b1.coins, b1.gameCoins], [b0.coins, b0.gameCoins]);
    // The book forgets the fuel given back; the reserve less the escape goes back to the pool.
    const now = await bank();
    assert.deepEqual(now, {
      wagered: book.wagered - 2000,
      house: book.house - 1200,
      pool: book.pool + Number(flying.reserve) - e.payout - (2000 - 1200),
      paid: book.paid + e.payout,
    });
    // The rounds start again for whoever opens the screen.
    const next = await nextRound(a.session, id);
    assert.ok(next > id);
  });
});
