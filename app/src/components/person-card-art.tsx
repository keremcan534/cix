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

/** The card's panel: the corners keep their shape, the strip between them grows with what is on the card. */
export function CardPanel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Image source={PANEL.top} style={{ width: '100%', height: undefined, aspectRatio: PANEL.cap }} resizeMode="stretch" />
        {/* A point under each corner piece, so no seam shows on any screen density. */}
        <Image source={PANEL.mid} style={{ width: '100%', height: undefined, flex: 1, marginVertical: -1 }} resizeMode="stretch" />
        <Image source={PANEL.bottom} style={{ width: '100%', height: undefined, aspectRatio: PANEL.cap }} resizeMode="stretch" />
      </View>
      {children}
    </View>
  );
}

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
