import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { AffiliationPills, GenderChip } from '@/components/profile-badges';
import { FramedAvatar, LevelChips, VerifiedBadge } from '@/components/ui';
import { cosmeticById, roomCode, roomLevel } from '@/data/catalog';
import { VisitorsSheet, useProfileVisitors } from '@/components/visitors-sheet';
import { FollowListSheet } from '@/components/follow-list-sheet';
import { FOLLOWS_ME, userById } from '@/data/mock';
import { displayId } from '@/data/profile';
import { nobleInfo } from '@/data/status';
import { confirmLogout, showAlert } from '@/lib/alert';
import { copyText } from '@/lib/clipboard';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';
import { EmojiIcon, Icon3D, type Icon3DName } from '@/components/Icon3D';
import { GameIcon } from '@/components/GameArt';
import { IS_DEMO } from '@/lib/build';
import { casinoVisible } from '@/lib/games';
import { liveMode, myServerId, oneOnOneOpen, useServerRooms } from '@/lib/live';
import { liveSignOut } from '@/lib/live/account';
import { useIsAdmin } from '@/lib/live/admin';
import { loadFollowList, type FollowSide } from '@/lib/live/follows';
import { useMeStats } from '@/lib/live/me-stats';
import { myCompletion, rowVisible, type MenuFlags } from '@/lib/me-view';

type IconName = keyof typeof Ionicons.glyphMap;
type Item = MenuFlags & { icon: IconName; img?: Icon3DName; label: string; onPress: () => void; dot?: boolean };

const GROWTH: Item[] = [
  { icon: 'mic-outline', img: 'mic', label: 'Yayıncı Merkezi', onPress: () => router.push('/yayinci') },
  { icon: 'business-outline', img: 'briefcase', label: 'Ajans', onPress: () => router.push('/ajans'), agencyOnly: true },
  // The agency chat group and the member network are demo screens; with a server, /ajans holds the real ones.
  { icon: 'chatbubbles-outline', img: 'chat', label: 'Ajans sohbet grubu', onPress: () => router.push('/ajans/sohbet'), agencyOnly: true, localOnly: true },
  { icon: 'git-network-outline', label: 'Üye ağım ve komisyonlar', onPress: () => router.push('/ajans/ag'), agencyOnly: true, localOnly: true },
  { icon: 'add-circle-outline', img: 'briefcase', label: 'Ajansa katıl / ajans başvurusu', onPress: () => router.push('/ajans'), noAgencyOnly: true },
  { icon: 'trophy-outline', img: 'trophy', label: 'Sıralama', onPress: () => router.push('/siralama') },
  ...(oneOnOneOpen() ? [{ icon: 'flash-outline', img: 'bolt', label: 'Hemen Tanış', onPress: () => router.push('/eslesme') } satisfies Item] : []),
  { icon: 'notifications-outline', label: 'Bildirimler', onPress: () => router.push('/bildirimler') },
  { icon: 'game-controller-outline', label: 'Oyun kataloğu yönetimi (demo)', onPress: () => router.push('/oyun-yonetimi'), demoOnly: true, localOnly: true },
  { icon: 'sparkles-outline', label: 'Animasyon kataloğu yönetimi (demo)', onPress: () => router.push('/animasyon-yonetimi'), demoOnly: true, localOnly: true },
  { icon: 'flash-outline', label: 'PK yönetimi (demo)', onPress: () => router.push('/pk-yonetimi'), demoOnly: true, localOnly: true },
  { icon: 'leaf-outline', label: 'Uğurlu hediye yönetimi (demo)', onPress: () => router.push('/lucky-yonetimi'), demoOnly: true, localOnly: true },
  { icon: 'key-outline', label: 'Rol ve Yetki Merkezi (demo)', onPress: () => router.push('/yetki'), demoOnly: true, localOnly: true },
  { icon: 'briefcase-outline', label: 'Ajans başvuru yönetimi (demo)', onPress: () => router.push('/ajans/yonetim'), demoOnly: true, localOnly: true },
];
const SUPPORT: Item[] = [
  { icon: 'headset-outline', label: 'Müşteri hizmetleri', onPress: () => router.push('/destek') },
  { icon: 'shield-checkmark-outline', label: 'Güvenlik Merkezi', onPress: () => router.push('/ayarlar') },
  { icon: 'settings-outline', label: 'Ayarlar', onPress: () => router.push('/ayarlar') },
];
/** Agency applications on the server are approved in Ajans Merkezi › Onaylar (platform admins). */
const CENTER: Item = { icon: 'briefcase-outline', label: 'Ajans Merkezi (başvuru onayları)', onPress: () => router.push('/ajans/merkez' as Href) };

