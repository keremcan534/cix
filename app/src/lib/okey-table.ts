// Okey table server stand-in: one table per room, the rules from lib/okey, and the clock that plays bots and
// times out idle players. Every action is checked here against the table (seat, turn), never only in the UI;
// screens render `viewFor(table, me)`, so spectators never get anyone's tiles.
//
// On web the tables are shared between open tabs of the app (BroadcastChannel), which stands in for other
// devices in the same room: a second tab is a second viewer with its own identity and can watch or sit.
// The tab that opened a table runs its clock; another tab takes over when that clock goes quiet.
import { useSyncExternalStore } from 'react';

import {
  autoPlay,
  fillBots,
  openTable,
  playAs,
  removeBot,
  sit,
  stand,
  startHand,
  unwatch,
  watch,
  type Move,
  type SeatHolder,
  type Table,
  type TableResult,
} from '@/lib/okey';

/** A bot's think time per move. */
export const BOT_MS = 900;
/** A person's time for a whole turn; then the table plays for them. */
export const TURN_MS = 30_000;
/** Another client takes over the clock when the host has been quiet this long past a due move. */
const TAKEOVER_MS = 6_000;

/** This app instance (a tab on web). Viewers are `userId:client`, so two tabs of one account are two viewers. */
// Kept on globalThis so a hot reload of this module doesn't turn the tab into a stranger at its own seat.
const g = globalThis as { __okeyClient?: string };
export const CLIENT = (g.__okeyClient ??= Math.random().toString(36).slice(2, 8));
export const viewerKey = (userId: string) => `${userId}:${CLIENT}`;
/** Seat holders from another tab/device of the same account. */
export const fromOtherClient = (h: SeatHolder) => !h.bot && h.id.includes(':') && !h.id.endsWith(`:${CLIENT}`);

type Entry = { table: Table; version: number; host: string };
let tables: Record<string, Entry> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

type Wire = { type: 'state'; roomId: string; entry: Entry | null } | { type: 'hello' };
const channel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('similarclub:okey') : null;
const send = (m: Wire) => channel?.postMessage(m);
if (channel) {
  channel.onmessage = (e: MessageEvent<Wire>) => {
    const m = e.data;
    if (m.type === 'hello') {
      Object.keys(tables).forEach((roomId) => send({ type: 'state', roomId, entry: tables[roomId] }));
      return;
    }
    const mine = tables[m.roomId];
    if (!m.entry) {
      if (!mine) return;
      const { [m.roomId]: _gone, ...rest } = tables;
      tables = rest;
    } else if (!mine || m.entry.version > mine.version) tables = { ...tables, [m.roomId]: m.entry };
    else return;
    emit();
    schedule(m.roomId);
  };
  send({ type: 'hello' });
}

function put(roomId: string, table: Table | null, host?: string) {
  if (!table) {
    const { [roomId]: _gone, ...rest } = tables;
    tables = rest;
    send({ type: 'state', roomId, entry: null });
  } else {
    const prev = tables[roomId];
    const entry = { table, version: (prev?.version ?? 0) + 1, host: host ?? prev?.host ?? CLIENT };
    tables = { ...tables, [roomId]: entry };
    send({ type: 'state', roomId, entry });
  }
  emit();
  schedule(roomId);
}

export const getOkeyTable = (roomId: string): Table | undefined => tables[roomId]?.table;
export function useOkeyTable(roomId: string): Table | undefined {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => tables[roomId]?.table,
    () => tables[roomId]?.table,
  );
}

const apply = (roomId: string, fn: (t: Table) => TableResult): { ok: true } | { ok: false; reason: string } => {
  const t = getOkeyTable(roomId);
  if (!t) return { ok: false, reason: 'Masa kapandı.' };
  const r = fn(t);
  if (!r.ok) return r;
  put(roomId, r.table);
  return { ok: true };
};

// --- Actions ------------------------------------------------------------------------------------------

/** Opens the room's table (the opener takes the first seat), or returns the one already there. */
export function openOkey(roomId: string, me: SeatHolder, crowd: SeatHolder[] = []) {
  const existing = getOkeyTable(roomId);
  if (existing) return existing;
  let t = openTable(roomId, me);
  // Some people in the room come to watch as soon as a table opens.
  for (const w of crowd.slice(0, 2)) t = watch(t, w);
  put(roomId, t, CLIENT);
  return t;
}
export const sitOkey = (roomId: string, seat: number, me: SeatHolder) => apply(roomId, (t) => sit(t, seat, me));
export const standOkey = (roomId: string, userId: string) => apply(roomId, (t) => stand(t, userId));
export const fillOkeyBots = (roomId: string) => apply(roomId, (t) => ({ ok: true, table: fillBots(t) }));
export const removeOkeyBot = (roomId: string, seat: number) => apply(roomId, (t) => removeBot(t, seat));
export const startOkey = (roomId: string) => apply(roomId, (t) => startHand(t));
export const watchOkey = (roomId: string, me: SeatHolder) => apply(roomId, (t) => ({ ok: true, table: watch(t, me) }));
export const unwatchOkey = (roomId: string, userId: string) => {
  const t = getOkeyTable(roomId);
  if (t?.watchers.some((w) => w.id === userId)) put(roomId, unwatch(t, userId));
};
/** A move by the viewer: the table checks it is their seat and their turn. */
export const moveOkey = (roomId: string, userId: string, m: Move) => apply(roomId, (t) => playAs(t, userId, m));
/** Closes the table when nobody is playing any more. */
export function closeOkeyIfEmpty(roomId: string) {
  const t = getOkeyTable(roomId);
  if (t && !t.seats.some((s) => s && !s.bot) && t.watchers.every((w) => !w.id.includes(':'))) put(roomId, null);
}

// --- Clock: bots move, idle people are played for ------------------------------------------------------

const timers: Record<string, ReturnType<typeof setTimeout>> = {};
function schedule(roomId: string) {
  clearTimeout(timers[roomId]);
  const e = tables[roomId];
  const g = e?.table.game;
  if (!e || !g || g.phase === 'over') return;
  const holder = e.table.seats[g.turn];
  const due = e.table.turnAt + (holder?.bot ? 0 : TURN_MS);
  const isHost = e.host === CLIENT;
  const wait = Math.max(isHost ? BOT_MS : 0, due - Date.now() + (isHost ? BOT_MS : TAKEOVER_MS));
  const version = e.version;
  timers[roomId] = setTimeout(() => {
    const cur = tables[roomId];
    if (!cur || cur.version !== version || !cur.table.game) return;
    const r = autoPlay(cur.table);
    if (r.ok) put(roomId, r.table, CLIENT);
  }, wait);
}

/** Tests and sign-out: forget every table. */
export function resetOkey() {
  Object.values(timers).forEach(clearTimeout);
  tables = {};
  emit();
}
