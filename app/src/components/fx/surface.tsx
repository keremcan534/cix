// Depth and light: the shared building blocks that make flat panels feel physical. Ambient color glow
// behind a screen, frosted glass for surfaces floating over content, cards lit softly from the top edge,
// a light sweep for valuable items and a spring press. Cheap by design: blur only on floating bars,
// one image per glow, transform-only animations; the light sweep stops with Settings.reduceMotion.
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, View, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { tapHaptic } from '@/lib/haptics';
import { useSettings } from '@/store';
import type { Scene } from '@/components/fx/scenes';
import { makeStyles, useTheme, type Theme } from '@/theme';

const GLOW = require('../../../assets/fx/glow.png');

/** Soft turquoise and coral light behind a screen, so the background is not a flat fill. */
export function Ambient() {
  const { semantic, surface } = useTheme();
  const g = surface.glow;
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', overflow: 'hidden' }]}>
      <Image source={GLOW} style={[s.glow, { left: -200, top: -160, opacity: 0.26 * g, tintColor: semantic.action }]} />
      <Image source={GLOW} style={[s.glow, { right: -230, top: 280, opacity: 0.16 * g, tintColor: semantic.social }]} />
      <Image source={GLOW} style={[s.glow, { left: -180, bottom: -140, opacity: 0.14 * g, tintColor: semantic.action }]} />
    </View>
  );
}

/** A thin highlight along the top edge, as if lit from above. */
export function EdgeLight({ inset = 14, strength = 0.16 }: { inset?: number; strength?: number }) {
  return (
    <LinearGradient
      colors={['rgba(255,255,255,0)', `rgba(255,255,255,${strength})`, 'rgba(255,255,255,0)']}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={[s.edge, { left: inset, right: inset }]}
    />
  );
}

/** Glass sheen over the upper half of a button or badge. */
export function Gloss({ radius = 999, strength = 0.4 }: { radius?: number; strength?: number }) {
  return (
    <LinearGradient
      colors={[`rgba(255,255,255,${strength})`, 'rgba(255,255,255,0.03)']}
      style={[s.gloss, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]}
    />
  );
}

/**
 * The screen's own sea photo (fx/scenes) under a veil of the background color, with a soft glow of the screen's
 * accent behind the header. The veil is thickest at the top and bottom, where headers and tab bars sit, so the
 * photo shows mostly between cards; bright photos carry a stronger `veil`. `strength` is the photo's opacity (0–1).
 * The light scheme shows the photo faintly under a paper veil, as a cool wash rather than a picture.
 */
export function Backdrop({ scene, strength = 0.9 }: { scene: Scene; strength?: number }) {
  const { surface, dark } = useTheme();
  const v = scene.veil ?? 0.18;
  const c = surface.veil;
  const a = (x: number) => (dark ? x : Math.min(x + 0.22, 0.94));
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', overflow: 'hidden' }]}>
      <Image source={scene.photo} resizeMode="cover" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', opacity: strength * surface.photo }]} />
      <LinearGradient
        colors={[`rgba(${c},${a(0.7)})`, `rgba(${c},${a(v)})`, `rgba(${c},${a(Math.min(v + 0.12, 0.9))})`, `rgba(${c},${a(0.86)})`]}
        locations={[0, 0.3, 0.66, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Image source={GLOW} style={[s.glow, { alignSelf: 'center', top: -320, opacity: 0.22 * surface.glow, tintColor: scene.light }]} />
    </View>
  );
}

/** Frosted glass for surfaces that float over scrolling content (bars, headers, sheets). */
export function Glass({ children, style, intensity = 45 }: { children?: ReactNode; style?: StyleProp<ViewStyle>; intensity?: number }) {
  // Android without a blur target shows BlurView as a plain translucent layer; the tint keeps text legible there too.
  const { surface } = useTheme();
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <BlurView intensity={intensity} tint={surface.blurTint} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: surface.glass }]} />
      {children}
    </View>
  );
}

