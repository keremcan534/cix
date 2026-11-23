// A treasury's air, drawn on the GPU (Skia, on the UI thread with Reanimated): soft rays of light turning slowly down
// from the top, a warm glow under them, and gold embers rising all the time, now and then one flaring. Behind the
// Jeton Yükle screen's packs (app/cuzdan). Decoration only, never catching a tap; a phone that drops frames in the
// first second draws fewer embers. The web build draws nothing (fx/ambient-gold.tsx).
import { BlurMask, Canvas, Fill, Path, Shader, Skia, useClock, usePathValue } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { makeRising } from '@/components/games/fx/divine-look';

const RAYS = Skia.RuntimeEffect.Make(`
uniform float2 res;
uniform float time;
half4 main(float2 p) {
  float2 o = float2(res.x * 0.5, -res.y * 0.08);
  float2 d = p - o;
  float a = atan(d.y, d.x);
  float r = length(d) / res.y;
  float s1 = pow(0.5 + 0.5 * sin(a * 18.0 + time * 0.25), 6.0);
  float s2 = pow(0.5 + 0.5 * sin(a * 11.0 - time * 0.18 + 1.3), 9.0);
  float fall = smoothstep(0.95, 0.05, r);
  float ray = (s1 * 0.55 + s2 * 0.45) * fall * 0.32;
  float glow = exp(-r * r * 9.0) * 0.38;
  float3 c = float3(1.0, 0.78, 0.36) * ray + float3(1.0, 0.86, 0.55) * glow;
  float alpha = clamp(ray + glow, 0.0, 1.0);
  return half4(half3(c), half(alpha));
}
`)!;

const HIGH = 64;
const LOW = 26;
const EMBERS = makeRising(HIGH, 31);

export function AmbientGold() {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setBox({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {box.w > 0 && <Air w={box.w} h={box.h} />}
    </View>
  );
}

function Air({ w, h }: { w: number; h: number }) {
  const clock = useClock();
  const count = useSharedValue(HIGH);
  const frames = useSharedValue(0);
  const slow = useSharedValue(0);
  useFrameCallback((f) => {
    'worklet';
    if (frames.value > 70) return;
    frames.value += 1;
    if ((f.timeSincePreviousFrame ?? 16) > 26) slow.value += 1;
    if (slow.value > 18) count.value = LOW;
  });
  const uniforms = useDerivedValue(() => ({ res: [w, h], time: clock.value / 1000 }));
  const embers = useMemo(() => EMBERS, []);
  // Small embers, and the few flaring at the top of their twinkle (bigger, whiter).
  const small = usePathValue((b) => {
    'worklet';
    const t = clock.value;
    for (let i = 0; i < count.value; i += 1) {
      const e = embers[i];
      const u = (t / (e.period * 1.6) + e.phase) % 1;
      const r = e.size * 1.1 * Math.sin(u * Math.PI);
      if (r > 0.2) b.addCircle(e.x * w + Math.sin(t / 900 + e.phase * 6.28) * e.sway, h * (1.03 - u * 1.08), r);
    }
  });
  const flares = usePathValue((b) => {
    'worklet';
    const t = clock.value;
    for (let i = 0; i < count.value; i += 7) {
      const e = embers[i];
      const u = (t / (e.period * 1.6) + e.phase) % 1;
      const tw = Math.max(0, Math.sin(t / 260 + i)) ** 6;
      const r = (1.5 + 2.5 * tw) * Math.sin(u * Math.PI);
      if (r > 0.4) b.addCircle(e.x * w + Math.sin(t / 900 + e.phase * 6.28) * e.sway, h * (1.03 - u * 1.08), r);
    }
  });
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Fill>
        <Shader source={RAYS} uniforms={uniforms} />
      </Fill>
      <Path path={small} color="#FFC94A" opacity={0.85}>
        <BlurMask blur={4} style="solid" />
      </Path>
      <Path path={flares} color="#FFF4D6">
        <BlurMask blur={7} style="solid" />
      </Path>
    </Canvas>
  );
}
