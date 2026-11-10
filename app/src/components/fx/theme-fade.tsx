// Switching between the dark and the light look: the old background lies over the new screen for a moment and
// fades away, so the change is one soft step instead of a flash. Nothing under it stops working meanwhile.
import { useLayoutEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet } from 'react-native';

import { useSettings } from '@/store';
import { useTheme } from '@/theme';

export function ThemeFade() {
  const { colors } = useTheme();
  const { reduceMotion } = useSettings();
  // The background last drawn; when it changes, a cover in the old one (fully opaque) starts on the same frame.
  const [seen, setSeen] = useState(colors.bg);
  const [cover, setCover] = useState<{ color: string; o: Animated.Value } | null>(null);
  if (seen !== colors.bg) {
    setSeen(colors.bg);
    if (!reduceMotion) setCover({ color: seen, o: new Animated.Value(1) });
  }
  useLayoutEffect(() => {
    if (!cover) return;
    const run = Animated.timing(cover.o, { toValue: 0, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' });
    run.start(({ finished }) => finished && setCover((c) => (c === cover ? null : c)));
    return () => run.stop();
  }, [cover]);
  if (!cover) return null;
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.cover, { backgroundColor: cover.color, opacity: cover.o }]} />;
}

const s = StyleSheet.create({ cover: { zIndex: 10000, elevation: 10000 } });
