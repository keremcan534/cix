// Mesajlar › Arkadaşlarım: my friends, the people I follow who follow me back (lib/follow-ties; one-way follows are
// on the Ben tab's Takip ettiklerim and Takipçilerim), who is online first. Who follows me is the demo's sample list,
// or the server's in a live build (lib/live/friends). Pure.
import type { User } from '@/data/mock';
import { splitTies, tiesOf } from '@/lib/follow-ties';

export type Friend = { user: User };

export function friendRows(following: ReadonlySet<string>, followers: ReadonlySet<string>, blocked: ReadonlySet<string>, person: (id: string) => User): Friend[] {
  return splitTies(tiesOf(following, followers, blocked))
    .friends.map((t) => ({ user: person(t.id) }))
    .sort((a, b) => Number(b.user.online) - Number(a.user.online));
}
