import type { RoomTheme, RoomType } from '@/data/catalog';

export type User = {
  id: string;
  name: string;
  age: number;
  city: string;
  distanceKm: number;
  avatar: string;
  verified: boolean;
  vip?: boolean;
  bio: string;
  online: boolean;
  gender?: 'Kadın' | 'Erkek';
  interests?: string[];
  /** Unique @handle (lowercase, changeable with limits); `id` never changes. */
  username?: string;
  /** ISO country code; shown as flag + name. */
  country?: string;
  /** YYYY-MM-DD; only the owner sees it, everyone else sees the age. */
  birthDate?: string;
  /** Account creation (YYYY-MM-DD); shown as month and year. */
  joinedAt?: string;
  /** Last activity for offline users, e.g. "2 sa önce" (hidden if they turned it off). */
  lastSeen?: string;
  /** Album photos (max 6). */
  photos?: string[];
  /** false = gender kept private. */
  showGender?: boolean;
};

export const INTERESTS = ['🎤 Karaoke', '🎮 Oyun', '💬 Sohbet', '⚽ Spor', '✈️ Seyahat', '🎬 Film', '💃 Dans', '📚 Kitap', '🎧 Müzik', '☕ Kahve'];

export type Room = {
  id: string;
  title: string;
  category: Category;
  cover: string;
  hostId: string;
  listeners: number;
  seatUserIds: (string | null)[];
  tags: string[];
  level?: number;
  agency?: boolean; // agency rooms start with 15 mics
  password?: string; // private room
  adminIds?: string[];
  announcement?: string;
  track?: string; // music track id currently playing
  roomType?: RoomType;
  theme?: RoomTheme;
  bossSeat?: boolean;
  micPermission?: 'everyone' | 'members';
};

export type Moment = {
  id: string;
  userId: string;
  text: string;
  image?: string;
  likes: number;
  comments: number;
  time: string;
};

export type GiftCat = 'hot' | 'gameplay' | 'couple' | 'privilege';
export type Gift = {
  id: string;
  name: string;
  emoji: string;
  price: number;
  /** Gift panel tab (defaults to 'hot'). */
  cat?: GiftCat;
  /** Corner badge on the gift cell. */
  badge?: '3D' | 'music';
  /** Ayrıcalık gifts: minimum SVIP level required to send. */
  minSvip?: number;
  /** Couple gifts: intimacy points gained per gift (already includes the +2% couple bonus). */
  intimacy?: number;
};

export type Conversation = {
  id: string;
  userId: string;
  messages: { id: string; fromMe: boolean; text: string; time: string }[];
  unread: number;
};

export const CATEGORIES = ['Popüler', 'Sohbet', 'Müzik', 'Oyun', 'Arkadaşlık'] as const;
export type Category = (typeof CATEGORIES)[number];

const avatar = (n: number) => `https://i.pravatar.cc/200?img=${n}`;
const photo = (seed: string, w = 600, h = 400) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

export const ME: User = {
  id: 'me',
  name: 'Sen',
  age: 24,
  city: 'İstanbul',
  distanceKm: 0,
  avatar: avatar(12),
  verified: true,
  bio: 'Müzik, kahve ve gece sohbetleri ☕🎧',
  online: true,
  interests: ['🎧 Müzik', '☕ Kahve', '💬 Sohbet'],
  username: 'sen',
  country: 'TR',
  birthDate: '2002-03-14',
  joinedAt: '2026-09-02',
  photos: [],
  showGender: true,
};

