// Reward moment (check-in, task reward, wheel prize): the prize icon springs in over a dimmed screen
// with a turning light ring and a coin burst, the amount counts up, then it clears itself (~2 s).
// Tap anywhere to close early. With reduced motion it just fades in and out.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon3D, icon3dFor, type Icon3DName } from '@/components/Icon3D';
import { successHaptic } from '@/lib/haptics';
import { colors, semantic } from '@/theme';

export type Reward = { icon?: Icon3DName; emoji?: string; title: string; amount?: number };

const HOLD_MS = 1500;
const BURST = 10;

export function RewardBurst({ reward, still, onDone }: { reward: Reward; still?: boolean; onDone: () => void }) {
  const [inV] = useState(() => new Animated.Value(still ? 1 : 0));
  const [out] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));
  const [count, setCount] = useState(reward.amount && !still ? 0 : (reward.amount ?? 0));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    successHaptic();
    const ring = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }));
    if (!still) ring.start();
    const a = Animated.sequence([
      still ? Animated.delay(0) : Animated.spring(inV, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      Animated.delay(HOLD_MS),
      Animated.timing(out, { toValue: 1, duration: 280, useNativeDriver: true }),
    ]);
    a.start(() => done.current());
    return () => {
      a.stop();
      ring.stop();
    };
  }, [inV, out, spin, still]);

  // Count the amount up over ~0.6 s (a few state updates, not per frame).
  const amount = reward.amount;
  useEffect(() => {
    if (!amount || still) return;
    let step = 0;
    const t = setInterval(() => {
      step += 1;
      setCount(Math.round((amount * step) / 12));
      if (step >= 12) clearInterval(t);
    }, 50);
    return () => clearInterval(t);
  }, [amount, still]);

  const icon = reward.icon ?? icon3dFor(reward.emoji);
  const fade = out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.dim, { opacity: fade }]} accessibilityLiveRegion="polite" accessibilityLabel={`${reward.title}${amount ? `, ${amount} jeton` : ''}`}>
      <Pressable style={s.center} onPress={() => done.current()}>
        <View style={s.stage}>
          {!still && (
            <Animated.View style={[s.ring, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }, { scale: inV }] }]}>
              {Array.from({ length: 12 }, (_, i) => (
                <View key={i} style={[s.ray, { transform: [{ rotate: `${i * 30}deg` }, { translateY: -70 }] }]} />
              ))}
            </Animated.View>
          )}
          {!still &&
            Array.from({ length: BURST }, (_, i) => {
              const a = (i / BURST) * Math.PI * 2;
              return (
                <Animated.View
                  key={i}
                  style={[
                    s.coin,
                    {
                      opacity: inV.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
                      transform: [
                        { translateX: inV.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * 110] }) },
                        { translateY: inV.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * 110] }) },
                      ],
                    },
                  ]}
                >
                  <Icon3D name="coin" size={22} />
                </Animated.View>
              );
            })}
          <Animated.View style={{ transform: [{ scale: inV.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }}>
            {icon ? <Icon3D name={icon} size={120} /> : <Text style={s.emoji}>{reward.emoji}</Text>}
          </Animated.View>
        </View>
        <Text style={s.title}>{reward.title}</Text>
        {!!amount && <Text style={s.amount}>+{count.toLocaleString('tr-TR')}</Text>}
        <Text style={s.hint}>Kapatmak için dokun</Text>
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  dim: { backgroundColor: 'rgba(8,15,30,0.82)', zIndex: 50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  stage: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  ray: { position: 'absolute', width: 10, height: 54, borderRadius: 5, backgroundColor: 'rgba(246,189,96,0.28)' },
  coin: { position: 'absolute' },
  emoji: { fontSize: 96, lineHeight: 120 },
  title: { color: colors.text, fontSize: 20, fontWeight: '900', textAlign: 'center', paddingHorizontal: 24 },
  amount: { color: semantic.money, fontSize: 34, fontWeight: '900' },
  hint: { color: colors.textDim, fontSize: 12, marginTop: 8 },
});
