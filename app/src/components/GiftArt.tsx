// Produced gift visuals (docs/GORSEL_URETIM_LISTESI.md, "Popüler hediyeler" batch 1): transparent PNGs,
// 192 px for lists, chat and flights, 512 px for the full-screen send animation. Gifts without a
// visual yet keep their emoji until their image is delivered.
import { Image, Text, type ImageStyle, type StyleProp, type TextStyle } from 'react-native';

type Art = { sm: number; lg: number };
const ART: Record<string, Art> = {
  g1: { sm: require('../../assets/gifts/192/hediye-gul.png'), lg: require('../../assets/gifts/512/hediye-gul.png') },
  g2: { sm: require('../../assets/gifts/192/hediye-kalp.png'), lg: require('../../assets/gifts/512/hediye-kalp.png') },
  g3: { sm: require('../../assets/gifts/192/hediye-kahve.png'), lg: require('../../assets/gifts/512/hediye-kahve.png') },
  g4: { sm: require('../../assets/gifts/192/hediye-pasta.png'), lg: require('../../assets/gifts/512/hediye-pasta.png') },
  g5: { sm: require('../../assets/gifts/192/hediye-tac.png'), lg: require('../../assets/gifts/512/hediye-tac.png') },
  g6: { sm: require('../../assets/gifts/192/hediye-roket.png'), lg: require('../../assets/gifts/512/hediye-roket.png') },
  g7: { sm: require('../../assets/gifts/192/hediye-elmas.png'), lg: require('../../assets/gifts/512/hediye-elmas.png') },
  g8: { sm: require('../../assets/gifts/192/hediye-sato.png'), lg: require('../../assets/gifts/512/hediye-sato.png') },
  h1: { sm: require('../../assets/gifts/192/hediye-oyun-zamani.png'), lg: require('../../assets/gifts/512/hediye-oyun-zamani.png') },
  h2: { sm: require('../../assets/gifts/192/hediye-dunya-turu.png'), lg: require('../../assets/gifts/512/hediye-dunya-turu.png') },
  h3: { sm: require('../../assets/gifts/192/hediye-seni-seviyorum.png'), lg: require('../../assets/gifts/512/hediye-seni-seviyorum.png') },
  h4: { sm: require('../../assets/gifts/192/hediye-panda-sarilmasi.png'), lg: require('../../assets/gifts/512/hediye-panda-sarilmasi.png') },
};

/** The image for a catalog gift (by GIFTS id), if it has been produced. */
export const giftArtOf = (giftId?: string): Art | undefined => (giftId ? ART[giftId] : undefined);
/** Picks the file for the size it is drawn at (192 px covers up to ~64 pt on 3x screens). */
export const giftSource = (art: Art, size: number) => (size > 64 ? art.lg : art.sm);

/** A gift's picture: the produced image when there is one, otherwise its emoji at the same size. */
export function GiftArt({ giftId, emoji, size, style, textStyle }: { giftId?: string; emoji: string; size: number; style?: StyleProp<ImageStyle>; textStyle?: StyleProp<TextStyle> }) {
  const art = giftArtOf(giftId);
  if (art) return <Image source={giftSource(art, size)} style={[{ width: size, height: size }, style]} resizeMode="contain" accessibilityIgnoresInvertColors />;
  return <Text style={[{ fontSize: Math.round(size * 0.8), lineHeight: Math.round(size * 1.0) }, textStyle]}>{emoji}</Text>;
}
