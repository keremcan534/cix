// Lucky combo wheel (bottom right). After a Lucky send it shows that gift; a line runs once around the
// circle while the combo is open. Tapping sends the same gift to the same person again (×1, ×2, ×3 …)
// and restarts the line, so the user doesn't reopen the gift panel every time. When the line closes,
// the wheel goes away. Visual only: it never touches seats, the mic or the voice connection.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, semantic } from '@/theme';

export const COMBO_MS = 5000;
const S = 76;
const W = 4;
const LINE = semantic.money;

export function LuckyCombo({
  emoji,
  name,
  price,
  count,
  restartKey,
  onPress,
  onExpire,
}: {
  emoji: string;
  name: string;
  price: number;
  count: number;
  /** Changes on every successful send; restarts the line. */
  restartKey: number;
  onPress: () => void;
  onExpire: () => void;
}) {
  const [p] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(1));
  const expire = useRef(onExpire);
  useEffect(() => {
    expire.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    p.setValue(0);
    spin.setValue(0);
    pop.setValue(1.25);
    const line = Animated.timing(p, { toValue: 1, duration: COMBO_MS, easing: Easing.linear, useNativeDriver: true });
    Animated.parallel([
      Animated.timing(spin, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
    line.start(({ finished }) => finished && expire.current());
    return () => line.stop();
  }, [restartKey, p, spin, pop]);

  // The line: two clipped half-rings. The right half fills during the first half of the time, the left after.
  const rightRot = p.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '180deg', '180deg'] });
  const leftRot = p.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '0deg', '180deg'] });
  const wheel = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${name} tekrar gönder, ${price} jeton. Şu ana kadar ${count} kez gönderildi.`}>
        <Animated.View style={[s.ring, { transform: [{ scale: pop }] }]}>
          <View style={[s.circle, { borderColor: 'rgba(255,255,255,0.18)' }]} />
          <View style={[s.half, { left: S / 2 }]}>
            <Animated.View style={[s.circle, { left: -S / 2, borderTopColor: LINE, borderLeftColor: LINE, transform: [{ rotate: '-45deg' }, { rotate: rightRot }] }]} />
          </View>
          <View style={[s.half, { left: 0 }]}>
            <Animated.View style={[s.circle, { left: 0, borderBottomColor: LINE, borderRightColor: LINE, transform: [{ rotate: '-45deg' }, { rotate: leftRot }] }]} />
          </View>
          <Animated.View style={[s.disc, { transform: [{ rotate: wheel }] }]}>
            {[0, 45, 90, 135].map((a) => (
              <View key={a} style={[s.spoke, { transform: [{ rotate: `${a}deg` }] }]} />
            ))}
            <Text style={s.emoji}>{emoji}</Text>
          </Animated.View>
        </Animated.View>
        <View style={s.count}>
          <Text style={s.countText}>×{count}</Text>
        </View>
      </Pressable>
      <Text style={s.price}>{price.toLocaleString('tr-TR')} 🪙</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', right: 10, bottom: 92, alignItems: 'center', zIndex: 70 },
  ring: { width: S, height: S },
  half: { position: 'absolute', top: 0, width: S / 2, height: S, overflow: 'hidden' },
  circle: { position: 'absolute', top: 0, width: S, height: S, borderRadius: S / 2, borderWidth: W, borderColor: 'transparent' },
  disc: { position: 'absolute', top: W + 3, left: W + 3, width: S - 2 * (W + 3), height: S - 2 * (W + 3), borderRadius: S, backgroundColor: '#3A2A08', borderWidth: 2, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  spoke: { position: 'absolute', width: 2, height: '100%', backgroundColor: 'rgba(251,191,36,0.22)' },
  emoji: { fontSize: 28 },
  count: { position: 'absolute', top: -6, right: -10, minWidth: 34, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: semantic.money, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  countText: { color: semantic.moneyInk, fontWeight: '900', fontSize: 13, fontVariant: ['tabular-nums'] },
  price: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginTop: 2 },
});
