// Live mode (lib/live): my own numbers on the "Ben" tab and my agency on the profile pill, read from the server.
// Takipçi, Takip and Arkadaş come from my public profile (GET /api/user?id=<my server id>), counted as my three
// lists are (lib/follow-ties tieCounts: one-way follows, friends apart), my agency from the same answer the /ajans
// hub shows (GET /api/agency/me). The Ben tab reads both again each time it comes to the front; other screens only
// read what is there. Without a server address nothing here runs.
import { useIsFocused } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';

import * as api from '@/lib/api';
import { agencyNet, type AssistantRemoval } from '@/lib/agency-net';
import { tieCounts } from '@/lib/follow-ties';
import { liveMode, myServerId } from '@/lib/live';
import { putTies } from '@/lib/live/profile';
import { agencyLinkOf, type AgencyLink } from '@/lib/me-view';

/** `friends` null: an older server that doesn't count them. */
export type MeStats = { serverId: string; followers: number; following: number; friends: number | null };
/** `agency` undefined: not read yet (or the read failed); null: I have no agency. `owner`: whose numbers these are. */
/** `removal`: a request to end my assistant role that waits for me or sits with management (owners, 25 Nov 2026). */
type Snap = { owner: string | null; stats: MeStats | null; agency: AgencyLink | null | undefined; removal?: AssistantRemoval | null; /** An agency assistant now (Asistan merkezi). */ assistant?: boolean; /** Another account on this phone is its streamer: no "Yayıncı ol" (owners, 26 Nov 2026). */ deviceTaken?: boolean; /** An assistant offer waiting for my answer. */ offer?: { id: number; agency: { id: string; name: string }; share: { pct: number; since: string } } | null };

const EMPTY: Snap = { owner: null, stats: null, agency: undefined };
let snap: Snap = EMPTY;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const put = (p: Partial<Snap>) => {
  snap = { ...snap, ...p };
  listeners.forEach((l) => l());
};

let reading: Promise<void> | null = null;
/** Reads my counts and my agency again (one read at a time); a part that fails keeps what was there. */
export function refreshMeStats(): Promise<void> {
  if (!liveMode()) return Promise.resolve();
  reading ??= (async () => {
    const id = myServerId() ?? (await api.me()).id;
    // Another account signed in on this phone: the last one's numbers go first.
    if (snap.owner !== id) put({ ...EMPTY, owner: id });
    const [profile, agency] = await Promise.allSettled([api.userProfile(id), agencyNet.me()]);
    if (snap.owner !== id) return;
    if (profile.status === 'fulfilled') putTies(id, profile.value);
    put({
      ...(profile.status === 'fulfilled' && { stats: { serverId: id, ...tieCounts(profile.value) } }),
      ...(agency.status === 'fulfilled' && { agency: agencyLinkOf(agency.value), removal: openRemoval(agency.value.assistant?.removal), assistant: agency.value.assistant?.active === true, deviceTaken: agency.value.streamer?.deviceTaken === true, offer: agency.value.assistant?.pending ? agency.value.assistant : null }),
    });
  })().finally(() => (reading = null));
  return reading;
}

/** Only a request I can act on or that is with management; anything malformed is none. */
const openRemoval = (r: AssistantRemoval | null | undefined) => (r && typeof r.id === 'number' && (r.status === 'pending' || r.status === 'disputed') ? r : null);

const useSnap = () => {
  const s = useSyncExternalStore(subscribe, () => snap, () => snap);
  const id = myServerId();
  return id && s.owner && s.owner !== id ? EMPTY : s;
};

/** Ben tab: my server counts and id (null until read, and always without a server); read again on focus. */
export function useMeStats() {
  const s = useSnap();
  const focused = useIsFocused();
  useEffect(() => {
    if (liveMode() && focused) void refreshMeStats().catch(() => {});
  }, [focused]);
  return { stats: s.stats, agency: s.agency, removal: s.removal ?? null, assistant: s.assistant === true, offer: s.offer ?? null, deviceTaken: s.deviceTaken === true };
}

/** My agency on the server for the profile pill: undefined until known. `read`: start a read if there is none yet. */
export function useMyServerAgency(read: boolean): AgencyLink | null | undefined {
  const s = useSnap();
  const wanted = read && liveMode() && s.agency === undefined;
  useEffect(() => {
    if (wanted) void refreshMeStats().catch(() => {});
  }, [wanted]);
  return s.agency;
}
