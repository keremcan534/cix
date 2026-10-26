// Two independent game catalogs (Oyun Merkezi spec §6):
//  - Oda oyunları: free for everyone, played with people in the room; VIP never required.
//  - Casino (VIP2): chance games, minimum VIP level per game (default 2), opened from the profile's
//    Oyun Merkezi or from inside a room. Both entry points use the same platform (lib/games.ts).
// Every value here is a default the admin screen (oyun-yonetimi) can change. Provider names are
// placeholders until the provider/licence research (spec §7) is done.

export type RoomGame = {
  id: string;
  name: string;
  emoji: string;
  provider: string;
  version: string;
  active: boolean;
  phase: 1 | 2; // spec §3.1 first release vs §3.2 second stage
  minPlayers: number;
  maxPlayers: number;
  /** Who may open a table in a room. */
  startBy: 'owner_mod' | 'anyone';
  joinAfterStart: boolean;
  roundSeconds: number;
  vipRequired: false; // free room games never require VIP
  /** Playable in this prototype; others show "sağlayıcı entegrasyonu bekleniyor". */
  playable: boolean;
  leaderboard: boolean;
  note?: string;
};

export type CasinoGame = {
  id: 'wheel' | 'dice' | 'slot' | 'dragon';
  name: string;
  emoji: string;
  provider: string;
  active: boolean;
  /** Minimum Servet Seviyesi (wealth level) to play. */
  minWealth: number;
  fromProfile: boolean;
  fromRoom: boolean;
  bets: number[]; // allowed stakes in coins
  dailyLimit: number; // coins per user per day across this game
  rules: string;
  /** down = launch refused; error = round fails after the stake (refund path, for testing). */
  providerStatus: 'online' | 'down' | 'error';
  license: string;
};

export const ROOM_GAMES: RoomGame[] = [
  { id: 'ludo', name: 'Ludo', emoji: '🎲', provider: 'Sağlayıcı (araştırılıyor)', version: '0.1-demo', active: true, phase: 1, minPlayers: 2, maxPlayers: 4, startBy: 'anyone', joinAfterStart: false, roundSeconds: 600, vipRequired: false, playable: true, leaderboard: true },
  {
    id: 'cards',
    name: 'Renk Kartları',
    emoji: '🃏',
    provider: 'Özgün tasarım',
    version: '0.1-demo',
    active: true,
    phase: 1,
    minPlayers: 2,
    maxPlayers: 6,
    startBy: 'anyone',
    joinAfterStart: false,
    roundSeconds: 300,
    vipRequired: false,
    playable: true,
    leaderboard: true,
    note: 'UNO benzeri mekanik, özgün ad ve tasarım (UNO lisansı alınmadan marka kullanılmaz).',
  },
  { id: 'domino', name: 'Domino', emoji: '🁫', provider: 'Sağlayıcı (araştırılıyor)', version: '—', active: true, phase: 1, minPlayers: 2, maxPlayers: 4, startBy: 'anyone', joinAfterStart: false, roundSeconds: 600, vipRequired: false, playable: false, leaderboard: true },
  { id: 'pool', name: '8 Top Bilardo', emoji: '🎱', provider: 'Sağlayıcı (araştırılıyor)', version: '—', active: true, phase: 1, minPlayers: 2, maxPlayers: 2, startBy: 'anyone', joinAfterStart: false, roundSeconds: 600, vipRequired: false, playable: false, leaderboard: true },
  { id: 'jackaroo', name: 'Jackaroo', emoji: '♠️', provider: 'Sağlayıcı (araştırılıyor)', version: '—', active: true, phase: 1, minPlayers: 4, maxPlayers: 4, startBy: 'owner_mod', joinAfterStart: false, roundSeconds: 900, vipRequired: false, playable: false, leaderboard: false },
  { id: 'xox', name: 'XOX', emoji: '⭕', provider: 'Yerleşik', version: '1.0', active: true, phase: 2, minPlayers: 2, maxPlayers: 2, startBy: 'anyone', joinAfterStart: false, roundSeconds: 120, vipRequired: false, playable: true, leaderboard: false },
  { id: 'connect4', name: 'Dört Taş', emoji: '🔴', provider: 'Yerleşik', version: '—', active: false, phase: 2, minPlayers: 2, maxPlayers: 2, startBy: 'anyone', joinAfterStart: false, roundSeconds: 300, vipRequired: false, playable: false, leaderboard: false },
  { id: 'words', name: 'Kelime Zinciri', emoji: '🔤', provider: 'Yerleşik', version: '—', active: false, phase: 2, minPlayers: 2, maxPlayers: 10, startBy: 'owner_mod', joinAfterStart: true, roundSeconds: 300, vipRequired: false, playable: false, leaderboard: true },
  { id: 'quiz', name: 'Bilgi Yarışması', emoji: '🧠', provider: 'Yerleşik', version: '—', active: false, phase: 2, minPlayers: 2, maxPlayers: 20, startBy: 'owner_mod', joinAfterStart: true, roundSeconds: 300, vipRequired: false, playable: false, leaderboard: true },
  { id: 'truefalse', name: 'Doğru / Yanlış', emoji: '✅', provider: 'Yerleşik', version: '—', active: false, phase: 2, minPlayers: 2, maxPlayers: 20, startBy: 'owner_mod', joinAfterStart: true, roundSeconds: 180, vipRequired: false, playable: false, leaderboard: true },
  { id: 'memory', name: 'Hafıza Eşleştirme', emoji: '🧩', provider: 'Yerleşik', version: '—', active: false, phase: 2, minPlayers: 1, maxPlayers: 4, startBy: 'anyone', joinAfterStart: false, roundSeconds: 180, vipRequired: false, playable: false, leaderboard: true },
];

