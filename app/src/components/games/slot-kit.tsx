// Shared pieces of the launch casino games (Gece Yarısı Çarkı, Hazine Kulesi, Şimşek Dağı, Mercan Avı): the balance pill, the
// bet stepper and the round helpers. Rounds always go through playCasino (lib/games); these only show them.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { tapHaptic } from '@/lib/haptics';
import { useApp } from '@/store';

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const fmt = (n: number) => Math.floor(n).toLocaleString('tr-TR');
/** Balance for tight spots: 99.950, 999K, 1,2M. */
const compact = (n: number) => (n >= 1_000_000 ? `${(Math.floor(n / 100_000) / 10).toLocaleString('tr-TR')}M` : n >= 100_000 ? `${Math.floor(n / 1_000)}K` : fmt(n));

/** Avatar, coins you can play with (wallet + game balance) and a + that opens the wallet. */
export function BalancePill({ tint = '#2A0F3D' }: { tint?: string }) {
  const { me, coins, gameCoins } = useApp();
  return (
    <View style={[k.pill, { backgroundColor: tint }]} accessibilityLabel={`Bakiye ${coins + gameCoins} jeton`}>
      <Image source={{ uri: me.avatar }} style={k.avatar} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={k.name} numberOfLines={1}>
          {me.name}
        </Text>
        <Text style={k.coins} numberOfLines={1}>
          🪙 {compact(coins + gameCoins)}
        </Text>
      </View>
      <Pressable onPress={() => router.push('/cuzdan')} hitSlop={8} accessibilityLabel="Jeton yükle">
        <Ionicons name="add-circle" size={24} color="#FACC15" />
      </Pressable>
    </View>
  );
}

/** − amount + over the game's allowed bets. */
export function BetStepper({ bets, bet, onChange, disabled, tint = '#3B0F4F' }: { bets: number[]; bet: number; onChange: (b: number) => void; disabled?: boolean; tint?: string }) {
  const i = bets.indexOf(bet);
  const step = (d: number) => {
    const next = bets[Math.max(0, Math.min(bets.length - 1, i + d))];
    if (next !== bet) {
      tapHaptic();
      onChange(next);
    }
  };
  return (
    <View style={[k.stepper, { backgroundColor: tint }, disabled && { opacity: 0.6 }]}>
      <Pressable onPress={() => step(-1)} disabled={disabled || i <= 0} style={[k.stepBtn, i <= 0 && { opacity: 0.4 }]} accessibilityLabel="Bahsi azalt">
        <Ionicons name="remove" size={22} color="#fff" />
      </Pressable>
      <Text style={k.bet} accessibilityLabel={`Bahis ${bet} jeton`}>
        {fmt(bet)}
      </Text>
      <Pressable onPress={() => step(1)} disabled={disabled || i >= bets.length - 1} style={[k.stepBtn, i >= bets.length - 1 && { opacity: 0.4 }]} accessibilityLabel="Bahsi artır">
        <Ionicons name="add" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

/** The game balance note every casino game shows under its controls. */
export function GameBalanceNote({ rules }: { rules: string }) {
  return (
    <>
      <Text style={k.note}>🎮 Kazançlar oyun bakiyesine yazılır; bahisler önce oradan düşer. Oyun bakiyesi yalnızca oyunlarda kullanılır, hediye edilemez ve paraya çevrilemez.</Text>
      <Text style={k.note}>{rules}</Text>
    </>
  );
}

const k = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 6, paddingVertical: 6, flex: 1, borderWidth: 1, borderColor: 'rgba(250,204,21,0.35)' },
  avatar: { width: 28, height: 28, borderRadius: 7 },
  name: { color: '#fff', fontWeight: '800', fontSize: 13 },
  coins: { color: '#FDE68A', fontWeight: '800', fontSize: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  stepBtn: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  bet: { color: '#FDE68A', fontWeight: '900', fontSize: 20, minWidth: 64, textAlign: 'center' },
  note: { color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
