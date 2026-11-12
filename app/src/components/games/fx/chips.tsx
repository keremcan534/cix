// Betting chips of the bet boards (components/games/board): the chips of the tray, the stack a bet stands as on
// an option, and the face the flying chip wears (fx/flights). Plain views, no pictures: a disc with eight edge
// marks and a darker middle for the amount.
import { memo, useEffect, useState, type Ref } from 'react';
import { Animated, Pressable, StyleSheet, View, type HostInstance } from 'react-native';

import { RollingNumber } from '@/components/fx/rolling-number';
import { chipOf, shortCoins } from '@/components/games/fx/spin-plan';
import { Text } from '@/components/text';

export type ChipLook = { fill: string; core: string; mark: string; ink: string };
/** By the stake's place in the game's list, smallest first. */
const CHIP_LOOKS: ChipLook[] = [
  { fill: '#2563EB', core: '#1E3A8A', mark: '#DBEAFE', ink: '#FFFFFF' },
  { fill: '#16A34A', core: '#14532D', mark: '#DCFCE7', ink: '#FFFFFF' },
  { fill: '#DC2626', core: '#7F1D1D', mark: '#FEE2E2', ink: '#FFFFFF' },
  { fill: '#0FB8BE', core: '#0A5F63', mark: '#D5FBFC', ink: '#FFFFFF' },
  { fill: '#EA580C', core: '#7C2D12', mark: '#FFEDD5', ink: '#FFFFFF' },
  { fill: '#1F2937', core: '#0B1220', mark: '#FACC15', ink: '#FDE68A' },
];
export const chipLook = (chips: readonly number[], value: number) => CHIP_LOOKS[Math.max(0, chips.indexOf(value)) % CHIP_LOOKS.length];

export const ChipFace = memo(function ChipFace({ size, look, label }: { size: number; look: ChipLook; label?: string }) {
  const mark = Math.max(2, Math.round(size * 0.15));
  const core = Math.round(size * 0.7);
  return (
    <View style={[c.chip, { width: size, height: size, borderRadius: size / 2, backgroundColor: look.fill }]}>
      {[0, 45, 90, 135].map((deg) => (
        <View key={deg} style={[c.arm, { transform: [{ rotate: `${deg}deg` }] }]}>
          <View style={{ width: mark, height: mark * 1.2, backgroundColor: look.mark }} />
          <View style={{ width: mark, height: mark * 1.2, backgroundColor: look.mark }} />
        </View>
      ))}
      <View style={[c.core, { width: core, height: core, borderRadius: core / 2, backgroundColor: look.core, borderWidth: size > 30 ? 1.5 : 1 }]}>
        {label !== undefined && (
          <Text style={{ color: look.ink, fontWeight: '900', fontSize: Math.round(size * (label.length > 2 ? 0.27 : 0.32)), fontVariant: ['tabular-nums'] }} numberOfLines={1}>
            {label}
          </Text>
        )}
      </View>
    </View>
  );
});

/** One chip of the tray: the chosen one stands a little higher, in a gold ring. `nodeRef` is where its flights set off from. */
export function TrayChip({ value, look, on, onPress, size = 46, nodeRef }: { value: number; look: ChipLook; on: boolean; onPress: () => void; size?: number; nodeRef?: Ref<HostInstance> }) {
  const [v] = useState(() => new Animated.Value(on ? 1 : 0));
  useEffect(() => {
    Animated.spring(v, { toValue: on ? 1 : 0, friction: 6, tension: 150, useNativeDriver: true }).start();
  }, [on, v]);
  return (
    <Pressable onPress={onPress} hitSlop={3} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`Fiş ${value}`}>
      <Animated.View style={{ transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}>
        <View ref={nodeRef} collapsable={false} style={[c.ring, { borderRadius: size / 2 + 3 }, on && c.ringOn]}>
          <ChipFace size={size} look={look} label={shortCoins(value)} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** A bet as it stands on an option: a small pile in the color of its biggest chip, and the amount, rolling up as chips land. */
export function BetStack({ amount, chips, size = 15 }: { amount: number; chips: readonly number[]; size?: number }) {
  const look = chipLook(chips, chipOf(chips, amount));
  // One chip for a single stake; the pile grows to three as more is put on.
  const pile = amount >= chips[0] * 4 ? 3 : amount > chips[0] ? 2 : 1;
  return (
    <View style={c.stack}>
      <View style={{ width: size, height: size + (pile - 1) * 3 }}>
        {Array.from({ length: pile }, (_, i) => (
          <View key={i} style={{ position: 'absolute', left: 0, bottom: i * 3, boxShadow: '0 1px 1px rgba(0,0,0,0.5)', borderRadius: size / 2 }}>
            <ChipFace size={size} look={look} />
          </View>
        ))}
      </View>
      <RollingNumber value={amount} format={shortCoins} duration={320} style={c.amount} numberOfLines={1} />
    </View>
  );
}

const c = StyleSheet.create({
  chip: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.45)' },
  arm: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'space-between' },
  core: { alignItems: 'center', justifyContent: 'center', borderColor: 'rgba(255,255,255,0.55)' },
  ring: { padding: 2, borderWidth: 2, borderColor: 'transparent' },
  ringOn: { borderColor: '#FACC15', boxShadow: '0 0 10px rgba(250,204,21,0.55)' },
  stack: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, backgroundColor: 'rgba(5,3,20,0.82)', borderRadius: 999, paddingLeft: 3, paddingRight: 7, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(250,204,21,0.7)' },
  amount: { color: '#FDE68A', fontWeight: '900', fontSize: 11, lineHeight: 15 },
});
