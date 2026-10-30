import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { EdgeLight, Glass } from '@/components/fx/surface';
import { useApp } from '@/store';
import { TAB_BAR_HEIGHT, colors } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

// Rooms stay the landing tab even though "Senin İçin" is first in the bar.
export const unstable_settings = { anchor: 'index' };

/** Every tab the same: line icon at rest, filled icon on a soft turquoise pill when active. */
function icon(name: IconName, active: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return (
      <View style={[s.pill, focused && s.pillOn]}>
        <Ionicons name={focused ? active : name} size={22} color={color as string} />
      </View>
    );
  };
}

/** Frosted bar; screens that draw under it (absolute tabBarStyle) show their content blurred through it. */
function TabBarGlass() {
  return (
    <Glass style={{ flex: 1 }}>
      <EdgeLight inset={0} strength={0.18} />
    </Glass>
  );
}

export default function TabLayout() {
  const { conversations } = useApp();
  const unread = conversations.reduce((sum, c) => sum + c.unread, 0);

  return (
    <Tabs
      // Back from any tab returns to Odalar (the anchor), not to the first tab in the bar.
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryText,
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: { backgroundColor: 'transparent', borderTopWidth: 0, height: TAB_BAR_HEIGHT, paddingTop: 6, elevation: 0 },
        tabBarBackground: TabBarGlass,
        tabBarLabelStyle: { fontSize: 11, fontFamily: 'JakartaSemiBold', marginTop: 2 },
        tabBarIconStyle: { overflow: 'visible' },
        // Switching tabs slides the screens a little instead of cutting.
        animation: 'shift',
      }}
    >
      <Tabs.Screen name="kesfet" options={{ title: 'Senin İçin', tabBarIcon: icon('heart-outline', 'heart') }} />
      <Tabs.Screen name="anlar" options={{ title: 'Anlar', tabBarIcon: icon('aperture-outline', 'aperture') }} />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Odalar',
          tabBarIcon: icon('home-outline', 'home'),
          // Rooms scroll under the glass bar (the screen pads its list by the bar height).
          tabBarStyle: { position: 'absolute', backgroundColor: 'transparent', borderTopWidth: 0, height: TAB_BAR_HEIGHT, paddingTop: 6, elevation: 0 },
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
  );
}

const s = StyleSheet.create({
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: 'rgba(19,217,223,0.16)' },
});
