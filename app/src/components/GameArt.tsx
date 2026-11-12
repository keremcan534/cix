// Game visuals: each game's 3D cover from the app icon set (components/Art), keyed by game id (data/games).
// Renk Kartları, Domino and Balon Avı have no picture yet and keep their emoji.
import { Image } from 'react-native';

import { artSource, type ArtName } from '@/components/Art';
import { salonArt, type SalonArtName } from '@/components/games/fx/salon-art';
import { EmojiIcon } from '@/components/Icon3D';

const COVER: Record<string, ArtName> = {
  ludo: 'oyun-ludo',
  pool: 'oyun-8-top-bilardo',
  jackaroo: 'oyun-jackaroo',
  xox: 'oyun-xox',
  four: 'oyun-dort-tas',
  words: 'oyun-kelime-zinciri',
  quiz: 'oyun-bilgi-yarismasi',
  truefalse: 'oyun-dogru-yanlis',
  memory: 'oyun-hafiza-eslestirme',
  wheel: 'oyun-sans-carki',
  dice: 'oyun-zar-casino',
  slot: 'oyun-lucky-77',
  jackpot: 'oyun-hazine-sandigi',
  dragon: 'oyun-dragon-tiger',
  // Balon Avı (fish) shows its emoji until its own cover arrives: the old cover is a fishing rod.
};
// Covers that came with a machine's own pack (components/games/fx/salon-art, §24).
const SALON_COVER: Record<string, SalonArtName> = { super777: 'kizil-yedi-kapak' };
const ART: Record<string, number> = Object.fromEntries([
  ...Object.entries(COVER).map(([id, name]) => [id, artSource(name)]),
  ...Object.entries(SALON_COVER).flatMap(([id, name]) => {
    const src = salonArt(name);
    return src === undefined ? [] : [[id, src]];
  }),
]);

export const gameArtOf = (id: string): number | undefined => ART[id];

// Each game's own color: its card and the light under its icon (fx/float), so a games grid reads as
// different games instead of one repeated tile.
const HUE: Record<string, string> = {
  wheel: '#FF8A5B',
  dice: '#FF6576',
  slot: '#F6BD60',
  dragon: '#4ADE80',
  // Oyun Salonu: the app's palette only (gold, turquoise, coral, navy blues, greens), no purple.
  fortune: '#FACC15',
  jackpot: '#F2A93B',
  olympus: '#F59E0B',
  fish: '#38BDF8',
  rocket: '#60A5FA',
  super777: '#DC2626',
  jungle: '#65A30D',
  goldtree: '#16A34A',
  foodwheel: '#FF9F43',
  magiccard: '#13D9DF',
  pinata: '#FF6576',
  spellbook: '#2DD4BF',
  neon: '#38BDF8',
  ludo: '#60A5FA',
  okey: '#F6BD60',
  cards: '#F472B6',
  domino: '#C4B5FD',
  pool: '#22C55E',
  jackaroo: '#F59E0B',
  xox: '#13D9DF',
  four: '#3B82F6',
  words: '#A78BFA',
  quiz: '#FACC15',
  truefalse: '#34D399',
  memory: '#FB7185',
};
export const gameHueOf = (id: string): string => HUE[id] ?? '#13D9DF';

/** The game's picture when it has one, otherwise its emoji (as a 3D icon when the set has one). */
export function GameIcon({ id, emoji, size }: { id: string; emoji: string; size: number }) {
  const art = ART[id];
  return art ? <Image source={art} style={{ width: size * 1.3, height: size * 1.3 }} accessibilityIgnoresInvertColors /> : <EmojiIcon emoji={emoji} size={size} />;
}
