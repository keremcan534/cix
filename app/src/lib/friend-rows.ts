// Mesajlar › Arkadaşlarım: everyone I follow and everyone who follows me, people who follow each other first, then who
// is online. Who follows me is the demo's sample list, or the server's in a live build (lib/live/friends). Pure.
import type { User } from '@/data/mock';

export type Friend = { user: User; iFollow: boolean; followsMe: boolean };

export function friendRows(following: ReadonlySet<string>, followers: ReadonlySet<string>, blocked: ReadonlySet<string>, person: (id: string) => User): Friend[] {
  const ids = [...new Set([...following, ...followers])].filter((id) => !blocked.has(id) && id !== 'me');
  return ids
    .map((id) => ({ user: person(id), iFollow: following.has(id), followsMe: followers.has(id) }))
    .sort((a, b) => Number(b.iFollow && b.followsMe) - Number(a.iFollow && a.followsMe) || Number(b.user.online) - Number(a.user.online));
}
