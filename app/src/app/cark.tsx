import { router } from 'expo-router';
import { useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RewardBurst, type Reward } from '@/components/fx/reward';
import { CoinPill, GradientButton, Header } from '@/components/ui';
import { WHEEL_COST, WHEEL_PRIZES, spinWheel } from '@/data/economy';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

const SIZE = 300;
const SLICE = 360 / WHEEL_PRIZES.length;
const SLICE_COLORS = ['#0A8F95', '#FF6576', '#0E7C9A', '#F59E0B', '#0EA5E9', '#22C55E', '#0FB8BE', '#EF4444'];

export default function LuckyWheel() {
  const { coins, spendCoins, addCoins, settings } = useApp();
  const [reward, setReward] = useState<Reward | null>(null);
  const [rotation] = useState(() => new Animated.Value(0));
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  const spin = () => {
    if (spinning) return;
    if (!spendCoins(WHEEL_COST)) {
      return showAlert('Yetersiz jeton', `Çevirmek ${WHEEL_COST} jeton.`, [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
    }
    const idx = spinWheel();
    // Land the chosen slice under the top pointer, after 5 full turns.
    const target = angle + 360 * 5 + (360 - ((angle % 360) + idx * SLICE + SLICE / 2)) % 360;
    setSpinning(true);
    Animated.timing(rotation, { toValue: target, duration: 4000, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      setAngle(target);
      setSpinning(false);
      const prize = WHEEL_PRIZES[idx];
      if (prize.coins) addCoins(prize.coins, 'Şans çarkı ödülü');
      setLast(`${prize.emoji} ${prize.label}`);
      // No celebration for "try again"; the result line under the wheel says it.
      if (prize.coins) setReward({ icon: prize.coins >= 2_000 ? 'trophy' : 'coin', title: prize.coins >= 2_000 ? 'BÜYÜK ÖDÜL!' : 'Çarktan jeton kazandın!', amount: prize.coins });
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Şans Çarkı" right={<CoinPill coins={coins} />} />
      <View style={styles.center}>
        <Text style={styles.pointer}>▼</Text>
        <Animated.View
          style={[
            styles.wheel,
            { transform: [{ rotate: rotation.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'], extrapolate: 'extend' }) }] },
          ]}
        >
          {WHEEL_PRIZES.map((p, i) => (
            // Each slice is a full-size layer rotated into place; the label sits near the rim.
            <View key={i} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${i * SLICE + SLICE / 2}deg` }] }]}>
              <View style={[styles.sliceLabel, { backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }]}>
                <Text style={{ fontSize: 22 }}>{p.emoji}</Text>
                <Text style={styles.sliceText} numberOfLines={2}>
                  {p.coins ? p.coins.toLocaleString('tr-TR') : '—'}
                </Text>
              </View>
            </View>
          ))}
          <View style={styles.hub}>
            <Text style={{ fontSize: 26 }}>🎰</Text>
          </View>
        </Animated.View>

        <Text style={styles.result}>{spinning ? 'Dönüyor...' : last ? `Kazandın: ${last}` : 'Şansını dene!'}</Text>
      </View>
      <View style={{ padding: 20 }}>
        <GradientButton title={`Çevir · 🪙 ${WHEEL_COST}`} icon="sync" onPress={spin} style={{ opacity: spinning ? 0.5 : 1 }} />
      </View>
      {reward && <RewardBurst reward={reward} still={settings.reduceMotion} onDone={() => setReward(null)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  pointer: { color: colors.gold, fontSize: 34, marginBottom: -14, zIndex: 2 },
  wheel: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: colors.card, borderWidth: 6, borderColor: colors.gold, overflow: 'hidden' },
  sliceLabel: { position: 'absolute', top: 6, left: SIZE / 2 - 34, width: 56, height: 120, borderRadius: 28, alignItems: 'center', paddingTop: 8, gap: 2 },
  sliceText: { color: '#fff', fontWeight: '800', fontSize: 12, textAlign: 'center' },
  hub: { position: 'absolute', top: SIZE / 2 - 38, left: SIZE / 2 - 38, width: 64, height: 64, borderRadius: 32, backgroundColor: colors.bg, borderWidth: 4, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  result: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 24 },
});
