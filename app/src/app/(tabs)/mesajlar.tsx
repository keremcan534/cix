import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { SCENES } from '@/components/fx/scenes';
import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { Avatar, VerifiedBadge, VipBadge } from '@/components/ui';
import { CALL_HISTORY, formatDuration, formatIntimacy, intimacyOf, isTodayTime, messageTime, type CallLog } from '@/data/messages-ui';
import { FOLLOWS_ME, ROOMS, userById, type Conversation, type User } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { makeStyles, useTheme, type Theme } from '@/theme';
import { Icon3D, type Icon3DName } from '@/components/Icon3D';
import { Backdrop, Gloss, PressableScale } from '@/components/fx/surface';
import { TeamInbox } from '@/components/team-inbox';
import { teamUnread } from '@/lib/live/team';
import { messagePreview } from '@/components/ReactionArt';
import { callsAvailable, liveMode, useServerRoomList } from '@/lib/live';
import { Photo } from '@/components/photo';
import { VisitorsSheet, useProfileVisitors } from '@/components/visitors-sheet';

type Tab = 'messages' | 'friends' | 'calls';
type Filter = 'all' | 'intimacy' | 'online' | 'today';

// Aramalar is the simulated call history; a live build has no calls yet (lib/live callsAvailable).
const TABS: { key: Tab; label: string }[] = [
  { key: 'messages', label: 'Mesajlar' },
  { key: 'friends', label: 'Arkadaşlarım' },
  ...(callsAvailable() ? [{ key: 'calls' as const, label: 'Aramalar' }] : []),
];

// Yakınlık sorts by the demo's intimacy points; the server has none yet, so a live build leaves the chip out.
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Hepsi' },
  ...(liveMode() ? [] : [{ key: 'intimacy' as const, label: 'Yakınlık' }]),
  { key: 'online', label: 'Çevrimiçi' },
  { key: 'today', label: 'Bugün' },
];

// Fallback cover for the "Canlı Odalar" row when no room was visited yet: the busiest room.
const POPULAR_ROOM = [...ROOMS].sort((a, b) => b.listeners - a.listeners)[0];

type Friend = { user: User; iFollow: boolean; followsMe: boolean };

