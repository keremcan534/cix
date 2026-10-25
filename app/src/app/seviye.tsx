import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header } from '@/components/ui';
import { charmLevel, wealthLevel } from '@/data/economy';
import { SVIP_LEVELS, nobleInfo } from '@/data/status';
import { useApp } from '@/store';
import { colors } from '@/theme';

// Mirrors levelFrom() in economy.ts: level n starts at base × (2^(n-1) − 1).
const start = (level: number, base: number) => base * (2 ** (level - 1) - 1);

export default function UserLevel() {
  const { spentTotal, totalDiamonds, svipLevel, svipXp, nobleTier, nobleDays, vipDays } = useApp();
  const noble = nobleInfo(nobleTier);
  const nextSvip = SVIP_LEVELS[svipLevel];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Kullanıcı Seviyesi" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <LevelCard title="💰 Servet seviyesi" level={wealthLevel(spentTotal)} value={spentTotal} base={100} unit="🪙 harcama" colors={['#F59E0B', '#B45309']} how="Odalarda ve aramalarda geçerli jeton harcaması. İade edilen hediyeler düşülür." />
        <LevelCard title="✨ Çekicilik seviyesi" level={charmLevel(totalDiamonds)} value={totalDiamonds} base={200} unit="💎 alınan" colors={['#EC4899', '#7C3AED']} how="Aldığın geçerli hediyelerden gelen elmaslar." />
        <Pressable onPress={() => router.push('/vip')} style={styles.card} accessibilityLabel="Ayrıcalıklarım">
          <Text style={styles.title}>Ayrıcalıklarım</Text>
          <Text style={styles.row}>
            SVIP: {svipLevel ? `SVIP${svipLevel}` : 'Yok'} · {svipXp.toLocaleString('tr-TR')} puan{nextSvip ? ` · SVIP${nextSvip.level} için ${(nextSvip.xp - svipXp).toLocaleString('tr-TR')}` : ''}
          </Text>
          <Text style={styles.row}>Asil: {noble ? `${noble.emoji} ${noble.name} · ${nobleDays} gün` : 'Henüz alınmadı'}</Text>
          <Text style={styles.row}>VIP: {vipDays > 0 ? `${vipDays} gün kaldı` : 'Yok'}</Text>
          <Text style={[styles.row, { color: colors.gold }]}>Ayrıcalık merkezine git ›</Text>
        </Pressable>
        <Text style={styles.dim}>Servet ve çekicilik seviyeleri kalıcıdır; VIP ve Asil süreli, SVIP ise yükleme deneyimiyle kalıcı olarak yükselir.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function LevelCard({ title, level, value, base, unit, colors: c, how }: { title: string; level: number; value: number; base: number; unit: string; colors: [string, string]; how: string }) {
  const from = start(level, base);
  const to = start(level + 1, base);
  const pctDone = Math.min(100, Math.max(0, ((value - from) / (to - from)) * 100));
  return (
    <LinearGradient colors={c} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.levelCard}>
      <Text style={{ color: '#fff', fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: '#fff', fontSize: 40, fontWeight: '900' }}>Lv.{level}</Text>
      <View style={styles.track}>
        <View style={{ height: 8, width: `${pctDone}%`, backgroundColor: '#fff' }} />
      </View>
      <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
        {value.toLocaleString('tr-TR')} / {to.toLocaleString('tr-TR')} {unit} · Lv.{level + 1} için {(to - value).toLocaleString('tr-TR')}
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{how}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  levelCard: { borderRadius: 20, padding: 18, gap: 8 },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 16, gap: 6 },
  title: { color: '#fff', fontWeight: '800', fontSize: 16 },
  row: { color: '#fff', fontSize: 14 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
});
