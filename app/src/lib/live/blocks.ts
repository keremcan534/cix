// Live mode (lib/live): who I follow and who I blocked live on the server. After signing in (and again after
// signing out and in) the store takes both lists from there, so a reinstall or another account on this phone
// doesn't start from the demo's follow or an empty block list.
import * as api from '@/lib/api';
import { rememberUser } from '@/lib/live';

/** The people I blocked (GET /api/blocks); their names are kept for the Engellenenler list. */
export async function loadBlocks(): Promise<string[]> {
  const r = await api.apiRequest<{ users: api.UserCard[] }>('GET', '/api/blocks');
  r.users.forEach(rememberUser);
  return r.users.map((u) => u.id);
}

/** The people I follow (GET /api/following). */
export async function loadFollowing(): Promise<string[]> {
  const users = await api.followingList();
  users.forEach(rememberUser);
  return users.map((u) => u.id);
}
