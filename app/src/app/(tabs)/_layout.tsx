import Ionicons from '@expo/vector-icons/Ionicons';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { EdgeLight, Glass } from '@/components/fx/surface';
import { unreadTotal } from '@/lib/unread';
import { useApp } from '@/store';
import { TAB_BAR_HEIGHT, makeStyles, themes, useTheme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** Navigation theme of the tab navigator, per scheme (the root stack's is always the dark one). */
const NAV = {
  dark: { ...DarkTheme, colors: { ...DarkTheme.colors, background: themes.dark.colors.bg, card: themes.dark.colors.bg, primary: themes.dark.colors.primaryText, border: themes.dark.colors.border } },
  light: {
    ...DefaultTheme,
    colors: { ...DefaultTheme.colors, background: themes.light.colors.bg, card: themes.light.colors.card, primary: themes.light.colors.primaryText, border: themes.light.colors.border, text: themes.light.colors.text },
  },
};

// Rooms stay the landing tab even though "Benzerler" is first in the bar.
export const unstable_settings = { anchor: 'index' };

/** Every tab the same: line icon at rest, filled icon on a soft turquoise pill when active. */
function icon(name: IconName, active: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    const s = useStyles();
    return (
      <View style={[s.pill, focused && s.pillOn]}>
        <Ionicons name={focused ? active : name} size={22} color={color as string} />
      </View>
    );
  };
}

/** Frosted bar; screens that draw under it (absolute tabBarStyle) show their content blurred through it. */
function TabBarGlass() {
  const s = useStyles();
  const { dark } = useTheme();
  // On white glass a white edge light is invisible, so the light scheme draws a hairline instead.
  return (
    <Glass style={{ flex: 1 }}>
      {dark ? <EdgeLight inset={0} strength={0.18} /> : <View style={s.hairline} />}
    </Glass>
  );
}

export default function TabLayout() {
  const { conversations, blocked } = useApp();
  const { colors, scheme } = useTheme();
  // Same chats as the Mesajlar list: a blocked person's unread messages are hidden there, so not counted here.
  const unread = unreadTotal(conversations, blocked);
  // The bar's height must include the home-indicator inset: React Navigation pads by it inside the height we
  // give, so a fixed 64 would leave the icons ~24pt on notched phones. Screens pad by TAB_BAR_HEIGHT + inset.
  const insets = useSafeAreaInsets();
  const bar = { backgroundColor: 'transparent', borderTopWidth: 0, height: TAB_BAR_HEIGHT + insets.bottom, paddingTop: 6, elevation: 0 } as const;

  return (
    <ThemeProvider value={NAV[scheme]}>
      <Tabs
        // Back from any tab returns to Odalar (the anchor), not to the first tab in the bar.
        backBehavior="initialRoute"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primaryText,
          tabBarInactiveTintColor: colors.textDim,
          tabBarStyle: bar,
          // Tab scenes take the scheme's background (the root navigator's own theme is dark).
          sceneStyle: { backgroundColor: colors.bg },
          tabBarBackground: TabBarGlass,
          tabBarLabelStyle: { fontSize: 11, fontFamily: 'JakartaSemiBold', marginTop: 2 },
          tabBarIconStyle: { overflow: 'visible' },
          // Switching tabs slides the screens a little instead of cutting.
          animation: 'shift',
        }}
      >
        <Tabs.Screen name="kesfet" options={{ title: 'Benzerler', tabBarIcon: icon('heart-outline', 'heart') }} />
        <Tabs.Screen name="anlar" options={{ title: 'Anlar', tabBarIcon: icon('aperture-outline', 'aperture') }} />
        <Tabs.Screen
          name="index"
          options={{
            title: 'Odalar',
            tabBarIcon: icon('home-outline', 'home'),
            // Rooms scroll under the glass bar (the screen pads its list by the bar height).
            tabBarStyle: { ...bar, position: 'absolute' },
          }}
        />
        <Tabs.Screen
          name="mesajlar"
          options={{
            title: 'Mesajlar',
            tabBarIcon: icon('chatbox-ellipses-outline', 'chatbox-ellipses'),
            tabBarBadge: unread || undefined,
            tabBarBadgeStyle: { backgroundColor: colors.red },
          }}
        />
        <Tabs.Screen name="profil" options={{ title: 'Ben', tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
      </Tabs>
    </ThemeProvider>
  );
}

const useStyles = makeStyles(({ dark, surface }) => ({
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: dark ? 'rgba(19,217,223,0.16)' : 'rgba(0,140,148,0.10)' },
  hairline: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: surface.hairline },
}));
