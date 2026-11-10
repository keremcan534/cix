// Following a room, becoming its member and its member list: the parts that are plain logic (the unit tests import
// them; nothing here talks to the server).
//  - What this phone knows about following each room (the heart in the room header): the room read fills it
//    (lib/live roomOf), the heart changes it (lib/live/room-follow).
//  - Odalarım › Katıl: the rooms I'm a member of and the rooms I follow, as one list.
//  - The room card's membership button and the member list: its rows, order, filters and labels.
import type { Room } from '@/data/mock';

// --- What the phone knows about following ----------------------------------------------------------------------
export type RoomFollow = { following: boolean; followers: number };
const follows = new Map<string, RoomFollow>();
const listeners = new Set<() => void>();
export const subscribeRoomFollow = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
/** What is known about following the room (null: not read yet). The same object until it changes. */
export const roomFollowOf = (roomId: string): RoomFollow | null => follows.get(roomId) ?? null;
export function putRoomFollow(roomId: string, next: RoomFollow) {
  const was = follows.get(roomId);
  if (was && was.following === next.following && was.followers === next.followers) return;
  follows.set(roomId, { following: next.following, followers: Math.max(0, next.followers) });
  listeners.forEach((l) => l());
}
/** Another account signed in on this phone: nothing is known about its follows yet. */
export function forgetRoomFollows() {
  if (!follows.size) return;
  follows.clear();
  listeners.forEach((l) => l());
}
/** The heart was tapped: the state it shows until the server answers (and for good in the demo). */
export const toggledFollow = (now: RoomFollow): RoomFollow => ({ following: !now.following, followers: Math.max(0, now.followers + (now.following ? -1 : 1)) });
/** A sample room's follower count before I follow it (the demo has no server to count them). */
export const demoFollowers = (room: Pick<Room, 'id' | 'listeners'>) => Math.round(room.listeners * 2.4) + ((Number(room.id.replace(/\D/g, '')) || 0) % 7) * 3;

// --- Odalarım › Katıl ------------------------------------------------------------------------------------------
export type MyRoomRow = { room: Room; member: boolean; followed: boolean; closed: boolean };
/**
 * The rooms I'm a member (or an admin) of and the rooms I follow as one list, each once: the open rooms first,
 * fullest first, then the closed ones in the order given (only a followed room is ever listed closed).
 */
export function myRoomRows(joined: readonly Room[], followed: readonly { room: Room; closed: boolean }[]): MyRoomRow[] {
  const rows = new Map<string, MyRoomRow>();
  joined.forEach((room) => rows.set(room.id, { room, member: true, followed: false, closed: false }));
  followed.forEach(({ room, closed }) => {
    const had = rows.get(room.id);
    rows.set(room.id, had ? { ...had, followed: true } : { room, member: false, followed: true, closed });
  });
  const list = [...rows.values()];
  return [...list.filter((r) => !r.closed).sort((a, b) => b.room.listeners - a.room.listeners), ...list.filter((r) => r.closed)];
}
/** The small mark on a row of that list. */
export const myRoomMark = (r: Pick<MyRoomRow, 'member' | 'followed' | 'closed'>) => (r.closed ? 'Kapalı' : r.member && r.followed ? 'Üye · Takipte' : r.member ? 'Üye' : 'Takipte');

// --- Membership ------------------------------------------------------------------------------------------------
export type Membership = 'owner' | 'none' | 'pending' | 'member';
export type JoinMode = 'open' | 'apply' | 'closed';
/** How a sample room takes members (the demo): a room that keeps its mics or its door to itself asks first. */
export const demoJoinMode = (room: Pick<Room, 'micPermission' | 'password' | 'roomType'>): JoinMode =>
  room.micPermission === 'members' || !!room.password || room.roomType === 'private' ? 'apply' : 'open';
/**
 * The room card's membership button for someone who isn't a member: its words, the line under it and whether it
 * can be pressed. Open room: "Üye ol" (a member at once). By application: "Başvur" (the owner or admins answer).
 */
