// The light of a big win, drawn on the GPU (Skia, driven on the UI thread by Reanimated): rays of light turning round
// the title with a hot core, embers rising all the time, and on every blow (`pulse`) a shock wave of three rings and a
// storm of embers thrown out from the title. From EFSANE KAZANÇ up lightning strikes towards the title with each blow;
// a JACKPOT also gets a beam of light from above. The look per title is fx/divine-look. A phone that drops frames in
// the first second is given the low ember count. Decoration only, never catching a tap; the web build draws nothing
// (fx/divine-fx.tsx). Shown only with "Oyunlarda güçlü efektler" on and motion not reduced (fx/win-fx, fx/jackpot-show).
import { BlurMask, Canvas, Circle, Fill, Group, LinearGradient, Path, Rect, RoundedRect, Shader, Skia, useClock, usePathValue, vec, type SkPath } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { DIVINE, EMBERS, RISING, SLOTS, emberAt, makeEmbers, makeRising, type DivineLook, type DivineProps } from '@/components/games/fx/divine-look';

// Rays turning both ways round the title, flickering, over a hot core that fades out with distance. Premultiplied.
const LIGHT = Skia.RuntimeEffect.Make(`
uniform float2 res;
uniform float2 center;
uniform float time;
uniform float power;
uniform float3 tint;
uniform float rays;
half4 main(float2 p) {
  float2 d = p - center;
  float r = length(d) / max(res.x, res.y);
  float a = atan(d.y, d.x);
  float s1 = pow(0.5 + 0.5 * sin(a * rays + time * 0.55), 7.0);
  float s2 = pow(0.5 + 0.5 * sin(a * (rays * 0.5 + 3.0) - time * 0.85 + 1.7), 11.0);
  float flick = 0.82 + 0.18 * sin(time * 6.0 + a * 3.0);
  float fall = smoothstep(1.15, 0.04, r);
  float ray = (s1 * 0.75 + s2 * 0.55) * flick * fall;
  float core = exp(-r * r * 38.0) * 1.3 + exp(-r * 8.0) * 0.45;
  float3 hot = float3(1.0, 0.96, 0.86);
  float3 c = clamp(tint * ray + hot * core, 0.0, 1.0);
  float alpha = clamp(ray * 0.85 + core, 0.0, 1.0) * power;
  return half4(half3(c * power), half(alpha));
}
`)!;

const BURST = makeEmbers(EMBERS.high);
const RISE = makeRising(RISING.high);
const COLORS = ['#FFD54A', '#FFF7E0'] as const;

