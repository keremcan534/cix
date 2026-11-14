// The live line (Güncelleme 3, item 2): while the app is open, each phone keeps one GET /api/live open and the
// server writes a short event there the moment something happens for that person: a message, a call ringing or
// answered or ended, a follow, a gift, a bond or family request… The phone then reads that thing again at once
// instead of waiting for its next poll (3 to 15 s), so the other side sees it within a second.
//
//   GET /api/live   (Bearer)  → text/event-stream: "data: {"type":"message","from":"…"}" lines, a comment
//                               every LIVE_BEAT_MS (20 s) so idle connections stay open and dead ones are found.
//   GET /api/live?wins=1      the same, and the wins announced to everyone (lineWin): an app that shows them asks.
//
// Server-Sent Events: plain HTTP, no extra package, and Caddy passes the stream through as it is written. An event
// says only what changed (its type and ids, never a message's text or a name): the phone reads the thing itself
// through the usual routes, with their usual checks, so a line can't show anyone anything they couldn't read.
// One kind is different: a win announced to everyone ('win', lineWin) carries what its banner shows, since it is
// public by design and a read by every phone after every win would cost far more than the line itself.
// The lines live in this process's memory (one API process). The polls stay: they cover a line that is down.
import { auth, limit } from './core.mjs';

/** Open lines by user id. A phone that reconnects before its old line is noticed gone has two for a moment. */
const lines = new Map();
/** The lines that asked for the wins (an older app would take each one for "read everything again"). */
const winLines = new WeakSet();
const MAX_PER_USER = 3;
const BEAT_MS = Number(process.env.LIVE_BEAT_MS) >= 50 ? Number(process.env.LIVE_BEAT_MS) : 20_000;

/** Opens my line (after the usual sign-in and ban checks, which throw before anything is written). */
export async function openLine(req, res) {
  const me = await auth(req);
  const id = String(me.id);
  if (new URL(req.url ?? '/', 'http://line').searchParams.get('wins') === '1') winLines.add(res);
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

const clip = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : null);
const whole = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 0);
/**
 * A win told to everyone with the app open (a Şanslı send's reward, lucky.mjs): every line that asked for wins gets
 * the banner's words, but not the winner's own lines (their phone showed it already) nor anyone in a block either
 * way with them (`skip`). Without `uid` and `name` the winner hid their name ("Bir kullanıcı"). Never throws.
 */
export function lineWin(win, skip = new Set()) {
  if (!lines.size) return;
  const event = `data: ${JSON.stringify({
    type: 'win',
    id: whole(win.id),
    uid: clip(win.uid, 64),
    name: clip(win.name, 60),
    avatar: clip(win.avatar, 500),
    gift: clip(win.gift, 30) ?? 'Şanslı hediye',
    emoji: clip(win.emoji, 8),
    mult: whole(win.mult),
    coins: whole(win.coins),
    wins: Math.max(1, whole(win.wins)),
    room: clip(win.room, 80),
  })}\n\n`;
  for (const [uid, mine] of lines) {
    if (skip.has(uid)) continue;
    for (const res of mine) {
      if (!winLines.has(res)) continue;
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

/**
 * Ayarlar › "Bağlantı testi": the phone asks for a ping on its own line and times how long it takes to come back.
 * Says how many of my lines are open, so the phone can tell "the server has no line from me" from "it is slow".
 */
export const lineRoutes = {
  async 'POST /api/live/ping'(req) {
    const me = await auth(req);
    limit(`lineping:${me.id}`, 20, 'Çok sık denedin, biraz bekle');
    const open = lines.get(String(me.id))?.size ?? 0;
    line([me.id], 'ping', { at: Date.now() });
    return { open };
  },
};

/** Open lines now (tests and the health note). */
export const lineCount = () => [...lines.values()].reduce((n, mine) => n + mine.size, 0);
