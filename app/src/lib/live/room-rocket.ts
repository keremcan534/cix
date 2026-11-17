// Live mode (lib/live): a server room's Oda roketi (GET /api/rooms/rocket, server/api/room-rocket.mjs). Read when the
// room opens and every minute; shortly after a gift lands in the room, at most once in ten seconds (everyone in the
// room reads it); every five seconds while its sheet is open; and at once when the server says a level launched or
// its prizes were paid ('rocket' packets, lib/live/room-bus), which also come out one by one for the show. A failed
// read keeps the last answer on screen. What was read is kept with its room, so another room never shows it. Nothing
// is saved on the phone.
import { useEffect, useRef, useState } from 'react';

import * as api from '@/lib/api';
import { onServerRocket, type RocketNews } from '@/lib/live/room-bus';
import { parseRocket, type RoomRocket } from '@/lib/room-rocket-core';

const EVERY_MS = 60_000;
const OPEN_EVERY_MS = 5_000;
/** After a gift: the server has written it by then. */
const AFTER_GIFT_MS = 1_200;
const GIFT_GAP_MS = 10_000;

/**
 * The rocket of server room `roomId` (null: none, not a server room). `open`: its sheet is open. `bump` changes when a
 * gift lands in the room. `show`: the launch or payout the server announced that plays now (a launch and its payout
 * come one after the other: each plays in turn); `next()` when it has played.
 */
export function useRoomRocket(roomId: string | null, { open, bump }: { open: boolean; bump?: unknown }) {
  const [got, setGot] = useState<{ room: string; rocket: RoomRocket } | null>(null);
  const [queue, setQueue] = useState<{ room: string; news: RocketNews }[]>([]);
  const lastRead = useRef(0);
  const load = useRef<() => void>(() => {});
  useEffect(() => {
    if (!roomId) return;
    let on = true;
    load.current = () => {
      lastRead.current = Date.now();
      api.roomRocket(roomId).then(
        (raw) => {
          const rocket = parseRocket(raw);
          if (on && rocket) setGot({ room: roomId, rocket });
        },
        () => {},
      );
    };
    load.current();
    const off = onServerRocket(roomId, (news) => {
      if (!on) return;
      // The same announcement twice (a reconnect) plays once; a short line, never a long backlog.
      setQueue((q) => [...q.filter((x) => x.room === roomId && !(x.news.launch === news.launch && x.news.event === news.event)), { room: roomId, news }].slice(-4));
      load.current();
    });
    return () => {
      on = false;
      off();
      load.current = () => {};
    };
  }, [roomId]);
  // Every minute, every five seconds while the sheet is open (and once as it opens).
  useEffect(() => {
    if (!roomId) return;
    if (open) load.current();
    const t = setInterval(() => load.current(), open ? OPEN_EVERY_MS : EVERY_MS);
    return () => clearInterval(t);
  }, [roomId, open]);
  // A gift landed: read it again a moment later, unless it was read a short while ago (the sheet reads anyway).
  const lastBump = useRef(bump);
  useEffect(() => {
    if (bump === lastBump.current) return;
    lastBump.current = bump;
    if (!roomId || open || Date.now() - lastRead.current < GIFT_GAP_MS) return;
    const t = setTimeout(() => load.current(), AFTER_GIFT_MS);
    return () => clearTimeout(t);
  }, [roomId, open, bump]);
  const shown = queue.find((x) => x.room === roomId) ?? null;
  return {
    rocket: got && got.room === roomId ? got.rocket : null,
    show: shown?.news ?? null,
    next: () => setQueue((q) => q.filter((x) => x !== shown)),
  };
}
