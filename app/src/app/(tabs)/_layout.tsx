import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import { useApp } from '@/store';
import { colors } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function icon(name: IconName, active: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? active : name} size={24} color={color as string} />;
  };
}

export default function TabLayout() {
  const { conversations } = useApp();
  const unread = conversations.reduce((sum, c) => sum + c.unread, 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.pink,
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Odalar', tabBarIcon: icon('mic-outline', 'mic') }} />
      <Tabs.Screen name="kesfet" options={{ title: 'Keşfet', tabBarIcon: icon('compass-outline', 'compass') }} />
      <Tabs.Screen name="anlar" options={{ title: 'Anlar', tabBarIcon: icon('images-outline', 'images') }} />
      <Tabs.Screen
        name="mesajlar"
        options={{
          title: 'Mesajlar',
          tabBarIcon: icon('chatbubbles-outline', 'chatbubbles'),
          tabBarBadge: unread || undefined,
          tabBarBadgeStyle: { backgroundColor: colors.pink },
        }}
      />
      <Tabs.Screen name="profil" options={{ title: 'Ben', tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}
