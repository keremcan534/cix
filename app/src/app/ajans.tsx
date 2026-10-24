import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Card, GradientButton, Header } from '@/components/ui';
import { AGENCIES } from '@/data/economy';
import { USERS } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

export default function AgencyScreen() {
  const { agencyId, joinAgency, leaveAgency, weekly, isHost } = useApp();
  const [code, setCode] = useState('');
  const agency = AGENCIES.find((a) => a.id === agencyId);

  if (!agency) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header title="Ajans" />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: 10 }}>
            <Text style={styles.title}>Ajans koduyla katıl</Text>
            <Text style={styles.dim}>Ajansına bağlı yayıncılar haftalık bonus, eğitim ve öne çıkarılma desteği alır. Ajans kazancının küçük bir kısmını komisyon olarak alır.</Text>
            <TextInput value={code} onChangeText={setCode} placeholder="Örn. STAR01" placeholderTextColor={colors.textDim} autoCapitalize="characters" style={styles.input} />
            <GradientButton
              title="Katıl"
              onPress={() => {
                if (!isHost) return showAlert('Önce yayıncı ol', 'Ajansa katılmak için yayıncı başvurusu yapmalısın.');
                if (!joinAgency(code)) showAlert('Geçersiz kod', 'Bu koda ait bir ajans bulunamadı.');
              }}
            />
          </Card>
          <Text style={styles.section}>Önerilen ajanslar</Text>
          {AGENCIES.map((a) => (
            <Card key={a.id} style={styles.row}>
              <Text style={{ fontSize: 32 }}>{a.logo}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{a.name}</Text>
                <Text style={styles.dim}>
                  {a.hosts} yayıncı · Komisyon %{a.commission * 100} · Kod: {a.code}
                </Text>
              </View>
              <Pressable onPress={() => setCode(a.code)}>
                <Text style={{ color: colors.pink, fontWeight: '700' }}>Seç</Text>
              </Pressable>
            </Card>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const members = USERS.slice(0, 8).map((u, i) => ({ u, diamonds: 48_000 - i * 5_300 }));
  const weekTotal = weekly.reduce((a, b) => a + b, 0);

  return (
    <SafeAreaView style={styles.safe}>
      <Header title={agency.name} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Card style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 48 }}>{agency.logo}</Text>
          <Text style={[styles.title, { fontSize: 20 }]}>{agency.name}</Text>
          <Text style={styles.dim}>
            {agency.hosts} yayıncı · Komisyon %{agency.commission * 100}
          </Text>
        </Card>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Card style={{ flex: 1, gap: 4 }}>
            <Text style={styles.dim}>Haftalık kazancın</Text>
            <Text style={styles.big}>💎 {weekTotal.toLocaleString('tr-TR')}</Text>
          </Card>
          <Card style={{ flex: 1, gap: 4 }}>
            <Text style={styles.dim}>Ajans payı</Text>
            <Text style={styles.big}>💎 {Math.round(weekTotal * agency.commission).toLocaleString('tr-TR')}</Text>
          </Card>
        </View>
        <Card style={{ gap: 4 }}>
          <Text style={[styles.title, { marginBottom: 6 }]}>Ajans yayıncıları (bu hafta)</Text>
          {members.map(({ u, diamonds }, i) => (
            <View key={u.id} style={[styles.row, { paddingVertical: 6 }]}>
              <Text style={styles.rank}>{i + 1}</Text>
              <Avatar uri={u.avatar} size={36} online={u.online} />
              <Text style={{ color: '#fff', flex: 1 }}>{u.name}</Text>
              <Text style={{ color: '#7DD3FC', fontWeight: '700' }}>💎 {diamonds.toLocaleString('tr-TR')}</Text>
            </View>
          ))}
        </Card>
        <Pressable onPress={leaveAgency} style={{ alignItems: 'center', padding: 8 }}>
          <Text style={{ color: colors.red, fontWeight: '600' }}>Ajanstan ayrıl</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { color: '#fff', fontWeight: '700', fontSize: 16 },
  section: { color: '#fff', fontWeight: '700', fontSize: 16, marginTop: 6 },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  big: { color: '#fff', fontSize: 18, fontWeight: '800' },
  input: { backgroundColor: colors.cardAlt, borderRadius: 14, color: '#fff', fontSize: 16, paddingHorizontal: 16, paddingVertical: 12, letterSpacing: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { color: colors.textDim, width: 18, fontWeight: '700' },
});
