// Live mode (lib/live): Mesajlar › Arkadaşlarım from the server (GET /api/me/friends, server/api/privacy.mjs): who
// follows me, besides the people I follow (the store's list), and whether each is online or when they were last on,
// as far as they (and I) show it. Read again whenever Mesajlar comes to the front.
import * as api from '@/lib/api';
import { ago } from '@/lib/admin-format';
import { myServerId, toLocal } from '@/lib/live';
import { focusStore } from '@/lib/live/focus-store';
import { putServerUser } from '@/data/mock';

const store = focusStore(async () => {
  const list = await api.myFriends();
  const me = myServerId();
  for (const f of list) {
    if (f.id === me) continue;
    // "Son görülme" is shown as text where the demo shows it (the profile); hidden, there is none.
    putServerUser({ id: f.id, name: f.name, ...(f.avatarUrl ? { avatar: f.avatarUrl } : {}), online: f.online, lastSeen: f.lastSeenAt ? ago(f.lastSeenAt) : undefined });
  }
  return new Set(list.filter((f) => f.followsMe).map((f) => toLocal(f.id)));
});

/** Who follows me on the server (this phone's ids), null until read; `on` false reads nothing. */
export const useLiveFollowers = (on = true) => store.useData(on);
