import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, GradientButton, Header } from '@/components/ui';
import { RULES, usd } from '@/data/rules';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

// "TR12 0006 ..." grouping for readability.
const formatIban = (raw: string) => {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 26);
  return clean.replace(/(.{4})/g, '$1 ').trim();
};

export default function Withdraw() {
  const { diamonds, requestWithdraw, withdrawals } = useApp();
  const [amount, setAmount] = useState(String(Math.max(RULES.minWithdrawDiamonds, Math.floor(diamonds / 1000) * 1000)));
  const [iban, setIban] = useState('TR');
  const [name, setName] = useState('');
  const n = Number(amount) || 0;
  const presets = [10_000, 20_000, 50_000].filter((p) => p <= diamonds);

  const submit = () => {
    if (name.trim().length < 3) return showAlert('Hata', 'Hesap sahibinin adını gir.');
    const err = requestWithdraw(n, iban);
    if (err) return showAlert('Hata', err);
    showAlert('Talep alındı ✅', `${usd(n)} en geç 3 iş günü içinde hesabına yatırılacak. (Demo)`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Para çek" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Card style={{ alignItems: 'center', gap: 4 }}>
          <Text style={styles.dim}>Çekilebilir bakiye</Text>
          <Text style={styles.big}>💎 {diamonds.toLocaleString('tr-TR')}</Text>
          <Text style={styles.dim}>≈ {usd(diamonds)} · Minimum {RULES.minWithdrawDiamonds.toLocaleString('tr-TR')} elmas</Text>
        </Card>

        <Text style={styles.label}>Çekilecek elmas</Text>
        <TextInput value={amount} onChangeText={(t) => setAmount(t.replace(/\D/g, ''))} keyboardType="number-pad" style={styles.input} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {presets.map((p) => (
            <Pressable key={p} style={styles.chip} onPress={() => setAmount(String(p))}>
              <Text style={styles.chipText}>{p.toLocaleString('tr-TR')}</Text>
            </Pressable>
          ))}
          {diamonds >= RULES.minWithdrawDiamonds && (
            <Pressable style={styles.chip} onPress={() => setAmount(String(diamonds))}>
              <Text style={styles.chipText}>Tümü</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.receive}>Hesabına geçecek: {usd(n)}</Text>

        <Text style={styles.label}>Hesap sahibi</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Ad Soyad" placeholderTextColor={colors.textDim} style={styles.input} />
        <Text style={styles.label}>IBAN</Text>
        <TextInput value={formatIban(iban)} onChangeText={setIban} autoCapitalize="characters" style={styles.input} placeholder="TR00 0000 0000 0000 0000 0000 00" placeholderTextColor={colors.textDim} />

        <GradientButton title="Çekim talebi oluştur" icon="cash" onPress={submit} />

        {withdrawals.length > 0 && (
          <Card style={{ gap: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Geçmiş talepler</Text>
            {withdrawals.map((w) => (
              <View key={w.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff' }}>{usd(w.diamonds)}</Text>
                  <Text style={styles.dim}>
                    {w.time} · {w.iban.slice(0, 7)}…
                  </Text>
                </View>
                <Text style={{ color: w.status === 'Onaylandı' ? colors.green : colors.gold, fontWeight: '700' }}>{w.status}</Text>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  dim: { color: colors.textDim, fontSize: 13 },
  big: { color: '#fff', fontSize: 30, fontWeight: '900' },
  label: { color: colors.textDim, fontWeight: '600', marginBottom: -6 },
  input: { backgroundColor: colors.card, borderRadius: 14, color: '#fff', fontSize: 16, paddingHorizontal: 16, paddingVertical: 13 },
  chip: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { color: '#fff', fontWeight: '600' },
  receive: { color: colors.green, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
});
