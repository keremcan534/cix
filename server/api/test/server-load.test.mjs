// The machine's own load for the panel's Sunucu kapasitesi page (server-load.mjs, 116): a sample a minute from /proc
// (here a folder of sample files the test moves on), who is in voice and on a mic, and GET /api/admin/capacity for
// admins and the panel only.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startApi } from './harness.mjs';
import { PANEL_ROUTES } from '../panel.mjs';
import { cpuTimes, memUse, netBytes } from '../server-load-core.mjs';

const PROC = fs.mkdtempSync(path.join(os.tmpdir(), 'proc-'));
fs.mkdirSync(path.join(PROC, 'net'));
let tick = 0;
/** The counters move on: 25 % of the processor busy, 60 MB out and 6 MB in per step. */
function step() {
  tick += 1;
  const busy = 1000 * tick;
  const idle = 3000 * tick;
  fs.writeFileSync(path.join(PROC, 'stat'), `cpu  ${busy} 0 0 ${idle} 0 0 0 0 0 0\ncpu0 1 0 0 1\n`);
  fs.writeFileSync(
    path.join(PROC, 'net/dev'),
    'Inter-|   Receive                                                |  Transmit\n' +
      ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n' +
      `    lo: ${99e9} 0 0 0 0 0 0 0 ${99e9} 0 0 0 0 0 0 0\n` +
      `enp0s6: ${6e6 * tick} 0 0 0 0 0 0 0 ${60e6 * tick} 0 0 0 0 0 0 0\n` +
      `docker0: ${5e9} 0 0 0 0 0 0 0 ${5e9 * tick} 0 0 0 0 0 0 0\n`,
  );
  fs.writeFileSync(path.join(PROC, 'meminfo'), 'MemTotal:       25165824 kB\nMemFree:  1 kB\nMemAvailable:   18874368 kB\n');
}
step();
const mover = setInterval(step, 150);
after(() => {
  clearInterval(mover);
  fs.rmSync(PROC, { recursive: true, force: true });
});

const h = startApi({ PROC_ROOT: PROC, SERVER_LOAD_MS: '300' });
const { call, signUp } = h;

describe('Sunucu kapasitesi: makinenin kendi ölçümü', () => {
  test('sayaçlar doğru okunur: işlemci, yalnız makinenin kendi ağ kartı, bellek', () => {
    assert.deepEqual(cpuTimes('cpu  10 0 5 80 5 0 0 0 0 0\n'), { busy: 15, total: 100 });
    const net = netBytes('h1\nh2\n    lo: 9 0 0 0 0 0 0 0 9\n  eth0: 100 0 0 0 0 0 0 0 200\nveth1: 7 0 0 0 0 0 0 0 7\n');
    assert.deepEqual(net, { rx: 100, tx: 200 });
    const m = memUse('MemTotal: 1048576 kB\nMemAvailable: 262144 kB\n');
    assert.equal(m.pct, 75);
    assert.equal(m.gb, 1);
  });

  test('yönetici dakika dakika ölçümü, ayın trafiğini ve son günün tepelerini görür; başkası göremez', async () => {
    const admin = await signUp('Yönetici');
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
    const user = await signUp('Kullanıcı');
    assert.equal((await call('GET', '/api/admin/capacity', undefined, user.session))[0], 403);

    let j;
    for (let i = 0; i < 40; i += 1) {
      [, j] = await call('GET', '/api/admin/capacity', undefined, admin.session);
      if (j.measuring && j.month.txGb > 0) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.equal(j.measuring, true);
    assert.equal(j.machine.memGb, 24);
    assert.ok(j.machine.cores >= 1);
    // 25 % busy, a quarter of memory free; docker0 and lo don't count as traffic out.
    assert.ok(Math.abs(j.now.cpu - 25) < 0.5, `cpu ${j.now.cpu}`);
    assert.equal(j.now.mem, 25);
    assert.ok(j.month.txGb > 0 && j.month.txGb < 5, `tx ${j.month.txGb}`);
    assert.equal(j.now.voice, 0);
    assert.equal(j.now.speakers, 0);
    assert.ok(j.peak24h.cpu >= j.now.cpu);
    assert.ok(Array.isArray(j.hours) && j.hours.length >= 1);
  });

  test('panel bu sayfayı okuyabilir', () => {
    assert.ok(PANEL_ROUTES.has('GET /api/admin/capacity'));
  });
});
