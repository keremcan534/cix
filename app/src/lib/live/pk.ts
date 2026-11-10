// Oda içi PK in a server room (server/api/pk.mjs): the server keeps the PK, its clock and its points, so every
// phone in the room shows the same PK, score and result. This file reads it into the PK store (lib/pk), which
// the boards, the result and the crowns already draw, and starts or cancels one for the room's owner or admins.
// Odalar arası PK (server/api/pk-cross.mjs) comes with the same read: the room's staff invite another room, the
// invited room's staff answer (useIncomingCrossPk: their answer card), and either side ends it early.
//
// The PK is read on entering the room, when the server announces a change ({ type: 'pk' } on the room's voice
// connection; for a cross-room PK also a gift scored in the other room), after a gift is announced while a PK
// runs, when the invite, the countdown and the time run out, and every few seconds as a fallback (a packet can be
// missed around a reconnect).
import { useEffect, useState, useSyncExternalStore } from 'react';

import type { Room } from '@/data/mock';
import * as api from '@/lib/api';
import { message, once, rememberUser, roomOf, toLocal, toServer } from '@/lib/live';
import { onServerPk, onSignal } from '@/lib/live/room-bus';
import { applyServerCrossPk, applyServerPk, markPkSeen, pkOfRoom, serverCrossSession, serverPkSession, type PkSession, type StartResult } from '@/lib/pk';

/** PKs this phone saw running: an ended one it never saw (I came in later) gets no result screen. */
const watched = new Set<string>();
/** The latest read per room: an older answer that comes back late doesn't undo a newer one. */
const seq = new Map<string, number>();
const next = (roomId: string) => {
  const n = (seq.get(roomId) ?? 0) + 1;
  seq.set(roomId, n);
  return n;
};

function apply(roomId: string, r: api.ServerPkAnswer): PkSession | null {
  r.pk?.people.forEach((u) => rememberUser(u));
  const pk = r.pk ? serverPkSession(r.pk, toLocal, Date.parse(r.now) - Date.now()) : null;
  if (pk && (pk.status === 'prep' || pk.status === 'active')) watched.add(pk.id);
  else if (pk && !watched.has(pk.id)) {
    markPkSeen(pk.id);
    markPkSeen(`${pk.id}:crowns`);
  }
  applyServerPk(roomId, pk);
  return pk;
}

/** Reads the room's PK from the server. Throws when it can't (offline): the store keeps what it last had. */
export async function refreshRoomPk(roomId: string) {
  const n = next(roomId);
  const r: api.ServerPkRead = await api.roomPk(roomId);
  if (seq.get(roomId) !== n) return;
  apply(roomId, r);
  // An older server sends no `cross`: what is held stays.
  if (r.cross !== undefined) applyCross(roomId, r.cross, r.now);
}

// --- Odalar arası PK ---------------------------------------------------------------------------------
/** An invite to this room that its staff may answer: from which room, how long, until when (this phone's clock). */
export type IncomingCrossPk = { id: string; fromRoomId: string; durationMin: number; expiresAt: number };
const incoming = new Map<string, IncomingCrossPk>();
const incomingListeners = new Set<() => void>();
let incomingVersion = 0;
function setIncoming(roomId: string, inv: IncomingCrossPk | null) {
  const held = incoming.get(roomId);
  if (inv ? JSON.stringify(held) === JSON.stringify(inv) : !held) return;
  if (inv) incoming.set(roomId, inv);
  else incoming.delete(roomId);
  incomingVersion++;
  incomingListeners.forEach((l) => l());
}
/** The cross-room PK invite waiting for this room's answer (null: none). The room screen shows it to its staff. */
export function useIncomingCrossPk(roomId: string): IncomingCrossPk | null {
  useSyncExternalStore(
    (l) => {
      incomingListeners.add(l);
      return () => void incomingListeners.delete(l);
    },
    () => incomingVersion,
    () => incomingVersion,
  );
  const inv = incoming.get(roomId) ?? null;
  // Its answer time runs out on the server with no packet: read the room's PK again right then.
  const expiresAt = inv?.expiresAt ?? 0;
  useEffect(() => {
    const ms = expiresAt - Date.now();
    if (!expiresAt || ms < 0 || ms > 2 ** 31 - 1) return;
    const t = setTimeout(() => refreshRoomPkSoon(roomId, 0), ms + 700);
    return () => clearTimeout(t);
  }, [roomId, expiresAt]);
  return inv;
}

