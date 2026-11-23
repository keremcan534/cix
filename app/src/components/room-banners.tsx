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
import { compact } from '@/lib/compact';
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
// Each board's sign (docs/GORSEL_URETIM_LISTESI.md § 13, app/assets/banners, 192 px).
const BOARD: Record<BoardKey, { title: string; sub: string; art: number; unit: Icon3DName; tint: readonly [string, string]; screen: string }> = {
  agency: { title: 'Zirvedeki ajanslar', sub: 'Yayıncılarının kazandığı elmas', art: require('../../assets/banners/banner-zirvedeki-ajanslar.png'), unit: 'diamond', tint: ['#123A52', '#1D1846'], screen: 'ajans' },
  charm: { title: 'En çok hediye alanlar', sub: 'Gelen hediyelerin elması', art: require('../../assets/banners/banner-en-cok-hediye-alan.png'), unit: 'diamond', tint: ['#4A1838', '#24163F'], screen: 'yayinci' },
  wealth: { title: 'En çok hediye gönderenler', sub: 'Gönderilen hediyelerin jetonu', art: require('../../assets/banners/banner-en-cok-hediye-gonderen.png'), unit: 'coin', tint: ['#4A3510', '#241A3D'], screen: 'zengin' },
};
/** A management event without its own picture: a cup and a calendar leaf in the corner. */
const EVENT_ART: number = require('../../assets/banners/banner-etkinlik-varsayilan.png');
const TEAM_ART: number = require('../../assets/banners/mesaj-similar-ekibi.png');
/**
 * A notice without its own picture: its kind's colours and picture (the calendar and cup for an event, the team's
 * megaphone for an update or an announcement, the gift for a reward, the list for a rule), so each reads at a glance.
 */
const KIND_LOOK: Record<TeamKind, { tint: readonly [string, string]; art: number; hue: string }> = {
  event: { tint: ['#2563EB', '#5B21B6'], art: EVENT_ART, hue: '#A5B4FC' },
  update: { tint: ['#0E7490', '#4338CA'], art: TEAM_ART, hue: '#67E8F9' },
  notice: { tint: ['#DB2777', '#6D28D9'], art: TEAM_ART, hue: '#F9A8D4' },
  reward: { tint: ['#D97706', '#BE185D'], art: icon3dSource('gift'), hue: '#FDE68A' },
  rule: { tint: ['#0F766E', '#1E40AF'], art: icon3dSource('tasks'), hue: '#99F6E4' },
};
const EVERY_MS = 5500;
/** Every slide's height: the podium card's crowns, laurels and stage need the room. */
const CARD_H = 204;


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
  const look = KIND_LOOK[s.tag] ?? KIND_LOOK.notice;
  return (
    <PressableScale to={0.98} disabled={!href} onPress={href ? () => router.push(href as Href) : undefined} accessibilityRole={href ? 'button' : undefined} accessibilityLabel={`${label}: ${s.title}`}>
      <View style={styles.fill}>
        {s.image ? (
          <>
            <Image source={{ uri: s.image }} style={styles.cover} resizeMode="cover" />
            <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)']} start={{ x: 0, y: 0.2 }} end={{ x: 0, y: 1 }} style={styles.cover} />
          </>
        ) : (
          <>
            <LinearGradient colors={look.tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cover} />
            {/* The kind's picture, big and faint, behind the words: the card is full, not a plain field of colour. */}
            <Image source={look.art} style={styles.ghost} resizeMode="contain" accessibilityIgnoresInvertColors />
          </>
        )}
        <Gloss radius={18} strength={0.16} />
        {/* With a picture the words sit on its dark foot; without one, in the middle beside the kind's picture. */}
        <View style={[styles.eventBody, !s.image && styles.eventBodyPlain]}>
          <View style={{ flex: 1, gap: 6, justifyContent: s.image ? 'flex-end' : 'center' }}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{label}</Text>
            </View>
            <Text style={[styles.eventTitle, !s.image && styles.eventTitlePlain]} numberOfLines={2}>
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
            <FloatIcon source={look.art} size={88} hue={look.hue} bob />
          )}
        </View>
      </View>
    </PressableScale>
  );
}

