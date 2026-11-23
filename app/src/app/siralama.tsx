import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Art, type ArtName } from '@/components/Art';
import { Icon3D } from '@/components/Icon3D';
import { Avatar } from '@/components/ui';
import { LEADERBOARDS } from '@/data/economy';
import { AGENCIES } from '@/data/agency';
import { ROOMS, USERS, type User } from '@/data/mock';
import { makeStyles } from '@/theme';
import { goBack } from '@/lib/nav';
import { Photo } from '@/components/photo';
import { periodLabel } from '@/lib/tr';
import { agencyRankings, rankings, roomXpRankings, type AgencyRankingRow, type RankingRow, type RoomXpRow } from '@/lib/api';
import { liveMode, rememberUser, roomOf, toLocal, useServerRooms } from '@/lib/live';
import { userById } from '@/data/mock';
import { BrandLoader } from '@/components/fx/brand-loader';
import { compact } from '@/lib/compact';

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
    // The owners' neon Sıralama (23 Nov 2026): a deep violet night with neon rims, in either colour scheme
    // (components/fx/dark-routes keeps the screen dark).
    <SafeAreaView style={{ flex: 1, backgroundColor: NIGHT[1] }}>
      <LinearGradient colors={NIGHT} style={StyleSheet_fill} pointerEvents="none" />
      {/* The design's neon horizon: a pink and a blue arc rising at the bottom. */}
      <View style={styles.horizon} pointerEvents="none" />
      <View style={[styles.horizon, styles.horizon2]} pointerEvents="none" />

      <View style={styles.head}>
        <Pressable onPress={() => goBack()} hitSlop={10} style={styles.back} accessibilityRole="button" accessibilityLabel="Geri">
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </Pressable>
        <View style={styles.titleRow} pointerEvents="none">
          <LinearGradient colors={['rgba(150,110,255,0)', 'rgba(150,110,255,0.7)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.titleLine} />
          <Image source={LAUREL} style={styles.laurel} resizeMode="contain" />
          <Text style={styles.title} accessibilityRole="header">
            Sıralama
          </Text>
          <Image source={LAUREL} style={[styles.laurel, { transform: [{ scaleX: -1 }] }]} resizeMode="contain" />
          <LinearGradient colors={['rgba(150,110,255,0.7)', 'rgba(150,110,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.titleLine} />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={styles.tabs}>
        {boards.map((b) => {
          const on = board === b.key;
          return (
            <Pressable key={b.key} onPress={() => setBoard(b.key)} style={[styles.tab, on && styles.tabActive]} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={b.label}>
              {on && <LinearGradient colors={['#E0249E', '#A3127A']} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={[StyleSheet_fill, { borderRadius: 999 }]} />}
              {b.art && <Art name={b.art} size={20} />}
              <Text style={styles.tabText}>{b.art ? b.label : `${b.emoji} ${b.label}`}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.periods}>
        {PERIOD_KEYS.map((p) => {
          const on = period === p;
          return (
            <Pressable key={p} onPress={() => setPeriod(p)} hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }} style={styles.periodItem} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Text style={[styles.period, on && styles.periodActive]}>{p === 'daily' ? 'Günlük' : p === 'weekly' ? 'Haftalık' : 'Aylık'}</Text>
              <View style={[styles.periodBar, on && styles.periodBarOn]} />
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.how}>
        {periodLabel(period)} · Ölçüt: {info.how} · İade edilen hediyeler ve sahte etkileşimler hariç
      </Text>

      <FlatList
        data={rows.slice(3)}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 8 }}
        ListHeaderComponent={
          <LinearGradient colors={RIM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rim}>
            <LinearGradient colors={['#1F1050', '#140A36', '#1C0B40']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.podium}>
              {/* The design's neon wings behind the podium, and its stage under the first place. */}
              <Wing side="left" />
              <Wing side="right" />
              <View style={styles.stage} pointerEvents="none">
                <View style={styles.stageOuter} />
                <View style={styles.stageInner} />
              </View>
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

/** The screen's night, top to bottom, and the podium card's neon rim (pink, violet, blue). */
const NIGHT = ['#1D0B45', '#140A34', '#170A3A', '#2A0B4A'] as const;
const RIM = ['#FF4FD8', '#B44CFF', '#5B6CFF', '#22D3FF'] as const;
const GOLD = '#FFD56A';
/** The gold laurel (assets/banners/podyum); the title's pair is tinted violet, as in the design. */
const LAUREL = require('../../assets/banners/podyum/defne-sol.webp');
const StyleSheet_fill = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const;

/** One neon wing: thin feathers fanning out from the podium's side, blue to violet on the left, violet to pink on the right. */
function Wing({ side }: { side: 'left' | 'right' }) {
  const styles = useStyles();
  const colors = side === 'left' ? (['rgba(40,200,255,0.0)', 'rgba(40,200,255,0.75)', 'rgba(170,90,255,0.6)'] as const) : (['rgba(255,70,210,0.0)', 'rgba(255,70,210,0.75)', 'rgba(170,90,255,0.6)'] as const);
  return (
    <View style={[styles.wing, side === 'left' ? { left: 6 } : { right: 6, transform: [{ scaleX: -1 }] }]} pointerEvents="none">
      {[0, 1, 2, 3, 4].map((k) => (
        <LinearGradient key={k} colors={colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[styles.feather, { width: 74 - k * 9, top: 8 + k * 13, transform: [{ rotate: `${-26 + k * 11}deg` }], opacity: 0.85 - k * 0.1 }]} />
      ))}
    </View>
  );
}

const MEDAL = {
  1: { art: 'derece-1', color: '#FFC24A', glow: 'rgba(255,190,60,0.85)', size: 92 },
  2: { art: 'derece-2', color: '#CFD8F0', glow: 'rgba(200,215,255,0.6)', size: 62 },
  3: { art: 'derece-3', color: '#E8935A', glow: 'rgba(232,147,90,0.6)', size: 62 },
} as const satisfies Record<1 | 2 | 3, { art: ArtName; color: string; glow: string; size: number }>;

/** A board's number with its unit drawn as an icon (coins, diamonds, people) or as an XP suffix. */
function Score({ unit, n, small }: { unit: Unit; n: number; small?: boolean }) {
  const styles = useStyles();
  const size = small ? 14 : 16;
  return (
    <View style={styles.scoreRow}>
      {unit === 'coin' && <Icon3D name="coin" size={size} />}
      {unit === 'diamond' && <Icon3D name="diamond" size={size} />}
      {unit === 'people' && <Ionicons name="people" size={size - 2} color="rgba(255,255,255,0.7)" />}
      <Text style={[styles.score, small && { fontSize: 13 }]}>
        {compact(n)}
        {unit === 'xp' ? ' XP' : ''}
      </Text>
    </View>
  );
}

function Podium({ row, place, unit, onPress }: { row: Row; place: 1 | 2 | 3; unit: Unit; onPress: () => void }) {
  const styles = useStyles();
  const m = MEDAL[place];
  const first = place === 1;
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', flex: first ? 1.3 : 1, gap: 4, marginTop: first ? 0 : 34 }} accessibilityRole="button" accessibilityLabel={`${place}. ${row.name}`}>
      <Art name={m.art} size={first ? 38 : 28} />
      <View style={[styles.faceRing, { borderColor: m.color, boxShadow: `0 0 14px ${m.glow}`, borderRadius: m.size / 2 + 4 }]}>
        <Photo uri={row.avatar} kind="face" style={{ width: m.size, height: m.size, borderRadius: m.size / 2 }} />
      </View>
      <Text style={[styles.podiumName, first && styles.podiumNameFirst]} numberOfLines={1}>
        {row.name}
      </Text>
      {first ? (
        // The first place's score on a gold-rimmed plate between two laurels, as in the design.
        <View style={styles.plateRow}>
          <Image source={LAUREL} style={styles.plateLaurel} resizeMode="contain" />
          <View style={styles.plate}>
            <Score unit={unit} n={row.score} />
          </View>
          <Image source={LAUREL} style={[styles.plateLaurel, { transform: [{ scaleX: -1 }] }]} resizeMode="contain" />
        </View>
      ) : (
        <Score unit={unit} n={row.score} small />
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(() => ({
  horizon: { position: 'absolute', alignSelf: 'center', bottom: -330, width: 760, height: 420, borderRadius: 380, borderTopWidth: 2, borderColor: 'rgba(255,70,210,0.75)', boxShadow: '0 -6px 24px rgba(255,60,210,0.45)' },
  horizon2: { bottom: -350, width: 820, borderColor: 'rgba(40,200,255,0.55)', boxShadow: '0 -6px 24px rgba(40,180,255,0.35)' },
  head: { height: 56, justifyContent: 'center' },
  back: { position: 'absolute', left: 8, zIndex: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 56 },
  titleLine: { flex: 1, height: 1.5, maxWidth: 70 },
  laurel: { width: 14, height: 38, tintColor: '#B48CFF' },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', textShadowColor: 'rgba(200,120,255,0.8)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
  tabs: { gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  tab: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, height: 40, paddingHorizontal: 14, borderRadius: 999, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(110,170,255,0.85)', backgroundColor: 'rgba(22,14,56,0.9)', boxShadow: '0 0 8px rgba(90,140,255,0.45)' },
  tabActive: { borderColor: '#FF7ADF', boxShadow: '0 0 12px rgba(255,60,210,0.75)' },
  tabText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  periods: { flexShrink: 0, flexDirection: 'row', justifyContent: 'center', gap: 30, paddingTop: 10, marginHorizontal: 40, borderBottomWidth: 1, borderBottomColor: 'rgba(180,150,255,0.25)' },
  periodItem: { alignItems: 'center', gap: 6 },
  period: { color: 'rgba(255,255,255,0.85)', fontWeight: '600', fontSize: 17 },
  periodActive: { color: '#fff', fontWeight: '800' },
  periodBar: { height: 3, alignSelf: 'stretch', marginHorizontal: -10, borderRadius: 2, backgroundColor: 'transparent' },
  periodBarOn: { backgroundColor: '#FF4FD8', boxShadow: '0 0 8px rgba(255,60,210,0.9)' },
  how: { color: '#C9B8F0', fontSize: 12.5, lineHeight: 17, textAlign: 'center', paddingHorizontal: 18, marginTop: 10, marginBottom: 12 },
  rim: { borderRadius: 24, padding: 1.5, marginBottom: 12, boxShadow: '0 0 16px rgba(255,60,210,0.4), 0 0 24px rgba(60,140,255,0.3)' },
  podium: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 22.5, overflow: 'hidden', paddingTop: 16, paddingBottom: 30, paddingHorizontal: 8, minHeight: 230 },
  wing: { position: 'absolute', top: 40, width: 90, height: 90 },
  feather: { position: 'absolute', left: 0, height: 3, borderRadius: 2 },
  stage: { position: 'absolute', left: 0, right: 0, bottom: -20, height: 40, alignItems: 'center', justifyContent: 'center' },
  stageOuter: { position: 'absolute', width: '78%', height: 30, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(120,110,255,0.85)', boxShadow: '0 0 12px rgba(90,120,255,0.7)' },
  stageInner: { position: 'absolute', width: '52%', height: 18, top: 6, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(255,80,216,0.95)', boxShadow: '0 0 12px rgba(255,60,210,0.8)' },
  faceRing: { padding: 3, borderWidth: 3 },
  podiumName: { color: '#fff', fontWeight: '800', fontSize: 14, maxWidth: 110 },
  podiumNameFirst: { fontSize: 18, maxWidth: 150 },
  plateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  plateLaurel: { width: 12, height: 32 },
  plate: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 10, borderWidth: 1.5, borderColor: GOLD, backgroundColor: 'rgba(255,200,80,0.08)', boxShadow: '0 0 8px rgba(255,200,80,0.45)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(32,20,74,0.94)', borderRadius: 16, padding: 10, borderWidth: 1, borderColor: 'rgba(170,140,255,0.3)' },
  rank: { color: '#fff', fontWeight: '900', width: 22, textAlign: 'center' },
  name: { color: '#fff', fontWeight: '700', flex: 1 },
  score: { color: GOLD, fontWeight: '800', fontSize: 15 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
}));
