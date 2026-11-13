import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Art, type ArtName } from '@/components/Art';
import { Icon3D } from '@/components/Icon3D';
import { Avatar, Header } from '@/components/ui';
import { LEADERBOARDS } from '@/data/economy';
import { AGENCIES } from '@/data/agency';
import { ROOMS, USERS, type User } from '@/data/mock';
import { makeStyles, useTheme } from '@/theme';
import { Photo } from '@/components/photo';
import { periodLabel } from '@/lib/tr';
import { agencyRankings, rankings, roomXpRankings, type AgencyRankingRow, type RankingRow, type RoomXpRow } from '@/lib/api';
import { liveMode, rememberUser, roomOf, toLocal, useServerRooms } from '@/lib/live';
import { userById } from '@/data/mock';
import { BrandLoader } from '@/components/fx/brand-loader';

/** Boards the server ranks in a live build: gift totals, agency income, open rooms, and Oda XP (server/api/room-xp.mjs). */
const LIVE_BOARDS: Board[] = ['zengin', 'yayinci', 'ajans', 'oda', 'odaxp'];
type Period = 'daily' | 'weekly' | 'monthly';
const PERIOD_KEYS: Period[] = ['daily', 'weekly', 'monthly'];

type Board = 'zengin' | 'yayinci' | 'oda' | 'ajans' | 'odaxp';
type Unit = 'coin' | 'diamond' | 'people' | 'xp';
const BOARDS: { key: Board; label: string; emoji: string; art?: ArtName; unit: Unit; how: string }[] = [
  { key: 'zengin', label: 'Cömertler', emoji: '💰', art: 'siralama-zenginler', unit: 'coin', how: 'Geçerli hediye harcaması' },
  { key: 'yayinci', label: 'Yayıncılar', emoji: '🎙️', art: 'siralama-yayincilar', unit: 'diamond', how: 'Alınan geçerli hediyeler (elmas)' },
  { key: 'oda', label: 'Odalar', emoji: '🔥', art: 'siralama-odalar', unit: 'people', how: 'Tekil katılımcı' },
  { key: 'ajans', label: 'Ajanslar', emoji: '🏢', art: 'siralama-ajanslar', unit: 'diamond', how: 'Ajans yayıncılarının toplam geçerli kazancı' },
  { key: 'odaxp', label: 'Oda XP', emoji: '⭐', art: 'siralama-oda-xp', unit: 'xp', how: 'Doğrulanmış oda deneyim puanı' },
];

type Row = { id: string; name: string; avatar: string; score: number; user?: User; roomId?: string };

