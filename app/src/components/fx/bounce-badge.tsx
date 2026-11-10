// A count badge that hops once when the count goes up (a new message, a new notice), so the eye catches it; it
// stays put when the count goes down or stays. Over 99 it reads "99+".
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { useSettings } from '@/store';

export function BounceBadge({ count, style, textStyle, max = 99 }: { count: number; style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>; max?: number }) {
  const { reduceMotion } = useSettings();
  const [hop] = useState(() => new Animated.Value(1));
  const last = useRef(count);
  useEffect(() => {
    const up = count > last.current;
    last.current = count;
    if (!up || reduceMotion) return;
    Animated.sequence([
      Animated.timing(hop, { toValue: 1.4, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(hop, { toValue: 1, friction: 3.5, tension: 180, useNativeDriver: true }),
    ]).start();
  }, [count, hop, reduceMotion]);
  if (count <= 0) return null;
  return (
    <Animated.View style={[style, { transform: [{ scale: hop }] }]}>
      <Text style={textStyle}>{count > max ? `${max}+` : count}</Text>
    </Animated.View>
  );
}
