// The web build's climbing label (the phone draws it with Skia: climb-label.native.tsx): the climb's shared value read
// 20 times a second and written in GoldText.
import { useEffect, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { climbText, type ClimbFormat } from '@/components/games/fx/climb-format';
import { FitBox, GoldText } from '@/components/games/fx/gold-text';

export function ClimbLabel({ climb, format, size, height, glow = true, style, fit = false }: { climb: SharedValue<number>; format: ClimbFormat; size: number; height: number; metal?: 'gold' | 'emerald'; glow?: boolean; style?: StyleProp<ViewStyle>; fallback?: ReactNode; fit?: boolean }) {
  const [w, setW] = useState(0);
  const [text, setText] = useState(() => climbText(climb.get(), format));
  useEffect(() => {
    const id = setInterval(() => setText((t) => {
      const next = climbText(climb.get(), format);
      return next === t ? t : next;
    }), 50);
    return () => clearInterval(id);
  }, [climb, format]);
  const label = (
    <GoldText size={size} lite glow={glow}>
      {text}
    </GoldText>
  );
  return (
    <View style={[{ height, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }, style]} onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))} pointerEvents="none">
      {fit && w > 0 ? <FitBox width={w}>{label}</FitBox> : label}
    </View>
  );
}
