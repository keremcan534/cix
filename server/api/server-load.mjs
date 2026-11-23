// The machine's load, measured on the machine (no Oracle account key needed): once a minute the processor, memory
// and network counters of /proc (the API runs with the host's network, so /proc/net/dev is the host's own cards and
// /proc/stat the host's cores), beside how many people are in voice and how many mics are on. Oracle bills the same
// thing: past 10 TB a month of traffic out, and processor or memory past the free share. The finance panel's Sunucu
// kapasitesi page reads it through GET /api/admin/capacity and runs its simulation on it (docs/SUNUCU.md › Kapasite).
// Off a Linux machine (no /proc) nothing is recorded and the page says so. Rows older than 40 days go.
//   PROC_ROOT        where /proc is read (tests point it at a folder of sample files); default /proc
//   SERVER_LOAD_MS   how often a sample is taken (tests); default 60 000
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { HttpError, auth, db, env } from './core.mjs';
import { voiceCounts } from './live.mjs';
import { cpuTimes, memUse, netBytes } from './server-load-core.mjs';

const ROOT = () => env.PROC_ROOT || '/proc';
const read = (f) => fs.readFileSync(path.join(ROOT(), f), 'utf8');

/** Counter differences that survive a restart (a counter that went down started again from zero). */
const diff = (now, before) => (now >= before ? now - before : now);

let last = null;
let timer = null;
let purged = 0;

/** One sample: the counters now against the last ones; the first call only remembers them. */
export async function sample() {
  let cpu;
  let net;
  let mem;
  try {
    cpu = cpuTimes(read('stat'));
    net = netBytes(read('net/dev'));
    mem = memUse(read('meminfo'));
  } catch {
    return null; // no /proc: not a Linux machine
  }
  const before = last;
  last = { cpu, net };
  if (!before) return null;
  const total = diff(cpu.total, before.cpu.total);
  const row = {
    cpu: total > 0 ? Math.min(100, (diff(cpu.busy, before.cpu.busy) / total) * 100) : 0,
    mem: mem.pct,
    tx: diff(net.tx, before.net.tx),
    rx: diff(net.rx, before.net.rx),
    cores: os.cpus().length || 1,
    memGb: mem.gb,
  };
  // Who is in voice: LiveKit's own count when it answers, else the rooms' presence rows.
  const counts = await voiceCounts().catch(() => null);
  let voice = 0;
  let rooms = 0;
  if (counts) {
    for (const n of counts.values()) {
      voice += n;
      if (n > 0) rooms += 1;
    }
  } else {
    const r = (await db.query('SELECT count(*)::int AS n, count(DISTINCT room)::int AS rooms FROM room_presence')).rows[0];
    voice = r.n;
    rooms = r.rooms;
  }
  const speakers = (await db.query("SELECT count(*)::int AS n FROM voice_tracks WHERE room LIKE 'oda-%'")).rows[0].n;
  await db.query(
    `INSERT INTO server_load (at, cpu, mem, tx_bytes, rx_bytes, voice, speakers, rooms, cores, mem_gb)
     VALUES (date_trunc('minute', now()), $1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (at) DO UPDATE SET cpu = EXCLUDED.cpu, mem = EXCLUDED.mem, tx_bytes = server_load.tx_bytes + EXCLUDED.tx_bytes,
       rx_bytes = server_load.rx_bytes + EXCLUDED.rx_bytes, voice = EXCLUDED.voice, speakers = EXCLUDED.speakers, rooms = EXCLUDED.rooms`,
    [row.cpu, row.mem, row.tx, row.rx, voice, speakers, rooms, row.cores, row.memGb],
  );
  if (Date.now() - purged > 3_600_000) {
    purged = Date.now();
    await db.query("DELETE FROM server_load WHERE at < now() - interval '40 days'");
  }
  return row;
}

export function startServerLoad() {
  if (timer) return;
  const every = Number(env.SERVER_LOAD_MS) || 60_000;
  const run = () => sample().catch((e) => console.error('server load', String(e?.message ?? e).slice(0, 200)));
  void run();
  timer = setInterval(run, every);
  timer.unref?.();
}
export function stopServerLoad() {
  if (timer) clearInterval(timer);
  timer = null;
  last = null;
}

const mbps = (bytes, seconds) => Math.round(((Number(bytes) * 8) / seconds / 1e6) * 100) / 100;
const round = (x, d = 1) => Math.round(Number(x) * 10 ** d) / 10 ** d;

export const serverLoadRoutes = {
  /**
   * The machine and its load for the panel's capacity page: the machine, the last minute, the last day's peaks, this
   * month's traffic out (Oracle's free 10 TB), and the last 7 days hour by hour. `measuring` false: nothing recorded
   * yet (a new server, or not Linux).
   */
  async 'GET /api/admin/capacity'(req) {
    const u = await auth(req);
    if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
    const now = (await db.query('SELECT * FROM server_load ORDER BY at DESC LIMIT 1')).rows[0] ?? null;
    const day = (
      await db.query(
        `SELECT max(cpu) AS cpu, max(mem) AS mem, max(tx_bytes) AS tx, max(voice) AS voice, max(speakers) AS speakers, max(rooms) AS rooms
         FROM server_load WHERE at > now() - interval '24 hours'`,
      )
    ).rows[0];
    const month = (
      await db.query(
        `SELECT coalesce(sum(tx_bytes), 0)::bigint AS tx, count(*)::int AS minutes, min(at) AS since
         FROM server_load WHERE at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
      )
    ).rows[0];
    const hours = (
      await db.query(
        `SELECT date_trunc('hour', at) AS hour, max(cpu) AS cpu, avg(tx_bytes) AS tx, max(voice) AS voice, max(speakers) AS speakers
         FROM server_load WHERE at > now() - interval '7 days' GROUP BY 1 ORDER BY 1`,
      )
    ).rows;
    return {
      measuring: !!now,
      machine: now ? { cores: now.cores, memGb: round(now.mem_gb) } : { cores: os.cpus().length || 1, memGb: round(os.totalmem() / 1024 ** 3) },
      now: now && { at: now.at, cpu: round(now.cpu), mem: round(now.mem), txMbps: mbps(now.tx_bytes, 60), rxMbps: mbps(now.rx_bytes, 60), voice: now.voice, speakers: now.speakers, rooms: now.rooms },
      peak24h: { cpu: round(day.cpu ?? 0), mem: round(day.mem ?? 0), txMbps: mbps(day.tx ?? 0, 60), voice: day.voice ?? 0, speakers: day.speakers ?? 0, rooms: day.rooms ?? 0 },
      month: { txGb: round(Number(month.tx) / 1e9, 2), minutes: month.minutes, since: month.since },
      hours: hours.map((h) => ({ hour: h.hour, cpu: round(h.cpu), txMbps: mbps(h.tx, 60), voice: h.voice, speakers: h.speakers })),
    };
  },
};
