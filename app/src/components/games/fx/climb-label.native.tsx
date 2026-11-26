// A number that climbs every frame (Yörünge's multiplier, Kaç's payout), drawn by Skia on the UI thread straight from
// the climb's shared value: no React render, no text layout on the JS thread, however fast it counts. It is cast in
// the Salon's metal like GoldText: a dark outline, a gradient from a bright top to a deep bottom, a soft glow. The web
// build has its own file (climb-label.tsx) that draws GoldText instead.
import { Canvas, Group, LinearGradient, Shadow, Text as SkText, useFont, vec } from '@shopify/react-native-skia';
import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { climbText, type ClimbFormat } from '@/components/games/fx/climb-format';

const CINZEL = require('@expo-google-fonts/cinzel/900Black/Cinzel_900Black.ttf');

const METALS = {
  gold: { line: '#2B1200', glow: 'rgba(255,186,58,0.75)', colors: ['#FFF5C8', '#F7C64C', '#F2B238', '#B4650C'] },
  emerald: { line: '#03270F', glow: 'rgba(255,245,200,0.55)', colors: ['#FFFDF0', '#FFF5C8', '#FDE68A', '#E8B53A'] },
} as const;

export function ClimbLabel({
  climb,
  format,
  size,
  height,
  metal = 'gold',
  glow = true,
  style,
  fallback,
  fit = false,
}: {
  /** The climb in hundredths (100 = 1,00×), set every frame on the UI thread. */
  climb: SharedValue<number>;
  format: ClimbFormat;
  /** Font size (px). */
  size: number;
  /** The label's height; its width is the box it is given. */
  height: number;
  metal?: keyof typeof METALS;
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Shown until the font has loaded (a moment, the first time). */
  fallback?: ReactNode;
  /** Shrinks the text (from its middle) when it is wider than the box: a big win's number never runs over its plate. */
  fit?: boolean;
}) {
  const font = useFont(CINZEL, size);
  const [w, setW] = useState(0);
  const m = METALS[metal];
  const text = useDerivedValue(() => climbText(climb.get(), format), [format]);
  const tw = useDerivedValue(() => (font ? font.measureText(text.get()).width : 0), [font]);
  const x = useDerivedValue(() => (w - tw.get()) / 2, [w]);
  const shrink = useDerivedValue(() => [{ scale: fit && tw.get() > w - 8 ? (w - 8) / tw.get() : 1 }], [fit, w]);
  // Cinzel's capitals sit a little high in their line: the baseline goes a touch below the middle.
  const y = height / 2 + size * 0.36;
  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setW((p) => (p === next ? p : next));
  };
  return (
    <View style={[{ height, alignSelf: 'stretch' }, style]} onLayout={onLayout} pointerEvents="none">
      {!font || !w ? (
        fallback
      ) : (
        <Canvas style={{ width: w, height }}>
          <Group transform={shrink} origin={vec(w / 2, height / 2)}>
            <SkText x={x} y={y} text={text} font={font} style="stroke" strokeWidth={Math.max(2, size * 0.11)} strokeJoin="round" color={m.line} />
            <SkText x={x} y={y} text={text} font={font}>
              <LinearGradient start={vec(0, y - size * 0.78)} end={vec(0, y + size * 0.06)} colors={[...m.colors]} />
              {glow && <Shadow dx={0} dy={0} blur={size * 0.22} color={m.glow} />}
            </SkText>
          </Group>
        </Canvas>
      )}
    </View>
  );
}
