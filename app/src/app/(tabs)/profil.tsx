import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { AffiliationPills, GenderChip } from '@/components/profile-badges';
import { FramedAvatar, LevelChips, VerifiedBadge } from '@/components/ui';
import { cosmeticById, roomCode, roomIdText, roomLevel } from '@/data/catalog';
import { VisitorsSheet, useProfileVisitors } from '@/components/visitors-sheet';
import { FollowListSheet, MY_LISTS } from '@/components/follow-list-sheet';
import { FOLLOWS_ME, userById } from '@/data/mock';
import { publicIdOf } from '@/data/profile';
import { NOBLE_TIERS, SVIP_LEVELS, nobleInfo } from '@/data/status';
import { Art } from '@/components/Art';
import { confirmLogout, showAlert } from '@/lib/alert';
import { copyText } from '@/lib/clipboard';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';
import { EmojiIcon, Icon3D, type Icon3DName } from '@/components/Icon3D';
import { openEvents } from '@/components/events/open';
import { GameIcon } from '@/components/GameArt';
import { IS_DEMO } from '@/lib/build';
import { casinoVisible, useGames } from '@/lib/games';
import { liveMode, myServerId, oneOnOneOpen, useServerRooms } from '@/lib/live';
import { liveSignOut } from '@/lib/live/account';
import { loadMyList } from '@/lib/live/follows';
import { useMeStats } from '@/lib/live/me-stats';
import { splitTies, tiesOf, type TieSide } from '@/lib/follow-ties';
import { myCompletion, rowVisible, type MenuFlags } from '@/lib/me-view';
import { OwnMarkNote } from '@/components/profile-mark';
import { useMyMarks } from '@/lib/live/marks-live';
import { useVisitorsUnseen } from '@/lib/visitors-seen';

type IconName = keyof typeof Ionicons.glyphMap;
type OneWay = Exclude<TieSide, 'friends'>;
type Item = MenuFlags & { icon: IconName; img?: Icon3DName; label: string; onPress: () => void; dot?: boolean };

const GROWTH: Item[] = [
  { icon: 'mic-outline', img: 'mic', label: 'Yayıncı Merkezi', onPress: () => router.push('/yayinci') },
  { icon: 'business-outline', img: 'briefcase', label: 'Ajans', onPress: () => router.push('/ajans'), agencyOnly: true },
  // The agency chat group and the member network are demo screens; with a server, /ajans holds the real ones.
  { icon: 'chatbubbles-outline', img: 'chat', label: 'Ajans sohbet grubu', onPress: () => router.push('/ajans/sohbet'), agencyOnly: true },
  { icon: 'git-network-outline', label: 'Üye ağım ve komisyonlar', onPress: () => router.push('/ajans/ag'), agencyOnly: true, localOnly: true },
  { icon: 'add-circle-outline', img: 'briefcase', label: 'Ajansa katıl / ajans başvurusu', onPress: () => router.push('/ajans'), noAgencyOnly: true },
  { icon: 'trophy-outline', img: 'trophy', label: 'Sıralama', onPress: () => router.push('/siralama') },
  ...(oneOnOneOpen() ? [{ icon: 'flash-outline', img: 'bolt', label: 'Hemen Tanış', onPress: () => router.push('/eslesme') } satisfies Item] : []),
  { icon: 'notifications-outline', label: 'Bildirimler', onPress: () => router.push('/bildirimler') },
  { icon: 'game-controller-outline', label: 'Oyun kataloğu yönetimi (demo)', onPress: () => router.push('/oyun-yonetimi'), demoOnly: true, localOnly: true },
  { icon: 'sparkles-outline', label: 'Animasyon kataloğu yönetimi (demo)', onPress: () => router.push('/animasyon-yonetimi'), demoOnly: true, localOnly: true },
  { icon: 'flash-outline', label: 'PK yönetimi (demo)', onPress: () => router.push('/pk-yonetimi'), demoOnly: true, localOnly: true },
  { icon: 'leaf-outline', label: 'Şanslı hediye yönetimi (demo)', onPress: () => router.push('/lucky-yonetimi'), demoOnly: true, localOnly: true },
  { icon: 'key-outline', label: 'Rol ve Yetki Merkezi (demo)', onPress: () => router.push('/yetki'), demoOnly: true, localOnly: true },
  { icon: 'briefcase-outline', label: 'Ajans başvuru yönetimi (demo)', onPress: () => router.push('/ajans/yonetim'), demoOnly: true, localOnly: true },
];
const SUPPORT: Item[] = [
  { icon: 'headset-outline', label: 'Müşteri hizmetleri', onPress: () => router.push('/destek') },
  { icon: 'shield-checkmark-outline', label: 'Güvenlik Merkezi', onPress: () => router.push('/ayarlar') },
  { icon: 'settings-outline', label: 'Ayarlar', onPress: () => router.push('/ayarlar') },
];

