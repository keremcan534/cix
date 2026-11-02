import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Art } from '@/components/Art';
import { ExchangeSheet } from '@/components/exchange-sheet';
import { Card, Header } from '@/components/ui';
import { userById } from '@/data/mock';
import { LUCKY_RECIPIENT_SHARE, RULES, pct, usd } from '@/data/rules';
import { showAlert } from '@/lib/alert';
import { diamondValueTl, selfExchangeRate } from '@/lib/coins-bank';
import { stampLabel } from '@/lib/tr';
import { useApp, type Earning, type EarningSource } from '@/store';
import { makeStyles, useTheme } from '@/theme';
import { Icon3D } from '@/components/Icon3D';

// Income labels for each store earning source.
export const INCOME_LABEL: Record<EarningSource, string> = {
  Hediye: 'Oda Hediyeleri Geliri',
  Arama: 'Arama Geliri',
  'Cazibe bonusu': 'Yankı Bonusu',
  Görev: 'Görev Ödülü',
  'Ajans bonusu': 'Ajans bonusu',
  'Oda sahibi bonusu': 'Oda sahibi bonusu',
  'Aile bonusu': 'Tayfa bonusu',
  'Arama bonusu': 'Arama bonusu',
};

/** Right-hand detail line: the stored gift for gift income, else the rule behind it. */
export const incomeDetail = (e: Earning) => {
  if (e.source === 'Hediye') {
    // Older rows have no gift stored; the price alone can't tell which gift it was.
    const g = e.gift;
    return g ? `${g.emoji} ${g.name} x${g.count}${g.lucky ? ` · Uğurlu (${pct(LUCKY_RECIPIENT_SHARE)})` : ''}` : '🎁 Hediye';
  }
  if (e.source === 'Oda sahibi bonusu') return `Bonus ${pct(RULES.roomOwnerBonus)}`;
  if (e.source === 'Arama') return 'Görüntülü arama';
  return 'Platform ödülü';
};

const PREVIEW = 10;
const fmt = (n: number) => n.toLocaleString('tr-TR');

export default function IncomeScreen() {
  const { diamonds, earnings } = useApp();
  const { colors, semantic, ink } = useTheme();
  const styles = useStyles();
  const [exchange, setExchange] = useState(false);
  // Three ways out: Çevir (own diamonds → coins at the in-app price), Anında bozdur (Jeton Noktası pays the
  // cash value now) and Para Çek (weekly payout).
  const instant = () =>
    showAlert(
      'Anında bozdur',
      `Jeton Noktası elmasını resmi değerinden hemen öder: ${fmt(diamonds)} 💎 ≈ ${fmt(Math.floor(diamondValueTl(diamonds)))} TL. Senden ücret kesilmez. Haftalık ödemeyi beklemek istersen Para Çek'i kullan.`,
      [
        { text: 'Kapat', style: 'cancel' },
        { text: "Jeton Noktası'na git", onPress: () => router.push('/coins-bank') },
      ],
    );

  const info = () =>
    showAlert(
      'Mevcut Elmaslar',
      `${fmt(RULES.diamondsPerUsd)} elmas = 1 USD. Bakiyen yaklaşık ${usd(diamonds)} değerindedir.\n\nPara çekmek için en az ${fmt(RULES.minWithdrawDiamonds)} elmas (${usd(RULES.minWithdrawDiamonds)}) gerekir. Haftalık ödemeyi beklemeden Jeton Noktası üzerinden anında bozdurabilir ya da Çevir ile uygulamadaki jeton fiyatından hemen jetona çevirebilirsin.`,
    );

  return (
    <SafeAreaView style={styles.safe}>
      <Header
        title="Gelir"
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => router.push('/davet')} hitSlop={8} style={styles.headIcon} accessibilityLabel="Arkadaşını Getir">
              <Ionicons name="gift" size={18} color={colors.gold} />
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/destek', params: { kategori: 'Kazanç' } })} hitSlop={8} style={styles.headIcon} accessibilityLabel="Müşteri hizmetleri">
              <Ionicons name="headset" size={18} color={colors.primaryText} />
            </Pressable>
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <LinearGradient colors={[colors.cardAlt, colors.card]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balance}>
          <Pressable onPress={info} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.balanceLabel}>Mevcut Elmaslar {usd(diamonds)}</Text>
            <Ionicons name="help-circle-outline" size={18} color={ink(0.9)} />
          </Pressable>
          <Text style={styles.balanceN}>{fmt(diamonds)}</Text>
          <Pressable style={({ pressed }) => [styles.exchangeBtn, pressed && { transform: [{ scale: 0.98 }] }]} onPress={() => setExchange(true)} accessibilityRole="button" accessibilityLabel="Elmasları jetona çevir">
            <Ionicons name="swap-horizontal" size={20} color={semantic.moneyInk} />
            <View style={{ flex: 1 }}>
              <Text style={styles.exchangeTitle}>Çevir</Text>
              <Text style={styles.exchangeSub} numberOfLines={1}>10.000 💎 = {fmt(Math.floor(10_000 * selfExchangeRate()))} jeton · ücret yok</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={semantic.moneyInk} />
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
            <Pressable style={styles.outlineBtn} onPress={() => router.push('/yayinci/cek')}>
              <Text style={styles.outlineText}>Para Çek</Text>
            </Pressable>
            <Pressable style={styles.outlineBtn} onPress={instant}>
              <Text style={styles.outlineText}>Anında bozdur</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <Pressable style={styles.bankLink} onPress={() => router.push('/coins-bank')} accessibilityLabel="Jeton Noktası">
          <Art name="finans-haftalik-odeme-banka" size={26} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Jeton Noktası</Text>
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
      <ExchangeSheet visible={exchange} onClose={() => setExchange(false)} />
    </SafeAreaView>
  );
}

