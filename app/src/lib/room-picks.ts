// "Şu an popüler" in the leave sheet (components/room/leave-sheet): the busiest open rooms right now that the person
// can walk straight into. Left out: the room being left, their own room, a password room they have no password for
// and any room whose owner they blocked. Fullest first; rooms with the same count keep the list's order.
import type { Room } from '@/data/mock';

export type PickRules = {
  /** The room being left. */
  current: string;
  blocked: ReadonlySet<string>;
  /** True when the room asks for a password this person hasn't got. */
  needsPassword: (room: Room) => boolean;
};

export function popularRooms(rooms: readonly Room[], { current, blocked, needsPassword }: PickRules, n = 4): Room[] {
  return rooms
    .filter((r) => r.id !== current && r.hostId !== 'me' && !blocked.has(r.hostId) && !needsPassword(r))
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.listeners - a.r.listeners || a.i - b.i)
    .slice(0, n)
    .map((x) => x.r);
}

/**
 * A swipe on the room's stage (owners, 21 Nov 2026: "aşağı yukarı hareketle odalar arasında geçiş yapılabilsin"):
 * the open rooms in the order of "Şu an popüler" (fullest first), and the next one (`dir` 1, a swipe up) or the one
 * before it (-1) that can be entered straight away, by the same rules. The room I'm in keeps its place in the order
 * even when it is one the rules leave out (my own room); a room no longer listed starts from the top. None: null.
 */
export function swipeRoom(rooms: readonly Room[], rules: PickRules, dir: 1 | -1): Room | null {
  const order = rooms
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.listeners - a.r.listeners || a.i - b.i)
    .map((x) => x.r);
  const ok = (r: Room) => r.id !== rules.current && r.hostId !== 'me' && !rules.blocked.has(r.hostId) && !rules.needsPassword(r);
  const at = order.findIndex((r) => r.id === rules.current);
  if (at < 0) return (dir === 1 ? order : [...order].reverse()).find(ok) ?? null;
  for (let i = at + dir; i >= 0 && i < order.length; i += dir) if (ok(order[i])) return order[i];
  return null;
}
