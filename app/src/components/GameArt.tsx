// Game visuals (docs/GORSEL_URETIM_LISTESI.md §6, 3D sheet): 192 px PNGs keyed by game id (data/games).
// Games with no matching picture yet (Ludo, Renk Kartları, Domino, Jackaroo, XOX, Dört Taş, Doğru / Yanlış,
// Dragon Tiger) keep their emoji.
import { Image, Text } from 'react-native';

const ART: Record<string, number> = {
  pool: require('../../assets/games/oyun-8-top-bilardo.png'),
  memory: require('../../assets/games/oyun-hafiza-eslestirme.png'),
  quiz: require('../../assets/games/oyun-bilgi-yarismasi.png'),
  words: require('../../assets/games/oyun-kelime-zinciri.png'),
  wheel: require('../../assets/games/oyun-sans-carki.png'),
  dice: require('../../assets/games/oyun-zar-casino.png'),
  slot: require('../../assets/games/oyun-lucky-77.png'),
};

export const gameArtOf = (id: string): number | undefined => ART[id];

// Each game's own color: its card and the light under its icon (fx/float), so a games grid reads as
// different games instead of one repeated tile.
const HUE: Record<string, string> = {
  wheel: '#FF8A5B',
  dice: '#FF6576',
  slot: '#F6BD60',
  dragon: '#4ADE80',
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
