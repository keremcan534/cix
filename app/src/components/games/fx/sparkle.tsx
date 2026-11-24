// A star's glint, played once where it is put (assets/fx/sparkle-burst: eight frames of a four-pointed star growing,
// flaring and fading): a winning symbol's jump, a coin landing. Stepped frame by frame by one native timing.
// Decoration only: never takes a touch; nothing at all with motion reduced (the caller doesn't mount it).
import { useEffect, useState } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

const SHEET = require('../../../../assets/fx/sparkle-burst.png');
const FRAMES = 8;

export function Sparkle({ size, delay = 0, ms = 520, style }: { size: number; delay?: number; ms?: number; style?: StyleProp<ViewStyle> }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.sequence([Animated.delay(delay), Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true })]);
    a.start();
    return () => a.stop();
  }, [v, delay, ms]);
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let j = 0; j < FRAMES; j++) {
    inputRange.push(j / FRAMES, (j + 1) / FRAMES - 1e-6);
    outputRange.push(-j * size, -j * size);
  }
  // Hidden before its delay and after its last frame.
  const opacity = v.interpolate({ inputRange: [0, 0.001, 0.999, 1], outputRange: [0, 1, 1, 0] });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, overflow: 'hidden', opacity }, style]}>
      <Animated.Image source={SHEET} style={{ width: size * FRAMES, height: size, transform: [{ translateX: v.interpolate({ inputRange, outputRange, extrapolate: 'clamp' }) }] }} />
    </Animated.View>
  );
}