/**
 * The podium's pictures (the owners' "En çok hediye gönderenler" card, 23 Nov 2026, assets/banners/podyum): a gold,
 * silver and bronze crown over the first three, and a laurel on each side of the first. Names, faces, scores and the
 * period are live; the pictures only dress them.
 */
const PODIUM = {
  crown: [require('../../assets/banners/podyum/tac-altin.webp'), require('../../assets/banners/podyum/tac-gumus.webp'), require('../../assets/banners/podyum/tac-bronz.webp')],
  crownRatio: [100 / 44, 77 / 32, 67 / 31],
  laurel: require('../../assets/banners/podyum/defne-sol.webp'),
  laurelRatio: 50 / 138,
} as const;
/** The card's neon rim (pink, violet, blue) and its navy glass. */
const NEON = { rim: ['#FF4FD8', '#B44CFF', '#5B6CFF', '#22D3FF'], fill: ['#1E0F48', '#130A33', '#1A0B3A'] } as const;

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
      <LinearGradient colors={NEON.rim} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rim}>
        <LinearGradient colors={NEON.fill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.boardFill}>
          {/* The first place's stage: two glowing rings under the middle of the podium. */}
          <View style={styles.stage} pointerEvents="none">
            <View style={styles.stageOuter} />
            <View style={styles.stageInner} />
          </View>
          {/* The title has the whole line; what it counts shares the next one with the period switch, on two lines if it must. */}
          <View style={styles.boardHead}>
            <Image source={b.art} style={{ width: 28, height: 28 }} resizeMode="contain" accessibilityIgnoresInvertColors />
            <Text style={styles.boardTitle} numberOfLines={1}>
              {b.title}
            </Text>
          </View>
          <View style={styles.boardLine}>
            <Text style={styles.boardSub} numberOfLines={2}>
              {b.sub}
            </Text>
            <View style={styles.periods} accessibilityRole="tablist">
              {PERIODS.map((p) => (
                <Pressable key={p.key} onPress={() => setPicked(p.key)} hitSlop={6} accessibilityRole="tab" accessibilityState={{ selected: p.key === period }} style={[styles.period, p.key === period && styles.periodOn]}>
                  <Text style={[styles.periodText, p.key === period && styles.periodTextOn]}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {rows.length ? (
            <View style={styles.podium}>
              {podium.map((r, i) => {
                const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
                const first = rank === 1;
                const face = first ? 54 : 44;
                const crownW = first ? 44 : 30;
                const crown = <Image source={PODIUM.crown[rank - 1]} style={{ width: crownW, height: crownW / PODIUM.crownRatio[rank - 1], marginBottom: -3 }} resizeMode="contain" />;
                const badge = (
                  <View style={[styles.rank, first && styles.rankFirst]}>
                    <Text style={[styles.rankText, first && styles.rankTextFirst]}>{rank}</Text>
                  </View>
                );
                // A place nobody holds yet still shows as a place, so one name never floats alone in an empty row.
                if (!r)
                  return (
                    <View key={`empty${rank}`} style={styles.place} accessible accessibilityLabel={`${rank}. sıra boş`}>
                      {crown}
                      <View>
                        <View style={[styles.emptyFace, { width: face, height: face, borderRadius: face / 2 }]}>
                          <Ionicons name="person" size={face * 0.45} color="rgba(255,255,255,0.45)" />
                        </View>
                        {badge}
                      </View>
                      <Text style={[styles.name, styles.emptyText]} numberOfLines={1}>
                        Sıra boş
                      </Text>
                      <Text style={[styles.scoreText, styles.emptyText]}>—</Text>
                    </View>
                  );
                return (
                  <View key={r.id} style={styles.place} accessible accessibilityLabel={`${rank}. ${r.name}, ${compact(r.score)}`}>
                    {crown}
                    <View>
                      {first && (
                        <>
                          <Image source={PODIUM.laurel} style={[styles.laurel, { left: -26 }]} resizeMode="contain" />
                          <Image source={PODIUM.laurel} style={[styles.laurel, { right: -26, transform: [{ scaleX: -1 }] }]} resizeMode="contain" />
                        </>
                      )}
                      <View style={[styles.faceRing, first ? styles.faceRingFirst : styles.faceRingOther, { borderRadius: face / 2 + 3 }]}>
                        <Avatar uri={r.avatar || undefined} name={r.name} size={face} />
                      </View>
                      {badge}
                    </View>
                    <Text style={[styles.name, first && styles.nameFirst]} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <View style={styles.score}>
                      <Icon3D name={b.unit} size={15} />
                      <Text style={styles.scoreText}>{compact(r.score)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.none}>Bu dönemde henüz kimse yok.</Text>
          )}
        </LinearGradient>
      </LinearGradient>
    </PressableScale>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: { height: CARD_H, borderRadius: 20, overflow: 'hidden' },
  fill: { height: CARD_H, borderRadius: 20, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 12 },
  cover: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', height: '100%' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotOn: { width: 16, backgroundColor: colors.text },

  eventBody: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  eventBodyPlain: { alignItems: 'center' },
  ghost: { position: 'absolute', right: -26, bottom: -30, width: 190, height: 190, opacity: 0.14, transform: [{ rotate: '-12deg' }] },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)' },
  tagText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  eventTitle: { color: '#fff', fontSize: 19, lineHeight: 24, fontFamily: fonts.display },
  eventTitlePlain: { fontSize: 22, lineHeight: 27 },
  eventSub: { color: 'rgba(255,255,255,0.86)', fontSize: 13, lineHeight: 18 },

  rim: { height: CARD_H, borderRadius: 20, padding: 1.5 },
  boardFill: { flex: 1, borderRadius: 18.5, overflow: 'hidden', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 18 },
  boardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  boardTitle: { flex: 1, minWidth: 0, color: '#fff', fontSize: 17, fontFamily: fonts.display },
  boardLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  boardSub: { flex: 1, minWidth: 0, color: 'rgba(255,255,255,0.78)', fontSize: 12.5, lineHeight: 16 },
  periods: { flexDirection: 'row', padding: 2, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: 'rgba(255,255,255,0.06)' },
  period: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1.5, borderColor: 'transparent' },
  periodOn: { borderColor: '#FF4FD8', backgroundColor: 'rgba(255,60,200,0.14)', boxShadow: '0 0 8px rgba(255,60,210,0.7)' },
  periodText: { color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: '700' },
  periodTextOn: { color: '#fff' },

  podium: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around' },
  place: { flex: 1, alignItems: 'center', gap: 1 },
  faceRing: { padding: 2, borderWidth: 2 },
  faceRingFirst: { borderColor: '#FFC24A', boxShadow: '0 0 12px rgba(255,190,60,0.85)' },
  faceRingOther: { borderColor: '#E58CFF', boxShadow: '0 0 8px rgba(229,140,255,0.6)' },
  laurel: { position: 'absolute', top: 2, width: 23, height: 23 / (50 / 138) },
  rank: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F0FA',
  },
  rankFirst: { backgroundColor: '#FFC83D', boxShadow: '0 0 6px rgba(255,200,60,0.8)' },
  rankText: { color: '#1E2A5A', fontSize: 12, fontWeight: '900' },
  rankTextFirst: { color: '#3A2400' },
  name: { color: '#fff', fontSize: 14, fontWeight: '800', maxWidth: '94%', marginTop: 3 },
  nameFirst: { fontSize: 15 },
  score: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoreText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  // An empty place: a dashed dim ring, dim words.
  emptyFace: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  emptyText: { color: 'rgba(255,255,255,0.6)' },
  // The first place's stage: a wide violet ring and a pink one inside it, glowing.
  stage: { position: 'absolute', left: 0, right: 0, bottom: -24, height: 40, alignItems: 'center', justifyContent: 'center' },
  stageOuter: { position: 'absolute', width: '62%', height: 30, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(120,110,255,0.85)', boxShadow: '0 0 12px rgba(90,120,255,0.7)' },
  stageInner: { position: 'absolute', width: '42%', height: 18, top: 6, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(255,80,216,0.95)', boxShadow: '0 0 12px rgba(255,60,210,0.8)' },
  none: { flex: 1, color: 'rgba(255,255,255,0.75)', fontSize: 13, textAlign: 'center', textAlignVertical: 'center', paddingTop: 30 },
}));
