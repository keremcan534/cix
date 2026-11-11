// Ajans sohbet grubu, the parts that only read the server's answer (server/api/agency-chat.mjs): how a member's
// status reads and in which order members are listed. No network here, so it is unit tested (tests/agency-chat).
export type AgencyGroup = { id: string; name: string; role: 'owner' | 'staff' | 'streamer' };
export type AgencyChatMessage = { id: string; author: { id: string; name: string; avatarUrl: string | null; gender: string | null }; text: string; createdAt: string };
export type AgencyChatMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
  gender: string | null;
  role: AgencyGroup['role'];
  /** null: they chose not to show whether they are online (Gizlilik). */
  online: boolean | null;
  /** The open room they are in, unless they hide it. */
  room: { id: string; title: string } | null;
  lastSeenAt: string | null;
};

export const ROLE_LABEL: Record<AgencyGroup['role'], string> = { owner: 'Ajans sahibi', staff: 'Yetkili', streamer: 'Yayıncı' };

/** "Şimdi", "12 dk önce", "3 sa önce", "Dün", "4 gün önce", then the date. */
export function lastSeenText(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const min = Math.floor((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min)) return '';
  if (min < 1) return 'Şimdi';
  if (min < 60) return `${min} dk önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Dün';
  if (d < 30) return `${d} gün önce`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** One member's status line: the room they are in, online, when they were last seen, or that they hide it. */
export function memberStatus(m: Pick<AgencyChatMember, 'online' | 'room' | 'lastSeenAt'>, now = Date.now()): string {
  if (m.room) return `Odada · ${m.room.title}`;
  if (m.online === true) return 'Çevrim içi';
  if (m.online === null) return 'Durumunu gizliyor';
  const seen = lastSeenText(m.lastSeenAt, now);
  return seen ? `Son görülme: ${seen}` : 'Çevrim dışı';
}

/** In a room first, then online, then by who was here last; people who hide it at the end. */
export function byPresence(a: AgencyChatMember, b: AgencyChatMember): number {
  const rank = (m: AgencyChatMember) => (m.room ? 0 : m.online === true ? 1 : m.online === false ? 2 : 3);
  return rank(a) - rank(b) || (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? '') || a.name.localeCompare(b.name, 'tr');
}
