// Mock data for the user profile screen (kullanici/[id]).
// Everything here is deterministic per user id so render stays pure.
import type { ArtName } from '@/components/Art';
import { COSMETICS } from '@/data/catalog';
import { FAMILIES } from '@/data/economy';
import { GIFTS, USERS, type Gift, type User } from '@/data/mock';

/** Small stable hash of a string id. */
export const seedOf = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1_000_003, 17);

const pick = <T>(list: readonly T[], id: string, salt = 0) => list[(seedOf(id) + salt * 7) % list.length];

/** 12-digit public ID. */
export const displayId = (id: string) => String(100_000_000_000 + ((seedOf(id) * 7919) % 900_000_000_000));

// --- Personal profile --------------------------------------------------------
export const ZODIACS = ['Koç', 'Boğa', 'İkizler', 'Yengeç', 'Aslan', 'Başak', 'Terazi', 'Akrep', 'Yay', 'Oğlak', 'Kova', 'Balık'] as const;
export const JOBS = ['IT', 'Öğrenci', 'Tasarımcı', 'Mühendis', 'Müzisyen', 'Öğretmen', 'Satış', 'Sağlık', 'Serbest'] as const;
export const LANGUAGES = [['Türkçe'], ['Türkçe', 'English'], ['English', 'Türkçe'], ['Türkçe', 'Deutsch'], ['Türkçe', 'العربية']] as const;
export const RELATIONSHIP = ['Bekar', 'İlişkisi var', 'Belirtilmemiş'] as const;
export const EDUCATION = ['Lise', 'Ön lisans', 'Lisans', 'Yüksek lisans'] as const;

export type Tag = { emoji: string; label: string };
export const PERSONALITY_TAGS: Tag[] = [
  { emoji: '🏀', label: 'Basketbol' },
  { emoji: '🍖', label: 'Mangal' },
  { emoji: '🎸', label: 'Punk' },
  { emoji: '🎤', label: 'Karaoke' },
  { emoji: '☕', label: 'Kahve' },
  { emoji: '🎮', label: 'Oyuncu' },
  { emoji: '📚', label: 'Kitap kurdu' },
  { emoji: '✈️', label: 'Gezgin' },
  { emoji: '🌙', label: 'Gece kuşu' },
  { emoji: '😂', label: 'Esprili' },
  { emoji: '🐱', label: 'Kedisever' },
  { emoji: '💃', label: 'Dans' },
];

export const SLOGANS = [
  'Bir soruyu yanıtla, seninle aynı frekansta olan biriyle tanış.',
  'Gece sohbetleri ve iyi müzik, gerisi teferruat.',
  'Önce gülümse, sonra tanışalım 😊',
  'Saygı her şeyden önce gelir.',
];

export type ProfileExtras = {
  height: number;
  weight: number;
  job: string;
  languages: readonly string[];
  zodiac: string;
  slogan: string | null;
  tags: Tag[];
  relationship: string;
  education: string;
  birthday: string; // YYYY-MM-DD
};

/** The logged-in user's extras (partially filled, so the completion bar has room to grow). */
const MY_EXTRAS: ProfileExtras = {
  height: 178,
  weight: 82,
  job: 'IT',
  languages: ['English', 'Türkçe'],
  zodiac: 'Akrep',
  slogan: null,
  tags: PERSONALITY_TAGS.slice(0, 3),
  relationship: 'Bekar',
  education: 'Lise',
  birthday: '2002-11-13',
};

