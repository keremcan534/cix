import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { SCENES } from '@/components/fx/scenes';
import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { Avatar, VerifiedBadge, VipBadge } from '@/components/ui';
import { HeartBadge } from '@/components/heart-level';
import { MessagePrefsButton } from '@/components/message-prefs';
import { CALL_HISTORY, formatDuration, formatIntimacy, intimacyOf, isTodayTime, messageTime } from '@/data/messages-ui';
import { FOLLOWS_ME, ROOMS, userById, type Conversation, type User } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { heartView } from '@/lib/heart-tiers';
import { liveCallRows, type CallRowData } from '@/lib/call-rows';
import { friendRows, type Friend } from '@/lib/friend-rows';
import { callPair } from '@/components/one-on-one-bar';
import { useApp } from '@/store';
import { makeStyles, useTheme, type Theme } from '@/theme';
import { Icon3D } from '@/components/Icon3D';
import { Backdrop, Gloss, PressableScale } from '@/components/fx/surface';
import { TeamInbox } from '@/components/team-inbox';
import { OpenerNotice } from '@/components/opener-notice';
import { teamUnread } from '@/lib/live/team';
import { messagePreview } from '@/components/ReactionArt';
import { liveMode, message, oneOnOneOpen, toLocal, toServer, useServerRoomList } from '@/lib/live';
import { clearLiveCalls, moreLiveCalls, useLiveCallLog, useLiveHearts } from '@/lib/live/call-log';
import { useLiveFollowers } from '@/lib/live/friends';
import { loadPair } from '@/lib/live/one-on-one';
import { Photo } from '@/components/photo';
import { VisitorsSheet, useProfileVisitors } from '@/components/visitors-sheet';

type Tab = 'messages' | 'friends' | 'calls';
type Filter = 'all' | 'intimacy' | 'online' | 'today';
/** The heart between us as a Yakınlık row shows it. */
type Heart = { points: number; level: number };
const NO_HEART: Heart = { points: 0, level: 0 };

// Aramalar: the simulated call history in the demo, the server's in a live build with calls (lib/live oneOnOneOpen).
const TABS: { key: Tab; label: string }[] = [
  { key: 'messages', label: 'Mesajlar' },
  { key: 'friends', label: 'Arkadaşlarım' },
  ...(oneOnOneOpen() ? [{ key: 'calls' as const, label: 'Aramalar' }] : []),
];

// Yakınlık sorts by the heart between us: the demo's sample hearts, or a live build's heart points (lib/live/call-log);
// each row shows the heart's level in its look (components/heart-level) and its points.
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Hepsi' },
  { key: 'intimacy', label: 'Yakınlık' },
  { key: 'online', label: 'Çevrimiçi' },
  { key: 'today', label: 'Bugün' },
];
const NOBODY: ReadonlySet<string> = new Set();

// Fallback cover for the "Canlı Odalar" row when no room was visited yet: the busiest room.
const POPULAR_ROOM = [...ROOMS].sort((a, b) => b.listeners - a.listeners)[0];

