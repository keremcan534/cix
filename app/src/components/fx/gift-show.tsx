// Full-screen show for a big gift (data/gift-shows.ts): the room dims, light rays turn behind a stage,
// the stage enters from its side, each picture part runs its own loop (wings flap, wheels spin, flames
// flicker), sparkles drift, a banner names who sent it to whom, then everything leaves.
// Parts come from SHOW_PARTS; a gift whose parts are not all delivered plays its 512 px picture instead.
// Transform/opacity only, native driver, never takes touches. Callers skip it when effects are off or
// motion is reduced; `lite` (low data) halves the sparkles and drops the rays.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Text } from '@/components/text';
import { giftArtOf } from '@/components/GiftArt';
import { SHOW_PARTS } from '@/components/fx/gift-show-art';
import { partFile, showFiles, type GiftShow, type ShowPart, type Sparkle } from '@/data/gift-shows';
import type { Gift } from '@/data/mock';
import { colors, semantic } from '@/theme';

export type GiftShowPlay = { key: string; gift: Gift; fromName: string; toText: string; count: number };

const IN = 0.14;
const OUT = 0.82;
const BEAT_MS = 1600;
const SPIN_MS = 5200;

/** Every part delivered → layered stage; otherwise null (single picture). */
export const showPartsReady = (show: GiftShow, parts: Record<string, number> = SHOW_PARTS) => showFiles(show).every((f) => parts[f] !== undefined);

const FALLBACK: ShowPart = { part: '', draw: '', motion: 'float', x: 0.5, y: 0.5, size: 0.8 };

/** A smooth wave over a 0..1 loop: `cycles` periods, shifted by `phase`, scaled by `amp`. */
function wave(v: Animated.Value, amp: number, phase = 0, cycles = 1) {
  const n = 8 * cycles;
  const inputRange = Array.from({ length: n + 1 }, (_, k) => k / n);
  const outputRange = inputRange.map((k) => Math.sin(2 * Math.PI * (k * cycles + phase)) * amp);
  return v.interpolate({ inputRange, outputRange });
}
const deg = (v: Animated.AnimatedInterpolation<number>) => v.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] });

