// A night-sky backdrop that lives (the home screen's: the Milky Way over a mountain lake): the photo drifts in very
// slowly and back, a few stars twinkle in the sky part, and now and then a shooting star crosses the top. Everything
// runs on the native driver, so nothing here costs the JS thread a frame; it stands still with "Animasyonları azalt"
// or "Tüm efektleri kapat", and stops while its screen is out of sight (another tab, a room over it).
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useSettings } from '@/store';

const STAR = require('../../../assets/fx/yildiz-parilti.png');

/** Twinkling stars: where (parts of the screen), how big (dp), one twinkle's length and the pause before it (ms). */
const TWINKLES = [
  { x: 0.12, y: 0.07, size: 18, ms: 2600, wait: 400 },
  { x: 0.78, y: 0.05, size: 14, ms: 3200, wait: 1900 },
  { x: 0.46, y: 0.13, size: 22, ms: 3600, wait: 900 },
  { x: 0.9, y: 0.21, size: 12, ms: 2400, wait: 2700 },
  { x: 0.24, y: 0.27, size: 16, ms: 3000, wait: 1300 },
  { x: 0.64, y: 0.32, size: 13, ms: 2800, wait: 3300 },
  { x: 0.06, y: 0.38, size: 11, ms: 2200, wait: 2100 },
  { x: 0.84, y: 0.42, size: 15, ms: 3400, wait: 600 },
] as const;

/** Shooting stars: where each starts (parts of the screen), how far it falls (dp), how long it waits between two (ms). */
const METEORS = [
  { x: 0.08, y: 0.06, dx: 230, dy: 96, every: 9000, first: 3500 },
  { x: 0.52, y: 0.03, dx: 170, dy: 72, every: 13000, first: 8500 },
] as const;

/** The photo's slow drift: one way in this many ms, then back. */
const DRIFT_MS = 26000;

/** Whether the sky moves: its screen in sight and the person's motion settings allow it. */
function useSkyOn() {
  const focused = useIsFocused();
  const { reduceMotion, effectsOff } = useSettings();
  return focused && !reduceMotion && !effectsOff;
}

/** The photo (its `children`) drifting in slowly, with the stars and shooting stars over it. */
export function SkyMotion({ children }: { children: ReactNode }) {
  const on = useSkyOn();
  const [drift] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!on) return;
    const ease = Easing.inOut(Easing.sin);
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: DRIFT_MS, easing: ease, useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: DRIFT_MS, easing: ease, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [on, drift]);
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1.02, 1.09] }) }, { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) }] }]}>
        {children}
      </Animated.View>
      {on && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {TWINKLES.map((t, i) => (
            <Twinkle key={i} {...t} />
          ))}
          {METEORS.map((m, i) => (
            <Meteor key={i} {...m} />
          ))}
        </View>
      )}
    </>
  );
}

function Twinkle({ x, y, size, ms, wait }: { x: number; y: number; size: number; ms: number; wait: number }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const ease = Easing.inOut(Easing.quad);
    const a = Animated.loop(
      Animated.sequence([
        Animated.delay(wait),
        Animated.timing(t, { toValue: 1, duration: ms / 2, easing: ease, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: ms / 2, easing: ease, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [t, ms, wait]);
  return (
    <Animated.Image
      source={STAR}
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0, 0.95] }),
        transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }, { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '25deg'] }) }],
      }}
      fadeDuration={0}
    />
  );
}

/** One shooting star: a thin streak, bright at its head, crossing and fading out. */
function Meteor({ x, y, dx, dy, every, first }: { x: number; y: number; dx: number; dy: number; every: number; first: number }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const run = () => Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true });
    const reset = () => Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true });
    const a = Animated.sequence([Animated.delay(first), run(), reset(), Animated.loop(Animated.sequence([Animated.delay(every), run(), reset()]))]);
    a.start();
    return () => a.stop();
  }, [t, every, first]);
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <Animated.View
      style={[
        s.meteor,
        {
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          opacity: t.interpolate({ inputRange: [0, 0.12, 0.7, 1], outputRange: [0, 1, 0.9, 0] }),
          transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) }, { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) }, { rotate: `${deg}deg` }],
        },
      ]}
    >
      <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(232,214,255,0.55)', '#FFFFFF']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={s.streak} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  // The streak trails its head (the right end), so it is drawn to the left of where it stands.
  meteor: { position: 'absolute', width: 120, height: 2, marginLeft: -120 },
  streak: { flex: 1, borderRadius: 1 },
});
