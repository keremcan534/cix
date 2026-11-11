// A prize wheel's motion, shared by Gece Yarısı Çarkı (components/games/board) and Rüzgâr Gülü (components/games/
// wheel). The slice is known before the wheel moves: `spinTo(slice)` only shows it. The wheel is pulled back a
// little, let go, and slows over the last turns (fx/spin-plan); every peg that passes bends the pointer and ticks,
// the rim's bulbs take turns with the slices, and the slices blur while they are too fast to read. Two native-driven
// values run a spin: the angle, and the time of the spin (how hard the pointer rattles, the blur). No state changes
// while it turns; the ticks come from a timer set by the plan, not from the frames.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { PEG_FREE, PEG_PEAK, PEG_TOUCH, planSpin, restAngle } from '@/components/games/fx/spin-plan';
import { playSfx } from '@/lib/game-sound';
import { pressHaptic, tapHaptic } from '@/lib/haptics';
import { useSettings } from '@/store';

/** Resting angles are kept within one turn above this, so the pull back never goes below zero. */
const REST = 720;
const mod = (a: number, n: number) => ((a % n) + n) % n;

export type WheelSpin = ReturnType<typeof useWheelSpin>;

export function useWheelSpin(slices: number) {
  const { reduceMotion } = useSettings();
  const step = 360 / slices;
  const [angle] = useState(() => new Animated.Value(REST));
  // The time of a spin, 0 → 1; 1 while the wheel rests.
  const [phase] = useState(() => new Animated.Value(1));
  // The landing: 0 → 1 once the wheel has stopped, back to 0 when it is let go again.
  const [glow] = useState(() => new Animated.Value(0));
  const at = useRef(REST);
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const still = useRef(reduceMotion);
  useEffect(() => {
    still.current = reduceMotion;
  });
  useEffect(
    () => () => {
      anim.current?.stop();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const look = useMemo(() => {
    const clamp = { extrapolate: 'clamp' as const };
    // Where the wheel is within one slice: the peg between two slices passes the pointer halfway.
    const place = Animated.modulo(angle, step);
    const peg = place.interpolate({ inputRange: [0, PEG_TOUCH * step, PEG_PEAK * step, PEG_FREE * step, step], outputRange: [0, 0, 1, 0, 0] });
    // At full speed the pegs come faster than the pointer can spring back: it stays bent and only rattles. As
    // the wheel slows it swings freely, peg by peg.
    const swing = phase.interpolate({ inputRange: [0, 0.36, 0.66, 1], outputRange: [0.28, 0.28, 1, 1] });
    const bent = phase.interpolate({ inputRange: [0, 0.07, 0.13, 0.4, 0.62, 1], outputRange: [0, 0, 0.62, 0.62, 0, 0] });
    const pointer = Animated.add(Animated.multiply(peg, swing), bent).interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-27deg'] });
    // The rim's bulbs: two sets that swap at every peg. At speed both stay lit (a swap every frame would only
    // flicker); the swapping shows as the wheel slows.
    const pair = Animated.modulo(angle, 2 * step);
    const e = 0.04 * step;
    const edges = [0, step / 2 - e, step / 2 + e, 1.5 * step - e, 1.5 * step + e, 2 * step];
    const apart = phase.interpolate({ inputRange: [0, 0.42, 0.7, 1], outputRange: [0, 0, 1, 1] });
    const dimmed = (off: number[]) => Animated.multiply(apart, pair.interpolate({ inputRange: edges, outputRange: off })).interpolate({ inputRange: [0, 1], outputRange: [1, 0.26] });
    return {
      /** For the disc. */
      rotate: angle.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }),
      /** For WheelPointer. */
      pointer,
      /** For RimBulbs: the opacity of the even and the odd bulbs. */
      bulbsA: dimmed([0, 0, 1, 1, 0, 0]),
      bulbsB: dimmed([1, 1, 0, 0, 1, 1]),
      /** 1 while the slices pass too fast to be read: a soft ring over them, gone when the wheel has slowed. */
      blur: phase.interpolate({ inputRange: [0, 0.08, 0.17, 0.4, 0.6, 1], outputRange: [0, 0, 1, 1, 0, 0], ...clamp }),
      /** Streaks over the blur turn at a tenth of the wheel's speed: slow enough for the eye to follow. */
      drift: angle.interpolate({ inputRange: [0, 3600], outputRange: ['0deg', '360deg'] }),
      /** Three beats of light on the slice the wheel stopped at, then it stays lit. */
      shine: glow.interpolate({ inputRange: [0, 0.12, 0.28, 0.44, 0.6, 0.78, 1], outputRange: [0, 1, 0.3, 1, 0.3, 1, 0.7], ...clamp }),
    };
  }, [angle, phase, glow, step]);

  /** Turns the wheel to `slice` and resolves when it rests there (also when the screen closes meanwhile). */
  const spinTo = useCallback(
    (slice: number, o: { turns?: number; ms?: number } = {}) =>
      new Promise<void>((resolve) => {
        anim.current?.stop();
        if (timer.current) clearTimeout(timer.current);
        // The same place on the wheel, counted from near zero again: the numbers stay small however long it is played.
        const from = mod(at.current, 360) + REST;
        angle.setValue(from);
        glow.setValue(0);
        const landed = (to: number) => (r: { finished: boolean }) => {
          if (timer.current) clearTimeout(timer.current);
          at.current = to;
          if (r.finished) {
            playSfx('stop', 0.8);
            pressHaptic();
            Animated.timing(glow, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: true }).start();
          }
          resolve();
        };
        if (still.current) {
          // "Animasyonları azalt": no turns, the wheel goes the short way round to its slice.
          const to = from + mod(restAngle(slice, slices, 0.08) - from, 360);
          anim.current = Animated.timing(angle, { toValue: to, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true });
          anim.current.start(landed(to));
          return;
        }
        const plan = planSpin({ from, slice, slices, turns: o.turns ?? 4, ms: o.ms ?? 4200 });
        phase.setValue(0);
        anim.current = Animated.parallel([
          Animated.timing(angle, { toValue: plan.to, duration: plan.ms, easing: plan.ease, useNativeDriver: true }),
          Animated.timing(phase, { toValue: 1, duration: plan.ms, easing: Easing.linear, useNativeDriver: true }),
        ]);
        // The whoosh when the wheel is let go, then a tick for each peg, timed by the plan.
        const t0 = Date.now();
        let i = -1;
        const next = () => {
          const due = i < 0 ? plan.launchAt : plan.ticks[i]?.at;
          if (due === undefined) return;
          timer.current = setTimeout(
            () => {
              if (i < 0) playSfx('spin', 0.6);
              else {
                playSfx('tick', plan.ticks[i].gain);
                if (plan.ticks[i].feel) tapHaptic();
              }
              i++;
              // A tick already late by more than a beat is dropped rather than played in a burst.
              const now = Date.now() - t0;
              while (i < plan.ticks.length - 1 && plan.ticks[i].at < now - 45) i++;
              next();
            },
            Math.max(0, due - (Date.now() - t0)),
          );
        };
        next();
        anim.current.start(landed(plan.to));
      }),
    [angle, phase, glow, slices],
  );

  return { ...look, spinTo };
}

