import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, GradientButton, Header } from '@/components/ui';
import { AGENCIES } from '@/data/agency';
import { EXCHANGE_FEE, hostLevel, tl } from '@/data/economy';
import { userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Bugün'];

const PERKS = [
  { icon: '🎁', title: 'Hediyelerden kazan', text: 'Gelen her hediye elmasa dönüşür.' },
  { icon: '📹', title: 'Ücretli aramalar', text: 'Görüntülü aramalarda dakika başı kazan.' },
  { icon: '🏦', title: 'Haftalık ödeme', text: 'Elmaslarını banka hesabına çek.' },
];

export default function HostCenter() {
  const { isHost, becomeHost, me } = useApp();

  if (!isHost) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header title="Yayıncı Merkezi" />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          <LinearGradient colors={['#8B5CF6', '#EC4899']} style={styles.hero}>
            <Text style={{ fontSize: 48 }}>🎙️</Text>
            <Text style={styles.heroTitle}>Yayıncı ol, kazanmaya başla</Text>
            <Text style={styles.heroText}>Oda aç, sohbet et, hediyeler ve aramalardan elmas kazan.</Text>
          </LinearGradient>
          {PERKS.map((p) => (
            <Card key={p.title} style={styles.perk}>
              <Text style={{ fontSize: 28 }}>{p.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.perkTitle}>{p.title}</Text>
                <Text style={styles.dim}>{p.text}</Text>
              </View>
            </Card>
          ))}
          <Text style={[styles.dim, { textAlign: 'center' }]}>
            Şartlar: 18+, gerçek kişi doğrulaması {me.verified ? '✅' : '❌'}
          </Text>
          <GradientButton
            title="Yayıncı başvurusu yap"
            icon="mic"
            onPress={() => {
              if (!me.verified) {
                showAlert('Doğrulama gerekli', 'Yayıncı olmak için önce gerçek kişi doğrulaması yapmalısın. (Demo: yine de onaylandı)');
              }
              becomeHost();
            }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return <Dashboard />;
}

function Dashboard() {
  const { diamonds, totalDiamonds, weekly, earnings, exchangeDiamonds, agencyId, withdrawals } = useApp();
  const { current, next } = hostLevel(totalDiamonds);
  const progress = next ? (totalDiamonds - current.min) / (next.min - current.min) : 1;
  const max = Math.max(...weekly, 1);
  const weekTotal = weekly.reduce((a, b) => a + b, 0);
  const agency = AGENCIES.find((a) => a.id === agencyId);

  const exchange = () =>
    showAlert('Jetona çevir', `${diamonds.toLocaleString('tr-TR')} elmas → ${Math.floor(diamonds * (1 - EXCHANGE_FEE)).toLocaleString('tr-TR')} jeton (%${EXCHANGE_FEE * 100} kesinti)`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Çevir', onPress: () => exchangeDiamonds(diamonds) },
    ]);

  return (
    <SafeAreaView style={styles.safe}>
      <Header title="Yayıncı Merkezi" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <LinearGradient colors={['#0EA5E9', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balance}>
          <Text style={styles.balanceLabel}>Elmas bakiyesi</Text>
          <Text style={styles.balanceN}>💎 {diamonds.toLocaleString('tr-TR')}</Text>
          <Text style={styles.balanceLabel}>≈ {tl(diamonds)}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <Pressable style={styles.balanceBtn} onPress={() => router.push('/yayinci/cek')}>
              <Ionicons name="cash-outline" size={18} color="#fff" />
              <Text style={styles.balanceBtnText}>Para çek</Text>
            </Pressable>
            <Pressable style={styles.balanceBtn} onPress={exchange}>
              <Ionicons name="swap-horizontal" size={18} color="#fff" />
              <Text style={styles.balanceBtnText}>Jetona çevir</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <Card style={{ gap: 10 }}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>
              Yayıncı seviyesi: Lv.{current.level} {current.name}
            </Text>
            <Text style={styles.dim}>{totalDiamonds.toLocaleString('tr-TR')} 💎</Text>
          </View>
          <View style={styles.track}>
            <LinearGradient colors={['#8B5CF6', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.dim}>
            {next ? `Lv.${next.level} ${next.name} için ${(next.min - totalDiamonds).toLocaleString('tr-TR')} elmas kaldı` : 'En yüksek seviyedesin 🎉'}
          </Text>
        </Card>

        <Card style={{ gap: 12 }}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Bu hafta</Text>
            <Text style={{ color: '#7DD3FC', fontWeight: '700' }}>💎 {weekTotal.toLocaleString('tr-TR')}</Text>
          </View>
          <View style={styles.chart}>
            {weekly.map((v, i) => (
              <View key={i} style={styles.barCol}>
                <Text style={styles.barValue}>{v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}</Text>
                <View style={[styles.bar, { height: Math.max(4, (v / max) * 110) }, i === 6 && { backgroundColor: colors.pink }]} />
                <Text style={styles.barLabel}>{DAYS[i]}</Text>
              </View>
            ))}
          </View>
        </Card>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Stat label="Bugünkü kazanç" value={`💎 ${weekly[6].toLocaleString('tr-TR')}`} />
          <Stat label="Para çekme" value={`${withdrawals.length} talep`} />
        </View>

        <Pressable onPress={() => router.push('/ajans')}>
          <Card style={styles.perk}>
            <Text style={{ fontSize: 28 }}>{agency?.logo ?? '🏢'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.perkTitle}>{agency ? agency.name : 'Bir ajansa katıl'}</Text>
              <Text style={styles.dim}>{agency ? `Ajans komisyonu %${agency.commission * 100}` : 'Ajansa bağlı yayıncılar ekstra bonus kazanır'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </Card>
        </Pressable>

        <Card style={{ gap: 4 }}>
          <Text style={[styles.cardTitle, { marginBottom: 6 }]}>Son kazançlar</Text>
          {earnings.length === 0 ? (
            <Text style={styles.dim}>Henüz kazanç yok. Bir oda aç veya aramayı bekle — gelen hediyeler burada görünür.</Text>
          ) : (
            earnings.slice(0, 15).map((e) => (
              <View key={e.id} style={styles.earning}>
                <Text style={{ fontSize: 18 }}>{e.source === 'Hediye' ? '🎁' : e.source === 'Arama' ? '📹' : '⭐'}</Text>
                <Text style={{ color: '#fff', flex: 1 }}>
                  {e.source}
                  {e.fromId ? ` · ${userById(e.fromId).name}` : ''}
                </Text>
                <Text style={styles.dim}>{e.time}</Text>
                <Text style={{ color: '#7DD3FC', fontWeight: '700', width: 70, textAlign: 'right' }}>+{e.amount}</Text>
              </View>
            ))
          )}
        </Card>

        <GradientButton title="Yayın aç" icon="radio" onPress={() => router.push('/oda/yeni')} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, gap: 4 }}>
      <Text style={styles.dim}>{label}</Text>
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{value}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  hero: { borderRadius: 20, padding: 24, alignItems: 'center', gap: 8 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  heroText: { color: 'rgba(255,255,255,0.9)', textAlign: 'center' },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  perkTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  dim: { color: colors.textDim, fontSize: 13 },
  balance: { borderRadius: 20, padding: 20, gap: 2 },
  balanceLabel: { color: 'rgba(255,255,255,0.85)' },
  balanceN: { color: '#fff', fontSize: 34, fontWeight: '900' },
  balanceBtn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 999, paddingVertical: 10 },
  balanceBtnText: { color: '#fff', fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 150 },
  barCol: { alignItems: 'center', gap: 4, flex: 1 },
  bar: { width: 18, borderRadius: 6, backgroundColor: colors.primary },
  barValue: { color: colors.textDim, fontSize: 9 },
  barLabel: { color: colors.textDim, fontSize: 10 },
  earning: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
});
