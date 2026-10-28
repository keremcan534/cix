// Room access rules that sit next to the presence model: the mic queue ("Mikrofon kuyruğu"), the speak
// request list kept in step with the Balkon, and room invites (to in-app friends, and the managers'
// once-a-day invite to every follower of the room's account).
import type { RoomType } from '@/data/catalog';
import { FOLLOWS_ME, USERS, userById } from '@/data/mock';
import type { Role, RoomView } from '@/lib/room-presence';

// --- Mic queue -------------------------------------------------------------------------------------
/** Rooms that never set it: only "Serbest sohbet" lets people sit without asking (the old behaviour). */
export const defaultMicQueue = (roomType: RoomType = 'free') => roomType !== 'free';

/**
 * Taking a free mic. Queue off: anyone sits directly. Queue on: a member's tap becomes a speak request that
 * the owner or an admin approves; managers always sit directly.
 */
export const seatAccess = (micQueue: boolean, role: Role): 'direct' | 'request' => (micQueue && role === 'member' ? 'request' : 'direct');

/**
 * Speak requests that still mean something: only people on the Balkon (in the room, not on a mic, not
 * hidden), once each, in the order they asked. Someone who got a mic or left the room drops out.
 */
export function balconyOnly(ids: string[], view: RoomView): string[] {
  const balcony = new Set(view.balconyIds);
  return [...new Set(ids)].filter((uid) => balcony.has(uid));
}

// --- Room invites ----------------------------------------------------------------------------------
export const FOLLOWER_INVITE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const roomInviteText = (title: string) => `🎙️ Seni "${title}" odasına davet ediyorum!`;

/** Time left before the room can invite its account's followers again (0 = can send now). */
export const followerInviteLeft = (lastAt: number | undefined, now = Date.now()) =>
  lastAt === undefined ? 0 : Math.min(FOLLOWER_INVITE_COOLDOWN_MS, Math.max(0, lastAt + FOLLOWER_INVITE_COOLDOWN_MS - now));

/** "5 sa 12 dk", "12 dk", "1 dk" (never "0 dk" while something is left). */
export function formatWait(ms: number) {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h} sa ${m} dk` : `${h} sa`) : `${m} dk`;
}

export type FollowerInviteCheck = { ok: true } | { ok: false; reason: string; left?: number };
/** Only the owner and admins can send it, once every 24 hours per room. */
export function canInviteFollowers(role: Role, lastAt: number | undefined, now = Date.now()): FollowerInviteCheck {
  if (role === 'member') return { ok: false, reason: 'Takipçilere davet yalnızca oda sahibi ve yöneticilere açık.' };
  const left = followerInviteLeft(lastAt, now);
  if (left > 0) return { ok: false, reason: `Bu oda takipçilerine günde bir kez davet gönderebilir. Tekrar ${formatWait(left)} sonra.`, left };
  return { ok: true };
}

/** Follower count shown on profiles (the demo account has 128; others as on their profile page). */
export const followerCount = (accountId: string) => (accountId === 'me' ? 128 : (userById(accountId).age * 37) % 900);
/** Followers of the account that we know as users (the rest of the count are people outside the demo data). */
export const knownFollowers = (accountId: string) =>
  accountId === 'me' ? [...FOLLOWS_ME] : USERS.filter((u, i) => u.id !== accountId && (i + accountId.length) % 3 !== 0).map((u) => u.id);
