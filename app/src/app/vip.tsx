import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CoinPill, FramedAvatar, GradientButton, Header } from '@/components/ui';
import { VIP_ENTRY_LEVEL, VIP_TIERS, charmLevel, vipPerks, wealthLevel } from '@/data/economy';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

export default function VipScreen() {
  const { coins, vipLevel, buyVip, me, spentTotal, totalDiamonds } = useApp();
  const [selected, setSelected] = useState(Math.min(vipLevel + 1, VIP_TIERS.length));
  const tier = VIP_TIERS.find((t) => t.level === selected)!;
  const owned = vipLevel >= tier.level;
  // Pay only the difference when upgrading from an owned tier.
  const ownedPrice = VIP_TIERS.find((t) => t.level === vipLevel)?.price ?? 0;
  const price = Math.max(0, tier.price - ownedPrice);

  const buy = () => {
    if (owned) return;
    if (buyVip(tier.level)) {
      showAlert(`${tier.emoji} VIP ${tier.level} · ${tier.name}`, 'Ayrıcalıkların aktif. Süre: 30 gün. Kalıcı seviye ile aylık avantajlar ayrı tutulur.');
    } else {
      showAlert('Yetersiz jeton', `VIP ${tier.level} için ${price.toLocaleString('tr-TR')} jeton gerekiyor.`, [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="VIP" right={<CoinPill coins={coins} onPress={() => router.push('/cuzdan')} />} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        <LinearGradient colors={tier.color} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <FramedAvatar uri={me.avatar} size={96} vipLevel={tier.level} />
          <Text style={styles.heroTitle}>
            VIP {tier.level} · {tier.emoji} {tier.name}
          </Text>
          <Text style={styles.heroSub}>{owned ? 'Sahipsin ✅' : `🪙 ${price.toLocaleString('tr-TR')} / 30 gün`}</Text>
          {tier.level >= VIP_ENTRY_LEVEL && (
            <View style={styles.entryPreview}>
              <Text style={styles.entryText}>
                {tier.emoji} VIP {tier.level} {me.name} odaya katıldı!
              </Text>
            </View>
          )}
        </LinearGradient>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {VIP_TIERS.map((t) => (
            <Pressable key={t.level} onPress={() => setSelected(t.level)} style={[styles.tierChip, selected === t.level && { borderColor: t.color[1] }]}>
              <Text style={{ fontSize: 22 }}>{t.emoji}</Text>
              <Text style={styles.tierLevel}>VIP {t.level}</Text>
              <Text style={styles.tierName}>{t.name}</Text>
              {vipLevel >= t.level && <Ionicons name="checkmark-circle" size={13} color={colors.green} />}
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>VIP {tier.level} ayrıcalıkları</Text>
          {vipPerks(tier.level).map((p, i) => (
            <View key={p} style={styles.perk}>
              <Ionicons name={i === tier.level - 1 ? 'sparkles' : 'checkmark'} size={16} color={i === tier.level - 1 ? tier.color[1] : colors.textDim} />
              <Text style={{ color: i === tier.level - 1 ? '#fff' : colors.textDim, fontWeight: i === tier.level - 1 ? '700' : '400' }}>{p}</Text>
            </View>
          ))}
          <Text style={styles.note}>VIP olmak oda moderasyonu veya ajans yönetimi yetkisi vermez.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Seviyelerin</Text>
          <Row label="VIP" value={vipLevel ? `VIP ${vipLevel}` : '—'} hint="Satın alınan VIP paketi" />
          <Row label="💰 Wealth (zenginlik)" value={`Lv.${wealthLevel(spentTotal)}`} hint={`${spentTotal.toLocaleString('tr-TR')} jeton harcandı`} />
          <Row label="✨ Charm (popülerlik)" value={`Lv.${charmLevel(totalDiamonds)}`} hint={`${totalDiamonds.toLocaleString('tr-TR')} elmas alındı`} />
          <Text style={styles.note}>VIP, Wealth ve Charm ayrı hesaplanır; oda seviyesi ise odaya aittir.</Text>
        </View>

        <GradientButton
          title={owned ? 'Zaten sahipsin' : `VIP ${tier.level} ol · 🪙 ${price.toLocaleString('tr-TR')}`}
          icon="diamond"
          onPress={buy}
          style={{ opacity: owned ? 0.5 : 1 }}
        />
        <Pressable onPress={() => router.push('/magaza')} style={{ alignItems: 'center' }}>
          <Text style={{ color: colors.pink, fontWeight: '700' }}>Kozmetik mağazasına git →</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff' }}>{label}</Text>
        <Text style={styles.note}>{hint}</Text>
      </View>
      <Text style={{ color: colors.gold, fontWeight: '800' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 24, padding: 24, alignItems: 'center', gap: 8 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 6 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  entryPreview: { marginTop: 8, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  entryText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  tierChip: { alignItems: 'center', gap: 1, width: 70, paddingVertical: 8, borderRadius: 14, backgroundColor: colors.card, borderWidth: 2, borderColor: 'transparent' },
  tierLevel: { color: colors.textDim, fontSize: 10, fontWeight: '700' },
  tierName: { color: '#fff', fontWeight: '700', fontSize: 11 },
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 16, gap: 10 },
  cardTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  note: { color: colors.textDim, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
