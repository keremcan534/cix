import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/ui';
import { COIN_PACKS } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors, gradient } from '@/theme';

export default function WalletScreen() {
  const { coins, addCoins, ledger, diamonds, spentToday, settings } = useApp();
  const [selected, setSelected] = useState(COIN_PACKS[1].id);
  const [tab, setTab] = useState<'buy' | 'history'>('buy');
  const [filter, setFilter] = useState<'coin' | 'diamond'>('coin');
  const [processing, setProcessing] = useState(false);
  const pack = COIN_PACKS.find((p) => p.id === selected)!;

  const buy = () => {
    // A second tap while the store payment is pending must not charge twice.
    if (processing) return;
    setProcessing(true);
    // Prototype: no real payment; simulate the store confirmation delay, then credit.
    setTimeout(() => {
      const bonus = pack.bonus ? Number(pack.bonus.replace('+', '')) : 0;
      addCoins(pack.coins + bonus, `Satın alma: ${pack.coins} paket`);
      setProcessing(false);
      showAlert('Başarılı 🎉', `${pack.coins + bonus} jeton hesabına eklendi. (Demo – gerçek ödeme alınmadı)`);
    }, 1200);
  };
  const rows = ledger.filter((r) => r.currency === filter);
  const loadedToday = ledger.filter((r) => r.currency === 'coin' && r.amount > 0).reduce((x, r) => x + r.amount, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.title}>Cüzdan</Text>
        <View style={{ width: 26 }} />
      </View>

      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balance}>
        <Text style={styles.balanceLabel}>Jeton bakiyen</Text>
        <Text style={styles.balanceN}>🪙 {coins.toLocaleString('tr-TR')}</Text>
        <Text style={styles.balanceLabel}>💎 {diamonds.toLocaleString('tr-TR')} elmas (ayrı bakiye)</Text>
      </LinearGradient>

      <View style={styles.segment}>
        {(
          [
            ['buy', 'Jeton yükle'],
            ['history', 'Hareketler'],
          ] as const
        ).map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.segBtn, tab === k && styles.segActive]}>
            <Text style={styles.segText}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'history' ? (
        <>
          <Text style={[styles.note, { marginBottom: 8 }]}>
            Bugün: 🪙 {spentToday.toLocaleString('tr-TR')} harcandı · 🪙 {loadedToday.toLocaleString('tr-TR')} eklendi
            {settings.dailySpendLimit ? ` · Limit ${settings.dailySpendLimit.toLocaleString('tr-TR')}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 }}>
            {(
              [
                ['coin', '🪙 Jeton'],
                ['diamond', '💎 Elmas'],
              ] as const
            ).map(([k, l]) => (
              <Pressable key={k} onPress={() => setFilter(k)} style={[styles.chip, filter === k && { backgroundColor: colors.primary }]}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{l}</Text>
              </Pressable>
            ))}
          </View>
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
            ListEmptyComponent={<Text style={[styles.note, { marginTop: 30 }]}>Henüz hareket yok.</Text>}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff' }}>{item.reason}</Text>
                  <Text style={{ color: colors.textDim, fontSize: 11 }}>
                    {item.time} · {item.status} · {item.ref}
                  </Text>
                </View>
                <Text style={{ color: item.amount < 0 ? colors.red : colors.green, fontWeight: '800' }}>
                  {item.amount > 0 ? '+' : ''}
                  {item.amount.toLocaleString('tr-TR')}
                </Text>
              </View>
            )}
          />
        </>
      ) : (
        <>
          <Text style={styles.section}>Jeton yükle</Text>
          <View style={styles.grid}>
            {COIN_PACKS.map((p) => (
              <Pressable key={p.id} onPress={() => setSelected(p.id)} style={[styles.pack, selected === p.id && styles.packSelected]}>
                {p.bonus && (
                  <View style={styles.bonus}>
                    <Text style={styles.bonusText}>{p.bonus}</Text>
                  </View>
                )}
                <Text style={{ fontSize: 30 }}>🪙</Text>
                <Text style={styles.packCoins}>{p.coins.toLocaleString('tr-TR')}</Text>
                <Text style={styles.packPrice}>{p.price}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ padding: 16, marginTop: 'auto' }}>
            <GradientButton
              title={processing ? 'Ödeme bekleniyor...' : `${pack.price} öde`}
              icon={processing ? 'time' : 'card'}
              onPress={buy}
              style={{ opacity: processing ? 0.6 : 1 }}
            />
            <Text style={styles.note}>Prototip: Ödeme simüle edilir. İade/itiraz için Destek merkezi.</Text>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', alignSelf: 'center', backgroundColor: colors.card, borderRadius: 999, padding: 4, marginBottom: 12 },
  segBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999 },
  segActive: { backgroundColor: colors.primary },
  segText: { color: '#fff', fontWeight: '700' },
  chip: { backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  balance: { margin: 16, borderRadius: 20, padding: 20, gap: 6 },
  balanceLabel: { color: 'rgba(255,255,255,0.85)' },
  balanceN: { color: '#fff', fontSize: 32, fontWeight: '800' },
  section: { color: '#fff', fontWeight: '700', fontSize: 16, paddingHorizontal: 16, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10 },
  pack: {
    width: '46%',
    margin: '2%',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  packSelected: { borderColor: colors.pink },
  bonus: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: colors.pink,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  bonusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  packCoins: { color: '#fff', fontSize: 18, fontWeight: '800' },
  packPrice: { color: colors.textDim },
  note: { color: colors.textDim, fontSize: 11, textAlign: 'center', marginTop: 8 },
});