/**
 * The default card: a top-lit gradient, a faint rim, an edge highlight and a soft drop shadow. Without a `tint` it
 * takes the scheme's card gradient (night blue, or white in the light scheme).
 */
export function DepthCard({ children, style, tint }: { children?: ReactNode; style?: StyleProp<ViewStyle>; tint?: readonly [string, string, ...string[]] }) {
  const { surface } = useTheme();
  const d = useDepth();
  return (
    <LinearGradient colors={tint ?? surface.depth} start={{ x: 0, y: 0 }} end={{ x: 0.35, y: 1 }} style={[d.depth, style]}>
      <EdgeLight />
      {children}
    </LinearGradient>
  );
}

/** A diagonal light sweep across the parent every few seconds; for valuable things (ranks, top rooms). */
// Memoized so a store update elsewhere on the screen does not restart the sweep.
export const Shine = memo(ShineBase);
function ShineBase({ radius = 16, every = 9000, delay = 0 }: { radius?: number; every?: number; delay?: number }) {
  const settings = useSettings();
  const [t] = useState(() => new Animated.Value(0));
  const [w, setW] = useState(0);
  useEffect(() => {
    if (settings.reduceMotion || !w) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(every),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [settings.reduceMotion, w, every, delay, t]);
  if (settings.reduceMotion) return null;
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [-SHINE_W * 2, w + SHINE_W] });
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden', pointerEvents: 'none' }]}>
      <Animated.View style={[s.shine, { transform: [{ translateX }, { rotate: '18deg' }] }]}>
        <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  );
}
const SHINE_W = 56;

/**
 * A press that sinks under the finger and springs back when it lifts (native driver, no drawing per frame). Put
 * `onPressIn`/`onPressOut` on the Pressable and `scale` on the part that moves; `to` is how far it sinks.
 */
export function useSpringPress(to = 0.96) {
  const [scale] = useState(() => new Animated.Value(1));
  const spring = (toValue: number) => Animated.spring(scale, { toValue, speed: 40, bounciness: toValue === 1 ? 8 : 0, useNativeDriver: true }).start();
  return { scale, onPressIn: () => spring(to), onPressOut: () => spring(1) };
}

/** Pressable that springs down a little under the finger and ticks a light haptic. */
export function PressableScale({
  children,
  style,
  onPress,
  to = 0.96,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & { children: ReactNode; style?: StyleProp<ViewStyle>; to?: number }) {
  const press = useSpringPress(to);
  const v = press.scale;
  return (
    <Pressable
      {...rest}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={
        onPress &&
        ((e: GestureResponderEvent) => {
          tapHaptic();
          onPress(e);
        })
      }
    >
      <Animated.View style={[style, { transform: [{ scale: v }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Colored outer glow, e.g. under the primary button or around an active avatar. */
export const glow = (color: string, size = 18, y = 6) => ({ boxShadow: `0 ${y}px ${size}px ${color}` });

const s = StyleSheet.create({
  glow: { position: 'absolute', width: 460, height: 460 },
  edge: { position: 'absolute', top: 0, height: 1 },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '52%' },
  shine: { position: 'absolute', top: -30, bottom: -30, width: SHINE_W },
});

const useDepth = makeStyles(({ surface, dark }) => ({
  depth: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: surface.rim,
    boxShadow: dark ? '0 8px 20px rgba(0,0,0,0.35)' : '0 1px 2px rgba(64,20,40,0.05), 0 8px 20px rgba(64,20,40,0.08)',
  },
}));

/** Translucent chip/pill fill that reads as glass over the ambient glow (dark surfaces; screens use glassChipOf). */
export const glassChip = { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' } as const;
/** glassChip in the given scheme's ink, for makeStyles: `tabs: { ...glassChipOf(t) }`. */
export const glassChipOf = (t: Theme) => ({ backgroundColor: t.ink(0.06), borderWidth: 1, borderColor: t.ink(0.1) }) as const;
