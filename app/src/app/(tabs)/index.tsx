import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { Avatar, CoinPill } from '@/components/ui';
import { roomCode } from '@/data/catalog';
import { ROOMS, USERS, userById, type Room, type User } from '@/data/mock';
import {
  COUNTRIES,
  RANK_CARDS,
  ROOM_BANNER,
  ROOM_EVENTS,
  ROOM_TABS,
  countryFlag,
  hostLevel,
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
import { useApp } from '@/store';
import { colors, gradient, gradientDeep, semantic } from '@/theme';

type MainTab = 'mine' | 'rec';
type MineTab = 'recent' | 'joined' | 'following';
const MINE_TABS: { key: MineTab; label: string }[] = [
  { key: 'recent', label: 'Son Ziyaretler' },
  { key: 'joined', label: 'Katıl' },
  { key: 'following', label: 'Takip Et' },
];
type Suggestion = { r: Room; reason: string };

export default function RoomsScreen() {
  const { coins, checkedInToday, notifications, following, recentRooms, blocked, me, myRoom, agencyId, familyId } = useApp();
  const [main, setMain] = useState<MainTab>('rec');
  const [mineTab, setMineTab] = useState<MineTab>('recent');
  const [cat, setCat] = useState<RoomTab>('Popüler');
  const [country, setCountry] = useState<CountryId>('ALL');
  const [sheet, setSheet] = useState<'events' | 'country' | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const visible = ROOMS.filter((r) => !blocked.has(r.hostId));

  // Personalized suggestions with an explanation; blocked hosts and private rooms are excluded.
  const suggestions: Suggestion[] = visible
    .filter((r) => !r.password)
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
      return { r, reason, score };
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

  const onlineHosts = USERS.filter((u) => u.online && !blocked.has(u.id));
  const unreadNotices = notifications.filter((n) => !n.read).length;
  const events = ROOM_EVENTS.filter((e) => visible.some((r) => r.id === e.roomId));

  const emptyText =
    main === 'rec'
      ? 'Bu kategoride şu an açık oda yok.'
      : mineTab === 'recent'
        ? 'Henüz bir odaya girmedin.'
        : mineTab === 'joined'
          ? 'Üyesi olduğun oda yok.'
          : 'Takip ettiğin kimse şu an oda açmamış.';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.mainTabs}>
          {(
            [
              ['mine', 'Benim'],
              ['rec', 'Önerilen'],
            ] as const
          ).map(([key, label]) => (
            <Pressable key={key} onPress={() => setMain(key)} hitSlop={6} style={{ alignItems: 'center' }}>
              <Text style={[styles.mainTab, main === key && styles.mainTabActive]}>{label}</Text>
              <View style={[styles.underline, main !== key && { opacity: 0 }]} />
            </Pressable>
          ))}
        </View>
        <View style={styles.headerIcons}>
          <Pressable onPress={() => setSheet('events')} hitSlop={6} accessibilityLabel="Etkinlikler">
            <LinearGradient colors={gradientDeep} style={styles.calendarBtn}>
              <Ionicons name="calendar" size={17} color="#fff" />
            </LinearGradient>
          </Pressable>
          <Pressable onPress={() => setSearchOpen(true)} hitSlop={6} accessibilityLabel="Oda ara">
            <Ionicons name="search" size={23} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => router.push('/bildirimler')} hitSlop={6} accessibilityLabel="Bildirimler">
            <Ionicons name="notifications" size={22} color={colors.text} />
            {unreadNotices > 0 && <View style={styles.dot} />}
          </Pressable>
        </View>
      </View>

      <FlatList
        data={main === 'rec' ? recRooms : mineRooms}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ gap: 10, paddingBottom: 96 }}
        ListHeaderComponent={
          main === 'rec' ? (
            <View style={{ gap: 14, paddingBottom: 4 }}>
              <RankCards />
              <QuickStrip coins={coins} checkedInToday={checkedInToday} />
              <CategoryBar cat={cat} onCat={setCat} countryFlag={country === 'ALL' ? null : countryFlag(country)} onCountry={() => setSheet('country')} />
              <HostsRow hosts={onlineHosts} rooms={visible} />
              {cat === 'Popüler' && <SuggestionsRow items={suggestions} />}
            </View>
          ) : (
            <View style={{ gap: 14, paddingBottom: 4 }}>
              <MyRoomCard title={myRoom.title} announcement={myRoom.announcement} cover={myRoom.cover} locked={myRoom.locked} avatar={me.avatar} />
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
        ListEmptyComponent={<Text style={styles.empty}>{emptyText}</Text>}
        ListFooterComponent={main === 'mine' ? <PromoBanner /> : undefined}
        renderItem={({ item }) => <RoomRow room={item} />}
      />

      <Pressable style={styles.fab} onPress={() => router.push('/oda/yeni')} accessibilityLabel="Oda oluştur">
        <LinearGradient colors={gradient} style={styles.fabInner}>
          <Ionicons name="add" size={30} color={semantic.actionInk} />
        </LinearGradient>
      </Pressable>

      <ActionSheet
        visible={sheet === 'events'}
        title={events.length ? '📅 Yaklaşan etkinlikler' : 'Yaklaşan etkinlik yok'}
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
    </SafeAreaView>
  );
}

