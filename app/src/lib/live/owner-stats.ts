// Live mode (lib/live): Oda Sahibi Merkezi of my server room (GET /api/rooms/owner-stats, server/api/room-owner.mjs).
// This session's visitors, the peak, the gifts in the room, the level progress and the hourly listeners, counted on
// the server. Read when the room card opens and every 20 seconds while it stays open; only the room's owner gets
// them (the server checks). They stay in the room screen's memory only; nothing is saved on the phone.
import { useEffect, useState } from 'react';

import * as api from '@/lib/api';

const EVERY_MS = 20_000;

/** The owner's numbers for `roomId` while `enabled` (the card is open): null until the first read answers. */
export function useOwnerStats(roomId: string, enabled: boolean): api.ServerOwnerStats | null {
  const [read, setRead] = useState<{ roomId: string; stats: api.ServerOwnerStats } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let on = true;
    const load = () =>
      api.roomOwnerStats(roomId).then(
        (stats) => on && setRead({ roomId, stats }),
        () => undefined, // a failed read keeps the last numbers
      );
    void load();
    const t = setInterval(load, EVERY_MS);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [roomId, enabled]);
  return read?.roomId === roomId ? read.stats : null;
}
