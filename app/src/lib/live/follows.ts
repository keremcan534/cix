// Live mode (lib/live): the Takipçiler / Takip lists from the server, and the "Yeni takipçi" notice. Push
// notifications are not set up yet, so a new follower is noticed by this phone itself: LiveSync reads my
// followers now and then and tells me about the ones newer than the last time it looked.
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as api from '@/lib/api';
import { followNotices } from '@/lib/follow-notices';
import { myServerId, rememberUser, toLocal } from '@/lib/live';
import type { Notice } from '@/store';

export type FollowSide = 'followers' | 'following';
export type FollowPerson = { id: string; name: string; avatarUrl: string | null };

/** One list of `userId` (a server id; default me). The ids come back as this app's own (mine is 'me'). */
export async function loadFollowList(side: FollowSide, userId?: string): Promise<FollowPerson[]> {
  const users = await api.followList(side, userId);
  users.forEach(rememberUser);
  return users.map((u) => ({ id: toLocal(u.id), name: u.name, avatarUrl: u.avatarUrl }));
}

const seenKey = (me: string) => `canli:takipci-son:${me}`;

/** Reads my followers and tells me about the new ones (lib/follow-notices). */
export async function checkNewFollowers(notify: (n: Omit<Notice, 'id' | 'time' | 'read'>) => void) {
  const me = myServerId();
  if (!me) return;
  const users = await api.followList('followers');
  if (myServerId() !== me) return;
  users.forEach(rememberUser);
  const saved = await AsyncStorage.getItem(seenKey(me)).catch(() => null);
  const n = saved === null ? NaN : Number(saved);
  const { notices, mark } = followNotices(users, Number.isFinite(n) ? n : null, toLocal);
  notices.forEach(notify);
  const next = String(mark || Date.now());
  if (next !== saved) await AsyncStorage.setItem(seenKey(me), next).catch(() => {});
}
