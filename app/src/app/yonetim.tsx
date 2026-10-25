import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Header } from '@/components/ui';
import { DEFAULT_RULES, pct, settlement, usd, type Rules } from '@/data/rules';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

type NumKey = { [K in keyof Rules]: Rules[K] extends number ? K : never }[keyof Rules];
type Field = { k: Exclude<NumKey, 'version'>; label: string; step: number; min: number; max: number; percent?: boolean };
const FIELDS: Field[] = [
  { k: 'diamondsPerUsd', label: '1 USD = kaç elmas', step: 500, min: 500, max: 50_000 },
  { k: 'agencyCommission', label: 'Ajans komisyonu (ayrıca ödenir)', step: 0.01, min: 0, max: 1, percent: true },
  { k: 'roomOwnerBonus', label: 'Oda sahibi bonusu', step: 0.01, min: 0, max: 1, percent: true },
  { k: 'oneOnOneBonus', label: 'Birebir sohbet bonusu', step: 0.01, min: 0, max: 0.5, percent: true },
  { k: 'voiceCallBonus', label: 'Sesli arama bonusu', step: 0.01, min: 0, max: 0.5, percent: true },
  { k: 'videoCallBonus', label: 'Görüntülü arama bonusu', step: 0.01, min: 0, max: 0.5, percent: true },
  { k: 'roomEventBonus', label: 'Oda etkinliği bonusu', step: 0.01, min: 0, max: 0.5, percent: true },
  { k: 'bonusCapPerWeek', label: 'Haftalık bonus üst sınırı (💎)', step: 50_000, min: 0, max: 5_000_000 },
  { k: 'minWithdrawDiamonds', label: 'Minimum çekim (💎)', step: 10_000, min: 5_000, max: 500_000 },
  { k: 'inviteUnitsPerPurchase', label: 'Davet ödülü (birim / başarılı alım)', step: 1, min: 0, max: 10 },
  { k: 'inviteIncomeShare', label: 'Davet: arkadaş gelirinden pay', step: 0.01, min: 0, max: 0.3, percent: true },
  { k: 'inviteRechargeShare', label: 'Davet: arkadaş yüklemesinden pay', step: 0.01, min: 0, max: 0.3, percent: true },
];
const round = (v: number) => Math.round(v * 10_000) / 10_000;
const fmt = (f: Field, v: number) => (f.percent ? pct(v) : v.toLocaleString('tr-TR'));

