import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AffiliationPills, GenderChip } from '@/components/profile-badges';
import { Avatar, FramedAvatar, LevelChips, VerifiedBadge } from '@/components/ui';
import { cosmeticById, roomCode, roomLevel } from '@/data/catalog';
import { USERS } from '@/data/mock';
import { nobleInfo } from '@/data/status';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';
import { EmojiIcon, Icon3D, type Icon3DName } from '@/components/Icon3D';

type IconName = keyof typeof Ionicons.glyphMap;
type Item = { icon: IconName; img?: Icon3DName; label: string; onPress: () => void; tag?: string; dot?: boolean; agencyOnly?: boolean; noAgencyOnly?: boolean };

const GROWTH: Item[] = [
  { icon: 'mic-outline', img: 'mic', label: 'Yayıncı Merkezi', onPress: () => router.push('/yayinci') },
  { icon: 'business-outline', img: 'briefcase', label: 'Ajans', onPress: () => router.push('/ajans'), agencyOnly: true },
  { icon: 'chatbubbles-outline', img: 'chat', label: 'Ajans sohbet grubu', onPress: () => router.push('/ajans/sohbet'), agencyOnly: true },
  { icon: 'git-network-outline', label: 'Üye ağım ve komisyonlar', onPress: () => router.push('/ajans/ag'), agencyOnly: true },
  { icon: 'add-circle-outline', img: 'briefcase', label: 'Ajansa katıl / ajans başvurusu', onPress: () => router.push('/ajans'), noAgencyOnly: true },
  { icon: 'trophy-outline', img: 'trophy', label: 'Sıralama', onPress: () => router.push('/siralama') },
  { icon: 'flash-outline', img: 'bolt', label: 'Hemen Tanış', onPress: () => router.push('/eslesme') },
  { icon: 'notifications-outline', label: 'Bildirimler', onPress: () => router.push('/bildirimler') },
  { icon: 'game-controller-outline', label: 'Oyun kataloğu yönetimi (demo)', onPress: () => router.push('/oyun-yonetimi') },
  { icon: 'sparkles-outline', label: 'Animasyon kataloğu yönetimi (demo)', onPress: () => router.push('/animasyon-yonetimi') },
  { icon: 'flash-outline', label: 'PK yönetimi (demo)', onPress: () => router.push('/pk-yonetimi') },
  { icon: 'leaf-outline', label: 'Lucky hediye yönetimi (demo)', onPress: () => router.push('/lucky-yonetimi') },
  { icon: 'key-outline', label: 'Rol ve Yetki Merkezi (demo)', onPress: () => router.push('/yetki') },
  { icon: 'briefcase-outline', label: 'Ajans başvuru yönetimi (BD / Admin)', onPress: () => router.push('/ajans/yonetim') },
];
const SUPPORT: Item[] = [
  { icon: 'headset-outline', label: 'Müşteri hizmetleri', onPress: () => router.push('/destek') },
  { icon: 'shield-checkmark-outline', label: 'Güvenlik Merkezi', onPress: () => router.push('/ayarlar') },
  { icon: 'settings-outline', label: 'Ayarlar', onPress: () => router.push('/ayarlar') },
];
const VISITORS = 53;
const COMPLETION = 46;