export const USERS: User[] = [
  { id: 'u1', name: 'Elif', age: 23, city: 'İstanbul', distanceKm: 2, avatar: avatar(5), verified: true, vip: true, bio: 'Karaoke kraliçesi 🎤', online: true, interests: ['🎤 Karaoke', '🎧 Müzik', '💃 Dans'] },
  { id: 'u2', name: 'Mert', age: 26, city: 'İstanbul', distanceKm: 4, avatar: avatar(11), verified: true, bio: 'Oyun ve gece sohbetleri', online: true, interests: ['🎮 Oyun', '💬 Sohbet', '🎬 Film'] },
  { id: 'u3', name: 'Zeynep', age: 22, city: 'Ankara', distanceKm: 350, avatar: avatar(9), verified: true, bio: 'Kitap kurdu 📚', online: false, interests: ['📚 Kitap', '☕ Kahve', '🎬 Film'] },
  { id: 'u4', name: 'Can', age: 28, city: 'İzmir', distanceKm: 480, avatar: avatar(13), verified: false, bio: 'Gitar çalarım, istek alırım', online: true, interests: ['🎧 Müzik', '🎤 Karaoke', '✈️ Seyahat'] },
  { id: 'u5', name: 'Selin', age: 25, city: 'İstanbul', distanceKm: 6, avatar: avatar(16), verified: true, vip: true, bio: 'Seyahat ✈️ fotoğraf 📷', online: true, interests: ['✈️ Seyahat', '🎬 Film', '☕ Kahve'] },
  { id: 'u6', name: 'Burak', age: 27, city: 'Bursa', distanceKm: 150, avatar: avatar(14), verified: true, bio: 'Futbol muhabbeti ⚽', online: false, interests: ['⚽ Spor', '🎮 Oyun', '💬 Sohbet'] },
  { id: 'u7', name: 'Ayşe', age: 21, city: 'İstanbul', distanceKm: 1, avatar: avatar(20), verified: true, bio: 'Yeni insanlar tanımayı seviyorum', online: true, interests: ['💬 Sohbet', '💃 Dans', '🎧 Müzik'] },
  { id: 'u8', name: 'Emre', age: 29, city: 'Antalya', distanceKm: 700, avatar: avatar(33), verified: false, bio: 'Deniz, kum, müzik 🌊', online: true, interests: ['✈️ Seyahat', '🎧 Müzik', '⚽ Spor'] },
  { id: 'u9', name: 'Deniz', age: 24, city: 'İstanbul', distanceKm: 8, avatar: avatar(25), verified: true, bio: 'Lo-fi dinlerken sohbet', online: true, interests: ['🎧 Müzik', '📚 Kitap', '💬 Sohbet'] },
  { id: 'u10', name: 'Kaan', age: 30, city: 'Eskişehir', distanceKm: 230, avatar: avatar(51), verified: true, bio: 'Stand-up hayranı 😂', online: false, interests: ['🎬 Film', '💬 Sohbet', '🎮 Oyun'] },
  { id: 'u11', name: 'Melis', age: 23, city: 'İstanbul', distanceKm: 3, avatar: avatar(44), verified: true, vip: true, bio: 'Dans ve pop müzik 💃', online: true, interests: ['💃 Dans', '🎧 Müzik', '🎤 Karaoke'] },
  { id: 'u12', name: 'Onur', age: 26, city: 'Konya', distanceKm: 520, avatar: avatar(60), verified: false, bio: 'Kahve bağımlısı', online: true, interests: ['☕ Kahve', '📚 Kitap', '💬 Sohbet'] },
];

const WOMEN = new Set(['u1', 'u3', 'u5', 'u7', 'u9', 'u11']);
const COUNTRY_OF: Record<string, string> = { u4: 'DE', u8: 'AZ', u12: 'NL' };
const LAST_SEEN = ['5 dk önce', '1 sa önce', 'Dün 23:40', '3 gün önce'];
const ASCII: Record<string, string> = { ı: 'i', ğ: 'g', ü: 'u', ş: 's', ö: 'o', ç: 'c' };
USERS.forEach((u, i) => {
  u.gender = WOMEN.has(u.id) ? 'Kadın' : 'Erkek';
  u.username = `${u.name.toLocaleLowerCase('tr-TR').replace(/[ığüşöç]/g, (c) => ASCII[c])}.${10 + i * 7}`;
  u.country = COUNTRY_OF[u.id] ?? 'TR';
  u.joinedAt = `202${5 + (i % 2)}-${String(1 + ((i * 5) % 12)).padStart(2, '0')}-1${i % 9}`;
  u.lastSeen = u.online ? undefined : LAST_SEEN[i % LAST_SEEN.length];
  u.showGender = u.id !== 'u10';
});

