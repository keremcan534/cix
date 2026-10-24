import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Card, GradientButton, Header } from '@/components/ui';
import { FAMILIES } from '@/data/economy';
import { userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

const CREATE_COST = 500;

export default function FamilyScreen() {
  const { familyId, setFamily, spendCoins, me } = useApp();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [custom, setCustom] = useState<{ id: string; name: string } | null>(null);
  const family = FAMILIES.find((f) => f.id === familyId) ?? (custom && custom.id === familyId ? { id: custom.id, name: custom.name, emoji: '🏰', level: 1, members: 1, points: 0, leaderId: 'me', memberIds: ['me'] } : null);
  const ranked = [...FAMILIES].sort((a, b) => b.points - a.points);

  if (family) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header title="Ailem" />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          <Card style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 56 }}>{family.emoji}</Text>
            <Text style={styles.big}>{family.name}</Text>
            <Text style={styles.dim}>
              Lv.{family.level} · {family.members + (family.memberIds.includes('me') ? 0 : 1)} üye · {family.points.toLocaleString('tr-TR')} puan
            </Text>
            <Text style={styles.dim}>Lider: {userById(family.leaderId).name}</Text>
          </Card>
          <Card style={{ gap: 4 }}>
            <Text style={[styles.title, { marginBottom: 6 }]}>Haftalık katkı</Text>
            {[...new Set([...family.memberIds, 'me'])].map((id, i) => {
              const u = userById(id);
              return (
                <Pressable key={id} style={styles.row} onPress={() => id !== 'me' && router.push(`/kullanici/${id}`)}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <Avatar uri={u.avatar} size={36} />
                  <Text style={{ color: '#fff', flex: 1 }}>
                    {id === 'me' ? `${me.name} (sen)` : u.name}
                    {id === family.leaderId ? ' 👑' : ''}
                  </Text>
                  <Text style={{ color: colors.gold, fontWeight: '700' }}>{(id === 'me' ? 0 : (9 - i) * 12_340).toLocaleString('tr-TR')}</Text>
                </Pressable>
              );
            })}
          </Card>
          <Text style={[styles.dim, { textAlign: 'center' }]}>Odalarda gönderilen hediyeler ailenin puanına eklenir. Haftanın en iyi 3 ailesi ödül kazanır.</Text>
          <Pressable onPress={() => setFamily(null)} style={{ alignItems: 'center', padding: 8 }}>
            <Text style={{ color: colors.red, fontWeight: '600' }}>Aileden ayrıl</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Header title="Aileler" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        {creating ? (
          <Card style={{ gap: 10 }}>
            <Text style={styles.title}>Aile kur · 🪙 {CREATE_COST}</Text>
            <TextInput value={newName} onChangeText={setNewName} placeholder="Aile adı" placeholderTextColor={colors.textDim} style={styles.input} maxLength={20} />
            <GradientButton
              title="Kur"
              onPress={() => {
                if (newName.trim().length < 3) return showAlert('Aile adı en az 3 karakter olmalı');
                if (!spendCoins(CREATE_COST)) return showAlert('Yetersiz jeton', `Aile kurmak ${CREATE_COST} jeton.`);
                const id = `custom-${Date.now()}`;
                setCustom({ id, name: newName.trim() });
                setFamily(id);
              }}
            />
          </Card>
        ) : (
          <GradientButton title="Kendi aileni kur" icon="add" onPress={() => setCreating(true)} />
        )}
        <Text style={[styles.title, { marginTop: 6 }]}>Haftalık aile sıralaması</Text>
        {ranked.map((f, i) => (
          <Card key={f.id} style={styles.row}>
            <Text style={styles.rank}>{i + 1}</Text>
            <Text style={{ fontSize: 32 }}>{f.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{f.name}</Text>
              <Text style={styles.dim}>
                Lv.{f.level} · {f.members} üye · {f.points.toLocaleString('tr-TR')} puan
              </Text>
              <View style={{ flexDirection: 'row', marginTop: 6 }}>
                {f.memberIds.slice(0, 5).map((id, j) => (
                  <View key={id} style={{ marginLeft: j ? -8 : 0 }}>
                    <Avatar uri={userById(id).avatar} size={22} />
                  </View>
                ))}
              </View>
            </View>
            <Pressable style={styles.join} onPress={() => setFamily(f.id)}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Katıl</Text>
            </Pressable>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { color: '#fff', fontWeight: '700', fontSize: 16 },
  big: { color: '#fff', fontWeight: '800', fontSize: 22 },
  dim: { color: colors.textDim, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  rank: { color: colors.textDim, fontWeight: '800', width: 18 },
  join: { backgroundColor: colors.pink, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  input: { backgroundColor: colors.cardAlt, borderRadius: 14, color: '#fff', fontSize: 16, paddingHorizontal: 16, paddingVertical: 12 },
});
