// The live line (server/api/live-line.mjs): while the app is open and signed in, one request to GET /api/live
// stays open and the server writes a short event into it the moment something happens for me: a message, its
// reading, a call ringing, answered or ended, a follow, a gift… Each kind wakes the part of the app that reads it
// (onLine), so it shows within a second instead of at its next poll. The polls stay, for a line that is down, and
// they run faster while it is (lineOpen()).
// It reconnects by itself (1 s, 2 s, 4 s … up to 30 s; at once after a sign-in or back in the app) and is closed
// while the app is in the background, where the phone's own push notifications take over.
// Two ways to read the stream: fetch's body (expo/fetch), and XMLHttpRequest's growing text. A way that doesn't
// bring the server's first bytes within a few seconds, or goes quiet longer than the server's heartbeat, is given
// up and the other one is tried, so a phone where one of them holds the stream back still gets its events.
import { AppState } from 'react-native';
import { useSyncExternalStore } from 'react';

import * as api from '@/lib/api';
import { takeEvents, type LineEvent } from '@/lib/live/line-events';

const listeners = new Set<(e: LineEvent) => void>();

/** Hears every event of the line. Returns the unsubscribe. */
export function onLine(fn: (e: LineEvent) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

type Way = 'fetch' | 'xhr';
/** What the line is doing now, for the polls (lineOpen) and Ayarlar › Bağlantı testi. */
export type LineState = { status: 'off' | 'connecting' | 'open' | 'down'; way: Way; error: string | null; since: number };

/** The server writes ": ok" at once and a comment every 20 s: no bytes for this long means the line is dead. */
const FIRST_BYTES_MS = 6_000;
const QUIET_MS = 45_000;

let state: LineState = { status: 'off', way: 'fetch', error: null, since: Date.now() };
const stateListeners = new Set<() => void>();
function setState(next: Partial<LineState>) {
  const changed = (next.status !== undefined && next.status !== state.status) || (next.way !== undefined && next.way !== state.way);
  state = { ...state, ...next, since: changed ? Date.now() : state.since };
  stateListeners.forEach((l) => l());
}
/** True while the line is open: the polls can take their time. */
export const lineOpen = () => state.status === 'open';
export function useLineState(): LineState {
  return useSyncExternalStore(
    (l) => {
      stateListeners.add(l);
      return () => void stateListeners.delete(l);
    },
    () => state,
    () => state,
  );
}

let wanted = false;
let stop: (() => void) | null = null;
let failures = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function emit(e: LineEvent) {
  for (const fn of listeners) {
    try {
      fn(e);
    } catch {
      // One listener's fault doesn't stop the others.
    }
  }
}

/** Reads the line one way; calls `done` once, with the reason it ended (null: closed by us). Returns the close. */
type Reader = (feed: (text: string) => void, done: (why: string | null) => void) => Promise<() => void>;

const viaFetch: Reader = async (feed, done) => {
  const ctl = new AbortController();
  void (async () => {
    try {
      const res = await api.openLiveLine(ctl.signal);
      if (!res?.ok) throw new Error(`line ${res?.status ?? 'off'}`);
      if (!res.body) throw new Error('no body');
      const reader = res.body.getReader();
      const text = new TextDecoder();
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        feed(text.decode(value, { stream: true }));
      }
      done('ended');
    } catch (e) {
      done(ctl.signal.aborted ? null : e instanceof Error ? e.message : String(e));
    }
  })();
  return () => ctl.abort();
};

const viaXhr: Reader = async (feed, done) => {
  const target = await api.liveLineTarget();
  if (!target) {
    done('signed out');
    return () => {};
  }
  const xhr = new XMLHttpRequest();
  let seen = 0;
  let closed = false;
  xhr.open('GET', target.url);
  xhr.setRequestHeader('Authorization', `Bearer ${target.token}`);
  xhr.setRequestHeader('Accept', 'text/event-stream');
  xhr.setRequestHeader('Cache-Control', 'no-cache');
  // Both handlers set before send: React Native then hands the text over as it arrives.
  xhr.onreadystatechange = () => {
    if (xhr.readyState === 4 && !closed) done(xhr.status === 200 ? 'ended' : `line ${xhr.status}`);
  };
  xhr.onprogress = () => {
    const all = xhr.responseText ?? '';
    if (all.length > seen) {
      feed(all.slice(seen));
      seen = all.length;
    }
  };
  xhr.onerror = () => {
    if (!closed) done('network');
  };
  xhr.send();
  return () => {
    closed = true;
    xhr.abort();
  };
};

async function connect() {
  if (!wanted || stop || AppState.currentState !== 'active') return;
  if (timer) clearTimeout(timer);
  timer = null;
  const way = state.way;
  setState({ status: 'connecting' });
  let buf = '';
  let gotBytes = false;
  let ended = false;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let close: (() => void) | null = null;
  const arm = (ms: number, why: string) => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => finish(why), ms);
  };
  const finish = (why: string | null) => {
    if (ended) return;
    ended = true;
    if (watchdog) clearTimeout(watchdog);
    close?.();
    if (stop === mine) stop = null;
    if (why === null) return;
    // Nothing came at all: this way doesn't work on this phone, so the next try uses the other one.
    if (!gotBytes) setState({ way: way === 'fetch' ? 'xhr' : 'fetch' });
    setState({ status: 'down', error: why });
    if (wanted) {
      const wait = Math.min(30_000, 1000 * 2 ** failures++);
      timer = setTimeout(() => void connect(), wait);
    }
  };
  const mine = () => finish(null);
  stop = mine;
  const feed = (text: string) => {
    if (!gotBytes) {
      gotBytes = true;
      failures = 0;
      setState({ status: 'open', error: null });
      // Back on the line: whatever happened while it was down is read once.
      emit({ type: 'reconnected' });
    }
    arm(QUIET_MS, 'quiet');
    const got = takeEvents(buf + text);
    buf = got.rest;
    for (const e of got.events) emit(e);
  };
  arm(FIRST_BYTES_MS, 'no first bytes');
  close = await (way === 'fetch' ? viaFetch : viaXhr)(feed, finish);
  if (ended) close();
}

function closeLine() {
  if (timer) clearTimeout(timer);
  timer = null;
  stop?.();
  stop = null;
  setState({ status: 'off' });
}

/** Keeps the line open while the app is active (components/live sync, once signed in). Returns the stop. */
export function startLiveLine() {
  wanted = true;
  failures = 0;
  void connect();
  const sub = AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      failures = 0;
      void connect();
    } else closeLine();
  });
  const off = api.onSignedIn(() => {
    failures = 0;
    closeLine();
    void connect();
  });
  return () => {
    wanted = false;
    sub.remove();
    off();
    closeLine();
  };
}

/**
 * Ayarlar › Bağlantı testi: asks the server for a ping on my line and times it. `ms` null: it didn't come back
 * within 5 s. `serverLines`: how many lines the server has from me (0: my phone isn't connected at all).
 */
export async function testLine(): Promise<{ ms: number | null; serverLines: number; state: LineState }> {
  const t0 = Date.now();
  let back: number | null = null;
  const off = onLine((e) => {
    if (e.type === 'ping' && back === null) back = Date.now() - t0;
  });
  try {
    const { open } = await api.pingLiveLine();
    for (let i = 0; i < 50 && back === null; i++) await new Promise((r) => setTimeout(r, 100));
    return { ms: back, serverLines: open, state };
  } finally {
    off();
  }
}