export function GiftShowFx({ show, play, lite, onDone }: { show: GiftShow; play: GiftShowPlay; lite?: boolean; onDone: () => void }) {
  const screen = useWindowDimensions();
  const S = Math.round(Math.min(screen.width * 0.92, 440, screen.height * 0.56));
  const cx = screen.width / 2;
  const cy = screen.height * 0.44;
  const [t] = useState(() => new Animated.Value(0));
  const [beat] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const main = Animated.timing(t, { toValue: 1, duration: show.durationMs, easing: Easing.linear, useNativeDriver: true });
    const loops = [
      Animated.loop(Animated.timing(beat, { toValue: 1, duration: BEAT_MS, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: SPIN_MS, easing: Easing.linear, useNativeDriver: true })),
    ];
    loops.forEach((l) => l.start());
    main.start(() => done.current());
    return () => {
      main.stop();
      loops.forEach((l) => l.stop());
    };
  }, [t, beat, spin, show.durationMs]);

  const layered = showPartsReady(show);
  const art = giftArtOf(show.giftId);
  const parts = layered ? show.parts : [FALLBACK];

  const span = [0, IN, OUT, 1];
  const fade = t.interpolate({ inputRange: span, outputRange: [0, 1, 1, 0] });
  const W = screen.width;
  const H = screen.height;
  const enter: Record<GiftShow['enter'], { tx: number[]; ty: number[]; sc: number[] }> = {
    rise: { tx: [0, 0, 0, 0], ty: [H * 0.6, 0, 0, -H * 0.5], sc: [0.8, 1, 1, 0.9] },
    drop: { tx: [0, 0, 0, 0], ty: [-H * 0.6, 0, 0, H * 0.3], sc: [0.8, 1, 1, 0.9] },
    left: { tx: [-W, 0, 0, W], ty: [40, 0, 0, -40], sc: [0.9, 1, 1, 0.9] },
    right: { tx: [W, 0, 0, -W], ty: [40, 0, 0, -40], sc: [0.9, 1, 1, 0.9] },
    zoom: { tx: [0, 0, 0, 0], ty: [60, 0, 0, -30], sc: [0.15, 1, 1, 1.3] },
  };
  const e = enter[show.enter];
  // Easing on the entrance: overshoot a touch, then settle.
  const stageIn = t.interpolate({ inputRange: [0, IN * 0.7, IN, OUT, 1], outputRange: [0, 1.04, 1, 1, 2], extrapolate: 'clamp' });
  const at = (vals: number[]) => stageIn.interpolate({ inputRange: [0, 1, 1.04, 2], outputRange: [vals[0], vals[1], vals[1], vals[3]] });
  const stageScale = stageIn.interpolate({ inputRange: [0, 1, 1.04, 2], outputRange: [e.sc[0], 1, 1.04, e.sc[3]] });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityLabel={`${play.fromName}, ${play.toText} ${play.gift.name} gönderdi`}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#020814', opacity: t.interpolate({ inputRange: span, outputRange: [0, 0.62, 0.62, 0] }) }]} />

      {/* Glow and turning light rays behind the stage. */}
      <Animated.View style={{ position: 'absolute', left: cx - S * 0.75, top: cy - S * 0.75, width: S * 1.5, height: S * 1.5, alignItems: 'center', justifyContent: 'center', opacity: fade }}>
        {/* Many faint discs stacked read as a soft glow without a blur filter. */}
        {[1.5, 1.32, 1.16, 1.0, 0.86, 0.72, 0.58].map((r, i) => (
          <View key={i} style={{ position: 'absolute', width: S * r, height: S * r, borderRadius: (S * r) / 2, backgroundColor: show.glow, opacity: 0.035 }} />
        ))}
        {!lite && (
          <Animated.View style={{ position: 'absolute', width: S * 1.5, height: S * 1.5, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) }] }}>
            {Array.from({ length: 6 }, (_, i) => (
              <LinearGradient
                key={i}
                colors={['transparent', `${show.glow}55`, 'transparent']}
                style={{ position: 'absolute', width: 14, height: S * 1.5, borderRadius: 7, transform: [{ rotate: `${i * 30}deg` }] }}
              />
            ))}
          </Animated.View>
        )}
      </Animated.View>

      <Sparkles kind={show.sparkle} color={show.glow} count={lite ? 10 : 22} t={t} screen={screen} />

      {/* The stage. */}
      <Animated.View
        style={{
          position: 'absolute',
          left: cx - S / 2,
          top: cy - S / 2,
          width: S,
          height: S,
          opacity: fade,
          transform: [{ translateX: at(e.tx) }, { translateY: at(e.ty) }, { scale: stageScale }],
        }}
      >
        {parts.map((p, i) => (
          <Part key={i} part={p} S={S} t={t} beat={beat} spin={spin}>
            {layered ? (
              <Image source={SHOW_PARTS[partFile(show, p.part)]} style={[{ width: p.size * S, height: p.size * S }, p.mirror && { transform: [{ scaleX: -1 }] }]} resizeMode="contain" />
            ) : art ? (
              <Image source={art.lg} style={{ width: p.size * S, height: p.size * S }} resizeMode="contain" />
            ) : (
              <Text style={{ fontSize: p.size * S * 0.7, lineHeight: p.size * S }}>{play.gift.emoji}</Text>
            )}
          </Part>
        ))}
      </Animated.View>

      {/* Who sent it. */}
      <Animated.View
        style={[
          st.banner,
          {
            top: cy + S / 2 + 8,
            opacity: t.interpolate({ inputRange: [0, IN + 0.04, IN + 0.1, OUT, 1], outputRange: [0, 0, 1, 1, 0] }),
            transform: [{ translateY: t.interpolate({ inputRange: [0, IN + 0.04, IN + 0.12, 1], outputRange: [16, 16, 0, 0] }) }],
          },
        ]}
      >
        <LinearGradient colors={['rgba(246,189,96,0.28)', 'rgba(12,22,40,0.85)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={st.bannerInner}>
          <Text style={st.who} numberOfLines={1}>
            {play.fromName}
            <Text style={st.arrow}>{'  →  '}</Text>
            {play.toText}
          </Text>
          <Text style={st.what} numberOfLines={1}>
            {play.gift.name}
            {play.count > 1 ? `  ×${play.count}` : ''}
          </Text>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

function Part({ part: p, S, t, beat, spin, children }: { part: ShowPart; S: number; t: Animated.Value; beat: Animated.Value; spin: Animated.Value; children: React.ReactNode }) {
  const size = p.size * S;
  const ph = p.phase ?? 0;
  const sign = p.mirror ? -1 : 1;
  const px = (p.pivot?.x ?? 0) * size;
  const py = (p.pivot?.y ?? 0) * size;
  const around = (rotate: Animated.AnimatedInterpolation<string>) => [{ translateX: px }, { translateY: py }, { rotate }, { translateX: -px }, { translateY: -py }];

  let transform: object[] = [];
  let opacity: unknown = 1;
  switch (p.motion) {
    case 'float':
      transform = [{ translateY: wave(beat, S * 0.02, ph) }];
      break;
    case 'flap':
      transform = around(deg(wave(beat, 16 * sign, ph, 2)));
      break;
    case 'sway':
      transform = around(deg(wave(beat, 5, ph)));
      break;
    case 'spin':
      transform = [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: [`${ph * 360}deg`, `${ph * 360 + 360 * 2}deg`] }) }];
      break;
    case 'pulse':
      transform = [{ scale: Animated.add(1, wave(beat, 0.06, ph)) }];
      opacity = Animated.add(0.85, wave(beat, 0.15, ph));
      break;
    case 'flicker':
      transform = [{ translateY: py }, { scaleY: Animated.add(1, wave(beat, 0.12, ph, 6)) }, { translateY: -py }, { scaleX: Animated.add(1, wave(beat, 0.05, ph + 0.3, 5)) }];
      break;
    case 'drift':
      transform = [{ translateX: wave(beat, S * 0.04, ph) }];
      break;
    case 'open': {
      const open = t.interpolate({ inputRange: [0, IN, IN + 0.18, 1], outputRange: [0.05, 0.05, 1, 1], extrapolate: 'clamp' });
      transform = [{ translateY: py }, { scale: Animated.add(open, wave(beat, 0.02, ph)) }, { translateY: -py }];
      break;
    }
    case 'orbit': {
      const steps = 16;
      const r = S * 0.4;
      const ang = Array.from({ length: steps + 1 }, (_, k) => (ph + k / steps) * Math.PI * 2);
      const input = ang.map((_, k) => k / steps);
      transform = [
        { translateX: spin.interpolate({ inputRange: input, outputRange: ang.map((a) => Math.cos(a) * r) }) },
        { translateY: spin.interpolate({ inputRange: input, outputRange: ang.map((a) => Math.sin(a) * r * 0.45) }) },
      ];
      break;
    }
    case 'still':
      break;
  }
  return (
    <Animated.View style={{ position: 'absolute', left: p.x * S - size / 2, top: p.y * S - size / 2, width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity: opacity as number, transform: transform as never }}>
      {children}
    </Animated.View>
  );
}

