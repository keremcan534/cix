// Server room moderation (lib/live) for the room screen: who runs the room, who is kept out, whose mic a room
// mute switched off, and the staff actions the server checks and carries out (server/api/rooms.mjs): kick and
// blacklist, admins, taking someone off a mic or moving them, locking a mic. Nothing here changes the room on
// this phone alone: the screen follows what the server answers and what LiveKit then shows every phone.
import { useCallback, useEffect, useState } from 'react';

import { apiRequest, roomMutes } from '@/lib/api';
import { rememberUser, toLocal } from '@/lib/live';

type StaffAnswer = { owner: string; admins: { id: string; name: string }[]; bans?: { userId: string; name: string; until: string | null }[] };
/** Someone kept out of the room: `until` in ms, null = the room's blacklist. */
export type StaffBan = { uid: string; name: string; until: number | null };
export type SeatAction = { action: 'remove'; user: string } | { action: 'move'; user: string; seat: number } | { action: 'lock' | 'unlock'; seat: number; locked: number[] };

/** `room` is the server room's id; `user` a server user id. */
export const roomStaff = (room: string) => apiRequest<StaffAnswer>('GET', `/api/rooms/staff?room=${encodeURIComponent(room)}`);
/** Kick for `minutes`, or the blacklist with `minutes` null (owner and admins; admins not on admins). */
export const roomBan = (room: string, user: string, minutes: number | null) => apiRequest<{ until: string | null }>('POST', '/api/rooms/ban', { room, user, minutes });
export const roomUnban = (room: string, user: string) => apiRequest<{ banned: false }>('POST', '/api/rooms/unban', { room, user });
/** Owner only. */
export const roomSetAdmin = (room: string, user: string, admin: boolean) => apiRequest<{ admin: boolean }>('POST', '/api/rooms/admin', { room, user, admin });
export const roomSeat = (room: string, body: SeatAction) => apiRequest<{ done?: boolean; lockedSeats?: number[] }>('POST', '/api/rooms/seat', { room, ...body });

export type RoomStaff = {
  /** Local ids (lib/live toLocal) of the room's admins. */
  admins: string[];
  /** Only for the owner and admins; null for everyone else (the server doesn't tell them). */
  bans: StaffBan[] | null;
  /** Local id → the room voice mute's sanction id, for lifting it (owner and admins only). */
  voiceMutes: Map<string, number>;
};
const NONE: RoomStaff = { admins: [], bans: null, voiceMutes: new Map() };

export function staffFrom(s: StaffAnswer, mutes: { id: number; type: string; userId: string }[]): RoomStaff {
  const voiceMutes = new Map<string, number>();
  for (const m of mutes) if (m.type === 'mute_room_voice' && !voiceMutes.has(toLocal(m.userId))) voiceMutes.set(toLocal(m.userId), m.id);
  return {
    admins: s.admins.map((a) => toLocal(a.id)),
    bans: s.bans ? s.bans.map((b) => ({ uid: toLocal(b.userId), name: b.name, until: b.until === null ? null : Date.parse(b.until) })) : null,
    voiceMutes,
  };
}

/** The room's staff from the server, read on entry, every 30 s and after a staff action (`reload`). */
export function useRoomStaff(roomId: string, enabled: boolean) {
  const [staff, setStaff] = useState<RoomStaff>(NONE);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let on = true;
    const load = async () => {
      try {
        const s = await roomStaff(roomId);
        s.admins.forEach((a) => rememberUser(a));
        s.bans?.forEach((b) => rememberUser({ id: b.userId, name: b.name }));
        // Mutes are for staff only, like the bans.
        const mutes = s.bans ? await roomMutes(roomId).catch(() => []) : [];
        mutes.forEach((m) => rememberUser({ id: m.userId, name: m.userName }));
        if (on) setStaff(staffFrom(s, mutes));
      } catch {
        // Offline or the room closed: keep what we last knew; the next read tries again.
      }
    };
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [roomId, enabled, tick]);
  return { ...staff, reload };
}

/** "12 dk", "3 sa", "2 gün" left, or "sınırsız" for the blacklist. */
export function banLeft(until: number | null, now = Date.now()) {
  if (until === null) return 'sınırsız';
  const min = Math.max(1, Math.ceil((until - now) / 60_000));
  if (min < 60) return `${min} dk`;
  if (min < 24 * 60) return `${Math.ceil(min / 60)} sa`;
  return `${Math.ceil(min / (24 * 60))} gün`;
}
