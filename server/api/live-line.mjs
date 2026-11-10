// The live line (Güncelleme 3, item 2): while the app is open, each phone keeps one GET /api/live open and the
// server writes a short event there the moment something happens for that person: a message, a call ringing or
// answered or ended, a follow, a gift, a bond or family request… The phone then reads that thing again at once
// instead of waiting for its next poll (3 to 15 s), so the other side sees it within a second.
//
//   GET /api/live   (Bearer)  → text/event-stream: "data: {"type":"message","from":"…"}" lines, a comment
//                               every LIVE_BEAT_MS (20 s) so idle connections stay open and dead ones are found.
//
// Server-Sent Events: plain HTTP, no extra package, and Caddy passes the stream through as it is written. An event
// says only what changed (its type and ids, never a message's text or a name): the phone reads the thing itself
// through the usual routes, with their usual checks, so a line can't show anyone anything they couldn't read.
// The lines live in this process's memory (one API process). The polls stay: they cover a line that is down.
import { auth } from './core.mjs';

/** Open lines by user id. A phone that reconnects before its old line is noticed gone has two for a moment. */
const lines = new Map();
const MAX_PER_USER = 3;
const BEAT_MS = Number(process.env.LIVE_BEAT_MS) >= 50 ? Number(process.env.LIVE_BEAT_MS) : 20_000;

/** Opens my line (after the usual sign-in and ban checks, which throw before anything is written). */
export async function openLine(req, res) {
  const me = await auth(req);
  const id = String(me.id);
  // no-transform: nothing on the way (Caddy's compression) may hold the events back to pack them.
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n: ok\n\n');
  let mine = lines.get(id);
  if (!mine) lines.set(id, (mine = new Set()));
  // More than a phone or two at once: the oldest line goes.
  while (mine.size >= MAX_PER_USER) {
    const old = mine.values().next().value;
    mine.delete(old);
    old.end();
  }
  mine.add(res);
  const beat = setInterval(() => res.write(': \n\n'), BEAT_MS);
  beat.unref();
  res.on('close', () => {
    clearInterval(beat);
    mine.delete(res);
    if (!mine.size && lines.get(id) === mine) lines.delete(id);
  });
}

/** Only the short facts of an event go out: ids, kinds and flags, never text (a message, a name). */
function facts(data) {
  const out = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && v.length <= 64 && /^[\w:.-]*$/.test(v)) out[k] = v;
  }
  return out;
}

/** Tells these people's open phones that `type` changed for them (e.g. 'message' with { from }). Never throws. */
export function line(userIds, type, data = {}) {
  if (!lines.size) return;
  const event = `data: ${JSON.stringify({ ...facts(data), type })}\n\n`;
  for (const uid of new Set(userIds.map(String))) {
    for (const res of lines.get(uid) ?? []) {
      try {
        res.write(event);
      } catch {
        // A line that just broke: its 'close' removes it.
      }
    }
  }
}

/** Shutdown: every line ends, so the phones reconnect to the next process at once. */
export function closeLines() {
  for (const mine of lines.values()) for (const res of mine) res.end();
  lines.clear();
}

/** Open lines now (tests and the health note). */
export const lineCount = () => [...lines.values()].reduce((n, mine) => n + mine.size, 0);
