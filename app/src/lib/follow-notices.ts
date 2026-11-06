// The "Yeni takipçi" notices from a read of my followers (lib/live/follows). Pure, so the node tests check it.

export type FollowerSeen = { id: string; name: string; followedAt: string };
export type FollowNotice = { kind: 'social'; icon: 'person-add'; title: string; body: string; href: string };

/** More new followers than this at once become one notice. */
export const MAX_SINGLE = 3;

/**
 * `seen` is the newest follow time already told (ms), or null on the first read on this phone, which only
 * sets the mark: a reinstall doesn't announce every old follower again. `ids` maps a server id to the app's.
 */
export function followNotices(users: FollowerSeen[], seen: number | null, ids: (id: string) => string = (id) => id): { notices: FollowNotice[]; mark: number } {
  const at = (u: FollowerSeen) => Date.parse(u.followedAt) || 0;
  const newest = users.reduce((t, u) => Math.max(t, at(u)), 0);
  const mark = Math.max(newest, seen ?? 0);
  if (seen === null) return { notices: [], mark };
  // Oldest first, so the newest ends up on top of the list.
  const fresh = users.filter((u) => at(u) > seen).sort((a, b) => at(a) - at(b));
  if (fresh.length > MAX_SINGLE) {
    const last = fresh[fresh.length - 1];
    return { notices: [{ kind: 'social', icon: 'person-add', title: 'Yeni takipçiler', body: `${last.name} ve ${fresh.length - 1} kişi daha seni takip etmeye başladı`, href: '/(tabs)/profil' }], mark };
  }
  return { notices: fresh.map((u) => ({ kind: 'social', icon: 'person-add', title: 'Yeni takipçi', body: `${u.name} seni takip etmeye başladı`, href: `/kullanici/${ids(u.id)}` })), mark };
}