export default function ProfileScreen() {
  const { coins, isHost, following, blocked, me, logout, vipLevel, equipped, wealthLevel, charmLevel, agencyId, myRoom, svipLevel, nobleTier, inventory } = useApp();
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  const isAdmin = useIsAdmin();
  const specialId = cosmeticById(equipped.specialId);
  const noble = nobleInfo(nobleTier);
  const live = liveMode();
  // Live: my counts, id and agency from the server (null / undefined until read); my open room from /api/rooms.
  const server = useMeStats();
  const serverRooms = useServerRooms();
  const ownRoom = live ? serverRooms.find((r) => r.hostId === 'me') : undefined;
  // Same definitions as Mesajlar (Arkadaşlarım, Ziyaretçiler) so the numbers match when you tap through. Live:
  // Mesajlar's friends are the people I follow; visitors come from the server (who they are only with VIP).
  const followers = live ? (server.stats?.followers ?? null) : [...FOLLOWS_ME].filter((id) => !blocked.has(id)).length;
  const followingCount = live ? (server.stats?.following ?? following.size) : following.size;
  const friendCount = live ? [...following].filter((id) => id !== 'me' && !blocked.has(id)).length : new Set([...following, ...FOLLOWS_ME].filter((id) => id !== 'me' && !blocked.has(id))).size;
  // Takipçiler / Takip open a list (live: from the server; demo: the sample people).
  const [list, setList] = useState<FollowSide | null>(null);
  const loadList = (side: FollowSide) => {
    if (live) return loadFollowList(side);
    const ids = side === 'followers' ? [...FOLLOWS_ME] : [...following];
    return ids.filter((id) => id !== 'me' && !blocked.has(id)).map((id) => { const u = userById(id); return { id: u.id, name: u.name, avatarUrl: u.avatar || null }; });
  };
  const visitors = useProfileVisitors();
  const [visitorsOpen, setVisitorsOpen] = useState(false);
  const completion = myCompletion(me, live);
  // My public id: the one others see on my profile (data/profile displayId of my server id); none until known.
  const serverId = server.stats?.serverId ?? myServerId();
  const publicId = specialId ? specialId.name.replace('ID ', '') : live ? (serverId ? displayId(serverId) : null) : '10284731';

  const main: Item[] = [
    { icon: 'diamond-outline', img: 'diamond', label: 'Gelir', onPress: () => router.push('/gelir') },
    { icon: 'business-outline', img: 'coin', label: 'Jeton Noktası', onPress: () => router.push('/coins-bank') },
    { icon: 'storefront-outline', img: 'bag', label: 'Çarşı', onPress: () => router.push('/magaza') },
    {
      icon: 'checkmark-circle-outline',
      label: 'Kimlik Doğrulamam',
      dot: !me.verified,
      onPress: () => showAlert(me.verified ? 'Gerçek kişi doğrulandı' : 'Doğrulama gerekli', me.verified ? 'Selfie doğrulaman tamamlandı. Para çekme ve davet ödülleri için gereklidir.' : 'Para çekmek ve davet ödülü almak için selfie ile gerçek kişi doğrulaması yap.'),
    },
    { icon: 'bag-handle-outline', img: 'gift', label: 'Çantam', dot: inventory.size > 0, onPress: () => router.push('/magaza') },
    { icon: 'ribbon-outline', img: 'crown', label: 'Cömertlik ve Yankı', onPress: () => router.push('/seviye') },
  ];
  // Live: agency rows follow my membership on the server (none shows until it is read).
  const hasAgency = live ? (server.agency === undefined ? null : !!server.agency) : !!agencyId;
  const visible = (m: Item) => rowVisible(m, { demo: IS_DEMO, live, hasAgency });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32, gap: 12 }}>
        <View style={styles.top}>
          <Pressable onPress={() => router.push('/kullanici/me')} accessibilityLabel="Profilim">
            <FramedAvatar uri={me.avatar} size={78} vipLevel={vipLevel} frameId={equipped.frame} artScale={1.4} />
          </Pressable>
          <View style={{ flex: 1, gap: 5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.name} numberOfLines={2}>
                {me.name}
              </Text>
              {me.verified && <VerifiedBadge size={16} />}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <GenderChip user={me} owner />
              <LevelChips wealth={wealthLevel} charm={charmLevel} />
            </View>
            <AffiliationPills user={me} />
            {publicId !== null && (
              <Pressable onPress={() => copyText(publicId, 'ID')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[styles.id, specialId && { color: colors.gold, fontWeight: '800' }]}>ID:{specialId ? `${publicId} ✦` : publicId}</Text>
                <Ionicons name="copy-outline" size={13} color={colors.textDim} />
              </Pressable>
            )}
          </View>
          <Pressable style={styles.completion} onPress={() => router.push('/kullanici/me')} accessibilityLabel="Profil tamamlama">
            <Ionicons name="person-outline" size={14} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>%{completion}</Text>
            <View style={styles.redDot} />
            <Ionicons name="chevron-forward" size={14} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.stats}>
          <Stat n={followers} label="Takipçiler" onPress={() => setList('followers')} />
          <Stat n={followingCount} label="Takip" onPress={() => setList('following')} />
          <Stat n={friendCount} label="Arkadaşlar" onPress={() => router.push({ pathname: '/(tabs)/mesajlar', params: { tab: 'friends' } })} />
          <Stat
            n={visitors.count}
            label="Ziyaretçiler"
            dot={(visitors.count ?? 0) > 0}
            onPress={() =>
              visitors.unlocked
                ? setVisitorsOpen(true)
                : showAlert(
                    'Ziyaretçiler',
                    `${visitors.count ? `Son 7 günde profiline ${visitors.count} kişi baktı. ` : ''}Kimlerin baktığını görmek VIP ayrıcalığıdır.`,
                    [
                      { text: 'Kapat', style: 'cancel' },
                      { text: "VIP'e bak", onPress: () => router.push({ pathname: '/vip', params: { tab: 'vip' } }) },
                    ],
                  )
            }
          />
        </View>

        <View style={styles.card}>
          <Pressable style={styles.rechargeRow} onPress={() => router.push('/cuzdan')} accessibilityLabel="Yükleme">
            <Text style={styles.h2}>Yükleme</Text>
            <View style={styles.rewardTag}>
              <Ionicons name="gift" size={11} color={semantic.moneyText} />
              <Text style={styles.rewardText}>Ödül</Text>
            </View>
            <Icon3D name="coin" size={20} />
            <Text style={styles.coinN}>{coins.toLocaleString('tr-TR')}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <StatusCard title="İnci" sub={svipLevel ? `İnci ${svipLevel}` : 'Yok'} colors={['#0A8F95', '#0B3B4A']} onPress={() => router.push({ pathname: '/vip', params: { tab: 'svip' } })} />
            <StatusCard title="VIP" sub={vipLevel ? `VIP${vipLevel}` : 'Yok'} colors={['#B7832E', '#4A3410']} onPress={() => router.push({ pathname: '/vip', params: { tab: 'vip' } })} />
            <StatusCard title="Rütbe" sub={noble ? `${noble.emoji} ${noble.name}` : 'Henüz yok'} colors={['#7A2E4A', '#3A1A2E']} dot={!noble} onPress={() => router.push({ pathname: '/vip', params: { tab: 'noble' } })} />
          </View>
        </View>

        <View style={[styles.card, { flexDirection: 'row' }]}>
          <Shortcut emoji="🎁" label="Jeton Kazan" onPress={() => router.push('/gorevler')} />
          <Shortcut emoji="⛺" label="Ailem" onPress={() => router.push('/aile')} />
          {/* Invite rewards run only in the demo; the server has none yet. */}
          {!live && <Shortcut emoji="✉️" label="Arkadaşını Getir" onPress={() => router.push('/davet')} />}
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
                {ownRoom ? `Odam · ID ${roomCode(ownRoom.id)} · ${ownRoom.listeners.toLocaleString('tr-TR')} kişi içeride` : 'Ad, tür ve istersen şifre seç; odan hemen açılsın.'}
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

        {/* Live: the game hall's games run on this phone only, so the card stays in the demo. */}
        {!live && casinoVisible(wealthLevel) && (
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
                  ['olympus', '🔦', 'Fener Kayalığı'],
                  ['fish', '🐟', 'Mercan Avı'],
                ] as const
              ).map(([id, e, l]) => (
                <Pressable key={id} style={styles.gameTile} onPress={() => router.push({ pathname: '/oyunlar', params: { oyun: id } })} accessibilityLabel={l}>
                  <GameIcon id={id} emoji={e} size={26} />
                  <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
                    {l}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <Group items={main.filter(visible)} />
        <Group items={[...GROWTH.filter(visible), ...(isAdmin ? [CENTER] : [])]} />
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
      <FollowListSheet
        visible={list !== null}
        title={list === 'following' ? 'Takip ettiklerin' : 'Takipçilerin'}
        empty={list === 'following' ? 'Henüz kimseyi takip etmiyorsun.' : 'Henüz takipçin yok.'}
        load={() => loadList(list ?? 'followers')}
        onClose={() => setList(null)}
      />
      <VisitorsSheet visible={visitorsOpen} rows={visitors.rows} count={visitors.count} onClose={() => setVisitorsOpen(false)} />
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

/** Status tile; `sub` stays short (the crown art sits in the bottom-right corner). */
function StatusCard({ title, sub, colors: c, dot, onPress }: { title: string; sub: string; colors: [string, string]; dot?: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable style={{ flex: 1 }} onPress={onPress} accessibilityLabel={title}>
      <LinearGradient colors={c} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.status}>
        {dot && <View style={[styles.redDot, { position: 'absolute', top: 8, right: 8 }]} />}
        <Text style={styles.statusTitle}>{title}</Text>
        <Text style={styles.statusSub} numberOfLines={1}>
          {sub}
        </Text>
        {title !== 'Rütbe' && <Icon3D name="crown" size={34} style={{ position: 'absolute', right: 6, bottom: 6, opacity: title === 'VIP' ? 1 : 0.9 }} />}
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
      <Text style={{ color: colors.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/** `n` null: not read from the server yet. */
function Stat({ n, label, onPress, dot }: { n: number | null; label: string; onPress?: () => void; dot?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable style={{ flex: 1, alignItems: 'center', gap: 4 }} onPress={onPress} disabled={!onPress}>
      <View style={{ flexDirection: 'row' }}>
        <Text style={styles.statN}>{n === null ? '–' : n.toLocaleString('tr-TR')}</Text>
        {dot && <View style={[styles.redDot, { marginLeft: 2 }]} />}
      </View>
      <Text style={styles.statL}>{label}</Text>
    </Pressable>
  );
}

// Cards that carry their own colored rim keep it and take only the lift's shadow on paper.
const useStyles = makeStyles(({ colors, semantic, lift, dark }) => ({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  name: { color: colors.text, fontSize: 22, fontWeight: '800', flexShrink: 1 },
  id: { color: colors.textDim, fontSize: 13 },
  completion: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start', ...lift },
  redDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.red },
  stats: { flexDirection: 'row', paddingHorizontal: 8 },
  statN: { color: colors.text, fontSize: 20, fontWeight: '800' },
  statL: { color: colors.textDim, fontSize: 13 },
  card: { backgroundColor: colors.card, borderRadius: 18, marginHorizontal: 16, padding: 14, gap: 12, ...lift },
  rechargeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h2: { color: colors.text, fontSize: 22, fontWeight: '800' },
  rewardTag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: dark ? 'rgba(246,189,96,0.14)' : 'rgba(246,189,96,0.22)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  rewardText: { color: semantic.moneyText, fontWeight: '700', fontSize: 12 },
  coinN: { color: colors.gold, fontWeight: '800', fontSize: 18, marginLeft: 'auto' },
  status: { borderRadius: 14, padding: 12, minHeight: 74, justifyContent: 'center', gap: 4 },
  statusTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  statusSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  shortIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  gameCard: { marginHorizontal: 16, backgroundColor: colors.card, borderRadius: 16, padding: 12, gap: 10, borderWidth: 1, borderColor: 'rgba(246,189,96,0.35)', ...(dark ? {} : { boxShadow: lift.boxShadow }) },
  gameHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gameRow: { flexDirection: 'row', gap: 8 },
  gameTile: { flex: 1, alignItems: 'center', gap: 2, backgroundColor: colors.cardAlt, borderRadius: 12, paddingVertical: 8 },
  roomCta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(56,189,248,0.4)', ...(dark ? {} : { boxShadow: lift.boxShadow }) },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  menuLabel: { flex: 1, color: colors.text, fontSize: 16 },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14 },
}));
