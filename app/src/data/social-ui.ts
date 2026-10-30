// UI-only mock data for the "Senin İçin" (discovery) and "Anlar" (moments) tabs.
// Generic names only; layout inspired by voice-chat social apps, colors follow our dark theme.
import type { Href } from 'expo-router';

import type { Moment, User } from '@/data/mock';

// --- Senin İçin --------------------------------------------------------------

export type DiscoverShortcut = {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  colors: readonly [string, string];
  href: Href;
  /** Wide card with subtitle (first card). */
  wide?: boolean;
};

export const DISCOVER_SHORTCUTS: DiscoverShortcut[] = [
  { id: 'call', title: 'Arama Merkezi', subtitle: 'Görüntülü & sesli', emoji: '📞', colors: ['#0E7C9A', '#0A8F95'], href: '/eslesme', wide: true },
  { id: 'party', title: 'Parti', subtitle: 'Odalara katıl', emoji: '🎉', colors: ['#14B8A6', '#0E7C9A'], href: '/(tabs)' },
  { id: 'tribe', title: 'Kabile', subtitle: 'Birlikte sohbet', emoji: '⛺', colors: ['#0A8F95', '#0FB8BE'], href: '/aile' },
  { id: 'free', title: 'Bedava', subtitle: 'Jeton kazan', emoji: '🪙', colors: ['#FF8A97', '#FF6576'], href: '/gorevler' },
];

/** Avatars shown on the "Parti" shortcut card. */
export const PARTY_AVATAR_IDS = ['u5', 'u1', 'u7'];

/** Users who passed the selfie check ("Gerçek" = real person verified). */
export const REAL_PERSON = new Set(['u1', 'u2', 'u5', 'u7', 'u9', 'u11']);

/** Longer bio lines for the discovery list (falls back to `user.bio`). */
export const EXTRA_BIOS: Record<string, string> = {
  u1: 'Karaoke kraliçesi 🎤 Akşamları odamda canlı şarkı var, uğra!',
  u2: 'Oyun ve gece sohbetleri · takım arkadaşı arıyorum 🎮',
  u4: 'Gitar çalarım, istek alırım 🎸 Akustik geceleri severim',
  u5: 'Seyahat ✈️ fotoğraf 📷 Bir sonraki rota neresi olsun?',
  u7: 'Yeni insanlar tanımayı seviyorum, selam vermekten çekinme 🌸',
  u9: 'Lo-fi dinlerken sohbet · ders arkadaşı olur musun? 📚',
  u11: 'Dans ve pop müzik 💃 Hafta sonu parti odasındayım',
  u12: 'Kahve bağımlısı ☕ İyi bir kahve önerisi bekliyorum',
};

/** Deterministic two-decimal distance ("118.89km") derived from the integer mock distance. */
export const preciseKm = (u: Pick<User, 'id' | 'distanceKm'>) => {
  const seed = [...u.id].reduce((s, ch) => s + ch.charCodeAt(0) * 7, 0) % 100;
  return `${(u.distanceKm + seed / 100).toFixed(2)}km`;
};

export type Country = { code: string; name: string; flag: string };
export const COUNTRIES: Country[] = [
  { code: 'ALL', name: 'Tüm ülkeler', flag: '🌍' },
  { code: 'TR', name: 'Türkiye', flag: '🇹🇷' },
  { code: 'AZ', name: 'Azerbaycan', flag: '🇦🇿' },
  { code: 'DE', name: 'Almanya', flag: '🇩🇪' },
  { code: 'NL', name: 'Hollanda', flag: '🇳🇱' },
  { code: 'CY', name: 'Kıbrıs', flag: '🇨🇾' },
];
/** Demo users default to Türkiye (their `city` field); other countries show an empty state. */
export const USER_COUNTRY: Record<string, string> = {};
export const countryOf = (u: User) => u.country ?? USER_COUNTRY[u.id] ?? 'TR';

/** Agency room promo card shown inside the discovery list. */
export const DISCOVER_PROMO = {
  roomId: 'r2',
  waiting: 19,
  avatarIds: ['u11', 'u1', 'u5', 'u7', 'u9', 'u3'],
  /** Insert after this many users. */
  afterIndex: 3,
};

// --- Anlar -------------------------------------------------------------------

export type MomentTopic = { id: string; title: string; views: string; emoji: string; colors: readonly [string, string] };

