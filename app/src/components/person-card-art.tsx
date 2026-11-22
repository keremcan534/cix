// The person card's pictures (app/assets/person-card, the designer's set): each drawn at its own shape. What changes
// size is built from slices, so round corners and glowing ends keep their shape on every phone and with every name.
import { useState, type ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, View, type ImageSourcePropType, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';


const ART = {
  iliski: [require('../../assets/person-card/iliski.png'), 1.737],
  hediye: [require('../../assets/person-card/hediye.png'), 1],
  koruma: [require('../../assets/person-card/koruma.png'), 0.886],
  bina: [require('../../assets/person-card/bina.png'), 1.128],
  grup: [require('../../assets/person-card/grup.png'), 1.347],
  sohbet: [require('../../assets/person-card/sohbet.png'), 1.5],
  bahset: [require('../../assets/person-card/bahset.png'), 0.962],
  takip: [require('../../assets/person-card/takip.png'), 0.992],
  kisi: [require('../../assets/person-card/kisi.png'), 0.992],
  yonet: [require('../../assets/person-card/yonet.png'), 0.886],
  sikayet: [require('../../assets/person-card/sikayet.png'), 0.992],
  ok: [require('../../assets/person-card/ok.png'), 0.583],
  kalp: [require('../../assets/person-card/kalp.png'), 1.2],
  'yas-rozet': [require('../../assets/person-card/yas-rozet.png'), 3],
  'seviye-rozet': [require('../../assets/person-card/seviye-rozet.png'), 2.172],
} satisfies Record<string, [ImageSourcePropType, number]>;

export type CardArtName = keyof typeof ART;

/** One picture of the set, `h` points tall. */
export function CardArt({ name, h }: { name: CardArtName; h: number }) {
  const [source, ratio] = ART[name];
  return <Image source={source} style={{ width: h * ratio, height: h }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}

/** The tile behind an action; the lit one is the action that is on. */
export const TILE_ART = { off: require('../../assets/person-card/aksiyon-dugme.png'), on: require('../../assets/person-card/aksiyon-aktif.png') } as const;
export const DIVIDER_ART = require('../../assets/person-card/ayirici.png');

/**
 * VIP 1–10 kişi kartı süsleri (the owners' package, 21 Nov 2026: "aynı düzen, farklı VIP üst süslemeleri"; 1 ice
 * crystal … 10 flame crown). Each was cut whole, with the part that lies over the card, from the package's VIP 0–10
 * mockup and upscaled (assets/vip/card-topper, 22 Nov 2026; the first cut stopped at the card's top line, so the
 * card's edge seemed to cover the ornaments). Where each sits is the mockup's own, in card widths: `left` and `top`
 * from the card's top-left corner (top < 0: above the edge), `width`; its height comes from the picture (`ratio`,
 * width over height). VIP 0, everyone without VIP, wears none. Drawn over the panel's edge, never catching a tap.
 */
export const CARD_TOPPERS = [
  null,
  { src: require('../../assets/vip/card-topper/topper-1.webp'), ratio: 1091 / 129, left: 0.0023, top: -0.0354, width: 0.9915 },
  { src: require('../../assets/vip/card-topper/topper-2.webp'), ratio: 1103 / 127, left: -0.0015, top: -0.034, width: 1.0031 },
  { src: require('../../assets/vip/card-topper/topper-3.webp'), ratio: 1104 / 126, left: -0.0015, top: -0.0352, width: 1.0038 },
  { src: require('../../assets/vip/card-topper/topper-4.webp'), ratio: 1105 / 162, left: -0.0015, top: -0.081, width: 1.0046 },
  { src: require('../../assets/vip/card-topper/topper-5.webp'), ratio: 1097 / 160, left: 0.0, top: -0.0677, width: 0.9969 },
  { src: require('../../assets/vip/card-topper/topper-6.webp'), ratio: 1082 / 142, left: 0.0093, top: -0.0478, width: 0.9838 },
  { src: require('../../assets/vip/card-topper/topper-7.webp'), ratio: 1077 / 140, left: 0.0099, top: -0.0488, width: 0.9787 },
  { src: require('../../assets/vip/card-topper/topper-8.webp'), ratio: 1111 / 172, left: -0.0028, top: -0.094, width: 1.01 },
  { src: require('../../assets/vip/card-topper/topper-9.webp'), ratio: 1112 / 140, left: -0.0097, top: -0.0667, width: 1.0111 },
  { src: require('../../assets/vip/card-topper/topper-10.webp'), ratio: 1112 / 156, left: -0.002, top: -0.0736, width: 1.0109 },
] as const;
export type CardTopper = NonNullable<(typeof CARD_TOPPERS)[number]>;
/** The ornament for a VIP level (above 10: VIP 10's; VIP 0, below or unknown: none). */
export const cardTopperOf = (vip: number | null | undefined): CardTopper | null =>
  CARD_TOPPERS[Math.min(10, Math.max(0, Math.floor(Number(vip) || 0)))];

/**
 * The card's panel, as the design draws it (the owners' clear design, 22 Nov 2026): a deep plum card with a thin pink
 * neon edge glowing out and in, opaque (the room never shows through). VIP 1–10 wear their level's ornament on the top
 * edge (CARD_TOPPERS), drawn after the content so the edge never covers it; VIP 0 is the plain neon card. The
 * ornament's size comes from the card's measured width.
 */
export function CardPanel({ children, style, vip = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; vip?: number }) {
  const top = cardTopperOf(vip);
  const [wide, setWide] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next > 0 && next !== wide) setWide(next);
  };
  const ornament = top && wide ? toppedOf(top, wide) : null;
  return (
    <View style={[s.panel, style]} onLayout={onLayout}>
      <LinearGradient colors={PANEL_FILL} locations={[0, 0.45, 1]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={s.fill} pointerEvents="none" />
      {/* The neon's inner light: a soft pink line just inside the edge. */}
      <View style={s.inner} pointerEvents="none" />
      {children}
      {ornament && top && (
        <View style={[s.topper, ornament.box]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Image source={top.src} style={{ width: ornament.box.width, height: ornament.box.height }} resizeMode="stretch" />
        </View>
      )}
    </View>
  );
}

/** The card's corner radius and fill (top to bottom), as in the design. */
export const PANEL_RADIUS = 24;
const PANEL_FILL = ['#43103F', '#2C0B2A', '#1F081D'] as const;

/** Where an ornament sits on a card `wide` points wide, in points (the mockup's place, scaled to the card). */
export function toppedOf(t: { ratio: number; left: number; top: number; width: number }, wide: number) {
  const width = Math.round(wide * t.width);
  const height = Math.round(width / t.ratio);
  return { box: { width, height, left: Math.round(wide * t.left), top: Math.round(wide * t.top) } };
}

const s = StyleSheet.create({
  panel: {
    borderRadius: PANEL_RADIUS,
    borderWidth: 1.5,
    borderColor: '#FF4FD3',
    backgroundColor: '#2C0B2A',
    boxShadow: '0 0 16px rgba(255, 64, 200, 0.6)',
  },
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: PANEL_RADIUS - 1.5 },
  inner: { position: 'absolute', left: 2, right: 2, top: 2, bottom: 2, borderRadius: PANEL_RADIUS - 3, borderWidth: 1, borderColor: 'rgba(255, 140, 225, 0.28)' },
  topper: { position: 'absolute' },
});

const PILLS = {
  kulup: [require('../../assets/person-card/kulup-dugme-sol.png'), require('../../assets/person-card/kulup-dugme-orta.png'), require('../../assets/person-card/kulup-dugme-sag.png')],
  duvar: [require('../../assets/person-card/duvar-dugme-sol.png'), require('../../assets/person-card/duvar-dugme-orta.png'), require('../../assets/person-card/duvar-dugme-sag.png')],
} as const;
/** A pill end's width over its height. */
const PILL_END = 0.788;

/**
 * A pill as wide as what is in it: both ends keep their shape, the strip between them stretches. Each end gets an
 * explicit width from the pill's real height: an Image given only `height` and `aspectRatio` takes its picture's own
 * width on Android (104 px ends became 104-point ovals, the client's broken card in Güncelleme 7), and Yoga lets the
 * ratio win over the height. The slices are clipped to the pill, so nothing ever paints outside it.
 */
export function SlicePill({ kind, h, children, style }: { kind: keyof typeof PILLS; h: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [left, mid, right] = PILLS[kind];
  const [tall, setTall] = useState(h);
  const end = Math.round(Math.max(h, tall) * PILL_END);
  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.height);
    if (next > 0 && next !== tall) setTall(next);
  };
  return (
    <View style={[{ minHeight: h, minWidth: end * 2, justifyContent: 'center' }, style]} onLayout={onLayout}>
      <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', overflow: 'hidden' }]} pointerEvents="none">
        <Image source={left} style={{ width: end, height: '100%' }} resizeMode="stretch" />
        <Image source={mid} style={{ flex: 1, width: undefined, height: '100%', marginHorizontal: -0.5 }} resizeMode="stretch" />
        <Image source={right} style={{ width: end, height: '100%' }} resizeMode="stretch" />
      </View>
      {children}
    </View>
  );
}
