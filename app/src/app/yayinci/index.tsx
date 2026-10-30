import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Art, type ArtName } from '@/components/Art';
import { Card, GradientButton, Header } from '@/components/ui';
import { AGENCIES } from '@/data/agency';
import { hostLevel } from '@/data/economy';
import { diamondValueTl } from '@/lib/coins-bank';
import { userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { RULES, pct, settlement, usd } from '@/data/rules';
import { useApp } from '@/store';
import { colors, gradient, gradientDeep } from '@/theme';
import { Icon3D } from '@/components/Icon3D';

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Bugün'];

const PERKS: { icon: string; art?: ArtName; title: string; text: string }[] = [
  { icon: '🎁', art: 'finans-hediyelerden-kazan', title: 'Hediyelerden kazan', text: 'Gelen her hediye elmasa dönüşür.' },
  { icon: '📹', art: 'finans-ucretli-aramalar', title: 'Ücretli aramalar', text: 'Görüntülü aramalarda dakika başı kazan.' },
  { icon: '🏦', art: 'finans-haftalik-odeme-banka', title: 'Haftalık ödeme', text: 'Elmaslarını banka hesabına çek.' },
];

/** The picture for an earning row by its source; other sources keep the emoji. */
const EARNING_ART: Partial<Record<string, ArtName>> = { Hediye: 'finans-hediyelerden-kazan', Arama: 'finans-ucretli-aramalar' };

export default function HostCenter() {
  const { isHost, becomeHost, me } = useApp();

  if (!isHost) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header title="Yayıncı Merkezi" />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          <LinearGradient colors={gradientDeep} style={styles.hero}>
            <Icon3D name="mic" size={64} />
            <Text style={styles.heroTitle}>Yayıncı ol, kazanmaya başla</Text>
            <Text style={styles.heroText}>Oda aç, sohbet et, hediyeler ve aramalardan elmas kazan.</Text>
          </LinearGradient>
          {PERKS.map((p) => (
            <Card key={p.title} style={styles.perk}>
              {p.art ? <Art name={p.art} size={36} /> : <Text style={{ fontSize: 28 }}>{p.icon}</Text>}
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
  const { diamonds, totalDiamonds, weekly, earnings, agencyId, withdrawals } = useApp();
  const { current, next } = hostLevel(totalDiamonds);
  const progress = next ? (totalDiamonds - current.min) / (next.min - current.min) : 1;
  const max = Math.max(...weekly, 1);
  const weekTotal = weekly.reduce((a, b) => a + b, 0);
  const agency = AGENCIES.find((a) => a.id === agencyId);

  const exchange = () =>
    // Diamonds turn into coins only in the main Coins Bank account (lib/coins-bank); hosts cash out instead.
    showAlert('Anında bozdur', `Coins Bank elmasını resmi değerinden hemen öder: ${diamonds.toLocaleString('tr-TR')} elmas ≈ ${Math.floor(diamondValueTl(diamonds)).toLocaleString('tr-TR')} TL. Senden ücret kesilmez.`, [
      { text: 'Kapat', style: 'cancel' },
      { text: "Coins Bank'a git", onPress: () => router.push('/coins-bank') },
    ]);

  return (
    <SafeAreaView style={styles.safe}>
      <Header title="Yayıncı Merkezi" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <LinearGradient colors={['#0EA5E9', '#0A8F95']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balance}>
          <Text style={styles.balanceLabel}>Elmas bakiyesi</Text>
          <Text style={styles.balanceN}>💎 {diamonds.toLocaleString('tr-TR')}</Text>
          <Text style={styles.balanceLabel}>≈ {usd(diamonds)}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <Pressable style={styles.balanceBtn} onPress={() => router.push('/yayinci/cek')}>
              <Ionicons name="cash-outline" size={18} color="#fff" />
              <Text style={styles.balanceBtnText}>Para çek</Text>
            </Pressable>
            <Pressable style={styles.balanceBtn} onPress={exchange}>
              <Ionicons name="flash-outline" size={18} color="#fff" />
              <Text style={styles.balanceBtnText}>Anında bozdur</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <View style={[styles.affil, { borderColor: agency ? colors.green : colors.gold }]}>
          {agency ? (
            <Text style={{ color: '#fff', fontWeight: '800' }}>{`🏢 Ajans: ${agency.name}`}</Text>
          ) : (
            <View style={styles.titleRow}>
              <Art name="finans-ajanssiz-yayinci" size={20} />
              <Text style={{ color: '#fff', fontWeight: '800' }}>Ajanssız yayıncı</Text>
            </View>
          )}
          <Text style={{ color: colors.textDim, fontSize: 12, lineHeight: 17 }}>
            {agency
              ? `${RULES.agencyHostInactiveDays} gün çevrimiçi olmaz ve çekim yapmazsan ajanstan düşer, yönetim hesabına aktarılırsın. Kazancın etkilenmez.`
              : `Kayıttan itibaren ${RULES.hostAgencyJoinDays} gün içinde bir ajansa katılmazsan yönetim hesabına (platform) bağlanırsın: kazancını almaya ve para çekmeye sorunsuz devam edersin, sadece senin üzerinden ajans komisyonu oluşmaz. Kalan süre: ${Math.max(0, RULES.hostAgencyJoinDays - 1)} gün.`}
          </Text>
          {!agency && (
            <Pressable onPress={() => router.push('/ajans')}>
              <Text style={{ color: colors.gold, fontWeight: '800' }}>Ajansa katıl →</Text>
            </Pressable>
          )}
        </View>

        <Card style={{ gap: 10 }}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>
              Yayıncı seviyesi: Lv.{current.level} {current.name}
            </Text>
            <Text style={styles.dim}>{totalDiamonds.toLocaleString('tr-TR')} 💎</Text>
          </View>
          <View style={styles.track}>
            <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: `${progress * 100}%` }]} />
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
                <View style={[styles.bar, { height: Math.max(4, (v / max) * 110) }, i === 6 && { backgroundColor: colors.primaryText }]} />
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
              <Text style={styles.dim}>{agency ? `Ajansa ${pct(RULES.agencyCommission)} komisyon ayrıca ödenir — senden kesilmez` : 'Ajansa bağlı yayıncılar ekstra bonus kazanır'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </Card>
        </Pressable>

        <Analytics />

        <Card style={{ gap: 4 }}>
          <Text style={[styles.cardTitle, { marginBottom: 6 }]}>Son kazançlar</Text>
          {earnings.length === 0 ? (
            <Text style={styles.dim}>Henüz kazanç yok. Bir oda aç veya aramayı bekle — gelen hediyeler burada görünür.</Text>
          ) : (
            earnings.slice(0, 15).map((e) => (
              <View key={e.id} style={styles.earning}>
                {EARNING_ART[e.source] ? <Art name={EARNING_ART[e.source]!} size={23} /> : <Text style={{ fontSize: 18 }}>⭐</Text>}
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

function Analytics() {
  const { earnings, agencyId, weekly } = useApp();
  const sum = (src: string) => earnings.filter((e) => e.source === src).reduce((x, e) => x + e.amount, 0);
  const gifts = sum('Hediye') + weekly.slice(0, 6).reduce((a, b) => a + b, 0);
  const ownerBonus = sum('Oda sahibi bonusu');
  const familyBonus = sum('Aile bonusu');
  const callBonus = sum('Arama bonusu') + sum('Arama');
  const net = gifts + ownerBonus + familyBonus + callBonus;
  const { commission } = settlement(gifts, !!agencyId);
  const seed = Math.max(1, Math.round(gifts / 500));
  const metrics = [
    ['Toplam yayın süresi', `${12 + (seed % 30)} sa`],
    ['Tekil katılımcı', String(140 + seed * 3)],
    ['Yeni takipçi', String(18 + (seed % 40))],
    ['Tekrar gelen', `%${35 + (seed % 30)}`],
    ['Ort. katılım süresi', `${6 + (seed % 9)} dk`],
    ['Etkinlik katılımı', String(22 + (seed % 15))],
  ];
  return (
    <Card style={{ gap: 8 }}>
      <View style={styles.titleRow}>
        <Art name="finans-yayinci-analizi" size={20} />
        <Text style={styles.cardTitle}>Yayıncı analizi (bu hafta)</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {metrics.map(([l, v]) => (
          <View key={l} style={styles.metric}>
            <Text style={styles.dim}>{l}</Text>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{v}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.cardTitle, { fontSize: 14, marginTop: 4 }]}>Kazanç dökümü</Text>
      <Line label="Brüt hediye değeri" value={`💎 ${gifts.toLocaleString('tr-TR')}`} />
      <Line label={`Oda sahibi bonusu (${pct(RULES.roomOwnerBonus)})`} value={`+ ${ownerBonus.toLocaleString('tr-TR')}`} />
      <Line label="Aile bonusu" value={`+ ${familyBonus.toLocaleString('tr-TR')}`} />
      <Line label="Arama kazancı / bonusu" value={`+ ${callBonus.toLocaleString('tr-TR')}`} />
      <Line label="Net hak edişin" value={`💎 ${net.toLocaleString('tr-TR')} · ${usd(net)}`} bold />
      {agencyId && <Line label={`Ajans komisyonu (${pct(RULES.agencyCommission)}, ayrıca ödenir)`} value={`${commission.toLocaleString('tr-TR')} · ${usd(commission)}`} dim />}
      <Text style={styles.dim}>
        {RULES.diamondsPerUsd.toLocaleString('tr-TR')} elmas = 1 USD. Komisyon ve bonuslar senin kazancından kesilmez; iade edilen işlemler dökümden çıkarılır.
      </Text>
    </Card>
  );
}

function Line({ label, value, bold, dim }: { label: string; value: string; bold?: boolean; dim?: boolean }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={[styles.dim, bold && { color: '#fff', fontWeight: '800' }]}>{label}</Text>
      <Text style={{ color: dim ? colors.textDim : bold ? colors.green : '#fff', fontWeight: bold ? '800' : '600' }}>{value}</Text>
    </View>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 150 },
  barCol: { alignItems: 'center', gap: 4, flex: 1 },
  bar: { width: 18, borderRadius: 6, backgroundColor: colors.primary },
  barValue: { color: colors.textDim, fontSize: 9 },
  barLabel: { color: colors.textDim, fontSize: 11 },
  metric: { flexBasis: '30%', flexGrow: 1, backgroundColor: colors.cardAlt, borderRadius: 12, padding: 8, gap: 2 },
  earning: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  affil: { backgroundColor: colors.card, borderRadius: 16, padding: 14, gap: 6, borderWidth: 1 },
});
