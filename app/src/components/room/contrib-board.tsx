// Oda katkı sıralaması: two lists of the room, Cömertlik (who sent the most gift coins in it) and Yankı (who received
// the most), each for this hour, today or this week on Turkey's clock (1 coin = 1 point, lib/room-contrib). The top
// three stand on a podium with their medal, places 4–50 follow, and my own place stays pinned at the bottom. A
// server room's lists come from the server (lib/live/room-contrib); a demo room shows sample people plus this
// visit's gifts. Opened from the room's top bar (trophy, top three) and the room card.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Animated, FlatList, Image, Modal, Platform, Pressable, View, useWindowDimensions } from 'react-native';

import { Text } from '@/components/text';
import { Art, type ArtName } from '@/components/Art';
import { BrandLoader } from '@/components/fx/brand-loader';
import { Icon3D } from '@/components/Icon3D';
import { Photo } from '@/components/photo';
import { CONTRIB_PODIUM, CONTRIB_PODIUM_ART, CONTRIB_WREATH_ART, CONTRIB_WREATH_SCALE } from '@/components/RoomArt';
import { useSheetBottom } from '@/components/room/parts';
import { FramedAvatar } from '@/components/ui';
import { USERS, userById } from '@/data/mock';
import { tapHaptic } from '@/lib/haptics';
import { toServer } from '@/lib/live';
import { lookOf, useLooks } from '@/lib/live/looks';
import { useRoomContrib } from '@/lib/live/room-contrib';
import {
  CONTRIB_PERIODS,
  CONTRIB_SIDES,
  CONTRIB_TOP,
  contribAmount,
  demoBoard,
  emptyNote,
  placeOf,
  podiumLayout,
  pointsRule,
  resetNote,
  totalsBy,
  type ContribPeriod,
  type ContribRow,
  type ContribSide,
  type MyPlace,
  type PodiumPlace,
} from '@/lib/room-contrib';
import { youLabel } from '@/lib/tr';
import { useApp } from '@/store';
import { fonts, makeStyles, radius, space, type, useTheme } from '@/theme';

/** Each list's own color, art and unit: Cömertlik is gold coins given, Yankı coral, counted in diamonds received. */
const SIDE: Record<ContribSide, { accent: string; tint: string; art: ArtName; unit: 'coin' | 'diamond' }> = {
  sent: { accent: '#F6BD60', tint: 'rgba(246,189,96,0.16)', art: 'siralama-zenginler', unit: 'coin' },
  received: { accent: '#FF6576', tint: 'rgba(255,101,118,0.14)', art: 'siralama-yayincilar', unit: 'diamond' },
};
/** Gold, silver and bronze: the medal, the ring, and the light and height of a drawn step (when there is no picture). */
const PLACE = {
  1: { art: 'derece-1', ring: ['#FFE7A3', '#F6BD60', '#B7832E'], light: 'rgba(246,189,96,0.34)', pedestal: 58 },
  2: { art: 'derece-2', ring: ['#F8FAFC', '#CBD5E1', '#7C8BA1'], light: 'rgba(203,213,225,0.24)', pedestal: 42 },
  3: { art: 'derece-3', ring: ['#F6C9A0', '#CD7F32', '#7C4419'], light: 'rgba(205,127,50,0.28)', pedestal: 32 },
} as const satisfies Record<PodiumPlace, { art: ArtName; ring: readonly [string, string, string]; light: string; pedestal: number }>;

type Person = { name: string; avatar: string; frame?: string; vip: number };

