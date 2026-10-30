// UI-only mock data for the rooms tab (Odalar): ranking cards, room badge chips, weekly TOP ranks,
// joined rooms, events, countries and the promo banner. Room records themselves live in mock.ts.
import { AGENCIES } from '@/data/agency';
import { FAMILIES, LEADERBOARDS } from '@/data/economy';
import { ROOMS, userById, type Room } from '@/data/mock';

// --- Top-level ranking cards (horizontal row under the tabs) ----------------------------------
export type RankCard = { key: string; title: string; board: string; colors: readonly [string, string]; avatars: string[] };
const topRoomCovers = [...ROOMS].sort((a, b) => b.listeners - a.listeners).slice(0, 3).map((r) => r.cover);
export const RANK_CARDS: RankCard[] = [
  { key: 'cazibe', title: 'Cazibe Listesi', board: 'yayinci', colors: ['#5A2232', '#2A1A24'], avatars: LEADERBOARDS.yayinci.daily.slice(0, 3).map((r) => r.user.avatar) },
  { key: 'zengin', title: 'Zenginler', board: 'zengin', colors: ['#5C4012', '#2E2414'], avatars: LEADERBOARDS.zengin.daily.slice(0, 3).map((r) => r.user.avatar) },
  { key: 'oda', title: 'Top Odalar', board: 'oda', colors: ['#0B4F63', '#12304A'], avatars: topRoomCovers },
  { key: 'dost', title: 'Dost Listesi', board: 'odaxp', colors: ['#0B3B4A', '#16253C'], avatars: ['u5', 'u11', 'u2'].map((id) => userById(id).avatar) },
];

// --- Category tabs --------------------------------------------------------------------------
export const ROOM_TABS = ['Popüler', 'Video', 'PK', 'CP', 'Gösteri'] as const;
export type RoomTab = (typeof ROOM_TABS)[number];

// --- Countries (globe button) ---------------------------------------------------------------
export const COUNTRIES = [
  { id: 'ALL', flag: '🌍', name: 'Tüm ülkeler' },
  { id: 'TR', flag: '🇹🇷', name: 'Türkiye' },
  { id: 'AZ', flag: '🇦🇿', name: 'Azerbaycan' },
  { id: 'DE', flag: '🇩🇪', name: 'Almanya' },
] as const;
export type CountryId = (typeof COUNTRIES)[number]['id'];
export const countryFlag = (id: CountryId) => COUNTRIES.find((c) => c.id === id)?.flag ?? '🌍';

// --- Per-room extras ------------------------------------------------------------------------
type RoomExtra = {
  agencyId?: string; // badge chip shows the agency
  familyId?: string; // ...or the family
  country?: Exclude<CountryId, 'ALL'>;
  /** Weekly room ranking position (1-3 get a gradient card with a TOP watermark). */
  top?: number;
  pk?: boolean; // live PK battle pill
  video?: boolean; // video (camera) room
  cp?: boolean; // couple / CP room
  /** Announcement fallback when the room has none (usually an invite code). */
  note?: string;
};
const ROOM_EXTRA: Record<string, RoomExtra> = {
  r1: { familyId: 'f1', video: true, note: 'Aile davet kodu GECE01 · hoş geldin 🌙' },
  r2: { agencyId: 'a1', top: 1, pk: true },
  r3: { familyId: 'f3' },
  r4: { familyId: 'f4', top: 2, cp: true, video: true },
  r5: { country: 'DE', note: 'Sessiz çalışma odası · davet kodu LOFI5X' },
  r6: { country: 'AZ' },
  r7: { agencyId: 'a3', top: 3, pk: true },
};
export const roomExtra = (id: string): RoomExtra => ROOM_EXTRA[id] ?? {};
export const roomCountry = (id: string): Exclude<CountryId, 'ALL'> => roomExtra(id).country ?? 'TR';

