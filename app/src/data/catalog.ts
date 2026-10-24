// Catalogs for the prototype: cosmetics, emoji packs, room levels, music, support.

// --- Cosmetics store ---------------------------------------------------------
export type CosmeticKind = 'frame' | 'entry' | 'ride' | 'bubble' | 'specialId';
export type Cosmetic = {
  id: string;
  kind: CosmeticKind;
  name: string;
  emoji: string;
  price: number;
  days: number | null; // null = permanent
  color?: readonly [string, string];
  minVip?: number;
};

export const COSMETIC_KINDS: { kind: CosmeticKind; label: string }[] = [
  { kind: 'frame', label: '🖼️ Çerçeve' },
  { kind: 'entry', label: '✨ Giriş efekti' },
  { kind: 'ride', label: '🏎️ Binek' },
  { kind: 'bubble', label: '💬 Sohbet balonu' },
  { kind: 'specialId', label: '🔢 Özel ID' },
];

export const COSMETICS: Cosmetic[] = [
  { id: 'fr-neon', kind: 'frame', name: 'Neon', emoji: '💜', price: 150, days: 7, color: ['#A855F7', '#EC4899'] },
  { id: 'fr-ocean', kind: 'frame', name: 'Okyanus', emoji: '🌊', price: 300, days: 30, color: ['#0EA5E9', '#22D3EE'] },
  { id: 'fr-fire', kind: 'frame', name: 'Ateş', emoji: '🔥', price: 900, days: 30, color: ['#EF4444', '#F59E0B'] },
  { id: 'fr-gold', kind: 'frame', name: 'Altın Taç', emoji: '👑', price: 2_500, days: null, color: ['#F59E0B', '#FDE047'], minVip: 4 },
  { id: 'en-sparkle', kind: 'entry', name: 'Işıltı', emoji: '✨', price: 200, days: 7, color: ['#8B5CF6', '#EC4899'] },
  { id: 'en-thunder', kind: 'entry', name: 'Şimşek', emoji: '⚡', price: 600, days: 30, color: ['#2563EB', '#FBBF24'] },
  { id: 'en-dragon', kind: 'entry', name: 'Ejderha', emoji: '🐉', price: 3_000, days: 30, color: ['#DC2626', '#16A34A'], minVip: 7 },
  { id: 'rd-scooter', kind: 'ride', name: 'Scooter', emoji: '🛵', price: 250, days: 7 },
  { id: 'rd-sport', kind: 'ride', name: 'Spor Araba', emoji: '🏎️', price: 1_200, days: 30 },
  { id: 'rd-jet', kind: 'ride', name: 'Özel Jet', emoji: '🛩️', price: 5_000, days: 30, minVip: 9 },
  { id: 'bb-candy', kind: 'bubble', name: 'Şeker', emoji: '🍬', price: 120, days: 7, color: ['#F472B6', '#FB7185'] },
  { id: 'bb-galaxy', kind: 'bubble', name: 'Galaksi', emoji: '🌌', price: 450, days: 30, color: ['#312E81', '#7C3AED'] },
  { id: 'bb-gold', kind: 'bubble', name: 'Altın', emoji: '🏆', price: 1_500, days: null, color: ['#B45309', '#F59E0B'], minVip: 5 },
  { id: 'id-777', kind: 'specialId', name: 'ID 777', emoji: '🔢', price: 8_000, days: null },
  { id: 'id-2026', kind: 'specialId', name: 'ID 2026', emoji: '🔢', price: 3_000, days: null },
  { id: 'id-1001', kind: 'specialId', name: 'ID 1001', emoji: '🔢', price: 2_000, days: null },
];
export const cosmeticById = (id?: string | null) => COSMETICS.find((c) => c.id === id);

// --- Emoji market -------------------------------------------------------------
export type EmojiPack = { id: string; name: string; emojis: string[]; price: number; minVip?: number; animated?: boolean };
export const EMOJI_PACKS: EmojiPack[] = [
  { id: 'basic', name: 'Temel', price: 0, emojis: ['😀', '😂', '😍', '🥹', '😊', '😢', '😡', '👍', '🙏', '👋', '🤔', '😴'] },
  { id: 'fun', name: 'Eğlence', price: 50, emojis: ['🤣', '🤪', '😎', '🥳', '🤡', '👻', '🙃', '🤯'] },
  { id: 'love', name: 'Aşk', price: 80, emojis: ['❤️', '💕', '💋', '🫶', '💘', '😘', '🌹', '💞'] },
  { id: 'animals', name: 'Hayvanlar', price: 60, emojis: ['🐶', '🐱', '🦊', '🐼', '🐸', '🦄', '🐧', '🐝'] },
  { id: 'vip', name: 'VIP', price: 0, minVip: 5, emojis: ['👑', '💎', '🔥', '✨', '🏆', '🦁', '⚜️', '💠'] },
  { id: 'anim', name: 'Animasyonlu', price: 150, animated: true, emojis: ['🎆', '🎇', '🌈', '💥', '🎉', '🪩'] },
];