export function ContribBoard({
  visible,
  onClose,
  roomId,
  real,
  sent,
  giftLog,
  locked,
  onPerson,
}: {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  /** A server room: both lists come from the server. */
  real: boolean;
  /** A demo room: the coins each person sent in it since it opened. */
  sent: Readonly<Record<string, number>>;
  /** This visit's gifts, newest first: a demo room's Yankı; a server room reads its lists again when one lands. */
  giftLog: readonly { id: string; from: string; to: string; coins: number }[];
  /** My own room below Lv.3: the lists open later. */
  locked?: boolean;
  /** Someone's row or podium place: their person card. */
  onPerson?: (uid: string) => void;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const { me, blocked, equipped, vipLevel, settings } = useApp();
  const win = useWindowDimensions();
  const paddingBottom = useSheetBottom(16);
  const [side, setSide] = useState<ContribSide>('sent');
  const [period, setPeriod] = useState<ContribPeriod>('day');
  const tone = SIDE[side];
  const still = settings.reduceMotion;

  const live = useRoomContrib(roomId, side, period, visible && real && !locked, giftLog[0]?.id);
  const demo = useMemo(() => {
    if (real || !visible) return [];
    const people = USERS.filter((u) => !blocked.has(u.id)).map((u) => u.id);
    const session = side === 'sent' ? sent : totalsBy(giftLog, 'received');
    return demoBoard({ roomId, side, period, people, session }).filter((r) => !blocked.has(r.uid));
  }, [real, visible, blocked, side, sent, giftLog, roomId, period]);
  const rows: ContribRow[] = real ? (live.board?.rows ?? []) : demo;
  const mine: MyPlace = real ? (live.board?.me ?? { rank: null, score: 0 }) : placeOf(demo);
  const loading = real && !live.board && !live.failed;

  // Other people's frames in a server room (their shop looks); mine from what I wear.
  const shown = rows.slice(0, CONTRIB_TOP);
  useLooks(real ? shown.map((r) => toServer(r.uid) ?? '').filter(Boolean) : [], visible && real);
  const person = (uid: string): Person => {
    if (uid === 'me') return { name: me.name, avatar: me.avatar, frame: equipped.frame ?? undefined, vip: vipLevel };
    const u = userById(uid);
    const look = real ? lookOf(toServer(uid)) : undefined;
    return { name: u.name, avatar: u.avatar, frame: look?.frame ?? undefined, vip: look?.vipLevel ?? 0 };
  };

  // A new tab or period fades in (not with "Animasyonları azalt").
  const [fade] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (still || !visible) return;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [side, period, visible, still, fade]);

  const open = onPerson ? (uid: string) => uid !== 'me' && onPerson(uid) : undefined;
  const pick = <T,>(set: (v: T) => void, v: T) => {
    tapHaptic();
    set(v);
  };

  // The podium picture spans the three places; each place stands on its own step (RoomArt CONTRIB_PODIUM). The
  // picture gets its width and height outright: given only left and right, a bundled picture keeps its own 1080 px
  // (React Native sizes it from the file first), which ran the steps off the sheet. Until the row is measured the
  // window's width stands in for it (the sheet is as wide as the window).
  const [podiumW, setPodiumW] = useState<number | null>(null);
  const layout = podiumLayout(podiumW ?? win.width, CONTRIB_PODIUM_ART !== undefined ? CONTRIB_PODIUM : null, space.md);

  const head = (
    <>
      {loading ? (
        <BrandLoader size={28} style={s.state} />
      ) : live.failed && real ? (
        <View style={s.state}>
          <Ionicons name="cloud-offline-outline" size={28} color={colors.textDim} />
          <Text style={s.stateText}>Sıralama şu an yüklenemedi.</Text>
          <Pressable onPress={live.retry} style={s.retry} accessibilityRole="button">
            <Text style={s.retryText}>Tekrar dene</Text>
          </Pressable>
        </View>
      ) : rows.length === 0 ? (
        <View style={s.state}>
          <Icon3D name="trophy" size={52} />
          <Text style={s.stateText}>{emptyNote(side, period)}</Text>
          <Text style={s.dim}>{side === 'sent' ? 'İlk hediyeyi gönderen zirveye çıkar.' : 'İlk hediyeyi alan zirveye çıkar.'}</Text>
        </View>
      ) : (
        <View style={s.podium} onLayout={(e) => setPodiumW(e.nativeEvent.layout.width)}>
          <View style={{ width: layout.stage }}>
            {layout.steps > 0 && (
              <Image source={CONTRIB_PODIUM_ART} style={[s.steps, { width: layout.stage, height: layout.steps }]} resizeMode="stretch" accessibilityIgnoresInvertColors />
            )}
            <View style={s.places}>
              {([2, 1, 3] as const).map((place) => {
                const row = rows[place - 1];
                return (
                  <PodiumSpot
                    key={place}
                    place={place}
                    row={row}
                    who={row ? person(row.uid) : null}
                    unit={tone.unit}
                    face={layout.face[place]}
                    stand={layout.stand[place]}
                    onPress={row && open ? () => open(row.uid) : undefined}
                  />
                );
              })}
            </View>
          </View>
        </View>
      )}
    </>
  );

  return (
    <Modal visible={visible} transparent animationType={still ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={[s.sheet, { height: Math.round(win.height * 0.88) }]} accessibilityViewIsModal>
        <LinearGradient colors={[tone.tint, 'rgba(22,37,60,0)']} style={s.glow} pointerEvents="none" />
        <View style={s.handle} />
        <View style={s.tabs} accessibilityRole="tablist">
          {CONTRIB_SIDES.map((t) => {
            const on = t.key === side;
            return (
              <Pressable key={t.key} onPress={() => pick(setSide, t.key)} style={s.tab} accessibilityRole="tab" aria-selected={on} hitSlop={6}>
                <View style={s.tabRow}>
                  <Art name={SIDE[t.key].art} size={24} style={!on && s.faded} />
                  <Text style={[s.tabText, on && s.tabTextOn]}>{t.label}</Text>
                </View>
                <View style={[s.tabBar, on && { backgroundColor: SIDE[t.key].accent }]} />
              </Pressable>
            );
          })}
          <Pressable onPress={onClose} style={s.close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>

        {locked ? (
          <View style={[s.state, { flex: 1 }]}>
            <Ionicons name="lock-closed" size={28} color={tone.accent} />
            <Text style={s.stateText}>Katkı sıralaması oda seviyesi 3’te açılır.</Text>
          </View>
        ) : (
          <>
            <View style={s.periods} accessibilityRole="tablist">
              {CONTRIB_PERIODS.map((p) => {
                const on = p.key === period;
                return (
                  <Pressable key={p.key} onPress={() => pick(setPeriod, p.key)} style={[s.period, on && s.periodOn]} accessibilityRole="tab" aria-selected={on}>
                    <Text style={[s.periodText, on && s.periodTextOn]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={s.rule}>
              <Ionicons name="sparkles" size={12} color={tone.accent} />
              <Text style={s.ruleText}>{pointsRule(side)}</Text>
            </View>

            <Animated.View style={{ flex: 1, opacity: fade }}>
              <FlatList
                key={`${side}:${period}`}
                data={loading || (live.failed && real) ? [] : shown.slice(3)}
                keyExtractor={(r) => r.uid}
                ListHeaderComponent={head}
                ListFooterComponent={rows.length > 0 ? <Text style={s.reset}>{resetNote(period)}</Text> : undefined}
                contentContainerStyle={{ paddingBottom: space.md }}
                renderItem={({ item }) => <Row row={item} who={person(item.uid)} me={item.uid === 'me'} unit={tone.unit} onPress={open && item.uid !== 'me' ? () => open(item.uid) : undefined} />}
              />
            </Animated.View>

            <View style={[s.mine, { paddingBottom }]} accessibilityLabel={mine.rank ? `Sıralamadaki yerin: ${mine.rank}.` : 'Henüz sıralamada değilsin'}>
              <Text style={[s.mineRank, mine.rank !== null && { color: tone.accent }]}>{mine.rank ?? '–'}</Text>
              <Face who={person('me')} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.name} numberOfLines={1}>
                  {me.name}
                </Text>
                <Text style={s.dim} numberOfLines={1}>
                  {mine.rank ? `Sıralamadaki yerin: ${mine.rank}.` : 'Henüz sıralamada değilsin'}
                </Text>
              </View>
              {mine.rank !== null && <Amount unit={tone.unit} n={mine.score} />}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

/** A coin (Cömertlik) or diamond (Yankı) and the points. */
function Amount({ unit, n, small }: { unit: 'coin' | 'diamond'; n: number; small?: boolean }) {
  const s = useStyles();
  return (
    <View style={s.amount}>
      <Icon3D name={unit} size={small ? 13 : 15} />
      <Text style={[s.amountText, small && s.amountSmall]}>{contribAmount(n)}</Text>
    </View>
  );
}

/**
 * Their photo in their own shop frame when they wear one; otherwise in `wreath` (a podium place's laurel), in `ring`
 * (the place's metal, when there is no laurel) or plain.
 */
function Face({ who, size, ring, wreath }: { who: Person; size: number; ring?: readonly [string, string, string]; wreath?: number }) {
  const s = useStyles();
  if (who.frame || who.vip > 0) return <FramedAvatar uri={who.avatar} size={size} frameId={who.frame} vipLevel={who.vip} />;
  if (wreath !== undefined) {
    const w = Math.round(size * CONTRIB_WREATH_SCALE);
    return (
      <View style={{ width: size, height: size }}>
        <Photo uri={who.avatar} kind="face" style={{ width: size, height: size, borderRadius: size / 2 }} />
        <Image source={wreath} style={{ position: 'absolute', width: w, height: w, left: (size - w) / 2, top: (size - w) / 2 }} accessibilityIgnoresInvertColors />
      </View>
    );
  }
  if (!ring) return <Photo uri={who.avatar} kind="face" style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <LinearGradient colors={ring} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, padding: 3 }}>
      <Photo uri={who.avatar} kind="face" style={[s.ringFace, { borderRadius: size / 2 }]} />
    </LinearGradient>
  );
}

/**
 * One of the first three: `face` the photo's size, `stand` how much of the podium picture is under it (from its
 * step's top surface down); without a picture a gradient step is drawn instead.
 */
function PodiumSpot({ place, row, who, unit, face, stand, onPress }: { place: PodiumPlace; row?: ContribRow; who: Person | null; unit: 'coin' | 'diamond'; face: number; stand?: number; onPress?: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const p = PLACE[place];
  const wreath = CONTRIB_WREATH_ART[place];
  const medal = Math.round(face * 0.42);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={s.spot}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={row && who ? `${place}. ${who.name}, ${contribAmount(row.score)} puan` : `${place}. sıra boş`}
    >
      {place === 1 && <Icon3D name="crown" size={Math.round(face * 0.36)} style={[s.crown, who && wreath !== undefined && s.crownOnWreath]} />}
      <View style={{ width: face, height: face }}>
        {who ? (
          <Face who={who} size={face} ring={p.ring} wreath={wreath} />
        ) : (
          <View style={[s.emptyFace, { width: face, height: face, borderRadius: face / 2 }]}>
            <Ionicons name="person-outline" size={Math.round(face * 0.36)} color={colors.textDim} />
          </View>
        )}
        <Art name={p.art} size={medal} style={[s.medal, { bottom: -medal / 2, left: (face - medal) / 2 }]} />
      </View>
      <Text style={[s.spotName, { marginTop: medal / 2 + 4 }, !who && s.dim]} numberOfLines={1}>
        {who ? (row?.uid === 'me' ? youLabel(who.name) : who.name) : 'Boş'}
      </Text>
      {row ? <Amount unit={unit} n={row.score} small /> : <View style={{ height: 18 }} />}
      {stand !== undefined ? (
        <View style={{ height: stand }} />
      ) : (
        <LinearGradient colors={[p.light, 'rgba(255,255,255,0.015)']} style={[s.pedestal, { height: p.pedestal, borderTopColor: p.ring[1] }]}>
          <Text style={[s.pedestalNum, place === 1 && s.pedestalNumTop]}>{place}</Text>
        </LinearGradient>
      )}
    </Pressable>
  );
}

function Row({ row, who, me, unit, onPress }: { row: ContribRow; who: Person; me: boolean; unit: 'coin' | 'diamond'; onPress?: () => void }) {
  const s = useStyles();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.row, me && s.rowMe, pressed && s.rowPressed]} accessibilityLabel={`${row.rank}. ${who.name}, ${contribAmount(row.score)} puan`}>
      <Text style={s.rank}>{row.rank}</Text>
      <Face who={who} size={40} />
      <Text style={s.name} numberOfLines={1}>
        {me ? youLabel(who.name) : who.name}
      </Text>
      <Amount unit={unit} n={row.score} />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, ink, edge, surface }) => ({
  scrim: { flex: 1 },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, overflow: 'hidden', ...edge.sheet },
  glow: { position: 'absolute', left: 0, right: 0, top: 0, height: 220 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: ink(0.18), marginTop: space.sm },
  tabs: { flexDirection: 'row', justifyContent: 'center', gap: space.xxl, paddingTop: space.md, paddingHorizontal: 48 },
  tab: { alignItems: 'center', gap: 6 },
  tabRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabText: { color: colors.textDim, fontFamily: fonts.displayBold, fontSize: type.title },
  tabTextOn: { color: colors.text, fontFamily: fonts.display },
  tabBar: { width: 22, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
  faded: { opacity: 0.5 },
  close: { position: 'absolute', right: space.lg, top: space.md + 2, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ink(0.06) },
  periods: { flexDirection: 'row', alignSelf: 'center', marginTop: space.md, padding: 3, borderRadius: radius.pill, backgroundColor: ink(0.06), borderWidth: 1, borderColor: surface.hairline },
  period: { minWidth: 82, alignItems: 'center', paddingVertical: 7, paddingHorizontal: space.md, borderRadius: radius.pill },
  periodOn: { backgroundColor: ink(0.14) },
  periodText: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  periodTextOn: { color: colors.text },
  rule: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: space.md, paddingHorizontal: space.lg },
  ruleText: { color: colors.textDim, fontSize: type.caption, flexShrink: 1, textAlign: 'center' },
  podium: { alignItems: 'center', paddingTop: space.lg, marginBottom: space.sm },
  places: { flexDirection: 'row', alignItems: 'flex-end' },
  spot: { flex: 1, alignItems: 'center', gap: 2 },
  crown: { marginBottom: -6, zIndex: 1 },
  crownOnWreath: { marginBottom: 2 },
  steps: { position: 'absolute', left: 0, bottom: 0 },
  ringFace: { flex: 1, borderWidth: 2, borderColor: colors.card },
  emptyFace: { alignItems: 'center', justifyContent: 'center', backgroundColor: ink(0.05), borderWidth: 1.5, borderStyle: 'dashed', borderColor: ink(0.16) },
  medal: { position: 'absolute' },
  spotName: { color: colors.text, fontWeight: '800', fontSize: 13, maxWidth: '92%', textAlign: 'center' },
  pedestal: { alignSelf: 'stretch', alignItems: 'center', marginTop: space.sm, marginHorizontal: 4, paddingTop: 4, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, borderTopWidth: 2 },
  pedestalNum: { color: ink(0.3), fontFamily: fonts.display, fontSize: 18 },
  pedestalNumTop: { fontSize: 24, color: ink(0.38) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: surface.hairline },
  rowMe: { backgroundColor: 'rgba(255,95,162,0.08)' },
  rowPressed: { backgroundColor: surface.pressed },
  rank: { width: 26, textAlign: 'center', color: colors.textDim, fontFamily: fonts.displayBold, fontSize: 15, fontVariant: ['tabular-nums'] },
  name: { flex: 1, color: colors.text, fontWeight: '700', fontSize: type.body },
  amount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  amountText: { color: colors.text, fontWeight: '800', fontSize: type.body, fontVariant: ['tabular-nums'] },
  amountSmall: { fontSize: 12 },
  state: { alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.xl },
  stateText: { color: colors.text, fontWeight: '700', fontSize: type.body, textAlign: 'center' },
  dim: { color: colors.textDim, fontSize: type.caption },
  retry: { marginTop: space.xs, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.pill, backgroundColor: ink(0.1) },
  retryText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  reset: { color: colors.textDim, fontSize: 11, textAlign: 'center', marginTop: space.md },
  mine: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: colors.cardAlt, borderTopWidth: 1, borderTopColor: ink(0.08) },
  mineRank: { minWidth: 26, textAlign: 'center', color: colors.textDim, fontFamily: fonts.display, fontSize: type.bodyL, fontVariant: ['tabular-nums'] },
}));
