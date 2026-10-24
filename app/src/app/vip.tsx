import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CoinPill, FramedAvatar, GradientButton, Header } from '@/components/ui';
import { VIP_TIERS } from '@/data/economy';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

export default function VipScreen() {
  const { coins, vipLevel, buyVip, me } = useApp();
  const [selected, setSelected] = useState(Math.min(vipLevel + 1, VIP_TIERS.length));
  const tier = VIP_TIERS.find((t) => t.level === selected)!;
  const owned = vipLevel >= tier.level;

  const buy = () => {
    if (owned) return;
    if (buyVip(tier.level)) {
      showAlert(`${tier.emoji} ${tier.name} oldun!`, 'Rozetin, çerçeven ve giriş efektin aktif. Bir odaya girip dene!');
    } else {
      showAlert('Yetersiz jeton', `${tier.name} için ${tier.price.toLocaleString('tr-TR')} jeton gerekiyor.`, [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Soyluluk / VIP" right={<CoinPill coins={coins} onPress={() => router.push('/cuzdan')} />} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        <LinearGradient colors={tier.color} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <FramedAvatar uri={me.avatar} size={96} vipLevel={tier.level} />
          <Text style={styles.heroTitle}>
            {tier.emoji} {tier.name}
          </Text>
          <Text style={styles.heroSub}>{owned ? 'Sahipsin ✅' : `🪙 ${tier.price.toLocaleString('tr-TR')} / 30 gün`}</Text>
          {/* Preview of the room entry banner this tier unlocks. */}
          {tier.level >= 2 && (
            <View style={styles.entryPreview}>
              <Text style={styles.entryText}>
                {tier.emoji} {tier.name} {me.name} odaya katıldı!
              </Text>
            </View>
          )}
        </LinearGradient>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {VIP_TIERS.map((t) => (
            <Pressable key={t.level} onPress={() => setSelected(t.level)} style={[styles.tierChip, selected === t.level && { borderColor: t.color[1] }]}>
              <Text style={{ fontSize: 24 }}>{t.emoji}</Text>
              <Text style={styles.tierName}>{t.name}</Text>
              {vipLevel >= t.level && <Ionicons name="checkmark-circle" size={14} color={colors.green} />}
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.perks}>
          <Text style={styles.perksTitle}>Ayrıcalıklar</Text>
          {tier.perks.map((p) => (
            <View key={p} style={styles.perk}>
              <Ionicons name="sparkles" size={16} color={tier.color[1]} />
              <Text style={{ color: '#fff' }}>{p}</Text>
            </View>
          ))}
        </View>

        <GradientButton title={owned ? 'Zaten sahipsin' : `${tier.name} ol · 🪙 ${tier.price.toLocaleString('tr-TR')}`} icon="diamond" onPress={buy} style={{ opacity: owned ? 0.5 : 1 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 24, padding: 24, alignItems: 'center', gap: 8 },
  heroTitle: { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 6 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  entryPreview: { marginTop: 8, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  entryText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  tierChip: { alignItems: 'center', gap: 2, width: 78, paddingVertical: 10, borderRadius: 16, backgroundColor: colors.card, borderWidth: 2, borderColor: 'transparent' },
  tierName: { color: '#fff', fontWeight: '700', fontSize: 12 },
  perks: { backgroundColor: colors.card, borderRadius: 18, padding: 16, gap: 12 },
  perksTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