/** A cheap hash 0…1 for the lightning's shape (changes every few frames). */
function hash(n: number) {
  'worklet';
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function DivineFx({ tier, pulse, width: w, height: h, cx, cy }: DivineProps) {
  const look = DIVINE[tier];
  const clock = useClock();
  // When each burst slot was thrown (clock ms; far in the past = none), and the last blow.
  const bursts = useSharedValue<number[]>(Array.from({ length: SLOTS }, () => -1e9));
  const lastBlow = useSharedValue(-1e9);
  const embers = useSharedValue<number>(EMBERS.high);
  const rising = useSharedValue<number>(RISING.high);
  // The first second tells whether this phone keeps up: too many slow frames and the low counts are used.
  const frames = useSharedValue(0);
  const slow = useSharedValue(0);
  useFrameCallback((f) => {
    'worklet';
    if (frames.value > 70) return;
    frames.value += 1;
    if ((f.timeSincePreviousFrame ?? 16) > 26) slow.value += 1;
    if (slow.value > 18) {
      embers.value = EMBERS.low;
      rising.value = RISING.low;
    }
  });

  useEffect(() => {
    if (!pulse) return;
    const now = clock.value;
    const next = bursts.value.slice();
    next[pulse % SLOTS] = now;
    bursts.value = next;
    lastBlow.value = now;
  }, [pulse, clock, bursts, lastBlow]);

  const k = Math.min(w, h) / 400;
  const reach = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));

  const uniforms = useDerivedValue(() => ({
    res: [w, h],
    center: [cx, cy],
    time: clock.value / 1000,
    power: Math.min(1, clock.value / 650) * (0.55 + 0.45 * look.power),
    tint: look.rgb,
    rays: look.rays,
  }));

  // One path per ember colour; "solid" blur draws each ember sharp with its glow round it in one go.
  const stage = { clock, bursts, embers, rising, cx, cy, k, w, h, look };
  const gold = useEmberPath(0, stage);
  const white = useEmberPath(1, stage);
  const tinted = useEmberPath(2, stage);

  // The shock wave of the last blow: a ring in the title's colour, a white one and a gold one, a little apart.
  const waveT = useDerivedValue(() => Math.min(1, Math.max(0, (clock.value - lastBlow.value) / 750)));
  const ring1 = useRing(waveT, reach, 0);
  const ring2 = useRing(waveT, reach, -10);
  const ring3 = useRing(waveT, reach, 9);

  // Lightning: three bolts from the edges to the title, a new shape every 70 ms, while a blow is fresh.
  const bolts = usePathValue((b) => {
    'worklet';
    if (!look.lightning) return;
    const since = clock.value - lastBlow.value;
    if (since < 0 || since > 560) return;
    const seed = Math.floor(clock.value / 70);
    for (let j = 0; j < 3; j += 1) {
      const a = hash(seed + j * 13.7) * Math.PI * 2;
      let x = cx + Math.cos(a) * reach;
      let y = cy + Math.sin(a) * reach;
      const ex = cx + Math.cos(a) * 46 * k;
      const ey = cy + Math.sin(a) * 46 * k;
      const steps = 12;
      const len = Math.hypot(ex - x, ey - y);
      const nx = -(ey - y) / len;
      const ny = (ex - x) / len;
      b.moveTo(x, y);
      for (let i = 1; i <= steps; i += 1) {
        const f = i / steps;
        const jit = i === steps ? 0 : (hash(seed * 3.1 + j * 7 + i) - 0.5) * len * 0.16 * (1 - f * 0.6);
        x = x + (ex - x) / (steps - i + 1) + nx * jit;
        y = y + (ey - y) / (steps - i + 1) + ny * jit;
        b.lineTo(x, y);
      }
    }
  });
  const boltOpacity = useDerivedValue(() => {
    const since = clock.value - lastBlow.value;
    if (since < 0 || since > 560) return 0;
    return (1 - since / 560) * (0.55 + 0.45 * hash(Math.floor(clock.value / 45)));
  });

  // The beam from above on a JACKPOT, breathing.
  const beamW = useDerivedValue(() => w * 0.2 * (1 + 0.12 * Math.sin(clock.value / 260)));
  const beamX = useDerivedValue(() => cx - beamW.value / 2);
  const beamOpacity = useDerivedValue(() => Math.min(1, clock.value / 900) * 0.9);

  const tintPaint = look.tint;
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Fill>
        <Shader source={LIGHT} uniforms={uniforms} />
      </Fill>
      {look.beam && (
        <Group opacity={beamOpacity}>
          <Rect x={beamX} y={0} width={beamW} height={cy}>
            <LinearGradient start={vec(0, 0)} end={vec(0, cy)} colors={['rgba(255,248,214,0.95)', 'rgba(255,214,110,0.45)', 'rgba(255,214,110,0)']} />
            <BlurMask blur={16} style="normal" />
          </Rect>
        </Group>
      )}
      {[ring1, ring2, ring3].map((g, i) => (
        <Circle key={i} cx={cx} cy={cy} r={g.r} style="stroke" strokeWidth={g.width} opacity={g.opacity} color={i === 0 ? tintPaint : i === 1 ? '#FFFFFF' : '#FFD54A'}>
          <BlurMask blur={5} style="normal" />
        </Circle>
      ))}
      {look.lightning && (
        <Group opacity={boltOpacity}>
          <Path path={bolts} style="stroke" strokeWidth={7} strokeJoin="round" color={tintPaint} opacity={0.6}>
            <BlurMask blur={12} style="normal" />
          </Path>
          <Path path={bolts} style="stroke" strokeWidth={2.2} strokeJoin="round" color="#FFFFFF">
            <BlurMask blur={3} style="solid" />
          </Path>
        </Group>
      )}
      {[gold, white, tinted].map((p, c) => (
        <Path key={c} path={p} color={c === 2 ? tintPaint : COLORS[c]}>
          <BlurMask blur={5} style="solid" />
        </Path>
      ))}
    </Canvas>
  );
}

