import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/ui';
import { COIN_PACKS } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors, gradient } from '@/theme';

export default function WalletScreen() {
  const { coins, addCoins } = useApp();
  const [selected, setSelected] = useState(COIN_PACKS[1].id);
  const pack = COIN_PACKS.find((p) => p.id === selected)!;

  const buy = () => {
    // Prototype: no real payment, just credit the coins.
    const bonus = pack.bonus ? Number(pack.bonus.replace('+', '')) : 0;
    addCoins(pack.coins + bonus);
    showAlert('Başarılı 🎉', `${pack.coins + bonus} jeton hesabına eklendi. (Demo – gerçek ödeme alınmadı)`);
  };

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
      </LinearGradient>

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
        <GradientButton title={`${pack.price} öde`} icon="card" onPress={buy} />
        <Text style={styles.note}>Prototip: Ödeme simüle edilir.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  balance: { margin: 16, borderRadius: 20, padding: 20, gap: 6 },
  balanceLabel: { color: 'rgba(255,255,255,0.85)' },
  balanceN: { color: '#fff', fontSize: 32, fontWeight: '800' },
  section: { color: '#fff', fontWeight: '700', fontSize: 16, paddingHorizontal: 16, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10 },
  pack: { width: '46%', margin: '2%', alignItems: 'center', gap: 4, paddingVertical: 18, borderRadius: 16, backgroundColor: colors.card, borderWidth: 2, borderColor: 'transparent' },
  packSelected: { borderColor: colors.pink },
  bonus: { position: 'absolute', top: 0, right: 0, backgroundColor: colors.pink, borderTopRightRadius: 14, borderBottomLeftRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  bonusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  packCoins: { color: '#fff', fontSize: 18, fontWeight: '800' },
  packPrice: { color: colors.textDim },
  note: { color: colors.textDim, fontSize: 11, textAlign: 'center', marginTop: 8 },
});
