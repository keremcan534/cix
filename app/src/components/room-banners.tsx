// Odalar's sliding banners (güncelleme 2, madde 33): the management's running events, then the top 3 agencies,
// receivers and senders of the day, week or month. Live builds read GET /api/room-banners (server/api/team.mjs,
// boards refreshed at most once a minute); the demo builds the same slides from its sample boards.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Image, Pressable, ScrollView, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { Text } from '@/components/text';
import { FloatIcon } from '@/components/fx/float';
import { Gloss, PressableScale } from '@/components/fx/surface';
import { Icon3D, icon3dSource, type Icon3DName } from '@/components/Icon3D';
import { Avatar } from '@/components/ui';
import { AGENCIES } from '@/data/agency';
import { LEADERBOARDS } from '@/data/economy';
import { ROOM_EVENTS } from '@/data/rooms-ui';
import { liveMode } from '@/lib/live';
import { TEAM_KIND_LABEL, roomBanners, type BoardKey, type BoardPeriod, type RoomBanners as Banners, type TeamKind } from '@/lib/live/team';
import { noticeHref } from '@/lib/notice-links';
import { useApp } from '@/store';
import { ThemeScope, fonts, makeStyles } from '@/theme';

type Row = { id: string; name: string; avatar: string; score: number };
type EventSlide = { kind: 'event'; id: string; tag: TeamKind; title: string; body: string; image: string | null; link: string | undefined };
type BoardSlide = { kind: 'board'; id: BoardKey; rows: Record<BoardPeriod, Row[]> };
type Slide = EventSlide | BoardSlide;

const PERIODS: { key: BoardPeriod; label: string; screen: string }[] = [
  { key: 'day', label: 'Gün', screen: 'daily' },
  { key: 'week', label: 'Hafta', screen: 'weekly' },
  { key: 'month', label: 'Ay', screen: 'monthly' },
];
const BOARD: Record<BoardKey, { title: string; sub: string; icon: Icon3DName; unit: Icon3DName; tint: readonly [string, string]; screen: string }> = {
  agency: { title: 'Zirvedeki ajanslar', sub: 'Yayıncılarının kazandığı elmas', icon: 'briefcase', unit: 'diamond', tint: ['#123A52', '#1D1846'], screen: 'ajans' },
  charm: { title: 'En çok hediye alanlar', sub: 'Gelen hediyelerin elması', icon: 'diamond', unit: 'diamond', tint: ['#4A1838', '#24163F'], screen: 'yayinci' },
  wealth: { title: 'En çok hediye gönderenler', sub: 'Gönderilen hediyelerin jetonu', icon: 'gift', unit: 'coin', tint: ['#4A3510', '#241A3D'], screen: 'zengin' },
};
const EVENT_TINT = ['#2563EB', '#5B21B6'] as const;
const EVERY_MS = 5500;

/** 12.400 → "12,4 B"; 1.250.000 → "1,3 Mn". */
function short(n: number) {
  const one = (x: number) => (Math.round(x * 10) / 10).toLocaleString('tr-TR');
  if (n >= 1_000_000) return `${one(n / 1_000_000)} Mn`;
  if (n >= 10_000) return `${one(n / 1_000)} B`;
  return n.toLocaleString('tr-TR');
}

function liveSlides(d: Banners): Slide[] {
  const events: Slide[] = d.events.map((e) => ({ kind: 'event', id: `e${e.id}`, tag: e.kind, title: e.title, body: e.body, image: e.imageUrl, link: e.link ?? undefined }));
  const boards = (['agency', 'charm', 'wealth'] as const).map((id): BoardSlide => {
    const rows = {} as Record<BoardPeriod, Row[]>;
    for (const p of PERIODS) {
      rows[p.key] = (d.boards[id]?.[p.key] ?? []).flatMap((r) => {
        const who = r.agency ?? r.user;
        return who ? [{ id: who.id, name: who.name, avatar: who.avatarUrl ?? '', score: r.score }] : [];
      });
    }
    return { kind: 'board', id, rows };
  });
  return [...events, ...boards];
}

