// The drawn pictures the room games are waiting for (docs/GORSEL_URETIM_LISTESI.md §15 Ludo, §18 Renk Kartları,
// XOX, Dört Taş), in one place. Until a file is delivered its entry is null and the game draws its stand-in with
// views and gradients; once the owner delivers it, put it in app/assets/art/ and change null here to
// `require('../../../../assets/art/<name>.png')`: nothing else changes. A set (the four Ludo tokens, the four card
// faces …) is only used when every file in it is here, so one board never mixes drawn and code-drawn pieces.
import { Image, type ImageSourcePropType, type ImageStyle, type StyleProp } from 'react-native';

const ROOM_ART = {
  // §15 Ludo
  'ludo-tas-turkuaz': null,
  'ludo-tas-pembe': null,
  'ludo-tas-altin': null,
  'ludo-tas-yesil': null,
  'ludo-tahta-zemin': null,
  'ludo-yildiz': null,
  'ludo-kupa': null,
  // §18 Renk Kartları
  'renk-kart-turkuaz': null,
  'renk-kart-kizil': null,
  'renk-kart-altin': null,
  'renk-kart-yesil': null,
  'renk-amblem-damla': null,
  'renk-amblem-alev': null,
  'renk-amblem-gunes': null,
  'renk-amblem-yaprak': null,
  'renk-isaret-atla': null,
  'renk-isaret-yon': null,
  'renk-isaret-arti2': null,
  'renk-joker': null,
  'renk-joker-arti4': null,
  'renk-kart-arka': null,
  'renk-masa': null,
  // §18 XOX
  'xox-x': null,
  'xox-o': null,
  // §18 Dört Taş
  'dort-tas-pembe': null,
  'dort-tas-altin': null,
  'dort-tas-hucre': null,
} satisfies Record<string, ImageSourcePropType | null>;

export type RoomArtName = keyof typeof ROOM_ART;
const ART: Record<RoomArtName, ImageSourcePropType | null> = ROOM_ART;

/** The delivered picture, or null while the game still draws its own. */
export const roomArt = (name: RoomArtName): ImageSourcePropType | null => ART[name];

/** A whole set's pictures in order, or null while any of them is missing. */
export function roomArtSet(names: readonly RoomArtName[]): ImageSourcePropType[] | null {
  const all = names.map((n) => ART[n]);
  return all.every((a) => a !== null) ? (all as ImageSourcePropType[]) : null;
}

/** The sets that only come all together. */
export const LUDO_TOKEN_ART = ['ludo-tas-turkuaz', 'ludo-tas-pembe', 'ludo-tas-altin', 'ludo-tas-yesil'] as const;
export const CARD_FACE_ART = ['renk-kart-turkuaz', 'renk-kart-kizil', 'renk-kart-altin', 'renk-kart-yesil'] as const;
export const CARD_EMBLEM_ART = ['renk-amblem-damla', 'renk-amblem-alev', 'renk-amblem-gunes', 'renk-amblem-yaprak'] as const;
export const DISC_ART = ['dort-tas-pembe', 'dort-tas-altin'] as const;
export const MARK_ART = ['xox-x', 'xox-o'] as const;

/** A delivered picture drawn `w` × `h` (square when `h` is left out). */
export function RoomArtImage({ source, w, h, style }: { source: ImageSourcePropType; w: number; h?: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={source} style={[{ width: w, height: h ?? w }, style]} resizeMode="contain" accessibilityIgnoresInvertColors />;
}
