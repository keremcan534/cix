// Two independent game catalogs (Oyun Merkezi spec §6):
//  - Oda oyunları: free for everyone, played with people in the room; VIP never required.
//  - Casino (VIP2): chance games, minimum VIP level per game (default 2), opened from the profile's
//    Oyun Merkezi or from inside a room. Both entry points use the same platform (lib/games.ts).
// Every value here is a default the admin screen (oyun-yonetimi) can change. Provider names are
// placeholders until the provider/licence research (spec §7) is done.
import type { CasinoId } from '@/lib/casino-odds';

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
  id: CasinoId;
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
  {
    id: 'okey',
    name: 'Okey',
    emoji: '🀄',
    provider: 'Yerleşik',
    version: '1.0',
    active: true,
    phase: 1,
    minPlayers: 1,
    maxPlayers: 4,
    startBy: 'anyone',
    joinAfterStart: true,
    roundSeconds: 900,
    vipRequired: false,
    playable: true,
    leaderboard: true,
    note: 'Boş koltuklara bot oturur; odadaki herkes masayı izleyebilir, el aralarında boş koltuğa oturabilir.',
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

// Casino catalog from the client's reference screens. The older games (Şans Çarkı, Zar, Dragon Tiger, Altın Kasa) stay
// in the catalog switched off; the admin screen can turn them back on.
export const CASINO_GAMES: CasinoGame[] = [
  {
    id: 'slot',
    name: 'Lucky 77',
    emoji: '🎰',
    provider: 'Yerleşik (sunucu RNG)',
    active: true,
    minWealth: 2,
    fromProfile: true,
    fromRoom: true,
    bets: [100, 1_000, 10_000, 100_000],
    dailyLimit: 1_000_000,
    rules: 'Fişini Karpuz (x2), 77 (x8) veya Elma (x2) üzerine koy; aynı turda birden fazlasına oynayabilirsin. Çark 20 dilimli: 4 Karpuz, 4 Elma, 1 77, 6 Limon, 5 Üzüm; Limon ve Üzüm kimseye ödemez. Oynanan jetonun %60’ı kasaya kalır, %40’ı kazananlara dağılır.',
    providerStatus: 'online',
    license: 'Yerleşik · hukuki inceleme bekliyor',
  },
  {
    id: 'jackpot',
    name: 'Mega Jackpot',
    emoji: '💰',
    provider: 'Yerleşik (sunucu RNG)',
    active: true,
    minWealth: 2,
    fromProfile: true,
    fromRoom: true,
    bets: [10, 20, 50, 90, 100, 200],
    dailyLimit: 10_000,
    rules: '5 makara, 3 sıra, 10 çizgi. Bahis çizgilere eşit bölünür; soldan başlayan 3, 4 veya 5 aynı sembol kazandırır. 77 her sembolün yerine geçer. Bir çizgide beş 77 JACKPOT kazandırır: bahsin / en yüksek bahis kadar JACKPOT payı. Her bahsin %2’si JACKPOT’a eklenir. Oynanan jetonun %60’ı kasaya kalır, %40’ı kazananlara dağılır.',
    providerStatus: 'online',
    license: 'Yerleşik · hukuki inceleme bekliyor',
  },
  {
    id: 'olympus',
    name: 'Olympus Slot',
    emoji: '⚡',
    provider: 'Yerleşik (sunucu RNG)',
    active: true,
    minWealth: 2,
    fromProfile: true,
    fromRoom: true,
    bets: [10, 20, 50, 100],
    dailyLimit: 10_000,
    rules: '6 makara, 5 sıra; semboller ekranın her yerinde öder: aynı sembolden 8 veya daha fazla kazandırır. Çarpan küreleri toplanır ve dönüşün kazancını çarpar. 4 veya daha fazla ⚡ Zeus 10 bedava dönüş verir. Bir turda en fazla bahsin 500 katı. Oynanan jetonun %60’ı kasaya kalır, %40’ı kazananlara dağılır.',
    providerStatus: 'online',
    license: 'Yerleşik · hukuki inceleme bekliyor',
  },
  {
    id: 'fish',
    name: 'Balık Avı',
    emoji: '🐟',
    provider: 'Yerleşik (sunucu RNG)',
    active: true,
    minWealth: 2,
    fromProfile: true,
    fromRoom: true,
    bets: [10, 20, 50, 100, 200],
    dailyLimit: 20_000,
    rules: 'Bir balığa dokun, top ateş eder: her atış bir turdur ve bahis kadar jeton düşer. Balık yakalanırsa üstündeki çarpan kadar öder (2x–100x); büyük balık daha zor yakalanır. Boşa giden atış ücretsizdir. Dondurma ve kilit kartları yalnızca nişanı kolaylaştırır, şansı değiştirmez. Oynanan jetonun %60’ı kasaya kalır, %40’ı kazananlara dağılır.',
    providerStatus: 'online',
    license: 'Yerleşik · hukuki inceleme bekliyor',
  },
  {
    id: 'rocket',
    name: 'Roket',
    emoji: '🚀',
    provider: 'Yerleşik (sunucu RNG)',
    active: true,
    minWealth: 2,
    fromProfile: true,
    fromRoom: true,
    bets: [100, 1_000, 10_000, 100_000],
    dailyLimit: 1_000_000,
    rules: 'Kaçış çarpanını seç ve roketi fırlat. Roket o çarpana patlamadan ulaşırsa bahsin o katını kazanırsın; önce patlarsa bahis gider. Patlama noktası fırlatmadan önce sunucuda belirlenir. Yüksek çarpana ulaşmak zordur: x çarpanına ulaşma şansı en fazla 0,4 / x. Oynanan jetonun %60’ı kasaya kalır, %40’ı kazananlara dağılır.',
    providerStatus: 'online',
    license: 'Yerleşik · hukuki inceleme bekliyor',
  },
  {
    id: 'super777',
    name: 'Süper 777',
    emoji: '7️⃣',
    provider: 'Yerleşik (sunucu RNG)',
    active: true,
    minWealth: 2,
    fromProfile: true,
    fromRoom: true,
    bets: [10, 50, 100, 500, 1_000],
    dailyLimit: 50_000,
    rules: '3 makara, 3 sıra, 5 çizgi (üç sıra ve iki çapraz). Bir çizgide üç aynı sembol kazandırır; üç 7 en büyük ödüldür. Oynanan jetonun %60’ı kasaya kalır, %40’ı kazananlara dağılır.',
    providerStatus: 'online',
    license: 'Yerleşik · hukuki inceleme bekliyor',
  },
  {
    id: 'jungle',
    name: 'Orman Avı',
    emoji: '🦍',
    provider: 'Yerleşik (sunucu RNG)',
    active: true,
    minWealth: 2,
    fromProfile: true,
    fromRoom: true,
    bets: [15, 30, 90, 150, 300],
    dailyLimit: 50_000,
    rules: '5 makara, 3 sıra, 15 çizgi. Soldan başlayan 3, 4 veya 5 aynı sembol kazandırır; 🦁 Aslan her sembolün yerine geçer. Bir çizgide beş Aslan JACKPOT kazandırır: bahsin / en yüksek bahis kadar pay. Her bahsin %2’si JACKPOT’a eklenir. Oynanan jetonun %60’ı kasaya kalır, %40’ı kazananlara dağılır.',
    providerStatus: 'online',
    license: 'Yerleşik · hukuki inceleme bekliyor',
  },
  {
    id: 'goldtree',
    name: 'Altın Ağacı',
    emoji: '🌳',
    provider: 'Yerleşik (sunucu RNG)',
    active: true,
    minWealth: 2,
    fromProfile: true,
    fromRoom: true,
    bets: [10, 50, 100, 500, 1_000],
    dailyLimit: 50_000,
    rules: '3 makara, orta çizgi öder: üç Altın Ağaç 188x, üç kırmızı para 58x, üç mavi 28x, üç yeşil 18x, ilk makarada ağaç ve iki para 8x, herhangi üç para 2x. Oynanan jetonun %60’ı kasaya kalır, %40’ı kazananlara dağılır.',
    providerStatus: 'online',
    license: 'Yerleşik · hukuki inceleme bekliyor',
  },
  {
    id: 'foodwheel',
    name: 'Lezzet Çarkı',
    emoji: '🎡',
    provider: 'Yerleşik (sunucu RNG)',
    active: true,
    minWealth: 2,
    fromProfile: true,
    fromRoom: true,
    bets: [100, 1_000, 10_000, 100_000],
    dailyLimit: 1_000_000,
    rules: 'Sekiz yemekten istediklerine fiş koy: sebzeler x5, Et x10, Karides x15, Balık x25, Yengeç x45. 🥗 Salata gelirse bütün sebzeler, 🍕 Pizza gelirse bütün et ve deniz ürünleri kazanır; 🍽️ Boş Tabak kimseye ödemez. Oynanan jetonun %60’ı kasaya kalır, %40’ı kazananlara dağılır.',
    providerStatus: 'online',
    license: 'Yerleşik · hukuki inceleme bekliyor',
  },
  {
    id: 'magiccard',
    name: 'Büyücü Kartı',
    emoji: '🔮',
    provider: 'Yerleşik (sunucu RNG)',
    active: true,
    minWealth: 2,
    fromProfile: true,
    fromRoom: true,
    bets: [100, 1_000, 5_000, 10_000],
    dailyLimit: 1_000_000,
    rules: 'Sekiz burç kartından istediklerine fiş koy; açılan kart üstündeki çarpan kadar öder (x4–x100). 🃏 Joker açılırsa kimse kazanmaz. Oynanan jetonun %60’ı kasaya kalır, %40’ı kazananlara dağılır.',
    providerStatus: 'online',
    license: 'Yerleşik · hukuki inceleme bekliyor',
  },
  {
    id: 'pinata',
    name: 'Piñata',
    emoji: '🪅',
    provider: 'Yerleşik (sunucu RNG)',
    active: true,
    minWealth: 2,
    fromProfile: true,
    fromRoom: true,
    bets: [20, 100, 200, 500, 1_000],
    dailyLimit: 50_000,
    rules: '5 makara, 3 sıra, 20 çizgi. Soldan başlayan 3, 4 veya 5 aynı sembol kazandırır; 🪅 Piñata her sembolün yerine geçer. Bir çizgide beş Piñata JACKPOT kazandırır: bahsin / en yüksek bahis kadar pay. Her bahsin %2’si JACKPOT’a eklenir. Oynanan jetonun %60’ı kasaya kalır, %40’ı kazananlara dağılır.',
    providerStatus: 'online',
    license: 'Yerleşik · hukuki inceleme bekliyor',
  },
  {
    id: 'spellbook',
    name: 'Büyü Kitabı',
    emoji: '📖',
    provider: 'Yerleşik (sunucu RNG)',
    active: true,
    minWealth: 2,
    fromProfile: true,
    fromRoom: true,
    bets: [20, 50, 100, 200, 500],
    dailyLimit: 50_000,
    rules: '5 makara, 3 sıra, 20 çizgi; 🧙‍♀️ Cadı her sembolün yerine geçer. 📖 Büyü Kitabı ekranın her yerinde öder: 3 kitap MINI (bahsin 5 katı), 4 kitap MINOR (20 katı), 5 kitap MAJOR (100 katı). Bir çizgide beş Cadı GRAND JACKPOT kazandırır: bahsin / en yüksek bahis kadar pay. Her bahsin %2’si GRAND’a eklenir. Oynanan jetonun %60’ı kasaya kalır, %40’ı kazananlara dağılır.',
    providerStatus: 'online',
    license: 'Yerleşik · hukuki inceleme bekliyor',
  },
  {
    id: 'neon',
    name: 'Neon Jackpot',
    emoji: '💎',
    provider: 'Yerleşik (sunucu RNG)',
    active: true,
    minWealth: 2,
    fromProfile: true,
    fromRoom: true,
    bets: [10, 50, 100, 500, 1_000],
    dailyLimit: 50_000,
    rules: '5 makara, 3 sıra, 10 çizgi. Soldan başlayan 3, 4 veya 5 aynı sembol kazandırır; WILD her sembolün yerine geçer. Bir çizgide beş WILD JACKPOT kazandırır: bahsin / en yüksek bahis kadar pay. Her bahsin %2’si JACKPOT’a eklenir. Oynanan jetonun %60’ı kasaya kalır, %40’ı kazananlara dağılır.',
    providerStatus: 'online',
    license: 'Yerleşik · hukuki inceleme bekliyor',
  },
  {
    id: 'wheel',
    name: 'Şans Çarkı',
    emoji: '🎡',
    provider: 'Yerleşik (sunucu RNG)',
    active: false,
    minWealth: 2,
    fromProfile: true,
    fromRoom: true,
    bets: [10, 50, 100],
    dailyLimit: 5000,
    rules: 'Çark 8 dilimli; dilimler 0x, 0.5x, 1x, 2x, 3x, 5x, 10x ve 20x çarpan verir. Oynanan jetonun %60’ı kasaya kalır, %40’ı kazananlara dağılır.',
    providerStatus: 'online',
    license: 'Yerleşik · hukuki inceleme bekliyor',
  },
  { id: 'dice', name: 'Zar', emoji: '🎲', provider: 'Yerleşik (sunucu RNG)', active: false, minWealth: 2, fromProfile: true, fromRoom: true, bets: [10, 50, 100, 500], dailyLimit: 5000, rules: 'İki zar atılır. Toplam 10–12 "Büyük", 2–4 "Küçük" kazandırır (2.4x); 5–9 gelirse kasa kazanır. Oynanan jetonun %60’ı kasaya kalır, %40’ı kazananlara dağılır.', providerStatus: 'online', license: 'Yerleşik · hukuki inceleme bekliyor' },
  { id: 'dragon', name: 'Dragon Tiger', emoji: '🐉', provider: 'Sağlayıcı (araştırılıyor)', active: false, minWealth: 2, fromProfile: true, fromRoom: true, bets: [10, 50, 100, 500], dailyLimit: 5000, rules: 'Ejder ve Kaplan birer kart açar. Seçtiğin taraf en az 4 yüksek gelirse 1.5x; beraberlik seçimi 5.2x. Fark 4’ten azsa kasa kazanır. Oynanan jetonun %60’ı kasaya kalır, %40’ı kazananlara dağılır.', providerStatus: 'online', license: 'Sağlayıcı lisansı doğrulanmalı' },
  {
    id: 'fortune',
    name: 'Altın Kasa',
    emoji: '🏦',
    provider: 'Yerleşik (sunucu RNG)',
    active: false,
    minWealth: 2,
    fromProfile: true,
    fromRoom: true,
    bets: [10, 20, 50, 100],
    dailyLimit: 5000,
    rules: '5 makara, 3 sıra, 10 çizgi. Bahis çizgilere eşit bölünür; soldan başlayan 3, 4 veya 5 aynı sembol kazandırır. 💰 Servet her sembolün yerine geçer (Kasa hariç). 3 veya daha fazla 🏦 Kasa 8 bedava dönüş verir, bedava dönüşlerde kazançlar 2 katı. Bir turda en fazla bahsin 850 katı. Oynanan jetonun %60’ı kasaya kalır, %40’ı kazananlara dağılır.',
    providerStatus: 'online',
    license: 'Yerleşik · hukuki inceleme bekliyor',
  },
];