export function joinButton(joinMode: JoinMode, total: number, cap: number): { label: string; hint: string; disabled: boolean } {
  if (joinMode === 'closed') return { label: 'Üye alımı kapalı', hint: 'Bu oda şu an yeni üye almıyor.', disabled: true };
  if (joinMode === 'apply') return { label: 'Başvur', hint: 'Oda sahibi veya yöneticiler onaylayınca üye olursun.', disabled: false };
  if (total >= cap) return { label: 'Üye kapasitesi dolu', hint: `Bu oda en fazla ${cap.toLocaleString('tr-TR')} üye alabiliyor.`, disabled: true };
  return { label: 'Üye ol', hint: 'Başvuru gerekmez; hemen üye olursun.', disabled: false };
}

// --- The member list -------------------------------------------------------------------------------------------
export type MemberRole = 'owner' | 'super' | 'admin' | 'member' | 'pending';
export type MemberFilter = 'all' | 'in' | 'out' | 'pending';
/** `lastSeen`: when they were last in the room (ms); null: not known, or they don't show it. */
export type MemberRow = { id: string; name: string; avatar?: string; role: MemberRole; inRoom: boolean; lastSeen: number | null };
export const MEMBER_ROLE_LABEL: Record<MemberRole, string> = { owner: 'Oda sahibi', super: 'Süper Yönetici', admin: 'Yönetici', member: 'Üye', pending: 'Başvurdu' };
const RANK: Record<MemberRole, number> = { owner: 3, super: 2, admin: 1, member: 0, pending: 0 };
export const isStaffRole = (role: MemberRole) => RANK[role] > 0;
/** The server's order (server/api/room-members.mjs): staff first, then people in the room, then whoever came in last. */
export const sortMemberRows = <T extends MemberRow>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => RANK[b.role] - RANK[a.role] || Number(b.inRoom) - Number(a.inRoom) || (b.lastSeen ?? 0) - (a.lastSeen ?? 0) || a.name.localeCompare(b.name, 'tr'));
export const filterMemberRows = <T extends MemberRow>(rows: readonly T[], filter: MemberFilter): T[] =>
  filter === 'in' ? rows.filter((r) => r.inRoom) : filter === 'out' ? rows.filter((r) => !r.inRoom) : [...rows];
/** A page of the server's list added to the rows already shown (someone who moved between pages is kept once). */
export const addMemberPage = <T extends { id: string }>(shown: readonly T[], page: readonly T[]): T[] => {
  const ids = new Set(shown.map((r) => r.id));
  return [...shown, ...page.filter((r) => !ids.has(r.id))];
};

/** The line under a member's name: in the room now, or when they were last in it ('' when that isn't known). */
export function lastSeenText(row: Pick<MemberRow, 'inRoom' | 'lastSeen'>, now: number): string {
  if (row.inRoom) return 'Şu an odada';
  if (row.lastSeen === null) return '';
  const min = Math.floor(Math.max(0, now - row.lastSeen) / 60_000);
  if (min < 1) return 'Son giriş: az önce';
  if (min < 60) return `Son giriş: ${min} dk önce`;
  if (min < 1440) return `Son giriş: ${Math.floor(min / 60)} sa önce`;
  const days = Math.floor(min / 1440);
  return days === 1 ? 'Son giriş: dün' : `Son giriş: ${days.toLocaleString('tr-TR')} gün önce`;
}
/** Whole days since they were last in the room (null: not known), for the "N gündür girmedi" warning. */
export const daysAway = (row: Pick<MemberRow, 'inRoom' | 'lastSeen'>, now: number) => (row.inRoom || row.lastSeen === null ? null : Math.floor(Math.max(0, now - row.lastSeen) / 86_400_000));
/** A sample member's last time in the room (the demo): made up from their id, the same on every look. */
export const demoLastSeen = (id: string, now: number) => {
  const n = Number(id.replace(/\D/g, '')) || 0;
  return now - ((n * 5) % 40) * 86_400_000 - ((n * 37) % 600) * 60_000;
};
