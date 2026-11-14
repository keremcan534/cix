// The rows of "Profilimi Kimler Ziyaret Etti" (components/visitors-sheet): from the server's list (lib/live/visitors)
// or the demo's sample visitors; without VIP the same visits without who made them, drawn blurred. Pure, so the
// shaping is unit tested.
import type { HiddenVisitor, ServerVisitor } from '@/lib/api';
import type { ProfileVisitor } from '@/data/messages-ui';
import type { User } from '@/data/mock';
import { ago } from '@/lib/admin-format';

export type VisitorRow = {
  /** Whose profile a tap opens; a hidden row's only keys the row. */
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
  /** A visit without who made it (no VIP): no name, photo or profile to open. */
  hidden?: boolean;
};

/** The server's visitors, newest first as they come. */
export const liveVisitorRows = (list: ServerVisitor[], now = new Date()): VisitorRow[] =>
  list.map((v) => ({ id: v.id, name: v.name, ...(v.avatarUrl ? { avatar: v.avatarUrl } : {}), visits: v.visits, when: ago(v.lastAt, now) }));

/** The server's visits without VIP (it sends no one's identity with them), newest first as they come. */
export const hiddenVisitorRows = (list: HiddenVisitor[], now = new Date()): VisitorRow[] =>
  list.map((v, i) => ({ id: `gizli-${i}`, name: '', visits: v.visits, when: ago(v.lastAt, now), hidden: true }));

/** The demo without VIP: its sample visits with who made them taken out, as the server sends them. */
export const hideVisitorRows = (rows: VisitorRow[]): VisitorRow[] => rows.map((r, i) => ({ id: `gizli-${i}`, name: '', visits: r.visits, when: r.when, hidden: true }));

export type VisitNotice = { kind: 'social'; icon: 'eye'; title: string; body: string; href: string };
/**
 * The Bildirimler line for a visit (the server tells at most once a day per visitor): `who` by name with the
 * Abonelik, or null, "biri", which opens my blurred visitors.
 */
export const visitNotice = (who: { id: string; name: string } | null): VisitNotice =>
  who
    ? { kind: 'social', icon: 'eye', title: 'Profil ziyareti', body: `${who.name} profiline baktı`, href: `/kullanici/${who.id}` }
    : { kind: 'social', icon: 'eye', title: 'Profil ziyareti', body: 'Biri profiline baktı. Kim olduğunu abonelikle görebilirsin.', href: '/(tabs)/profil?ziyaretciler=1' };

/** The demo's sample visitors, without people I blocked. */
export const demoVisitorRows = (list: ProfileVisitor[], blocked: ReadonlySet<string>, person: (id: string) => User): VisitorRow[] =>
  list
    .filter((v) => !blocked.has(v.userId))
    .map((v) => {
      const u = person(v.userId);
      return { id: u.id, name: u.age > 0 ? `${u.name}, ${u.age}` : u.name, avatar: u.avatar, online: u.online, visits: v.count, when: v.time, ...(u.city ? { place: u.city } : {}) };
    });