/**
 * The pointer over the wheel's top: a flap on a pin that every passing peg bends. The box's middle is the pin, so
 * turning the box swings the flap about it (no transform origin needed). Place the box's middle where the pin goes.
 */
export function WheelPointer({ spin, size = 30, color = '#FF6576', pin = '#FFE7B0' }: { spin: WheelSpin; size?: number; color?: string; pin?: string }) {
  const half = Math.round(size * 0.36);
  return (
    <Animated.View style={{ width: size, height: size * 2, transform: [{ rotate: spin.pointer }] }} pointerEvents="none">
      <View style={[w.flap, { left: size / 2 - half - 2, top: size - 6, borderLeftWidth: half + 2, borderRightWidth: half + 2, borderTopWidth: size + 3, borderTopColor: 'rgba(0,0,0,0.35)' }]} />
      <View style={[w.flap, { left: size / 2 - half, top: size - 4, borderLeftWidth: half, borderRightWidth: half, borderTopWidth: size, borderTopColor: color }]} />
      <View style={[w.pin, { left: size / 2 - 7, top: size - 7, backgroundColor: pin }]} />
    </Animated.View>
  );
}

/**
 * Bulbs round the rim of a box `size` wide: every other one belongs to the other set, and the two sets take turns
 * as the slices pass (useWheelSpin). Fill the rim's own box with it.
 */
export function RimBulbs({ spin, size, count = 24, bulb = 7, inset = 4, color = '#FFE7B0' }: { spin: WheelSpin; size: number; count?: number; bulb?: number; inset?: number; color?: string }) {
  const set = (odd: number) =>
    Array.from({ length: Math.floor(count / 2) }, (_, k) => (
      <View key={k} style={[w.arm, { left: size / 2 - 6, height: size, transform: [{ rotate: `${(360 / count) * (2 * k + odd)}deg` }] }]}>
        <View style={{ width: bulb, height: bulb, borderRadius: bulb / 2, marginTop: inset, backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
      </View>
    ));
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: spin.bulbsA }]} pointerEvents="none">
        {set(0)}
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: spin.bulbsB }]} pointerEvents="none">
        {set(1)}
      </Animated.View>
    </>
  );
}

/**
 * The blur of a wheel at speed, over a disc `size` wide: a soft band where the slices' pictures are, and a few
 * streaks drifting round. Put it over the disc, inside whatever clips the disc round.
 */
export function SpinBlur({ spin, size, band, tint = 'rgba(255,255,255,0.16)' }: { spin: WheelSpin; size: number; /** How wide the band of pictures is, from the rim inwards (px). */ band: number; tint?: string }) {
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: spin.blur }]} pointerEvents="none">
      <View style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, borderRadius: size / 2, borderWidth: band, borderColor: tint }} />
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: spin.drift }] }]}>
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <View key={k} style={[w.arm, { left: size / 2 - 6, height: size, transform: [{ rotate: `${k * 60 + (k % 2) * 11}deg` }] }]}>
            <View style={{ width: 3 + (k % 3), height: band * 0.7, marginTop: band * 0.15, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)' }} />
          </View>
        ))}
      </Animated.View>
    </Animated.View>
  );
}

const w = StyleSheet.create({
  flap: { position: 'absolute', width: 0, height: 0, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  pin: { position: 'absolute', width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: 'rgba(0,0,0,0.35)' },
  arm: { position: 'absolute', top: 0, width: 12, alignItems: 'center' },
});