export default function ProfileScreen() {
  const { coins, isHost, following, me, logout, vipLevel, equipped, wealthLevel, charmLevel, agencyId, myRoom, svipLevel, vipDays, nobleTier, inventory } = useApp();
  const specialId = cosmeticById(equipped.specialId);
  const noble = nobleInfo(nobleTier);
  const friends = USERS.filter((u) => following.has(u.id)).slice(0, 1);

  const main: Item[] = [
    { icon: 'diamond-outline', img: 'diamond', label: 'Gelir', onPress: () => router.push('/gelir') },
    { icon: 'business-outline', img: 'coin', label: 'Coins Bank', tag: 'Yeni!', onPress: () => router.push('/coins-bank') },
    { icon: 'storefront-outline', img: 'bag', label: 'Alışveriş Merkezi', tag: 'Yeni!', onPress: () => router.push('/magaza') },
    {
      icon: 'checkmark-circle-outline',
      label: 'Kimlik Doğrulamam',
      dot: !me.verified,
      onPress: () => showAlert(me.verified ? 'Gerçek kişi doğrulandı ✅' : 'Doğrulama gerekli', me.verified ? 'Selfie doğrulaman tamamlandı. Para çekme ve davet ödülleri için gereklidir.' : 'Para çekmek ve davet ödülü almak için selfie ile gerçek kişi doğrulaması yap.'),
    },
    { icon: 'bag-handle-outline', img: 'gift', label: 'Çantam', dot: inventory.size > 0, onPress: () => router.push('/magaza') },
    { icon: 'ribbon-outline', img: 'crown', label: 'Servet ve Cazibe Seviyesi', onPress: () => router.push('/seviye') },
  ];
  const visible = (m: Item) => (m.agencyOnly ? !!agencyId : m.noAgencyOnly ? !agencyId : true);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32, gap: 12 }}>
        <View style={styles.top}>
          <Pressable onPress={() => router.push('/kullanici/me')} accessibilityLabel="Profilim">
            <FramedAvatar uri={me.avatar} size={78} vipLevel={vipLevel} frameId={equipped.frame} artScale={1.4} />
          </Pressable>
          <View style={{ flex: 1, gap: 5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.name} numberOfLines={1}>
                {me.name}
              </Text>
              {me.verified && <VerifiedBadge size={16} />}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <GenderChip user={me} owner />
              <LevelChips wealth={wealthLevel} charm={charmLevel} />
            </View>
            <AffiliationPills user={me} />
            <Pressable onPress={() => showAlert('ID kopyalandı', specialId ? specialId.name : '10284731')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.id, specialId && { color: colors.gold, fontWeight: '800' }]}>ID:{specialId ? `${specialId.name.replace('ID ', '')} ✦` : '10284731'}</Text>
              <Ionicons name="copy-outline" size={13} color={colors.textDim} />
            </Pressable>
          </View>
          <Pressable style={styles.completion} onPress={() => router.push('/kullanici/me')} accessibilityLabel="Profil tamamlama">
            <Ionicons name="person-outline" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>%{COMPLETION}</Text>
            <View style={styles.redDot} />
            <Ionicons name="chevron-forward" size={14} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.stats}>
          <Stat n={128} label="Takipçiler" />
          <Stat n={following.size} label="Takip etmek" />
          <Pressable style={{ flex: 1, alignItems: 'center', gap: 4 }} onPress={() => router.push('/(tabs)/mesajlar')}>
            {friends[0] ? <Avatar uri={friends[0].avatar} size={30} /> : <Text style={styles.statN}>0</Text>}
            <Text style={styles.statL}>Arkadaşlarım</Text>
          </Pressable>
          <Stat
            n={VISITORS}
            label="Ziyaretçiler"
            dot
            onPress={() => showAlert('Ziyaretçiler', vipDays > 0 ? 'Son 7 günde profilini 53 kişi ziyaret etti. (VIP ayrıcalığı)' : 'Ziyaretçileri görmek VIP ayrıcalığıdır.', vipDays > 0 ? undefined : [{ text: 'Kapat', style: 'cancel' }, { text: "VIP'e bak", onPress: () => router.push({ pathname: '/vip', params: { tab: 'vip' } }) }])}
          />
        </View>

        <View style={styles.card}>
          <Pressable style={styles.rechargeRow} onPress={() => router.push('/cuzdan')} accessibilityLabel="Yükleme">
            <Text style={styles.h2}>Yükleme</Text>
            <Text style={styles.rewardTag}>🎁 Ödül</Text>
            <Icon3D name="coin" size={20} />
            <Text style={styles.coinN}>{coins.toLocaleString('tr-TR')}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <StatusCard title="SVIP" sub={svipLevel ? `SVIP${svipLevel}` : 'SVIP Değil'} colors={['#0A8F95', '#0B3B4A']} tag="NEW" onPress={() => router.push({ pathname: '/vip', params: { tab: 'svip' } })} />
            <StatusCard title="VIP" sub={vipDays > 0 ? `${vipDays} gün · VIP${vipLevel}` : vipLevel ? `Seviye VIP${vipLevel}` : 'VIP değil'} colors={['#B7832E', '#4A3410']} onPress={() => router.push({ pathname: '/vip', params: { tab: 'vip' } })} />
            <StatusCard title="Asil" sub={noble ? `${noble.emoji} ${noble.name}` : 'Henüz Alınmadı'} colors={['#7A2E4A', '#3A1A2E']} dot={!noble} onPress={() => router.push({ pathname: '/vip', params: { tab: 'noble' } })} />
          </View>
        </View>

        <View style={[styles.card, { flexDirection: 'row' }]}>
          <Shortcut emoji="🎁" label="Bedava Para" onPress={() => router.push('/gorevler')} />
          <Shortcut emoji="⛺" label="Kabile" onPress={() => router.push('/aile')} />
          <Shortcut emoji="✉️" label="Davet" tag="Para Kazan" onPress={() => router.push('/davet')} />
        </View>

        {myRoom.profileVisible && (
          <Pressable onPress={() => router.push('/oda/yeni')} style={styles.roomCta} accessibilityLabel="Odam">
            <Icon3D name="mic" size={28} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{myRoom.title}</Text>
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
            <Text style={{ color: '#fff', flex: 1, fontWeight: '600' }}>Yayıncı ol, hediyelerden para kazan</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </Pressable>
        )}

        <View style={styles.gameCard}>
          <Pressable style={styles.gameHead} onPress={() => router.push('/oyunlar')} accessibilityLabel="Oyun Merkezi">
            <Icon3D name="wheel" size={30} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Oyun Merkezi</Text>
              <Text style={{ color: colors.textDim, fontSize: 12 }}>
                Casino oyunları Servet Lv.2+ · {wealthLevel >= 2 ? 'erişimin açık' : `şu an Lv.${wealthLevel}`} · odaya girmeden oyna
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </Pressable>
          <View style={styles.gameRow}>
            {(
              [
                ['slot', '🎰', 'Lucky 77'],
                ['jackpot', '💰', 'Mega Jackpot'],
                ['olympus', '⚡', 'Olympus'],
                ['fish', '🐟', 'Balık Avı'],
              ] as const
            ).map(([id, e, l]) => (
              <Pressable key={id} style={styles.gameTile} onPress={() => router.push({ pathname: '/oyunlar', params: { oyun: id } })} accessibilityLabel={l}>
                <Text style={{ fontSize: 26 }}>{e}</Text>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
                  {l}
                </Text>
                {vipLevel < 2 && <Text style={styles.gameLock}>🔒</Text>}
              </Pressable>
            ))}
          </View>
        </View>

        <Group items={main} />
        <Group items={GROWTH.filter(visible)} />
        <Group items={SUPPORT} />

        <Pressable style={styles.logout} onPress={logout}>
          <Ionicons name="log-out-outline" size={18} color={colors.red} />
          <Text style={{ color: colors.red, fontWeight: '600' }}>Çıkış yap</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Group({ items }: { items: Item[] }) {
  return (
    <View style={[styles.card, { paddingVertical: 4 }]}>
      {items.map((m, i) => (
        <Pressable key={m.label} style={[styles.menuRow, i > 0 && styles.sep]} onPress={m.onPress} accessibilityLabel={m.label}>
          {m.img ? <Icon3D name={m.img} size={28} /> : <Ionicons name={m.icon} size={24} color="#fff" />}
          <Text style={styles.menuLabel}>{m.label}</Text>
          {m.tag && <Text style={{ color: '#F59E0B', fontWeight: '800', fontSize: 12 }}>{m.tag}</Text>}
          {m.dot && <View style={styles.redDot} />}
          <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
        </Pressable>
      ))}
    </View>
  );
}