// Users who follow the current user back (mutual follow => free messages).
export const FOLLOWS_ME = new Set(['u1', 'u2', 'u5', 'u7', 'u9']);
export const DM_PRICE = 10;

// Room audiences are larger than the named mock users: every other person in a room is a deterministic
// "guest" (id `gx-<room>-<n>`), so room counts, lists and profiles all resolve to the same real person.
const GUEST_NAMES = ['Ahmet', 'Büşra', 'Cem', 'Derya', 'Ece', 'Furkan', 'Gizem', 'Hakan', 'İrem', 'Kerem', 'Leyla', 'Murat', 'Nazlı', 'Oğuz', 'Pelin', 'Rüzgar', 'Sude', 'Tolga', 'Umut', 'Yağmur', 'Zehra', 'Barış', 'Ceren', 'Doruk', 'Esra', 'Gökhan', 'Hande', 'Kaan', 'Mine', 'Serkan'];
const GUEST_CITIES = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Adana', 'Trabzon', 'Samsun', 'Kayseri'];
const guests = new Map<string, User>();
export const isGuestId = (id: string) => id.startsWith('gx-');
export const guestId = (roomId: string, n: number) => `gx-${roomId}-${n}`;
function guestUser(id: string): User {
  const hit = guests.get(id);
  if (hit) return hit;
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const name = GUEST_NAMES[h % GUEST_NAMES.length];
  const u: User = {
    id,
    name: `${name}${h % 3 === 0 ? ` ${String.fromCharCode(65 + (h % 26))}.` : ''}`,
    age: 19 + (h % 18),
    city: GUEST_CITIES[h % GUEST_CITIES.length],
    distanceKm: h % 900,
    avatar: avatar(1 + (h % 70)),
    verified: h % 4 === 0,
    bio: 'Similar Club üyesi',
    online: true,
    gender: h % 2 ? 'Kadın' : 'Erkek',
    username: `uye.${h % 100000}`,
    country: 'TR',
    joinedAt: '2026-06-01',
    showGender: true,
  };
  guests.set(id, u);
  return u;
}

export const userById = (id: string): User =>
  id === 'me' ? ME : (USERS.find((u) => u.id === id) ?? (isGuestId(id) ? guestUser(id) : USERS[0]));

export const ROOMS: Room[] = [
  { id: 'r1', title: 'Gece Sohbeti 🌙', category: 'Sohbet', cover: photo('night'), hostId: 'u1', listeners: 248, seatUserIds: ['u1', 'u2', 'u5', null, 'u7', null, 'u9', null, null], tags: ['Sohbet', 'Gece'], level: 6, roomType: 'free', announcement: 'Gece sohbetine hoş geldin, saygı her şeyden önce 🌙' },
  { id: 'r2', title: 'Karaoke Akşamı 🎤', category: 'Müzik', cover: photo('karaoke'), hostId: 'u11', listeners: 512, seatUserIds: ['u11', 'u4', null, 'u1', null, null, 'u8', null, null], tags: ['Karaoke', 'Pop'], level: 11, agency: true, track: 'm4', roomType: 'music', theme: 'music', bossSeat: true, announcement: 'Star Ajans karaoke gecesi · sıraya girmek için koltuk iste 🎤' },
  { id: 'r3', title: 'Kim Milyoner? Quiz', category: 'Oyun', cover: photo('quiz'), hostId: 'u2', listeners: 133, seatUserIds: ['u2', 'u6', 'u10', 'u12', null, null, null, null, null], tags: ['Oyun', 'Bilgi'], level: 4, roomType: 'qa', announcement: 'Bilgi yarışması · soruları ❓ ile gönder' },
  { id: 'r4', title: 'Yeni Arkadaşlar 💜', category: 'Arkadaşlık', cover: photo('friends'), hostId: 'u7', listeners: 389, seatUserIds: ['u7', 'u5', 'u9', null, null, 'u3', null, null, null], tags: ['Tanışma'], level: 8, adminIds: ['me'], roomType: 'stage', theme: 'friends', bossSeat: true, announcement: 'Sen bu odanın yöneticisisin 🛡️' },
  { id: 'r5', title: 'Lo-fi & Ders Çalışma', category: 'Müzik', cover: photo('lofi'), hostId: 'u9', listeners: 76, seatUserIds: ['u9', null, null, null, null, null, null, null, null], tags: ['Lo-fi', 'Sessiz'], level: 3, track: 'm3', roomType: 'music' },
  { id: 'r6', title: 'Futbol Muhabbeti ⚽', category: 'Sohbet', cover: photo('football'), hostId: 'u6', listeners: 201, seatUserIds: ['u6', 'u2', 'u10', null, 'u12', null, null, null, null], tags: ['Spor'], level: 5, password: '1234', roomType: 'private', announcement: 'Özel oda · şifre: 1234 (demo)' },
  { id: 'r7', title: 'Doğruluk mu Cesaret mi?', category: 'Oyun', cover: photo('dare'), hostId: 'u5', listeners: 445, seatUserIds: ['u5', 'u1', 'u11', 'u7', 'u4', null, null, null, null], tags: ['Oyun', 'Eğlence'], level: 9, agency: true, roomType: 'event', theme: 'pk', bossSeat: true, micPermission: 'members', announcement: 'Etkinlik: Doğruluk mu Cesaret mi · Bu akşam 22:00' },
];

