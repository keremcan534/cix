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
