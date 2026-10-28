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

/** The game's picture when it has one, otherwise its emoji. */
export function GameIcon({ id, emoji, size }: { id: string; emoji: string; size: number }) {
  const art = ART[id];
  return art ? <Image source={art} style={{ width: size * 1.3, height: size * 1.3 }} accessibilityIgnoresInvertColors /> : <Text style={{ fontSize: size }}>{emoji}</Text>;
}
