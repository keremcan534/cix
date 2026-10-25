import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router/js-tabs';
import { Text, View, type ColorValue } from 'react-native';

import { useApp } from '@/store';
import { colors } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

// Rooms stay the landing tab even though "Senin İçin" is first in the bar (Timo order).
export const unstable_settings = { initialRouteName: 'index' };

function icon(name: IconName, active: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? active : name} size={26} color={color as string} />;
  };
}

/** Center "Odalar" tab: a big raised button while active, a normal icon otherwise. */
function RoomsIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
  if (!focused) return <Ionicons name="home-outline" size={26} color={color as string} />;
  return (
    <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={{ width: 62, height: 62, borderRadius: 31, marginTop: -28, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: colors.card }}>
      <Ionicons name="stats-chart" size={24} color="#fff" />
    </LinearGradient>
  );
}
function RoomsLabel({ focused, color }: { focused: boolean; color: ColorValue }) {
  return focused ? <View /> : <Text style={{ color: color as string, fontSize: 12, fontWeight: '600' }}>Odalar</Text>;
}

export default function TabLayout() {
  const { conversations } = useApp();
  const unread = conversations.reduce((sum, c) => sum + c.unread, 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 64, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarIconStyle: { overflow: 'visible' },
      }}
    >
      <Tabs.Screen name="kesfet" options={{ title: 'Senin İçin', tabBarIcon: icon('heart-outline', 'heart'), tabBarActiveTintColor: colors.primaryText }} />
      <Tabs.Screen name="anlar" options={{ title: 'Anlar', tabBarIcon: icon('aperture-outline', 'aperture'), tabBarActiveTintColor: colors.primaryText }} />
      <Tabs.Screen name="index" options={{ title: 'Odalar', tabBarIcon: RoomsIcon, tabBarLabel: RoomsLabel, tabBarAccessibilityLabel: 'Odalar' }} />
      <Tabs.Screen
        name="mesajlar"
        options={{
          title: 'Mesajlar',
          tabBarIcon: icon('chatbox-ellipses-outline', 'chatbox-ellipses'),
          tabBarActiveTintColor: colors.primaryText,
          tabBarBadge: unread || undefined,
          tabBarBadgeStyle: { backgroundColor: colors.red },
        }}
      />
      <Tabs.Screen name="profil" options={{ title: 'Ben', tabBarIcon: icon('happy-outline', 'happy'), tabBarActiveTintColor: colors.primaryText }} />
    </Tabs>
  );
}