export default function ProfileScreen() {
  const { coins, isHost, following, blocked, me, logout, vipLevel, equipped, wealthLevel, paidGames, charmLevel, agencyId, myRoom, svipLevel, nobleTier, inventory, vipDays } = useApp();
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  const { casino } = useGames();
  const specialId = cosmeticById(equipped.specialId);
  const noble = nobleInfo(nobleTier);
  const live = liveMode();
  // Live: my counts, id and agency from the server (null / undefined until read); my open room from /api/rooms.
  const server = useMeStats();
  const serverRooms = useServerRooms();
  const ownRoom = live ? serverRooms.find((r) => r.hostId === 'me') : undefined;
  // My follows as three separate lists, each number its list (lib/follow-ties): Takipçiler and Takip one-way only,
  // people who follow each other only under Arkadaşlar (Mesajlar › Arkadaşlarım, same definition). Live: counted by
  // the server (none until read); demo: the sample people. Visitors come from the server (who they are only with VIP).
  const demoTies = splitTies(tiesOf(following, FOLLOWS_ME, blocked));
  const followers = live ? (server.stats?.followers ?? null) : demoTies.followers.length;
  const followingCount = live ? (server.stats?.following ?? null) : demoTies.following.length;
  const friendCount = live ? (server.stats?.friends ?? null) : demoTies.friends.length;
  // Takipçiler / Takip open their list (live: read from the server; demo: the sample people).
  const [list, setList] = useState<OneWay | null>(null);
  const loadList = (side: OneWay) => {
    if (live) return loadMyList(side);
    return demoTies[side].map(({ id }) => { const u = userById(id); return { id: u.id, name: u.name, avatarUrl: u.avatar || null }; });
  };
  const visitors = useProfileVisitors();
  // The dot is lit until the visitors are looked at, and again when someone new comes (lib/visitors-seen).
  const unseenVisits = useVisitorsUnseen(visitors.newest);
  // A visit notice (lib/push-target, lib/live/sync) opens the visitors here; the mark is taken off so the next one does too.
  const { ziyaretciler } = useLocalSearchParams<{ ziyaretciler?: string }>();
  const [visitorsOpen, setVisitorsOpen] = useState(!!ziyaretciler);
  const [askedVisitors, setAskedVisitors] = useState(ziyaretciler);
  if (ziyaretciler !== askedVisitors) {
    setAskedVisitors(ziyaretciler);
    if (ziyaretciler) setVisitorsOpen(true);
  }
  useEffect(() => {
    if (ziyaretciler) router.setParams({ ziyaretciler: undefined });
  }, [ziyaretciler]);
  const completion = myCompletion(me, live);
  useMyMarks(live);
  // My public id: the one others see on my profile, my own number from the server (an older server: the one made
  // from my server id, data/profile publicIdOf); none until known.
  const serverId = server.stats?.serverId ?? myServerId();
  const publicId = specialId ? specialId.name.replace('ID ', '') : live ? publicIdOf(me, serverId) : '10284731';

  const main: Item[] = [
    { icon: 'diamond-outline', img: 'diamond', label: 'Gelir', onPress: () => router.push('/gelir') },
    { icon: 'business-outline', img: 'coin', label: 'Jeton Noktası', onPress: () => router.push('/coins-bank') },
    { icon: 'storefront-outline', img: 'bag', label: 'Çarşı', onPress: () => router.push('/magaza') },
    {
      icon: 'checkmark-circle-outline',
      label: 'Kimlik Doğrulamam',
      dot: !me.verified,
      onPress: () => showAlert(me.verified ? 'Gerçek kişi doğrulandı' : 'Doğrulama gerekli', me.verified ? 'Selfie doğrulaman tamam.' : 'Para çekmek ve davet ödülü için selfie doğrulaması yap.'),
    },
    { icon: 'bag-handle-outline', img: 'gift', label: 'Çantam', dot: inventory.size > 0, onPress: () => router.push('/canta') },
    // Etkinlik Merkezi on Odamın Etkinlikleri: my places, the ones that passed, my rooms' events.
    { icon: 'calendar-outline', label: 'Etkinliklerim', onPress: () => openEvents({ tab: 'mine' }) },
    { icon: 'ribbon-outline', img: 'crown', label: 'Cömertlik ve Yankı', onPress: () => router.push('/seviye') },
    // Koruma is the server's (lib/live/guard): who guards me, whom I guard, my threshold.
    ...(live ? [{ icon: 'shield-half-outline', img: 'heart', label: 'Benim Koruma', onPress: () => router.push('/koruma') } satisfies Item] : []),
  ];
  // Live: agency rows follow my membership on the server (none shows until it is read).
  const hasAgency = live ? (server.agency === undefined ? null : !!server.agency) : !!agencyId;
  const visible = (m: Item) => rowVisible(m, { demo: IS_DEMO, live, hasAgency });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32, gap: 12 }}>
        <View style={styles.top}>
          <Pressable onPress={() => router.push('/kullanici/me')} accessibilityLabel="Profilim">
            <FramedAvatar uri={me.avatar} size={78} vipLevel={vipLevel} frameId={equipped.frame} artScale={1.4} markUid="me" />
          </Pressable>
          <View style={{ flex: 1, gap: 5 }}>
            <View style={styles.nameRow}>
              {/* One word stays on one line and shrinks: with two lines Android would break it mid-word instead. */}
              <Text style={styles.name} numberOfLines={/\s/.test(me.name.trim()) ? 2 : 1} adjustsFontSizeToFit minimumFontScale={0.45}>
                {me.name}
              </Text>
              {me.verified && <VerifiedBadge size={16} />}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {/* A size up here: under the big name the small chips' pictures were too small to read. */}
              <GenderChip user={me} owner size="md" />
              <LevelChips wealth={wealthLevel} charm={charmLevel} size="md" />
            </View>
            <AffiliationPills user={me} />
            {publicId !== null && (
              <Pressable onPress={() => copyText(publicId, 'ID')} hitSlop={{ top: 4, bottom: 12 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[styles.id, specialId && { color: colors.gold, fontWeight: '800' }]}>ID:{specialId ? `${publicId} ✦` : publicId}</Text>
                <Ionicons name="copy-outline" size={13} color={colors.textDim} />
              </Pressable>
            )}
          </View>
          <Pressable style={styles.completion} onPress={() => router.push('/kullanici/me')} hitSlop={{ top: 9, bottom: 9 }} accessibilityLabel="Profil tamamlama">
            <Ionicons name="person-outline" size={14} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>%{completion}</Text>
            <View style={styles.redDot} />
            <Ionicons name="chevron-forward" size={14} color={colors.text} />
          </Pressable>
        </View>

        {/* Profil izleri: a mark on my photo, who left it and how it goes (my marks read when the tab opens). */}
        <OwnMarkNote style={{ marginHorizontal: 16 }} />

        <View style={styles.stats}>
          <Stat n={followers} label="Takipçiler" onPress={() => setList('followers')} />
          <Stat n={followingCount} label="Takip" onPress={() => setList('following')} />
          <Stat n={friendCount} label="Arkadaşlar" onPress={() => router.push({ pathname: '/(tabs)/mesajlar', params: { tab: 'friends' } })} />
          {/* Open to everyone: without the Abonelik the visits show blurred (components/visitors-sheet). */}
          <Stat n={visitors.count} label="Ziyaretçiler" dot={unseenVisits} onPress={() => setVisitorsOpen(true)} />
        </View>

        <View style={styles.card}>
          <Pressable style={styles.rechargeRow} onPress={() => router.push('/cuzdan')} accessibilityLabel="Yükleme">
            <Text style={styles.h2} maxFontSizeMultiplier={1}>
              Yükleme
            </Text>
            <View style={styles.rewardTag}>
              <Ionicons name="gift" size={11} color={semantic.moneyText} />
              <Text style={styles.rewardText} maxFontSizeMultiplier={1}>
                Ödül
              </Text>
            </View>
            <Icon3D name="coin" size={20} />
            {/* The whole balance always shows: it shrinks to fit, it is never cut. */}
            <Text style={styles.coinN} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.45}>
              {coins.toLocaleString('tr-TR')}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {/* Each tile has its own picture: the VIP level's emblem, the subscription's crown, the rank's crest (the
                first level's emblem and crest, dimmed, until there is one). */}
            <StatusCard
              title="VIP"
              sub={svipLevel ? `VIP ${svipLevel}` : 'Yok'}
              colors={['#D02E78', '#4A1630']}
              icon={<Art name={SVIP_LEVELS[Math.max(0, Math.min(SVIP_LEVELS.length, svipLevel) - 1)].art} size={30} style={!svipLevel && { opacity: 0.6 }} />}
              onPress={() => router.push({ pathname: '/vip', params: { tab: 'svip' } })}
            />
            <StatusCard
              title="Abonelik"
              sub={vipDays > 0 ? `${vipDays} gün` : 'Yok'}
              colors={['#B7832E', '#4A3410']}
              icon={<Icon3D name="crown" size={30} style={{ opacity: vipDays > 0 ? 1 : 0.9 }} />}
              onPress={() => router.push({ pathname: '/vip', params: { tab: 'vip' } })}
            />
            <StatusCard
              title="Rütbe"
              sub={noble ? `${noble.emoji} ${noble.name}` : 'Henüz yok'}
              colors={['#7A2E4A', '#3A1A2E']}
              dot={!noble}
              icon={<Art name={noble?.art ?? NOBLE_TIERS[0].art} size={30} style={!noble && { opacity: 0.6 }} />}
              onPress={() => router.push({ pathname: '/vip', params: { tab: 'noble' } })}
            />
          </View>
        </View>

        <View style={[styles.card, { flexDirection: 'row' }]}>
          <Shortcut emoji="🎁" label="Jeton Kazan" onPress={() => router.push('/gorevler')} />
          <Shortcut emoji="⛺" label="Ailem" onPress={() => router.push('/aile')} />
          {/* Invite rewards: the demo's, or the server's in a live build (server/api/referrals.mjs). */}
          <Shortcut emoji="✉️" label="Arkadaşını Getir" onPress={() => router.push('/davet')} />
        </View>

        {myRoom.profileVisible && live && (
          // Live: my open room as the server has it (its id and who is in it now), or the way to open one.
          <Pressable onPress={() => router.push(ownRoom ? `/oda/${ownRoom.id}` : '/oda/yeni')} style={styles.roomCta} accessibilityLabel={ownRoom ? 'Odam' : 'Odanı aç'}>
            <Icon3D name="mic" size={28} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>
                {ownRoom ? ownRoom.title || 'Odam' : 'Odanı aç'}
              </Text>
              <Text style={{ color: colors.textDim, fontSize: 12 }} numberOfLines={1}>
                {ownRoom ? `Odam · ID ${roomIdText(ownRoom)} · ${ownRoom.listeners.toLocaleString('tr-TR')} kişi içeride` : 'Hemen aç, arkadaşlarını çağır.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </Pressable>
        )}
        {myRoom.profileVisible && !live && (
          <Pressable onPress={() => router.push('/oda/yeni')} style={styles.roomCta} accessibilityLabel="Odam">
            <Icon3D name="mic" size={28} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{myRoom.title}</Text>
              <Text style={{ color: colors.textDim, fontSize: 12 }}>
                Odam · Lv.{roomLevel(myRoom.xp)} · ID {roomCode('yeni')} · {myRoom.memberIds.length + 1} üye
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </Pressable>
        )}
        {!isHost && (
          <Pressable onPress={() => router.push('/yayinci')} style={styles.roomCta}>
            <Icon3D name="diamond" size={28} />
            <Text style={{ color: colors.text, flex: 1, fontWeight: '600' }}>Yayıncı ol, hediyelerden para kazan</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </Pressable>
        )}

        {/* From Cömertlik Lv.2; a live build plays these on the server (lib/live/casino). A game switched off there drops out. */}
        {casinoVisible(wealthLevel, paidGames) && (
          <View style={styles.gameCard}>
            <Pressable style={styles.gameHead} onPress={() => router.push('/oyunlar')} accessibilityLabel="Oyun Salonu">
              <Icon3D name="wheel" size={30} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>Oyun Salonu</Text>
                <Text style={{ color: colors.textDim, fontSize: 12 }}>Odaya girmeden oyna</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
            </Pressable>
            <View style={styles.gameRow}>
              {(
                [
                  ['slot', '🎰', 'Gece Yarısı Çarkı'],
                  ['jackpot', '💰', 'Hazine Kulesi'],
                  ['olympus', '🔭', 'Yıldız Avı'],
                  ['fish', '🎈', 'Balon Avı'],
                ] as const
              )
                .filter(([id]) => casino.find((g) => g.id === id)?.active)
                .map(([id, e, l]) => (
                  <Pressable key={id} style={styles.gameTile} onPress={() => router.push({ pathname: '/oyunlar', params: { oyun: id } })} accessibilityLabel={l}>
                    <GameIcon id={id} emoji={e} size={26} />
                    <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700', textAlign: 'center' }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {l}
                    </Text>
                  </Pressable>
                ))}
            </View>
          </View>
        )}

        <Group items={main.filter(visible)} />
        <Group items={GROWTH.filter(visible)} />
        <Group items={SUPPORT} />

        <Pressable style={styles.logout} onPress={() =>
            confirmLogout(() => {
              logout();
              // Live mode: as in Ayarlar, a Google account's session ends too.
              if (liveMode()) void liveSignOut().catch(() => {});
            })
          } accessibilityRole="button">
          <Ionicons name="log-out-outline" size={18} color={colors.red} />
          <Text style={{ color: colors.red, fontWeight: '600' }}>Çıkış yap</Text>
        </Pressable>
      </ScrollView>
      <FollowListSheet visible={list !== null} {...MY_LISTS[list ?? 'followers']} load={() => loadList(list ?? 'followers')} onClose={() => setList(null)} />
      <VisitorsSheet visible={visitorsOpen} rows={visitors.rows} count={visitors.count} unlocked={visitors.unlocked} newest={visitors.newest} onClose={() => setVisitorsOpen(false)} />
    </SafeAreaView>
  );
}

