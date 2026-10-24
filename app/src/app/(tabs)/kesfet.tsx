import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton, VerifiedBadge, VipBadge } from '@/components/ui';
import { USERS, type User } from '@/data/mock';
import { useApp } from '@/store';
import { colors } from '@/theme';

const TABS = ['Yakındakiler', 'Tüm Türkiye', 'Yeni'] as const;

export default function DiscoverScreen() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Yakındakiler');
  const { blocked, settings, setSetting } = useApp();
  // Nearby discovery only with the user's opt-in; blocked users never show up (spec §8.3, PRIV-01).
  const needsOptIn = tab === 'Yakındakiler' && !settings.cityDiscovery;

  const list = (
    tab === 'Yakındakiler'
      ? USERS.filter((u) => u.distanceKm < 20).sort((a, b) => a.distanceKm - b.distanceKm)
      : tab === 'Yeni'
        ? [...USERS].reverse()
        : USERS
  ).filter((u) => !blocked.has(u.id));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.matchBtn} onPress={() => router.push('/eslesme')}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>⚡ Eşleş</Text>
        </Pressable>
        {TABS.map((t) => (
          <Pressable key={t} onPress={() => setTab(t)}>
            <Text style={[styles.tab, t === tab && styles.tabActive]}>{t}</Text>
            {t === tab && <View style={styles.underline} />}
          </Pressable>
        ))}
      </View>
      {needsOptIn && (
        <View style={styles.optIn}>
          <Text style={{ fontSize: 40 }}>📍</Text>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, textAlign: 'center' }}>Yakındakileri görmek için şehir bazlı keşfi aç</Text>
          <Text style={{ color: colors.textDim, textAlign: 'center', fontSize: 13 }}>Kesin konumun paylaşılmaz; sadece şehrin kullanılır. Ayarlardan istediğin zaman kapatabilirsin.</Text>
          <Pressable style={styles.optInBtn} onPress={() => setSetting('cityDiscovery', true)}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>Şehir bazlı keşfi aç</Text>
          </Pressable>
          <Pressable onPress={() => setTab('Tüm Türkiye')}>
            <Text style={{ color: colors.textDim }}>Şimdilik tüm Türkiye&apos;yi göster</Text>
          </Pressable>
        </View>
      )}
      <FlatList
        style={needsOptIn ? { display: 'none' } : undefined}
        data={list}
        keyExtractor={(u) => u.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
        contentContainerStyle={{ gap: 12, paddingVertical: 8, paddingBottom: 24 }}
        renderItem={({ item }) => <PersonCard user={item} />}
      />
    </SafeAreaView>
  );
}

function PersonCard({ user }: { user: User }) {
  const { sendMessage, following, toggleFollow, bump } = useApp();
  const [greeted, setGreeted] = useState(false);
  const isFollowing = following.has(user.id);

  return (
    <View style={styles.card}>
      <Pressable onPress={() => router.push(`/kullanici/${user.id}`)}>
        <Image source={{ uri: user.avatar }} style={styles.photo} />
        <LinearGradient colors={['transparent', 'rgba(18,11,36,0.9)']} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} />
        <Pressable style={styles.follow} onPress={() => toggleFollow(user.id)} hitSlop={8}>
          <Ionicons name={isFollowing ? 'heart' : 'heart-outline'} size={18} color={isFollowing ? colors.pink : '#fff'} />
        </Pressable>
        <View style={styles.info}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {user.online && <View style={styles.dot} />}
            <Text style={styles.name}>
              {user.name}, {user.age}
            </Text>
            {user.verified && <VerifiedBadge />}
            {user.vip && <VipBadge />}
          </View>
          <Text style={styles.meta}>
            <Ionicons name="location" size={11} color={colors.textDim} /> {user.city} · {user.distanceKm} km
          </Text>
        </View>
      </Pressable>
      <Text style={styles.bio} numberOfLines={1}>
        {user.bio}
      </Text>
      <GradientButton
        small
        title={greeted ? 'Selam verildi' : 'Selam ver 👋'}
        onPress={() => {
          if (greeted) return router.push(`/sohbet/${user.id}`);
          sendMessage(user.id, 'Selam! 👋');
          bump('greetings');
          setGreeted(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: 18, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'flex-start' },
  optIn: { alignItems: 'center', gap: 10, padding: 24, marginTop: 30 },
  optInBtn: { backgroundColor: colors.pink, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12 },
  matchBtn: { position: 'absolute', right: 16, top: 12, backgroundColor: colors.pink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, zIndex: 1 },
  tab: { color: colors.textDim, fontSize: 16, fontWeight: '600' },
  tabActive: { color: '#fff', fontSize: 18, fontWeight: '800' },
  underline: { height: 3, borderRadius: 2, backgroundColor: colors.pink, marginTop: 4, width: 20 },
  card: { flex: 1, backgroundColor: colors.card, borderRadius: 18, padding: 8, gap: 8 },
  photo: { width: '100%', aspectRatio: 0.85, borderRadius: 16, backgroundColor: colors.cardAlt },
  follow: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 999, padding: 6 },
  info: { position: 'absolute', left: 8, bottom: 8, right: 8, gap: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  name: { color: '#fff', fontWeight: '700', fontSize: 15 },
  meta: { color: colors.textDim, fontSize: 11 },
  bio: { color: colors.textDim, fontSize: 12, paddingHorizontal: 2 },
});
