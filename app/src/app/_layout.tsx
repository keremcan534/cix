import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { GamesBridge } from '@/components/games/bridge';
import { MatchLayer } from '@/components/match-layer';
import { AppProvider, useApp } from '@/store';
import { colors } from '@/theme';

// Keep the splash up until the saved state is loaded, so the app doesn't flash the login screen first.
SplashScreen.preventAutoHideAsync().catch(() => {});
const hideSplash = () => {
  SplashScreen.hideAsync().catch(() => {});
};

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.primaryText, border: colors.border },
};

export default function RootLayout() {
  return (
    <AppProvider onReady={hideSplash}>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <RootStack />
      </ThemeProvider>
    </AppProvider>
  );
}

function RootStack() {
  const { loggedIn } = useApp();
  // Hemen Tanış and the game platform live above the stack, so they keep running on every screen.
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={loggedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="oda/[id]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="sohbet/[id]" />
          <Stack.Screen name="cuzdan" options={{ presentation: 'modal' }} />
          <Stack.Screen name="kullanici/[id]" />
          <Stack.Screen name="arama/[id]" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="eslesme" />
          <Stack.Screen name="tanis" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
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
          <Stack.Screen name="kabile/index" />
          <Stack.Screen name="kabile/sohbet" />
          <Stack.Screen name="kabile/merkez" />
          <Stack.Screen name="kabile/iliski" />
          <Stack.Screen name="kabile/kasa" />
          <Stack.Screen name="coins-bank" />
          <Stack.Screen name="oyun-yonetimi" />
          <Stack.Screen name="animasyon-yonetimi" />
          <Stack.Screen name="pk-yonetimi" />
          <Stack.Screen name="lucky-yonetimi" />
        </Stack.Protected>
        <Stack.Protected guard={!loggedIn}>
          <Stack.Screen name="giris" />
        </Stack.Protected>
      </Stack>
      {loggedIn && <MatchLayer />}
      {loggedIn && <GamesBridge />}
    </>
  );
}
