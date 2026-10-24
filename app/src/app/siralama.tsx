import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Header } from '@/components/ui';
import { LEADERBOARDS } from '@/data/economy';
import { ROOMS, type User } from '@/data/mock';
import { colors } from '@/theme';

type Board = 'zengin' | 'yayinci' | 'oda';
const BOARDS: { key: Board; label: string; unit: string }[] = [
  { key: 'zengin', label: '💰 Zenginler', unit: '🪙' },
  { key: 'yayinci', label: '🎙️ Yayıncılar', unit: '💎' },
  { key: 'oda', label: '🔥 Odalar', unit: '👥' },
];

type Row = { id: string; name: string; avatar: string; score: number; user?: User; roomId?: string };

export default function Leaderboard() {
  const [board, setBoard] = useState<Board>('zengin');
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily');
  const unit = BOARDS.find((b) => b.key === board)!.unit;

  const rows: Row[] =
    board === 'oda'
      ? [...ROOMS]
          .sort((a, b) => b.listeners - a.listeners)
          .map((r) => ({ id: r.id, name: r.title, avatar: r.cover, score: r.listeners * (period === 'weekly' ? 23 : 1), roomId: r.id }))
      : LEADERBOARDS[board][period].map((r) => ({ id: r.user.id, name: r.user.name, avatar: r.user.avatar, score: r.score, user: r.user }));

  const open = (r: Row) => (r.roomId ? router.push(`/oda/${r.roomId}`) : router.push(`/kullanici/${r.id}`));
  const [first, second, third] = rows;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Sıralama" />
      <View style={styles.tabs}>
        {BOARDS.map((b) => (
          <Pressable key={b.key} onPress={() => setBoard(b.key)} style={[styles.tab, board === b.key && styles.tabActive]}>
            <Text style={[styles.tabText, board === b.key && { color: '#fff' }]}>{b.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.periods}>
        {(['daily', 'weekly'] as const).map((p) => (
          <Pressable key={p} onPress={() => setPeriod(p)}>
            <Text style={[styles.period, period === p && styles.periodActive]}>{p === 'daily' ? 'Günlük' : 'Haftalık'}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={rows.slice(3)}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 8 }}
        ListHeaderComponent={
          <LinearGradient colors={['#2B1259', colors.bg]} style={styles.podium}>
            {second && <Podium row={second} place={2} unit={unit} onPress={() => open(second)} />}
            {first && <Podium row={first} place={1} unit={unit} onPress={() => open(first)} />}
            {third && <Podium row={third} place={3} unit={unit} onPress={() => open(third)} />}
          </LinearGradient>
        }
        renderItem={({ item, index }) => (
          <Pressable style={styles.row} onPress={() => open(item)}>
            <Text style={styles.rank}>{index + 4}</Text>
            {item.roomId ? <Image source={{ uri: item.avatar }} style={{ width: 40, height: 40, borderRadius: 10 }} /> : <Avatar uri={item.avatar} size={40} />}
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.score}>
              {unit} {item.score.toLocaleString('tr-TR')}
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const MEDAL = { 1: { emoji: '🥇', color: '#FBBF24', size: 84 }, 2: { emoji: '🥈', color: '#CBD5E1', size: 68 }, 3: { emoji: '🥉', color: '#F59E0B', size: 68 } } as const;

function Podium({ row, place, unit, onPress }: { row: Row; place: 1 | 2 | 3; unit: string; onPress: () => void }) {
  const m = MEDAL[place];
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', flex: 1, gap: 4, marginTop: place === 1 ? 0 : 28 }}>
      <Text style={{ fontSize: 26 }}>{m.emoji}</Text>
      <Image source={{ uri: row.avatar }} style={{ width: m.size, height: m.size, borderRadius: m.size / 2, borderWidth: 3, borderColor: m.color }} />
      <Text style={styles.podiumName} numberOfLines={1}>
        {row.name}
      </Text>
      <Text style={[styles.score, { fontSize: 12 }]}>
        {unit} {row.score.toLocaleString('tr-TR')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.card, alignItems: 'center' },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  periods: { flexDirection: 'row', justifyContent: 'center', gap: 24, paddingVertical: 12 },
  period: { color: colors.textDim, fontWeight: '600' },
  periodActive: { color: '#fff', textDecorationLine: 'underline' },
  podium: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 20, paddingVertical: 18, paddingHorizontal: 8, marginBottom: 8 },
  podiumName: { color: '#fff', fontWeight: '700', maxWidth: 100 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 10 },
  rank: { color: colors.textDim, fontWeight: '800', width: 22, textAlign: 'center' },
  name: { color: '#fff', fontWeight: '600', flex: 1 },
  score: { color: colors.gold, fontWeight: '700' },
});
