// Live mode (lib/live): Canlı Yörünge on the server (server/api/rocket-live.mjs), one round for everyone at once.
// While its screen is open this reads the round (GET /api/casino/rocket: the view, the last 100 crash points, the
// game's gates and stakes, my part in the round and my balances) and hears every change on the live line ('rocket'
// events, lib/live/live-line), reading it all again at each new round, when my fuel left or blew up, and every 10 s
// (every 2,5 s while the line is down). Fuel and escapes go to the server, which takes the stake (game coins first),
// pays every escape in game coins and answers my new balances. Nothing here decides a round.
import { useEffect, useSyncExternalStore } from 'react';

import * as api from '@/lib/api';
import type { Entry } from '@/lib/games';
import { applyServerUser, message, myServerId, onAccountChange, once } from '@/lib/live';
import { lineOpen, onLine } from '@/lib/live/live-line';
import { mySeat, newer, offsetOf, readGame, readMine, readView, viewOfEvent } from '@/lib/live/rocket-live-core';

export type RocketState = {
  status: 'loading' | 'ready' | 'error';
  view: api.RocketView | null;
  /** The server's clock minus this phone's (ms). */
  offset: number;
  /** The last crash points, newest first (hundredths). */
  history: number[];
  game: api.RocketGame | null;
  /** My part in the round on the view, or null without fuel in it. */
  mine: api.RocketMine | null;
  /** The last thing the server refused, for the screen to say. */
  note: string | null;
  /** A fuel or an escape on its way. */
  busy: boolean;
};

const EMPTY: RocketState = { status: 'loading', view: null, offset: 0, history: [], game: null, mine: null, note: null, busy: false };
let state = EMPTY;
const listeners = new Set<() => void>();
function set(patch: Partial<RocketState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export const rocketState = () => state;
export function useRocketState(): RocketState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
/** The server's time now, by this phone's clock and the last measured offset. */
export const serverNow = () => Date.now() + state.offset;

let reading: Promise<void> | null = null;
/** Reads everything again (one read at a time); a failed read keeps what was there. */
export function readRocket(): Promise<void> {
  reading ??= (async () => {
    const who = myServerId();
    const sent = Date.now();
    let r: api.ServerRocket;
    try {
      r = await api.rocket();
    } catch (e) {
      if (state.status === 'loading') set({ status: 'error', note: message(e) });
      return;
    }
    if (who !== myServerId()) return;
    const view = readView(r);
    if (!view) return;
    applyServerUser(r);
    const history = Array.isArray(r.history) ? r.history.filter((x) => Number.isSafeInteger(x) && x >= 100) : view.last;
    set({ status: 'ready', view, offset: offsetOf(view.now, sent, Date.now()), history, game: readGame(r.game), mine: readMine(r.mine) });
  })()
    .catch(() => {})
    .finally(() => (reading = null));
  return reading;
}

/** A view from the line: kept when it is newer; a new round, or my fuel that left or blew up, reads it all again. */
function hear(view: api.RocketView) {
  if (!newer(state.view, view)) return;
  const before = state.view;
  const seat = mySeat(view, state.mine);
  set({ view, ...(view.round?.id !== state.view?.round?.id && { mine: null }) });
  const turned = before?.round?.id !== view.round?.id || (before?.round?.phase !== 'done' && view.round?.phase === 'done');
  if (turned || (seat && seat.c !== null && state.mine?.cashed === null)) void readRocket();
}

let users = 0;
/** Canlı Yörünge's screen while it is open: the first read now, then the line and the reads. Returns the stop. */
export function openRocket(): () => void {
  users += 1;
  if (users === 1) set({ ...EMPTY, history: state.history });
  void readRocket();
  const off = onLine((e) => {
    const view = viewOfEvent(e);
    if (view) hear(view);
  });
  let last = Date.now();
  const t = setInterval(() => {
    if (Date.now() - last < (lineOpen() ? 10_000 : 2_500)) return;
    last = Date.now();
    void readRocket();
  }, 500);
  return () => {
    users -= 1;
    off();
    clearInterval(t);
  };
}
/** The screen's hook: reads and hears the round while it is mounted. */
export function useRocketLive(): RocketState {
  useEffect(() => openRocket(), []);
  return useRocketState();
}

const fmt = (n: number) => n.toLocaleString('tr-TR');

/** Fuel into the open round: `bet` coins, `auto` the automatic escape in hundredths (null: none). */
export async function addFuel(bet: number, auto: number | null, entry: Entry): Promise<boolean> {
  const round = state.view?.round;
  if (!round || round.phase !== 'bet' || state.busy) return false;
  set({ busy: true, note: null });
  try {
    const r = await once(`rocket:${round.id}:${bet}`, (ref) => api.rocketFuel({ round: round.id, bet, auto: auto === null ? null : auto / 100, place: entry.from }, ref));
    // "Oyun Salonu": the store counts the coin part as today's spending (never for Cömertlik: "· tur ").
    applyServerUser(r, `Oyun Salonu: Yörünge · tur (${fmt(bet)})`);
    if (state.view?.round?.id === r.round) set({ mine: readMine(r.mine) });
    return true;
  } catch (e) {
    set({ note: message(e) });
    if (e instanceof api.ApiError && e.status === 409) void readRocket();
    return false;
  } finally {
    set({ busy: false });
  }
}

/** I leave the rocket now: everything of mine on board pays the multiplier at the moment the server gets it. */
export async function escapeNow(): Promise<{ x: number; payout: number } | null> {
  const round = state.view?.round;
  if (!round || state.busy) return null;
  set({ busy: true, note: null });
  try {
    const r = await api.rocketEscape(round.id);
    applyServerUser(r);
    if (state.view?.round?.id === r.round) set({ mine: readMine(r.mine) });
    return { x: r.x, payout: r.payout };
  } catch (e) {
    set({ note: message(e) });
    void readRocket();
    return null;
  } finally {
    set({ busy: false });
  }
}

/** Forgets the round (another account on this phone, a test). */
export function resetRocket() {
  state = EMPTY;
  listeners.forEach((l) => l());
}
// Another account on this phone starts without the last one's fuel.
onAccountChange(resetRocket);