// --- Rooms: levels 1–15 ------------------------------------------------------
export const STANDARD_MICS = 10;
export const AGENCY_MICS = 15;
export const ROOM_XP_THRESHOLDS = [0, 100, 300, 600, 1_000, 1_600, 2_400, 3_400, 4_800, 6_500, 8_500, 11_000, 14_000, 18_000, 23_000];
export const ROOM_LEVEL_REWARDS = [
  'Temel oda ve standart moderasyon',
  'Ek oda arka planı',
  'Oda katkı sıralaması',
  'İlave oda kişiselleştirmesi',
  'Üyelere özel mikrofon seçeneği',
  'Ek oda yöneticisi kontenjanı',
  'Özel oda teması ve görsel efekt',
  'Mikrofon kapasitesi +2',
  'Gelişmiş etkinlik şablonları',
  'Ek yönetici kontenjanı ve oda raporu',
  'Özel giriş/oda efekti',
  'Hareketli oda simgesi',
  'Gelişmiş oda etkinlikleri ve katkı ödülleri',
  'Üst düzey oda kişiselleştirmesi',
  'En üst oda rozeti, özel tema ve maksimum kapasite',
];
export const roomLevel = (xp: number) => {
  let lvl = 1;
  ROOM_XP_THRESHOLDS.forEach((t, i) => xp >= t && (lvl = i + 1));
  return lvl;
};
/** Mic seats (including the host seat). Absolute max 15. */
export const micCapacity = (agencyRoom: boolean, level: number) =>
  agencyRoom ? AGENCY_MICS : Math.min(15, STANDARD_MICS + (level >= 8 ? 2 : 0) + (level >= 15 ? 3 : 0));
export const adminCapacity = (level: number) => 1 + (level >= 6 ? 1 : 0) + (level >= 10 ? 1 : 0);
export const ROOM_BACKGROUNDS = [
  { id: 'bg1', name: 'Gece', seed: 'night', minLevel: 1 },
  { id: 'bg2', name: 'Neon', seed: 'neon', minLevel: 2 },
  { id: 'bg3', name: 'Deniz', seed: 'sea', minLevel: 4 },
  { id: 'bg4', name: 'Galaksi', seed: 'galaxy', minLevel: 7 },
];

// --- Room music (licensed in-app catalog; mock) -------------------------------
export type Track = { id: string; title: string; artist: string; seconds: number };
export const MUSIC_CATALOG: Track[] = [
  { id: 'm1', title: 'Gece Mavisi', artist: 'Lisanslı Kütüphane', seconds: 184 },
  { id: 'm2', title: 'Sahil Yolu', artist: 'Lisanslı Kütüphane', seconds: 201 },
  { id: 'm3', title: 'Lo-fi Çalışma', artist: 'Lisanslı Kütüphane', seconds: 240 },
  { id: 'm4', title: 'Parti Başlasın', artist: 'Lisanslı Kütüphane', seconds: 172 },
  { id: 'm5', title: 'Akustik Akşam', artist: 'Lisanslı Kütüphane', seconds: 215 },
  { id: 'm6', title: 'Dans Pisti', artist: 'Lisanslı Kütüphane', seconds: 198 },
];

// --- Support -----------------------------------------------------------------
export const TICKET_CATEGORIES = ['Teknik', 'Üyelik', 'Kazanç', 'Ödeme', 'Güvenlik', 'Ajans', 'Şikâyet', 'İtiraz'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export const FAQ = [
  { q: 'Jeton nasıl yüklenir?', a: 'Profil > Cüzdan ekranından bir paket seçip ödeme yapabilirsin. Başarısız ödemeler bakiyeye yansımaz.' },
  { q: 'Elmasları nasıl çekerim?', a: 'Yayıncı Merkezi > Para çek. En az 10.000 elmas gerekir; talepler 3 iş günü içinde incelenir.' },
  { q: 'Ajanstan nasıl ayrılırım?', a: 'Ajans ekranından "Ajans değiştir / ayrıl" talebi oluştur. Bekleme süresi ve gerekçe ekranda gösterilir; itiraz hakkın her zaman vardır.' },
  { q: 'Bir kullanıcıyı nasıl şikâyet ederim?', a: 'Profilinde ••• > Şikâyet et. Her şikâyet bir talep numarası alır ve 24 saat içinde incelenir.' },
  { q: 'Hesabımı nasıl silerim?', a: 'Ayarlar > Hesabı sil. Talep onaylandıktan sonra 30 gün içinde veriler silinir; yasal kayıtlar saklama süresi boyunca tutulur.' },
];
