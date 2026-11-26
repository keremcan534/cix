// Odalar's sliding banners (güncelleme 2, madde 33): the management's running events, then the top 3 agencies,
// receivers and senders of the day, week or month. Live builds read GET /api/room-banners (server/api/team.mjs,
// boards refreshed at most once a minute); the demo builds the same slides from its sample boards.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { Text } from '@/components/text';
import { FloatIcon } from '@/components/fx/float';
import { Gloss, PressableScale } from '@/components/fx/surface';
import { Icon3D, icon3dSource, type Icon3DName } from '@/components/Icon3D';
import { Avatar } from '@/components/ui';
import { AGENCIES } from '@/data/agency';
import { LEADERBOARDS } from '@/data/economy';
import { ROOM_EVENTS } from '@/data/rooms-ui';
import { liveMode } from '@/lib/live';
import { TEAM_KIND_LABEL, bannerClick, bannerSeen, roomBanners, type AdminBanner, type BannerAccent, type BoardKey, type BoardPeriod, type RoomBanners as Banners, type TeamKind } from '@/lib/live/team';
import { noticeHref } from '@/lib/notice-links';
import { compact } from '@/lib/compact';
import { useMyServerAgency } from '@/lib/live/me-stats';
import { useApp } from '@/store';
import { ThemeScope, fonts, makeStyles } from '@/theme';

type Row = { id: string; name: string; avatar: string; score: number };
type EventSlide = { kind: 'event'; id: string; tag: TeamKind; title: string; body: string; image: string | null; link: string | undefined };
type BoardSlide = { kind: 'board'; id: BoardKey; rows: Record<BoardPeriod, Row[]> };
type BannerSlide = { kind: 'banner'; id: string; b: AdminBanner };
type Slide = EventSlide | BoardSlide | BannerSlide;

