// Oyun Salonu's lettering: carved Roman capitals (theme fonts.casino*) cast in metal, the way a machine's sign is
// painted. Each word is drawn in layers of the same text: a dark outline, a soft glow, the metal itself, a bright
// top half (the light from above) and a deep bottom edge, so it reads as gold (or silver) on any background without
// a gradient fill. FitBox keeps a line inside the box it is given: it measures what it holds and shrinks it to fit,
// never letting a win's number run over a plate's edge. Decoration only: screen readers get the plain text.
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { fonts } from '@/theme';

export type Metal = 'gold' | 'silver' | 'ruby' | 'emerald';

/** outline, glow, mid metal, highlight, deep edge. */
const METAL: Record<Metal, { line: string; glow: string; mid: string; hi: string; deep: string }> = {
  gold: { line: '#2B1200', glow: 'rgba(255,186,58,0.85)', mid: '#F2B238', hi: '#FFF5C8', deep: '#B4650C' },
  silver: { line: '#0A1328', glow: 'rgba(170,205,255,0.7)', mid: '#D3DDEE', hi: '#FFFFFF', deep: '#8293B2' },
  ruby: { line: '#2A0008', glow: 'rgba(255,70,110,0.8)', mid: '#FF5A7A', hi: '#FFD4DE', deep: '#A3122F' },
  emerald: { line: '#00200F', glow: 'rgba(60,255,160,0.7)', mid: '#4BE39A', hi: '#DFFFEF', deep: '#11804B' },
};

/** The outline: the text pushed out this far (as a part of its size) in eight directions. */
const LINE = 0.055;
const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.71, 0.71],
  [-0.71, 0.71],
  [0.71, -0.71],
  [-0.71, -0.71],
];

export function GoldText({
  children,
  size,
  metal = 'gold',
  face = 'casino',
  spacing = 0.04,
  glow = true,
  lite = false,
  style,
}: {
  children: string;
  /** Font size (px). */
  size: number;
  metal?: Metal;
  face?: 'casino' | 'casinoBold' | 'casinoTitle';
  /** Letter spacing as a part of the size. */
  spacing?: number;
  /** The soft light round the letters (off for small labels on busy pictures). */
  glow?: boolean;
  /** Four outline copies instead of eight and no deep edge: for a number redrawn many times a second. */
  lite?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const m = METAL[metal];
  const line = Math.max(1, Math.round(size * LINE * 10) / 10);
  const text: TextStyle = { fontFamily: fonts[face], fontSize: size, lineHeight: Math.round(size * 1.22), letterSpacing: size * spacing, includeFontPadding: false };
  const copy = (color: string, extra?: TextStyle) => (
    <Text style={[text, s.copy, { color }, extra]} numberOfLines={1} accessible={false}>
      {children}
    </Text>
  );
  return (
    // Cinzel's capitals stand a little above the middle of their line (room for Ş's cedilla below): nudged down.
    <View style={[s.wrap, { transform: [{ translateY: size * 0.05 }] }, style]} accessible accessibilityLabel={children}>
      {glow && copy('transparent', { textShadowColor: m.glow, textShadowRadius: size * 0.35, textShadowOffset: { width: 0, height: 0 } })}
      {(lite ? DIRS.slice(4) : DIRS).map(([x, y], i) => (
        <Text key={i} style={[text, s.copy, { color: m.line, left: x * line, top: y * line }]} numberOfLines={1} accessible={false}>
          {children}
        </Text>
      ))}
      {/* In the flow: this one gives the box its size. A drop under it lifts the letters off the plate. */}
      <Text style={[text, { color: m.mid, textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: line * 1.6 }, textShadowRadius: line }]} numberOfLines={1} accessible={false}>
        {children}
      </Text>
      <View style={[s.band, { top: 0, height: '50%' }]} pointerEvents="none">
        {copy(m.hi)}
      </View>
      {!lite && (
        <View style={[s.band, { top: '78%', bottom: 0 }]} pointerEvents="none">
          {copy(m.deep, { top: -Math.round(size * 1.22 * 0.78) })}
        </View>
      )}
    </View>
  );
}

/**
 * Holds one line of content inside `width`: measured as it is laid out, and scaled down (from its middle) when it
 * is wider, so a long number never runs over a plate's edge. Smaller content is left as it is.
 */
export function FitBox({ width, children, style }: { width: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const scale = box.w > width && width > 0 ? width / box.w : 1;
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
  };
  return (
    <View style={[{ width, height: box.h * scale }, style]}>
      {/* Laid out in a far wider box than ours, so nothing in it is squeezed or cut: the measure is the content's own. */}
      <View style={[s.wide, { left: (width - WIDE) / 2, top: (box.h * scale - box.h) / 2 }]} pointerEvents="box-none">
        <View style={[s.row, { transform: [{ scale }] }, box.w === 0 && s.hidden]} onLayout={onLayout}>
          {children}
        </View>
      </View>
    </View>
  );
}
const WIDE = 2000;

const s = StyleSheet.create({
  wrap: { position: 'relative' },
  copy: { position: 'absolute', left: 0, top: 0 },
  band: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  wide: { position: 'absolute', width: WIDE, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  hidden: { opacity: 0 },
});
