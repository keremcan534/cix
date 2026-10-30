// Catalogs for the prototype: cosmetics, emoji and sticker packs, room levels, music, support.

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
  /** Code-drawn animation (components/fx): frame styles and entry styles. */
  fx?: 'pulse' | 'orbit' | 'aurora' | 'flame' | 'crown' | 'sparkle' | 'thunder' | 'dragon' | 'comet';
};

export const COSMETIC_KINDS: { kind: CosmeticKind; label: string; emoji: string }[] = [
  { kind: 'frame', label: 'Çerçeve', emoji: '🖼️' },
  { kind: 'entry', label: 'Giriş efekti', emoji: '✨' },
  { kind: 'ride', label: 'Binek', emoji: '🏎️' },
  { kind: 'bubble', label: 'Sohbet balonu', emoji: '💬' },
  { kind: 'specialId', label: 'Özel ID', emoji: '🔢' },
];

export const COSMETICS: Cosmetic[] = [
  { id: 'fr-neon', kind: 'frame', name: 'Ses Dalgası', emoji: '🔊', price: 150, days: 7, color: ['#13D9DF', '#076A70'], fx: 'pulse' },
  { id: 'fr-ocean', kind: 'frame', name: 'Yörünge', emoji: '🪐', price: 300, days: 30, color: ['#38BDF8', '#A78BFA'], fx: 'orbit' },
  { id: 'fr-aurora', kind: 'frame', name: 'Aurora', emoji: '🌌', price: 600, days: 30, color: ['#13D9DF', '#FF6576'], fx: 'aurora' },
  { id: 'fr-fire', kind: 'frame', name: 'Ateş', emoji: '🔥', price: 900, days: 30, color: ['#EF4444', '#F59E0B'], fx: 'flame' },
  { id: 'fr-gold', kind: 'frame', name: 'Altın Taç', emoji: '👑', price: 2_500, days: null, color: ['#F6BD60', '#B7832E'], minVip: 4, fx: 'crown' },
  // Illustrated frames (components/fx/frame-art.tsx); the last two are a matching couple pair.
  { id: 'fr-silver', kind: 'frame', name: 'Gümüş Kristal', emoji: '💠', price: 800, days: 30, color: ['#CBD5E1', '#64748B'] },
  { id: 'fr-frost', kind: 'frame', name: 'Buz Kristali', emoji: '❄️', price: 1_200, days: 30, color: ['#7DD3FC', '#0EA5E9'] },
  { id: 'fr-rose', kind: 'frame', name: 'Gül Kalpler', emoji: '💗', price: 1_200, days: 30, color: ['#FF6576', '#C93C4F'] },
  { id: 'fr-laurel', kind: 'frame', name: 'Altın Defne', emoji: '🌿', price: 2_000, days: 30, color: ['#F6BD60', '#B7832E'] },
  { id: 'fr-crown-silver', kind: 'frame', name: 'Gümüş Taç', emoji: '👑', price: 4_000, days: 30, color: ['#E2E8F0', '#13D9DF'], minVip: 2 },
  { id: 'fr-crown-gold', kind: 'frame', name: 'Kraliyet Kanatları', emoji: '🪽', price: 9_000, days: null, color: ['#F6BD60', '#13D9DF'], minVip: 4 },
  { id: 'fr-wing-coral', kind: 'frame', name: 'Melek Kalp · Mercan', emoji: '💞', price: 3_000, days: 30, color: ['#FF6576', '#F6BD60'] },
  { id: 'fr-wing-sky', kind: 'frame', name: 'Melek Kalp · Turkuaz', emoji: '💙', price: 3_000, days: 30, color: ['#13D9DF', '#F6BD60'] },
  { id: 'en-sparkle', kind: 'entry', name: 'Işıltı', emoji: '✨', price: 200, days: 7, color: ['#0B3B4A', '#087A80'], fx: 'sparkle' },
  { id: 'en-thunder', kind: 'entry', name: 'Şimşek', emoji: '⚡', price: 600, days: 30, color: ['#172554', '#1D4ED8'], fx: 'thunder' },
  { id: 'en-comet', kind: 'entry', name: 'Kuyruklu Yıldız', emoji: '☄️', price: 1_200, days: 30, color: ['#080F1E', '#12304A'], fx: 'comet' },
  { id: 'en-dragon', kind: 'entry', name: 'Ejderha', emoji: '🐉', price: 3_000, days: 30, color: ['#450A0A', '#B91C1C'], minVip: 7, fx: 'dragon' },
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

// --- Emoji & sticker market --------------------------------------------------
// Standard Unicode emoji are free for everyone; only custom-drawn stickers (assets/reactions,
// components/ReactionArt) are sold. A sticker travels in a message as a token (lib/stickers), never
// as a Unicode emoji, so typing 🦊 does not draw the paid fox sticker.

const list = (emojis: string) => emojis.split(' ');
/** Free standard Unicode emoji, grouped for the picker. The device keyboard offers the rest. */
export const STANDARD_EMOJI: { id: string; name: string; emojis: string[] }[] = [
  {
    id: 'faces',
    name: 'Yüzler',
    emojis: list('😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 🫠 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🫢 🤫 🤔 🫡 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 🫤 😟 🙁 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 🤡 👹 👺 👻 👽 🤖 💩'),
  },
  {
    id: 'hands',
    name: 'Eller',
    emojis: list('👋 🤚 🖐️ ✋ 🖖 🫱 🫲 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 🫵 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪'),
  },
  {
    id: 'hearts',
    name: 'Kalpler',
    emojis: list('❤️ 🧡 💛 💚 💙 🩵 💜 🤎 🖤 🩶 🤍 🩷 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 💋 🌹 💐'),
  },
  {
    id: 'nature',
    name: 'Hayvanlar',
    emojis: list('🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐢 🐍 🦖 🐙 🦑 🦀 🐬 🐳 🦈 🐊 🦓 🦒 🐘 🐪 🐿️ 🌵 🌲 🌴 🌱 🍀 🍁 🌸 🌻 🌈 ⭐ 🌙 ☀️ ⛅ 🌧️ ❄️ 🔥 💧 🌊'),
  },
  {
    id: 'food',
    name: 'Yiyecek',
    emojis: list('🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🌽 🥕 🥐 🍞 🧀 🥚 🍳 🥞 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🥙 🍝 🍜 🍣 🍤 🍦 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍭 ☕ 🍵 🧃 🥤 🧋 🍺 🍷 🥂 🍾'),
  },
  {
    id: 'activity',
    name: 'Etkinlik',
    emojis: list('⚽ 🏀 🏈 ⚾ 🎾 🏐 🎱 🏓 🥊 🎮 🕹️ 🎲 🧩 ♟️ 🎯 🎳 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 🎬 🎨 🎭 🎉 🎊 🎈 🎁 🎆 🎇 ✨ 🏆 🥇 🥈 🥉 🏅 🎖️'),
  },
  {
    id: 'objects',
    name: 'Nesneler',
    emojis: list('📱 💻 ⌚ 📷 🎥 📺 📻 ⏰ 💡 🔦 💸 💵 💰 💎 👑 💍 🔑 🔒 🔓 🛒 🎒 👓 🕶️ 👗 👠 🧢 📚 ✏️ 📌 📎 ✂️ 🚗 🏎️ 🛵 ✈️ 🚀 🛸 🏠 🏝️ 🗽 🇹🇷'),
  },
  {
    id: 'symbols',
    name: 'Semboller',
    emojis: list('⚜️ 💠 🪩 💯 ✅ ❌ ❓ ❗ ‼️ ⁉️ ⚠️ 🚫 💤 💢 💥 💫 💦 💨 🕳️ 💬 💭 🗯️ 🔔 🔕 🎵 🎶 ➕ ➖ ✖️ ➗ ♾️ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🆗 🆒 🆕 🆓 🔝'),
  },
];

/** A custom-drawn sticker; `emoji` is the closest Unicode emoji, used only as a text fallback. */
export type Sticker = { id: string; name: string; emoji: string };
/** A sticker pack. Pack ids are the ids users bought before (the store keeps them as `emojiPacks`). */
export type StickerPack = { id: string; name: string; stickers: Sticker[]; price: number; minVip?: number; animated?: boolean };
const st = (id: string, name: string, emoji: string): Sticker => ({ id, name, emoji });
export const STICKER_PACKS: StickerPack[] = [
  {
    id: 'basic',
    name: 'Temel',
    price: 0,
    stickers: [
      st('temel-gulumseme', 'Gülümseme', '😀'),
      st('temel-kahkaha', 'Kahkaha', '😂'),
      st('temel-asik', 'Aşık', '😍'),
      st('temel-duygulandim', 'Duygulandım', '🥹'),
      st('temel-mutlu', 'Mutlu', '😊'),
      st('temel-uzgun', 'Üzgün', '😢'),
      st('temel-kizgin', 'Kızgın', '😡'),
      st('temel-begendim', 'Beğendim', '👍'),
      st('temel-tesekkurler', 'Teşekkürler', '🙏'),
      st('temel-selam', 'Selam', '👋'),
      st('temel-dusunuyorum', 'Düşünüyorum', '🤔'),
      st('temel-uykulu', 'Uykulu', '😴'),
      st('oda-alkis', 'Alkış', '👏'),
      st('oda-saskin', 'Şaşkın', '😮'),
    ],
  },
  {
    id: 'fun',
    name: 'Eğlence',
    price: 50,
    // "Yerlere Yattım" is left out until it is redrawn: its file is the same picture as Temel's Kahkaha.
    stickers: [
      st('eglence-cilgin', 'Çılgın', '🤪'),
      st('eglence-havali', 'Havalı', '😎'),
      st('eglence-parti', 'Parti', '🥳'),
      st('eglence-palyaco', 'Palyaço', '🤡'),
      st('eglence-hayalet', 'Hayalet', '👻'),
      st('eglence-ters-gulus', 'Ters Gülüş', '🙃'),
      st('eglence-beynim-yandi', 'Beynim Yandı', '🤯'),
    ],
  },
  {
    id: 'love',
    name: 'Aşk',
    price: 80,
    stickers: [
      st('ask-kalp', 'Kalp', '❤️'),
      st('ask-iki-kalp', 'İki Kalp', '💕'),
      st('ask-opucuk', 'Öpücük', '💋'),
      st('ask-kalp-eller', 'Kalp Eller', '🫶'),
      st('ask-oklu-kalp', 'Oklu Kalp', '💘'),
      st('ask-opucuk-at', 'Öpücük At', '😘'),
      st('ask-gul', 'Gül', '🌹'),
      st('ask-donen-kalpler', 'Dönen Kalpler', '💞'),
    ],
  },
  {
    id: 'animals',
    name: 'Hayvanlar',
    price: 60,
    stickers: [
      st('hayvanlar-kopek', 'Köpek', '🐶'),
      st('hayvanlar-kedi', 'Kedi', '🐱'),
      st('hayvanlar-tilki', 'Tilki', '🦊'),
      st('hayvanlar-panda', 'Panda', '🐼'),
      st('hayvanlar-kurbaga', 'Kurbağa', '🐸'),
      st('hayvanlar-tek-boynuzlu-at', 'Tek Boynuzlu At', '🦄'),
      st('hayvanlar-penguen', 'Penguen', '🐧'),
      st('hayvanlar-ari', 'Arı', '🐝'),
    ],
  },
  {
    id: 'vip',
    name: 'VIP',
    price: 0,
    minVip: 5,
    // "Kristal" is left out until it is redrawn: its file is the same picture as "Elmas".
    stickers: [
      st('vip-tac', 'Taç', '👑'),
      st('vip-elmas', 'Elmas', '💎'),
      st('vip-ates', 'Ateş', '🔥'),
      st('vip-isilti', 'Işıltı', '✨'),
      st('vip-kupa', 'Kupa', '🏆'),
      st('vip-aslan', 'Aslan', '🦁'),
      st('vip-zambak-armasi', 'Zambak Arması', '⚜️'),
    ],
  },
  {
    id: 'anim',
    name: 'Animasyonlu',
    price: 150,
    animated: true,
    stickers: [
      st('animasyonlu-havai-fisek', 'Havai Fişek', '🎆'),
      st('animasyonlu-maytap', 'Maytap', '🎇'),
      st('animasyonlu-gokkusagi', 'Gökkuşağı', '🌈'),
      st('animasyonlu-patlama', 'Patlama', '💥'),
      st('animasyonlu-konfeti', 'Konfeti', '🎉'),
      st('animasyonlu-disko-topu', 'Disko Topu', '🪩'),
    ],
  },
];
export const ALL_STICKERS: Sticker[] = STICKER_PACKS.flatMap((p) => p.stickers);
export const stickerById = (id: string) => ALL_STICKERS.find((s) => s.id === id);
export const packOfSticker = (id: string) => STICKER_PACKS.find((p) => p.stickers.some((s) => s.id === id));
/** Packs every user has without buying (free and not VIP-gated). */
export const FREE_PACK_IDS = STICKER_PACKS.filter((p) => !p.price && !p.minVip).map((p) => p.id);

// --- Rooms: levels 1–15 ------------------------------------------------------
export const STANDARD_MICS = 10;
export const AGENCY_MICS = 15;
export const ROOM_XP_THRESHOLDS = [0, 100, 300, 600, 1_000, 1_600, 2_400, 3_400, 4_800, 6_500, 8_500, 11_000, 14_000, 18_000, 23_000];
// Per-level limits and rewards (update doc §1.1–1.2). All values are admin-configurable defaults.
export const ROOM_LIMITS: { rooms: number; members: number; admins: number }[] = [
  { rooms: 50, members: 50, admins: 5 },
  { rooms: 100, members: 100, admins: 5 },
  { rooms: 200, members: 200, admins: 5 },
  { rooms: 200, members: 300, admins: 5 },
  { rooms: 200, members: 500, admins: 5 },
  { rooms: 400, members: 600, admins: 7 },
  { rooms: 600, members: 800, admins: 9 },
  { rooms: 1_000, members: 1_200, admins: 12 },
  { rooms: 1_000, members: 1_350, admins: 13 },
  { rooms: 1_000, members: 1_500, admins: 15 },
  { rooms: 1_250, members: 1_750, admins: 17 },
  { rooms: 1_500, members: 2_000, admins: 20 },
  { rooms: 1_750, members: 2_500, admins: 23 },
  { rooms: 2_000, members: 3_000, admins: 27 },
  { rooms: 2_500, members: 5_000, admins: 30 },
];
export const ROOM_LEVEL_REWARDS = [
  'Temel seviye simgesi, standart oda, 5 yöneticiye kadar',
  'Yeni oda arka planı, temel oda teması',
  'Gelişmiş seviye simgesi, 200 kişilik üye sınırı, katkı sıralaması',
  '300 kişilik üye sınırı, ilave oda görünüm seçenekleri',
  '500 kişilik üye sınırı, özel oda hediyeleri, özel tema, mikrofon modu ve özel mikrofon açma yetkisi',
  '7 yöneticiye kadar, ek hediye efektleri ve gelişmiş oda görünümü',
  '9 yöneticiye kadar, yeni oda arka planları ve özel mikrofon düzenleri',
  '1.200 kişilik üye sınırı, 12 yöneticiye kadar, üst seviye oda simgesi, +2 mikrofon',
  '1.350 kişilik üye sınırı, ek tema ve hediye animasyonları',
  '1.500 kişilik üye sınırı, 15 yöneticiye kadar, özel yönetici yeri (BOSS koltuğu)',
  '1.750 kişilik üye sınırı, 17 yöneticiye kadar, yeni oda teması',
  '2.000 kişilik üye sınırı, 20 yöneticiye kadar, özel hediye paketi',
  '2.500 kişilik üye sınırı, 23 yöneticiye kadar, gelişmiş mikrofon düzeni',
  '3.000 kişilik üye sınırı, 27 yöneticiye kadar, özel oda görünümü',
  '5.000 kişilik üye sınırı, 30 yöneticiye kadar, en üst simge, özel tema, hediye ve yönetici alanı',
];
export const memberLimit = (level: number) => ROOM_LIMITS[level - 1].members;
export const ROOM_LEVEL_ICONS = ['🥉', '🥉', '🥈', '🥈', '🥇', '🥇', '🏅', '🏅', '🎖️', '💜', '💜', '💎', '💎', '👑', '🔱'];

export type RoomType = 'free' | 'stage' | 'qa' | 'music' | 'event' | 'private';
export const ROOM_TYPES: { id: RoomType; name: string; emoji: string; desc: string }[] = [
  { id: 'free', name: 'Serbest sohbet', emoji: '💬', desc: 'Yetkili kullanıcılar mikrofon alabilir' },
  { id: 'stage', name: 'Sahne', emoji: '🎭', desc: 'Konuşmacı/dinleyici ayrımı, konuşma isteği gerekir' },
  { id: 'qa', name: 'Soru-cevap', emoji: '❓', desc: 'Dinleyiciler soru gönderir, moderatör seçer' },
  { id: 'music', name: 'Müzik odası', emoji: '🎵', desc: 'Müzik kontrolü, istek kuyruğu, ses araçları' },
  { id: 'event', name: 'Etkinlik odası', emoji: '📅', desc: 'Başlangıç saati, açıklama, katılım ve hatırlatma' },
  { id: 'private', name: 'Özel oda', emoji: '🔒', desc: 'Şifre/davet veya onaylı listeyle giriş' },
];
export const roomTypeInfo = (t: RoomType) => ROOM_TYPES.find((x) => x.id === t)!;

export const roomLevel = (xp: number) => {
  let lvl = 1;
  ROOM_XP_THRESHOLDS.forEach((t, i) => xp >= t && (lvl = i + 1));
  return lvl;
};
/** Mic seats (including the host seat). Absolute max 15. */
export const micCapacity = (agencyRoom: boolean, level: number) =>
  agencyRoom ? AGENCY_MICS : Math.min(15, STANDARD_MICS + (level >= 8 ? 2 : 0) + (level >= 15 ? 3 : 0));
export const adminCapacity = (level: number) => ROOM_LIMITS[level - 1].admins;
// Room settings gates ("Oda Ayarları").
export const ROOM_THEMES = [
  { id: 'chat', name: 'Sohbet', emoji: '💬' },
  { id: 'pk', name: 'PK', emoji: '🥊' },
  { id: 'music', name: 'Müzik', emoji: '🎵' },
  { id: 'game', name: 'Oyun', emoji: '🎮' },
  { id: 'party', name: 'Parti', emoji: '🎉' },
  { id: 'friends', name: 'Arkadaşlık', emoji: '💜' },
] as const;
export type RoomTheme = (typeof ROOM_THEMES)[number]['id'];
export const roomThemeInfo = (t: RoomTheme) => ROOM_THEMES.find((x) => x.id === t) ?? ROOM_THEMES[0];
export const LOCK_MIN_LEVEL = 4; // or any VIP (soyluluk) level
export const MIC_PERMISSION_MIN_LEVEL = 4;
export const BOSS_SEAT_MIN_LEVEL = 3;
/** Boss seat goes to the session's top gifter once they pass this many coins. */
export const BOSS_SEAT_MIN_COINS = 1_000;
export const MIC_COUNT_OPTIONS = [5, 8, 10, 12, 15];
/** Stable public room number shown as "ID". */
export const roomCode = (id: string) => String(10_000_000 + ([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9_000_000, 7)));

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
export const TICKET_CATEGORIES = ['Teknik', 'Üyelik', 'Kazanç', 'Ödeme', 'Güvenlik', 'Ajans', 'Şikâyet', 'İtiraz', 'Moderasyon kararı', 'Hesap kısıtlaması', 'Ajans transferi', 'Oyun sonucu'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export const FAQ = [
  { q: 'Jeton nasıl yüklenir?', a: 'Profil > Cüzdan ekranından bir paket seçip ödeme yapabilirsin. Başarısız ödemeler bakiyeye yansımaz.' },
  { q: 'Elmasları nasıl çekerim?', a: 'Yayıncı Merkezi > Para çek. En az 50.000 elmas (10 USD) gerekir; talepler 3 iş günü içinde incelenir.' },
  { q: 'Ajanstan nasıl ayrılırım?', a: 'Ajans ekranından "Ajans değiştir / ayrıl" talebi oluştur. Bekleme süresi ve gerekçe ekranda gösterilir; itiraz hakkın her zaman vardır.' },
  { q: 'Bir kullanıcıyı nasıl şikâyet ederim?', a: 'Profilinde ••• > Şikâyet et. Her şikâyet bir talep numarası alır ve 24 saat içinde incelenir.' },
  { q: 'Hesabımı nasıl silerim?', a: 'Ayarlar > Hesabı sil. Talep onaylandıktan sonra 30 gün içinde veriler silinir; yasal kayıtlar saklama süresi boyunca tutulur.' },
];

// --- Fan clubs ------------------------------------------------------------------------
// Points come from free actions too (follow, joining, staying, tasks); gifts are optional.
export const FAN_LEVELS = [
  { min: 0, name: 'Yeni hayran', reward: 'Kulüp rozeti' },
  { min: 20, name: 'Destekçi', reward: 'Profil rozeti' },
  { min: 60, name: 'Sadık hayran', reward: 'Özel kulüp emojileri' },
  { min: 150, name: 'Süper hayran', reward: 'Odaya girişte kulüp efekti' },
  { min: 300, name: 'Kulüp yıldızı', reward: 'Özel çerçeve ve kulüp görevleri' },
  { min: 600, name: 'Efsane hayran', reward: 'Yayıncının izniyle özel sohbet/etkinlik erişimi' },
];
export const fanLevel = (points: number) => {
  let i = 0;
  FAN_LEVELS.forEach((l, j) => points >= l.min && (i = j));
  return { index: i, current: FAN_LEVELS[i], next: FAN_LEVELS[i + 1] };
};

// --- Game center (third-party providers, mock) ---------------------------------------
export const GAME_MIN_VIP = 2; // admin-configurable
export const GAME_CATALOG_VISIBLE_BEFORE_VIP = true; // admin setting: show catalog (locked) before VIP 2
export type Game = { id: string; name: string; emoji: string; provider: string; kind: string; players: string; free: boolean };
/** Coin game tiles shown in the room menu; all run through the provider flow in /oyunlar (VIP2+). */
export const COIN_GAME_TILES: { id: string; name: string; emoji: string; colors: [string, string]; badge?: 'HOT' | 'NEW' }[] = [
  { id: 'g3', name: 'Ludo', emoji: '🎲', colors: ['#F59E0B', '#B45309'], badge: 'HOT' },
  { id: 'g4', name: 'Çizim Tahmin', emoji: '🎨', colors: ['#06B6D4', '#0E7490'] },
  { id: 'g6', name: 'Bilgi Turnuvası', emoji: '🏆', colors: ['#8B5CF6', '#5B21B6'], badge: 'NEW' },
  { id: 'c1', name: 'Roket', emoji: '🚀', colors: ['#1D4ED8', '#7C3AED'] },
  { id: 'c2', name: 'Meyve Partisi', emoji: '🍓', colors: ['#16A34A', '#DB2777'] },
  { id: 'c3', name: 'Hazine Sandığı', emoji: '💰', colors: ['#CA8A04', '#7C2D12'] },
  { id: 'c4', name: 'Penaltı', emoji: '⚽', colors: ['#0EA5E9', '#1E3A8A'] },
  { id: 'c5', name: 'Balık Avı', emoji: '🦈', colors: ['#0891B2', '#164E63'] },
];

export const GAMES: Game[] = [
  { id: 'g1', name: 'Kelime Avı', emoji: '🔤', provider: 'Sağlayıcı A', kind: 'Kelime', players: '2–6', free: true },
  { id: 'g2', name: 'Bilgi Yarışması', emoji: '🧠', provider: 'Sağlayıcı A', kind: 'Bilgi', players: '2–10', free: true },
  { id: 'g3', name: 'Ludo', emoji: '🎲', provider: 'Sağlayıcı B', kind: 'Masa', players: '2–4', free: false },
  { id: 'g4', name: 'Çizim Tahmin', emoji: '🎨', provider: 'Sağlayıcı B', kind: 'Oda içi grup', players: '3–8', free: false },
  { id: 'g5', name: 'Hızlı Matematik', emoji: '➗', provider: 'Sağlayıcı C', kind: 'Hafif sosyal', players: '1–4', free: true },
  { id: 'g6', name: 'Haftalık Turnuva: Bilgi', emoji: '🏆', provider: 'Sağlayıcı A', kind: 'Turnuva', players: '64', free: false },
];
