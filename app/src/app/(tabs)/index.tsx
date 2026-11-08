import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { ActionSheet } from '@/components/ActionSheet';
import { Art, artSource } from '@/components/Art';
import { FloatIcon } from '@/components/fx/float';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop, DepthCard, EdgeLight, Glass, Gloss, PressableScale, Shine, glow } from '@/components/fx/surface';
import { icon3dSource } from '@/components/Icon3D';
import { SimilarityChip, SimilarityRing } from '@/components/similarity';
import { Avatar, Button } from '@/components/ui';
import { roomCode } from '@/data/catalog';
import { ROOMS, USERS, userById, type Room, type User } from '@/data/mock';
import {
  COUNTRIES,
  ROOM_BANNER,
  ROOM_EVENTS,
  ROOM_TABS,
  countryFlag,
  isMemberRoom,
  matchesTab,
  popularScore,
  roomAnnouncement,
  roomBadge,
  roomCountry,
  roomExtra,
  roomTagLabel,
  type CountryId,
  type RoomTab,
} from '@/data/rooms-ui';
import { StarterPath } from '@/components/starter';
import { closestRooms, type RoomMatch } from '@/lib/closest';
import { similarity } from '@/lib/similarity';
import { useApp } from '@/store';
import { isLockedRoom, liveMode, oneOnOneOpen, reloadServerRooms, useServerRooms, useServerRoomsState } from '@/lib/live';
import { TAB_BAR_HEIGHT, ThemeScope, fonts, makeStyles, useTheme } from '@/theme';
import { Photo } from '@/components/photo';

type MainTab = 'mine' | 'rec';
type MineTab = 'recent' | 'joined' | 'following';
const MINE_TABS: { key: MineTab; label: string }[] = [
  { key: 'recent', label: 'Son Ziyaretler' },
  { key: 'joined', label: 'Katıl' },
  { key: 'following', label: 'Takip Et' },
];
type Suggestion = { r: Room; reason: string; why: keyof typeof Ionicons.glyphMap };