export default function MessagesScreen() {
  const { conversations, blocked, following, recentRooms, markRead, myRoom } = useApp();
  // Profil › Arkadaşlar opens this tab on Arkadaşlarım (the tab stays mounted, so follow later visits too).
  const params = useLocalSearchParams<{ tab?: string }>();
  const asked = params.tab === 'friends' || (params.tab === 'calls' && oneOnOneOpen()) ? params.tab : null;
  const [tab, setTab] = useState<Tab>(asked ?? 'messages');
  const [lastAsked, setLastAsked] = useState(asked);
  if (asked !== lastAsked) {
    setLastAsked(asked);
    if (asked) setTab(asked);
  }
  const [filter, setFilter] = useState<Filter>('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const [visitorsOpen, setVisitorsOpen] = useState(false);
  const [visitorsSeen, setVisitorsSeen] = useState(false);
  const [clearedCalls, setClearedCalls] = useState(false);
  // Similar Ekibi: what is new since I last opened it (the demo starts with two of its sample notices new).
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamNew, setTeamNew] = useState(liveMode() ? 0 : 2);
  useFocusEffect(
    useCallback(() => {
      if (!liveMode()) return;
      let alive = true;
      teamUnread()
        .then((n) => alive && setTeamNew(n))
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, []),
  );
  const { colors, gradientDeep } = useTheme();
  const styles = useStyles();
  const tabStrip = useRef<ComponentRef<typeof ScrollView>>(null);

  // Conversations (blocked users hidden), then the active chip filter.
  const live = liveMode();
  const visibleConvs = conversations.filter((c) => !blocked.has(c.userId));
  const lastOf = (c: Conversation) => c.messages[c.messages.length - 1];
  const hearts = useLiveHearts(live && filter === 'intimacy');
  const heartWith = (id: string) => (live ? (hearts?.get(id) ?? NO_HEART) : heartView(intimacyOf(id)));
  let convs = visibleConvs;
  if (filter === 'intimacy') convs = [...visibleConvs].sort((a, b) => heartWith(b.userId).points - heartWith(a.userId).points);
  else if (filter === 'online') convs = visibleConvs.filter((c) => userById(c.userId).online);
  else if (filter === 'today') convs = visibleConvs.filter((c) => lastOf(c) && isTodayTime(lastOf(c)));
  const totalUnread = visibleConvs.reduce((n, c) => n + c.unread, 0);

  // Friends: people I follow who follow me back (online first; one-way follows are the Ben tab's two lists). Who
  // follows me is the demo's sample list, or my followers on the server, read each time Mesajlar comes to the front.
  const liveFollowers = useLiveFollowers(live);
  const friends = friendRows(following, live ? (liveFollowers ?? NOBODY) : FOLLOWS_ME, blocked, userById);

  // Aramalar: the server's history in a live build (null while it is read), the sample one in the demo.
  const liveLog = useLiveCallLog(live && tab === 'calls');
  const calls: CallRowData[] = (live ? liveCallRows(liveLog?.calls ?? [], toLocal) : clearedCalls ? [] : CALL_HISTORY).filter((c) => !blocked.has(c.userId));
  const clearCalls = () => (live ? void clearLiveCalls().catch((e) => showAlert('Arama geçmişi temizlenemedi', message(e))) : setClearedCalls(true));
  // Profil ziyaretçileri: from the server in a live build (how many for everyone, who only with VIP), the sample
  // visitors in the demo; the Ben tab shows the same numbers (components/visitors-sheet).
  const visitors = useProfileVisitors();
  const visitorCount = visitors.count ?? 0;

  // Last visited room for the "Canlı Odalar" row. Live: among the open server rooms (lib/live), with its own cover;
  // a room that has closed since leads to Odalar instead.
  const liveRooms = useServerRoomList();
  const lastRoomId = recentRooms[0];
  const lastRoom = lastRoomId ? (live ? liveRooms : ROOMS).find((r) => r.id === lastRoomId) : undefined;
  const partyCover = live ? (lastRoom?.cover ?? '') : (lastRoom?.cover ?? (lastRoomId ? myRoom.cover : POPULAR_ROOM.cover));
  const openParty = () => (lastRoomId && (!live || lastRoom) ? router.push(`/oda/${lastRoomId}`) : router.push('/(tabs)'));

  // Open to everyone: without the Abonelik the visits show blurred and the sheet offers it (components/visitors-sheet).
  const openVisitors = () => {
    setVisitorsSeen(true);
    setVisitorsOpen(true);
  };

  const markAllRead = () => {
    const unread = visibleConvs.filter((c) => c.unread > 0);
    if (unread.length === 0) {
      showAlert('Okunmamış mesaj yok');
      return;
    }
    unread.forEach((c) => markRead(c.userId));
  };

  const menuOptions: SheetOption[] = [
    { label: 'Tümünü okundu yap', onPress: markAllRead },
    ...(tab === 'calls' && calls.length > 0
      ? [
          {
            label: 'Arama geçmişini temizle',
            onPress: clearCalls,
            destructive: true,
          },
        ]
      : []),
    { label: 'Mesaj ayarları', onPress: () => router.push('/ayarlar') },
  ];

  // Live: the call goes through the server's rules for the two of us (price, heart level, their privacy choice).
  const callBack = (c: CallRowData) => {
    if (live) {
      const peer = toServer(c.userId);
      if (!peer) return;
      void loadPair(peer)
        .then((p) => callPair(c.userId, p, c.kind))
        .catch((e) => showAlert('Arama başlatılamadı', message(e)));
      return;
    }
    router.push({
      pathname: '/arama/[id]',
      params: {
        id: c.userId,
        mode: c.kind === 'video' ? 'goruntulu' : 'sesli',
      },
    });
  };

  const messagesHeader = (
    <View>
      <View style={styles.hubs}>
        {/* SimilarClub Sistem (server/api/system-notices.mjs): Similar Ekibi's announcements and my account's notices. */}
        <HubTile title="SimilarClub Sistem" sub="Kazanç, ödül, duyuru" art={HUB_ART.team} look={HUB_LOOK.team} badge={teamNew} onPress={() => setTeamOpen(true)} />
        <HubTile title="Çevrim içi hizmet" sub="Destek ekibine yaz" art={HUB_ART.support} look={HUB_LOOK.support} onPress={() => router.push('/destek')} />
        <HubTile title="Ajansım" sub="Ajans ve kazanç" art={HUB_ART.agency} look={HUB_LOOK.agency} onPress={() => router.push('/ajans')} />
      </View>
      {live && <OpenerNotice />}
      <View style={styles.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.chips}>
          {FILTERS.map((f) => (
            <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </ScrollView>
        <MessagePrefsButton />
      </View>
      {filter === 'all' && (
        <View style={styles.systemCard}>
          <SystemRow
            icon={<Ionicons name="mic" size={22} color="#fff" />}
            iconColors={gradientDeep}
            title="Canlı Odalar"
            subtitle={lastRoom ? `Son girdiğin oda · ${lastRoom.title}` : 'Şu an açık odalara göz at'}
            onPress={openParty}
            right={live ? <Photo uri={partyCover} kind="cover" seed={lastRoom?.id ?? 'odalar'} style={styles.roomCover} /> : <Image source={{ uri: partyCover }} style={styles.roomCover} />}
          />
          <View style={styles.sep} />
          <SystemRow
            icon={<Icon3D name="coin" size={30} />}
            iconColors={['#F59E0B', '#FBBF24']}
            title="Aileni bul"
            subtitle="Birlikte konuşacak insanlar seni bekliyor"
            onPress={() => router.push('/aile')}
          />
          {/* Only shown when someone came; the sheet lists them (blurred without the Abonelik). */}
          {visitorCount > 0 && (
            <>
              <View style={styles.sep} />
              <SystemRow
                icon={<Ionicons name="eye" size={22} color="#fff" />}
                iconColors={['#FF8A97', '#FF6576']}
                title="Profil ziyaretçilerin"
                subtitle={`Son 7 günde ${visitorCount} kişi profiline baktı`}
                onPress={openVisitors}
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {!visitorsSeen && <CountBadge n={visitorCount} />}
                    <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
                  </View>
                }
              />
            </>
          )}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {/* Dimmer than other scenes: this list is mostly small grey text. */}
      <Backdrop scene={SCENES.messages} strength={0.5} />
      <View style={styles.topBar}>
        {/* The tabs scroll when they don't fit (a narrow phone, large text): the menu always stays on screen. */}
        <ScrollView
          ref={tabStrip}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1, marginRight: 8 }}
          contentContainerStyle={styles.tabs}
          // The chosen tab's word grows: where the strip is too short, it is brought fully into view.
          onContentSizeChange={() => (tab === 'messages' ? tabStrip.current?.scrollTo({ x: 0 }) : tabStrip.current?.scrollToEnd())}
        >
          {TABS.map((t) => (
            <TabButton key={t.key} label={t.label} active={tab === t.key} badge={t.key === 'messages' ? totalUnread : 0} onPress={() => setTab(t.key)} />
          ))}
        </ScrollView>
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} accessibilityLabel="Menü">
          <Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
        </Pressable>
      </View>

      {tab === 'messages' && (
        <FlatList
          data={convs}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={messagesHeader}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={
            filter === 'all' ? (
              // The Ana Sayfa tab (/kesfet) lists people to greet.
              <Pressable onPress={() => router.push('/kesfet')} accessibilityRole="link" accessibilityLabel="Ana Sayfa sekmesini aç">
                <Text style={styles.empty}>
                  Henüz mesaj yok. <Text style={[styles.empty, styles.emptyLink]}>Ana Sayfa</Text>&apos;dan birine selam ver!
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.empty}>{filter === 'online' ? 'Şu an çevrimiçi sohbet yok.' : filter === 'today' ? 'Bugün mesajlaşmadın.' : 'Henüz sohbet yok.'}</Text>
            )
          }
          renderItem={({ item }) => <ConversationRow conv={item} heart={filter === 'intimacy' ? heartWith(item.userId) : null} />}
        />
      )}

      {tab === 'friends' && (
        <FlatList
          data={friends}
          keyExtractor={(f) => f.user.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListHeaderComponent={
            friends.length > 0 ? (
              <Text style={styles.sectionNote}>
                {friends.length} arkadaş · {friends.filter((f) => f.user.online).length} çevrimiçi
              </Text>
            ) : undefined
          }
          ListEmptyComponent={<Text style={styles.empty}>{'Karşılıklı takipleştiğin kişiler burada görünür.'}</Text>}
          renderItem={({ item }) => <FriendRow friend={item} />}
        />
      )}

      {tab === 'calls' && (
        <FlatList
          data={calls}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={<Text style={styles.empty}>{live && !liveLog ? 'Arama geçmişin yükleniyor…' : 'Arama geçmişin boş.'}</Text>}
          onEndReached={live ? () => void moreLiveCalls().catch(() => {}) : undefined}
          renderItem={({ item }) => <CallRow call={item} onCallBack={() => callBack(item)} />}
        />
      )}

      <ActionSheet visible={menuOpen} options={menuOptions} onClose={() => setMenuOpen(false)} />
      <VisitorsSheet visible={visitorsOpen} rows={visitors.rows} count={visitors.count} unlocked={visitors.unlocked} newest={visitors.newest} onClose={() => setVisitorsOpen(false)} />
      <TeamInbox visible={teamOpen} onClose={() => setTeamOpen(false)} onUnread={setTeamNew} />
    </SafeAreaView>
  );
}

function TabButton({ label, active, badge, onPress }: { label: string; active: boolean; badge: number; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={styles.tabBtn} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <View style={styles.tabLabel}>
        <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
        {badge > 0 && (
          <View style={styles.tabBadge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </View>
      <View style={[styles.tabLine, active && { backgroundColor: colors.primary }]} />
    </Pressable>
  );
}

/** A filter pill, as in the owners' Mesajlar design (23 Nov 2026): glass with a lilac neon rim; the chosen one glossy
 *  magenta with a white rim and a pink glow. */
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    // The slop stays inside the strip's own padding: a horizontal list takes no touch past its bounds.
    <Pressable onPress={onPress} hitSlop={{ top: 6, bottom: 6 }} style={[styles.chip, active && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      {active && <LinearGradient colors={['#FF5CC8', '#E5179A', '#B70C78']} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} />}
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

/** The three doors' colours (the owners' Mesajlar design, 23 Nov 2026): a deep gradient, a neon rim and its glow. */
const HUB_LOOK = {
  team: { fill: ['#9A3BFF', '#5A1BD8', '#2E0E96'], rim: '#F0A8FF', glow: 'rgba(196,72,255,0.75)' },
  support: { fill: ['#119AA6', '#0A5F6B', '#063F4A'], rim: '#7AF6FF', glow: 'rgba(40,220,255,0.7)' },
  agency: { fill: ['#E0521A', '#A8204F', '#5E0E3E'], rim: '#FFC266', glow: 'rgba(255,150,40,0.75)' },
} as const;
type HubLook = (typeof HUB_LOOK)[keyof typeof HUB_LOOK];

/** The three doors' pictures (docs/GORSEL_URETIM_LISTESI.md § 13, app/assets/banners, 192 px). */
const HUB_ART = {
  team: require('../../../assets/banners/mesaj-similar-ekibi.png'),
  support: require('../../../assets/banners/mesaj-cevrimici-hizmet.png'),
  agency: require('../../../assets/banners/mesaj-ajansim.png'),
} as const;

/** One of the three big doors at the top of Mesajlar. */
function HubTile({ title, sub, art, look, badge = 0, onPress }: { title: string; sub: string; art: number; look: HubLook; badge?: number; onPress: () => void }) {
  const styles = useStyles();
  // A narrow phone (320 points) keeps "SimilarClub" whole on its line.
  const narrow = useWindowDimensions().width < 360;
  // The outer View takes the third of the row: PressableScale puts its style on the inner view, so a flex there
  // would leave each tile as wide as its text and push the last one off a narrow screen.
  return (
    <View style={{ flex: 1 }}>
      <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={badge > 0 ? `${title}, ${badge} yeni` : title}>
        <LinearGradient colors={look.fill} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={[styles.hub, narrow && { paddingHorizontal: 5 }, { borderColor: look.rim, boxShadow: `0 0 12px ${look.glow}` }]}>
          <Gloss radius={16} strength={0.18} />
          {/* The design's light sweeps: two thin arcs across the lower corner. */}
          <View style={styles.hubSweep} pointerEvents="none" />
          <View style={[styles.hubSweep, styles.hubSweep2]} pointerEvents="none" />
          {/* The picture fills the tile's top, down to its title. */}
          <Image source={art} style={{ width: 46, height: 46 }} resizeMode="contain" accessibilityIgnoresInvertColors />
          <View style={{ gap: 1 }}>
            <Text style={[styles.hubTitle, narrow && { fontSize: 12, lineHeight: 15 }]} numberOfLines={2}>
              {title}
            </Text>
            <Text style={[styles.hubSub, narrow && { fontSize: 10.5, lineHeight: 13 }]} numberOfLines={2}>
              {sub}
            </Text>
          </View>
          {badge > 0 && (
            <View style={[styles.badge, styles.hubBadge]}>
              <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
            </View>
          )}
        </LinearGradient>
      </PressableScale>
    </View>
  );
}

function CountBadge({ n }: { n: number }) {
  const styles = useStyles();
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{n > 99 ? '99+' : n}</Text>
    </View>
  );
}

function SystemRow({
  icon,
  iconColors,
  title,
  subtitle,
  right,
  onPress,
}: {
  icon: ReactNode;
  iconColors: readonly [string, string, ...string[]];
  title: string;
  subtitle: string;
  right?: ReactNode;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable style={({ pressed }) => [styles.sysRow, pressed && { opacity: 0.8 }]} onPress={onPress}>
      <LinearGradient colors={iconColors} style={styles.sysIcon}>
        {icon}
      </LinearGradient>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.name} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.last} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      {right ?? <Ionicons name="chevron-forward" size={18} color={colors.textDim} />}
    </Pressable>
  );
}

function AvatarWithBadge({ user, size, unread }: { user: User; size: number; unread: number }) {
  const styles = useStyles();
  return (
    <View>
      <Avatar uri={user.avatar} size={size} online={user.online} />
      {unread > 0 && (
        <View style={[styles.badge, styles.avatarBadge]}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </View>
  );
}

/** `heart`: the heart between us to show beside the name (the Yakınlık filter), null for none. */
function ConversationRow({ conv, heart }: { conv: Conversation; heart: Heart | null }) {
  const u = userById(conv.userId);
  const last = conv.messages[conv.messages.length - 1];
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.card }]} onPress={() => router.push(`/sohbet/${u.id}`)}>
      <AvatarWithBadge user={u} size={52} unread={conv.unread} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={styles.name} numberOfLines={1}>
            {u.name}
          </Text>
          {u.verified && <VerifiedBadge />}
          {u.vip && <VipBadge />}
          {heart && (
            <View style={styles.intimacy}>
              <HeartBadge level={heart.level} size="xs" still />
              <Text style={styles.intimacyText}>{formatIntimacy(heart.points)}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.last, conv.unread > 0 && { color: colors.text }]} numberOfLines={1}>
          {last ? `${last.fromMe ? 'Sen: ' : ''}${messagePreview(last.text)}` : ''}
        </Text>
      </View>
      <Text style={styles.time}>{last ? messageTime(last) : ''}</Text>
    </Pressable>
  );
}

function FriendRow({ friend }: { friend: Friend }) {
  // Everyone here follows me back (lib/friend-rows).
  const { user: u } = friend;
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.card }]} onPress={() => router.push(`/kullanici/${u.id}`)}>
      <Avatar uri={u.avatar} size={50} online={u.online} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={styles.name} numberOfLines={1}>
            {u.name}
          </Text>
          {u.verified && <VerifiedBadge />}
          {u.vip && <VipBadge />}
        </View>
        <Text style={styles.last} numberOfLines={1}>
          <Text style={{ color: u.online ? semantic.actionText : colors.textDim }}>{u.online ? 'Çevrimiçi' : 'Çevrimdışı'}</Text>
          {' · Karşılıklı takip'}
        </Text>
      </View>
      <Pressable style={styles.roundBtn} onPress={() => router.push(`/sohbet/${u.id}`)} hitSlop={6} accessibilityLabel={`${u.name} ile mesajlaş`}>
        <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
      </Pressable>
    </Pressable>
  );
}

