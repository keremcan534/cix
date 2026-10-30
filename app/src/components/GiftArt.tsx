// Produced gift visuals (docs/GORSEL_URETIM_LISTESI.md §1, all 60 delivered): transparent PNGs,
// 192 px for lists, chat and flights, 512 px for the full-screen send animation. Keyed by gift id
// (GIFTS and the Lucky packages), so an admin renaming a gift or editing its emoji keeps its image.
// A gift with no image (a new catalog entry) keeps its emoji until one is delivered.
import { Image, type ImageStyle, type StyleProp, type TextStyle } from 'react-native';

import { Text } from '@/components/text';

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
  h5: { sm: require('../../assets/gifts/192/hediye-tatil-keyfi.png'), lg: require('../../assets/gifts/512/hediye-tatil-keyfi.png') },
  h6: { sm: require('../../assets/gifts/192/hediye-ucan-opucuk.png'), lg: require('../../assets/gifts/512/hediye-ucan-opucuk.png') },
  h7: { sm: require('../../assets/gifts/192/hediye-gece-krali.png'), lg: require('../../assets/gifts/512/hediye-gece-krali.png') },
  h8: { sm: require('../../assets/gifts/192/hediye-birlikte-bisiklet.png'), lg: require('../../assets/gifts/512/hediye-birlikte-bisiklet.png') },
  h9: { sm: require('../../assets/gifts/192/hediye-parti-zamani.png'), lg: require('../../assets/gifts/512/hediye-parti-zamani.png') },
  h10: { sm: require('../../assets/gifts/192/hediye-ani-fotografi.png'), lg: require('../../assets/gifts/512/hediye-ani-fotografi.png') },
  h11: { sm: require('../../assets/gifts/192/hediye-altin-can.png'), lg: require('../../assets/gifts/512/hediye-altin-can.png') },
  h12: { sm: require('../../assets/gifts/192/hediye-altin-kugu.png'), lg: require('../../assets/gifts/512/hediye-altin-kugu.png') },
  p1: { sm: require('../../assets/gifts/192/hediye-kar-topu.png'), lg: require('../../assets/gifts/512/hediye-kar-topu.png') },
  p2: { sm: require('../../assets/gifts/192/hediye-sulu-balon.png'), lg: require('../../assets/gifts/512/hediye-sulu-balon.png') },
  p3: { sm: require('../../assets/gifts/192/hediye-domates-at.png'), lg: require('../../assets/gifts/512/hediye-domates-at.png') },
  p4: { sm: require('../../assets/gifts/192/hediye-kagit-ucak.png'), lg: require('../../assets/gifts/512/hediye-kagit-ucak.png') },
  p5: { sm: require('../../assets/gifts/192/hediye-su-kovasi.png'), lg: require('../../assets/gifts/512/hediye-su-kovasi.png') },
  p6: { sm: require('../../assets/gifts/192/hediye-pasta-at.png'), lg: require('../../assets/gifts/512/hediye-pasta-at.png') },
  p7: { sm: require('../../assets/gifts/192/hediye-yumurta-at.png'), lg: require('../../assets/gifts/512/hediye-yumurta-at.png') },
  p8: { sm: require('../../assets/gifts/192/hediye-terlik-at.png'), lg: require('../../assets/gifts/512/hediye-terlik-at.png') },
  p9: { sm: require('../../assets/gifts/192/hediye-konfeti-topu.png'), lg: require('../../assets/gifts/512/hediye-konfeti-topu.png') },
  p10: { sm: require('../../assets/gifts/192/hediye-ask-oku.png'), lg: require('../../assets/gifts/512/hediye-ask-oku.png') },
  c1: { sm: require('../../assets/gifts/192/hediye-can-dostum.png'), lg: require('../../assets/gifts/512/hediye-can-dostum.png') },
  c2: { sm: require('../../assets/gifts/192/hediye-dilek-kavanozu.png'), lg: require('../../assets/gifts/512/hediye-dilek-kavanozu.png') },
  c3: { sm: require('../../assets/gifts/192/hediye-masal-kalesi.png'), lg: require('../../assets/gifts/512/hediye-masal-kalesi.png') },
  c4: { sm: require('../../assets/gifts/192/hediye-ask-mektubu.png'), lg: require('../../assets/gifts/512/hediye-ask-mektubu.png') },
  c5: { sm: require('../../assets/gifts/192/hediye-sevgi-tatlisi.png'), lg: require('../../assets/gifts/512/hediye-sevgi-tatlisi.png') },
  c6: { sm: require('../../assets/gifts/192/hediye-yildiz-faytonu.png'), lg: require('../../assets/gifts/512/hediye-yildiz-faytonu.png') },
  c7: { sm: require('../../assets/gifts/192/hediye-evlilik-teklifi.png'), lg: require('../../assets/gifts/512/hediye-evlilik-teklifi.png') },
  c8: { sm: require('../../assets/gifts/192/hediye-dugun-gunu.png'), lg: require('../../assets/gifts/512/hediye-dugun-gunu.png') },
  c9: { sm: require('../../assets/gifts/192/hediye-sonsuz-opucuk.png'), lg: require('../../assets/gifts/512/hediye-sonsuz-opucuk.png') },
  c10: { sm: require('../../assets/gifts/192/hediye-kristal-kolye.png'), lg: require('../../assets/gifts/512/hediye-kristal-kolye.png') },
  c11: { sm: require('../../assets/gifts/192/hediye-lunapark-randevusu.png'), lg: require('../../assets/gifts/512/hediye-lunapark-randevusu.png') },
  c12: { sm: require('../../assets/gifts/192/hediye-ask-atesi.png'), lg: require('../../assets/gifts/512/hediye-ask-atesi.png') },
  v1: { sm: require('../../assets/gifts/192/hediye-zumrut-saat.png'), lg: require('../../assets/gifts/512/hediye-zumrut-saat.png') },
  v2: { sm: require('../../assets/gifts/192/hediye-gizemli-gul.png'), lg: require('../../assets/gifts/512/hediye-gizemli-gul.png') },
  v3: { sm: require('../../assets/gifts/192/hediye-sihirli-sapka.png'), lg: require('../../assets/gifts/512/hediye-sihirli-sapka.png') },
  v4: { sm: require('../../assets/gifts/192/hediye-kristal-ayakkabi.png'), lg: require('../../assets/gifts/512/hediye-kristal-ayakkabi.png') },
  v5: { sm: require('../../assets/gifts/192/hediye-altin-kilic.png'), lg: require('../../assets/gifts/512/hediye-altin-kilic.png') },
  v6: { sm: require('../../assets/gifts/192/hediye-kartal.png'), lg: require('../../assets/gifts/512/hediye-kartal.png') },
  v7: { sm: require('../../assets/gifts/192/hediye-uzay-yolculugu.png'), lg: require('../../assets/gifts/512/hediye-uzay-yolculugu.png') },
  v8: { sm: require('../../assets/gifts/192/hediye-gokyuzu-turu.png'), lg: require('../../assets/gifts/512/hediye-gokyuzu-turu.png') },
  v9: { sm: require('../../assets/gifts/192/hediye-altin-kanatlar.png'), lg: require('../../assets/gifts/512/hediye-altin-kanatlar.png') },
  v10: { sm: require('../../assets/gifts/192/hediye-luks-yat.png'), lg: require('../../assets/gifts/512/hediye-luks-yat.png') },
  v11: { sm: require('../../assets/gifts/192/hediye-altin-tavus.png'), lg: require('../../assets/gifts/512/hediye-altin-tavus.png') },
  v12: { sm: require('../../assets/gifts/192/hediye-atlikarinca-gecesi.png'), lg: require('../../assets/gifts/512/hediye-atlikarinca-gecesi.png') },
  lk1: { sm: require('../../assets/gifts/192/lucky-sans-yoncasi.png'), lg: require('../../assets/gifts/512/lucky-sans-yoncasi.png') },
  lk2: { sm: require('../../assets/gifts/192/lucky-ugur-bocegi.png'), lg: require('../../assets/gifts/512/lucky-ugur-bocegi.png') },
  lk3: { sm: require('../../assets/gifts/192/lucky-altin-nal.png'), lg: require('../../assets/gifts/512/lucky-altin-nal.png') },
  lk4: { sm: require('../../assets/gifts/192/lucky-kayan-yildiz.png'), lg: require('../../assets/gifts/512/lucky-kayan-yildiz.png') },
};