export default function RoomsScreen() {
  const { coins, checkedInToday, notifications, following, recentRooms, blocked, me, myRoom, agencyId, familyId } = useApp();
  const [main, setMain] = useState<MainTab>('rec');
  const [mineTab, setMineTab] = useState<MineTab>('recent');
  const [cat, setCat] = useState<RoomTab>('Popüler');
  const [country, setCountry] = useState<CountryId>('ALL');
  const [sheet, setSheet] = useState<'events' | 'country' | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [headerH, setHeaderH] = useState(64);
  const insets = useSafeAreaInsets();
  const { colors, semantic, gradient } = useTheme();
  const styles = useStyles();

  // Live mode (test APK): only the rooms real people opened on our server; the demo rooms and people stay out.
  const live = liveMode();
  const serverRooms = useServerRooms();
  const roomsState = useServerRoomsState();
  const visible = (live ? serverRooms : ROOMS).filter((r) => !blocked.has(r.hostId));
  // The home screen leads with the open room whose host has the most in common with you (lib/closest); a
  // password room is never offered there.
  const closest = closestRooms(me, visible.filter((r) => !isLockedRoom(r.id)), userById, { following, recent: recentRooms, blocked })[0];
  // Live: my own open room on the server ("Odam"), and where the starter's "join a room" step leads.
  const myLive = live ? serverRooms.find((r) => r.hostId === 'me') : undefined;
  const starterRoom = live && closest ? (`/oda/${closest.room.id}` as const) : undefined;

  // Personalized suggestions with an explanation; blocked hosts and private rooms are excluded.
  const suggestions: Suggestion[] = visible
    .filter((r) => !locked(r) && r.id !== closest?.room.id)
    .map((r) => {
      const reason = following.has(r.hostId)
        ? `Takip ettiğin ${userById(r.hostId).name} burada`
        : recentRooms.includes(r.id)
          ? 'Son ziyaret ettiğin oda'
          : me.interests?.some((i) => i.includes(r.category) || r.tags.some((t) => i.includes(t)))
            ? `İlgi alanın: ${r.category}`
            : r.listeners > 300
              ? 'Şu an çok hareketli'
              : '';
      const score = (following.has(r.hostId) ? 3 : 0) + (recentRooms.includes(r.id) ? 2 : 0) + (reason.startsWith('İlgi') ? 1 : 0) + r.listeners / 1000;
      // The icon says which kind of reason it is, so the line reads at a glance.
      const why: Suggestion['why'] = following.has(r.hostId) ? 'person' : recentRooms.includes(r.id) ? 'time' : reason.startsWith('İlgi') ? 'sparkles' : 'flame';
      return { r, reason, why, score };
    })
    .filter((x) => x.reason)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const recRooms = visible
    .filter((r) => matchesTab(r, cat) && (country === 'ALL' || roomCountry(r.id) === country))
    .sort((a, b) => (cat === 'Popüler' ? popularScore(b) - popularScore(a) : b.listeners - a.listeners));

  const mineRooms =
    mineTab === 'recent'
      ? recentRooms.map((id) => visible.find((r) => r.id === id)).filter((r): r is Room => !!r)
      : mineTab === 'joined'
        ? visible.filter((r) => isMemberRoom(r.id, agencyId, familyId))
        : visible.filter((r) => following.has(r.hostId));

  // "Benzerlerin": people online right now, the closest matches first.
  const similarPeople = (live ? [] : USERS).filter((u) => u.online && !blocked.has(u.id) && u.id !== 'me')
    .map((u) => ({ u, score: similarity(me, u).score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  const unreadNotices = notifications.filter((n) => !n.read).length;
  const events = ROOM_EVENTS.filter((e) => visible.some((r) => r.id === e.roomId));

  const emptyText =
    main === 'rec'
      ? live
        ? roomsState === 'loading'
          ? 'Odalar yükleniyor…'
          : 'Şu an açık oda yok. Sağ alttaki + ile ilk odayı sen aç.'
        : 'Bu kategoride şu an açık oda yok.'
      : mineTab === 'recent'
        ? 'Henüz bir odaya girmedin.'
        : mineTab === 'joined'
          ? 'Üyesi olduğun oda yok.'
          : 'Takip ettiğin kimse şu an oda açmamış.';

  const header = (
    <Glass style={[styles.headerBar, { paddingTop: insets.top }]}>
      <View style={styles.header} onLayout={(e) => setHeaderH(e.nativeEvent.layout.height + insets.top)}>
        {/* A compact segment instead of two oversized tab titles; the screen's identity is the match card below. */}
        <View style={styles.segment} accessibilityRole="tablist">
          {(
            [
              ['rec', 'Sana yakın'],
              ['mine', 'Odalarım'],
            ] as const
          ).map(([key, label]) => (
            <Pressable key={key} onPress={() => setMain(key)} hitSlop={4} style={[styles.segItem, main === key && styles.segItemOn]} accessibilityRole="tab" aria-selected={main === key}>
              <Text style={[styles.segText, main === key && styles.segTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.headerIcons}>
          <Pressable onPress={() => router.push('/siralama')} hitSlop={6} accessibilityLabel="Sıralama">
            <Ionicons name="trophy-outline" size={21} color={colors.gold} />
          </Pressable>
          <Pressable onPress={() => setSheet('events')} hitSlop={6} accessibilityLabel="Etkinlikler">
            <Ionicons name="calendar-outline" size={21} color={colors.text} />
            {events.length > 0 && <View style={[styles.dot, { backgroundColor: semantic.action }]} />}
          </Pressable>
          <Pressable onPress={() => setSearchOpen(true)} hitSlop={6} accessibilityLabel="Oda ara">
            <Ionicons name="search" size={22} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => router.push('/bildirimler')} hitSlop={6} accessibilityLabel="Bildirimler">
            <Ionicons name="notifications" size={22} color={colors.text} />
            {unreadNotices > 0 && <View style={styles.dot} />}
          </Pressable>
        </View>
      </View>
    </Glass>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop scene={SCENES.home} />
      <FlatList
        data={main === 'rec' ? recRooms : mineRooms}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ gap: 12, paddingTop: headerH + 8, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 96 }}
        scrollIndicatorInsets={{ top: headerH }}
        ListHeaderComponent={
          main === 'rec' ? (
            <View style={{ gap: 14, paddingBottom: 4 }}>
              <StarterPath roomHref={starterRoom} />
              {closest && <ClosestRoomCard match={closest} />}
              <QuickStrip coins={coins} checkedInToday={checkedInToday} />
              {similarPeople.length > 0 && <SimilarPeople people={similarPeople} rooms={visible} />}
              <SuggestionsRow items={suggestions} />
              <CategoryBar cat={cat} onCat={setCat} countryFlag={country === 'ALL' ? null : countryFlag(country)} onCountry={() => setSheet('country')} />
            </View>
          ) : (
            <View style={{ gap: 14, paddingBottom: 4 }}>
              {live ? (
                // Live: my room as the server has it, or the way to open one (the create sheet at /oda/yeni).
                <MyRoomCard
                  title={myLive?.title ?? 'Odanı aç'}
                  announcement={myLive ? (myLive.announcement ?? '') : 'Ad, tür ve istersen şifre seç; odan hemen açılsın.'}
                  cover=""
                  locked={!!myLive && isLockedRoom(myLive.id)}
                  avatar={me.avatar}
                  listeners={myLive?.listeners ?? 0}
                />
              ) : (
                <MyRoomCard title={myRoom.title} announcement={myRoom.announcement} cover={myRoom.cover} locked={myRoom.locked} avatar={me.avatar} />
              )}
              <View style={styles.subTabs}>
                {MINE_TABS.map((t) => (
                  <Pressable key={t.key} onPress={() => setMineTab(t.key)} hitSlop={6} style={{ alignItems: 'center' }}>
                    <Text style={[styles.subTab, mineTab === t.key && styles.subTabActive]}>{t.label}</Text>
                    <View style={[styles.underlineSm, mineTab !== t.key && { opacity: 0 }]} />
                  </Pressable>
                ))}
              </View>
            </View>
          )
        }
        ListEmptyComponent={
          live && roomsState === 'failed' ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Bağlantı kurulamadı</Text>
              <Text style={styles.errorText}>Odalar şu an yüklenemedi. İnternetini kontrol edip tekrar dene.</Text>
              <Button title="Tekrar dene" icon="refresh" small variant="tonal" onPress={reloadServerRooms} />
            </View>
          ) : (
            <Text style={styles.empty}>{emptyText}</Text>
          )
        }
        ListFooterComponent={main === 'mine' ? <PromoBanner /> : undefined}
        renderItem={({ item }) => <RoomRow room={item} match={similarity(me, userById(item.hostId)).score} />}
      />

      {/* Glass blurs what is already drawn beneath it, so the header comes after the list. */}
      {header}

      <View style={[styles.fab, { bottom: TAB_BAR_HEIGHT + insets.bottom + 18 }]}>
        <PressableScale to={0.9} onPress={() => router.push('/oda/yeni')} accessibilityLabel="Oda oluştur">
          <LinearGradient colors={gradient} style={[styles.fabInner, glow('rgba(19,217,223,0.5)', 14, 4)]}>
            <Gloss />
            <Ionicons name="add" size={30} color={semantic.actionInk} />
          </LinearGradient>
        </PressableScale>
      </View>

      <ActionSheet
        visible={sheet === 'events'}
        title={events.length ? 'Yaklaşan etkinlikler' : 'Yaklaşan etkinlik yok'}
        titleArt={events.length ? artSource('ana-yaklasan-etkinlikler') : undefined}
        options={events.map((e) => ({ label: `${e.when} · ${e.title}`, onPress: () => router.push(`/oda/${e.roomId}`) }))}
        onClose={() => setSheet(null)}
      />
      <ActionSheet
        visible={sheet === 'country'}
        title="Ülke seç"
        options={COUNTRIES.map((c) => ({ label: `${c.flag} ${c.name}${c.id === country ? '  ✓' : ''}`, onPress: () => setCountry(c.id) }))}
        onClose={() => setSheet(null)}
      />
      <RoomSearch visible={searchOpen} rooms={visible} onClose={() => setSearchOpen(false)} />
    </View>
  );
}

/** A demo room with its own password, or a live room that asks for one on the server. */
const locked = (r: Room) => !!r.password || isLockedRoom(r.id);

const WHY_ICON: Record<RoomMatch['why'], keyof typeof Ionicons.glyphMap> = { person: 'person', time: 'time', sparkles: 'sparkles', location: 'location', flame: 'flame' };

/** The screen's lead: the open room whose host has the most in common with you, and why (lib/closest). */
function ClosestRoomCard({ match }: { match: RoomMatch }) {
  const { room, host, score, reason, why } = match;
  const { colors, semantic, gradient } = useTheme();
  const styles = useStyles();
  return (
    <PressableScale style={{ marginHorizontal: 16 }} to={0.98} onPress={() => router.push(`/oda/${room.id}`)} accessibilityRole="button" accessibilityLabel={`Sana en yakın oda: ${room.title}, yüzde ${score} benzer. ${reason}. Katıl`}>
      <DepthCard style={[styles.hero, glow('rgba(19,217,223,0.22)', 24, 8)]}>
        <View style={styles.heroCover}>
          <Photo uri={room.cover} kind="cover" seed={room.id} style={styles.heroImg} />
          <LinearGradient colors={['rgba(8,15,30,0.1)', 'rgba(8,15,30,0.25)', 'rgba(8,15,30,0.92)']} style={StyleSheet.absoluteFill} />
          <View style={styles.heroKicker}>
            <Ionicons name="compass" size={12} color={semantic.action} />
            <Text style={styles.heroKickerText}>SANA EN YAKIN ODA</Text>
          </View>
          <View style={styles.heroScore}>
            <Text style={styles.heroPct}>%{score}</Text>
            <Text style={styles.heroPctCap}>benzer</Text>
          </View>
          <View style={[styles.liveBadge, { left: 12, bottom: 12 }]}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{room.listeners.toLocaleString('tr-TR')}</Text>
          </View>
        </View>
        <View style={styles.heroBody}>
          <View style={styles.heroHost}>
            <Avatar uri={host.avatar} name={host.name} size={44} />
            <SimilarityRing score={score} size={44} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.heroTitle} numberOfLines={1}>
              {room.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name={WHY_ICON[why]} size={12} color={why === 'person' ? colors.pink : why === 'flame' ? colors.gold : colors.primaryText} />
              <Text style={[styles.suggestWhy, { flexShrink: 1 }]} numberOfLines={1}>
                {host.name} · {reason}
              </Text>
            </View>
          </View>
          <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroJoin}>
            <Gloss strength={0.3} />
            <Text style={styles.heroJoinText}>Katıl</Text>
          </LinearGradient>
        </View>
        <Shine radius={18} every={8000} />
      </DepthCard>
    </PressableScale>
  );
}

// Shortcuts as a shelf of objects standing on their own light, not a row of small chips. Four, not five:
// the game hub already lists every game, so the shelf doesn't feature one.
function QuickStrip({ coins, checkedInToday }: { coins: number; checkedInToday: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const items: { key: string; source: number | undefined; hue: string; label: string; a11y?: string; onPress: () => void; dot?: boolean }[] = [
    { key: 'coins', source: icon3dSource('coin'), hue: '#F6BD60', label: coins.toLocaleString('tr-TR'), a11y: 'Cüzdan', onPress: () => router.push('/cuzdan') },
    ...(oneOnOneOpen() ? [{ key: 'match', source: icon3dSource('bolt'), hue: '#13D9DF', label: 'Hemen Tanış', onPress: () => router.push('/eslesme') }] : []),
    { key: 'games', source: artSource('ana-oyun-merkezi'), hue: '#FF6576', label: 'Oyun merkezi', onPress: () => router.push('/oyunlar') },
    { key: 'tasks', source: artSource('ana-gorevler'), hue: '#A78BFA', label: 'Görevler', onPress: () => router.push('/gorevler'), dot: !checkedInToday },
  ];
  return (
    <View style={styles.shelf}>
      {items.map((it, i) => (
        <View key={it.key} style={{ flex: 1 }}>
          <PressableScale style={styles.shelfItem} onPress={it.onPress} accessibilityLabel={it.a11y ?? it.label}>
            <View>
              <FloatIcon source={it.source} size={42} hue={it.hue} bob delay={i * 280} />
              {it.dot && <View style={[styles.dot, { top: 0, right: 0 }]} />}
            </View>
            <Text style={[styles.shelfText, it.key === 'coins' && { color: colors.gold }]} numberOfLines={1}>
              {it.label}
            </Text>
          </PressableScale>
        </View>
      ))}
    </View>
  );
}

function CategoryBar({ cat, onCat, countryFlag: flag, onCountry }: { cat: RoomTab; onCat: (c: RoomTab) => void; countryFlag: string | null; onCountry: () => void }) {
  const { colors, gradientDeep, surface, dark } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.catBar}>
      <View style={{ flex: 1 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 20, paddingLeft: 16, paddingRight: 28 }}>
          {ROOM_TABS.map((c) => (
            <Pressable key={c} onPress={() => onCat(c)} style={{ alignItems: 'center' }}>
              <Text style={[styles.catText, c === cat && styles.catTextActive]}>{c}</Text>
              <View style={[styles.underlineSm, c !== cat && { opacity: 0 }]} />
            </Pressable>
          ))}
        </ScrollView>
        {/* A soft fade over the photo backdrop, never a solid block: it starts clear and stays see-through. */}
        <LinearGradient
          colors={[`rgba(${surface.veil},0)`, `rgba(${surface.veil},0.35)`, `rgba(${surface.veil},0.7)`]}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.catFade}
        />
      </View>
      {/* Aile (groups) is local-only: a live build doesn't offer it until the server has it. */}
      {!liveMode() && (
        <Pressable onPress={() => router.push('/aile')} hitSlop={6} accessibilityLabel="Grup oluştur / katıl">
          <LinearGradient colors={gradientDeep} style={styles.catIcon}>
            <Ionicons name="people" size={18} color="#fff" />
            <View style={styles.plusBadge}>
              <Ionicons name="add" size={10} color={colors.primaryText} />
            </View>
          </LinearGradient>
        </Pressable>
      )}
      <Pressable onPress={onCountry} hitSlop={6} accessibilityLabel="Ülke seç" style={{ marginRight: 16 }}>
        <View style={[styles.catIcon, { backgroundColor: colors.cardAlt }]}>
          {flag ? <Text style={{ fontSize: 18 }}>{flag}</Text> : <Ionicons name="globe" size={20} color={dark ? '#38BDF8' : '#0284C7'} />}
        </View>
      </Pressable>
    </View>
  );
}

