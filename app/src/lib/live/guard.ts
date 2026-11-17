// Koruma from the server (server/api/guards.mjs): a profile's area, Benim Koruma, ending one, my settings and the card.
// Demo people and the offline demo have none: the area is empty and Benim Koruma says it works on the live server.
import * as api from '@/lib/api';
import { liveGift, liveMode, rememberUser, toLocal, toServer } from '@/lib/live';
import { GUARD_CARD, parseGuardArea, parseGuardMine, parseGuardSettings, type GuardArea, type GuardMine, type GuardPerson } from '@/lib/guard-core';
import { isServerId } from '@/data/mock';

/** Whose Koruma comes from the server: me (signed in) and real people. */
export const liveGuardFor = (userId: string) => liveMode() && (userId === 'me' ? !!toServer('me') : isServerId(userId));

/** A person of a Koruma with this phone's id for them (their photo and name are remembered for the other screens). */
const local = (p: GuardPerson): GuardPerson => {
  rememberUser({ id: p.id, name: p.name, avatarUrl: p.avatarUrl });
  return { ...p, id: toLocal(p.id) };
};

export const EMPTY_AREA: GuardArea = { guardian: null, ward: null, mine: null, off: false };

/** A profile's Koruma area; empty for a demo person. */
export async function loadGuardArea(userId: string): Promise<GuardArea> {
  const id = liveGuardFor(userId) ? toServer(userId) : null;
  if (!id) return EMPTY_AREA;
  const a = parseGuardArea(await api.guardArea(id));
  return { ...a, guardian: a.guardian && local(a.guardian), ward: a.ward && local(a.ward) };
}

/** Benim Koruma: who guards me, whom I guard, my settings. */
export async function loadMyGuard(): Promise<GuardMine> {
  const m = parseGuardMine(await api.guardMine());
  return { ...m, guardians: m.guardians.map(local), wards: m.wards.map(local) };
}

/** I stop guarding someone (only the guardian can); the points are gone. */
export async function endGuard(userId: string) {
  const id = toServer(userId);
  if (!id) throw new Error('Bu kişiye şu an ulaşılamıyor');
  await api.guardEnd(id);
}

export async function saveGuardSettings(body: { off?: boolean; threshold?: number }) {
  return parseGuardSettings((await api.guardSettings(body)).settings);
}

/** The Koruma Kartı to someone, as a gift from their profile (its price as the catalog shows it). */
export const sendGuardCard = (userId: string) => liveGift(userId, GUARD_CARD, 1, undefined, 'profile');