/** Default picture for Lucky packages created in Lucky yönetimi (ids `lk…`) that have no own image. */
const LUCKY_DEFAULT: Art = { sm: require('../../assets/gifts/192/lucky-yeni-lucky.png'), lg: require('../../assets/gifts/512/lucky-yeni-lucky.png') };
/** Corner badge on gift tiles whose effect plays music. */
export const MUSIC_BADGE = require('../../assets/gifts/192/hediye-rozet-muzikli-hediye-rozeti.png');

/** The image for a catalog gift (GIFTS or Lucky package id), if it has been produced. */
export const giftArtOf = (giftId?: string): Art | undefined => (giftId ? (ART[giftId] ?? (giftId.startsWith('lk') ? LUCKY_DEFAULT : undefined)) : undefined);
/** Picks the file for the size it is drawn at (192 px covers up to ~64 pt on 3x screens). */
export const giftSource = (art: Art, size: number) => (size > 64 ? art.lg : art.sm);

/** A gift's picture: the produced image when there is one, otherwise its emoji at the same size. */
export function GiftArt({ giftId, emoji, size, style, textStyle }: { giftId?: string; emoji: string; size: number; style?: StyleProp<ImageStyle>; textStyle?: StyleProp<TextStyle> }) {
  const art = giftArtOf(giftId);
  if (art) return <Image source={giftSource(art, size)} style={[{ width: size, height: size }, style]} resizeMode="contain" accessibilityIgnoresInvertColors />;
  return <Text style={[{ fontSize: Math.round(size * 0.8), lineHeight: Math.round(size * 1.0) }, textStyle]}>{emoji}</Text>;
}