/** "Benzerlerin": people online now, closest match first, each wearing the same bead ring as room seats. */
function SimilarPeople({ people, rooms }: { people: { u: User; score: number }[]; rooms: Room[] }) {
  const { semantic } = useTheme();
  const styles = useStyles();
  if (people.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.sectionRow}>
        <Text style={[styles.section, { paddingHorizontal: 0 }]}>Benzerlerin</Text>
        <Text style={styles.sectionHint}>şu an çevrimiçi</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.glowRoom} contentContainerStyle={[{ gap: 14, paddingHorizontal: 16 }, styles.glowRoomInner]}>
        {people.map(({ u, score }) => {
          const hosted = rooms.find((r) => r.hostId === u.id);
          return (
            <PressableScale
              key={u.id}
              style={styles.person}
              onPress={() => router.push(hosted ? `/oda/${hosted.id}` : `/kullanici/${u.id}`)}
              accessibilityLabel={`${u.name}, yüzde ${score} benzer${hosted ? ', odasına git' : ', profili aç'}`}
            >
              <View style={styles.personAvatar}>
                <Avatar uri={u.avatar} name={u.name} size={54} />
                <SimilarityRing score={score} size={54} />
                {hosted && (
                  <View style={styles.personLive}>
                    <Ionicons name="mic" size={9} color={semantic.liveInk} />
                  </View>
                )}
              </View>
              <Text style={styles.hostName} numberOfLines={1}>
                {u.name}
              </Text>
              <Text style={[styles.personPct, score >= 70 && { color: semantic.actionText }]}>%{score}</Text>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

function SuggestionsRow({ items }: { items: Suggestion[] }) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (items.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.sectionRow}>
        <Art name="ana-senin-icin" size={24} />
        <Text style={[styles.section, { paddingHorizontal: 0 }]}>Sana göre</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.glowRoom} contentContainerStyle={[{ gap: 10, paddingHorizontal: 16 }, styles.glowRoomInner]}>
        {items.map(({ r, reason, why }) => (
          <PressableScale key={r.id} style={styles.suggest} onPress={() => router.push(`/oda/${r.id}`)}>
            <View style={styles.suggestFrame}>
              <Photo uri={r.cover} kind="cover" seed={r.id} style={styles.suggestImg} />
              <LinearGradient colors={['rgba(8,15,30,0)', 'rgba(8,15,30,0.55)']} style={styles.suggestFade} />
              <EdgeLight inset={10} strength={0.35} />
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>{r.listeners}</Text>
              </View>
            </View>
            <Text style={styles.suggestTitle} numberOfLines={1}>
              {r.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name={why} size={12} color={why === 'person' ? colors.pink : why === 'flame' ? colors.gold : colors.primaryText} />
              <Text style={[styles.suggestWhy, { flexShrink: 1 }]} numberOfLines={1}>
                {reason}
              </Text>
            </View>
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}

function MyRoomCard({ title, announcement, cover, locked, avatar, listeners = 0 }: { title: string; announcement: string; cover: string; locked: boolean; avatar: string; listeners?: number }) {
  const { colors, semantic, dark } = useTheme();
  const styles = useStyles();
  return (
    <Pressable style={{ marginHorizontal: 16 }} onPress={() => router.push('/oda/yeni')}>
      <LinearGradient colors={[dark ? '#123B3A' : '#DDF2F1', colors.card]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.myRoom}>
        <Photo uri={cover || avatar} kind="cover" style={styles.myCover} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={styles.titleRow}>
            <Text style={styles.flag}>🇹🇷</Text>
            {locked && <Ionicons name="lock-closed" size={13} color={colors.gold} />}
            <Text style={[styles.roomTitle, { fontSize: 17 }]} numberOfLines={1}>
              {title || 'Odam'}
            </Text>
          </View>
          <View style={styles.titleRow}>
            <View style={styles.odamChip}>
              <Text style={styles.odamText}>Odam</Text>
            </View>
            <Text style={[styles.announce, { flex: 1 }]} numberOfLines={1}>
              {announcement || 'Similar yolculuğuna başla!'}
            </Text>
          </View>
          <View style={[styles.listeners, { alignSelf: 'flex-end', marginTop: 8 }]}>
            <Ionicons name="stats-chart" size={13} color={semantic.actionText} />
            <Text style={styles.listenerText}>{listeners.toLocaleString('tr-TR')}</Text>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function PromoBanner() {
  const styles = useStyles();
  return (
    <Pressable style={{ marginHorizontal: 16, marginTop: 4 }} onPress={() => router.push('/seviye')}>
      <LinearGradient colors={ROOM_BANNER.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.bannerTitle}>{ROOM_BANNER.title}</Text>
          <Text style={styles.bannerSub}>{ROOM_BANNER.sub}</Text>
        </View>
        <FloatIcon source={icon3dSource('mic')} size={64} hue="#7DD3FC" bob />
      </LinearGradient>
    </Pressable>
  );
}

const TOP_BG = ['#4A3510', '#241A3D'] as const;

function RoomRow({ room, match }: { room: Room; /** How close the host is to you (lib/similarity). */ match: number }) {
  const styles = useStyles();
  const x = roomExtra(room.id);
  // Only the week's top room keeps the lit card; rank badges on every row read as a leaderboard, not a home.
  const top = x.top === 1;
  const content = <RoomRowBody room={room} match={match} pk={x.pk} />;
  return (
    <PressableScale style={{ marginHorizontal: 16 }} to={0.98} onPress={() => router.push(`/oda/${room.id}`)} accessibilityHint={top ? 'Haftanın en iyi odası' : undefined}>
      {top ? (
        <DepthCard tint={TOP_BG} style={[styles.roomCard, styles.roomCardTop, glow('rgba(246,189,96,0.18)', 22, 6)]}>
          {/* The top room's card is night gold in both schemes, so what sits on it reads in the dark one. */}
          <ThemeScope scheme="dark">{content}</ThemeScope>
          <Shine delay={900} every={6400} />
        </DepthCard>
      ) : (
        <DepthCard style={styles.roomCard}>{content}</DepthCard>
      )}
    </PressableScale>
  );
}

function RoomRowBody({ room, match, pk }: { room: Room; match: number; pk?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const badge = roomBadge(room.id);
  return (
    <>
      <View style={styles.coverFrame}>
        <Photo uri={room.cover} kind="cover" seed={room.id} style={styles.cover} />
        <EdgeLight inset={8} strength={0.4} />
        {/* The live count rides on the cover like the hero and suggestion cards, so the chip row never overflows. */}
        <View style={styles.liveBadge} accessibilityLabel={`${room.listeners} kişi dinliyor`}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{room.listeners.toLocaleString('tr-TR')}</Text>
        </View>
      </View>
      <View style={{ flex: 1, gap: 5, justifyContent: 'center' }}>
        <View style={styles.titleRow}>
          <Text style={styles.flag}>{countryFlag(roomCountry(room.id))}</Text>
          {locked(room) && <Ionicons name="lock-closed" size={13} color={colors.gold} accessibilityLabel="Şifreli oda" />}
          <Text style={styles.roomTitle} numberOfLines={1}>
            {room.title}
          </Text>
        </View>
        <Text style={styles.announce} numberOfLines={1}>
          {roomAnnouncement(room)}
        </Text>
        <View style={styles.chipRow}>
          {badge && (
            <LinearGradient colors={badge.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.badgeChip}>
              <Gloss strength={0.3} />
              <Text style={{ fontSize: 11 }}>{badge.emoji}</Text>
              <Text style={styles.badgeText} numberOfLines={1}>
                {badge.label}
              </Text>
            </LinearGradient>
          )}
          <SimilarityChip score={match} />
          {!badge && (
            <View style={styles.tagChip}>
              <Text style={styles.tagText}>{roomTagLabel(room)}</Text>
            </View>
          )}
          {pk && (
            <LinearGradient colors={['#FF6576', '#0E7C9A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.pkPill}>
              <Gloss strength={0.35} />
              <Text style={styles.pkText}>PK</Text>
            </LinearGradient>
          )}
        </View>
      </View>
    </>
  );
}

function RoomSearch({ visible, rooms, onClose }: { visible: boolean; rooms: Room[]; onClose: () => void }) {
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const close = () => {
    setQ('');
    onClose();
  };
  const needle = q.trim().toLocaleLowerCase('tr-TR');
  const results = (
    needle
      ? rooms.filter((r) => r.title.toLocaleLowerCase('tr-TR').includes(needle) || roomCode(r.id).includes(needle) || r.id === needle)
      : rooms
  )
    .slice()
    .sort((a, b) => b.listeners - a.listeners);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      {/* Above the system navigation bar too (edge-to-edge Android draws the sheet under it). */}
      <View style={[styles.searchSheet, { paddingBottom: Math.max(34, insets.bottom + 8) }]}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textDim} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Oda adı veya oda ID"
            placeholderTextColor={colors.textDim}
            style={styles.searchInput}
            autoFocus
            returnKeyType="search"
          />
          {q.length > 0 && (
            <Pressable onPress={() => setQ('')} hitSlop={6}>
              <Ionicons name="close-circle" size={18} color={colors.textDim} />
            </Pressable>
          )}
        </View>
        <Text style={styles.searchHint}>{needle ? `${results.length} sonuç` : 'Popüler odalar'}</Text>
        <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>
          {results.map((r) => (
            <Pressable
              key={r.id}
              style={({ pressed }) => [styles.searchRow, pressed && { backgroundColor: colors.cardAlt }]}
              onPress={() => {
                close();
                router.push(`/oda/${r.id}`);
              }}
            >
              <Photo uri={r.cover} kind="cover" seed={r.id} style={styles.searchCover} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.titleRow}>
                  {locked(r) && <Ionicons name="lock-closed" size={12} color={colors.gold} accessibilityLabel="Şifreli oda" />}
                  <Text style={styles.roomTitle} numberOfLines={1}>
                    {r.title}
                  </Text>
                </View>
                <Text style={styles.announce}>ID: {roomCode(r.id)}</Text>
              </View>
              <View style={styles.listeners}>
                <Ionicons name="stats-chart" size={12} color={semantic.actionText} />
                <Text style={styles.listenerText}>{r.listeners}</Text>
              </View>
            </Pressable>
          ))}
          {results.length === 0 && <Text style={styles.empty}>Eşleşen oda bulunamadı.</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

// Shadow under cards and photo frames: deep and black at night, a soft navy lift on paper.
const SOFT_SHADOW = '0 1px 2px rgba(16,36,64,0.05), 0 6px 16px rgba(16,36,64,0.06)';

const useStyles = makeStyles(({ colors, semantic, surface, lift, ink, dark }) => ({
  headerBar: { position: 'absolute', top: 0, left: 0, right: 0, borderBottomWidth: 1, borderBottomColor: ink(0.06) },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
  // header segment
  segment: { flexDirection: 'row', backgroundColor: ink(0.06), borderRadius: 999, padding: 3, borderWidth: 1, borderColor: surface.hairline },
  segItem: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  segItemOn: { backgroundColor: semantic.action, boxShadow: '0 0 12px rgba(19,217,223,0.45)' },
  segText: { color: colors.textDim, fontFamily: fonts.displayBold, fontSize: 14, lineHeight: 18 },
  segTextOn: { color: semantic.actionInk },
  // Active tab marker: bright turquoise with a soft glow, like a lit LED.
  underlineSm: { width: 14, height: 3, borderRadius: 2, backgroundColor: semantic.action, marginTop: 3, boxShadow: '0 0 6px rgba(19,217,223,0.9)' },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  dot: { position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
  section: { color: colors.text, fontSize: 18, lineHeight: 24, fontFamily: fonts.display, paddingHorizontal: 16 },
  sectionHint: { color: colors.textDim, fontSize: 12, marginLeft: 'auto' },
  // closest room hero
  hero: { padding: 0, overflow: 'hidden', borderRadius: 18 },
  heroCover: { height: 150, overflow: 'hidden' },
  heroImg: { width: '100%', height: '100%' },
  heroKicker: { position: 'absolute', left: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(8,15,30,0.62)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(19,217,223,0.35)' },
  heroKickerText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  heroScore: { position: 'absolute', right: 14, bottom: 8, alignItems: 'flex-end' },
  heroPct: { color: '#fff', fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.6, textShadowColor: 'rgba(19,217,223,0.55)', textShadowRadius: 14 },
  // On the cover's dark fade: the night palette's dim text in both schemes.
  heroPctCap: { color: '#A3B1CF', fontSize: 11, fontWeight: '700', marginTop: -3 },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  heroHost: { width: 44, height: 44, margin: 4 },
  heroTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 17, lineHeight: 22 },
  heroJoin: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9, overflow: 'hidden' },
  heroJoinText: { color: semantic.actionInk, fontWeight: '900', fontSize: 14 },
  // similar people
  person: { alignItems: 'center', width: 66, gap: 1 },
  personAvatar: { width: 54, height: 54, margin: 5 },
  personLive: { position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9, backgroundColor: semantic.live, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  personPct: { color: colors.textDim, fontSize: 11, fontWeight: '800' },
  // quick strip
  shelf: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 4 },
  shelfItem: { alignItems: 'center', gap: 6 },
  shelfText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  // category bar
  catBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catFade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 40, pointerEvents: 'none' },
  catText: { color: colors.textDim, fontSize: 17, lineHeight: 24, fontFamily: fonts.displayBold },
  catTextActive: { color: colors.text, fontSize: 19, lineHeight: 26, fontFamily: fonts.display },
  catIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  plusBadge: { position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  hostName: { color: colors.text, fontSize: 12, marginTop: 4 },
  // suggestions
  suggest: { width: 150, gap: 4 },
  suggestFrame: { width: 150, height: 90, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: surface.hairline, boxShadow: dark ? '0 6px 16px rgba(0,0,0,0.4)' : SOFT_SHADOW },
  suggestImg: { width: '100%', height: '100%' },
  suggestFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 40 },
  liveBadge: { position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(8,15,30,0.6)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: semantic.live, boxShadow: '0 0 6px #13D9DF' },
  liveText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  suggestTitle: { color: colors.text, fontWeight: '700', fontSize: 13 },
  suggestWhy: { color: colors.textDim, fontSize: 12 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 },
  // room rows
  roomCard: { flexDirection: 'row', gap: 12, padding: 10, overflow: 'hidden' },
  roomCardTop: { borderColor: 'rgba(246,189,96,0.35)' },
  coverFrame: { width: 84, height: 84, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.cardAlt, boxShadow: dark ? '0 4px 10px rgba(0,0,0,0.35)' : SOFT_SHADOW },
  cover: { width: '100%', height: '100%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  flag: { fontSize: 14 },
  roomTitle: { color: colors.text, fontWeight: '800', fontSize: 15, flexShrink: 1 },
  announce: { color: colors.textDim, fontSize: 12 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  badgeChip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, maxWidth: 128, overflow: 'hidden' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800', flexShrink: 1 },
  tagChip: { backgroundColor: dark ? 'rgba(19,217,223,0.2)' : 'rgba(0,140,148,0.12)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { color: semantic.tonalText, fontSize: 11, fontWeight: '600' },
  pkPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  pkText: { color: '#fff', fontSize: 11, fontWeight: '900', fontStyle: 'italic' },
  listeners: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  listenerText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  empty: { color: colors.textDim, textAlign: 'center', paddingVertical: 28, paddingHorizontal: 16 },
  errorBox: { alignItems: 'center', gap: 8, paddingVertical: 28, paddingHorizontal: 24 },
  errorTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  errorText: { color: colors.textDim, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  // Benim tab
  myRoom: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border, ...(dark ? {} : { boxShadow: lift.boxShadow }) },
  myCover: { width: 92, height: 92, borderRadius: 12, backgroundColor: colors.cardAlt },
  odamChip: { backgroundColor: semantic.successFill, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  odamText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  subTabs: { flexDirection: 'row', gap: 22, paddingHorizontal: 16 },
  subTab: { color: colors.textDim, fontSize: 15, fontWeight: '600' },
  subTabActive: { color: colors.text, fontSize: 16, fontWeight: '800' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 18 },
  bannerTitle: { color: '#fff', fontSize: 18, lineHeight: 23, fontFamily: fonts.display },
  bannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  // search sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  searchSheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 34, gap: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cardAlt, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, color: colors.text, paddingVertical: 10, fontSize: 15 },
  searchHint: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12 },
  searchCover: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.cardAlt },
  fab: { position: 'absolute', right: 20 },
  // Horizontal lists clip whatever spills past their bounds; this padding gives glows and shadows room
  // to fade out, and the negative margin keeps the list's place in the layout.
  glowRoom: { marginVertical: -16 },
  glowRoomInner: { paddingVertical: 16 },
  fabInner: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
}));