export default function MessagesScreen() {
  const { conversations, blocked, following, recentRooms, markRead, myRoom } = useApp();
  // Profil › Arkadaşlar opens this tab on Arkadaşlarım (the tab stays mounted, so follow later visits too).
  const params = useLocalSearchParams<{ tab?: string }>();
  const asked = params.tab === 'friends' || (params.tab === 'calls' && callsAvailable()) ? params.tab : null;
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

  // Conversations (blocked users hidden), then the active chip filter.
  const visibleConvs = conversations.filter((c) => !blocked.has(c.userId));
  const lastOf = (c: Conversation) => c.messages[c.messages.length - 1];
  let convs = visibleConvs;
  if (filter === 'intimacy') convs = [...visibleConvs].sort((a, b) => intimacyOf(b.userId) - intimacyOf(a.userId));
  else if (filter === 'online') convs = visibleConvs.filter((c) => userById(c.userId).online);
  else if (filter === 'today') convs = visibleConvs.filter((c) => lastOf(c) && isTodayTime(lastOf(c)));
  const totalUnread = visibleConvs.reduce((n, c) => n + c.unread, 0);

  // Friends: people I follow + people who follow me (mutual first, then online). Who follows me is the demo's
  // sample list; a live build lists the people I follow on the server (loaded after signing in).
  const followsMe = (id: string) => !liveMode() && FOLLOWS_ME.has(id);
  const friendIds = [...new Set([...following, ...(liveMode() ? [] : FOLLOWS_ME)])].filter((id) => !blocked.has(id) && id !== 'me');
  const friends: Friend[] = friendIds
    .map((id) => ({
      user: userById(id),
      iFollow: following.has(id),
      followsMe: followsMe(id),
    }))
    .sort((a, b) => Number(b.iFollow && b.followsMe) - Number(a.iFollow && a.followsMe) || Number(b.user.online) - Number(a.user.online));

  const calls = clearedCalls ? [] : CALL_HISTORY.filter((c) => !blocked.has(c.userId));
  // Profil ziyaretçileri: from the server in a live build (how many for everyone, who only with VIP), the sample
  // visitors in the demo; the Ben tab shows the same numbers (components/visitors-sheet).
  const visitors = useProfileVisitors();
  const visitorCount = visitors.count ?? 0;

  // Last visited room for the "Canlı Odalar" row. Live: among the open server rooms (lib/live), with its own cover;
  // a room that has closed since leads to Odalar instead.
  const live = liveMode();
  const liveRooms = useServerRoomList();
  const lastRoomId = recentRooms[0];
  const lastRoom = lastRoomId ? (live ? liveRooms : ROOMS).find((r) => r.id === lastRoomId) : undefined;
  const partyCover = live ? (lastRoom?.cover ?? '') : (lastRoom?.cover ?? (lastRoomId ? myRoom.cover : POPULAR_ROOM.cover));
  const openParty = () => (lastRoomId && (!live || lastRoom) ? router.push(`/oda/${lastRoomId}`) : router.push('/(tabs)'));

  const openVisitors = () => {
    if (visitors.unlocked) {
      setVisitorsSeen(true);
      setVisitorsOpen(true);
      return;
    }
    showAlert('VIP ayrıcalığı', 'Profilini kimlerin ziyaret ettiğini görmek için VIP olman gerekiyor.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: "VIP'e geç",
        onPress: () => router.push({ pathname: '/vip', params: { tab: 'vip' } }),
      },
    ]);
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
            onPress: () => setClearedCalls(true),
            destructive: true,
          },
        ]
      : []),
    { label: 'Mesaj ayarları', onPress: () => router.push('/ayarlar') },
  ];

  const callBack = (c: CallLog) =>
    router.push({
      pathname: '/arama/[id]',
      params: {
        id: c.userId,
        mode: c.kind === 'video' ? 'goruntulu' : 'sesli',
      },
    });

  const messagesHeader = (
    <View>
      <View style={styles.hubs}>
        <HubTile title="Similar Ekibi" sub="Duyuru, etkinlik, ödül" icon="envelope" tint={['#2B4FD8', '#5B21B6']} badge={teamNew} onPress={() => setTeamOpen(true)} />
        <HubTile title="Çevrim içi hizmet" sub="Destek ekibine yaz" icon="chat" tint={['#0B7A86', '#14532D']} onPress={() => router.push('/destek')} />
        <HubTile title="Ajansım" sub="Ajans ve kazanç" icon="briefcase" tint={['#9A4A12', '#6B1F3A']} onPress={() => router.push('/ajans')} />
      </View>
      <View style={styles.chips}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
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
          {/* Only shown when someone came; with VIP the sheet lists them. */}
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
        <View style={styles.tabs}>
          {TABS.map((t) => (
            <TabButton key={t.key} label={t.label} active={tab === t.key} badge={t.key === 'messages' ? totalUnread : 0} onPress={() => setTab(t.key)} />
          ))}
        </View>
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
          renderItem={({ item }) => <ConversationRow conv={item} showIntimacy={filter === 'intimacy'} />}
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
          ListEmptyComponent={<Text style={styles.empty}>{'Henüz arkadaşın yok. Odalarda yeni insanlarla tanış!'}</Text>}
          renderItem={({ item }) => <FriendRow friend={item} />}
        />
      )}

      {tab === 'calls' && (
        <FlatList
          data={calls}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={<Text style={styles.empty}>Arama geçmişin boş.</Text>}
          renderItem={({ item }) => <CallRow call={item} onCallBack={() => callBack(item)} />}
        />
      )}

      <ActionSheet visible={menuOpen} options={menuOptions} onClose={() => setMenuOpen(false)} />
      <VisitorsSheet visible={visitorsOpen} rows={visitors.rows} count={visitors.count} onClose={() => setVisitorsOpen(false)} />
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

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

