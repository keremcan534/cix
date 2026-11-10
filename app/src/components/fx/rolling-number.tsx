// A number that rolls to its new value like a counter instead of jumping (balances, PK points). The first value is
// shown as it is; with "Animasyonları azalt" every change shows at once. Digits keep one width while they roll.
import { useEffect, useRef, useState } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { Text } from '@/components/text';
import { rollAt } from '@/lib/motion';
import { useSettings } from '@/store';

const trNumber = (n: number) => n.toLocaleString('tr-TR');

export function RollingNumber({
  value,
  style,
  format = trNumber,
  duration = 700,
  numberOfLines,
}: {
  value: number;
  style?: StyleProp<TextStyle>;
  format?: (n: number) => string;
  /** How long a roll takes (ms). */
  duration?: number;
  numberOfLines?: number;
}) {
  const { reduceMotion } = useSettings();
  const [shown, setShown] = useState(value);
  // Where the number is now, also halfway through a roll: a new value rolls on from there.
  const at = useRef(value);
  useEffect(() => {
    const from = at.current;
    if (from === value || reduceMotion) {
      at.current = value;
      return;
    }
    const start = Date.now();
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      at.current = rollAt(from, value, t);
      setShown(at.current);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduceMotion]);
  return (
    <Text style={[{ fontVariant: ['tabular-nums'] }, style]} numberOfLines={numberOfLines}>
      {format(reduceMotion ? value : shown)}
    </Text>
  );
}
