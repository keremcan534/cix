// Every pushed screen passes through here (the root stack's screenLayout). It gives the screen its color scheme
// and background, and on the web its entrance: phones animate pushes natively (the root layout's `animation`),
// the web swaps screens instantly, so each screen fades and slides in here.
import { useIsFocused, useRoute } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';

import { useSettings } from '@/store';
import { ThemeScope, themes, useTheme } from '@/theme';

/**
 * Screens drawn dark in both modes: the live room and calls sit on a photo stage, Hemen Tanış is a full-screen
 * call. The agency screens wait for their own light pass (they are being reworked in another branch).
 */
const ALWAYS_DARK = /^(oda|arama|tanis|ajans)(\/|$)/;

export function ScreenEnter({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const route = useRoute();
  const app = useTheme();
  const scheme = ALWAYS_DARK.test(route.name) ? 'dark' : app.scheme;
  // A dark screen in the light app keeps a light status bar while it is on top (the app's own bar is dark there).
  const focused = useIsFocused();
  const ownBar = scheme !== app.scheme && focused;
  const still = Platform.OS !== 'web' || settings.reduceMotion;
  const [t] = useState(() => new Animated.Value(still ? 1 : 0));
  useEffect(() => {
    if (still) return;
    Animated.timing(t, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [still, t]);
  // The background is painted at once and only the content fades in, so a light screen never flashes the
  // navigator's dark backdrop.
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  return (
    <ThemeScope scheme={scheme}>
      <View style={{ flex: 1, backgroundColor: themes[scheme].colors.bg }}>
        {still ? children : <Animated.View style={{ flex: 1, opacity: t, transform: [{ translateX }] }}>{children}</Animated.View>}
      </View>
      {ownBar && <StatusBar style="light" />}
    </ThemeScope>
  );
}
