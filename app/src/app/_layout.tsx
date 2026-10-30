import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';

import { ScreenEnter } from '@/components/fx/screen-enter';
import { GamesBridge } from '@/components/games/bridge';
import { MatchLayer } from '@/components/match-layer';
import { RoomHost } from '@/components/room/room-host';
import { ME } from '@/data/mock';
import { setupVoice } from '@/lib/voice-setup';
import { AppProvider, useApp } from '@/store';
import { colors } from '@/theme';

// Real voice (LiveKit) on web when the server is configured; the simulated engine otherwise. The profile name
// (shared ME object, kept current by the store) names the server account on first sign-in.
setupVoice(() => ME.name);

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
  // The brand typeface, one file per weight (components/text picks it from fontWeight). A failed load falls back
  // to the system font instead of blocking the app.
  const [fontsLoaded, fontError] = useFonts({
    Jakarta: PlusJakartaSans_400Regular,
    JakartaMedium: PlusJakartaSans_500Medium,
    JakartaSemiBold: PlusJakartaSans_600SemiBold,
    JakartaBold: PlusJakartaSans_700Bold,
    JakartaExtraBold: PlusJakartaSans_800ExtraBold,
  });
  if (!fontsLoaded && !fontError) return null;
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
  // The live room, Hemen Tanış and the game platform live above the stack, so they keep running on every screen.
  return (
    <>
      <Stack
        // Pushed screens slide in from the right on both platforms; screens with their own animation keep it.
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'ios_from_right' }}
        screenLayout={({ children }) => <ScreenEnter>{children}</ScreenEnter>}
      >
        {/* Every screen must be listed in one of these groups: a route left out is added unprotected
            and opens from a deep link without signing in (tests/routes.test.ts checks this). */}
        <Stack.Protected guard={loggedIn}>
          <Stack.Screen name="(tabs)" />
          {/* The route only marks where the room is shown full screen; RoomHost renders the room itself. */}
          <Stack.Screen name="oda/[id]" options={{ animation: 'fade' }} />
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
          <Stack.Screen name="sunucu-hesabi" />
          <Stack.Screen name="ajans/basvuru" />
          <Stack.Screen name="ajans/hesap/[id]" />
          <Stack.Screen name="ajans/yonetim/index" />
          <Stack.Screen name="ajans/yonetim/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={!loggedIn}>
          <Stack.Screen name="giris" />
        </Stack.Protected>
      </Stack>
      {loggedIn && <RoomHost />}
      {loggedIn && <MatchLayer />}
      {loggedIn && <GamesBridge />}
    </>
  );
}