/**
 * The room's cross-room PK into the store. Seen from the invited room, one that never started (an invite, declined
 * or expired, withdrawn) is no board and no result: only the staff's answer card while it waits.
 */
function applyCross(roomId: string, v: api.ServerCrossPk | null, now: string): PkSession | null {
  const skew = Date.parse(now) - Date.now();
  v?.people.forEach((u) => rememberUser(u));
  // The other room's name and cover for the boards (this room's own read stays the room screen's).
  for (const r of [v?.red.room, v?.blue.room]) if (r && r.id !== roomId) roomOf(r);
  const invited = !!v && v.blue.room?.id === roomId;
  const waiting = invited && v.status === 'invite' && v.red.room ? v : null;
  setIncoming(roomId, waiting ? { id: waiting.id, fromRoomId: waiting.red.room!.id, durationMin: waiting.durationMin, expiresAt: Date.parse(waiting.inviteExpiresAt) - skew } : null);
  const quiet = invited && !v.startAt;
  const pk = v && !quiet ? serverCrossSession(v, toLocal, skew) : null;
  if (pk && (pk.status === 'invite' || pk.status === 'prep' || pk.status === 'active')) watched.add(pk.id);
  else if (pk && !watched.has(pk.id)) {
    markPkSeen(pk.id);
    markPkSeen(`${pk.id}:crowns`);
  }
  applyServerCrossPk(roomId, pk);
  return pk;
}

/** Rooms my room may invite (the server's list; `q`: a room's ID or part of its name). Read while the tab is open. */
export function useCrossPkRooms(roomId: string, enabled: boolean, query: string): { rooms: Room[] | null; failed: boolean } {
  const [state, setState] = useState<{ rooms: Room[] | null; failed: boolean }>({ rooms: null, failed: false });
  const q = query.trim();
  useEffect(() => {
    if (!enabled) return;
    let on = true;
    const t = setTimeout(
      () =>
        api.crossPkRooms(roomId, q).then(
          (list) => on && setState({ rooms: list.filter((r) => !r.closed).map(roomOf), failed: false }),
          () => on && setState((s) => ({ ...s, failed: true })),
        ),
      q ? 400 : 0,
    );
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [roomId, enabled, q]);
  return state;
}

/** Invites another room (owner and admins; the server checks both rooms, the blocks and that both are free). */
export async function inviteLiveCrossPk(roomId: string, toRoomId: string, durationMin: number): Promise<StartResult> {
  try {
    const r = await once(`xpk:${roomId}:${toRoomId}:${durationMin}`, (ref) => api.inviteCrossPk({ room: roomId, to: toRoomId, durationMin, ref }));
    next(roomId);
    const pk = applyCross(roomId, r.cross, r.now);
    return pk ? { ok: true, pk } : { ok: false, reason: 'Davet gönderilemedi. Tekrar dene.' };
  } catch (e) {
    if (e instanceof api.ApiError && e.status === 409) void refreshRoomPk(roomId).catch(() => {});
    return { ok: false, reason: message(e) };
  }
}

/** The invited room's staff accept or decline. */
export async function answerLiveCrossPk(roomId: string, id: string, accept: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const r = await api.answerCrossPk(roomId, id, accept);
    next(roomId);
    applyCross(roomId, r.cross, r.now);
    return { ok: true };
  } catch (e) {
    void refreshRoomPk(roomId).catch(() => {});
    return { ok: false, reason: message(e) };
  }
}

/** Either room's staff: withdraws or declines the invite, or ends the running PK early (no winner). */
export async function endLiveCrossPk(roomId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const r = await api.endCrossPk(roomId);
    next(roomId);
    applyCross(roomId, r.cross, r.now);
    return { ok: true };
  } catch (e) {
    void refreshRoomPk(roomId).catch(() => {});
    return { ok: false, reason: message(e) };
  }
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();
/** A read soon; several asks within `ms` make one read (a burst of gifts). */
export function refreshRoomPkSoon(roomId: string, ms = 400) {
  if (pending.has(roomId)) return;
  pending.set(
    roomId,
    setTimeout(() => {
      pending.delete(roomId);
      void refreshRoomPk(roomId).catch(() => {});
    }, ms),
  );
}

