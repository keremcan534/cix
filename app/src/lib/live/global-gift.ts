// Global hediye on this phone (server/api/global-gifts.mjs, lib/global-gift-core): another person's global gift comes
// on the live line, once, and joins the banner line of the room I am in (lib/broadcast, components/fx/win-banner) and
// that room's chat as a line of its own (useGlobalGiftLines, components/room/live-room). The room it was sent in shows
// the gift itself as before (its video, its chat line), so it gets the banner only. No video is fetched for it here.
// The server already leaves out phones of another country and anyone in a block; this phone also skips the people
// it blocked since.
import { useEffect, useRef } from 'react';

import { announceGlobal } from '@/lib/broadcast';
import { globalChatLine, globalGiftBlocked, globalGiftOfLine, type GlobalGift } from '@/lib/global-gift-core';
import type { LineEvent } from '@/lib/live/line-events';

const seen: number[] = [];
const listeners = new Set<(g: GlobalGift) => void>();

/** A live line event: a global gift joins the banners and the chat of the room I am in. True when it was one. */
export function takeGlobalGiftEvent(e: LineEvent): boolean {
  if (e.type !== 'global_gift') return false;
  const g = globalGiftOfLine(e);
  if (!g || seen.includes(g.id)) return true;
  seen.push(g.id);
  if (seen.length > 200) seen.shift();
  announceGlobal(g);
  listeners.forEach((l) => l(g));
  return true;
}

/** Hears each global gift as it comes (the room's chat line). Returns the unsubscribe. */
export function onGlobalGift(fn: (g: GlobalGift) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

type Line = { id: string; system: true; kind: 'gift'; text: string };
/**
 * The room's chat while it is open: a line for each global gift sent elsewhere ("🌍 Kaan → Artemis’e 🚀 Roket gönderdi
 * · Gece Sohbeti odasında"), none from or to someone I `blocked`. `roomId`: this room (its own gifts have their line).
 */
export function useGlobalGiftLines(roomId: string, blocked: { has: (id: string) => boolean }, add: (line: Line) => void) {
  const now = useRef({ add, blocked });
  useEffect(() => {
    now.current = { add, blocked };
  });
  useEffect(
    () =>
      onGlobalGift((g) => {
        if (g.room?.id === roomId || globalGiftBlocked(g, now.current.blocked)) return;
        now.current.add({ id: `global:${g.id}`, system: true, kind: 'gift', text: globalChatLine(g) });
      }),
    [roomId],
  );
}