export const roomById = (id: string) => ROOMS.find((r) => r.id === id) ?? ROOMS[0];

export const MOMENTS: Moment[] = [
  { id: 'm1', userId: 'u5', text: 'Kapadokya sabahı 🎈 Burayı herkes bir kez görmeli!', image: photo('cappadocia', 600, 600), likes: 342, comments: 28, time: '12 dk' },
  { id: 'm2', userId: 'u1', text: 'Dün akşamki karaoke odası efsaneydi, gelenlere teşekkürler 💜', likes: 128, comments: 15, time: '1 sa' },
  { id: 'm3', userId: 'u4', text: 'Yeni şarkı üzerinde çalışıyorum, bu akşam odada çalacağım 🎸', image: photo('guitar', 600, 600), likes: 89, comments: 9, time: '3 sa' },
  { id: 'm4', userId: 'u11', text: 'Pazar kahvaltısı ☕🥐', image: photo('breakfast', 600, 600), likes: 210, comments: 19, time: '5 sa' },
  { id: 'm5', userId: 'u9', text: 'Bugün kim ders çalışıyor? Lo-fi odasındayım, gelin 📚', likes: 54, comments: 7, time: '8 sa' },
];

const couple = (id: string, name: string, emoji: string, price: number, badge?: Gift['badge']): Gift => ({
  id,
  name,
  emoji,
  price,
  badge,
  cat: 'couple',
  intimacy: Math.round((price / 10) * 1.02),
});

