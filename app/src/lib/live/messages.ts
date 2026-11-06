// Live mode direct messages (lib/live): messages to real people go to the server (api.sendDm). The threads on
// the phone are a copy of the server's: the conversation list is polled by LiveSync (every 15 s), an open chat
// reads its own thread every few seconds, and both directions come in with the server's time (lib/dm-thread).
// Per person the phone keeps the highest server message id it has settled ("seen") and the ids deleted here
// that are above it, so a restart adds nothing twice and a deleted message or chat stays deleted. Signing out
// forgets both: the next sign-in rebuilds the chats from the server.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import * as api from '@/lib/api';
import { hideIds, settle, type ServerDm, type ThreadSync } from '@/lib/dm-thread';
import { noteRefusal } from '@/lib/sanctions';
import { liveMode, message, myServerId, rememberUser, toLocal, toServer } from '@/lib/live';
import { isServerId } from '@/data/mock';

const SEEN_KEY = 'similarclub:dm-seen';
const HIDDEN_KEY = 'similarclub:dm-hidden';
/** GET /api/messages page size (server/api/messages.mjs). */
const PAGE = 50;
/** An open chat reads its thread this often. */
const THREAD_MS = 3_000;

type Saved = { seen: Record<string, number>; hidden: Record<string, number[]> };
let saved: Saved | null = null;
// Bumped on sign-out: a sync that started for the previous account doesn't write into the next one.
let gen = 0;

function record<T>(raw: string | null): Record<string, T> {
  const v: unknown = raw ? JSON.parse(raw) : {};
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : {};
}
async function load(): Promise<Saved> {
  if (saved) return saved;
  try {
    const [seen, hidden] = await Promise.all([AsyncStorage.getItem(SEEN_KEY), AsyncStorage.getItem(HIDDEN_KEY)]);
    saved = { seen: record<number>(seen), hidden: record<number[]>(hidden) };
  } catch {
    saved = { seen: {}, hidden: {} };
  }
  return saved;
}
function save() {
  const s = saved ?? { seen: {}, hidden: {} };
  void AsyncStorage.multiSet([
    [SEEN_KEY, JSON.stringify(s.seen)],
    [HIDDEN_KEY, JSON.stringify(s.hidden)],
  ]).catch(() => {});
}
const syncOf = (s: Saved, peer: string): ThreadSync => ({ peer, after: s.seen[peer] ?? 0, hidden: s.hidden[peer] ?? [] });

const readTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Signed out: the next account on this phone reads its chats from the server again. */
export function forgetSeen() {
  gen++;
  saved = { seen: {}, hidden: {} };
  readTimers.forEach(clearTimeout);
  readTimers.clear();
  void AsyncStorage.multiRemove([SEEN_KEY, HIDDEN_KEY]).catch(() => {});
}

/** A chat with a real person (free, no demo replies, sent through the server). */
export const isLiveUser = (id: string) => liveMode() && isServerId(id);

/** What the store offers this file: applying a synced thread (lib/dm-thread applyThread). */
export type Inbox = { importDms: (userId: string, dms: readonly ServerDm[], sync: ThreadSync, unread: number | null) => void };
export type SendResult = { ok: true; message: api.DirectMessage } | { ok: false; reason: string; retry: boolean };

/** A retry can help: no connection, the rate limit, or the server failing. Other refusals stay the same. */
const retryable = (e: unknown) => !(e instanceof api.ApiError) || e.status === 0 || e.status === 429 || e.status >= 500;

/**
 * Sends a message I already put in the local thread. `ref` is its request id: a retry sends the same one, so
 * the server never stores it twice. `done` gets the stored message, or the reason it didn't go (shown on the
 * bubble, with "tekrar dene" only when a retry can help).
 */
export function liveDm(to: string, text: string, ref: string, done: (r: SendResult) => void) {
  const id = toServer(to);
  if (!id) return done({ ok: false, reason: 'Kullanıcı bulunamadı', retry: false });
  api
    .sendDm(id, text, ref)
    // "Seen" stays where the sync left it: moving it up to my message would skip a reply with a lower id that is
    // already on the server. The next sync finds my message by its id.
    .then((m) => done({ ok: true, message: m }))
    .catch((e) => {
      // Muted for DMs (403 muted): the details and the appeal open, besides the note on the bubble.
      noteRefusal(e, true);
      done({ ok: false, reason: message(e), retry: retryable(e) });
    });
}

