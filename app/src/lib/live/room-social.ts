// Live mode (lib/live): the room social features the server runs (server/api/room-social.mjs), for the room screen
// and the Odalar tab. Without a server address nothing here runs and the demo keeps its own.
//  - mic invites: read on entering the room, whenever the server says one was sent or answered (a room packet,
//    lib/live/room-bus), and when a waiting one runs out; put into the room's presence model, so the prompt, the
//    "davet bekliyor" marks and the chat lines are the demo's own (lib/room-presence setServerInvites);
//  - the room poll: read the same way, counted down on this phone from what the server said was left;
//  - the Odalar calendar (upcoming events across rooms) and Odalarım › Katıl (rooms I'm a member of), re-read each
//    time the screen comes to the front, like lib/live/visitors;
//  - room invites from accounts I follow, turned into Bildirimler notices by LiveSync (like new followers).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { Room } from '@/data/mock';
import * as api from '@/lib/api';
import { liveMode, myServerId, rememberUser, roomOf, toLocal } from '@/lib/live';
import { onServerInvite, onServerPoll } from '@/lib/live/room-bus';
import { livePoll, localInvite, roomInviteNotices, type LivePoll } from '@/lib/room-social';
import { setServerInvites } from '@/lib/room-presence';
import type { Notice } from '@/store';

// --- Mic invites -----------------------------------------------------------------------------------------------
/**
 * Keeps a server room's mic invites in its presence model while the room is open here. `staff`: the room's owner or
 * an admin, who sees everyone's invites; anyone else reads only when an invite concerns them. Returns a re-read.
 */
export function useServerMicInvites(roomId: string, enabled: boolean, staff: boolean) {
  const reload = useRef<() => void>(() => {});
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Invites seen waiting during this visit, or sent after its first read (ids only grow): only their answers are
    // news, not one answered before I came in.
    const known = new Set<number>();
    let floor: number | null = null;
    const read = () =>
      void api.roomMicInvites(roomId).then(
        (all) => {
          if (!alive) return;
          const base = (floor ??= Math.max(0, ...all.map((i) => i.id)));
          all.forEach((i) => (i.status === 'pending' || i.id > base) && known.add(i.id));
          const list = all.filter((i) => known.has(i.id));
          list.forEach((i) => (rememberUser(i.from), rememberUser(i.to)));
          const now = Date.now();
          setServerInvites(roomId, list.map((i) => localInvite(i, toLocal, now)));
          // A waiting invite runs out: read again just after, when the server has ended it.
          const left = list.filter((i) => i.status === 'pending').map((i) => i.expiresIn);
          if (timer) clearTimeout(timer);
          timer = left.length ? setTimeout(read, Math.min(...left) + 800) : null;
        },
        () => {},
      );
    reload.current = read;
    read();
    const off = onServerInvite(roomId, (news) => {
      const me = myServerId();
      if (staff || !news.to || news.to === me || news.from === me) read();
    });
    return () => {
      alive = false;
      reload.current = () => {};
      off();
      if (timer) clearTimeout(timer);
    };
  }, [roomId, enabled, staff]);
  return useCallback(() => reload.current(), []);
}

// --- Room poll -------------------------------------------------------------------------------------------------
type PollRead = { p: api.ServerPoll; endsAt: number };
/**
 * A server room's poll while the room is open here: null when it has none. `put` takes an answer the server just
 * gave (my vote, the start, the close) without waiting for the next read.
 */
