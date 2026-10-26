import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { Card } from '@/components/ui';
import { EXCHANGE_FEE } from '@/data/economy';
import { GIFTS, userById } from '@/data/mock';
import { RULES, pct, usd } from '@/data/rules';
import { showAlert } from '@/lib/alert';
import { blockedFor, useBank } from '@/lib/bank';
import { useApp, type Earning, type EarningSource } from '@/store';
import { colors } from '@/theme';

// Income labels for each store earning source.
export const INCOME_LABEL: Record<EarningSource, string> = {
  Hediye: 'Parti Hediyeleri Geliri',
  Arama: 'Arama Geliri',
  Görev: 'Görev Ödülü',
  'Ajans bonusu': 'Ajans bonusu',
  'Oda sahibi bonusu': 'Oda sahibi bonusu',
  'Aile bonusu': 'Aile bonusu',
  'Arama bonusu': 'Arama bonusu',
};

/** Right-hand detail line: gift name for gift income (gift price = diamonds earned), else the rule behind it. */
export const incomeDetail = (e: Earning) => {
  if (e.source === 'Hediye') {
    const g = GIFTS.find((x) => x.price === e.amount);
    return g ? `${g.emoji} ${g.name} x1` : 'Hediye x1';
  }
  if (e.source === 'Oda sahibi bonusu') return `Bonus ${pct(RULES.roomOwnerBonus)}`;
  if (e.source === 'Arama') return 'Görüntülü arama';
  return 'Platform ödülü';
};

const PREVIEW = 10;
const EXCHANGE_STEPS = [1_000, 5_000, 10_000, 50_000];
const fmt = (n: number) => n.toLocaleString('tr-TR');

export default function IncomeScreen() {
  const { diamonds, earnings, exchangeDiamonds } = useApp();
  // Diamonds blocked by open payout requests can't be converted (same balance can't be used twice).
  const convertible = Math.max(0, diamonds - blockedFor(useBank(), 'creator'));
  const [sheet, setSheet] = useState(false);

  const convert = (amount: number) => {
    const gained = exchangeDiamonds(amount);
    // Let the sheet's modal finish closing first (iOS drops alerts shown during a modal dismissal).
    setTimeout(() => showAlert('Dönüştürüldü ✅', `${fmt(amount)} 💎 → ${fmt(gained)} 🪙\nDönüşüm ücreti: ${fmt(amount - gained)} 💎 (%${EXCHANGE_FEE * 100})`), 350);
  };

  const options: SheetOption[] = [...EXCHANGE_STEPS.filter((s) => s < convertible), convertible]
    .filter((s) => s > 0)
    .map((s, i, all) => ({
      label: `${i === all.length - 1 ? 'Tümü · ' : ''}${fmt(s)} 💎 → ${fmt(Math.floor(s * (1 - EXCHANGE_FEE)))} 🪙`,
      onPress: () => convert(s),
    }));

  const openConvert = () => {
    if (convertible <= 0) return showAlert('Dönüştürülecek elmas yok', diamonds > 0 ? 'Elmasların bekleyen para çekme talebinde bloke. Talep sonuçlanınca dönüştürebilirsin.' : 'Hediye ve aramalardan elmas kazandıkça jetona dönüştürebilirsin.');
    setSheet(true);
  };

  const info = () =>
    showAlert(
      'Mevcut Elmaslar',
      `${fmt(RULES.diamondsPerUsd)} elmas = 1 USD. Bakiyen yaklaşık ${usd(diamonds)} değerindedir.\n\nPara çekmek için en az ${fmt(RULES.minWithdrawDiamonds)} elmas (${usd(RULES.minWithdrawDiamonds)}) gerekir. Elmasları jetona dönüştürürken %${EXCHANGE_FEE * 100} ücret kesilir.`,
    );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Geri">
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Gelir</Text>
        <Pressable onPress={() => router.push('/davet')} hitSlop={8} accessibilityLabel="Ödüllü davet">
          <Text style={{ fontSize: 26 }}>🎁</Text>
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: '/destek', params: { kategori: 'Kazanç' } })} hitSlop={8} style={styles.headIcon} accessibilityLabel="Müşteri hizmetleri">
          <Ionicons name="headset" size={20} color={colors.primaryText} />
        </Pressable>
      </View>

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
            <Pressable style={styles.outlineBtn} onPress={openConvert}>
              <Text style={styles.outlineText}>Dönüştür</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <Pressable style={styles.bankLink} onPress={() => router.push('/coins-bank')} accessibilityLabel="Coins Bank">
          <Text style={{ fontSize: 20 }}>🏦</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Coins Bank</Text>
            <Text style={styles.dim}>Cüzdan, kazançlar, ödemeler ve kurallar</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
        </Pressable>

        <View style={styles.sectionHead}>
          <Text style={{ fontSize: 22 }}>💎</Text>
          <Text style={styles.sectionTitle}>Elmas Detayları</Text>
          <Pressable onPress={() => router.push('/gelir/detay')} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.dim}>Daha fazla</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
          </Pressable>
        </View>

        {earnings.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 30 }}>
            <Text style={{ fontSize: 40 }}>💤</Text>
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

      <ActionSheet visible={sheet} title={`Elmas → jeton · %${EXCHANGE_FEE * 100} dönüşüm ücreti`} options={options} onClose={() => setSheet(false)} />
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800', flex: 1 },
  headIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
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