export default function AdminScreen() {
  const { rules, setRule, ruleHistory } = useApp();
  const [amount, setAmount] = useState('100000');
  const diamonds = Math.max(0, Number(amount.replace(/\D/g, '')) || 0);
  const s = settlement(diamonds, true);
  const ownerBonus = Math.round(10_000 * rules.roomOwnerBonus);

  const change = (f: Field, dir: 1 | -1) => {
    const v = round(Math.min(f.max, Math.max(f.min, rules[f.k] + dir * f.step)));
    if (v !== rules[f.k]) setRule(f.k, v);
  };
  const changeFamily = (i: number, dir: 1 | -1) => {
    const next = [...rules.familyRates];
    next[i] = round(Math.min(0.2, Math.max(0, next[i] + dir * 0.0025)));
    setRule('familyRates', next);
  };
  const reset = () =>
    showAlert('Varsayılanlara dön', 'Tüm kurallar şartname varsayılanlarına döndürülsün mü?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sıfırla',
        style: 'destructive',
        onPress: () => {
          FIELDS.forEach((f) => rules[f.k] !== DEFAULT_RULES[f.k] && setRule(f.k, DEFAULT_RULES[f.k]));
          if (rules.familyRates.some((r, i) => r !== DEFAULT_RULES.familyRates[i])) setRule('familyRates', [...DEFAULT_RULES.familyRates]);
        },
      },
    ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Kazanç & bonus yönetimi" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.warn}>
          <Ionicons name="flask" size={16} color={colors.gold} />
          <Text style={{ color: '#fff', fontSize: 12, flex: 1 }}>
            Demo yönetim paneli · Kural sürümü v{rules.version}. Değişiklikler yalnızca bu oturumdaki prototipi etkiler, gerçek sisteme kaydedilmez. Canlıda her değişiklik yetkili onayı, yürürlük tarihi ve denetim kaydı gerektirir; geçmiş kayıtlar eski kuralla kalır.
          </Text>
        </View>

        <Text style={styles.section}>Örnek hesaplayıcı</Text>
        <Card style={{ gap: 8 }}>
          <Text style={styles.dim}>Yayıncının haftalık geçerli kazancı (💎)</Text>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="number-pad" style={styles.input} accessibilityLabel="Elmas miktarı" />
          <Line label="Yayıncı" value={`💎 ${s.streamer.toLocaleString('tr-TR')} = ${usd(s.streamer)}`} />
          <Line label={`Ajans komisyonu (${pct(rules.agencyCommission)}, yayıncıdan kesilmez)`} value={`💎 ${s.commission.toLocaleString('tr-TR')} = ${usd(s.commission)}`} />
          <Line label="Platformun toplam ödemesi" value={`💎 ${s.platformTotal.toLocaleString('tr-TR')} = ${usd(s.platformTotal)}`} strong />
          <Line label={`10.000 💎 hediye → oda sahibi bonusu (${pct(rules.roomOwnerBonus)})`} value={`💎 ${ownerBonus.toLocaleString('tr-TR')}`} />
          <Line label={`Aile LV10 · 100.000 💎 × ${pct(rules.familyRates[9])}`} value={`💎 ${Math.round(100_000 * rules.familyRates[9]).toLocaleString('tr-TR')}`} />
        </Card>

        <Text style={styles.section}>Kurallar</Text>
        <Card style={{ gap: 10 }}>
          {FIELDS.map((f) => (
            <View key={f.k} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 13 }}>{f.label}</Text>
                {rules[f.k] !== DEFAULT_RULES[f.k] && <Text style={styles.dim}>varsayılan: {fmt(f, DEFAULT_RULES[f.k])}</Text>}
              </View>
              <Stepper label={f.label} value={fmt(f, rules[f.k])} onMinus={() => change(f, -1)} onPlus={() => change(f, 1)} />
            </View>
          ))}
          <Text style={styles.dim}>Hesaplama dönemi: {rules.period} · Bonuslar yalnızca doğrulanmış, iade edilmemiş işlemlerden hesaplanır.</Text>
        </Card>

        <Text style={styles.section}>Aile bonus oranları (LV1–15)</Text>
        <Card style={{ gap: 6 }}>
          {rules.familyRates.map((r, i) => (
            <View key={`lv${i + 1}`} style={styles.row}>
              <Text style={{ color: '#fff', flex: 1 }}>LV{i + 1}</Text>
              <Stepper label={`Aile LV${i + 1}`} value={pct(r)} onMinus={() => changeFamily(i, -1)} onPlus={() => changeFamily(i, 1)} />
            </View>
          ))}
        </Card>

        <Text style={styles.section}>Değişiklik geçmişi</Text>
        <Card style={{ gap: 6 }}>
          {ruleHistory.length === 0 ? (
            <Text style={styles.dim}>Henüz değişiklik yok.</Text>
          ) : (
            ruleHistory.slice(0, 30).map((h) => (
              <Text key={h.id} style={styles.dim}>
                v{h.version} · {h.time} · {h.field}: {h.from.length > 40 ? 'liste' : h.from} → {h.to.length > 40 ? 'liste' : h.to}
              </Text>
            ))
          )}
        </Card>
        <Pressable onPress={() => router.push('/yetki')} style={styles.warn} accessibilityLabel="Rol ve Yetki Merkezi">
          <Ionicons name="key" size={16} color={colors.gold} />
          <Text style={{ color: '#fff', fontWeight: '700', flex: 1 }}>Rol ve Yetki Merkezi → roller, kapsamlar, atamalar, BD/ajans komisyon kuralları</Text>
        </Pressable>
        <Pressable onPress={reset} style={{ alignItems: 'center', padding: 8 }}>
          <Text style={{ color: colors.red, fontWeight: '700' }}>Varsayılanlara dön</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={onMinus} hitSlop={6} accessibilityLabel={`${label} azalt`}>
        <Ionicons name="remove-circle" size={24} color={colors.textDim} />
      </Pressable>
      <Text style={styles.value}>{value}</Text>
      <Pressable onPress={onPlus} hitSlop={6} accessibilityLabel={`${label} artır`}>
        <Ionicons name="add-circle" size={24} color={colors.primary} />
      </Pressable>
    </View>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.dim, { flex: 1 }]}>{label}</Text>
      <Text style={{ color: strong ? colors.gold : '#fff', fontWeight: strong ? '800' : '600' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { color: colors.textDim, fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  warn: { flexDirection: 'row', gap: 8, backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: 12, padding: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  input: { backgroundColor: colors.cardAlt, borderRadius: 12, color: '#fff', fontSize: 16, paddingHorizontal: 14, paddingVertical: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { color: '#fff', fontWeight: '800', minWidth: 64, textAlign: 'center' },
});