function RankCards() {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
      {RANK_CARDS.map((c) => (
        <Pressable key={c.key} onPress={() => router.push({ pathname: '/siralama', params: { board: c.board } })}>
          <LinearGradient colors={c.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rankCard}>
            <Text style={styles.rankTitle} numberOfLines={1}>
              {c.title}
            </Text>
            <View style={{ flexDirection: 'row' }}>
              {c.avatars.map((uri, i) => (
                <View key={`${c.key}-${i}`} style={[styles.rankAvatar, { marginLeft: i ? -8 : 0, zIndex: 3 - i }]}>
                  <Image source={{ uri }} style={{ flex: 1, borderRadius: 14 }} />
                </View>
              ))}
            </View>
          </LinearGradient>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function QuickStrip({ coins, checkedInToday }: { coins: number; checkedInToday: boolean }) {
  const items = [
    { key: 'match', emoji: '⚡', label: 'Rastgele Eşleş', onPress: () => router.push('/eslesme') },
    { key: 'wheel', emoji: '🎰', label: 'Şans Çarkı', onPress: () => router.push('/cark') },
    { key: 'games', emoji: '🎮', label: 'Oyun merkezi', onPress: () => router.push('/oyunlar') },
    { key: 'tasks', emoji: '🎁', label: 'Görevler', onPress: () => router.push('/gorevler'), dot: !checkedInToday },
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, alignItems: 'center' }}>
      <CoinPill coins={coins} onPress={() => router.push('/cuzdan')} />
      {items.map((it) => (
        <Pressable key={it.key} style={styles.quick} onPress={it.onPress}>
          <Text style={{ fontSize: 14 }}>{it.emoji}</Text>
          <Text style={styles.quickText}>{it.label}</Text>
          {it.dot && <View style={styles.dot} />}
        </Pressable>
      ))}
    </ScrollView>
  );
}

function CategoryBar({ cat, onCat, countryFlag: flag, onCountry }: { cat: RoomTab; onCat: (c: RoomTab) => void; countryFlag: string | null; onCountry: () => void }) {
  return (
    <View style={styles.catBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 20, paddingLeft: 16, paddingRight: 8 }}>
        {ROOM_TABS.map((c) => (
          <Pressable key={c} onPress={() => onCat(c)} style={{ alignItems: 'center' }}>
            <Text style={[styles.catText, c === cat && styles.catTextActive]}>{c}</Text>
            <View style={[styles.underlineSm, c !== cat && { opacity: 0 }]} />
          </Pressable>
        ))}
      </ScrollView>
      <Pressable onPress={() => router.push('/aile')} hitSlop={6} accessibilityLabel="Grup oluştur / katıl">
        <LinearGradient colors={gradientDeep} style={styles.catIcon}>
          <Ionicons name="people" size={18} color="#fff" />
          <View style={styles.plusBadge}>
            <Ionicons name="add" size={10} color={colors.primaryText} />
          </View>
        </LinearGradient>
      </Pressable>
      <Pressable onPress={onCountry} hitSlop={6} accessibilityLabel="Ülke seç" style={{ marginRight: 16 }}>
        <View style={[styles.catIcon, { backgroundColor: colors.cardAlt }]}>
          {flag ? <Text style={{ fontSize: 18 }}>{flag}</Text> : <Ionicons name="globe" size={20} color="#38BDF8" />}
        </View>
      </Pressable>
    </View>
  );
}

function HostsRow({ hosts, rooms }: { hosts: User[]; rooms: Room[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingHorizontal: 16 }}>
      {hosts.map((u) => {
        const hosted = rooms.find((r) => r.hostId === u.id);
        return (
          <Pressable key={u.id} style={{ alignItems: 'center', gap: 2, width: 64 }} onPress={() => router.push(hosted ? `/oda/${hosted.id}` : `/kullanici/${u.id}`)}>
            <View>
              <Avatar uri={u.avatar} size={60} ring />
              <View style={styles.hostLevel}>
                <Ionicons name="stats-chart" size={9} color="#fff" />
                <Text style={styles.hostLevelText}>{hostLevel(u.id)}</Text>
              </View>
            </View>
            <Text style={styles.hostName} numberOfLines={1}>
              {u.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SuggestionsRow({ items }: { items: Suggestion[] }) {
  if (items.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.section}>✨ Senin için</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
        {items.map(({ r, reason }) => (
          <Pressable key={r.id} style={styles.suggest} onPress={() => router.push(`/oda/${r.id}`)}>
            <Image source={{ uri: r.cover }} style={styles.suggestImg} />
            <Text style={styles.suggestTitle} numberOfLines={1}>
              {r.title}
            </Text>
            <Text style={styles.suggestWhy} numberOfLines={1}>
              💡 {reason}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function MyRoomCard({ title, announcement, cover, locked, avatar }: { title: string; announcement: string; cover: string; locked: boolean; avatar: string }) {
  return (
    <Pressable style={{ marginHorizontal: 16 }} onPress={() => router.push('/oda/yeni')}>
      <LinearGradient colors={['#123B3A', colors.card]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.myRoom}>
        <Image source={{ uri: cover || avatar }} style={styles.myCover} />
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
            <Ionicons name="stats-chart" size={13} color={semantic.live} />
            <Text style={styles.listenerText}>0</Text>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function PromoBanner() {
  return (
    <Pressable style={{ marginHorizontal: 16, marginTop: 4 }} onPress={() => router.push('/seviye')}>
      <LinearGradient colors={ROOM_BANNER.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.bannerTitle}>{ROOM_BANNER.title}</Text>
          <Text style={styles.bannerSub}>{ROOM_BANNER.sub}</Text>
        </View>
        <Text style={{ fontSize: 48 }}>{ROOM_BANNER.emoji}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const TOP_BG: Record<number, readonly [string, string]> = {
  1: ['#4A3510', '#241A3D'],
  2: ['#2E3550', '#211A3E'],
  3: ['#1E2D66', '#231A44'],
};

function RoomRow({ room }: { room: Room }) {
  const x = roomExtra(room.id);
  const badge = roomBadge(room.id);
  const top = x.top && x.top <= 3 ? x.top : 0;
  const content = (
    <>
      {top > 0 && (
        <View style={[styles.watermark, { pointerEvents: 'none' }]}>
          <Text style={styles.watermarkSmall}>Haftalık</Text>
          <Text style={styles.watermarkBig}>TOP{top}</Text>
        </View>
      )}
      <Image source={{ uri: room.cover }} style={styles.cover} />
      <View style={{ flex: 1, gap: 5, justifyContent: 'center' }}>
        <View style={styles.titleRow}>
          <Text style={styles.flag}>{countryFlag(roomCountry(room.id))}</Text>
          {!!room.password && <Ionicons name="lock-closed" size={13} color={colors.gold} />}
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
              <Text style={{ fontSize: 11 }}>{badge.emoji}</Text>
              <Text style={styles.badgeText} numberOfLines={1}>
                {badge.label}
              </Text>
            </LinearGradient>
          )}
          <View style={styles.lvChip}>
            <Text style={styles.lvText}>Lv.{room.level ?? 1}</Text>
          </View>
          <View style={styles.tagChip}>
            <Text style={styles.tagText}>{roomTagLabel(room)}</Text>
          </View>
          {x.pk && (
            <LinearGradient colors={['#FF6576', '#0E7C9A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.pkPill}>
              <Text style={styles.pkText}>PK</Text>
            </LinearGradient>
          )}
          <View style={{ flex: 1 }} />
          <View style={styles.listeners}>
            <Ionicons name="stats-chart" size={12} color={semantic.live} />
            <Text style={styles.listenerText}>{room.listeners}</Text>
          </View>
        </View>
      </View>
    </>
  );
  return (
    <Pressable style={{ marginHorizontal: 16 }} onPress={() => router.push(`/oda/${room.id}`)}>
      {top > 0 ? (
        <LinearGradient colors={TOP_BG[top]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.roomCard, styles.roomCardTop]}>
          {content}
        </LinearGradient>
      ) : (
        <View style={styles.roomCard}>{content}</View>
      )}
    </Pressable>
  );
}

function RoomSearch({ visible, rooms, onClose }: { visible: boolean; rooms: Room[]; onClose: () => void }) {
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
      <View style={styles.searchSheet}>
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
              <Image source={{ uri: r.cover }} style={styles.searchCover} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.titleRow}>
                  {!!r.password && <Ionicons name="lock-closed" size={12} color={colors.gold} />}
                  <Text style={styles.roomTitle} numberOfLines={1}>
                    {r.title}
                  </Text>
                </View>
                <Text style={styles.announce}>ID: {roomCode(r.id)}</Text>
              </View>
              <View style={styles.listeners}>
                <Ionicons name="stats-chart" size={12} color={semantic.live} />
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

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
  mainTabs: { flexDirection: 'row', alignItems: 'flex-end', gap: 22 },
  mainTab: { color: colors.textDim, fontSize: 20, fontWeight: '600' },
  mainTabActive: { color: colors.text, fontSize: 24, fontWeight: '800' },
  underline: { width: 18, height: 4, borderRadius: 2, backgroundColor: colors.primary, marginTop: 3 },
  underlineSm: { width: 14, height: 3, borderRadius: 2, backgroundColor: colors.primary, marginTop: 3 },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  calendarBtn: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] },
  dot: { position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
  section: { color: colors.text, fontSize: 16, fontWeight: '700', paddingHorizontal: 16 },
  // ranking cards
  rankCard: { width: 148, height: 76, borderRadius: 14, padding: 10, justifyContent: 'space-between' },
  rankTitle: { color: '#fff', fontWeight: '800', fontSize: 14 },
  rankAvatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)', backgroundColor: colors.cardAlt },
  // quick strip
  quick: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999 },
  quickText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  // category bar
  catBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catText: { color: colors.textDim, fontSize: 17, fontWeight: '600' },
  catTextActive: { color: colors.text, fontSize: 19, fontWeight: '800' },
  catIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  plusBadge: { position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  // hosts
  hostLevel: {
    position: 'absolute',
    bottom: -4,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  hostLevelText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  hostName: { color: colors.text, fontSize: 12, marginTop: 4 },
  // suggestions
  suggest: { width: 150, gap: 4 },
  suggestImg: { width: 150, height: 90, borderRadius: 12, backgroundColor: colors.card },
  suggestTitle: { color: '#fff', fontWeight: '700', fontSize: 13 },
  suggestWhy: { color: colors.textDim, fontSize: 12 },
  // room rows
  roomCard: { flexDirection: 'row', gap: 12, padding: 10, borderRadius: 16, backgroundColor: colors.card, overflow: 'hidden' },
  roomCardTop: { borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)' },
  cover: { width: 84, height: 84, borderRadius: 12, backgroundColor: colors.cardAlt },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  flag: { fontSize: 14 },
  roomTitle: { color: colors.text, fontWeight: '800', fontSize: 15, flexShrink: 1 },
  announce: { color: colors.textDim, fontSize: 12 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  badgeChip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, maxWidth: 92 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800', flexShrink: 1 },
  lvChip: { backgroundColor: 'rgba(251,191,36,0.18)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  lvText: { color: colors.gold, fontSize: 11, fontWeight: '800' },
  tagChip: { backgroundColor: 'rgba(19,217,223,0.2)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { color: '#A5F3F5', fontSize: 11, fontWeight: '600' },
  pkPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pkText: { color: '#fff', fontSize: 11, fontWeight: '900', fontStyle: 'italic' },
  listeners: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  listenerText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  watermark: { position: 'absolute', right: 14, top: 4, alignItems: 'flex-end' },
  watermarkSmall: { color: 'rgba(255,255,255,0.08)', fontSize: 26, fontWeight: '900', fontStyle: 'italic' },
  watermarkBig: { color: 'rgba(255,255,255,0.08)', fontSize: 40, fontWeight: '900', fontStyle: 'italic', marginTop: -8 },
  empty: { color: colors.textDim, textAlign: 'center', paddingVertical: 28, paddingHorizontal: 16 },
  // Benim tab
  myRoom: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  myCover: { width: 92, height: 92, borderRadius: 12, backgroundColor: colors.cardAlt },
  odamChip: { backgroundColor: semantic.successFill, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  odamText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  subTabs: { flexDirection: 'row', gap: 22, paddingHorizontal: 16 },
  subTab: { color: colors.textDim, fontSize: 15, fontWeight: '600' },
  subTabActive: { color: colors.text, fontSize: 16, fontWeight: '800' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 18 },
  bannerTitle: { color: '#fff', fontSize: 18, fontWeight: '900', fontStyle: 'italic' },
  bannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  // search sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  searchSheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 34, gap: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cardAlt, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, color: colors.text, paddingVertical: 10, fontSize: 15 },
  searchHint: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12 },
  searchCover: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.cardAlt },
  fab: { position: 'absolute', right: 20, bottom: 20 },
  fabInner: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
