// The game screen's own tremor: a game panel (games/game-panel) wraps its game in <QuakeView>, and anything inside
// (a win, a blow of the big win, a reel coming to rest) shakes the whole game with `useGameQuake()(px)`: a damped
// shake, the two axes out of step, a stronger one taking over a weaker one still running. "Hareketi azalt" and
// "Animasyon ve giriş efektlerini kapat" keep it still. Decoration only: native-driven, nothing waits for it.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

import { useSettings } from '@/store';

type Quake = (px: number) => void;
const GameQuake = createContext<Quake | null>(null);

/** Shakes the game screen round it by `px` (nothing outside a game panel, or with motion reduced). */
export function useGameQuake(): Quake {
  return useContext(GameQuake) ?? NONE;
}
const NONE: Quake = () => {};

const X = [1, -0.85, 0.7, -0.55, 0.4, -0.25, 0.12, 0];
const Y = [-0.6, 0.75, -0.5, 0.45, -0.3, 0.18, -0.08, 0];

export function QuakeView({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { reduceMotion, effectsOff } = useSettings();
  const [x] = useState(() => new Animated.Value(0));
  const [y] = useState(() => new Animated.Value(0));
  const running = useRef<{ px: number; until: number; anim: Animated.CompositeAnimation } | null>(null);
  const quake = useCallback<Quake>(
    (px) => {
      if (reduceMotion || effectsOff || !(px > 0)) return;
      const now = Date.now();
      // A weaker shake doesn't cut a stronger one short.
      if (running.current && running.current.until > now && running.current.px > px) return;
      running.current?.anim.stop();
      const jolts = (v: Animated.Value, steps: number[]) => Animated.sequence(steps.map((k) => Animated.timing(v, { toValue: k * px, duration: 38, useNativeDriver: true })));
      const anim = Animated.parallel([jolts(x, X), jolts(y, Y)]);
      running.current = { px, until: now + X.length * 38, anim };
      anim.start();
    },
    [reduceMotion, effectsOff, x, y],
  );
  return (
    <GameQuake.Provider value={quake}>
      <Animated.View style={[{ flex: 1 }, style, { transform: [{ translateX: x }, { translateY: y }] }]}>{children}</Animated.View>
    </GameQuake.Provider>
  );
}
