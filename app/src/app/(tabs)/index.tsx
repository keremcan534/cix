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
  const { coins } = useApp();
  const [cat, setCat] = useState<Category>('Popüler');
  const rooms = cat === 'Popüler' ? [...ROOMS].sort((a, b) => b.listeners - a.listeners) : ROOMS.filter((r) => r.category === cat);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.logo}>Vibe Club</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <CoinPill coins={coins} onPress={() => router.push('/cuzdan')} />
          <Ionicons name="search" size={22} color={colors.text} />
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
            <Text style={styles.section}>Şu an çevrimiçi</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 16 }}>
              {USERS.filter((u) => u.online).map((u) => (
                <Pressable key={u.id} style={{ alignItems: 'center', gap: 4 }} onPress={() => router.push(`/sohbet/${u.id}`)}>
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
  fab: { position: 'absolute', right: 20, bottom: 20 },
  fabInner: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
