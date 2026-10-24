import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, CoinPill } from '@/components/ui';
import { CATEGORIES, ROOMS, USERS, userById, type Category, type Room } from '@/data/mock';
import { useApp } from '@/store';
import { colors, gradient } from '@/theme';

export default function RoomsScreen() {
  const { coins, checkedInToday, notifications, following, recentRooms, blocked, me } = useApp();
  // Personalized suggestions with an explanation; blocked hosts and private rooms are excluded.
  const suggestions = ROOMS.filter((r) => !r.password && !blocked.has(r.hostId))
    .map((r) => {
      const reason = following.has(r.hostId)
        ? `Takip ettiğin ${userById(r.hostId).name} burada`
        : recentRooms.includes(r.id)
          ? 'Son ziyaret ettiğin oda'
          : me.interests?.some((i) => i.includes(r.category) || r.tags.some((t) => i.includes(t)))
            ? `İlgi alanın: ${r.category}`
            : r.listeners > 300
              ? 'Şu an çok hareketli'
              : '';
      const score = (following.has(r.hostId) ? 3 : 0) + (recentRooms.includes(r.id) ? 2 : 0) + (reason.startsWith('İlgi') ? 1 : 0) + r.listeners / 1000;
      return { r, reason, score };
    })
    .filter((x) => x.reason)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const unreadNotices = notifications.filter((n) => !n.read).length;
  const [cat, setCat] = useState<Category>('Popüler');
  const rooms = cat === 'Popüler' ? [...ROOMS].sort((a, b) => b.listeners - a.listeners) : ROOMS.filter((r) => r.category === cat);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.logo}>Vibe Club</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <CoinPill coins={coins} onPress={() => router.push('/cuzdan')} />
          <Pressable onPress={() => router.push('/siralama')} hitSlop={6}>
            <Ionicons name="trophy" size={22} color={colors.gold} />
          </Pressable>
          <Pressable onPress={() => router.push('/bildirimler')} hitSlop={6} accessibilityLabel="Bildirimler">
            <Ionicons name="notifications" size={22} color={colors.text} />
            {unreadNotices > 0 && <View style={styles.dot} />}
          </Pressable>
          <Pressable onPress={() => router.push('/gorevler')} hitSlop={6}>
            <Ionicons name="gift" size={22} color={colors.pink} />
            {!checkedInToday && <View style={styles.dot} />}
          </Pressable>
        </View>
      </View>

      <FlatList
        data={rooms}
        keyExtractor={(r) => r.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
        contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16 }}>
              <Pressable style={{ flex: 1 }} onPress={() => router.push('/eslesme')}>
                <LinearGradient colors={['#8B5CF6', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.promo}>
                  <Text style={{ fontSize: 26 }}>⚡</Text>
                  <Text style={styles.promoTitle}>Rastgele Eşleş</Text>
                  <Text style={styles.promoSub}>Görüntülü / sesli</Text>
                </LinearGradient>
              </Pressable>
              <Pressable style={{ flex: 1 }} onPress={() => router.push('/cark')}>
                <LinearGradient colors={['#F59E0B', '#EF4444']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.promo}>
                  <Text style={{ fontSize: 26 }}>🎰</Text>
                  <Text style={styles.promoTitle}>Şans Çarkı</Text>
                  <Text style={styles.promoSub}>2.000 jetona kadar</Text>
                </LinearGradient>
              </Pressable>
            </View>
            {suggestions.length > 0 && (
              <>
                <Text style={styles.section}>✨ Senin için</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
                  {suggestions.map(({ r, reason }) => (
                    <Pressable key={r.id} style={styles.suggest} onPress={() => router.push(`/oda/${r.id}`)}>
                      <Image source={{ uri: r.cover }} style={styles.suggestImg} />
                      <Text style={styles.suggestTitle} numberOfLines={1}>
                        {r.title}
                      </Text>
                      <Text style={styles.suggestWhy} numberOfLines={1}>
                        💡 {reason}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            <Pressable style={styles.gamesRow} onPress={() => router.push('/oyunlar')}>
              <Text style={{ fontSize: 22 }}>🎮</Text>
              <Text style={{ color: '#fff', fontWeight: '700', flex: 1 }}>Oyun merkezi</Text>
              <Text style={{ color: colors.textDim, fontSize: 12 }}>VIP 2 ile oyna →</Text>
            </Pressable>
            <Text style={styles.section}>Şu an çevrimiçi</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 16 }}>
              {USERS.filter((u) => u.online).map((u) => (
                <Pressable key={u.id} style={{ alignItems: 'center', gap: 4 }} onPress={() => router.push(`/kullanici/${u.id}`)}>
                  <Avatar uri={u.avatar} size={56} ring online />
                  <Text style={styles.storyName}>{u.name}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
              {CATEGORIES.map((c) => (
                <Pressable key={c} onPress={() => setCat(c)}>
                  {c === cat ? (
                    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.chip}>
                      <Text style={[styles.chipText, { color: '#fff' }]}>{c}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.chip, { backgroundColor: colors.card }]}>
                      <Text style={styles.chipText}>{c}</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        }
        renderItem={({ item }) => <RoomCard room={item} />}
      />

      <Pressable style={styles.fab} onPress={() => router.push("/oda/yeni")}>
        <LinearGradient colors={gradient} style={styles.fabInner}>
          <Ionicons name="add" size={28} color="#fff" />
        </LinearGradient>
      </Pressable>
    </SafeAreaView>
  );
}

function RoomCard({ room }: { room: Room }) {
  const host = userById(room.hostId);
  const seated = room.seatUserIds.filter(Boolean) as string[];
  return (
    <Pressable style={styles.card} onPress={() => router.push(`/oda/${room.id}`)}>
      <Image source={{ uri: room.cover }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['transparent', 'rgba(18,11,36,0.95)']} style={StyleSheet.absoluteFill} />
      <View style={styles.liveBadge}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>{room.listeners}</Text>
      </View>
      <View style={{ flex: 1, justifyContent: 'flex-end', padding: 10, gap: 6 }}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {room.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {seated.slice(0, 4).map((id, i) => (
            <View key={id} style={{ marginLeft: i ? -8 : 0 }}>
              <Avatar uri={userById(id).avatar} size={22} />
            </View>
          ))}
          <Text style={styles.hostName} numberOfLines={1}>
            {host.name}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  logo: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  section: { color: colors.text, fontSize: 16, fontWeight: '700', paddingHorizontal: 16 },
  storyName: { color: colors.textDim, fontSize: 12 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  chipText: { color: colors.textDim, fontWeight: '600' },
  card: { flex: 1, height: 200, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.card },
  liveBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  liveText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cardTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  hostName: { color: colors.textDim, fontSize: 12, marginLeft: 6, flex: 1 },
  suggest: { width: 150, gap: 4 },
  suggestImg: { width: 150, height: 90, borderRadius: 12, backgroundColor: colors.card },
  suggestTitle: { color: '#fff', fontWeight: '700', fontSize: 13 },
  suggestWhy: { color: colors.textDim, fontSize: 11 },
  gamesRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  dot: { position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
  promo: { borderRadius: 16, padding: 14, gap: 2, height: 96 },
  promoTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  promoSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11 },
  fab: { position: 'absolute', right: 20, bottom: 20 },
  fabInner: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