function Group({ items }: { items: Item[] }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.card, { paddingVertical: 4 }]}>
      {items.map((m, i) => (
        <Pressable key={m.label} style={[styles.menuRow, i > 0 && styles.sep]} onPress={m.onPress} accessibilityLabel={m.label}>
          {m.img ? <Icon3D name={m.img} size={28} /> : <Ionicons name={m.icon} size={24} color={colors.text} />}
          <Text style={styles.menuLabel}>{m.label}</Text>
          {m.dot && <View style={styles.redDot} />}
          <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
        </Pressable>
      ))}
    </View>
  );
}

/** Status tile; `sub` stays short (its own picture sits in the bottom-right corner). */
function StatusCard({ title, sub, colors: c, dot, icon, onPress }: { title: string; sub: string; colors: [string, string]; dot?: boolean; icon: ReactNode; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable style={{ flex: 1 }} onPress={onPress} accessibilityLabel={title}>
      <LinearGradient colors={c} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.status}>
        {dot && <View style={[styles.redDot, { position: 'absolute', top: 8, right: 8 }]} />}
        {/* One line in every tile, so the three stay the same height ("Abonelik" broke in two on narrow phones). */}
        <Text style={styles.statusTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {title}
        </Text>
        <Text style={styles.statusSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {sub}
        </Text>
        <View style={{ position: 'absolute', right: 6, bottom: 6 }} pointerEvents="none">
          {icon}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function Shortcut({ emoji, label, onPress }: { emoji: string; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable style={{ flex: 1, alignItems: 'center', gap: 6 }} onPress={onPress} accessibilityLabel={label}>
      <View style={styles.shortIcon}>
        <EmojiIcon emoji={emoji} size={30} />
      </View>
      <Text style={{ color: colors.text, fontSize: 14, textAlign: 'center' }} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

/** `n` null: not read from the server yet. */
function Stat({ n, label, onPress, dot }: { n: number | null; label: string; onPress?: () => void; dot?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable style={{ flex: 1, alignItems: 'center', gap: 4 }} onPress={onPress} disabled={!onPress}>
      <View style={{ flexDirection: 'row' }}>
        <Text style={styles.statN} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {n === null ? '–' : n.toLocaleString('tr-TR')}
        </Text>
        {/* Beside the number without taking width, so it stays centred over its label. */}
        {dot && <View style={[styles.redDot, { position: 'absolute', right: -9, top: 2 }]} />}
      </View>
      <Text style={styles.statL} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {label}
      </Text>
    </Pressable>
  );
}

// Cards that carry their own colored rim keep it and take only the lift's shadow on paper.
const useStyles = makeStyles(({ colors, semantic, lift, dark }) => ({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  name: { color: colors.text, fontSize: 22, fontWeight: '800', flexShrink: 1 },
  id: { color: colors.textDim, fontSize: 13 },
  // In the top-right corner beside the name line only (which keeps room for it), so the chips, the agency and
  // Aile pills and the ID below use the whole width.
  completion: { position: 'absolute', top: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, ...lift },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 104 },
  redDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.red },
  stats: { flexDirection: 'row', paddingHorizontal: 8 },
  statN: { color: colors.text, fontSize: 20, fontWeight: '800' },
  statL: { color: colors.textDim, fontSize: 13 },
  card: { backgroundColor: colors.card, borderRadius: 18, marginHorizontal: 16, padding: 14, gap: 12, ...lift },
  rechargeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h2: { color: colors.text, fontSize: 18, fontWeight: '800' },
  rewardTag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: dark ? 'rgba(246,189,96,0.14)' : 'rgba(246,189,96,0.22)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  rewardText: { color: semantic.moneyText, fontWeight: '700', fontSize: 12 },
  coinN: { color: colors.gold, fontWeight: '800', fontSize: 18, marginLeft: 'auto', flexShrink: 1 },
  status: { borderRadius: 14, padding: 12, paddingRight: 10, height: 96, justifyContent: 'flex-start', gap: 4, overflow: 'hidden' },
  statusTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  // The corner picture sits below this line, so "Henüz yok" has the tile's whole width.
  statusSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  shortIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  gameCard: { marginHorizontal: 16, backgroundColor: colors.card, borderRadius: 16, padding: 12, gap: 10, borderWidth: 1, borderColor: 'rgba(246,189,96,0.35)', ...(dark ? {} : { boxShadow: lift.boxShadow }) },
  gameHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gameRow: { flexDirection: 'row', gap: 8 },
  gameTile: { flex: 1, alignItems: 'center', gap: 2, backgroundColor: colors.cardAlt, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 2 },
  roomCta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(56,189,248,0.4)', ...(dark ? {} : { boxShadow: lift.boxShadow }) },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  menuLabel: { flex: 1, color: colors.text, fontSize: 16 },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14 },
}));
