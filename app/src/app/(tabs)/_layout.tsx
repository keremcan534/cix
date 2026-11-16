import Ionicons from '@expo/vector-icons/Ionicons';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, type ColorValue } from 'react-native';

import { Text } from '@/components/text';
import { BounceBadge } from '@/components/fx/bounce-badge';
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

// Rooms stay the landing tab even though "Ana Sayfa" (people to meet, /kesfet) is first in the bar.
export const unstable_settings = { anchor: 'index' };

/** The bar's colours (the owner's design): plum line icons on pink glass, the chosen tab pink on its own pill. */
const NAV_INK = { on: '#E0287D', off: '#7A4A63' } as const;

/** Every tab the same: its icon and name; the chosen one filled, pink, on a soft pink pill (icon and name together). */
function icon(name: IconName, active: IconName, title: string, badge?: () => number) {
  return function TabIcon({ focused }: { color: ColorValue; focused: boolean }) {
    const s = useStyles();
    const c = focused ? NAV_INK.on : NAV_INK.off;
    return (
      <View style={[s.pill, focused && s.pillOn]}>
        <Ionicons name={focused ? active : name} size={22} color={c} />
        <Text style={[s.label, { color: c }, focused && s.labelOn]} numberOfLines={1}>
          {title}
        </Text>
        {/* A new message: the count hops once (components/fx/bounce-badge). */}
        {badge && <BounceBadge count={badge()} style={s.badge} textStyle={s.badgeText} />}
      </View>
    );
  };
}

/** A pink glass bar floating a little in from the edges, in either scheme; screens that draw under it show round it. */
function TabBarGlass() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  return <View style={[s.float, { bottom: insets.bottom + 4 }]} />;
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
          tabBarActiveTintColor: NAV_INK.on,
          tabBarInactiveTintColor: NAV_INK.off,
          tabBarStyle: bar,
          // The name is drawn with the icon, on the chosen tab's pill.
          tabBarShowLabel: false,
          // Tab scenes take the scheme's background (the root navigator's own theme is dark).
          sceneStyle: { backgroundColor: colors.bg },
          tabBarBackground: TabBarGlass,
          tabBarIconStyle: { width: 68, height: 48, overflow: 'visible' },
          // Switching tabs slides the screens a little instead of cutting.
          animation: 'shift',
        }}
      >
        {/* Güncelleme 2, madde 46: the bar's "Benzerler" is now "Ana Sayfa" (its own tabs start with Ana Sayfa as well). */}
        <Tabs.Screen name="kesfet" options={{ title: 'Ana Sayfa', tabBarIcon: icon('home-outline', 'home', 'Ana Sayfa') }} />
        <Tabs.Screen name="anlar" options={{ title: 'Anlar', tabBarIcon: icon('aperture-outline', 'aperture', 'Anlar') }} />
        <Tabs.Screen
          name="index"
          options={{
            title: 'Odalar',
            tabBarIcon: icon('mic-outline', 'mic', 'Odalar'),
            // Rooms scroll under the glass bar (the screen pads its list by the bar height).
            tabBarStyle: { ...bar, position: 'absolute' },
          }}
        />
        <Tabs.Screen
          name="mesajlar"
          options={{
            title: 'Mesajlar',
            tabBarIcon: icon('chatbox-ellipses-outline', 'chatbox-ellipses', 'Mesajlar', () => unread),
          }}
        />
        <Tabs.Screen name="profil" options={{ title: 'Ben', tabBarIcon: icon('person-circle-outline', 'person-circle', 'Ben') }} />
      </Tabs>
    </ThemeProvider>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  pill: { width: 68, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 1 },
  pillOn: { backgroundColor: '#F9D0E4' },
  label: { fontSize: 11, fontFamily: 'JakartaSemiBold' },
  labelOn: { fontFamily: 'JakartaBold' },
  float: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 0,
    borderRadius: 26,
    backgroundColor: 'rgba(255,240,247,0.97)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.95)',
    boxShadow: '0 4px 18px rgba(120,20,70,0.28)',
  },
  badge: { position: 'absolute', top: -5, right: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.red, borderWidth: 2, borderColor: '#FFF0F7' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'] },
}));