const PERIODS: { key: BoardPeriod; label: string; screen: string }[] = [
  { key: 'day', label: 'Gün', screen: 'daily' },
  { key: 'week', label: 'Hafta', screen: 'weekly' },
  { key: 'month', label: 'Ay', screen: 'monthly' },
];
// Each board's sign (docs/GORSEL_URETIM_LISTESI.md § 13, app/assets/banners, 192 px).
// The headers' pictures: the owners' neon podium design (25 Nov 2026, assets/banners/podyum/baslik-*).
const BOARD: Record<BoardKey, { title: string; sub: string; art: number; unit: Icon3DName; tint: readonly [string, string]; screen: string }> = {
  agency: { title: 'Zirvedeki ajanslar', sub: 'Yayıncılarının kazandığı elmas', art: require('../../assets/banners/podyum/baslik-ajans.webp'), unit: 'diamond', tint: ['#123A52', '#1D1846'], screen: 'ajans' },
  charm: { title: 'En çok hediye alanlar', sub: 'Gelen hediyelerin elması', art: require('../../assets/banners/podyum/baslik-alan.webp'), unit: 'diamond', tint: ['#4A1838', '#24163F'], screen: 'yayinci' },
  wealth: { title: 'En çok hediye gönderenler', sub: 'Gönderilen hediyelerin jetonu', art: require('../../assets/banners/podyum/baslik-gonderen.webp'), unit: 'coin', tint: ['#4A3510', '#241A3D'], screen: 'zengin' },
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
/** Every slide's height: the podium card's crowns, laurels and pedestals need the room. */
const CARD_H = 212;
/** The app's own banner pictures (Banner Yönetimi `art`): the owners' examples. */
const BANNER_ART: Record<string, number> = {
  'ornek-hediye-alanlar': require('../../assets/banners/ornek-hediye-alanlar.webp'),
  'ornek-hediye-gonderenler': require('../../assets/banners/ornek-hediye-gonderenler.webp'),
  'ornek-zirvedeki-ajanslar': require('../../assets/banners/ornek-zirvedeki-ajanslar.webp'),
  'ajans-basvurusu': require('../../assets/banners/ajans-basvurusu.webp'),
};
/**
 * Ajans başvurusu (owners, 26 Nov 2026): the app's own slide, always first, for anyone in no agency; the picture carries
 * its own button. Not a Banner Yönetimi banner (no seen / click counts).
 */
const AGENCY_APPLY: Slide = {
  kind: 'banner',
  id: 'app-agency-apply',
  b: { id: 'app-agency-apply', title: 'Ajans Başvurusu', subtitle: 'Kendi ajansını kur veya güçlü bir ekibe katıl', cta: '', link: '/ajans', imageUrl: null, art: 'ajans-basvurusu', showText: false, accent: 'mor' },
};
const ownSlide = (id: string) => id.startsWith('app-');
/** A banner's button and rim colours (Banner Yönetimi `accent`). */
const ACCENT: Record<BannerAccent, { button: readonly [string, string]; rim: string; ink: string }> = {
  mor: { button: ['#C14DFF', '#7B2FF7'], rim: '#B66BFF', ink: '#fff' },
  pembe: { button: ['#FF5FA8', '#D61F78'], rim: '#FF7BC0', ink: '#fff' },
  altin: { button: ['#FFE08A', '#F2B635'], rim: '#FFC94D', ink: '#3A2400' },
  turkuaz: { button: ['#6FF3FF', '#22B8D6'], rim: '#4FE3F5', ink: '#06303A' },
};


function liveSlides(d: Banners): Slide[] {
  const banners: Slide[] = (d.banners ?? []).filter((b) => b.imageUrl || (b.art && BANNER_ART[b.art])).map((b) => ({ kind: 'banner', id: `b${b.id}`, b }));
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
  return [...banners, ...events, ...boards];
}

function demoSlides(): Slide[] {
  const people = (list: { user: { id: string; name: string; avatar: string }; score: number }[], times = 1) =>
    list.slice(0, 3).map((r) => ({ id: r.user.id, name: r.user.name, avatar: r.user.avatar, score: r.score * times }));
  const agencies = (times: number) =>
    AGENCIES.filter((a) => a.status === 'active')
      .map((a) => ({ id: a.id, name: a.name, avatar: '', score: a.hosts * 4_150 * times }))
      .sort((a, b) => b.score - a.score);
  const example = (id: string, title: string, art: string, accent: BannerAccent, link: string): Slide => ({
    kind: 'banner',
    id,
    b: { id, title, subtitle: '', cta: 'Sıralamayı Gör', link, imageUrl: null, art, showText: false, accent },
  });
  return [
    example('demo-alan', 'En Çok Hediye Alanlar', 'ornek-hediye-alanlar', 'turkuaz', '/siralama?board=yayinci&period=weekly'),
    example('demo-gonderen', 'En Çok Hediye Gönderenler', 'ornek-hediye-gonderenler', 'altin', '/siralama?board=zengin&period=weekly'),
    ...ROOM_EVENTS.slice(0, 1).map((e): Slide => ({ kind: 'event', id: e.id, tag: 'event', title: e.title, body: e.when, image: null, link: `/oda/${e.roomId}` })),
    { kind: 'board', id: 'agency', rows: { day: agencies(1), week: agencies(6), month: agencies(24) } },
    { kind: 'board', id: 'charm', rows: { day: people(LEADERBOARDS.yayinci.daily), week: people(LEADERBOARDS.yayinci.weekly), month: people(LEADERBOARDS.yayinci.weekly, 4) } },
    { kind: 'board', id: 'wealth', rows: { day: people(LEADERBOARDS.zengin.daily), week: people(LEADERBOARDS.zengin.weekly), month: people(LEADERBOARDS.zengin.weekly, 4) } },
  ];
}

/** A board with nobody on it in any period (a new server) is left out rather than shown empty. */
const worthShowing = (s: Slide) => s.kind !== 'board' || PERIODS.some((p) => s.rows[p.key].length > 0);

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
  // The application slide: only for someone in no agency (live: the server's answer; none before it).
  const myAgency = useMyServerAgency(live);
  const { agencyId } = useApp();
  const noAgency = live ? myAgency === null : !agencyId;
  const slides = [...(noAgency ? [AGENCY_APPLY] : []), ...(live ? (server ? liveSlides(server) : []) : demoSlides()).filter(worthShowing)];

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
  // Slides came or went (the server's answer, the application slide): back to the first, so the dots and the card agree.
  const [slidesWere, setSlidesWere] = useState(count);
  if (slidesWere !== count) {
    setSlidesWere(count);
    setIndex(0);
  }
  useEffect(() => {
    scroller.current?.scrollTo({ x: 0, animated: false });
  }, [count]);
  // The banner in view counts as seen (once a run; the server counts each person once a day).
  const shown = slides[index];
  const shownBanner = live && shown?.kind === 'banner' && !ownSlide(shown.b.id) ? shown.b.id : null;
  useEffect(() => {
    if (shownBanner) bannerSeen(shownBanner);
  }, [shownBanner]);
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
            <ThemeScope scheme="dark">{s.kind === 'banner' ? <BannerCard s={s} live={live} /> : s.kind === 'event' ? <EventCard s={s} live={live} /> : <BoardCard s={s} />}</ThemeScope>
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

/**
 * A Banner Yönetimi banner (the owners' design, 25 Nov 2026): its picture fills the card under a thin rim of its
 * colour; with "Yazıları göster" its title, line and button sit on a dark sweep on the left (a picture with its own
 * words shows only the button, if it has one). A tap opens its link and counts once a day.
 */
function BannerCard({ s, live }: { s: BannerSlide; live: boolean }) {
  const styles = useStyles();
  const { b } = s;
  const href = noticeHref(b.link ?? undefined, live);
  const a = ACCENT[b.accent];
  const source = b.imageUrl ? { uri: b.imageUrl } : BANNER_ART[b.art ?? ''];
  const open = () => {
    if (!href) return;
    if (live && !ownSlide(b.id)) bannerClick(b.id);
    router.push(href as Href);
  };
  return (
    <PressableScale to={0.98} disabled={!href} onPress={open} accessibilityRole={href ? 'button' : 'image'} accessibilityLabel={[b.title, b.subtitle, b.cta].filter(Boolean).join(', ')}>
      <View style={[styles.bannerCard, { borderColor: a.rim, boxShadow: `0 0 12px ${a.rim}66` }]}>
        <Image source={source} style={styles.cover} resizeMode="cover" accessibilityIgnoresInvertColors />
        {b.showText && <LinearGradient colors={['rgba(14,6,34,0.86)', 'rgba(14,6,34,0.55)', 'rgba(14,6,34,0)']} start={{ x: 0, y: 0 }} end={{ x: 0.75, y: 0 }} style={StyleSheet.absoluteFill} />}
        <Gloss radius={18} strength={0.12} />
        <View style={styles.bannerBody}>
          {b.showText && (
            <View style={{ maxWidth: '62%', gap: 4 }}>
              <Text style={styles.bannerTitle} numberOfLines={2}>
                {b.title}
              </Text>
              {!!b.subtitle && (
                <Text style={styles.bannerSub} numberOfLines={2}>
                  {b.subtitle}
                </Text>
              )}
            </View>
          )}
          {!!b.cta && !!href && (
            <LinearGradient colors={a.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bannerCta, !b.showText && styles.bannerCtaAlone]}>
              <Text style={[styles.bannerCtaText, { color: a.ink }]} numberOfLines={1}>
                {b.cta}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={a.ink} />
            </LinearGradient>
          )}
        </View>
      </View>
    </PressableScale>
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

/** Each place's colours: ring, rank badge and pedestal (silver-violet, gold, rose), as the owners' design has them. */
const PLACE = {
  1: { ring: '#FFC24A', glow: 'rgba(255,190,60,0.85)', badge: ['#FFE58A', '#F2A81D'] as const, badgeInk: '#3A2400', ped: ['#F7C548', '#B9750C', '#5E3A05'] as const, pedRim: '#FFE08A' },
  2: { ring: '#B8A8FF', glow: 'rgba(160,140,255,0.7)', badge: ['#FFFFFF', '#C9CCE0'] as const, badgeInk: '#1E2A5A', ped: ['#6A48E8', '#3A1E9C', '#1E0F5C'] as const, pedRim: '#9F8BFF' },
  3: { ring: '#FF9EB6', glow: 'rgba(255,120,170,0.7)', badge: ['#FFE2CF', '#E9A27A'] as const, badgeInk: '#4A1A08', ped: ['#E04BB4', '#8E1C78', '#4A0C44'] as const, pedRim: '#FF8BD8' },
} as const;

function BoardCard({ s }: { s: BoardSlide }) {
  const styles = useStyles();
  const b = BOARD[s.id];
  const [picked, setPicked] = useState<BoardPeriod | null>(null);
  // Until a period is picked, the shortest one that has anybody on it.
  const period = picked ?? PERIODS.find((p) => s.rows[p.key].length > 0)?.key ?? 'day';
  const rows = s.rows[period];
  const screen = PERIODS.find((p) => p.key === period)!.screen;
  // Podium order: second, first, third. A place nobody holds yet still shows ("Sıra boş").
  const podium = [rows[1], rows[0], rows[2]];
  return (
    <PressableScale to={0.98} onPress={() => router.push(`/siralama?board=${b.screen}&period=${screen}` as Href)} accessibilityRole="button" accessibilityLabel={`${b.title}, tam sıralama`}>
      <LinearGradient colors={NEON.rim} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rim}>
        <LinearGradient colors={NEON.fill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.boardFill}>
          {/* The owners' design (25 Nov 2026): the board's picture, its name and what it counts, the period switch on
              the right; a fine line; then the three on their glowing pedestals. */}
          <View style={styles.boardHead}>
            <Image source={b.art} style={styles.boardArt} resizeMode="contain" accessibilityIgnoresInvertColors />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.boardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {b.title}
              </Text>
              <Text style={styles.boardSub} numberOfLines={2}>
                {b.sub}
              </Text>
            </View>
          </View>
          <View style={styles.periods} accessibilityRole="tablist">
            {PERIODS.map((p) => (
              <Pressable key={p.key} onPress={() => setPicked(p.key)} hitSlop={6} accessibilityRole="tab" accessibilityState={{ selected: p.key === period }} style={[styles.period, p.key === period && styles.periodOn]}>
                <Text style={[styles.periodText, p.key === period && styles.periodTextOn]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.boardRule} />
          <View style={styles.podium}>
            {podium.map((r, i) => {
              const rank = (i === 1 ? 1 : i === 0 ? 2 : 3) as 1 | 2 | 3;
              const first = rank === 1;
              const p = PLACE[rank];
              const face = first ? 58 : 48;
              const crownW = first ? 50 : 36;
              return (
                <View key={r?.id ?? `empty${rank}`} style={[styles.place, first && styles.placeFirst]} accessible accessibilityLabel={r ? `${rank}. ${r.name}, ${compact(r.score)}` : `${rank}. sıra boş`}>
                  <Image source={PODIUM.crown[rank - 1]} style={{ width: crownW, height: crownW / PODIUM.crownRatio[rank - 1], marginBottom: -4, zIndex: 2 }} resizeMode="contain" />
                  <View style={{ zIndex: 2 }}>
                    {first && (
                      <>
                        <Image source={PODIUM.laurel} style={[styles.laurel, { left: -27 }]} resizeMode="contain" />
                        <Image source={PODIUM.laurel} style={[styles.laurel, { right: -27, transform: [{ scaleX: -1 }] }]} resizeMode="contain" />
                      </>
                    )}
                    <View style={[styles.faceRing, { borderColor: p.ring, boxShadow: `0 0 10px ${p.glow}`, borderRadius: face / 2 + 4 }]}>
                      {r ? (
                        <Avatar uri={r.avatar || undefined} name={r.name} size={face} />
                      ) : (
                        <View style={[styles.emptyFace, { width: face, height: face, borderRadius: face / 2 }]}>
                          <Ionicons name="person" size={face * 0.5} color="rgba(255,255,255,0.45)" />
                        </View>
                      )}
                    </View>
                    <LinearGradient colors={p.badge} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.rank, first && styles.rankFirst]}>
                      <Text style={[styles.rankText, { color: p.badgeInk }]}>{rank}</Text>
                    </LinearGradient>
                  </View>
                  {/* The pedestal: a tilted glowing block behind the name and the score. */}
                  <View style={[styles.pedestal, first && styles.pedestalFirst]}>
                    <View style={[styles.pedShape, { boxShadow: `0 0 14px ${p.glow}` }]} pointerEvents="none">
                      <LinearGradient colors={p.ped} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 10, borderTopWidth: 2, borderColor: p.pedRim }]} />
                    </View>
                    <Text style={[styles.name, first && styles.nameFirst, !r && styles.emptyText]} numberOfLines={1}>
                      {r ? r.name : 'Sıra boş'}
                    </Text>
                    {r ? (
                      <View style={styles.score}>
                        <Icon3D name={b.unit} size={14} />
                        <Text style={styles.scoreText}>{compact(r.score)}</Text>
                      </View>
                    ) : (
                      <Text style={[styles.scoreText, styles.emptyText]}>—</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
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

  bannerCard: { height: CARD_H, borderRadius: 20, overflow: 'hidden', borderWidth: 1.5, backgroundColor: '#140A30' },
  bannerBody: { flex: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  bannerTitle: { color: '#fff', fontSize: 23, lineHeight: 27, fontFamily: fonts.display, textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  bannerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 17 },
  bannerCta: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, boxShadow: '0 4px 12px rgba(0,0,0,0.35)' },
  bannerCtaAlone: { position: 'absolute', left: 16, bottom: 14 },
  bannerCtaText: { fontSize: 13, fontWeight: '800' },

  rim: { height: CARD_H, borderRadius: 20, padding: 1.5 },
  boardFill: { flex: 1, borderRadius: 18.5, overflow: 'hidden', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 },
  boardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 4 },
  boardArt: { width: 40, height: 40 },
  boardTitle: { color: '#fff', fontSize: 17, fontFamily: fonts.display },
  // Room on its right for the period switch below the title.
  boardSub: { color: 'rgba(255,255,255,0.72)', fontSize: 11.5, lineHeight: 14, marginTop: 1, marginRight: 112 },
  periods: { position: 'absolute', right: 10, top: 32, flexDirection: 'row', padding: 2, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.06)' },
  period: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1.5, borderColor: 'transparent' },
  periodOn: { borderColor: '#FF4FD8', backgroundColor: 'rgba(255,60,200,0.16)', boxShadow: '0 0 8px rgba(255,60,210,0.7)' },
  periodText: { color: 'rgba(255,255,255,0.82)', fontSize: 11.5, fontWeight: '700' },
  periodTextOn: { color: '#fff' },
  boardRule: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 8, marginBottom: 2 },

  podium: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 },
  place: { flex: 1, alignItems: 'center' },
  placeFirst: { flex: 1.15 },
  faceRing: { padding: 2, borderWidth: 2.5, backgroundColor: 'rgba(20,10,48,0.9)' },
  laurel: { position: 'absolute', top: -2, width: 25, height: 25 / (50 / 138) },
  rank: { position: 'absolute', right: -5, bottom: -3, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' },
  rankFirst: { width: 22, height: 22, borderRadius: 11, boxShadow: '0 0 6px rgba(255,200,60,0.9)' },
  rankText: { fontSize: 12, fontWeight: '900' },
  pedestal: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: -6, paddingTop: 9, paddingBottom: 5, minHeight: 44 },
  pedestalFirst: { minHeight: 50 },
  // A block narrower at the top, as if seen from above (the design's stage).
  pedShape: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 10, transform: [{ perspective: 220 }, { rotateX: '24deg' }] },
  name: { color: '#fff', fontSize: 13.5, fontWeight: '800', maxWidth: '92%' },
  nameFirst: { fontSize: 14.5 },
  score: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  scoreText: { color: '#fff', fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  emptyFace: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  emptyText: { color: 'rgba(255,255,255,0.72)' },
  none: { flex: 1, color: 'rgba(255,255,255,0.75)', fontSize: 13, textAlign: 'center', textAlignVertical: 'center', paddingTop: 30 },
}));
