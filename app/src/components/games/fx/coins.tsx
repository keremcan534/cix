// Coins in the air: a fountain from the middle of the stage for a small win, a shower from the top for a big one.
// One timing drives every coin (native driver), each with its own stretch of it, so sixty coins cost one animation.
// Purely decoration: never takes a touch, and nothing waits for it.
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { icon3dSource } from '@/components/Icon3D';
import { coinPaths } from '@/lib/win-tier';

const COIN = icon3dSource('coin');

export function Coins({
  kind,
  count,
  width,
  height,
  ms,
  from = 0.55,
  source = COIN,
}: {
  kind: 'fountain' | 'rain';
  count: number;
  /** The layer's size (px). Nothing is drawn until both are known. */
  width: number;
  height: number;
  ms: number;
  /** A fountain's starting height, as a part of the layer's (0 top … 1 bottom). */
  from?: number;
  /** The coin's picture (the 3D icon set's coin unless a game brings its own). */
  source?: number;
}) {
  const paths = useMemo(() => coinPaths(count, kind), [count, kind]);
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [v, ms]);
  if (!width || !height) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {paths.map((p, i) => {
        // Each coin has its own stretch [a, b] of the show.
        const a = p.delay;
        const b = Math.min(1, a + (kind === 'rain' ? 0.38 : 0.8));
        const q = (b - a) / 4;
        const clamp = { extrapolate: 'clamp' as const };
        const x = v.interpolate({ inputRange: [a, b], outputRange: [p.x0 * width, p.x1 * width], ...clamp });
        const y =
          kind === 'rain'
            ? // Falling faster as it goes: the first half of its time covers a third of the way.
              v.interpolate({ inputRange: [a, a + 2 * q, b], outputRange: [-36, height * 0.34, height + 36], ...clamp })
            : v.interpolate({ inputRange: [a, a + 1.5 * q, b], outputRange: [from * height, (from - p.rise * 0.8) * height, height + 36], ...clamp });
        // A coin turning in the air shows its edge twice.
        const flip = v.interpolate({ inputRange: [a, a + q, a + 2 * q, a + 3 * q, b], outputRange: [1, 0.12, 1, 0.12, 1], ...clamp });
        const rotate = v.interpolate({ inputRange: [a, b], outputRange: ['0deg', `${Math.round(p.turns * 120)}deg`], ...clamp });
        const opacity = v.interpolate({ inputRange: [a, a + 0.02, b - 0.03, b], outputRange: [0, 1, 1, 0], ...clamp });
        return (
          <Animated.Image
            key={i}
            source={source}
            style={{ position: 'absolute', left: -p.size / 2, top: -p.size / 2, width: p.size, height: p.size, opacity, transform: [{ translateX: x }, { translateY: y }, { rotate }, { scaleX: flip }] }}
          />
        );
      })}
    </View>
  );
}