function demoSlides(): Slide[] {
  const people = (list: { user: { id: string; name: string; avatar: string }; score: number }[], times = 1) =>
    list.slice(0, 3).map((r) => ({ id: r.user.id, name: r.user.name, avatar: r.user.avatar, score: r.score * times }));
  const agencies = (times: number) =>
    AGENCIES.filter((a) => a.status === 'active')
      .map((a) => ({ id: a.id, name: a.name, avatar: '', score: a.hosts * 4_150 * times }))
      .sort((a, b) => b.score - a.score);
  return [
    ...ROOM_EVENTS.slice(0, 1).map((e): Slide => ({ kind: 'event', id: e.id, tag: 'event', title: e.title, body: e.when, image: null, link: `/oda/${e.roomId}` })),
    { kind: 'board', id: 'agency', rows: { day: agencies(1), week: agencies(6), month: agencies(24) } },
    { kind: 'board', id: 'charm', rows: { day: people(LEADERBOARDS.yayinci.daily), week: people(LEADERBOARDS.yayinci.weekly), month: people(LEADERBOARDS.yayinci.weekly, 4) } },
    { kind: 'board', id: 'wealth', rows: { day: people(LEADERBOARDS.zengin.daily), week: people(LEADERBOARDS.zengin.weekly), month: people(LEADERBOARDS.zengin.weekly, 4) } },
  ];
}

/** A board with nobody on it in any period (a new server) is left out rather than shown empty. */
const worthShowing = (s: Slide) => s.kind === 'event' || PERIODS.some((p) => s.rows[p.key].length > 0);

