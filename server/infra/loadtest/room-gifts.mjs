// Load test, one busy room's gifts (docs/YUK_TESTI.md): N senders each send K paid gifts to N different people in one
// server room, all at the same moment, R times. Prints the wall time of each round, the gifts' latency and errors.
// It measures how much of a gift runs one at a time in a room (the rooms row Patron koltuğu takes, the rocket's row,
// and before Güncelleme 7's review the room owner's account row, which halved this). Test servers only: it needs
// device sign-in (ALLOW_DEV_AUTH=1) and test coins (ALLOW_TEST_TOPUP=1, TEST_TOPUP_DAILY high enough), and every
// sender is a real account with real ledger rows. A URL other than this machine also needs --yes. Rate limits
// (RATE_ALL, RATE_AUTH) must be high: every request comes from this one address.
//
//   node room-gifts.mjs --base http://127.0.0.1:7890 [--senders 30] [--gifts 15] [--rounds 3] [--yes]
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(' ')
    .split(/\s*--/)
    .filter(Boolean)
    .map((a) => {
      const [k, ...v] = a.split(/\s+/);
      return [k, v.join(' ') || true];
    }),
);
const BASE = String(args.base ?? 'http://127.0.0.1:7890').replace(/\/+$/, '');
const SENDERS = Number(args.senders ?? 30);
const GIFTS = Number(args.gifts ?? 15);
const ROUNDS = Number(args.rounds ?? 3);
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE) && args.yes !== true) {
  console.error('Bu adres bu makine değil: canlı ya da paylaşılan bir sunucuya yük vermek için --yes ekle.');
  process.exit(2);
}

const rnd = (n = 16) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
async function call(method, path, session, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  return [r.status, await r.json().catch(() => ({}))];
}
async function person(name) {
  const [st, j] = await call('POST', '/api/auth/dev', null, { deviceKey: rnd(40), name });
  if (st !== 200) throw new Error(`giriş ${st}: ${j.error}`);
  return { id: j.user.id, session: j.session };
}
const pct = (list, p) => (list.length ? list[Math.min(list.length - 1, Math.floor((list.length * p) / 100))] : 0);

const owner = await person('Oda Sahibi');
const [rs, rj] = await call('POST', '/api/rooms', owner.session, { title: `Hediye yükü ${rnd(4)}` });
if (rs !== 200) throw new Error(`oda ${rs}: ${rj.error}`);
const room = rj.room.id;
const [, cat] = await call('GET', '/api/catalog?gifts=2', null);
const gift = (cat.gifts ?? []).find((g) => !g.minSvip && g.price <= 3000 && !g.global && !g.id.startsWith('bag-'));
if (!gift) throw new Error('gönderilecek hediye yok');
const senders = [];
const recipients = [];
// Coins for every round (test top-ups of at most 100.000 at a time).
const tops = Math.ceil((GIFTS * ROUNDS * gift.price) / 100_000);
for (let i = 0; i < SENDERS; i++) {
  const s = await person(`Gönderen ${i}`);
  for (let t = 0; t < tops; t++) {
    const [ts, tj] = await call('POST', '/api/wallet/test-topup', s.session, { amount: 100_000, ref: `lt-${rnd()}` });
    if (ts !== 200) throw new Error(`jeton ${ts}: ${tj.error}`);
  }
  senders.push(s);
  recipients.push(await person(`Alan ${i}`));
}
console.log(`Bir oda, ${SENDERS} gönderen × ${GIFTS} hediye (${gift.name}, ${gift.price} jeton), her biri başka birine; ${ROUNDS} tur`);
for (let round = 1; round <= ROUNDS; round++) {
  const lat = [];
  const bad = new Map();
  const t0 = performance.now();
  await Promise.all(
    senders.map(async (s, i) => {
      for (let k = 0; k < GIFTS; k++) {
        const a = performance.now();
        const [st] = await call('POST', '/api/gifts/send', s.session, { to: recipients[i].id, giftId: gift.id, count: 1, price: gift.price, room, ref: `lt-${rnd()}` }).catch(() => [-1]);
        lat.push(performance.now() - a);
        if (st !== 200) bad.set(st, (bad.get(st) ?? 0) + 1);
      }
    }),
  );
  const ms = performance.now() - t0;
  lat.sort((x, y) => x - y);
  const errors = [...bad].map(([st, n]) => `${st}: ${n}`).join(', ');
  console.log(
    `tur ${round}: ${lat.length} hediye ${ms.toFixed(0)} ms'de (saniyede ${((lat.length / ms) * 1000).toFixed(0)}); gecikme p50 ${pct(lat, 50).toFixed(0)} ms, p95 ${pct(lat, 95).toFixed(0)} ms; hata ${errors || 0}`,
  );
}
