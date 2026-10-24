import type { RoomType } from '@/data/catalog';

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

export type Gift = { id: string; name: string; emoji: string; price: number };

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
};

export const USERS: User[] = [
  { id: 'u1', name: 'Elif', age: 23, city: 'İstanbul', distanceKm: 2, avatar: avatar(5), verified: true, vip: true, bio: 'Karaoke kraliçesi 🎤', online: true },
  { id: 'u2', name: 'Mert', age: 26, city: 'İstanbul', distanceKm: 4, avatar: avatar(11), verified: true, bio: 'Oyun ve gece sohbetleri', online: true },
  { id: 'u3', name: 'Zeynep', age: 22, city: 'Ankara', distanceKm: 350, avatar: avatar(9), verified: true, bio: 'Kitap kurdu 📚', online: false },
  { id: 'u4', name: 'Can', age: 28, city: 'İzmir', distanceKm: 480, avatar: avatar(13), verified: false, bio: 'Gitar çalarım, istek alırım', online: true },
  { id: 'u5', name: 'Selin', age: 25, city: 'İstanbul', distanceKm: 6, avatar: avatar(16), verified: true, vip: true, bio: 'Seyahat ✈️ fotoğraf 📷', online: true },
  { id: 'u6', name: 'Burak', age: 27, city: 'Bursa', distanceKm: 150, avatar: avatar(14), verified: true, bio: 'Futbol muhabbeti ⚽', online: false },
  { id: 'u7', name: 'Ayşe', age: 21, city: 'İstanbul', distanceKm: 1, avatar: avatar(20), verified: true, bio: 'Yeni insanlar tanımayı seviyorum', online: true },
  { id: 'u8', name: 'Emre', age: 29, city: 'Antalya', distanceKm: 700, avatar: avatar(33), verified: false, bio: 'Deniz, kum, müzik 🌊', online: true },
  { id: 'u9', name: 'Deniz', age: 24, city: 'İstanbul', distanceKm: 8, avatar: avatar(25), verified: true, bio: 'Lo-fi dinlerken sohbet', online: true },
  { id: 'u10', name: 'Kaan', age: 30, city: 'Eskişehir', distanceKm: 230, avatar: avatar(51), verified: true, bio: 'Stand-up hayranı 😂', online: false },
  { id: 'u11', name: 'Melis', age: 23, city: 'İstanbul', distanceKm: 3, avatar: avatar(44), verified: true, vip: true, bio: 'Dans ve pop müzik 💃', online: true },
  { id: 'u12', name: 'Onur', age: 26, city: 'Konya', distanceKm: 520, avatar: avatar(60), verified: false, bio: 'Kahve bağımlısı', online: true },
];

const WOMEN = new Set(['u1', 'u3', 'u5', 'u7', 'u9', 'u11']);
USERS.forEach((u) => (u.gender = WOMEN.has(u.id) ? 'Kadın' : 'Erkek'));

// Users who follow the current user back (mutual follow => free messages).
export const FOLLOWS_ME = new Set(['u1', 'u2', 'u5', 'u7', 'u9']);
export const DM_PRICE = 10;

export const userById = (id: string): User =>
  id === 'me' ? ME : (USERS.find((u) => u.id === id) ?? USERS[0]);