type Stage = {
  clock: SharedValue<number>;
  bursts: SharedValue<number[]>;
  embers: SharedValue<number>;
  rising: SharedValue<number>;
  cx: number;
  cy: number;
  k: number;
  w: number;
  h: number;
  look: DivineLook;
};

/** The embers of one colour (0 gold, 1 white-hot, 2 the title's): every live burst's, and the rising ones (not tinted). */
function useEmberPath(c: number, { clock, bursts, embers, rising, cx, cy, k, w, h, look }: Stage): SharedValue<SkPath> {
  return usePathValue((b) => {
    'worklet';
    const t = clock.value;
    const n = embers.value;
    for (let i = 0; i < n; i += 1) {
      const e = BURST[i];
      if (e.color !== c) continue;
      const p = emberAt(e, t - bursts.value[i % SLOTS], cx, cy, k, look.power);
      if (p && p.r > 0.2) b.addCircle(p.x, p.y, p.r);
    }
    if (c === 2) return;
    const m = rising.value;
    for (let i = 0; i < m; i += 1) {
      const e = RISE[i];
      if (e.color !== c) continue;
      const u = (t / e.period + e.phase) % 1;
      const r = e.size * Math.max(0.8, k) * Math.sin(u * Math.PI);
      if (r > 0.2) b.addCircle(e.x * w + Math.sin(t / 700 + e.phase * 6.28) * e.sway, h * (1.04 - u * 1.15), r);
    }
  });
}

/** One ring of the shock wave, `lead` px ahead of (or behind) the others. */
function useRing(waveT: SharedValue<number>, reach: number, lead: number) {
  const r = useDerivedValue(() => 18 + (1 - Math.pow(1 - waveT.value, 3)) * reach * 0.95 + lead);
  const width = useDerivedValue(() => 16 * (1 - waveT.value) + 1.5);
  const opacity = useDerivedValue(() => (waveT.value >= 1 ? 0 : 0.9 * (1 - waveT.value)));
  return { r, width, opacity };
}

/**
 * A reel the game is waiting for (a JACKPOT or a scatter prize hangs on it): its frame glows and breathes, two lights
 * run round it and sparks rise inside, until it stops.
 */
export function TeaseAura() {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setBox({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {box.w > 0 && <Aura w={box.w} h={box.h} />}
    </View>
  );
}

function Aura({ w, h }: { w: number; h: number }) {
  const clock = useClock();
  const sparks = useMemo(() => makeRising(14, 23), []);
  const breath = useDerivedValue(() => 0.55 + 0.45 * Math.sin(clock.value / 140));
  const perimeter = 2 * (w + h);
  // A point `u` (0…1) of the way round the frame, clockwise from the top-left.
  const lights = usePathValue((b) => {
    'worklet';
    for (let j = 0; j < 2; j += 1) {
      for (let i = 0; i < 7; i += 1) {
        const u = (((clock.value / 900 + j * 0.5 - i * 0.012) % 1) + 1) % 1;
        let d = u * perimeter;
        let x = 2;
        let y = h - (d - 2 * w - h);
        if (d < w) {
          x = d;
          y = 2;
        } else if ((d -= w) < h) {
          x = w - 2;
          y = d;
        } else if ((d -= h) < w) {
          x = w - d;
          y = h - 2;
        }
        b.addCircle(x, y, 5 - i * 0.6);
      }
    }
  });
  const rise = usePathValue((b) => {
    'worklet';
    for (let i = 0; i < sparks.length; i += 1) {
      const e = sparks[i];
      const u = (clock.value / (e.period * 0.45) + e.phase) % 1;
      const r = e.size * 1.3 * Math.sin(u * Math.PI);
      if (r > 0.2) b.addCircle(8 + e.x * (w - 16), h * (1 - u), r);
    }
  });
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Group opacity={breath}>
        <RoundedRect x={2} y={2} width={w - 4} height={h - 4} r={8} style="stroke" strokeWidth={4} color="#FFC94A">
          <BlurMask blur={8} style="solid" />
        </RoundedRect>
      </Group>
      <Path path={rise} color="#FFE7A3">
        <BlurMask blur={3} style="solid" />
      </Path>
      <Path path={lights} color="#FFFFFF">
        <BlurMask blur={6} style="solid" />
      </Path>
    </Canvas>
  );
}
