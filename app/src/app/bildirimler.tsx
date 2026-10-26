import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header } from '@/components/ui';
import { useApp, type Notice } from '@/store';
import { colors } from '@/theme';

// Security/finance notices are kept apart from social ones (spec §10.3).
const TABS: { key: 'all' | 'social' | 'important'; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'social', label: 'Sosyal' },
  { key: 'important', label: 'Finans & Güvenlik' },
];

export default function NotificationsScreen() {
  const { notifications, markNotificationsRead } = useApp();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('all');
  const list = notifications.filter((n) => tab === 'all' || (tab === 'social' ? n.kind === 'social' : n.kind !== 'social'));

  const open = (n: Notice) => n.href && router.push(n.href as Href);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        title="Bildirimler"
        right={
          <Pressable onPress={markNotificationsRead} hitSlop={8}>
            <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 12 }}>Tümünü okundu say</Text>
          </Pressable>
        }
      />
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t.key && { color: '#fff' }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={list}
        keyExtractor={(n) => n.id}
        ListEmptyComponent={<Text style={styles.empty}>Bildirim yok.</Text>}
        renderItem={({ item }) => (
          <Pressable style={[styles.row, !item.read && { backgroundColor: 'rgba(19,217,223,0.12)' }]} onPress={() => open(item)}>
            <Text style={{ fontSize: 24 }}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: item.read ? '500' : '800' }}>{item.title}</Text>
              <Text style={styles.dim}>{item.body}</Text>
            </View>
            <Text style={styles.dim}>{item.time}</Text>
          </Pressable>
        )}
      />
      <Pressable onPress={() => router.push('/ayarlar')} style={{ alignItems: 'center', padding: 12 }}>
        <Text style={styles.dim}>Bildirim tercihleri →</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.card },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textDim, fontWeight: '700', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  dim: { color: colors.textDim, fontSize: 12 },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: 40 },
});
