// Live mode (lib/live): a server room's Katkı sıralaması (GET /api/rooms/contrib, server/api/room-contrib.mjs). Read
// when the list opens or its tab or period changes, again shortly after a gift lands in the room, and every 20
// seconds while it stays open. Each list's last answer is kept for the run, so going back to a tab shows it at once
// while it is read again; nothing is saved on the phone. The room's top bar shows today's Cömertlik top three from
// the same list (useRoomTop), read less often since every phone in the room reads it.
import { useEffect, useRef, useState } from 'react';

import * as api from '@/lib/api';
import { rememberUser, toLocal } from '@/lib/live';
import type { ContribPeriod, ContribRow, ContribSide, MyPlace } from '@/lib/room-contrib';

export type LiveContrib = { rows: ContribRow[]; me: MyPlace };

const EVERY_MS = 20_000;
/** After a gift: the server has written it by then. */
const AFTER_GIFT_MS = 900;
/** The room's top bar: read every minute, and after gifts at most once in this long (everyone in the room reads it). */
const TOP_EVERY_MS = 60_000;
const TOP_GAP_MS = 10_000;
const kept = new Map<string, LiveContrib>();
const keep = (key: string, r: api.RoomContribBody) => {
  r.rows.forEach((x) => rememberUser(x.user));
  kept.set(key, { rows: r.rows.map((x) => ({ uid: toLocal(x.user.id), score: x.score, rank: x.rank })), me: r.me });
};

/**
 * The list for `roomId` while `enabled` (the sheet is open). `board` is null until the first answer; `failed` only
 * when there is nothing to show (an older answer stays on screen when a later read fails). `bump` changes when a
 * gift lands in the room.
 */
export function useRoomContrib(roomId: string, side: ContribSide, period: ContribPeriod, enabled: boolean, bump?: unknown) {
  const key = `${roomId}:${side}:${period}`;
  const [, setSeen] = useState(0);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let on = true;
    const load = () =>
      api.roomContrib(roomId, side, period).then(
        (r) => {
          if (!on) return;
          keep(key, r);
          setFailedKey(null);
          setSeen((n) => n + 1);
        },
        () => on && setFailedKey(key),
      );
    void load();
    const t = setInterval(load, EVERY_MS);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [roomId, side, period, enabled, key, round]);
  // A gift landed while the list is open: read it again a moment later.
  const lastBump = useRef(bump);
  useEffect(() => {
    if (lastBump.current === bump) return;
    lastBump.current = bump;
    if (!enabled) return;
    const t = setTimeout(() => setRound((n) => n + 1), AFTER_GIFT_MS);
    return () => clearTimeout(t);
  }, [bump, enabled]);
  const board = kept.get(key) ?? null;
  return { board, failed: !board && failedKey === key, retry: () => setRound((n) => n + 1) };
}

/**
 * The three at the top of a server room's Cömertlik today, for the room's top bar (local ids, first place first): the
 * board's own list, so every phone shows the same three whenever it came in, not only the gifts it saw. Read when
 * the room opens, every minute, and again after a gift lands (`bump`), at most once in TOP_GAP_MS however many land.
 */
export function useRoomTop(roomId: string, enabled: boolean, bump?: unknown): string[] {
  const key = `${roomId}:sent:day`;
  const [, setSeen] = useState(0);
  const [round, setRound] = useState(0);
  const lastRead = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    let on = true;
    const load = () => {
      lastRead.current = Date.now();
      api.roomContrib(roomId, 'sent', 'day').then(
        (r) => {
          if (!on) return;
          keep(key, r);
          setSeen((n) => n + 1);
        },
        () => {},
      );
    };
    load();
    const t = setInterval(load, TOP_EVERY_MS);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [roomId, enabled, key, round]);
  const lastBump = useRef(bump);
  useEffect(() => {
    if (lastBump.current === bump) return;
    lastBump.current = bump;
    if (!enabled) return;
    // A new gift moves the read to the end of the gap at the latest; more gifts in between don't push it further.
    const t = setTimeout(() => setRound((n) => n + 1), Math.max(AFTER_GIFT_MS, lastRead.current + TOP_GAP_MS - Date.now()));
    return () => clearTimeout(t);
  }, [bump, enabled]);
  return enabled ? topOf(kept.get(key)) : [];
}

/** The first three places of a list (fewer while fewer gave). */
export const topOf = (board: LiveContrib | undefined, n = 3) => (board?.rows ?? []).filter((r) => r.rank <= n).map((r) => r.uid);
