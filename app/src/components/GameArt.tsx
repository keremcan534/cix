// Game visuals: each game's 3D cover from the app icon set (components/Art), keyed by game id (data/games).
// Renk Kartları and Domino have no picture yet and keep their emoji.
import { Image, Text } from 'react-native';

import { artSource, type ArtName } from '@/components/Art';

const COVER: Record<string, ArtName> = {
  ludo: 'oyun-ludo',
  pool: 'oyun-8-top-bilardo',
  jackaroo: 'oyun-jackaroo',
  xox: 'oyun-xox',
  connect4: 'oyun-dort-tas',
  words: 'oyun-kelime-zinciri',
  quiz: 'oyun-bilgi-yarismasi',
  truefalse: 'oyun-dogru-yanlis',
  memory: 'oyun-hafiza-eslestirme',
  wheel: 'oyun-sans-carki',
  dice: 'oyun-zar-casino',
  slot: 'oyun-lucky-77',
  dragon: 'oyun-dragon-tiger',
  fish: 'oyun-balik-avi',
};
const ART: Record<string, number> = Object.fromEntries(Object.entries(COVER).map(([id, name]) => [id, artSource(name)]));

export const gameArtOf = (id: string): number | undefined => ART[id];

// Each game's own color: its card and the light under its icon (fx/float), so a games grid reads as
// different games instead of one repeated tile.
const HUE: Record<string, string> = {
  wheel: '#FF8A5B',
  dice: '#FF6576',
  slot: '#F6BD60',
  dragon: '#4ADE80',
  fortune: '#FACC15',
  jackpot: '#F472B6',
  olympus: '#F59E0B',
  fish: '#38BDF8',
  ludo: '#60A5FA',
  okey: '#F6BD60',
  cards: '#F472B6',
  domino: '#C4B5FD',
  pool: '#22C55E',
  jackaroo: '#F59E0B',
  xox: '#13D9DF',
  connect4: '#3B82F6',
  words: '#A78BFA',
  quiz: '#FACC15',
  truefalse: '#34D399',
  memory: '#FB7185',
};
export const gameHueOf = (id: string): string => HUE[id] ?? '#13D9DF';

/** The game's picture when it has one, otherwise its emoji. */
export function GameIcon({ id, emoji, size }: { id: string; emoji: string; size: number }) {
  const art = ART[id];
  return art ? <Image source={art} style={{ width: size * 1.3, height: size * 1.3 }} accessibilityIgnoresInvertColors /> : <Text style={{ fontSize: size }}>{emoji}</Text>;
}