type Dot = { x: number; y: number; size: number; delay: number; drift: number };

/** Light specks only (dots, rings, soft ovals): motion, not pictures. */
function Sparkles({ kind, color, count, t, screen }: { kind: Sparkle; color: string; count: number; t: Animated.Value; screen: { width: number; height: number } }) {
  const [dots] = useState<Dot[]>(() =>
    Array.from({ length: count }, (_, i) => ({
      x: Math.random() * screen.width,
      y: screen.height * (0.15 + Math.random() * 0.7),
      size: 3 + Math.random() * (kind === 'bubbles' ? 10 : kind === 'petals' ? 8 : 5),
      delay: IN * 0.5 + (i / count) * 0.5,
      drift: (Math.random() - 0.5) * 60,
    })),
  );
  const falls = kind === 'petals';
  return (
    <>
      {dots.map((d, i) => {
        const end = Math.min(1, d.delay + 0.35);
        const lt = t.interpolate({ inputRange: [0, d.delay, end, 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' });
        const shape =
          kind === 'bubbles'
            ? { borderWidth: 1.5, borderColor: color, backgroundColor: 'rgba(255,255,255,0.08)' }
            : kind === 'petals'
              ? { backgroundColor: i % 2 ? '#FFFFFF' : colors.pink, borderRadius: d.size, height: d.size * 0.6 }
              : { backgroundColor: i % 3 ? color : '#FFFFFF' };
        return (
          <Animated.View
            key={i}
            style={[
              { position: 'absolute', left: d.x, top: d.y, width: d.size, height: d.size, borderRadius: d.size / 2 },
              shape,
              {
                opacity: lt.interpolate({ inputRange: [0, 0.2, 0.7, 1], outputRange: [0, 1, 0.8, 0] }),
                transform: [
                  { translateY: lt.interpolate({ inputRange: [0, 1], outputRange: [0, falls ? 120 : -110] }) },
                  { translateX: lt.interpolate({ inputRange: [0, 1], outputRange: [0, d.drift] }) },
                  { scale: kind === 'stars' ? lt.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: [0.4, 1.4, 0.8, 1.2] }) : 1 },
                  { rotate: falls ? lt.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${d.drift * 4}deg`] }) : '0deg' },
                ],
              },
            ]}
          />
        );
      })}
    </>
  );
}

const st = StyleSheet.create({
  banner: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  bannerInner: { borderRadius: 18, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: semantic.money, maxWidth: 420, minWidth: 220 },
  who: { color: '#fff', fontSize: 14, fontWeight: '800' },
  arrow: { color: colors.gold, fontWeight: '900' },
  what: { color: colors.gold, fontSize: 18, fontWeight: '900', marginTop: 2 },
});
