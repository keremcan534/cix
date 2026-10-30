import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Art, type ArtName } from '@/components/Art';
import { Avatar, Header } from '@/components/ui';
import { LEADERBOARDS } from '@/data/economy';
import { AGENCIES } from '@/data/agency';
import { ROOMS, USERS, type User } from '@/data/mock';
import { colors } from '@/theme';

type Board = 'zengin' | 'yayinci' | 'oda' | 'ajans' | 'odaxp';
const BOARDS: { key: Board; label: string; emoji: string; art?: ArtName; unit: string; how: string }[] = [
  { key: 'zengin', label: 'Zenginler', emoji: '💰', art: 'siralama-zenginler', unit: '🪙', how: 'Geçerli hediye harcaması' },
  { key: 'yayinci', label: 'Yayıncılar', emoji: '🎙️', art: 'siralama-yayincilar', unit: '💎', how: 'Alınan geçerli hediyeler (elmas)' },
  { key: 'oda', label: 'Odalar', emoji: '🔥', art: 'siralama-odalar', unit: '👥', how: 'Tekil katılımcı' },
  { key: 'ajans', label: 'Ajanslar', emoji: '🏢', art: 'siralama-ajanslar', unit: '💎', how: 'Ajans yayıncılarının toplam geçerli kazancı' },
  { key: 'odaxp', label: 'Oda XP', emoji: '⭐', art: 'siralama-oda-xp', unit: 'XP', how: 'Doğrulanmış oda deneyim puanı' },
];
const PERIOD_RANGE = { daily: '24 Ekim 2026', weekly: '19–25 Ekim 2026', monthly: '1–31 Ekim 2026' } as const;

type Row = { id: string; name: string; avatar: string; score: number; user?: User; roomId?: string };

export default function Leaderboard() {
  const [board, setBoard] = useState<Board>('zengin');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const info = BOARDS.find((b) => b.key === board)!;
  const unit = info.unit;
  const mult = period === 'monthly' ? 4 : 1;

  const rows: Row[] =
    board === 'oda'
      ? [...ROOMS]
          .sort((a, b) => b.listeners - a.listeners)
          .map((r) => ({ id: r.id, name: r.title, avatar: r.cover, score: r.listeners * (period === 'daily' ? 1 : 23) * mult, roomId: r.id }))
      : board === 'odaxp'
        ? [...ROOMS]
            .sort((a, b) => (b.level ?? 1) - (a.level ?? 1))
            .map((r) => ({ id: r.id, name: `${r.title} · LV${r.level ?? 1}`, avatar: r.cover, score: (r.level ?? 1) * 1_750 * mult, roomId: r.id }))
        : board === 'ajans'
          ? AGENCIES.filter((a) => a.status === 'active').map((a, i) => ({ id: a.id, name: `${a.logo} ${a.name}`, avatar: USERS[i].avatar, score: (a.hosts * 9_100 + i * 311) * mult * (period === 'daily' ? 1 : 6) }))
          : LEADERBOARDS[board][period === 'monthly' ? 'weekly' : period].map((r) => ({ id: r.user.id, name: r.user.name, avatar: r.user.avatar, score: r.score * mult, user: r.user }));

  const open = (r: Row) => (r.roomId ? router.push(`/oda/${r.roomId}`) : r.user ? router.push(`/kullanici/${r.id}`) : undefined);
  const [first, second, third] = rows;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Sıralama" />
      <View style={styles.tabs}>
        {BOARDS.map((b) => (
          <Pressable key={b.key} onPress={() => setBoard(b.key)} style={[styles.tab, board === b.key && styles.tabActive]} accessibilityLabel={b.label}>
            {b.art && <Art name={b.art} size={17} />}
            <Text style={[styles.tabText, board === b.key && { color: '#fff' }]}>{b.art ? b.label : `${b.emoji} ${b.label}`}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.periods}>
        {(['daily', 'weekly', 'monthly'] as const).map((p) => (
          <Pressable key={p} onPress={() => setPeriod(p)}>
            <Text style={[styles.period, period === p && styles.periodActive]}>{p === 'daily' ? 'Günlük' : p === 'weekly' ? 'Haftalık' : 'Aylık'}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.how}>
        {PERIOD_RANGE[period]} · Ölçüt: {info.how} · İade edilen hediyeler ve sahte etkileşimler hariç
      </Text>

      <FlatList
        data={rows.slice(3)}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 8 }}
        ListHeaderComponent={
          <LinearGradient colors={['#0B3B4A', colors.bg]} style={styles.podium}>
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

const MEDAL = {
  1: { emoji: '🥇', art: 'derece-1', color: '#FBBF24', size: 84 },
  2: { emoji: '🥈', art: 'derece-2', color: '#CBD5E1', size: 68 },
  3: { emoji: '🥉', art: 'derece-3', color: '#F59E0B', size: 68 },
} as const satisfies Record<1 | 2 | 3, { emoji: string; art: ArtName; color: string; size: number }>;

function Podium({ row, place, unit, onPress }: { row: Row; place: 1 | 2 | 3; unit: string; onPress: () => void }) {
  const m = MEDAL[place];
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', flex: 1, gap: 4, marginTop: place === 1 ? 0 : 28 }}>
      <Art name={m.art} size={33} />
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
  how: { color: colors.textDim, fontSize: 12, textAlign: 'center', paddingHorizontal: 16, marginBottom: 8 },
  tabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, flexWrap: 'wrap' },
  tab: { flexGrow: 1, flexDirection: 'row', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.card, alignItems: 'center' },
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