export type RoomBadge = { emoji: string; label: string; colors: readonly [string, string] };
export const roomBadge = (id: string): RoomBadge | null => {
  const x = roomExtra(id);
  const agency = x.agencyId ? AGENCIES.find((a) => a.id === x.agencyId) : undefined;
  if (agency) return { emoji: agency.logo, label: agency.name, colors: ['#B45309', '#7C2D12'] };
  const family = x.familyId ? FAMILIES.find((f) => f.id === x.familyId) : undefined;
  if (family) return { emoji: family.emoji, label: family.name, colors: ['#087A80', '#0B3B4A'] };
  return null;
};

export const roomAnnouncement = (room: Room) => {
  const x = roomExtra(room.id);
  if (room.announcement) return room.announcement;
  if (x.note) return x.note;
  const agency = x.agencyId ? AGENCIES.find((a) => a.id === x.agencyId) : undefined;
  return agency ? `Ajans davet kodu ${agency.code}` : 'Odaya hoş geldin, keyifli sohbetler!';
};

const THEME_TAG: Record<string, string> = { chat: 'Sohbet', pk: 'PK', music: 'Şarkı söyle', party: 'Parti', friends: 'Arkadaşlık', game: 'Oyun' };
const CATEGORY_TAG: Record<string, string> = { Sohbet: 'Sohbet', Müzik: 'Şarkı söyle', Oyun: 'Oyun', Arkadaşlık: 'Parti' };
export const roomTagLabel = (room: Room) => (room.theme ? THEME_TAG[room.theme] : undefined) ?? CATEGORY_TAG[room.category] ?? 'Parti';

/** Does a room belong under a category tab? (Popüler shows everything.) */
export const matchesTab = (room: Room, tab: RoomTab) => {
  const x = roomExtra(room.id);
  switch (tab) {
    case 'Popüler':
      return true;
    case 'Video':
      return !!x.video;
    case 'PK':
      return room.theme === 'pk' || !!x.pk || room.tags.includes('PK');
    case 'CP':
      return !!x.cp || room.theme === 'friends' || room.category === 'Arkadaşlık';
    case 'Gösteri':
      return room.theme === 'music' || room.roomType === 'music' || room.roomType === 'stage';
  }
};

/** Popüler ordering: weekly TOP rooms first, then by listeners. */
export const popularScore = (room: Room) => {
  const top = roomExtra(room.id).top;
  return (top ? 10_000 - top * 1_000 : 0) + room.listeners;
};

// --- Benim tab --------------------------------------------------------------------------------
/** Rooms I'm a member of (mock). Rooms of my agency / family are added on top of these. */
export const JOINED_ROOM_IDS = ['r4', 'r1'];
export const isMemberRoom = (id: string, agencyId: string | null, familyId: string | null) => {
  const x = roomExtra(id);
  return JOINED_ROOM_IDS.includes(id) || (!!agencyId && x.agencyId === agencyId) || (!!familyId && x.familyId === familyId);
};

export const ROOM_BANNER = {
  title: 'Mikrofon Pozisyonu Yükseltmesi Seni Bekliyor',
  sub: 'Oda seviyeni yükselt, daha fazla mikrofon aç',
  emoji: '🎤',
  colors: ['#2563EB', '#087A80'] as const,
};

// --- Calendar (events) ------------------------------------------------------------------------
export const ROOM_EVENTS = [
  { id: 'ev1', roomId: 'r7', title: 'Doğruluk mu Cesaret mi?', when: 'Bugün 22:00' },
  { id: 'ev2', roomId: 'r2', title: 'Karaoke yarışması', when: 'Cmt 21:00' },
  { id: 'ev3', roomId: 'r4', title: 'Yeni arkadaşlar tanışma saati', when: 'Paz 20:30' },
];

// --- Online hosts row -------------------------------------------------------------------------
/** Stable mock host level shown on the avatar badge. */
export const hostLevel = (userId: string) => 1 + ([...userId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % 20);
