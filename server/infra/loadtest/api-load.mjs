// Load test, API side (docs/YUK_TESTI.md): virtual users drive the API in growing stages and each stage prints
// latency, errors and (on the same machine) the CPU of the API process and of Postgres. Test servers only: it needs
// device sign-in (ALLOW_DEV_AUTH=1) and test coins (ALLOW_TEST_TOPUP=1), and every virtual user is a real account
// with real ledger rows. A URL other than this machine also needs --yes.
//
//   node api-load.mjs --base http://127.0.0.1:7890 --stages 100,250,500,1000 --seconds 60 [--think 2500]
//                     [--rooms 20] [--burst 200] [--api-pid <pid>] [--yes]
//
// Each virtual user holds the live line the app keeps open (GET /api/live) and, every `think` ms on average, makes
// one of the app's common requests: the room list, who is in the rooms, my profile, settings, the catalog, a gift
// (at the server's price: a money write), the rankings, the inbox, a voice token. That is a very busy user: a phone
// sitting in a room makes a couple of requests a minute (live-room.tsx reads the room every 60 s). Stages grow in
// order; the first 5 s of each (users joining) are not measured. --burst N: after each stage, N users re-read one
// room at the same moment, as every phone in a room does when the server announces a change (announceRoom: a level
// up, a layout, an event, music).
import fs from 'node:fs';

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
const STAGES = String(args.stages ?? '100,250,500').split(',').map(Number);
const SECONDS = Number(args.seconds ?? 60);
const THINK = Number(args.think ?? 2500);
const ROOMS = Number(args.rooms ?? 20);
const BURST = Number(args.burst ?? 0);
const API_PID = args['api-pid'] ? Number(args['api-pid']) : null;
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE) && args.yes !== true) {
  console.error('Bu adres bu makine değil: canlı ya da paylaşılan bir sunucuya yük vermek için --yes ekle.');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (n = 32) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Every request: [ms since start, label, status, latency ms]. */
const log = [];
const t0 = performance.now();
async function call(label, method, path, session, body) {
  const s = performance.now();
  let status = 0;
  try {
    const r = await fetch(BASE + path, {
      method,
      headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    status = r.status;
    const j = await r.json().catch(() => ({}));
    log.push([s - t0, label, status, performance.now() - s]);
    return j;
  } catch {
    log.push([s - t0, label, status || -1, performance.now() - s]);
    return {};
  }
}

// --- CPU (same machine only): the API process and every postgres process ------------------------------------------
const TICK = 100;
const ticksOf = (pid) => {
  try {
    const f = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
    return Number(f[11]) + Number(f[12]);
  } catch {
    return 0;
  }
};
const postgresTicks = () => {
  let sum = 0;
  for (const d of fs.existsSync('/proc') ? fs.readdirSync('/proc') : []) {
    if (!/^\d+$/.test(d)) continue;
    try {
      if (fs.readFileSync(`/proc/${d}/comm`, 'utf8').trim() === 'postgres') sum += ticksOf(d);
    } catch {}
  }
  return sum;
};
const cpuNow = () => ({ at: performance.now(), api: API_PID ? ticksOf(API_PID) : 0, pg: postgresTicks() });

// --- Users ---------------------------------------------------------------------------------------------------------
const users = [];
async function newUser(i) {
  const s = await call('giriş', 'POST', '/api/auth/dev', null, { deviceKey: rnd(40), name: `Yük ${i}` });
  if (!s.session) return null;
  const u = { id: s.user.id, session: s.session, stop: false, line: null };
  await call('jeton yükle', 'POST', '/api/wallet/test-topup', u.session, { amount: 100000, ref: `lt-${rnd(16)}` });
  return u;
}
/** New accounts, 25 at a time (sign-in, then test coins); prints how many per second the server opened. */
async function addUsers(n) {
  const made = [];
  const s = performance.now();
  for (let i = 0; i < n; i += 25) {
    const batch = await Promise.all(Array.from({ length: Math.min(25, n - i) }, (_, k) => newUser(users.length + i + k)));
    made.push(...batch.filter(Boolean));
  }
  users.push(...made);
  const secs = (performance.now() - s) / 1000;
  console.log(`${made.length}/${n} yeni hesap açılıp jeton yüklendi: ${secs.toFixed(1)} sn (saniyede ${(made.length / secs).toFixed(0)} kayıt, 25'er 25'er)`);
  return made;
}

/** The live line the app keeps open: read and thrown away until the test ends. */
function openLine(u) {
  const ctl = new AbortController();
  u.line = ctl;
  fetch(`${BASE}/api/live`, { headers: { authorization: `Bearer ${u.session}` }, signal: ctl.signal })
    .then(async (r) => {
      for await (const _ of r.body) if (u.stop) break;
    })
    .catch(() => {});
}

/** Open rooms: { id, voice } (voice = the LiveKit room name the token asks for). */
const rooms = [];
/** Someone else to send a gift to. */
const other = (u) => {
  for (;;) {
    const x = pick(users);
    if (x !== u) return x;
  }
};
const MIX = [
  [26, (u) => call('oda listesi', 'GET', '/api/rooms', u.session)],
  [10, (u) => call('odadakiler', 'GET', '/api/rooms/live', u.session)],
  [14, (u) => call('profilim', 'GET', '/api/me', u.session)],
  [10, (u) => call('ayar', 'GET', '/api/config', null)],
  [4, (u) => call('katalog', 'GET', '/api/catalog?gifts=2&emoji=1', null)],
  [14, (u) => call('hediye gönder', 'POST', '/api/gifts/send', u.session, { to: other(u).id, giftId: 'g6', count: 1, price: 1999, place: 'profile', ref: `lt-${rnd(16)}` })],
  [8, (u) => call('sıralama', 'GET', '/api/rankings?board=wealth&period=day', u.session)],
  [8, (u) => call('mesaj kutusu', 'GET', '/api/conversations', u.session)],
  [6, (u) => (rooms.length ? call('ses token', 'GET', `/token?room=${pick(rooms).voice}`, u.session) : Promise.resolve())],
];
const WEIGHT = MIX.reduce((s, [w]) => s + w, 0);
const act = (u) => {
  let r = Math.random() * WEIGHT;
  for (const [w, fn] of MIX) if ((r -= w) <= 0) return fn(u);
  return MIX[0][1](u);
};
async function loop(u) {
  await sleep(Math.random() * 5000);
  while (!u.stop) {
    await act(u);
    await sleep(THINK * (0.5 + Math.random()));
  }
}

// --- Stages --------------------------------------------------------------------------------------------------------
const pct = (list, p) => (list.length ? list[Math.min(list.length - 1, Math.floor((list.length * p) / 100))] : 0);
function report(stage, from, to, cpu0, cpu1) {
  const rows = log.filter(([t]) => t >= from && t < to);
  const secs = (to - from) / 1000;
  const lat = rows.map((r) => r[3]).sort((a, b) => a - b);
  const bad = rows.filter((r) => r[2] < 200 || r[2] >= 300);
  const limited = rows.filter((r) => r[2] === 429).length;
  const cpu = (k) => (((cpu1[k] - cpu0[k]) / TICK / ((cpu1.at - cpu0.at) / 1000)) * 100).toFixed(0);
  console.log(
    `\n== ${stage} kullanıcı: ${rows.length} istek, saniyede ${(rows.length / secs).toFixed(0)}; gecikme p50 ${pct(lat, 50).toFixed(0)} ms, p95 ${pct(lat, 95).toFixed(0)} ms, p99 ${pct(lat, 99).toFixed(0)} ms; hata ${bad.length} (%${((bad.length / Math.max(1, rows.length)) * 100).toFixed(1)}, 429: ${limited})` +
      (API_PID ? `; işlemci API %${cpu('api')}, Postgres %${cpu('pg')}` : ''),
  );
  const by = new Map();
  for (const r of rows) by.set(r[1], [...(by.get(r[1]) ?? []), r]);
  for (const [label, list] of [...by].sort((a, b) => b[1].length - a[1].length)) {
    const l = list.map((r) => r[3]).sort((a, b) => a - b);
    const e = list.filter((r) => r[2] < 200 || r[2] >= 300);
    const codes = [...new Set(e.map((r) => r[2]))].join(',');
    console.log(`   ${label.padEnd(14)} ${String(list.length).padStart(6)}  p50 ${pct(l, 50).toFixed(0).padStart(5)} ms  p95 ${pct(l, 95).toFixed(0).padStart(5)} ms${e.length ? `  hata ${e.length} (${codes})` : ''}`);
  }
}

/** n phones in one room re-read it at the same moment (live-room.tsx sync: the room, then its events). */
async function burst(n) {
  const room = rooms[0];
  const who = users.slice(0, n);
  const s = performance.now();
  const times = await Promise.all(
    who.map(async (u) => {
      const a = performance.now();
      await Promise.all([call('oda yenile', 'GET', `/api/room?id=${room.id}`, u.session), call('oda etkinlik', 'GET', `/api/events/room?room=${room.id}`, u.session)]);
      return performance.now() - a;
    }),
  );
  const all = performance.now() - s;
  const mine = log.filter(([t, label]) => t >= s - t0 && (label === 'oda yenile' || label === 'oda etkinlik'));
  const bad = mine.filter((r) => r[2] < 200 || r[2] >= 300);
  times.sort((a, b) => a - b);
  console.log(`   ani yük: ${who.length} telefon aynı odayı aynı anda okudu (${mine.length} istek): hepsi ${all.toFixed(0)} ms'de bitti, telefon başına p50 ${pct(times, 50).toFixed(0)} ms, p95 ${pct(times, 95).toFixed(0)} ms; hata ${bad.length}`);
}

console.log(`API yük testi: ${BASE}, basamaklar ${STAGES.join(' → ')} kullanıcı, her biri ${SECONDS} sn, ortalama ${THINK} ms arayla istek`);
const seed = await addUsers(Math.min(ROOMS, STAGES[0]));
for (const u of seed.slice(0, ROOMS)) {
  const r = await call('oda aç', 'POST', '/api/rooms', u.session, { title: `Yük odası ${rnd(4)}` });
  if (r.room?.id) rooms.push({ id: r.room.id, voice: `oda-${r.room.id}` });
}
console.log(`${rooms.length} oda açıldı`);
const running = [];
for (const target of STAGES) {
  if (users.length < target) await addUsers(target - users.length);
  for (const u of users.slice(running.length, target)) {
    openLine(u);
    running.push(loop(u));
  }
  const from = performance.now() - t0 + 5000;
  await sleep(5000);
  const c0 = cpuNow();
  await sleep(SECONDS * 1000 - 5000);
  const c1 = cpuNow();
  report(target, from, performance.now() - t0, c0, c1);
  if (BURST && rooms.length) await burst(Math.min(BURST, users.length));
}
for (const u of users) {
  u.stop = true;
  u.line?.abort();
}
await Promise.race([Promise.all(running), sleep(THINK * 2)]);
process.exit(0);
