import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
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
  const { width } = useWindowDimensions();
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
  const first = rows[0];

  // The podium card as in the design: its frame (wings, glass, stage) is the design's own picture, 830 x 514.
  const cardW = Math.min(width, 520) - 20;
  const cardH = Math.round(cardW / CARD_RATIO);
  const face = Math.round(cardW * 0.247);
  // All five boards fit one row on a usual phone, as in the design: their words follow the screen's width.
  const tabFont = Math.min(13, Math.max(10, (width - 80) / 29));

  return (
    // The owners' neon Sıralama (23 Nov 2026): a deep violet night with neon rims, in either colour scheme
    // (components/fx/dark-routes keeps the screen dark).
    <SafeAreaView style={{ flex: 1, backgroundColor: NIGHT[1] }}>
      <LinearGradient colors={NIGHT} locations={NIGHT_AT} style={FILL} pointerEvents="none" />
      {/* The design's neon horizon at the bottom: its own picture, fading in at its top. */}
      <Image source={HORIZON} style={{ position: 'absolute', left: 0, bottom: 0, width, height: Math.round((width * 368) / 841) }} resizeMode="stretch" pointerEvents="none" />

      <View style={styles.head}>
        <Pressable onPress={() => goBack()} hitSlop={10} style={styles.back} accessibilityRole="button" accessibilityLabel="Geri">
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </Pressable>
        <View style={styles.titleRow} pointerEvents="none">
          <LinearGradient colors={['rgba(120,90,255,0)', 'rgba(120,120,255,0.8)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.titleLine} />
          <Image source={TITLE_LAUREL} style={styles.laurel} resizeMode="contain" />
          <Text style={styles.title} accessibilityRole="header">
            Sıralama
          </Text>
          <Image source={TITLE_LAUREL} style={[styles.laurel, { transform: [{ scaleX: -1 }] }]} resizeMode="contain" />
          <LinearGradient colors={['rgba(120,120,255,0.8)', 'rgba(120,90,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.titleLine} />
        </View>
      </View>

      {/* The five boards in one row, as in the design (a narrow phone scrolls them). */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={styles.tabs}>
        {boards.map((b) => {
          const on = board === b.key;
          return (
            <Pressable key={b.key} onPress={() => setBoard(b.key)} hitSlop={{ top: 5, bottom: 5 }} style={[styles.tab, on && styles.tabActive]} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={b.label}>
              {on && <LinearGradient colors={['#F02AAE', '#B8127F']} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={[FILL, { borderRadius: 999 }]} />}
              {b.art && <Art name={b.art} size={Math.round(tabFont + 5)} />}
              <Text style={[styles.tabText, { fontSize: tabFont }]}>{b.art ? b.label : `${b.emoji} ${b.label}`}</Text>
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
        data={rows.slice(1)}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 40, gap: 8 }}
        ListHeaderComponent={
          <View style={{ width: cardW, height: cardH, alignSelf: 'center', marginBottom: 10 }}>
            <Image source={CARD} style={{ position: 'absolute', left: 0, top: 0, width: cardW, height: cardH }} resizeMode="stretch" accessibilityIgnoresInvertColors />
            {first ? (
              <Pressable onPress={() => open(first)} style={FILL} accessibilityRole="button" accessibilityLabel={`1. ${first.name}, ${compact(first.score)}${unit === 'xp' ? ' XP' : ''}`}>
                {/* The medal, the picture in its gold ring, the name and the score, where the design has them. */}
                <View style={[styles.place, { top: cardH * 0.035 }]}>
                  <Art name="derece-1" size={Math.round(cardW * 0.1)} />
                </View>
                <View style={[styles.place, { top: cardH * 0.4144 - face / 2 - 5 }]}>
                  <View style={[styles.goldRing, { borderRadius: face / 2 + 5 }]}>
                    <Photo uri={first.avatar} kind="face" seed={first.roomId} style={{ width: face, height: face, borderRadius: face / 2 }} />
                  </View>
                </View>
                <View style={[styles.place, { top: cardH * 0.61 }]}>
                  <Text style={styles.firstName} numberOfLines={1}>
                    {first.name}
                  </Text>
                </View>
                <View style={[styles.place, styles.plateRow, { top: cardH * 0.735 }]}>
                  <Image source={GOLD_LAUREL} style={styles.plateLaurel} resizeMode="contain" />
                  <View style={styles.plate}>
                    <Score unit={unit} n={first.score} big />
                  </View>
                  <Image source={GOLD_LAUREL} style={[styles.plateLaurel, { transform: [{ scaleX: -1 }] }]} resizeMode="contain" />
                </View>
              </Pressable>
            ) : (
              <View style={[FILL, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: cardW * 0.22 }]}>
                {!rankError && live && board !== 'oda' && serverRows === null ? (
                  <BrandLoader size={26} />
                ) : (
                  <Text style={[styles.how, { marginTop: 0, marginBottom: 0 }]}>
                    {rankError ? 'Sıralama şu an yüklenemedi. Biraz sonra tekrar dene.' : board === 'oda' ? 'Şu an açık oda yok.' : board === 'odaxp' ? 'Bu dönemde henüz XP kazanan oda yok. Odada gönderilen hediyeler odanın XP’si olur.' : 'Bu dönemde henüz kimse yok. İlk hediyeyi sen gönder!'}
                  </Text>
                )}
              </View>
            )}
          </View>
        }
        renderItem={({ item, index }) => {
          const place = index + 2;
          return (
            <Pressable style={[styles.row, place <= 3 && styles.rowTop]} onPress={() => open(item)} accessibilityRole="button" accessibilityLabel={`${place}. ${item.name}`}>
              {place <= 3 ? <Art name={place === 2 ? 'derece-2' : 'derece-3'} size={26} /> : <Text style={styles.rank}>{place}</Text>}
              {item.roomId ? <Photo uri={item.avatar} kind="cover" seed={item.roomId} style={{ width: 42, height: 42, borderRadius: 12 }} /> : <Avatar uri={item.avatar} size={42} />}
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Score unit={unit} n={item.score} />
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

/** The screen's night, top to bottom (sampled from the design), and where each colour sits. */
const NIGHT = ['#170831', '#100B3B', '#0B0F3C', '#180B38', '#240A48', '#1F0B47'] as const;
const NIGHT_AT = [0, 0.2, 0.5, 0.62, 0.78, 1] as const;
const GOLD = '#FFD56A';
const FILL = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const;
/** The design's own pieces (assets/siralama, cut from the owners' screen, 23 Nov 2026). */
const CARD = require('../../assets/siralama/kart.webp');
const CARD_RATIO = 830 / 514;
const HORIZON = require('../../assets/siralama/ufuk.webp');
const TITLE_LAUREL = require('../../assets/siralama/defne-mor.webp');
const GOLD_LAUREL = require('../../assets/banners/podyum/defne-sol.webp');

/** A board's number with its unit drawn as an icon (coins, diamonds, people) or as an XP suffix. */
function Score({ unit, n, big }: { unit: Unit; n: number; big?: boolean }) {
  const styles = useStyles();
  const size = big ? 20 : 16;
  return (
    <View style={styles.scoreRow}>
      {unit === 'coin' && <Icon3D name="coin" size={size} />}
      {unit === 'diamond' && <Icon3D name="diamond" size={size} />}
      {unit === 'people' && <Ionicons name="people" size={size - 2} color="rgba(255,255,255,0.75)" />}
      <Text style={[styles.score, big && styles.scoreBig]}>
        {compact(n)}
        {unit === 'xp' ? ' XP' : ''}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  head: { height: 58, justifyContent: 'center' },
  back: { position: 'absolute', left: 6, zIndex: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 50 },
  titleLine: { flex: 1, height: 1.5, maxWidth: 80 },
  laurel: { width: 20, height: 29 },
  title: { color: '#fff', fontSize: 27, fontWeight: '900', marginHorizontal: 4, textShadowColor: 'rgba(210,120,255,0.85)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12 },
  tabs: { gap: 3, paddingHorizontal: 4, paddingVertical: 8, flexGrow: 1, justifyContent: 'center' },
  tab: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 2, height: 34, paddingHorizontal: 5, borderRadius: 999, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(100,170,255,0.9)', backgroundColor: 'rgba(18,12,52,0.92)', boxShadow: '0 0 7px rgba(80,140,255,0.5)' },
  tabActive: { borderColor: '#FF8BE3', boxShadow: '0 0 12px rgba(255,60,210,0.85)' },
  tabText: { color: '#fff', fontWeight: '800', letterSpacing: -0.3 },
  periods: { flexShrink: 0, flexDirection: 'row', justifyContent: 'center', gap: 32, paddingTop: 12, marginHorizontal: 70, borderBottomWidth: 1, borderBottomColor: 'rgba(170,150,255,0.35)' },
  periodItem: { alignItems: 'center', gap: 6 },
  period: { color: 'rgba(255,255,255,0.88)', fontWeight: '600', fontSize: 17 },
  periodActive: { color: '#FFE6FA', fontWeight: '800', textShadowColor: 'rgba(255,90,220,0.8)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
  periodBar: { height: 3, alignSelf: 'stretch', marginHorizontal: -8, borderRadius: 2, backgroundColor: 'transparent' },
  periodBarOn: { backgroundColor: '#FF4FD8', boxShadow: '0 0 8px rgba(255,60,210,0.95)' },
  how: { color: '#C2B4F0', fontSize: 12.5, lineHeight: 17, textAlign: 'center', paddingHorizontal: 18, marginTop: 10, marginBottom: 12 },
  place: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  goldRing: { padding: 2, borderWidth: 3, borderColor: '#FFC24A', boxShadow: '0 0 16px rgba(255,180,50,0.9)' },
  firstName: { color: '#fff', fontSize: 21, fontWeight: '800', maxWidth: '70%', textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  plateRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  plateLaurel: { width: 15, height: 40 },
  plate: { paddingHorizontal: 22, paddingVertical: 5, borderRadius: 12, borderWidth: 1.5, borderColor: '#FFC24A', backgroundColor: 'rgba(60,20,60,0.55)', boxShadow: '0 0 10px rgba(255,190,60,0.6)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(28,18,70,0.94)', borderRadius: 16, paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(140,150,255,0.35)' },
  rowTop: { borderColor: 'rgba(255,110,220,0.55)', boxShadow: '0 0 8px rgba(255,60,210,0.3)' },
  rank: { color: '#fff', fontWeight: '900', width: 26, textAlign: 'center', fontSize: 15 },
  name: { color: '#fff', fontWeight: '700', flex: 1, fontSize: 15 },
  score: { color: GOLD, fontWeight: '800', fontSize: 15 },
  scoreBig: { fontSize: 20, fontWeight: '900' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
}));