// Full-size gift catalog (own names, no names copied from other apps). Keep g1…g8 (other screens reference them) and the first five cheap (≤ 500):
// bot gifts use GIFTS.slice(0, 5) and INCOMING_GIFT_POOL prices.
export const GIFTS: Gift[] = [
  // --- Hot ---
  { id: 'g1', name: 'Gül', emoji: '🌹', price: 10, cat: 'hot' },
  { id: 'g2', name: 'Kalp', emoji: '💖', price: 50, cat: 'hot' },
  { id: 'g3', name: 'Kahve', emoji: '☕', price: 99, cat: 'hot' },
  { id: 'g4', name: 'Pasta', emoji: '🎂', price: 200, cat: 'hot', badge: '3D' },
  { id: 'g5', name: 'Taç', emoji: '👑', price: 500, cat: 'hot' },
  { id: 'g6', name: 'Roket', emoji: '🚀', price: 1_999, cat: 'hot', badge: '3D' },
  { id: 'g7', name: 'Elmas', emoji: '💎', price: 4_950, cat: 'hot' },
  { id: 'g8', name: 'Şato', emoji: '🏰', price: 19_999, cat: 'hot', badge: 'music' },
  { id: 'h1', name: 'Oyun Zamanı', emoji: '🎮', price: 7_777, cat: 'hot', badge: '3D' },
  { id: 'h2', name: 'Dünya Turu', emoji: '🌍', price: 249_999, cat: 'hot', badge: 'music' },
  { id: 'h3', name: 'Seni Seviyorum', emoji: '🥰', price: 500, cat: 'hot', badge: '3D' },
  { id: 'h4', name: 'Panda Sarılması', emoji: '🐼', price: 3_999, cat: 'hot', badge: '3D' },
  { id: 'h5', name: 'Tatil Keyfi', emoji: '🏖️', price: 7_999, cat: 'hot' },
  { id: 'h6', name: 'Uçan Öpücük', emoji: '😘', price: 1_999, cat: 'hot' },
  { id: 'h7', name: 'Gece Kralı', emoji: '🤴', price: 39_999, cat: 'hot' },
  { id: 'h8', name: 'Birlikte Bisiklet', emoji: '🚲', price: 777, cat: 'hot', badge: '3D' },
  { id: 'h9', name: 'Parti Zamanı', emoji: '🎉', price: 9_999, cat: 'hot', badge: '3D' },
  { id: 'h10', name: 'Anı Fotoğrafı', emoji: '📸', price: 1_299, cat: 'hot', badge: '3D' },
  { id: 'h11', name: 'Altın Çan', emoji: '🔔', price: 4_950, cat: 'hot' },
  { id: 'h12', name: 'Altın Kuğu', emoji: '🦢', price: 99_950, cat: 'hot', badge: 'music' },
  // --- Gameplay: interactive "throw" gifts (fixed price, no random rewards) ---
  { id: 'p1', name: 'Kar Topu', emoji: '❄️', price: 50, cat: 'gameplay' },
  { id: 'p2', name: 'Sulu Balon', emoji: '🎈', price: 99, cat: 'gameplay' },
  { id: 'p3', name: 'Domates At', emoji: '🍅', price: 200, cat: 'gameplay' },
  { id: 'p4', name: 'Kâğıt Uçak', emoji: '✈️', price: 200, cat: 'gameplay' },
  { id: 'p5', name: 'Su Kovası', emoji: '🪣', price: 500, cat: 'gameplay' },
  { id: 'p6', name: 'Pasta At', emoji: '🥧', price: 777, cat: 'gameplay' },
  { id: 'p7', name: 'Yumurta At', emoji: '🥚', price: 1_299, cat: 'gameplay' },
  { id: 'p8', name: 'Terlik At', emoji: '🩴', price: 1_299, cat: 'gameplay' },
  { id: 'p9', name: 'Konfeti Topu', emoji: '🎊', price: 1_999, cat: 'gameplay', badge: '3D' },
  { id: 'p10', name: 'Aşk Oku', emoji: '💘', price: 2_399, cat: 'gameplay', badge: '3D' },
  // --- Çift ❤ (intimacy +2%) ---
  couple('c1', 'Can Dostum', '💞', 5_000),
  couple('c2', 'Dilek Kavanozu', '🫙', 8_999),
  couple('c3', 'Masal Kalesi', '🏯', 99_999),
  couple('c4', 'Aşk Mektubu', '💌', 7_999),
  couple('c5', 'Sevgi Tatlısı', '🍰', 39_999),
  couple('c6', 'Yıldız Faytonu', '🐎', 699_999, 'music'),
  couple('c7', 'Evlilik Teklifi', '💍', 19_999),
  couple('c8', 'Düğün Günü', '👰', 399_999, '3D'),
  couple('c9', 'Sonsuz Öpücük', '💋', 777),
  couple('c10', 'Kristal Kolye', '📿', 9_999),
  couple('c11', 'Lunapark Randevusu', '🎡', 49_950, '3D'),
  couple('c12', 'Aşk Ateşi', '❤️‍🔥', 1_999),
  // --- Ayrıcalık (SVIP-gated) ---
  { id: 'v1', name: 'Zümrüt Saat', emoji: '⌚', price: 4_950, cat: 'privilege', minSvip: 2 },
  { id: 'v2', name: 'Gizemli Gül', emoji: '🥀', price: 350, cat: 'privilege', minSvip: 2 },
  { id: 'v3', name: 'Sihirli Şapka', emoji: '🎩', price: 19_950, cat: 'privilege', minSvip: 3 },
  { id: 'v4', name: 'Kristal Ayakkabı', emoji: '👠', price: 49_950, cat: 'privilege', minSvip: 4 },
  { id: 'v5', name: 'Altın Kılıç', emoji: '🗡️', price: 777, cat: 'privilege', minSvip: 4 },
  { id: 'v6', name: 'Kartal', emoji: '🦅', price: 99_950, cat: 'privilege', minSvip: 5 },
  { id: 'v7', name: 'Uzay Yolculuğu', emoji: '👨‍🚀', price: 277_750, cat: 'privilege', minSvip: 6, badge: 'music' },
  { id: 'v8', name: 'Gökyüzü Turu', emoji: '🚁', price: 549_950, cat: 'privilege', minSvip: 7, badge: 'music' },
  { id: 'v9', name: 'Altın Kanatlar', emoji: '🪽', price: 199_999, cat: 'privilege', minSvip: 7 },
  { id: 'v10', name: 'Lüks Yat', emoji: '🛥️', price: 399_999, cat: 'privilege', minSvip: 8, badge: 'music' },
  { id: 'v11', name: 'Altın Tavus', emoji: '🦚', price: 299_999, cat: 'privilege', minSvip: 8 },
  { id: 'v12', name: 'Atlıkarınca Gecesi', emoji: '🎠', price: 699_999, cat: 'privilege', minSvip: 9, badge: 'music' },
];