export function EarningRow({ e }: { e: Earning }) {
  const styles = useStyles();
  return (
    <Card style={styles.row}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.rowTitle}>{INCOME_LABEL[e.source]}</Text>
        {e.fromId ? <Text style={styles.sender}>{userById(e.fromId).name}</Text> : <Text style={styles.sender}>Similar Club</Text>}
        <Text style={styles.dim}>{stampLabel(e.day, e.time)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={styles.amount}>+{fmt(e.amount)} 💎</Text>
        <Text style={styles.dim}>{incomeDetail(e)}</Text>
      </View>
    </Card>
  );
}

const useStyles = makeStyles(({ colors, semantic, ink, dark }) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  headIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  balance: { borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.border, ...(dark ? null : { boxShadow: '0 1px 2px rgba(16,36,64,0.05), 0 6px 16px rgba(16,36,64,0.06)' }) },
  balanceLabel: { color: ink(0.92), fontSize: 15 },
  balanceN: { color: colors.text, fontSize: 40, fontWeight: '900', marginTop: 4 },
  outlineBtn: { flex: 1, borderWidth: 1.5, borderColor: dark ? 'rgba(255,255,255,0.85)' : ink(0.22), borderRadius: 999, paddingVertical: 11, alignItems: 'center', backgroundColor: dark ? 'rgba(255,255,255,0.12)' : colors.card },
  outlineText: { color: colors.text, fontWeight: '800', fontSize: 15 },
  exchangeBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, backgroundColor: semantic.money, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 3, borderBottomColor: semantic.moneyEdge },
  exchangeTitle: { color: semantic.moneyInk, fontWeight: '900', fontSize: 16 },
  exchangeSub: { color: semantic.moneyInk, fontSize: 12, opacity: 0.8, marginTop: 1 },
  bankLink: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.border },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700', flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  sender: { color: dark ? '#5EEAF0' : semantic.actionText, fontWeight: '700' },
  // Diamond amount: white in the dark scheme (as before), the diamond's blue on the light one.
  amount: { color: dark ? colors.text : semantic.diamondText, fontWeight: '800', fontSize: 15 },
  dim: { color: colors.textDim, fontSize: 13 },
}));
