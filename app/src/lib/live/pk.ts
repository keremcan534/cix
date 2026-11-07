// Oda içi PK in a server room (server/api/pk.mjs): the server keeps the PK, its clock and its points, so every
// phone in the room shows the same PK, score and result. This file reads it into the PK store (lib/pk), which
// the boards, the result and the crowns already draw, and starts or cancels one for the room's owner or admins.
//
// The PK is read on entering the room, when the server announces a start or a cancel ({ type: 'pk' } on the
// room's voice connection), after a gift is announced while a PK runs, when the countdown and the time run out,
// and every few seconds as a fallback (a packet can be missed around a reconnect).
import { useEffect } from 'react';

import * as api from '@/lib/api';
import { message, once, rememberUser, toLocal, toServer } from '@/lib/live';
import { onServerPk, onSignal } from '@/lib/live/room-bus';
import { applyServerPk, markPkSeen, pkOfRoom, serverPkSession, type PkSession, type StartResult } from '@/lib/pk';

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
  const r = await api.roomPk(roomId);
  if (seq.get(roomId) === n) apply(roomId, r);
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

  const open = pk && (pk.status === 'prep' || pk.status === 'active') ? pk : null;
  const startAt = open?.startAt ?? 0;
  const endAt = open?.endAt ?? 0;
  useEffect(() => {
    if (!enabled) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const poll = setInterval(() => void refreshRoomPk(roomId).catch(() => {}), open ? OPEN_POLL_MS : IDLE_POLL_MS);
    // A little after the moment, so the server's clock has passed it too.
    for (const at of [startAt, endAt]) {
      const ms = at - Date.now();
      if (at && ms > 0 && ms < 2 ** 31 - 1) timers.push(setTimeout(() => refreshRoomPkSoon(roomId, 0), ms + 700));
    }
    return () => {
      clearInterval(poll);
      timers.forEach(clearTimeout);
    };
    // `open` only matters as "is there one": its times are in the list.
  }, [roomId, enabled, !!open, startAt, endAt]); // eslint-disable-line react-hooks/exhaustive-deps
}