export const COIN_PACKS = [
  { id: 'c1', coins: 60, price: '₺29,99' },
  { id: 'c2', coins: 300, price: '₺129,99', bonus: '+30' },
  { id: 'c3', coins: 980, price: '₺399,99', bonus: '+120' },
  { id: 'c4', coins: 3280, price: '₺1.199,99', bonus: '+500' },
];

export const CONVERSATIONS: Conversation[] = [
  { id: 'c-u1', userId: 'u1', unread: 2, messages: [
    { id: '1', fromMe: false, text: 'Selam! Odada sesin çok güzeldi 😊', time: '21:02' },
    { id: '2', fromMe: true, text: 'Teşekkürler, sen de çok iyiydin!', time: '21:05' },
    { id: '3', fromMe: false, text: 'Yarın yine karaoke var, gelir misin?', time: '21:06' },
  ] },
  { id: 'c-u7', userId: 'u7', unread: 1, messages: [
    { id: '1', fromMe: false, text: 'Merhaba 👋 sana selam verdim', time: '19:40' },
  ] },
  { id: 'c-u2', userId: 'u2', unread: 0, messages: [
    { id: '1', fromMe: true, text: 'Quiz odası kaçta açılıyor?', time: 'Dün' },
    { id: '2', fromMe: false, text: '22:00 gibi, beklerim!', time: 'Dün' },
  ] },
  { id: 'c-u5', userId: 'u5', unread: 0, messages: [
    { id: '1', fromMe: false, text: 'Fotoğrafını beğendim 📷', time: 'Pzt' },
  ] },
  // Demo for the DM safety warning (lib/safety): an off-platform "cheap coins" offer.
  { id: 'c-u12', userId: 'u12', unread: 1, messages: [
    { id: '1', fromMe: false, text: 'Selam! Ucuz jeton satıyorum, 10.000 jeton 50 TL. WhatsApp\'tan yaz: 0532 111 22 33', time: 'Pzt' },
  ] },
];

export const BOT_LINES = [
  'Herkese selam! 👋',
  'Bu oda çok iyi ya 😂',
  'Sesler çok net geliyor',
  'Bir sonraki şarkı ne?',
  'Hoş geldin! 💜',
  'Ben de koltuğa geçebilir miyim?',
  'Hahaha efsane',
  'Nereden katılıyorsunuz?',
  'İstanbul\'dan selamlar',
];