const callDirOf = ({ colors }: Theme): Record<CallRowData['direction'], { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> => ({
  in: { label: 'Gelen', icon: 'arrow-down', color: colors.green },
  out: { label: 'Giden', icon: 'arrow-up', color: colors.primaryText },
  missed: { label: 'Cevapsız', icon: 'close', color: colors.red },
});

function CallRow({ call, onCallBack }: { call: CallRowData; onCallBack: () => void }) {
  const u = userById(call.userId);
  const t = useTheme();
  const { colors, gradientDeep } = t;
  const styles = useStyles();
  const dir = callDirOf(t)[call.direction];
  const video = call.kind === 'video';
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.card }]} onPress={() => router.push(`/kullanici/${u.id}`)}>
      <Avatar uri={u.avatar} size={50} online={u.online} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[styles.name, call.direction === 'missed' && { color: colors.red }]} numberOfLines={1}>
          {u.name}
        </Text>
        {/* Wraps instead of cutting: what the call cost or earned comes last. The icons stay on the first line. */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
          <Ionicons name={dir.icon} size={12} color={dir.color} style={{ marginTop: 2 }} />
          <Ionicons name={video ? 'videocam' : 'call'} size={12} color={colors.textDim} style={{ marginTop: 2 }} />
          <Text style={styles.last} numberOfLines={3}>
            {`${dir.label} ${video ? 'görüntülü' : 'sesli'} arama`}
            {call.duration > 0 ? ` · ${formatDuration(call.duration)}` : ''}
            {/* Live calls only: how an unanswered call ended, and what it cost or earned. */}
            {call.note ? ` · ${call.note}` : ''}
            {call.money ? ` · ${call.money}` : ''}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={styles.time}>{call.time}</Text>
        <Pressable onPress={onCallBack} hitSlop={6} accessibilityLabel={`${u.name} kişisini geri ara`}>
          <LinearGradient colors={gradientDeep} style={styles.roundBtn}>
            <Ionicons name={video ? 'videocam' : 'call'} size={16} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, lift, dark }) => ({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  // Tight enough that three tabs and the menu fit a 360-wide phone without touching.
  tabs: { flexDirection: 'row', gap: 14, alignItems: 'flex-end' },
  tabBtn: { alignItems: 'center', gap: 5, paddingVertical: 6 },
  tabText: { color: colors.textDim, fontSize: 15, fontWeight: '600' },
  tabTextActive: { color: colors.text, fontSize: 20, fontWeight: '800' },
  tabLine: {
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  tabLabel: { flexDirection: 'row', alignItems: 'flex-start', gap: 3 },
  // Inline beside the label so it takes its own space instead of covering the next tab.
  tabBadge: {
    backgroundColor: colors.red,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  hubs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  // Compact (owners, 25 Nov 2026): the 46 px picture over a two-line title and a two-line note, no word cut on a narrow phone.
  hub: { height: 134, borderRadius: 18, borderWidth: 2, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 10, justifyContent: 'space-between' },
  hubTitle: { color: '#fff', fontSize: 15, lineHeight: 18, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  hubSub: { color: 'rgba(255,255,255,0.9)', fontSize: 11.5, lineHeight: 14 },
  hubSweep: { position: 'absolute', width: 220, height: 120, borderRadius: 110, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', left: -30, bottom: -78, transform: [{ rotate: '-14deg' }] },
  hubSweep2: { left: 10, bottom: -92, borderColor: 'rgba(255,255,255,0.14)' },
  hubBadge: { position: 'absolute', top: 8, right: 8 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 12, paddingTop: 3 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 16, paddingRight: 4, paddingVertical: 10 },
  chip: {
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
    borderWidth: 1.5,
    borderColor: 'rgba(176,140,255,0.85)',
  },
  chipActive: { borderColor: 'rgba(255,255,255,0.9)', boxShadow: '0 0 6px rgba(255,40,170,0.55)' },
  chipText: { color: dark ? colors.text : '#4A1650', fontSize: 13.5, fontWeight: '700' },
  chipTextOn: { color: '#fff', textShadowColor: 'rgba(120,0,70,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  systemCard: {
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 6,
    backgroundColor: colors.card,
    borderRadius: 18,
    overflow: 'hidden',
    ...lift,
  },
  sysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sysIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 70,
  },
  roomCover: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: colors.cardAlt,
  },
  empty: {
    color: colors.textDim,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 24,
  },
  emptyLink: { color: colors.primaryText, fontWeight: '700', marginTop: 0, paddingHorizontal: 0 },
  sectionNote: {
    color: colors.textDim,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  name: { color: colors.text, fontWeight: '700', fontSize: 15, flexShrink: 1 },
  last: { color: colors.textDim, fontSize: 13, flexShrink: 1 },
  time: { color: colors.textDim, fontSize: 12 },
  badge: {
    backgroundColor: colors.red,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  avatarBadge: {
    position: 'absolute',
    top: -3,
    right: -4,
    borderWidth: 2,
    borderColor: colors.bg,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  intimacy: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 2 },
  intimacyText: { color: colors.pink, fontSize: 12, fontWeight: '700' },
  roundBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
}));