export const profileExtras = (user: User): ProfileExtras => {
  if (user.id === 'me') return MY_EXTRAS;
  const s = seedOf(user.id);
  const woman = user.gender === 'Kadın';
  const tagStart = s % PERSONALITY_TAGS.length;
  const tags = [0, 4, 7].map((o) => PERSONALITY_TAGS[(tagStart + o) % PERSONALITY_TAGS.length]);
  const month = (s % 12) + 1;
  const day = (s % 27) + 1;
  return {
    height: (woman ? 158 : 170) + (s % 18),
    weight: (woman ? 48 : 66) + (s % 20),
    job: pick(JOBS, user.id),
    languages: pick(LANGUAGES, user.id, 1),
    zodiac: ZODIACS[month - 1],
    slogan: s % 3 === 0 ? null : pick(SLOGANS, user.id, 2),
    tags,
    relationship: pick(RELATIONSHIP, user.id, 3),
    education: pick(EDUCATION, user.id, 4),
    birthday: `${2026 - user.age}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
};

/** Profile completion percentage (0-100) based on filled fields. */
export const profileCompletion = (user: User, x: ProfileExtras, photoCount: number) => {
  const checks = [
    !!user.avatar,
    user.name.trim().length > 0 && user.name !== 'Sen',
    user.bio.trim().length > 0,
    user.city.trim().length > 0,
    user.verified,
    !!user.gender,
    (user.interests?.length ?? 0) > 0,
    !!x.slogan,
    x.tags.length > 0,
    photoCount > 0,
    !!x.job,
    x.languages.length > 0,
    false, // voice intro (Kayıt) — not recorded yet
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

// --- Badges / levels -----------------------------------------------------------
export const wealthCharmOf = (id: string) => {
  const s = seedOf(id);
  return { wealth: (s % 18) + 1, charm: ((s >> 3) % 24) + 1 };
};

/** KORUMA (guardian): top supporter of the profile owner. */
export const guardianOf = (id: string): { userId: string; points: number } | null => {
  const s = seedOf(id);
  if (s % 4 === 0) return null;
  const candidates = USERS.filter((u) => u.id !== id);
  return { userId: candidates[s % candidates.length].id, points: 5_000 + (s % 40) * 1_250 };
};

// --- Honor (Onur) --------------------------------------------------------------
export type Medal = { id: string; emoji: string; art?: ArtName; name: string; tier: 'gold' | 'silver' };
export const MEDALS: Medal[] = [
  { id: 'md1', emoji: '🏆', art: 'rozet-haftanin-yildizi', name: 'Haftanın Yıldızı', tier: 'gold' },
  { id: 'md2', emoji: '🎤', art: 'rozet-karaoke-ustasi', name: 'Karaoke Ustası', tier: 'gold' },
  { id: 'md3', emoji: '💬', art: 'rozet-sohbet-krali', name: 'Sohbet Kralı', tier: 'silver' },
  { id: 'md4', emoji: '🎁', art: 'rozet-comert-kalp', name: 'Cömert Kalp', tier: 'silver' },
  { id: 'md5', emoji: '🔥', art: 'rozet-30-gun-seri', name: '30 Gün Seri', tier: 'gold' },
  { id: 'md6', emoji: '🤝', art: 'rozet-sosyal-kelebek', name: 'Sosyal Kelebek', tier: 'silver' },
];
export const medalsOf = (id: string) => (id === 'me' ? [] : MEDALS.filter((_, i) => (seedOf(id) >> i) % 3 === 0).slice(0, 4));

export type Title = { id: string; name: string; colors: [string, string] };
export const TITLES: Title[] = [
  { id: 't1', name: 'Gece Kuşu', colors: ['#6366F1', '#8B5CF6'] },
  { id: 't2', name: 'Oda Efsanesi', colors: ['#F59E0B', '#EF4444'] },
  { id: 't3', name: 'Melodi Perisi', colors: ['#EC4899', '#8B5CF6'] },
  { id: 't4', name: 'Sohbet Ustası', colors: ['#14B8A6', '#3B82F6'] },
  { id: 't5', name: 'Yükselen Yıldız', colors: ['#FBBF24', '#F97316'] },
  { id: 't6', name: 'Altın Ses', colors: ['#EAB308', '#A16207'] },
];
export const titlesOf = (id: string) => (id === 'me' ? [] : TITLES.filter((_, i) => (seedOf(id) >> (i + 1)) % 2 === 0).slice(0, 6));

/** Rides (Araç Duvarı) another user owns — picked from the store's ride cosmetics. */
export const vehiclesOf = (id: string) => COSMETICS.filter((c) => c.kind === 'ride').filter((_, i) => (seedOf(id) >> (i + 2)) % 3 === 0);

/** Stable mock "gift wall" per user; count 0 = not lit yet. */
export const giftWallOf = (id: string): (Gift & { count: number })[] =>
  GIFTS.map((g, i) => ({ ...g, count: Math.max(0, ((seedOf(id) * (i + 3)) % 11) - 3) }));

/** Total gifts in the (mock) global catalog, shown as "Aydınlatılmış 5/2169". */
export const GIFT_CATALOG_TOTAL = 2169;

export type GiftCollection = { id: string; name: string; emoji: string; colors: [string, string]; total: number };
export const GIFT_COLLECTIONS: GiftCollection[] = [
  { id: 'gc1', name: 'Romantik Randevu', emoji: '🏰', colors: ['#EC4899', '#7C3AED'], total: 25 },
  { id: 'gc2', name: 'Mucize Keşif', emoji: '🧭', colors: ['#0EA5E9', '#6366F1'], total: 20 },
  { id: 'gc3', name: 'Odalar Arası PK Savaşı', emoji: '⚔️', colors: ['#EF4444', '#F59E0B'], total: 12 },
  { id: 'gc4', name: 'Yıldızlı Gece', emoji: '🌌', colors: ['#312E81', '#8B5CF6'], total: 18 },
];
export const collectionProgress = (id: string, col: GiftCollection) => (id === 'me' ? 0 : (seedOf(id + col.id) % (col.total + 1)) >> 1);

// --- Relations (İlişki) ----------------------------------------------------------
export type Relation = { partnerId: string; level: number; days: number; label?: string };
export const DOST_LABELS = ['Kanka', 'Kardeş', 'Sırdaş', 'Yol arkadaşı'] as const;

export const relationsOf = (id: string): { cp: Relation[]; dost: Relation[] } => {
  const s = seedOf(id);
  const others = USERS.filter((u) => u.id !== id);
  const at = (k: number) => others[(s + k) % others.length].id;
  if (id === 'me') {
    return {
      cp: [{ partnerId: 'u1', level: 4, days: 8 }],
      dost: [
        { partnerId: 'u2', level: 2, days: 21, label: 'Kanka' },
        { partnerId: 'u9', level: 1, days: 5, label: 'Sırdaş' },
      ],
    };
  }
  return {
    cp: s % 3 === 0 ? [] : [{ partnerId: at(1), level: (s % 6) + 1, days: (s % 90) + 1 }],
    dost: [
      { partnerId: at(3), level: (s % 4) + 1, days: (s % 40) + 3, label: DOST_LABELS[s % DOST_LABELS.length] },
      ...(s % 2 === 0 ? [{ partnerId: at(5), level: 1, days: (s % 12) + 1, label: DOST_LABELS[(s + 1) % DOST_LABELS.length] }] : []),
    ],
  };
};

// --- Family (Kabile) -------------------------------------------------------------
/** Family of another user: real membership first, otherwise a deterministic pick (or none). */
export const familyOf = (id: string) => {
  const member = FAMILIES.find((f) => f.leaderId === id || f.memberIds.includes(id));
  if (member) return member;
  const s = seedOf(id);
  return s % 3 === 0 ? null : FAMILIES[s % FAMILIES.length];
};