export const MOMENT_TOPICS: MomentTopic[] = [
  { id: 'date', title: 'Romantik Randevu', views: '238.36k', emoji: '💞', colors: ['#087A80', '#C93C4F'] },
  { id: 'pk', title: 'Odalar Arası PK', views: '25.59k', emoji: '⚔️', colors: ['#1D4ED8', '#DC2626'] },
  { id: 'ootd', title: 'OOTD', views: '109.33k', emoji: '👗', colors: ['#BE185D', '#F59E0B'] },
  { id: 'travel', title: 'Gezi Günlüğü', views: '64.12k', emoji: '🧳', colors: ['#0A8F95', '#0EA5E9'] },
  { id: 'music', title: 'Bu Akşam Ne Dinliyoruz', views: '41.08k', emoji: '🎧', colors: ['#0B4F63', '#0FB8BE'] },
];

/** Extra moments so every topic has content (ids don't clash with MOMENTS). */
export const EXTRA_MOMENTS: Moment[] = [
  { id: 'sm1', userId: 'u7', text: 'efektlerden daha iyi makyaj yaptığımı fark ettim 😭 yemişim efektini 😂', image: 'https://picsum.photos/seed/makeup/600/750', likes: 6, comments: 2, time: '15 dk' },
  { id: 'sm2', userId: 'u11', text: 'GEZELİMM ✨', image: 'https://picsum.photos/seed/citynight/600/750', likes: 41, comments: 3, time: '25 dk' },
  { id: 'sm3', userId: 'u2', text: 'Dün geceki PK’da odamız 3-1 kazandı 🏆 Destek veren herkese teşekkürler!', image: 'https://picsum.photos/seed/trophy/600/600', likes: 77, comments: 4, time: '2 sa' },
  { id: 'sm4', userId: 'u5', text: 'Bugünün kombini: oversize ceket + beyaz sneaker 🤍', image: 'https://picsum.photos/seed/outfit/600/750', likes: 156, comments: 11, time: '4 sa' },
  { id: 'sm5', userId: 'u1', text: 'İlk buluşmada nereye gidilir? Benim favorim sahilde kahve ☕🌅', likes: 93, comments: 21, time: '6 sa' },
  { id: 'sm6', userId: 'u12', text: 'Bu akşam playlistimde sadece 90’lar var 🎶 Öneri bekliyorum', likes: 22, comments: 5, time: '9 sa' },
];

/** Topic of each moment (MOMENTS + EXTRA_MOMENTS); moments without a topic only appear in "all". */
export const MOMENT_TOPIC_OF: Record<string, string> = {
  m1: 'travel',
  m2: 'music',
  m3: 'music',
  m4: 'ootd',
  sm1: 'ootd',
  sm2: 'travel',
  sm3: 'pk',
  sm4: 'ootd',
  sm5: 'date',
  sm6: 'music',
};

/** SVIP frame level for moment authors (others get a plain avatar). */
export const AUTHOR_SVIP: Record<string, number> = { u1: 9, u5: 6, u11: 14, u7: 3 };

/** Colored names for high-status authors. */
export const NAME_COLORS: Record<string, string> = { u1: '#FBBF24', u5: '#FF8A97', u11: '#FB923C', u7: '#A5F3F5' };

/** "12 dk" -> "12 dakika önce", "3 sa" -> "3 saat önce". */
export const agoLabel = (time: string) => {
  const [n, unit] = time.split(' ');
  if (unit === 'dk') return `${n} dakika önce`;
  if (unit === 'sa') return `${n} saat önce`;
  if (unit === 'g') return `${n} gün önce`;
  return time;
};

/** Minutes since posting, for the "Son" (latest) sort. */
export const agoMinutes = (time: string) => {
  const [n, unit] = time.split(' ');
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return unit === 'sa' ? v * 60 : unit === 'g' ? v * 1440 : v;
};

export const distanceLabel = (km: number) => (km > 500 ? '>500.0km' : `${km.toFixed(1)}km`);

export type MomentComment = { id: string; userId: string; text: string; time: string };

export const SEED_COMMENTS: Record<string, MomentComment[]> = {
  m1: [
    { id: 'c1', userId: 'u1', text: 'Harika görünüyor 😍', time: '10 dk' },
    { id: 'c2', userId: 'u9', text: 'Balon turuna bindin mi?', time: '8 dk' },
  ],
  m2: [{ id: 'c3', userId: 'u11', text: 'Bir dahakine ben de geliyorum 🎤', time: '40 dk' }],
  sm1: [
    { id: 'c4', userId: 'u5', text: 'Efektsiz de çok güzelsin 😂', time: '12 dk' },
    { id: 'c5', userId: 'u2', text: 'hahaha', time: '9 dk' },
  ],
  sm3: [{ id: 'c6', userId: 'u6', text: 'Rövanş istiyoruz ⚔️', time: '1 sa' }],
  sm5: [{ id: 'c7', userId: 'u4', text: 'Kesinlikle sahil 🌊', time: '5 sa' }],
};
