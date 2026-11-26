import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { DarkTheme, DefaultTheme, ThemeProvider, router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, type ColorValue } from 'react-native';

import { Text } from '@/components/text';
import { BounceBadge } from '@/components/fx/bounce-badge';
import { unreadTotal } from '@/lib/unread';
import { useApp } from '@/store';
import { TAB_BAR_HEIGHT, glass, makeStyles, themes, useTheme } from '@/theme';

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

/** The bar's colours (the owners' design, 23 Nov 2026): plum line icons and names on pink glass; the chosen tab on a
 *  glowing magenta pill with its icon and name in white. */
const NAV_INK = { on: '#FFFFFF', off: glass.plum } as const;
/** The chosen tab's neon pill, top to bottom. */
const PILL_FILL = ['#FF5CC8', '#E5179A', '#B70C78'] as const;

/** Every tab the same: its line icon and name; the chosen one on the neon pill (icon and name together). */
function icon(name: IconName, title: string, badge?: () => number) {
  return function TabIcon({ focused }: { color: ColorValue; focused: boolean }) {
    const s = useStyles();
    const c = focused ? NAV_INK.on : NAV_INK.off;
    return (
      <View style={[s.pill, focused && s.pillOn]}>
        {focused && <LinearGradient colors={PILL_FILL} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={s.pillFill} />}
        <Ionicons name={name} size={23} color={c} />
        <Text style={[s.label, { color: c }, focused && s.labelOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
          {title}
        </Text>
        {/* A new message: the count hops once (components/fx/bounce-badge). */}
        {badge && <BounceBadge count={badge()} style={s.badge} textStyle={s.badgeText} />}
      </View>
    );
  };
}

/**
 * The bar's pink glass, in either scheme. It sits on the bottom edge and runs under the system navigation bar: the
 * client found the floating bar "didn't sit" (a strip of the page showed round it, the chosen pill reached past its
 * rounded ends).
 */
function TabBarGlass() {
  const s = useStyles();
  return <View style={s.glass} />;
}

export default function TabLayout() {
  // The app opens on Ana Sayfa (/kesfet), not Odalar (owners, 26 Nov 2026): "/" stays Odalar's address, so a launch
  // (or a sign-in) that lands there with no link of its own moves on to Ana Sayfa, once as the tabs mount.
  const path = usePathname();
  useEffect(() => {
    if (path === '/') router.replace('/kesfet');
    // Once, when the tabs first show.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { conversations, blocked } = useApp();
  const { colors, scheme } = useTheme();
  // Same chats as the Mesajlar list: a blocked person's unread messages are hidden there, so not counted here.
  const unread = unreadTotal(conversations, blocked);
  // The bar's height must include the home-indicator inset: React Navigation pads by it inside the height we
  // give, so a fixed 64 would leave the icons ~24pt on notched phones. Screens pad by TAB_BAR_HEIGHT + inset.
  const insets = useSafeAreaInsets();
  // The tabs sit a little in from the glass's rounded ends, so the chosen pill never reaches past them.
  const bar = { backgroundColor: 'transparent', borderTopWidth: 0, height: TAB_BAR_HEIGHT + insets.bottom, paddingTop: 6, paddingHorizontal: 10, elevation: 0 } as const;

  return (
    <ThemeProvider value={NAV[scheme]}>
      <Tabs
        // Back from any tab returns to Ana Sayfa, the first tab in the bar and where the app opens (owners, 26 Nov 2026).
        backBehavior="firstRoute"
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
          tabBarIconStyle: { width: 74, height: 48, overflow: 'visible' },
          // Switching tabs slides the screens a little instead of cutting.
          animation: 'shift',
          // A tab that isn't shown doesn't redraw (it catches up when it comes back): see the root stack.
          freezeOnBlur: true,
        }}
      >
        {/* Güncelleme 2, madde 46: the bar's "Benzerler" is now "Ana Sayfa" (its own tabs start with Ana Sayfa as well). */}
        <Tabs.Screen name="kesfet" options={{ title: 'Ana Sayfa', tabBarIcon: icon('home-outline', 'Ana Sayfa') }} />
        <Tabs.Screen name="anlar" options={{ title: 'Anlar', tabBarIcon: icon('aperture-outline', 'Anlar') }} />
        <Tabs.Screen
          name="index"
          options={{
            title: 'Odalar',
            tabBarIcon: icon('mic-outline', 'Odalar'),
            // Rooms scroll under the glass bar (the screen pads its list by the bar height).
            tabBarStyle: { ...bar, position: 'absolute' },
          }}
        />
        <Tabs.Screen
          name="mesajlar"
          options={{
            title: 'Mesajlar',
            tabBarIcon: icon('chatbox-ellipses-outline', 'Mesajlar', () => unread),
          }}
        />
        <Tabs.Screen name="profil" options={{ title: 'Ben', tabBarIcon: icon('person-circle-outline', 'Ben') }} />
      </Tabs>
    </ThemeProvider>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  pill: { width: 74, height: 48, paddingHorizontal: 4, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 1 },
  // The chosen tab: a magenta pill with a white rim and a pink glow, as in the design.
  pillOn: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)', boxShadow: '0 0 14px rgba(255,40,170,0.7)' },
  pillFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 16.5 },
  label: { fontSize: 12, fontFamily: 'JakartaSemiBold' },
  labelOn: { fontFamily: 'JakartaBold', textShadowColor: 'rgba(120,0,70,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  glass: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // Opaque: the rooms list scrolls under this bar and must not show through its icons.
    backgroundColor: glass.fill,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderColor: glass.rim,
    boxShadow: '0 -3px 16px rgba(120,20,70,0.22)',
  },
  badge: { position: 'absolute', top: -5, right: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.red, borderWidth: 2, borderColor: '#FFF0F7' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'] },
}));