function StatusCard({ title, sub, colors: c, tag, dot, onPress }: { title: string; sub: string; colors: [string, string]; tag?: string; dot?: boolean; onPress: () => void }) {
  return (
    <Pressable style={{ flex: 1 }} onPress={onPress} accessibilityLabel={title}>
      <LinearGradient colors={c} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.status}>
        {tag && <Text style={styles.newTag}>{tag}</Text>}
        {dot && <View style={[styles.redDot, { position: 'absolute', top: 8, right: 8 }]} />}
        <Text style={styles.statusTitle}>{title}</Text>
        <Text style={styles.statusSub} numberOfLines={1}>
          {sub}
        </Text>
        {title !== 'Asil' && <Icon3D name="crown" size={34} style={{ position: 'absolute', right: 6, bottom: 6, opacity: title === 'VIP' ? 1 : 0.9 }} />}
      </LinearGradient>
    </Pressable>
  );
}

function Shortcut({ emoji, label, tag, onPress }: { emoji: string; label: string; tag?: string; onPress: () => void }) {
  return (
    <Pressable style={{ flex: 1, alignItems: 'center', gap: 6 }} onPress={onPress} accessibilityLabel={label}>
      {tag && <Text style={styles.earnTag}>{tag}</Text>}
      <View style={styles.shortIcon}>
        <EmojiIcon emoji={emoji} size={30} />
      </View>
      <Text style={{ color: '#fff', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

function Stat({ n, label, onPress, dot }: { n: number; label: string; onPress?: () => void; dot?: boolean }) {
  return (
    <Pressable style={{ flex: 1, alignItems: 'center', gap: 4 }} onPress={onPress} disabled={!onPress}>
      <View style={{ flexDirection: 'row' }}>
        <Text style={styles.statN}>{n.toLocaleString('tr-TR')}</Text>
        {dot && <View style={[styles.redDot, { marginLeft: 2 }]} />}
      </View>
      <Text style={styles.statL}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  name: { color: '#fff', fontSize: 22, fontWeight: '800', flexShrink: 1 },
  id: { color: colors.textDim, fontSize: 13 },
  completion: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  redDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.red },
  stats: { flexDirection: 'row', paddingHorizontal: 8 },
  statN: { color: '#fff', fontSize: 20, fontWeight: '800' },
  statL: { color: colors.textDim, fontSize: 13 },
  card: { backgroundColor: colors.card, borderRadius: 18, marginHorizontal: 16, padding: 14, gap: 12 },
  rechargeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h2: { color: '#fff', fontSize: 22, fontWeight: '800' },
  rewardTag: { color: '#FF8A97', backgroundColor: 'rgba(255,138,151,0.15)', fontWeight: '800', fontSize: 12, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  coinN: { color: colors.gold, fontWeight: '800', fontSize: 18, marginLeft: 'auto' },
  status: { borderRadius: 14, padding: 12, minHeight: 74, justifyContent: 'center', gap: 4 },
  statusTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  statusSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  newTag: { position: 'absolute', top: -8, right: 10, backgroundColor: '#F97316', color: '#fff', fontSize: 11, fontWeight: '800', borderRadius: 8, paddingHorizontal: 6, overflow: 'hidden' },
  shortIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  earnTag: { position: 'absolute', top: -10, right: 4, color: '#FDE047', fontWeight: '900', fontStyle: 'italic', fontSize: 12, zIndex: 1 },
  gameCard: { marginHorizontal: 16, backgroundColor: colors.card, borderRadius: 16, padding: 12, gap: 10, borderWidth: 1, borderColor: 'rgba(246,189,96,0.35)' },
  gameHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gameRow: { flexDirection: 'row', gap: 8 },
  gameTile: { flex: 1, alignItems: 'center', gap: 2, backgroundColor: colors.cardAlt, borderRadius: 12, paddingVertical: 8 },
  gameLock: { position: 'absolute', top: 4, right: 6, fontSize: 10 },
  roomCta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(56,189,248,0.4)' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  menuLabel: { flex: 1, color: '#fff', fontSize: 16 },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14 },
});
