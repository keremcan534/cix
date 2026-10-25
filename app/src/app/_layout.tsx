import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppProvider, useApp } from '@/store';
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
        <RootStack />
      </ThemeProvider>
    </AppProvider>
  );
}

function RootStack() {
  const { loggedIn } = useApp();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={loggedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="oda/[id]" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="sohbet/[id]" />
        <Stack.Screen name="cuzdan" options={{ presentation: 'modal' }} />
        <Stack.Screen name="kullanici/[id]" />
        <Stack.Screen name="arama/[id]" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="eslesme" />
        <Stack.Screen name="yayinci/index" />
        <Stack.Screen name="yayinci/cek" />
        <Stack.Screen name="ajans/index" />
        <Stack.Screen name="ajans/panel" />
        <Stack.Screen name="ajans/ag" />
        <Stack.Screen name="ajans/sohbet" />
        <Stack.Screen name="magaza" />
        <Stack.Screen name="bildirimler" />
        <Stack.Screen name="destek" />
        <Stack.Screen name="ayarlar" />
        <Stack.Screen name="oyunlar" />
        <Stack.Screen name="gorevler" />
        <Stack.Screen name="siralama" />
        <Stack.Screen name="vip" />
        <Stack.Screen name="aile" />
        <Stack.Screen name="cark" />
        <Stack.Screen name="yonetim" />
        <Stack.Screen name="gelir/index" />
        <Stack.Screen name="gelir/detay" />
        <Stack.Screen name="davet" />
        <Stack.Screen name="seviye" />
        <Stack.Screen name="yetki" />
      </Stack.Protected>
      <Stack.Protected guard={!loggedIn}>
        <Stack.Screen name="giris" />
      </Stack.Protected>
    </Stack>
  );
}
