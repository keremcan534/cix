// Coins in the air: a fountain from the middle of the stage for a small win, a shower from the top for a big one, and
// for a big one's first moment a burst: thrown from the middle every way round, growing as they come at the viewer.
// One timing drives every coin (native driver), each with its own stretch of it, so sixty coins cost one animation.
// The coin itself is a real 3D gold coin turning in the air (assets/fx/coin-spin: rendered in Blender, sixteen frames
// of one turn; a half turn looks the same, so eight are used), stepped frame by frame by the same timing. A game that
// brings its own coin picture gets the old flat flip. Purely decoration: never takes a touch, and nothing waits for it.
import { memo, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { icon3dSource } from '@/components/Icon3D';
import { coinPaths } from '@/lib/win-tier';

const COIN = icon3dSource('coin');
const SPIN = require('../../../../assets/fx/coin-spin.png');
/** Frames of a half turn in the sheet (the sheet holds a whole turn of 16; the coin looks the same every half turn). */
const HALF = 8;
const SHEET = 16;

/**
 * The sheet's offset for a coin turning `halves` half turns over its stretch [a, b] of the show: a staircase, so each
 * frame holds until the next (no sliding between frames).
 */
function frameSteps(a: number, b: number, halves: number, size: number) {
  const n = Math.max(1, Math.round(halves * HALF));
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let j = 0; j < n; j++) {
    const t0 = a + ((b - a) * j) / n;
    const t1 = a + ((b - a) * (j + 1)) / n;
    const x = -(j % HALF) * size;
    inputRange.push(t0, Math.max(t0, t1 - 1e-6));
    outputRange.push(x, x);
  }
  return { inputRange, outputRange, extrapolate: 'clamp' as const };
}

// Memoised, and each coin's motion built once per layer size: a show above re-renders while it plays (a title
// stepping up, a new blow), and rebuilding sixty coins' interpolations re-creates hundreds of native animation nodes.
export const Coins = memo(function Coins({
  kind,
  count,
  width,
  height,
  ms,
  from = 0.55,
  source = COIN,
}: {
  kind: 'fountain' | 'rain' | 'burst';
  count: number;
  /** The layer's size (px). Nothing is drawn until both are known. */
  width: number;
  height: number;
  ms: number;
  /** A fountain's or a burst's starting height, as a part of the layer's (0 top … 1 bottom). */
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
  const coins = useMemo(() => {
    if (!width || !height) return null;
    return paths.map((p, i) => {
      // Each coin has its own stretch [a, b] of the show.
      const a = p.delay;
      const b = Math.min(1, a + (kind === 'rain' ? 0.38 : kind === 'burst' ? 0.6 : 0.8));
      const q = (b - a) / 4;
      const clamp = { extrapolate: 'clamp' as const };
      // A burst flies out fast and slows (most of its way in the first quarter of its time).
      const x =
        kind === 'burst'
          ? v.interpolate({ inputRange: [a, a + q, b], outputRange: [p.x0 * width, (p.x0 + (p.x1 - p.x0) * 0.62) * width, p.x1 * width], ...clamp })
          : v.interpolate({ inputRange: [a, b], outputRange: [p.x0 * width, p.x1 * width], ...clamp });
      const y =
        kind === 'rain'
          ? // Falling faster as it goes: the first half of its time covers a third of the way.
            v.interpolate({ inputRange: [a, a + 2 * q, b], outputRange: [-36, height * 0.34, height + 36], ...clamp })
          : kind === 'burst'
            ? v.interpolate({ inputRange: [a, a + q, b], outputRange: [from * height, (from + (p.dy ?? 0) * 0.62) * height, (from + (p.dy ?? 0)) * height], ...clamp })
            : v.interpolate({ inputRange: [a, a + 1.5 * q, b], outputRange: [from * height, (from - p.rise * 0.8) * height, height + 36], ...clamp });
      const real = source === COIN;
      // A flat coin turning in the air shows its edge twice; the 3D one turns in its own frames, a little tilted.
      const flip = real ? 1 : v.interpolate({ inputRange: [a, a + q, a + 2 * q, a + 3 * q, b], outputRange: [1, 0.12, 1, 0.12, 1], ...clamp });
      const rotate = v.interpolate({ inputRange: [a, b], outputRange: ['0deg', `${Math.round(p.turns * (real ? 40 : 120))}deg`], ...clamp });
      const opacity = v.interpolate({ inputRange: [a, a + 0.02, b - 0.03, b], outputRange: [0, 1, 1, 0], ...clamp });
      // A burst's coin comes at the viewer: small at the middle, big at the edge.
      const near = kind === 'burst' ? v.interpolate({ inputRange: [a, b], outputRange: [0.45, 1.7], ...clamp }) : 1;
      if (real) {
        // Bigger than the flat picture: the 3D coin fills less of its frame and is the show's star.
        const size = Math.round(p.size * 1.25);
        return (
          <Animated.View key={i} style={{ position: 'absolute', left: -size / 2, top: -size / 2, width: size, height: size, overflow: 'hidden', opacity, transform: [{ translateX: x }, { translateY: y }, { rotate }, { scale: near }] }}>
            <Animated.Image source={SPIN} style={{ width: size * SHEET, height: size, transform: [{ translateX: v.interpolate(frameSteps(a, b, 2 + p.turns * 2, size)) }] }} />
          </Animated.View>
        );
      }
      return (
        <Animated.Image
          key={i}
          source={source}
          style={{ position: 'absolute', left: -p.size / 2, top: -p.size / 2, width: p.size, height: p.size, opacity, transform: [{ translateX: x }, { translateY: y }, { rotate }, { scaleX: flip }, { scale: near }] }}
        />
      );
    });
  }, [paths, v, width, height, kind, from, source]);
  if (!coins) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {coins}
    </View>
  );
});
