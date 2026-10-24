import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppProvider } from '@/store';
import { colors } from '@/theme';

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.primary, border: colors.border },
};

export default function RootLayout() {
  return (
    <AppProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="oda/[id]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="sohbet/[id]" />
          <Stack.Screen name="cuzdan" options={{ presentation: 'modal' }} />
        </Stack>
      </ThemeProvider>
    </AppProvider>
  );
}
