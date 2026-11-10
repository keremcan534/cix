// The live line (server/api/live-line.mjs): while the app is open and signed in, one request to GET /api/live
// stays open and the server writes a short event into it the moment something happens for me: a message, its
// reading, a call ringing, answered or ended, a follow, a gift… Each kind wakes the part of the app that reads it
// (onLine), so it shows within a second instead of at its next poll. The polls stay, for a line that is down.
// It reconnects by itself (1 s, 2 s, 4 s … up to 30 s; at once after a sign-in or back in the app) and is closed
// while the app is in the background, where the phone's own push notifications take over.
import { AppState } from 'react-native';

import * as api from '@/lib/api';
import { takeEvents, type LineEvent } from '@/lib/live/line-events';

const listeners = new Set<(e: LineEvent) => void>();
/** Hears every event of the line. Returns the unsubscribe. */
export function onLine(fn: (e: LineEvent) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

let wanted = false;
let open: AbortController | null = null;
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

async function connect() {
  if (!wanted || open || AppState.currentState !== 'active') return;
  if (timer) clearTimeout(timer);
  timer = null;
  const mine = new AbortController();
  open = mine;
  try {
    const res = await api.openLiveLine(mine.signal);
    if (!res?.ok || !res.body) throw new Error(`line ${res?.status ?? 'off'}`);
    failures = 0;
    // Back on the line: whatever happened while it was down is read once.
    emit({ type: 'reconnected' });
    const reader = res.body.getReader();
    const text = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const got = takeEvents(buf + text.decode(value, { stream: true }));
      buf = got.rest;
      for (const e of got.events) emit(e);
    }
  } catch {
    // Offline, signed out, the server restarting: tried again below.
  } finally {
    if (open === mine) open = null;
    if (wanted && !mine.signal.aborted) {
      const wait = Math.min(30_000, 1000 * 2 ** failures++);
      timer = setTimeout(() => void connect(), wait);
    }
  }
}

function close() {
  if (timer) clearTimeout(timer);
  timer = null;
  open?.abort();
  open = null;
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
    } else close();
  });
  const off = api.onSignedIn(() => {
    failures = 0;
    close();
    void connect();
  });
  return () => {
    wanted = false;
    sub.remove();
    off();
    close();
  };
}
