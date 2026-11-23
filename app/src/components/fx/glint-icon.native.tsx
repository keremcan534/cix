// A shining icon: the picture, a bright band of light sliding across it now and then (drawn only on the picture's own
// pixels, never as a box past its edges), and as the light reaches the top corner a four-pointed star flashing there.
// Drawn on the GPU (Skia) from one clock on the UI thread. "Hareketi azalt" or effects off: the picture alone. The web
// build shows the picture alone too (fx/glint-icon.tsx).
import { BlurMask, Canvas, Group, Image, LinearGradient, Path, Rect, Skia, useClock, useImage, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { Image as RNImage } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

import { useSettings } from '@/store';

export type GlintIconProps = {
  source: number;
  size: number;
  /** How often the light passes (ms) and when the first pass starts, so a grid doesn't flash all at once. */
  every?: number;
  delay?: number;
};

const SWEEP = 760;

export function GlintIcon({ source, size, every = 3200, delay = 0 }: GlintIconProps) {
  const { reduceMotion, effectsOff } = useSettings();
  const image = useImage(source);
  if (reduceMotion || effectsOff || !image) return <RNImage source={source} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />;
  return <Glint image={image} size={size} every={every} delay={delay} />;
}

function Glint({ image, size: S, every, delay }: { image: NonNullable<ReturnType<typeof useImage>>; size: number; every: number; delay: number }) {
  const clock = useClock();
  // Where the band is: -0.5 … 1.5 across the picture while it passes, far off between passes.
  const p = useDerivedValue(() => {
    const t = clock.value - delay;
    if (t < 0) return -2;
    const k = t % every;
    return k > SWEEP ? -2 : -0.5 + (k / SWEEP) * 2;
  });
  const start = useDerivedValue(() => vec((p.value - 0.35) * S, (p.value - 0.35) * S));
  const end = useDerivedValue(() => vec((p.value + 0.35) * S, (p.value + 0.35) * S));
  // The star flashes as the band reaches the top-right corner.
  const flash = useDerivedValue(() => Math.max(0, 1 - Math.abs(p.value - 0.55) / 0.22));
  const star = useMemo(() => {
    const cx = S * 0.8;
    const cy = S * 0.18;
    const r = S * 0.2;
    const w = r * 0.16;
    const b = Skia.PathBuilder.Make();
    b.moveTo(cx, cy - r);
    b.quadTo(cx + w, cy - w, cx + r, cy);
    b.quadTo(cx + w, cy + w, cx, cy + r);
    b.quadTo(cx - w, cy + w, cx - r, cy);
    b.quadTo(cx - w, cy - w, cx, cy - r);
    b.close();
    return b.build();
  }, [S]);
  const starScale = useDerivedValue(() => [{ translateX: S * 0.8 }, { translateY: S * 0.18 }, { scale: 0.4 + 0.8 * flash.value }, { translateX: -S * 0.8 }, { translateY: -S * 0.18 }]);
  return (
    <Canvas style={{ width: S, height: S }}>
      <Group layer>
        <Image image={image} x={0} y={0} width={S} height={S} fit="contain" />
        <Rect x={0} y={0} width={S} height={S} blendMode="srcATop">
          <LinearGradient start={start} end={end} colors={['rgba(255,255,255,0)', 'rgba(255,250,230,0)', 'rgba(255,252,240,0.85)', 'rgba(255,250,230,0)', 'rgba(255,255,255,0)']} positions={[0, 0.3, 0.5, 0.7, 1]} />
        </Rect>
      </Group>
      <Group opacity={flash} transform={starScale}>
        <Path path={star} color="#FFFFFF">
          <BlurMask blur={2.5} style="solid" />
        </Path>
      </Group>
    </Canvas>
  );
}