export const ROOMS: Room[] = [
  { id: 'r1', title: 'Gece Sohbeti 🌙', category: 'Sohbet', cover: photo('night'), hostId: 'u1', listeners: 248, seatUserIds: ['u1', 'u2', 'u5', null, 'u7', null, 'u9', null, null], tags: ['Sohbet', 'Gece'], level: 6, roomType: 'free', announcement: 'Gece sohbetine hoş geldin, saygı her şeyden önce 🌙' },
  { id: 'r2', title: 'Karaoke Akşamı 🎤', category: 'Müzik', cover: photo('karaoke'), hostId: 'u11', listeners: 512, seatUserIds: ['u11', 'u4', null, 'u1', null, null, 'u8', null, null], tags: ['Karaoke', 'Pop'], level: 11, agency: true, track: 'm4', roomType: 'music', announcement: 'Star Ajans karaoke gecesi · sıraya girmek için koltuk iste 🎤' },
  { id: 'r3', title: 'Kim Milyoner? Quiz', category: 'Oyun', cover: photo('quiz'), hostId: 'u2', listeners: 133, seatUserIds: ['u2', 'u6', 'u10', 'u12', null, null, null, null, null], tags: ['Oyun', 'Bilgi'], level: 4, roomType: 'qa', announcement: 'Bilgi yarışması · soruları ❓ ile gönder' },
  { id: 'r4', title: 'Yeni Arkadaşlar 💜', category: 'Arkadaşlık', cover: photo('friends'), hostId: 'u7', listeners: 389, seatUserIds: ['u7', 'u5', 'u9', null, null, 'u3', null, null, null], tags: ['Tanışma'], level: 8, adminIds: ['me'], roomType: 'stage', announcement: 'Sen bu odanın yöneticisisin 🛡️' },
  { id: 'r5', title: 'Lo-fi & Ders Çalışma', category: 'Müzik', cover: photo('lofi'), hostId: 'u9', listeners: 76, seatUserIds: ['u9', null, null, null, null, null, null, null, null], tags: ['Lo-fi', 'Sessiz'], level: 3, track: 'm3', roomType: 'music' },
  { id: 'r6', title: 'Futbol Muhabbeti ⚽', category: 'Sohbet', cover: photo('football'), hostId: 'u6', listeners: 201, seatUserIds: ['u6', 'u2', 'u10', null, 'u12', null, null, null, null], tags: ['Spor'], level: 5, password: '1234', roomType: 'private', announcement: 'Özel oda · şifre: 1234 (demo)' },
  { id: 'r7', title: 'Doğruluk mu Cesaret mi?', category: 'Oyun', cover: photo('dare'), hostId: 'u5', listeners: 445, seatUserIds: ['u5', 'u1', 'u11', 'u7', 'u4', null, null, null, null], tags: ['Oyun', 'Eğlence'], level: 9, agency: true, roomType: 'event', announcement: 'Etkinlik: Doğruluk mu Cesaret mi · Bu akşam 22:00' },
];

export const roomById = (id: string) => ROOMS.find((r) => r.id === id) ?? ROOMS[0];

export const MOMENTS: Moment[] = [
  { id: 'm1', userId: 'u5', text: 'Kapadokya sabahı 🎈 Burayı herkes bir kez görmeli!', image: photo('cappadocia', 600, 600), likes: 342, comments: 28, time: '12 dk' },
  { id: 'm2', userId: 'u1', text: 'Dün akşamki karaoke odası efsaneydi, gelenlere teşekkürler 💜', likes: 128, comments: 15, time: '1 sa' },
  { id: 'm3', userId: 'u4', text: 'Yeni şarkı üzerinde çalışıyorum, bu akşam odada çalacağım 🎸', image: photo('guitar', 600, 600), likes: 89, comments: 9, time: '3 sa' },
  { id: 'm4', userId: 'u11', text: 'Pazar kahvaltısı ☕🥐', image: photo('breakfast', 600, 600), likes: 210, comments: 19, time: '5 sa' },
  { id: 'm5', userId: 'u9', text: 'Bugün kim ders çalışıyor? Lo-fi odasındayım, gelin 📚', likes: 54, comments: 7, time: '8 sa' },
];

export const GIFTS: Gift[] = [
  { id: 'g1', name: 'Gül', emoji: '🌹', price: 1 },
  { id: 'g2', name: 'Kalp', emoji: '💖', price: 5 },
  { id: 'g3', name: 'Kahve', emoji: '☕', price: 10 },
  { id: 'g4', name: 'Pasta', emoji: '🎂', price: 50 },
  { id: 'g5', name: 'Taç', emoji: '👑', price: 100 },
  { id: 'g6', name: 'Roket', emoji: '🚀', price: 300 },
  { id: 'g7', name: 'Elmas', emoji: '💎', price: 500 },
  { id: 'g8', name: 'Şato', emoji: '🏰', price: 1000 },
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
