// Depth and light: the shared building blocks that make flat panels feel physical. Ambient color glow
// behind a screen, frosted glass for surfaces floating over content, glossy cards lit from the top edge,
// a light sweep for valuable items and a spring press. Cheap by design: blur only on floating bars,
// one image per glow, transform-only animations; the light sweep stops with Settings.reduceMotion.
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, View, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { tapHaptic } from '@/lib/haptics';
import { useApp } from '@/store';
import { semantic } from '@/theme';

const GLOW = require('../../../assets/fx/glow.png');

/** Soft turquoise and coral light behind a screen, so the background is not a flat fill. */
export function Ambient() {
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', overflow: 'hidden' }]}>
      <Image source={GLOW} style={[s.glow, { left: -200, top: -160, opacity: 0.26, tintColor: semantic.action }]} />
      <Image source={GLOW} style={[s.glow, { right: -230, top: 280, opacity: 0.16, tintColor: semantic.social }]} />
      <Image source={GLOW} style={[s.glow, { left: -180, bottom: -140, opacity: 0.14, tintColor: semantic.action }]} />
    </View>
  );
}

/** A thin highlight along the top edge, as if lit from above. */
export function EdgeLight({ inset = 14, strength = 0.32 }: { inset?: number; strength?: number }) {
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

/** Frosted glass for surfaces that float over scrolling content (bars, headers, sheets). */
export function Glass({ children, style, intensity = 45 }: { children?: ReactNode; style?: StyleProp<ViewStyle>; intensity?: number }) {
  // Android without a blur target shows BlurView as a plain translucent layer; the tint keeps text legible there too.
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,15,30,0.55)' }]} />
      {children}
    </View>
  );
}

const DEPTH = ['#1C2E4A', '#132239'] as const;

/** The default card: a top-lit gradient, a faint rim, an edge highlight and a soft drop shadow. */
export function DepthCard({ children, style, tint = DEPTH }: { children?: ReactNode; style?: StyleProp<ViewStyle>; tint?: readonly [string, string, ...string[]] }) {
  return (
    <LinearGradient colors={tint} start={{ x: 0, y: 0 }} end={{ x: 0.35, y: 1 }} style={[s.depth, style]}>
      <EdgeLight />
      {children}
    </LinearGradient>
  );
}

/** A diagonal light sweep across the parent every few seconds; for valuable things (ranks, top rooms). */
export function Shine({ radius = 16, every = 4200, delay = 0 }: { radius?: number; every?: number; delay?: number }) {
  const { settings } = useApp();
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
        <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  );
}
const SHINE_W = 56;

/** Pressable that springs down a little under the finger and ticks a light haptic. */
export function PressableScale({
  children,
  style,
  onPress,
  to = 0.96,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & { children: ReactNode; style?: StyleProp<ViewStyle>; to?: number }) {
  const [v] = useState(() => new Animated.Value(1));
  const spring = (toValue: number) => Animated.spring(v, { toValue, speed: 40, bounciness: toValue === 1 ? 8 : 0, useNativeDriver: true }).start();
  return (
    <Pressable
      {...rest}
      onPressIn={() => spring(to)}
      onPressOut={() => spring(1)}
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
  depth: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', boxShadow: '0 8px 20px rgba(0,0,0,0.35)' },
  shine: { position: 'absolute', top: -30, bottom: -30, width: SHINE_W },
});

/** Translucent chip/pill fill that reads as glass over the ambient glow. */
export const glassChip = { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' } as const;