export function RoomBanners() {
  const styles = useStyles();
  const { settings } = useApp();
  const live = liveMode();
  const { width } = useWindowDimensions();
  const cardW = width - 32;
  const step = cardW + 10;

  const [server, setServer] = useState<Banners | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!live) return;
      let alive = true;
      roomBanners()
        .then((d) => alive && setServer(d))
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [live]),
  );
  const slides = (live ? (server ? liveSlides(server) : []) : demoSlides()).filter(worthShowing);

  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const count = slides.length;
  // Slides advance on their own every few seconds, not while a finger is on them, and never with reduced motion.
  useEffect(() => {
    if (count < 2 || held || settings.reduceMotion) return;
    const t = setTimeout(() => scroller.current?.scrollTo({ x: ((index + 1) % count) * step, animated: true }), EVERY_MS);
    return () => clearTimeout(t);
  }, [count, held, index, settings.reduceMotion, step]);
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.max(0, Math.min(count - 1, Math.round(e.nativeEvent.contentOffset.x / step))));
    setHeld(false);
  };

  if (!count) return null;
  return (
    <View style={{ gap: 8 }}>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        disableIntervalMomentum
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
        onScrollBeginDrag={() => setHeld(true)}
        onMomentumScrollEnd={settle}
      >
        {slides.map((s) => (
          <View key={s.id} style={[styles.card, { width: cardW }]}>
            <ThemeScope scheme="dark">{s.kind === 'event' ? <EventCard s={s} live={live} /> : <BoardCard s={s} />}</ThemeScope>
          </View>
        ))}
      </ScrollView>
      {count > 1 && (
        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {slides.map((s, i) => (
            <View key={s.id} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

function EventCard({ s, live }: { s: EventSlide; live: boolean }) {
  const styles = useStyles();
  const href = noticeHref(s.link, live);
  const label = TEAM_KIND_LABEL[s.tag];
  return (
    <PressableScale to={0.98} disabled={!href} onPress={href ? () => router.push(href as Href) : undefined} accessibilityRole={href ? 'button' : undefined} accessibilityLabel={`${label}: ${s.title}`}>
      <View style={styles.fill}>
        {s.image ? (
          <>
            <Image source={{ uri: s.image }} style={styles.cover} resizeMode="cover" />
            <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)']} start={{ x: 0, y: 0.2 }} end={{ x: 0, y: 1 }} style={styles.cover} />
          </>
        ) : (
          <LinearGradient colors={EVENT_TINT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cover} />
        )}
        <Gloss radius={18} strength={0.16} />
        <View style={styles.eventBody}>
          <View style={{ flex: 1, gap: 6, justifyContent: 'flex-end' }}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{label}</Text>
            </View>
            <Text style={styles.eventTitle} numberOfLines={2}>
              {s.title}
            </Text>
            {!!s.body && (
              <Text style={styles.eventSub} numberOfLines={2}>
                {s.body}
              </Text>
            )}
          </View>
          {s.image ? (
            href && <Ionicons name="chevron-forward-circle" size={28} color="rgba(255,255,255,0.9)" />
          ) : (
            <FloatIcon source={icon3dSource('trophy')} size={64} hue="#A5B4FC" bob />
          )}
        </View>
      </View>
    </PressableScale>
  );
}

function BoardCard({ s }: { s: BoardSlide }) {
  const styles = useStyles();
  const b = BOARD[s.id];
  const [picked, setPicked] = useState<BoardPeriod | null>(null);
  // Until a period is picked, the shortest one that has anybody on it.
  const period = picked ?? PERIODS.find((p) => s.rows[p.key].length > 0)?.key ?? 'day';
  const rows = s.rows[period];
  const screen = PERIODS.find((p) => p.key === period)!.screen;
  // Podium order: second, first, third.
  const podium = [rows[1], rows[0], rows[2]];
  return (
    <PressableScale to={0.98} onPress={() => router.push(`/siralama?board=${b.screen}&period=${screen}` as Href)} accessibilityRole="button" accessibilityLabel={`${b.title}, tam sıralama`}>
      <LinearGradient colors={b.tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
        <Gloss radius={18} strength={0.12} />
        <View style={styles.boardHead}>
          <Icon3D name={b.icon} size={30} />
          <View style={{ flex: 1 }}>
            <Text style={styles.boardTitle} numberOfLines={1}>
              {b.title}
            </Text>
            <Text style={styles.boardSub} numberOfLines={1}>
              {b.sub}
            </Text>
          </View>
          <View style={styles.periods} accessibilityRole="tablist">
            {PERIODS.map((p) => (
              <Pressable key={p.key} onPress={() => setPicked(p.key)} hitSlop={4} accessibilityRole="tab" accessibilityState={{ selected: p.key === period }} style={[styles.period, p.key === period && styles.periodOn]}>
                <Text style={[styles.periodText, p.key === period && styles.periodTextOn]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        {rows.length ? (
          <View style={styles.podium}>
            {podium.map((r, i) => {
              const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
              if (!r) return <View key={`empty${rank}`} style={styles.place} />;
              return (
                <View key={r.id} style={styles.place} accessible accessibilityLabel={`${rank}. ${r.name}, ${short(r.score)}`}>
                  <View>
                    <Avatar uri={r.avatar || undefined} name={r.name} size={rank === 1 ? 46 : 38} ring={rank === 1} />
                    <View style={[styles.rank, rank === 1 && styles.rankFirst]}>
                      <Text style={styles.rankText}>{rank}</Text>
                    </View>
                  </View>
                  <Text style={styles.name} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <View style={styles.score}>
                    <Icon3D name={b.unit} size={12} />
                    <Text style={styles.scoreText}>{short(r.score)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.none}>Bu dönemde henüz kimse yok.</Text>
        )}
      </LinearGradient>
    </PressableScale>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: { height: 164, borderRadius: 18, overflow: 'hidden' },
  fill: { height: 164, borderRadius: 18, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 12 },
  cover: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', height: '100%' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotOn: { width: 16, backgroundColor: colors.text },

  eventBody: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)' },
  tagText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  eventTitle: { color: '#fff', fontSize: 19, lineHeight: 24, fontFamily: fonts.display },
  eventSub: { color: 'rgba(255,255,255,0.86)', fontSize: 13, lineHeight: 18 },

  boardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  boardTitle: { color: '#fff', fontSize: 15, fontFamily: fonts.display },
  boardSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  periods: { flexDirection: 'row', padding: 2, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' },
  period: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  periodOn: { backgroundColor: 'rgba(255,255,255,0.92)' },
  periodText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
  periodTextOn: { color: '#1A1530' },

  podium: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', paddingTop: 6 },
  place: { flex: 1, alignItems: 'center', gap: 3 },
  rank: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  rankFirst: { backgroundColor: colors.gold },
  rankText: { color: '#1A1530', fontSize: 11, fontWeight: '900' },
  name: { color: '#fff', fontSize: 12, fontWeight: '700', maxWidth: '92%' },
  score: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  scoreText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  none: { flex: 1, color: 'rgba(255,255,255,0.75)', fontSize: 13, textAlign: 'center', textAlignVertical: 'center', paddingTop: 30 },
}));
