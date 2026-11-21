// The person card's pictures (app/assets/person-card, the designer's set): each drawn at its own shape. What changes
// size is built from slices, so round corners and glowing ends keep their shape on every phone and with every name.
import { useState, type ReactNode } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';


const ART = {
  iliski: [require('../../assets/person-card/iliski.png'), 1.737],
  hediye: [require('../../assets/person-card/hediye.png'), 1],
  koruma: [require('../../assets/person-card/koruma.png'), 0.886],
  bina: [require('../../assets/person-card/bina.png'), 1.128],
  grup: [require('../../assets/person-card/grup.png'), 1.347],
  sohbet: [require('../../assets/person-card/sohbet.png'), 1.5],
  dans: [require('../../assets/person-card/dans.png'), 0.742],
  spor: [require('../../assets/person-card/spor.png'), 0.985],
  oyun: [require('../../assets/person-card/oyun.png'), 1.535],
  film: [require('../../assets/person-card/film.png'), 1.109],
  bahset: [require('../../assets/person-card/bahset.png'), 0.962],
  takip: [require('../../assets/person-card/takip.png'), 0.992],
  kisi: [require('../../assets/person-card/kisi.png'), 0.992],
  yonet: [require('../../assets/person-card/yonet.png'), 0.886],
  sikayet: [require('../../assets/person-card/sikayet.png'), 0.992],
  kapat: [require('../../assets/person-card/kapat.png'), 1],
  ok: [require('../../assets/person-card/ok.png'), 0.583],
  kalp: [require('../../assets/person-card/kalp.png'), 1.2],
  'yas-rozet': [require('../../assets/person-card/yas-rozet.png'), 3],
  'seviye-rozet': [require('../../assets/person-card/seviye-rozet.png'), 2.172],
  'defne-sol': [require('../../assets/person-card/defne-sol.png'), 0.729],
  'defne-sag': [require('../../assets/person-card/defne-sag.png'), 0.74],
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

const PANEL = {
  top: require('../../assets/person-card/panel-ust.png'),
  mid: require('../../assets/person-card/panel-orta.png'),
  bottom: require('../../assets/person-card/panel-alt.png'),
  /** A corner piece's width over its height. */
  cap: 1 / 0.1574,
};

/**
 * VIP 0–10 kişi kartı (the owners' package, 21 Nov 2026: "aynı düzen, farklı VIP üst süslemeleri"): every card is
 * the designer's purple panel, and its top edge wears its VIP level's ornament (VIP 0, everyone without VIP: the pink
 * one; 1 ice crystal … 10 flame crown). The ornaments were cut from the package's mockup (assets/vip/card-topper,
 * cleaned of the mockup's stray lines): drawn over the panel's top edge, never catching a tap.
 */
export const CARD_TOPPERS = [
  { src: require('../../assets/vip/card-topper/topper-0.png'), ratio: 632 / 48 },
  { src: require('../../assets/vip/card-topper/topper-1.png'), ratio: 612 / 84 },
  { src: require('../../assets/vip/card-topper/topper-2.png'), ratio: 634 / 80 },
  { src: require('../../assets/vip/card-topper/topper-3.png'), ratio: 644 / 88 },
  { src: require('../../assets/vip/card-topper/topper-4.png'), ratio: 636 / 64 },
  { src: require('../../assets/vip/card-topper/topper-5.png'), ratio: 614 / 78 },
  { src: require('../../assets/vip/card-topper/topper-6.png'), ratio: 636 / 88 },
  { src: require('../../assets/vip/card-topper/topper-7.png'), ratio: 646 / 66 },
  { src: require('../../assets/vip/card-topper/topper-8.png'), ratio: 684 / 98 },
  { src: require('../../assets/vip/card-topper/topper-9.png'), ratio: 678 / 70 },
  { src: require('../../assets/vip/card-topper/topper-10.png'), ratio: 672 / 90 },
] as const;
/** The ornament for a VIP level (above 10: VIP 10's; below 0 or unknown: VIP 0's). */
export const cardTopperOf = (vip: number | null | undefined) => CARD_TOPPERS[Math.min(10, Math.max(0, Math.floor(Number(vip) || 0)))];

/** The card's panel: the corners keep their shape, the strip between them grows with what is on the card; its VIP
 *  level's ornament on its top edge. */
export function CardPanel({ children, style, vip = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; vip?: number }) {
  const top = cardTopperOf(vip);
  // The ornament's drawn height comes from its measured width; a little over half of it sits above the card.
  const [wide, setWide] = useState(0);
  const onTopperLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next > 0 && next !== wide) setWide(next);
  };
  const tall = wide / top.ratio;
  return (
    <View style={style}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Image source={PANEL.top} style={{ width: '100%', height: undefined, aspectRatio: PANEL.cap }} resizeMode="stretch" />
        {/* A point under each corner piece, so no seam shows on any screen density. */}
        <Image source={PANEL.mid} style={{ width: '100%', height: undefined, flex: 1, marginVertical: -1 }} resizeMode="stretch" />
        <Image source={PANEL.bottom} style={{ width: '100%', height: undefined, aspectRatio: PANEL.cap }} resizeMode="stretch" />
      </View>
      {children}
      {/* Over the panel's top edge, a little wider than the card, half of it above the card: decoration only. */}
      <View style={[s.topper, { top: -Math.round(tall * 0.52), opacity: wide ? 1 : 0 }]} onLayout={onTopperLayout} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Image source={top.src} style={{ width: '100%', height: tall || 1 }} resizeMode="contain" />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  topper: { position: 'absolute', top: 0, left: '-3%', right: '-3%' },
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
