// Cömertlik rozetleri (the owners' "Cömertlik Rozetleri – Tasarım Seti", 22 Nov 2026): for each of the 11 level groups
// a big emblem (its stone in a crown of wings with the group's name on a ribbon; the level range is written under it
// as live text, since Seviye ve VIP ayarları can move the ranges) and a long plate drawn next to a name with the
// person's level written live in its number field. The pictures were cut from the designer's sheets
// (assets/levels/comertlik, made by the package's own cutouts: the range chip taken off the emblems, the plates'
// printed numbers painted out from the numbered sheet). Each group's look is found by its key (data/wealth
// LevelTier.look), so the groups the server sends keep the pictures of the app's group in the same place.
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import type { WealthLook } from '@/data/wealth';

/**
 * Each group's pictures: the emblem (`ratio` its width over height) and the plate (`ratio`, and where its number
 * field is: the centre `cx`, `cy` and the printed digits' height `h`, as fractions of the plate).
 */
const ART: Record<WealthLook, { emblem: number; emblemRatio: number; plate: number; plateRatio: number; cx: number; cy: number; h: number }> = {
  kuvars: { emblem: require('../../assets/levels/comertlik/rozet-kuvars.webp'), emblemRatio: 384 / 310, plate: require('../../assets/levels/comertlik/plaka-kuvars.webp'), plateRatio: 288 / 102, cx: 0.75, cy: 0.533, h: 0.367 },
  opal: { emblem: require('../../assets/levels/comertlik/rozet-opal.webp'), emblemRatio: 384 / 308, plate: require('../../assets/levels/comertlik/plaka-opal.webp'), plateRatio: 288 / 114, cx: 0.774, cy: 0.582, h: 0.365 },
  akik: { emblem: require('../../assets/levels/comertlik/rozet-akik.webp'), emblemRatio: 384 / 305, plate: require('../../assets/levels/comertlik/plaka-akik.webp'), plateRatio: 288 / 116, cx: 0.784, cy: 0.55, h: 0.351 },
  ametist: { emblem: require('../../assets/levels/comertlik/rozet-ametist.webp'), emblemRatio: 384 / 318, plate: require('../../assets/levels/comertlik/plaka-ametist.webp'), plateRatio: 288 / 122, cx: 0.728, cy: 0.541, h: 0.31 },
  topaz: { emblem: require('../../assets/levels/comertlik/rozet-topaz.webp'), emblemRatio: 384 / 330, plate: require('../../assets/levels/comertlik/plaka-topaz.webp'), plateRatio: 288 / 105, cx: 0.748, cy: 0.558, h: 0.361 },
  zumrut: { emblem: require('../../assets/levels/comertlik/rozet-zumrut.webp'), emblemRatio: 384 / 318, plate: require('../../assets/levels/comertlik/plaka-zumrut.webp'), plateRatio: 288 / 108, cx: 0.757, cy: 0.539, h: 0.368 },
  yakut: { emblem: require('../../assets/levels/comertlik/rozet-yakut.webp'), emblemRatio: 384 / 322, plate: require('../../assets/levels/comertlik/plaka-yakut.webp'), plateRatio: 288 / 116, cx: 0.783, cy: 0.532, h: 0.355 },
  safir: { emblem: require('../../assets/levels/comertlik/rozet-safir.webp'), emblemRatio: 384 / 316, plate: require('../../assets/levels/comertlik/plaka-safir.webp'), plateRatio: 288 / 118, cx: 0.738, cy: 0.527, h: 0.327 },
  pirlanta: { emblem: require('../../assets/levels/comertlik/rozet-pirlanta.webp'), emblemRatio: 384 / 320, plate: require('../../assets/levels/comertlik/plaka-pirlanta.webp'), plateRatio: 288 / 101, cx: 0.759, cy: 0.578, h: 0.348 },
  hazine: { emblem: require('../../assets/levels/comertlik/rozet-hazine.webp'), emblemRatio: 384 / 337, plate: require('../../assets/levels/comertlik/plaka-hazine.webp'), plateRatio: 288 / 110, cx: 0.806, cy: 0.585, h: 0.324 },
  efsane: { emblem: require('../../assets/levels/comertlik/rozet-efsane.webp'), emblemRatio: 384 / 335, plate: require('../../assets/levels/comertlik/plaka-efsane.webp'), plateRatio: 288 / 118, cx: 0.81, cy: 0.622, h: 0.26 },
};

/** The group's big emblem, `width` points wide; its name is on its ribbon. Decoration: a screen reader reads the caller's label. */
export function WealthEmblem({ look, width, dim = false }: { look: WealthLook; width: number; dim?: boolean }) {
  const a = ART[look];
  return (
    <Image
      source={a.emblem}
      style={{ width, height: width / a.emblemRatio, opacity: dim ? 0.45 : 1 }}
      resizeMode="contain"
      accessibilityElementsHidden
      importantForAccessibility="no"
      accessibilityIgnoresInvertColors
    />
  );
}

/**
 * The group's plate with the person's level in its number field, `height` points tall. The plate's art reaches a
 * little above and below its pill (the stone's points, a glow), so it is drawn `bleed` times the row's height and
 * hangs over the row by as much: the row keeps the height it had with the old chip.
 */
export function WealthPlate({ look, level, height, label, style }: { look: WealthLook; level: number; height: number; label: string; style?: StyleProp<ViewStyle> }) {
  const a = ART[look];
  const h = Math.round(height * BLEED);
  const w = Math.round(h * a.plateRatio);
  // The printed digits' height in the art is the cap height of the live number: about 0.7 of a font size.
  const font = Math.max(8, Math.round((a.h * h) / 0.7));
  const over = (h - height) / 2;
  return (
    <View style={[{ width: w, height, marginVertical: 0 }, style]} accessibilityRole="image" accessibilityLabel={label}>
      <Image source={a.plate} style={{ position: 'absolute', left: 0, top: -over, width: w, height: h }} resizeMode="contain" accessibilityIgnoresInvertColors />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top: -over, height: h }]}>
        <Text
          style={[s.num, { fontSize: font, lineHeight: Math.round(font * 1.15), position: 'absolute', left: a.cx * w - w * 0.2, width: w * 0.4, top: a.cy * h - font * 0.6 }]}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {level}
        </Text>
      </View>
    </View>
  );
}

/** How much taller than the row the plate's picture is drawn. */
const BLEED = 1.45;

const s = StyleSheet.create({
  num: {
    color: '#FFF4E2',
    fontWeight: '900',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
