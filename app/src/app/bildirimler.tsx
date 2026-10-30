import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Header, StateIcon } from '@/components/ui';
import { useApp, type Notice } from '@/store';
import { colors, semantic } from '@/theme';

// Security/finance notices are kept apart from social ones (spec §10.3).
const TABS: { key: 'all' | 'social' | 'important'; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'social', label: 'Sosyal' },
  { key: 'important', label: 'Finans & Güvenlik' },
];

const KIND: Record<Notice['kind'], { icon: keyof typeof Ionicons.glyphMap; tone: 'action' | 'money' | 'social' }> = {
  social: { icon: 'chatbubble', tone: 'social' },
  finance: { icon: 'wallet', tone: 'money' },
  security: { icon: 'shield-checkmark', tone: 'action' },
  system: { icon: 'notifications', tone: 'action' },
};
/** Notices saved before icons were glyph names hold an emoji; those show their kind's icon. */
const iconOf = (n: Notice) => (n.icon in Ionicons.glyphMap ? n.icon : KIND[n.kind].icon);

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
        contentContainerStyle={{ paddingBottom: 12 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <StateIcon name="notifications-outline" />
            <Text style={styles.emptyTitle}>Henüz bildirim yok</Text>
            <Text style={styles.dim}>Selamlar, davetler ve ödemeler burada görünür.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [styles.row, !item.read && styles.unread, pressed && styles.pressed]} onPress={() => open(item)}>
            <StateIcon name={iconOf(item)} size={42} tone={KIND[item.kind].tone} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.title, item.read && { fontWeight: '600' }]} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.body} numberOfLines={2}>
                {item.body}
              </Text>
            </View>
            <View style={styles.meta}>
              <Text style={styles.time}>{item.time}</Text>
              {!item.read && <View style={styles.dot} accessibilityLabel="Okunmadı" />}
            </View>
          </Pressable>
        )}
      />
      <Pressable onPress={() => router.push('/ayarlar')} style={styles.prefs} accessibilityRole="button">
        <Ionicons name="options-outline" size={16} color={colors.textDim} />
        <Text style={styles.prefsText}>Bildirim tercihleri</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.card },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textDim, fontWeight: '700', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 12, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 16 },
  unread: { backgroundColor: 'rgba(19,217,223,0.07)' },
  pressed: { backgroundColor: 'rgba(255,255,255,0.05)' },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  body: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  meta: { alignItems: 'flex-end', gap: 8, alignSelf: 'flex-start', paddingTop: 2 },
  time: { color: colors.textDim, fontSize: 12, fontVariant: ['tabular-nums'] },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: semantic.action },
  dim: { color: colors.textDim, fontSize: 13, textAlign: 'center' },
  empty: { alignItems: 'center', gap: 10, marginTop: 80, paddingHorizontal: 32 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  prefs: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14 },
  prefsText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
});
