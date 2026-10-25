import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FramedAvatar, LevelChips, VerifiedBadge, VipTitle } from '@/components/ui';
import { cosmeticById, roomCode, roomLevel } from '@/data/catalog';
import { charmLevel, vipTier, wealthLevel } from '@/data/economy';
import { useApp } from '@/store';
import { colors, gradient } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const SHORTCUTS: { emoji: string; label: string; onPress: () => void }[] = [
  { emoji: '🎙️', label: 'Yayıncı\nMerkezi', onPress: () => router.push('/yayinci') },
  { emoji: '📋', label: 'Görevler', onPress: () => router.push('/gorevler') },
  { emoji: '🏆', label: 'Sıralama', onPress: () => router.push('/siralama') },
  { emoji: '🎰', label: 'Şans\nÇarkı', onPress: () => router.push('/cark') },
];

const MENU: { icon: IconName; label: string; onPress?: () => void; agencyOnly?: boolean; noAgencyOnly?: boolean }[] = [
  { icon: 'wallet-outline', label: 'Cüzdan', onPress: () => router.push('/cuzdan') },
  { icon: 'diamond-outline', label: 'Soyluluk / VIP', onPress: () => router.push('/vip') },
  { icon: 'home-outline', label: 'Aile', onPress: () => router.push('/aile') },
  { icon: 'storefront-outline', label: 'Mağaza (çerçeve, efekt, emoji)', onPress: () => router.push('/magaza') },
  { icon: 'business-outline', label: 'Ajans', onPress: () => router.push('/ajans'), agencyOnly: true },
  { icon: 'chatbubbles-outline', label: 'Ajans sohbet grubu', onPress: () => router.push('/ajans/sohbet'), agencyOnly: true },
  { icon: 'git-network-outline', label: 'Üye ağım ve komisyonlar', onPress: () => router.push('/ajans/ag'), agencyOnly: true },
  { icon: 'add-circle-outline', label: 'Ajansa katıl / ajans kur', onPress: () => router.push('/ajans'), noAgencyOnly: true },
  { icon: 'game-controller-outline', label: 'Oyun merkezi', onPress: () => router.push('/oyunlar') },
  { icon: 'construct-outline', label: 'Kazanç & bonus yönetimi (demo)', onPress: () => router.push('/yonetim') },
  { icon: 'notifications-outline', label: 'Bildirimler', onPress: () => router.push('/bildirimler') },
  { icon: 'flash-outline', label: 'Rastgele Eşleş', onPress: () => router.push('/eslesme') },
  { icon: 'people-outline', label: 'Arkadaşını Davet Et', onPress: () => router.push('/gorevler') },
  { icon: 'settings-outline', label: 'Ayarlar ve gizlilik', onPress: () => router.push('/ayarlar') },
  { icon: 'help-circle-outline', label: 'Yardım & Destek', onPress: () => router.push('/destek') },
];

export default function ProfileScreen() {
  const { coins, diamonds, isHost, following, me, logout, vipLevel, equipped, spentTotal, totalDiamonds, agencyId, myRoom } = useApp();
  const specialId = cosmeticById(equipped.specialId);
  const tier = vipTier(vipLevel);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.top}>
          <FramedAvatar uri={me.avatar} size={88} vipLevel={vipLevel} frameId={equipped.frame} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.name}>
              {me.name}, {me.age}
            </Text>
            {me.verified && <VerifiedBadge size={18} />}
            <View style={styles.level}>
              <Text style={styles.levelText}>Lv.7</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <VipTitle level={vipLevel} />
            <LevelChips wealth={wealthLevel(spentTotal)} charm={charmLevel(totalDiamonds)} />
          </View>
          <Text style={styles.bio}>{me.bio}</Text>
          <Text style={[styles.id, specialId && { color: colors.gold, fontWeight: '800' }]}>
            ID: {specialId ? `${specialId.name.replace('ID ', '')} ✦` : '10284731'} · {me.city}
          </Text>
        </View>

        <View style={styles.stats}>
          <Stat n={following.size} label="Takip" />
          <Stat n={128} label="Takipçi" />
          <Stat n={coins} label="🪙 Jeton" onPress={() => router.push('/cuzdan')} />
          <Stat n={diamonds} label="💎 Elmas" onPress={() => router.push('/yayinci')} />
        </View>

        <View style={styles.shortcuts}>
          {SHORTCUTS.map((s) => (
            <Pressable key={s.label} style={styles.shortcut} onPress={s.onPress}>
              <Text style={{ fontSize: 28 }}>{s.emoji}</Text>
              <Text style={styles.shortcutText}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={() => router.push('/vip')} style={{ marginHorizontal: 16 }}>
          <LinearGradient colors={tier?.color ?? ['#F59E0B', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.vip}>
            <Text style={{ fontSize: 28 }}>{tier?.emoji ?? '👑'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.vipTitle}>{tier ? `${tier.name} soyluluğun aktif` : 'Soylu ol'}</Text>
              <Text style={styles.vipSub}>{tier ? 'Seviyeni yükselt, daha fazla ayrıcalık kazan' : 'Rozet, çerçeve ve odaya giriş efekti'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </LinearGradient>
        </Pressable>

        {myRoom.profileVisible && (
          <Pressable onPress={() => router.push('/oda/yeni')} style={styles.hostCta} accessibilityLabel="Odam">
            <Text style={{ fontSize: 22 }}>🎙️</Text>
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
          <Pressable onPress={() => router.push('/yayinci')} style={[styles.hostCta]}>
            <Text style={{ fontSize: 22 }}>💎</Text>
            <Text style={{ color: '#fff', flex: 1, fontWeight: '600' }}>Yayıncı ol, hediyelerden para kazan</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </Pressable>
        )}

        <View style={styles.menu}>
          {MENU.filter((m) => (m.agencyOnly ? !!agencyId : m.noAgencyOnly ? !agencyId : true)).map((m) => (
            <Pressable key={m.label} style={styles.menuRow} onPress={m.onPress}>
              <LinearGradient colors={gradient} style={styles.menuIcon}>
                <Ionicons name={m.icon} size={18} color="#fff" />
              </LinearGradient>
              <Text style={styles.menuLabel}>{m.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.logout} onPress={logout}>
          <Ionicons name="log-out-outline" size={18} color={colors.red} />
          <Text style={{ color: colors.red, fontWeight: '600' }}>Çıkış yap</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ n, label, onPress }: { n: number; label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', flex: 1 }}>
      <Text style={styles.statN}>{n.toLocaleString('tr-TR')}</Text>
      <Text style={styles.statL}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'center', gap: 6, paddingVertical: 20 },
  name: { color: '#fff', fontSize: 22, fontWeight: '800' },
  level: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  levelText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  bio: { color: colors.textDim, fontSize: 14 },
  id: { color: colors.textDim, fontSize: 12 },
  stats: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: colors.card, borderRadius: 16, paddingVertical: 14, marginBottom: 16 },
  statN: { color: '#fff', fontSize: 18, fontWeight: '800' },
  statL: { color: colors.textDim, fontSize: 12 },
  shortcuts: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, gap: 10 },
  shortcut: { flex: 1, alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 16, paddingVertical: 14 },
  shortcutText: { color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  hostCta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12, backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(56,189,248,0.4)' },
  vip: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16 },
  vipTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  vipSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  menu: { margin: 16, backgroundColor: colors.card, borderRadius: 16, paddingVertical: 4 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  menuIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { color: '#fff', fontSize: 15, flex: 1 },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
});
