// Room social features of a live build (server/api/room-social.mjs) in the shapes the room screen and the Odalar tab
// already draw for the demo: a server mic invite as the presence model's invite, the server poll as the poll card's,
// follower invites as notices, the room share's message. Pure, so the node tests check it.
import type { FollowerRoomInvite, ServerMicInvite, ServerPoll } from '@/lib/api';
import { FOLLOWER_INVITE_COOLDOWN_MS, roomInviteText } from '@/lib/room-invites';
import type { MicInvite } from '@/lib/room-presence';

// --- Mic invites ---------------------------------------------------------------------------------------------
/** The presence model's id of a server invite, and back (null: not a server invite). */
export const inviteKey = (id: number) => `srv-${id}`;
export const serverInviteId = (key: string) => {
  const m = /^srv-(\d{1,15})$/.exec(key);
  return m ? Number(m[1]) : null;
};

/**
 * A server invite as the presence model keeps it: this phone's ids (`toLocal`), the mic as the app numbers it (the
 * server's seat is the same index; null = any free mic), and its end on this phone's clock from the server's
 * "milliseconds left", so a phone whose clock is off still counts the right 30 seconds.
 */
export function localInvite(i: ServerMicInvite, toLocal: (id: string) => string, now: number): MicInvite {
  return {
    id: inviteKey(i.id),
    roomId: i.room,
    fromId: toLocal(i.from.id),
    toId: toLocal(i.to.id),
    ...(i.seat === null ? {} : { seat: i.seat }),
    status: i.status,
    at: now - Math.max(0, 30_000 - i.expiresIn),
    expiresAt: now + Math.max(0, i.expiresIn),
    ...(i.note ? { note: i.note } : {}),
  };
}

/** The mic an accepted invite asks for: the invite's own, else the first free unlocked mic after the owner's. */
export function inviteSeat(seat: number | undefined, seats: readonly (string | null)[], locked: readonly number[]) {
  if (seat !== undefined) return seat;
  return seats.findIndex((s, i) => i > 0 && !s && !locked.includes(i));
}

// --- Poll ----------------------------------------------------------------------------------------------------
/** The poll card's shape (components/room/community Poll). */
export type LivePoll = { id: string; question: string; options: { text: string; votes: number }[]; myVote: number | null; endsIn: number; live: boolean; closed: boolean };

/**
 * The server's poll on this phone at `now`: the seconds left counted from `endsAt` (when it was read, plus what the
 * server said was left), closed once they run out. Results the server keeps from me (not live, not voted, still
 * open) come as 0: the card doesn't show them then.
 */
export function livePoll(p: ServerPoll, endsAt: number, now: number): LivePoll {
  const endsIn = p.closed ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
  return {
    id: String(p.id),
    question: p.question,
    options: p.options.map((o) => ({ text: o.text, votes: o.votes ?? 0 })),
    myVote: p.myVote,
    endsIn,
    live: p.live,
    closed: p.closed || endsIn === 0,
  };
}

// --- Follower invites ----------------------------------------------------------------------------------------
/** When the room's account last invited its followers, on this phone's clock, from the server's wait (none: free). */
export const followerInviteAt = (waitMs: number, now: number) => (waitMs > 0 ? now - (FOLLOWER_INVITE_COOLDOWN_MS - Math.min(waitMs, FOLLOWER_INVITE_COOLDOWN_MS)) : undefined);

export type RoomInviteNotice = { kind: 'social'; icon: 'mic'; title: string; body: string; href: string };
/** At most this many room invites become notices at once (the newest). */
export const MAX_INVITE_NOTICES = 3;
/** On a phone's first read, invites this recent are still told; older ones only set the mark. */
export const FRESH_INVITE_MS = 60 * 60_000;

/**
 * Room invites from accounts I follow (GET /api/me/room-invites) as Bildirimler notices. `seen` is the newest invite
 * time already told (server ms), or null on this phone's first read: then only the last hour's are told.
 */
export function roomInviteNotices(invites: readonly FollowerRoomInvite[], seen: number | null, now: number): { notices: RoomInviteNotice[]; mark: number } {
  const at = (i: FollowerRoomInvite) => Date.parse(i.at) || 0;
  const mark = invites.reduce((t, i) => Math.max(t, at(i)), seen ?? 0);
  const after = seen ?? now - FRESH_INVITE_MS;
  const fresh = invites
    .filter((i) => at(i) > after)
    .sort((a, b) => at(b) - at(a))
    .slice(0, MAX_INVITE_NOTICES)
    // Oldest first, so the newest ends up on top of the list.
    .reverse();
  return {
    notices: fresh.map((i) =>
      // A room I follow opened (server/api/room-follow.mjs): told the same way, with its own words.
      i.kind === 'open'
        ? { kind: 'social', icon: 'mic', title: 'Takip ettiğin oda açıldı', body: `"${i.room.title}" odası şimdi açık`, href: `/oda/${i.room.id}` }
        : { kind: 'social', icon: 'mic', title: 'Oda daveti', body: `${i.host.name} seni "${i.room.title}" odasına davet ediyor`, href: `/oda/${i.room.id}` },
    ),
    mark,
  };
}

// --- Share -----------------------------------------------------------------------------------------------------
/**
 * The room share as a direct message: the invite line and the room's public number (the room search finds it). No
 * link: links don't pass the contact filter in messages; the sender's own chat shows the room card.
 */
export const roomShareText = (title: string, code: string) => `${roomInviteText(title)} Oda ID: ${code}`;
