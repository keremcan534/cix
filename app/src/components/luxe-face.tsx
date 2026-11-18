// The gold-rimmed button faces (app/assets/luxe), cut from the owners' luxury set. A face is three slices: the round
// ends keep their shape at any size and the strip between them stretches, so no button shows a join.
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

const FACES = {
  hero: [require('../../assets/luxe/ana-sol.png'), require('../../assets/luxe/ana-orta.png'), require('../../assets/luxe/ana-sag.png')],
  heroDown: [require('../../assets/luxe/ana-basili-sol.png'), require('../../assets/luxe/ana-basili-orta.png'), require('../../assets/luxe/ana-basili-sag.png')],
  money: [require('../../assets/luxe/altin-sol.png'), require('../../assets/luxe/altin-orta.png'), require('../../assets/luxe/altin-sag.png')],
  moneyDown: [require('../../assets/luxe/altin-basili-sol.png'), require('../../assets/luxe/altin-basili-orta.png'), require('../../assets/luxe/altin-basili-sag.png')],
  coral: [require('../../assets/luxe/mercan-sol.png'), require('../../assets/luxe/mercan-orta.png'), require('../../assets/luxe/mercan-sag.png')],
  glass: [require('../../assets/luxe/cam-sol.png'), require('../../assets/luxe/cam-orta.png'), require('../../assets/luxe/cam-sag.png')],
  plum: [require('../../assets/luxe/koyu-sol.png'), require('../../assets/luxe/koyu-orta.png'), require('../../assets/luxe/koyu-sag.png')],
  off: [require('../../assets/luxe/pasif-sol.png'), require('../../assets/luxe/pasif-orta.png'), require('../../assets/luxe/pasif-sag.png')],
} as const;

export type LuxeFaceName = keyof typeof FACES;

/** The round pink face behind a single icon. */
export const LUXE_ROUND: number = require('../../assets/luxe/yuvarlak-ana.png');

/** The narrowest a face of this height can be: its two round ends side by side. */
export const luxeMinWidth = (height: number) => height * 2;

function Slices({ name, h, hidden }: { name: LuxeFaceName; h: number; hidden?: boolean }) {
  const [left, mid, right] = FACES[name];
  // A label on two lines makes the button taller: the square ends widen with it, so they stay round, but never past the middle.
  const [endW, setEndW] = useState(h);
  const end = { width: endW, height: '100%' } as const;
  return (
    <View
      style={[s.row, hidden && s.hidden]}
      onLayout={(e) => {
        const box = e.nativeEvent.layout;
        setEndW(Math.min(box.width / 2, Math.max(h, box.height)));
      }}
    >
      <Image source={left} style={end} resizeMode="stretch" accessibilityIgnoresInvertColors />
      <Image source={mid} style={s.mid} resizeMode="stretch" accessibilityIgnoresInvertColors />
      <Image source={right} style={end} resizeMode="stretch" accessibilityIgnoresInvertColors />
    </View>
  );
}

/**
 * Fills its parent; put it first, so the words sit on it. `h` is the button's usual height, which sets how wide the
 * round ends are. The pressed face is drawn from the start and only shown on press, so it never loads under a finger.
 */
export function LuxeFace({ name, h, down, pressed }: { name: LuxeFaceName; h: number; down?: LuxeFaceName; pressed?: boolean }) {
  return (
    <>
      <Slices name={name} h={h} hidden={!!down && pressed} />
      {down && <Slices name={down} h={h} hidden={!pressed} />}
    </>
  );
}

const s = StyleSheet.create({
  // Clipped, so no slice is ever drawn outside its button, not even before the first measure.
  row: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', overflow: 'hidden', pointerEvents: 'none' },
  hidden: { opacity: 0 },
  // Half a point under each end, so no hairline shows on any screen density.
  mid: { flex: 1, height: '100%', marginHorizontal: -0.5 },
});
