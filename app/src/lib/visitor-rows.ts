// The rows of "Profilimi Kimler Ziyaret Etti" (components/visitors-sheet): from the server's list (lib/live/visitors)
// or the demo's sample visitors. Pure, so the shaping is unit tested.
import type { ServerVisitor } from '@/lib/api';
import type { ProfileVisitor } from '@/data/messages-ui';
import type { User } from '@/data/mock';
import { ago } from '@/lib/admin-format';

export type VisitorRow = {
  /** Whose profile a tap opens. */
  id: string;
  name: string;
  avatar?: string;
  online?: boolean;
  /** How many times this week. */
  visits: number;
  /** When the last visit was ("12 dk önce"). */
  when: string;
  /** Their city, when known. */
  place?: string;
};

/** The server's visitors, newest first as they come. */
export const liveVisitorRows = (list: ServerVisitor[], now = new Date()): VisitorRow[] =>
  list.map((v) => ({ id: v.id, name: v.name, ...(v.avatarUrl ? { avatar: v.avatarUrl } : {}), visits: v.visits, when: ago(v.lastAt, now) }));

/** The demo's sample visitors, without people I blocked. */
export const demoVisitorRows = (list: ProfileVisitor[], blocked: ReadonlySet<string>, person: (id: string) => User): VisitorRow[] =>
  list
    .filter((v) => !blocked.has(v.userId))
    .map((v) => {
      const u = person(v.userId);
      return { id: u.id, name: u.age > 0 ? `${u.name}, ${u.age}` : u.name, avatar: u.avatar, online: u.online, visits: v.count, when: v.time, ...(u.city ? { place: u.city } : {}) };
    });
