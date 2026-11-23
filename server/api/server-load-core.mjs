// Reading /proc's counters (server-load.mjs): plain functions with no database or settings, so tests import them.

/** The processor's busy and total time since boot (jiffies), all cores. */
export function cpuTimes(text) {
  const f = text.split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  const idle = (f[3] ?? 0) + (f[4] ?? 0);
  const total = f.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  return { busy: total - idle, total };
}

/** Bytes in and out since boot over the machine's own network cards (not loopback, Docker's bridges or veths). */
export function netBytes(text) {
  let rx = 0;
  let tx = 0;
  for (const line of text.split('\n').slice(2)) {
    const m = /^\s*([^:\s]+):\s*(.*)$/.exec(line);
    if (!m || /^(lo|docker|veth|br-|virbr)/.test(m[1])) continue;
    const c = m[2].trim().split(/\s+/).map(Number);
    rx += c[0] || 0;
    tx += c[8] || 0;
  }
  return { rx, tx };
}

/** Memory in use (%) and the machine's memory (GB). */
export function memUse(text) {
  const kb = (k) => Number(new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(text)?.[1] ?? 0);
  const total = kb('MemTotal');
  const avail = kb('MemAvailable');
  return { pct: total ? ((total - avail) / total) * 100 : 0, gb: total / 1024 / 1024 };
}
