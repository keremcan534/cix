import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Art } from '@/components/Art';
import { Card, Header } from '@/components/ui';
import { userById } from '@/data/mock';
import { LUCKY_RECIPIENT_SHARE, RULES, pct, usd } from '@/data/rules';
import { showAlert } from '@/lib/alert';
import { diamondValueTl } from '@/lib/coins-bank';
import { useApp, type Earning, type EarningSource } from '@/store';
import { colors } from '@/theme';
import { Icon3D } from '@/components/Icon3D';

// Income labels for each store earning source.
export const INCOME_LABEL: Record<EarningSource, string> = {
  Hediye: 'Parti Hediyeleri Geliri',
  Arama: 'Arama Geliri',
  'Cazibe bonusu': 'Cazibe Seviyesi Bonusu',
  Görev: 'Görev Ödülü',
  'Ajans bonusu': 'Ajans bonusu',
  'Oda sahibi bonusu': 'Oda sahibi bonusu',
  'Aile bonusu': 'Aile bonusu',
  'Arama bonusu': 'Arama bonusu',
};

/** Right-hand detail line: the stored gift for gift income, else the rule behind it. */
export const incomeDetail = (e: Earning) => {
  if (e.source === 'Hediye') {
    // Older rows have no gift stored; the price alone can't tell which gift it was.
    const g = e.gift;
    return g ? `${g.emoji} ${g.name} x${g.count}${g.lucky ? ` · Lucky (${pct(LUCKY_RECIPIENT_SHARE)})` : ''}` : '🎁 Hediye';
  }
  if (e.source === 'Oda sahibi bonusu') return `Bonus ${pct(RULES.roomOwnerBonus)}`;
  if (e.source === 'Arama') return 'Görüntülü arama';
  return 'Platform ödülü';
};

const PREVIEW = 10;
const fmt = (n: number) => n.toLocaleString('tr-TR');

export default function IncomeScreen() {
  const { diamonds, earnings } = useApp();
  // Diamonds turn into coins only in the main Coins Bank account (lib/coins-bank); hosts cash out instead.
  const instant = () =>
    showAlert(
      'Anında bozdur',
      `Coins Bank elmasını resmi değerinden hemen öder: ${fmt(diamonds)} 💎 ≈ ${fmt(Math.floor(diamondValueTl(diamonds)))} TL. Senden ücret kesilmez. Haftalık ödemeyi beklemek istersen Para Çek'i kullan.`,
      [
        { text: 'Kapat', style: 'cancel' },
        { text: "Coins Bank'a git", onPress: () => router.push('/coins-bank') },
      ],
    );

  const info = () =>
    showAlert(
      'Mevcut Elmaslar',
      `${fmt(RULES.diamondsPerUsd)} elmas = 1 USD. Bakiyen yaklaşık ${usd(diamonds)} değerindedir.\n\nPara çekmek için en az ${fmt(RULES.minWithdrawDiamonds)} elmas (${usd(RULES.minWithdrawDiamonds)}) gerekir. Haftalık ödemeyi beklemeden Coins Bank üzerinden anında bozdurabilirsin; elmas jetona yalnızca Coins Bank hesabında çevrilir.`,
    );

  return (
    <SafeAreaView style={styles.safe}>
      <Header
        title="Gelir"
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => router.push('/davet')} hitSlop={8} style={styles.headIcon} accessibilityLabel="Ödüllü davet">
              <Ionicons name="gift" size={18} color={colors.gold} />
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/destek', params: { kategori: 'Kazanç' } })} hitSlop={8} style={styles.headIcon} accessibilityLabel="Müşteri hizmetleri">
              <Ionicons name="headset" size={18} color={colors.primaryText} />
            </Pressable>
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <LinearGradient colors={['#1F3050', '#16253C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balance}>
          <Pressable onPress={info} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.balanceLabel}>Mevcut Elmaslar {usd(diamonds)}</Text>
            <Ionicons name="help-circle-outline" size={18} color="rgba(255,255,255,0.9)" />
          </Pressable>
          <Text style={styles.balanceN}>{fmt(diamonds)}</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
            <Pressable style={styles.outlineBtn} onPress={() => router.push('/yayinci/cek')}>
              <Text style={styles.outlineText}>Para Çek</Text>
            </Pressable>
            <Pressable style={styles.outlineBtn} onPress={instant}>
              <Text style={styles.outlineText}>Anında bozdur</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <Pressable style={styles.bankLink} onPress={() => router.push('/coins-bank')} accessibilityLabel="Coins Bank">
          <Art name="finans-haftalik-odeme-banka" size={26} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Coins Bank</Text>
            <Text style={styles.dim}>Cüzdan, kazançlar, ödemeler ve kurallar</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
        </Pressable>

        <View style={styles.sectionHead}>
          <Icon3D name="diamond" size={22} />
          <Text style={styles.sectionTitle}>Elmas Detayları</Text>
          <Pressable onPress={() => router.push('/gelir/detay')} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.dim}>Daha fazla</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
          </Pressable>
        </View>

        {earnings.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 30 }}>
            <Art name="maskot-uyuyan-bakiye" size={52} />
            <Text style={styles.dim}>Veri yok</Text>
            <Text style={[styles.dim, { textAlign: 'center' }]}>Odanda hediye aldığında veya arama yaptığında elmas gelirin burada listelenir.</Text>
          </Card>
        ) : (
          earnings.slice(0, PREVIEW).map((e) => <EarningRow key={e.id} e={e} />)
        )}
        {earnings.length > PREVIEW && (
          <Pressable onPress={() => router.push('/gelir/detay')} style={{ alignItems: 'center', paddingVertical: 6 }}>
            <Text style={{ color: colors.primaryText, fontWeight: '700' }}>Tümünü gör ({earnings.length})</Text>
          </Pressable>
        )}
      </ScrollView>

    </SafeAreaView>
  );
}

export function EarningRow({ e }: { e: Earning }) {
  return (
    <Card style={styles.row}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.rowTitle}>{INCOME_LABEL[e.source]}</Text>
        {e.fromId ? <Text style={styles.sender}>{userById(e.fromId).name}</Text> : <Text style={styles.sender}>Similar Club</Text>}
        <Text style={styles.dim}>Bugün {e.time}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={styles.amount}>+{fmt(e.amount)} 💎</Text>
        <Text style={styles.dim}>{incomeDetail(e)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  headIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  balance: { borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.border },
  balanceLabel: { color: 'rgba(255,255,255,0.92)', fontSize: 15 },
  balanceN: { color: '#fff', fontSize: 40, fontWeight: '900', marginTop: 4 },
  outlineBtn: { flex: 1, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)', borderRadius: 999, paddingVertical: 11, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  outlineText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  bankLink: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.border },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sender: { color: '#5EEAF0', fontWeight: '700' },
  amount: { color: '#fff', fontWeight: '800', fontSize: 15 },
  dim: { color: colors.textDim, fontSize: 13 },
});
