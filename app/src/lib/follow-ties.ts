// Takip ettiklerim, Takipçilerim and Arkadaşlar: my follows as three separate lists. Someone I follow who follows me
// back is a friend and is only under Arkadaşlar; Takip ettiklerim is the rest of whom I follow, Takipçilerim the rest
// of who follows me. The numbers on a profile count the same way (tieCounts), so each number is its list. Nobody
// else's lists are shown (the server refuses them: server/api/social.mjs followList). Pure.

export type TieSide = 'following' | 'followers' | 'friends';
export type Tie = { id: string; iFollow: boolean; followsMe: boolean };

/** Which of my lists someone is on, by the follows between us (null: none). */
export const tieSideOf = (iFollow: boolean, followsMe: boolean): TieSide | null => (iFollow && followsMe ? 'friends' : iFollow ? 'following' : followsMe ? 'followers' : null);

/** My follows both ways, one row a person (whom I follow first, each set in its order), without me and the people I blocked. */
export function tiesOf(following: Iterable<string>, followers: Iterable<string>, blocked: ReadonlySet<string>): Tie[] {
  const mine = new Set(following);
  const theirs = new Set(followers);
  return [...new Set([...mine, ...theirs])].filter((id) => id !== 'me' && !blocked.has(id)).map((id) => ({ id, iFollow: mine.has(id), followsMe: theirs.has(id) }));
}

/** The three lists, each keeping the order it was given in. */
export function splitTies<T extends Tie>(ties: readonly T[]): Record<TieSide, T[]> {
  const out: Record<TieSide, T[]> = { following: [], followers: [], friends: [] };
  for (const t of ties) {
    const side = tieSideOf(t.iFollow, t.followsMe);
    if (side) out[side].push(t);
  }
  return out;
}

/** What a profile read (GET /api/user) says about someone's follows. `oneWay` and `friends` are missing from an older server. */
export type TieTotals = { followers: number; following: number; friends?: number; oneWay?: { followers: number; following: number } };

/**
 * The numbers a profile shows: Takipçi and Takip one-way only, Arkadaş the people who follow each other. An older
 * server sends totals only: the friends come off them (none known: the totals stay, and no friends number).
 */
export function tieCounts(p: TieTotals): { followers: number; following: number; friends: number | null } {
  const friends = typeof p.friends === 'number' ? p.friends : null;
  if (p.oneWay) return { followers: p.oneWay.followers, following: p.oneWay.following, friends };
  const off = friends ?? 0;
  return { followers: Math.max(0, p.followers - off), following: Math.max(0, p.following - off), friends };
}