export type LivePkStart = { roomId: string; durationMin: number } & ({ mode: 'solo'; participants: string[] } | { mode: 'team'; red: string[]; blue: string[] });

/** Starts the room's PK on the server (owner and admins; the server checks it and who is on a mic). */
export async function startLivePk(o: LivePkStart): Promise<StartResult> {
  const server = (list: string[]) => {
    const ids = list.map(toServer);
    return ids.every((x): x is string => x !== null) ? ids : null;
  };
  const people = o.mode === 'solo' ? [server(o.participants)] : [server(o.red), server(o.blue)];
  if (people.some((x) => x === null)) return { ok: false, reason: 'Mikrofondakilerden biri bulunamadı. Odaya yeniden girip tekrar dene.' };
  const [a, b] = people as string[][];
  try {
    const r = await once(`pk:${o.roomId}`, (ref) =>
      api.startServerPk(o.mode === 'solo' ? { room: o.roomId, mode: 'solo', durationMin: o.durationMin, participants: a, ref } : { room: o.roomId, mode: 'team', durationMin: o.durationMin, red: a, blue: b, ref }),
    );
    next(o.roomId);
    const pk = apply(o.roomId, r);
    return pk ? { ok: true, pk } : { ok: false, reason: 'PK başlatılamadı. Tekrar dene.' };
  } catch (e) {
    // "Already one running": show it.
    if (e instanceof api.ApiError && e.status === 409) void refreshRoomPk(o.roomId).catch(() => {});
    return { ok: false, reason: message(e) };
  }
}

/** Cancels the room's running PK (owner and admins). */
export async function cancelLivePk(roomId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const r = await api.cancelServerPk(roomId);
    next(roomId);
    apply(roomId, r);
    return { ok: true };
  } catch (e) {
    void refreshRoomPk(roomId).catch(() => {});
    return { ok: false, reason: message(e) };
  }
}

const OPEN_POLL_MS = 10_000;
const IDLE_POLL_MS = 30_000;

/**
 * Keeps the room's PK read while I'm in a server room. `pk` is the room's open PK as the screen has it (null:
 * none): its countdown and end are read again right when they pass.
 */
export function useRoomPkSync(roomId: string, enabled: boolean, pk: PkSession | null) {
  useEffect(() => {
    if (!enabled) return;
    void refreshRoomPk(roomId).catch(() => {});
    const offPk = onServerPk(roomId, () => refreshRoomPkSoon(roomId, 0));
    // The server scores a gift in its own transaction, before it announces it: read the new score.
    const offGift = onSignal(roomId, (_from, msg) => {
      if ((msg.t === 'gift' || msg.t === 'lucky') && pkOfRoom(roomId)) refreshRoomPkSoon(roomId);
    });
    return () => {
      offPk();
      offGift();
    };
  }, [roomId, enabled]);

  const open = pk && (pk.status === 'invite' || pk.status === 'prep' || pk.status === 'active') ? pk : null;
  // A cross-room invite's answer time runs out on the server with no packet: read it right then.
  const inviteAt = open?.status === 'invite' ? (open.inviteExpiresAt ?? 0) : 0;
  const startAt = open?.startAt ?? 0;
  const endAt = open?.endAt ?? 0;
  useEffect(() => {
    if (!enabled) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const poll = setInterval(() => void refreshRoomPk(roomId).catch(() => {}), open ? OPEN_POLL_MS : IDLE_POLL_MS);
    // A little after the moment, so the server's clock has passed it too.
    for (const at of [inviteAt, startAt, endAt]) {
      const ms = at - Date.now();
      if (at && ms > 0 && ms < 2 ** 31 - 1) timers.push(setTimeout(() => refreshRoomPkSoon(roomId, 0), ms + 700));
    }
    return () => {
      clearInterval(poll);
      timers.forEach(clearTimeout);
    };
    // `open` only matters as "is there one": its times are in the list.
  }, [roomId, enabled, !!open, inviteAt, startAt, endAt]); // eslint-disable-line react-hooks/exhaustive-deps
}
