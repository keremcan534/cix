// Screen entrance for the web build. On phones the native stack animates pushes itself (see the root
// layout's `animation`); on the web it swaps screens instantly, so each screen fades and slides in here.
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform } from 'react-native';

import { useApp } from '@/store';

export function ScreenEnter({ children }: { children: ReactNode }) {
  const { settings } = useApp();
  const still = Platform.OS !== 'web' || settings.reduceMotion;
  const [t] = useState(() => new Animated.Value(still ? 1 : 0));
  useEffect(() => {
    if (still) return;
    Animated.timing(t, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [still, t]);
  if (still) return children;
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  return <Animated.View style={{ flex: 1, opacity: t, transform: [{ translateX }] }}>{children}</Animated.View>;
}