// One sync at a time (the 15 s poll, an open chat, a return to the foreground): each reads and moves "seen".
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

const page = (peer: string, before?: number) =>
  api.apiRequest<{ messages: api.DirectMessage[] }>('GET', `/api/messages?with=${encodeURIComponent(peer)}${before ? `&before=${before}` : ''}`).then((r) => r.messages);

async function syncPeer(peer: string, app: Inbox, unread: number | null) {
  const g = gen;
  const s = await load();
  const sync = syncOf(s, peer);
  let rows = await page(peer);
  const all = [...rows];
  // More new messages than one page since the last sync: read back to the last settled one. A first sync (after
  // signing in) takes the newest page only.
  for (let n = 0; sync.after > 0 && rows.length >= PAGE && n < 4; n++) {
    const oldest = Math.min(...rows.map((m) => m.id));
    if (oldest <= sync.after) break;
    rows = await page(peer, oldest);
    all.push(...rows);
  }
  if (g !== gen || !myServerId()) return;
  app.importDms(toLocal(peer), all, sync, unread);
  const next = settle(sync, all);
  s.seen[peer] = next.after;
  if (next.hidden.length) s.hidden[peer] = next.hidden;
  else delete s.hidden[peer];
  save();
}

/** The conversation list: chats with new messages are synced; the rest only take the server's unread count. */
export function pollMessages(app: Inbox) {
  return serial(async () => {
    if (!myServerId()) return;
    const g = gen;
    const list = await api.conversations();
    const s = await load();
    for (const c of list) {
      if (g !== gen) return;
      rememberUser(c.user);
      const peer = c.user.id;
      if (c.last.id > (s.seen[peer] ?? 0)) await syncPeer(peer, app, c.unread);
      else app.importDms(toLocal(peer), [], syncOf(s, peer), c.unread);
    }
  });
}

/** One thread now (a chat being opened or read). */
export function syncThread(userId: string, app: Inbox) {
  const peer = toServer(userId);
  if (!isLiveUser(userId) || !peer || !myServerId()) return Promise.resolve();
  return serial(() => syncPeer(peer, app, null));
}

/** While a chat with a real person is on screen, its thread is read every few seconds (and once on opening). */
export function useLiveThread(userId: string, app: Inbox) {
  const appRef = useRef(app);
  useEffect(() => {
    appRef.current = app;
  });
  useEffect(() => {
    if (!isLiveUser(userId)) return;
    const tick = () => {
      if (AppState.currentState === 'active') void syncThread(userId, appRef.current).catch(() => {});
    };
    tick();
    const t = setInterval(tick, THREAD_MS);
    return () => clearInterval(t);
  }, [userId]);
}

/** Deleted on this phone: a sync doesn't bring these server messages back (the server keeps its copy). */
export async function hideDms(userId: string, sids: readonly (number | undefined)[]) {
  const peer = toServer(userId);
  if (!isLiveUser(userId) || !peer) return;
  const s = await load();
  const hidden = hideIds(syncOf(s, peer), sids);
  if (hidden.length) s.hidden[peer] = hidden;
  else delete s.hidden[peer];
  save();
}

/** A chat with a real person was read here: the server hears it shortly after (one call for a burst of reads). */
export function markLiveRead(userId: string) {
  const peer = toServer(userId);
  if (!isLiveUser(userId) || !peer || !myServerId()) return;
  const prev = readTimers.get(peer);
  if (prev) clearTimeout(prev);
  readTimers.set(
    peer,
    setTimeout(() => {
      readTimers.delete(peer);
      void api.markDmRead(peer).catch(() => {});
    }, 1_200),
  );
}

/** Reasons for reporting one message (the server keeps at most 60 characters). */
export const MESSAGE_REPORT_REASONS = ['Taciz veya hakaret', 'Uygunsuz içerik', 'Nefret söylemi', 'Dolandırıcılık', 'Spam'];
/** Reports one message from a real person to the moderators (POST /api/report, type 'message'). */
export async function reportDm(sid: number, reason: string, note?: string) {
  const clean = note?.trim().slice(0, 500);
  await api.apiRequest('POST', '/api/report', { type: 'message', id: String(sid), reason, ...(clean ? { note: clean } : {}) });
}