export const CASINO_GAMES: CasinoGame[] = [
  {
    id: 'wheel',
    name: 'Şans Çarkı',
    emoji: '🎡',
    provider: 'Yerleşik (sunucu RNG)',
    active: true,
    minWealth: 2,
    fromProfile: true,
    fromRoom: true,
    bets: [10, 50, 100],
    dailyLimit: 5000,
    rules: 'Çark 8 dilimli; dilimler 0x, 0.5x, 1x, 1.5x, 2x, 3x, 5x ve 10x çarpan verir.',
    providerStatus: 'online',
    license: 'Yerleşik · hukuki inceleme bekliyor',
  },
  { id: 'dice', name: 'Zar', emoji: '🎲', provider: 'Yerleşik (sunucu RNG)', active: true, minWealth: 2, fromProfile: true, fromRoom: true, bets: [10, 50, 100, 500], dailyLimit: 5000, rules: 'İki zar atılır. Toplam 8–12 "Büyük", 2–6 "Küçük" kazandırır (1.9x); 7 gelirse kasa kazanır.', providerStatus: 'online', license: 'Yerleşik · hukuki inceleme bekliyor' },
  { id: 'slot', name: 'Lucky 77', emoji: '🎰', provider: 'Sağlayıcı (araştırılıyor)', active: true, minWealth: 2, fromProfile: true, fromRoom: false, bets: [10, 50, 100], dailyLimit: 3000, rules: '3 makara. Üç 7 = 20x, üç aynı meyve = 5x, iki 7 = 2x.', providerStatus: 'online', license: 'Sağlayıcı lisansı doğrulanmalı' },
  { id: 'dragon', name: 'Dragon Tiger', emoji: '🐉', provider: 'Sağlayıcı (araştırılıyor)', active: true, minWealth: 2, fromProfile: true, fromRoom: true, bets: [10, 50, 100, 500], dailyLimit: 5000, rules: 'Ejder ve Kaplan birer kart açar; yüksek kart kazanır (1.95x). Beraberlik seçimi 8x; beraberlikte diğer seçimlerin yarısı iade edilir.', providerStatus: 'online', license: 'Sağlayıcı lisansı doğrulanmalı' },
];