/** One of the three big doors at the top of Mesajlar. */
function HubTile({ title, sub, icon, tint, badge = 0, onPress }: { title: string; sub: string; icon: Icon3DName; tint: readonly [string, string]; badge?: number; onPress: () => void }) {
  const styles = useStyles();
  // The outer View takes the third of the row: PressableScale puts its style on the inner view, so a flex there
  // would leave each tile as wide as its text and push the last one off a narrow screen.
  return (
    <View style={{ flex: 1 }}>
      <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={badge > 0 ? `${title}, ${badge} yeni` : title}>
        <LinearGradient colors={tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hub}>
          <Gloss radius={16} strength={0.18} />
          <Icon3D name={icon} size={38} />
          <View style={{ gap: 1 }}>
            <Text style={styles.hubTitle} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.hubSub} numberOfLines={2}>
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
        <Text style={styles.last} numberOfLines={1}>
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

function ConversationRow({ conv, showIntimacy }: { conv: Conversation; showIntimacy: boolean }) {
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
          {showIntimacy && (
            <View style={styles.intimacy}>
              <Ionicons name="heart" size={10} color={colors.pink} />
              <Text style={styles.intimacyText}>{formatIntimacy(intimacyOf(u.id))}</Text>
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
  const { user: u, iFollow, followsMe } = friend;
  const relation = iFollow && followsMe ? 'Karşılıklı takip' : iFollow ? 'Takip ediyorsun' : 'Seni takip ediyor';
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
          {` · ${relation}`}
        </Text>
      </View>
      <Pressable style={styles.roundBtn} onPress={() => router.push(`/sohbet/${u.id}`)} hitSlop={6} accessibilityLabel={`${u.name} ile mesajlaş`}>
        <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
      </Pressable>
    </Pressable>
  );
}

const callDirOf = ({ colors }: Theme): Record<CallLog['direction'], { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> => ({
  in: { label: 'Gelen', icon: 'arrow-down', color: colors.green },
  out: { label: 'Giden', icon: 'arrow-up', color: colors.primaryText },
  missed: { label: 'Cevapsız', icon: 'close', color: colors.red },
});

function CallRow({ call, onCallBack }: { call: CallLog; onCallBack: () => void }) {
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name={dir.icon} size={12} color={dir.color} />
          <Ionicons name={video ? 'videocam' : 'call'} size={12} color={colors.textDim} />
          <Text style={styles.last} numberOfLines={1}>
            {`${dir.label} ${video ? 'görüntülü' : 'sesli'} arama`}
            {call.duration > 0 ? ` · ${formatDuration(call.duration)}` : ''}
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
    paddingTop: 6,
  },
  // Tight enough that three tabs and the menu fit a 360-wide phone without touching.
  tabs: { flexDirection: 'row', gap: 14, alignItems: 'flex-end' },
  tabBtn: { alignItems: 'center', gap: 5 },
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
  hubs: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  // Tall enough for a two-line title and a two-line note, so a third of a narrow phone cuts no word.
  hub: { height: 132, borderRadius: 16, overflow: 'hidden', padding: 12, justifyContent: 'space-between' },
  hubTitle: { color: '#fff', fontSize: 14, lineHeight: 18, fontWeight: '800' },
  hubSub: { color: 'rgba(255,255,255,0.78)', fontSize: 11, lineHeight: 14 },
  hubBadge: { position: 'absolute', top: 8, right: 8 },
  chips: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
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
    paddingVertical: 12,
  },
  sysIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
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
  intimacy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: dark ? 'rgba(19,217,223,0.18)' : 'rgba(0,140,148,0.11)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 2,
  },
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