export function useServerPoll(roomId: string, enabled: boolean) {
  const [read, setRead] = useState<PollRead | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // The first read has come (what was already open on entering is known).
  const [ready, setReady] = useState(false);
  const put = useCallback((p: api.ServerPoll | null) => setRead(p ? { p, endsAt: Date.now() + p.endsIn * 1000 } : null), []);
  const reload = useCallback(
    () =>
      void api.roomPoll(roomId).then(
        (p) => (put(p), setReady(true)),
        () => {},
      ),
    [roomId, put],
  );
  useEffect(() => {
    if (!enabled) return;
    reload();
    // A lost packet can't leave the card behind for long.
    const every = setInterval(reload, 30_000);
    const off = onServerPoll(roomId, reload);
    return () => (clearInterval(every), off());
  }, [roomId, enabled, reload]);
  const open = !!read && !read.p.closed;
  const endsAt = read?.endsAt ?? 0;
  useEffect(() => {
    if (!open) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    // Its time is up: the result as the server has it.
    const end = setTimeout(reload, Math.max(0, endsAt - Date.now()) + 1200);
    return () => (clearInterval(tick), clearTimeout(end));
  }, [open, endsAt, reload]);
  const poll: LivePoll | null = enabled && read ? livePoll(read.p, read.endsAt, now) : null;
  return { poll, serverId: read?.p.id ?? null, ready, put, reload };
}

// --- Follower invite (Paylaş › Odaya davet et) ----------------------------------------------------------------
/** The room account's follower count and how long until it may invite them again, for its staff; null until read. */
export function useFollowerInvite(roomId: string, enabled: boolean) {
  const [info, setInfo] = useState<(api.FollowerInviteInfo & { readAt: number }) | null>(null);
  const take = useCallback((r: api.FollowerInviteInfo) => setInfo({ ...r, readAt: Date.now() }), []);
  const reload = useCallback(() => void api.followerInviteInfo(roomId).then(take, () => {}), [roomId, take]);
  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);
  return { info: enabled ? info : null, take, reload };
}

// --- Lists for the Odalar tab ---------------------------------------------------------------------------------
type Snap<T> = { owner: string | null; data: T | null };
/** A small store read again each time a screen that shows it comes to the front (one read at a time). */
function focusStore<T>(load: () => Promise<T>) {
  let snap: Snap<T> = { owner: null, data: null };
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => void listeners.delete(l);
  };
  let reading: Promise<void> | null = null;
  const refresh = () => {
    if (!liveMode()) return Promise.resolve();
    reading ??= (async () => {
      const owner = myServerId();
      const data = await load();
      snap = { owner, data };
      listeners.forEach((l) => l());
    })()
      .catch(() => {})
      .finally(() => (reading = null));
    return reading;
  };
  const useList = (): T | null => {
    const s = useSyncExternalStore(subscribe, () => snap, () => snap);
    const focused = useIsFocused();
    useEffect(() => {
      if (liveMode() && focused) void refresh();
    }, [focused]);
    // Another account signed in on this phone: not its list.
    const me = myServerId();
    return me && s.owner && s.owner !== me ? null : s.data;
  };
  return { refresh, useList };
}

const upcoming = focusStore(() => api.upcomingEvents());
const joined = focusStore(() => api.joinedRooms().then((rooms) => rooms.filter((r) => !r.closed).map(roomOf)));
/** The Odalar calendar: upcoming events in rooms I can see (null until read, always without a server). */
export const useUpcomingEvents = upcoming.useList;
/** Odalarım › Katıl: the open rooms I'm a member or an admin of (null until read). */
export const useJoinedRooms: () => Room[] | null = joined.useList;

// --- Room invites from accounts I follow ----------------------------------------------------------------------
const seenKey = (me: string) => `canli:oda-davet-son:${me}`;

/** Reads the room invites for me and tells me about the new ones (lib/room-social roomInviteNotices). */
export async function checkRoomInvites(notify: (n: Omit<Notice, 'id' | 'time' | 'read'>) => void) {
  const me = myServerId();
  if (!me) return;
  const invites = await api.myRoomInvites();
  if (myServerId() !== me) return;
  invites.forEach((i) => rememberUser(i.host));
  const saved = await AsyncStorage.getItem(seenKey(me)).catch(() => null);
  const n = saved === null ? NaN : Number(saved);
  const { notices, mark } = roomInviteNotices(invites, Number.isFinite(n) ? n : null, Date.now());
  notices.forEach(notify);
  const next = String(mark || 0);
  if (next !== saved) await AsyncStorage.setItem(seenKey(me), next).catch(() => {});
}
