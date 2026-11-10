// The brand's "loading": the S and the C of the opening (components/fx/intro) in their own colors, lighting up gold
// in turn, with a soft breath. It stands wherever a screen or a list waits; a small spinner stays only inside
// buttons. With "Animasyonları azalt" the letters stay still.
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { useSettings } from '@/store';
import { colors as brand, useTheme } from '@/theme';

const NATIVE = Platform.OS !== 'web';

function Letter({ ch, color, gold, size }: { ch: string; color: string; gold: Animated.AnimatedInterpolation<number> | number; size: number }) {
  const type = { fontSize: size, lineHeight: Math.round(size * 1.2), fontWeight: '800' as const, letterSpacing: -0.5 };
  return (
    <View>
      <Text style={[type, { color }]}>{ch}</Text>
      <Animated.Text style={[type, StyleSheet.absoluteFill, { color: brand.gold, fontFamily: 'JakartaExtraBold', opacity: gold }]}>{ch}</Animated.Text>
    </View>
  );
}

export function BrandLoader({ size = 30, label, style }: { size?: number; label?: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const { reduceMotion } = useSettings();
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }));
    loop.start();
    return () => loop.stop();
  }, [t, reduceMotion]);
  // The S lights up, then the C half a beat later; the pair breathes once a cycle.
  const goldS = reduceMotion ? 0 : t.interpolate({ inputRange: [0, 0.25, 0.5, 1], outputRange: [0, 1, 0, 0] });
  const goldC = reduceMotion ? 0 : t.interpolate({ inputRange: [0, 0.5, 0.75, 1], outputRange: [0, 0, 1, 0] });
  const breath = reduceMotion ? 1 : t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.08, 1] });
  return (
    <View style={[s.wrap, style]} accessible accessibilityRole="progressbar" accessibilityLabel={label ?? 'Yükleniyor'}>
      <Animated.View style={[s.pair, { gap: size * 0.06, transform: [{ scale: breath }] }]}>
        <Letter ch="S" color={brand.primaryText} gold={goldS} size={size} />
        <Letter ch="C" color={brand.pink} gold={goldC} size={size} />
      </Animated.View>
      {!!label && <Text style={[s.label, { color: colors.textDim }]}>{label}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  pair: { flexDirection: 'row', alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '600' },
});