export default function Leaderboard() {
  const { colors, dark } = useTheme();
  const styles = useStyles();
  // An Odalar banner opens its own board and period (?board=ajans&period=weekly).
  const params = useLocalSearchParams<{ board?: string; period?: string }>();
  const [board, setBoard] = useState<Board>(() => BOARDS.find((b) => b.key === params.board)?.key ?? 'zengin');
  const [period, setPeriod] = useState<Period>(() => PERIOD_KEYS.find((p) => p === params.period) ?? 'daily');
  const live = liveMode();
  const boards = live ? BOARDS.filter((b) => LIVE_BOARDS.includes(b.key)) : BOARDS;
  const info = BOARDS.find((b) => b.key === board)!;
  // Live: gift rankings come from the server (null while loading or when it can't be reached).
  const serverRooms = useServerRooms();
  // The answer is kept with the board and period it is for, so a tab change shows "loading" until its own answer.
  const key = `${board}:${period}`;
  const [answer, setAnswer] = useState<{ key: string; rows: (RankingRow | AgencyRankingRow | RoomXpRow)[] | null } | null>(null);
  const serverRows = answer?.key === key ? answer.rows : null;
  const rankError = answer?.key === key && answer.rows === null;
  useEffect(() => {
    if (!live || board === 'oda') return;
    let alive = true;
    const p = period === 'daily' ? 'day' : period === 'weekly' ? 'week' : 'month';
    (board === 'ajans' ? agencyRankings(p) : board === 'odaxp' ? roomXpRankings(p) : rankings(board === 'zengin' ? 'wealth' : 'charm', p))
      .then((rows) => alive && setAnswer({ key: `${board}:${period}`, rows }))
      .catch(() => alive && setAnswer({ key: `${board}:${period}`, rows: null }));
    return () => {
      alive = false;
    };
  }, [live, board, period]);
  const unit = info.unit;
  const mult = period === 'monthly' ? 4 : 1;

  const liveRows = (): Row[] =>
    board === 'oda'
      ? [...serverRooms].sort((a, b) => b.listeners - a.listeners).map((r) => ({ id: r.id, name: r.title, avatar: r.cover, score: r.listeners, roomId: r.id }))
      : (serverRows ?? []).map((r) => {
          if ('agency' in r) return { id: r.agency.id, name: r.agency.name, avatar: r.agency.avatarUrl ?? '', score: r.score };
          if ('room' in r) {
            const room = roomOf(r.room);
            return { id: room.id, name: `${room.title} · LV${room.level ?? 1}`, avatar: room.cover, score: r.score, roomId: room.id };
          }
          rememberUser(r.user);
          const id = toLocal(r.user.id);
          const user = userById(id);
          return { id, name: r.user.name, avatar: user.avatar, score: r.score, user };
        });
  const rows: Row[] = live
    ? liveRows()
    : board === 'oda'
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.tabs}>
        {boards.map((b) => (
          <Pressable key={b.key} onPress={() => setBoard(b.key)} style={[styles.tab, board === b.key && styles.tabActive]} accessibilityLabel={b.label}>
            {b.art && <Art name={b.art} size={17} />}
            <Text style={[styles.tabText, board === b.key && styles.tabTextActive]}>{b.art ? b.label : `${b.emoji} ${b.label}`}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.periods}>
        {PERIOD_KEYS.map((p) => (
          <Pressable key={p} onPress={() => setPeriod(p)}>
            <Text style={[styles.period, period === p && styles.periodActive]}>{p === 'daily' ? 'Günlük' : p === 'weekly' ? 'Haftalık' : 'Aylık'}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.how}>
        {periodLabel(period)} · Ölçüt: {info.how} · İade edilen hediyeler ve sahte etkileşimler hariç
      </Text>

      <FlatList
        data={rows.slice(3)}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 8 }}
        ListHeaderComponent={
          <LinearGradient colors={[dark ? '#4A1630' : '#FADBE8', colors.bg]} style={styles.podium}>
            {second && <Podium row={second} place={2} unit={unit} onPress={() => open(second)} />}
            {first && <Podium row={first} place={1} unit={unit} onPress={() => open(first)} />}
            {third && <Podium row={third} place={3} unit={unit} onPress={() => open(third)} />}
            {!first &&
              (!rankError && live && board !== 'oda' && serverRows === null ? (
                <BrandLoader size={26} style={{ flex: 1, paddingVertical: 22 }} />
              ) : (
                <Text style={[styles.how, { flex: 1, textAlign: 'center', paddingVertical: 28 }]}>
                  {rankError ? 'Sıralama şu an yüklenemedi. Biraz sonra tekrar dene.' : board === 'oda' ? 'Şu an açık oda yok.' : board === 'odaxp' ? 'Bu dönemde henüz XP kazanan oda yok. Odada gönderilen hediyeler odanın XP’si olur.' : 'Bu dönemde henüz kimse yok. İlk hediyeyi sen gönder!'}
                </Text>
              ))}
          </LinearGradient>
        }
        renderItem={({ item, index }) => (
          <Pressable style={styles.row} onPress={() => open(item)}>
            <Text style={styles.rank}>{index + 4}</Text>
            {item.roomId ? <Photo uri={item.avatar} kind="cover" seed={item.roomId} style={{ width: 40, height: 40, borderRadius: 10 }} /> : <Avatar uri={item.avatar} size={40} />}
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Score unit={unit} n={item.score} />
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

/** A board's number with its unit drawn as an icon (coins, diamonds, people) or as an XP suffix. */
function Score({ unit, n, small }: { unit: Unit; n: number; small?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const size = small ? 14 : 16;
  return (
    <View style={styles.scoreRow}>
      {unit === 'coin' && <Icon3D name="coin" size={size} />}
      {unit === 'diamond' && <Icon3D name="diamond" size={size} />}
      {unit === 'people' && <Ionicons name="people" size={size - 2} color={colors.textDim} />}
      <Text style={[styles.score, small && { fontSize: 12 }]}>
        {n.toLocaleString('tr-TR')}
        {unit === 'xp' ? ' XP' : ''}
      </Text>
    </View>
  );
}

function Podium({ row, place, unit, onPress }: { row: Row; place: 1 | 2 | 3; unit: Unit; onPress: () => void }) {
  const styles = useStyles();
  const { dark } = useTheme();
  const m = MEDAL[place];
  // The pale silver ring vanishes on the light podium; a deeper silver there.
  const ring = place === 2 && !dark ? '#94A3B8' : m.color;
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', flex: 1, gap: 4, marginTop: place === 1 ? 0 : 28 }}>
      <Art name={m.art} size={33} />
      <Photo uri={row.avatar} kind="face" style={{ width: m.size, height: m.size, borderRadius: m.size / 2, borderWidth: 3, borderColor: ring }} />
      <Text style={styles.podiumName} numberOfLines={1}>
        {row.name}
      </Text>
      <Score unit={unit} n={row.score} small />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, lift, dark, ink }) => ({
  how: { color: colors.textDim, fontSize: 12, textAlign: 'center', paddingHorizontal: 16, marginBottom: 8 },
  tabs: { gap: 6, paddingHorizontal: 16 },
  // Light: a hairline instead of the card shadow, which the horizontal scroller would clip.
  tab: { flexDirection: 'row', justifyContent: 'center', gap: 4, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.card, alignItems: 'center', ...(dark ? {} : { borderWidth: StyleSheet.hairlineWidth, borderColor: ink(0.12) }) },
  tabActive: { backgroundColor: colors.primary, ...(dark ? {} : { borderColor: colors.primary }) },
  tabText: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  tabTextActive: { color: '#fff' },
  periods: { flexDirection: 'row', justifyContent: 'center', gap: 24, paddingVertical: 12 },
  period: { color: colors.textDim, fontWeight: '600' },
  periodActive: { color: colors.text, textDecorationLine: 'underline' },
  podium: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 20, paddingVertical: 18, paddingHorizontal: 8, marginBottom: 8 },
  podiumName: { color: colors.text, fontWeight: '700', maxWidth: 100 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 10, ...lift },
  rank: { color: colors.textDim, fontWeight: '800', width: 22, textAlign: 'center' },
  name: { color: colors.text, fontWeight: '600', flex: 1 },
  score: { color: colors.gold, fontWeight: '700' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
}));
