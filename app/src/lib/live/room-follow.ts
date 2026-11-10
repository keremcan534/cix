// Following a room and reading its member list, for the room screen and the Odalar tab. A live build asks the
// server (server/api/room-follow.mjs, room-members.mjs); the demo keeps its follows on this phone and builds the
// member list from the sample people, so both builds show the same screens.
//  - the heart in the room header: whether I follow the room, how many do, and the tap (useRoomFollow);
//  - Odalarım › Katıl: the rooms I follow, open or closed (useFollowedRooms);
//  - the room card's full member list of a server room, a page at a time (useServerMemberList).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { ROOMS, roomById, type Room } from '@/data/mock';
import * as api from '@/lib/api';
import { isLiveRoom, liveMode, rememberUser, roomOf, toLocal } from '@/lib/live';
import { focusStore } from '@/lib/live/focus-store';
import { addMemberPage, demoFollowers, putRoomFollow, roomFollowOf, subscribeRoomFollow, toggledFollow, type MemberFilter, type MemberRow, type RoomFollow } from '@/lib/room-follow';

// --- The demo's follows ------------------------------------------------------------------------------------------
// Sample rooms I follow, kept on this phone so Odalarım still lists them after the app restarts.
const DEMO_KEY = 'similarclub:demo-room-follows:v1';
let demoIds: readonly string[] = [];
const demoListeners = new Set<() => void>();
const subscribeDemo = (l: () => void) => {
  demoListeners.add(l);
  return () => void demoListeners.delete(l);
};
const setDemo = (ids: readonly string[], save = true) => {
  demoIds = ids;
  demoListeners.forEach((l) => l());
  if (save) void AsyncStorage.setItem(DEMO_KEY, JSON.stringify(ids)).catch(() => {});
};
if (!liveMode()) {
  void AsyncStorage.getItem(DEMO_KEY)
    .then((saved) => {
      const ids: unknown = saved ? JSON.parse(saved) : [];
      // A follow made before the saved ones were read stays.
      if (Array.isArray(ids)) setDemo([...new Set([...ids.filter((x): x is string => typeof x === 'string'), ...demoIds])], false);
    })
    .catch(() => {});
}
const demoFollow = (roomId: string, ids: readonly string[]): RoomFollow => {
  const following = ids.includes(roomId);
  return { following, followers: demoFollowers(roomById(roomId)) + (following ? 1 : 0) };
};

// --- Follow and unfollow -----------------------------------------------------------------------------------------
const followed = focusStore(() => api.followedRooms().then((rooms) => rooms.map((r) => ({ room: roomOf(r), closed: r.closed }))));

/**
 * Follows or unfollows a room and returns what it is now. A server room: the heart shows the change at once and
 * goes back if the server refuses (the error is thrown for the caller's alert). A sample room: on this phone.
 */
export async function setRoomFollow(roomId: string, follow: boolean): Promise<RoomFollow> {
  if (!isLiveRoom(roomId)) {
    const ids = follow ? [...new Set([roomId, ...demoIds])] : demoIds.filter((x) => x !== roomId);
    setDemo(ids);
    return demoFollow(roomId, ids);
  }
  const was = roomFollowOf(roomId);
  if (was && was.following !== follow) putRoomFollow(roomId, toggledFollow(was));
  try {
    const now = await (follow ? api.followRoom(roomId) : api.unfollowRoom(roomId));
    putRoomFollow(roomId, now);
    void followed.refresh();
    return now;
  } catch (e) {
    if (was) putRoomFollow(roomId, was);
    throw e;
  }
}

/** The room's heart: whether I follow it and how many do (null until the room was read), and the tap. */
export function useRoomFollow(roomId: string) {
  const live = isLiveRoom(roomId);
  const known = useSyncExternalStore(subscribeRoomFollow, () => roomFollowOf(roomId), () => roomFollowOf(roomId));
  const demo = useSyncExternalStore(subscribeDemo, () => demoIds, () => demoIds);
  const state = useMemo(() => (live ? known : demoFollow(roomId, demo)), [live, known, roomId, demo]);
  const following = !!state?.following;
  const toggle = useCallback(() => setRoomFollow(roomId, !following), [roomId, following]);
  return { state, following, toggle };
}

/** Odalarım › Katıl: the rooms I follow. Live: from the server, open ones first, then the closed ones (null until
 *  read). The demo: the sample rooms I followed (all of them open). */
export function useFollowedRooms(): { room: Room; closed: boolean }[] | null {
  const fromServer = followed.useData();
  const demo = useSyncExternalStore(subscribeDemo, () => demoIds, () => demoIds);
  return useMemo(() => {
    if (liveMode()) return fromServer;
    return demo.map((id) => ROOMS.find((r) => r.id === id)).filter((r): r is Room => !!r).map((room) => ({ room, closed: false }));
  }, [fromServer, demo]);
}

// --- The member list of a server room ----------------------------------------------------------------------------
const rowOf = (r: api.RoomMemberRow): MemberRow => ({
  id: toLocal(r.id),
  name: r.name,
  avatar: r.avatarUrl ?? undefined,
  role: r.role,
  inRoom: r.inRoom,
  lastSeen: r.seenAt ? Date.parse(r.seenAt) || null : null,
});
/** `filter`: the filter the rows are of. `failedFilter`: the filter whose first page could not be read. */
type ListState = { filter: MemberFilter | null; rows: MemberRow[]; counts: Record<MemberFilter, number> | null; next: number | null; failedFilter: MemberFilter | null; loadingMore: boolean };
const NOTHING: ListState = { filter: null, rows: [], counts: null, next: null, failedFilter: null, loadingMore: false };

/**
 * One filter of a server room's member list while its sheet is open: the first page on opening, on a new filter and
 * whenever `refreshKey` changes (a member was accepted, removed, joined or left); `more` adds the next page.
 * `rows` is null until the filter's first page came; the counts stay through a filter change.
 */
export function useServerMemberList(roomId: string, enabled: boolean, filter: MemberFilter, refreshKey: unknown) {
  const [s, setS] = useState<ListState>(NOTHING);
  // Each new first page starts a new read: an older answer still on its way is dropped.
  const read = useRef(0);
  const load = useCallback(
    (offset: number) => {
      const mine = offset ? read.current : ++read.current;
      api.roomMemberList(roomId, filter, offset).then(
        (p) => {
          if (mine !== read.current) return;
          p.rows.forEach(rememberUser);
          const page = p.rows.map(rowOf);
          setS((was) => ({ filter, rows: offset && was.filter === filter ? addMemberPage(was.rows, page) : page, counts: p.counts, next: p.nextOffset, failedFilter: null, loadingMore: false }));
        },
        // A first page that failed has nothing to show; a later page that failed keeps the rows.
        () => mine === read.current && setS((was) => ({ ...was, failedFilter: offset ? was.failedFilter : filter, loadingMore: false })),
      );
    },
    [roomId, filter],
  );
  useEffect(() => {
    if (enabled) load(0);
    return () => {
      read.current += 1;
    };
  }, [enabled, load, refreshKey]);
  const current = enabled && s.filter === filter;
  const next = current ? s.next : null;
  const more = useCallback(() => {
    if (next === null) return;
    setS((was) => (was.loadingMore ? was : { ...was, loadingMore: true }));
    load(next);
  }, [next, load]);
  return {
    rows: current ? s.rows : null,
    counts: enabled ? s.counts : null,
    hasMore: next !== null,
    loadingMore: current && s.loadingMore,
    failed: enabled && !current && s.failedFilter === filter,
    more,
    retry: useCallback(() => load(0), [load]),
  };
}
