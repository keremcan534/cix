// Live mode (lib/live): a server room's Oda roketi (GET /api/rooms/rocket, server/api/room-rocket.mjs). Read when the
// room opens and every minute; shortly after a gift lands in the room, at most once in ten seconds (everyone in the
// room reads it); every five seconds while its sheet is open; and at once when the server says a level launched or
// its prizes were paid ('rocket' packets, lib/live/room-bus). Those packets also go to the room for the show, each once
// and a moment late (lib/rocket-stage ROCKET_GRACE_MS), so the gift that filled the level gets on the stage first. A
// failed read keeps the last answer on screen. What was read is kept with its room, so another room never shows it.
// Nothing is saved on the phone.
import { useEffect, useRef, useState } from 'react';

import * as api from '@/lib/api';
import { onServerRocket, type RocketNews } from '@/lib/live/room-bus';
import { parseRocket, type RoomRocket } from '@/lib/room-rocket-core';
import { ROCKET_GRACE_MS, newsGate } from '@/lib/rocket-stage';

const EVERY_MS = 60_000;
const OPEN_EVERY_MS = 5_000;
/** After a gift: the server has written it by then. */
const AFTER_GIFT_MS = 1_200;
const GIFT_GAP_MS = 10_000;

/**
 * The rocket of server room `roomId` (null: none, not a server room). `open`: its sheet is open. `bump` changes when a
 * gift lands in the room. `onNews`: a launch or payout the server announced, for the room's stage (lib/rocket-stage);
 * each once, in the order they came, ROCKET_GRACE_MS late.
 */
export function useRoomRocket(roomId: string | null, { open, bump, onNews }: { open: boolean; bump?: unknown; onNews?: (news: RocketNews) => void }) {
  const [got, setGot] = useState<{ room: string; rocket: RoomRocket } | null>(null);
  const lastRead = useRef(0);
  const load = useRef<() => void>(() => {});
  const told = useRef(onNews);
  useEffect(() => {
    told.current = onNews;
  });
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
    // The same announcement twice (a reconnect) is handed on once.
    const fresh = newsGate();
    const waits = new Set<ReturnType<typeof setTimeout>>();
    const off = onServerRocket(roomId, (news) => {
      if (!on || !fresh(news)) return;
      load.current();
      const t = setTimeout(() => {
        waits.delete(t);
        if (on) told.current?.(news);
      }, ROCKET_GRACE_MS);
      waits.add(t);
    });
    return () => {
      on = false;
      off();
      waits.forEach(clearTimeout);
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
  return { rocket: got && got.room === roomId ? got.rocket : null };
}
