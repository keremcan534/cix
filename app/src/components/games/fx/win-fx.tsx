// The moment a round pays. A small win throws a few coins and floats its amount; from five stakes up the stage dims,
// light turns behind the title, sparkles twinkle round it and the amount counts up on its plate. Every blow (the
// start, each step up the title, the amount landing) shakes the show, punches it in, flashes, sends rings and light
// streaks out and bursts coins from the middle, harder as the title climbs (BÜYÜK → DEV → EFSANE KAZANÇ, lib/win-tier
// winStageAt); an EFSANE KAZANÇ and a JACKPOT add fireworks, and the phone trembles with them. A climbing win builds
// up (a hit and a rising tone while it counts, the plate shivering), steps up with a fanfare and lands on the big
// win's jingle. A game shows it with `const win = useWinFx()`, draws `win.layer` last inside its root view and awaits
// `win.celebrate(…)` after the reels or the wheel have stopped, so Oto waits for the celebration. A tap ends a big one
// early. "Animasyonları azalt" keeps it still (no count, no coins); "Efektleri kapat" keeps the light and the coins
// but no flash, rings, bursts, sparkles, fireworks or shaking. Decoration only: the round is settled before any of
// this, and nothing here touches the balance.
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Shine } from '@/components/fx/surface';
import { Coins } from '@/components/games/fx/coins';
import { salonArt } from '@/components/games/fx/salon-art';
import { Text } from '@/components/text';
import { playSfx } from '@/lib/game-sound';
import { heavyHaptic, pressHaptic, rumbleHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { rollAt } from '@/lib/motion';
import { WIN_SHOW, WIN_TITLE, winStageAt, winTierOf, type WinTier } from '@/lib/win-tier';
import { useSettings } from '@/store';

const fmt = (n: number) => Math.floor(n).toLocaleString('tr-TR');
/**
 * How far a count has come at `t` (0…1). A win that climbs titles counts evenly for most of the way, so each title
 * is seen for a while, and slows only at the end; the others ease out from the start (lib/motion rollAt).
 */
const climbAt = (amount: number, t: number) => Math.round(amount * (t < 0.8 ? (t / 0.8) * 0.85 : 0.85 + 0.15 * (1 - (1 - (t - 0.8) / 0.2) ** 3)));

export type WinShow = {
  amount: number;
  bet: number;
  jackpot?: boolean;
  /** Instead of the tier's own title (e.g. "GRAND"). */
  title?: string;
  /** At most the small celebration: a game that shows its big wins with its own pictures (fx/jackpot-show). */
  smallOnly?: boolean;
};
export type Celebrate = (w: WinShow) => Promise<void>;

type BigTier = Exclude<WinTier, 'small'>;
/** The ribbon and the light, per tier. */
const LOOK: Record<BigTier, { ribbon: [string, string]; ink: string; ray: string }> = {
  big: { ribbon: ['#F59E0B', '#B45309'], ink: '#FFF7D6', ray: 'rgba(253,224,71,0.55)' },
  mega: { ribbon: ['#F97316', '#BE123C'], ink: '#FFF1E0', ray: 'rgba(251,146,60,0.6)' },
  epic: { ribbon: ['#13D9DF', '#0A5F7A'], ink: '#F0FEFF', ray: 'rgba(111,241,245,0.6)' },
  jackpot: { ribbon: ['#FACC15', '#DC2626'], ink: '#FFFBEB', ray: 'rgba(254,240,138,0.75)' },
};
/** How far a full blow shakes the show, per title (px). */
const QUAKE: Record<BigTier, number> = { big: 5, mega: 8, epic: 12, jackpot: 14 };
const RAYS = 14;
/** The light streaks a blow throws out from the title. */
const STREAKS = 16;
const SPARKLE = salonArt('parilti');
/**
 * Where the sparkles twinkle round the title (from the stage's middle, as parts of its width and height), when in
 * the twinkle each lights (0.02…0.68) and how big.
 */
const SPARKLES = [
  { x: -0.36, y: -0.16, at: 0.02, size: 26 },
  { x: 0.34, y: -0.2, at: 0.22, size: 20 },
  { x: -0.28, y: 0.14, at: 0.45, size: 18 },
  { x: 0.3, y: 0.12, at: 0.12, size: 24 },
  { x: -0.06, y: -0.26, at: 0.6, size: 16 },
  { x: 0.12, y: 0.24, at: 0.34, size: 18 },
  { x: -0.4, y: 0, at: 0.52, size: 14 },
  { x: 0.42, y: -0.04, at: 0.68, size: 16 },
] as const;
/** The fireworks of an EFSANE KAZANÇ and a JACKPOT: where (parts of the stage), when (ms) and in what colour. */
const FIREWORKS = [
  { x: 0.2, y: 0.17, at: 0, color: '#FFD54A' },
  { x: 0.8, y: 0.14, at: 380, color: '#6FF1F5' },
  { x: 0.5, y: 0.07, at: 760, color: '#FF7AB6' },
  { x: 0.17, y: 0.76, at: 1140, color: '#FFF3C4' },
  { x: 0.83, y: 0.73, at: 1520, color: '#FFA94D' },
] as const;
/** Sparks in one firework. */
const SPARKS = 12;
/** The stage's middle the title stands on, as a part of its height. */
const MIDDLE = 0.46;

export function useWinFx(): { celebrate: Celebrate; layer: ReactNode } {
  const [show, setShow] = useState<{ id: number; tier: WinTier; win: WinShow } | null>(null);
  const waiting = useRef<(() => void) | null>(null);
  const n = useRef(0);
  const celebrate = useCallback<Celebrate>(
    (w) =>
      new Promise<void>((resolve) => {
        const found = winTierOf(w.amount, w.bet, w.jackpot);
        if (!found) return resolve();
        const tier = w.smallOnly ? 'small' : found;
        // A celebration still up gives way; whoever waited for it goes on.
        waiting.current?.();
        waiting.current = resolve;
        setShow({ id: ++n.current, tier, win: w });
      }),
    [],
  );
  const done = useCallback(() => {
    setShow(null);
    waiting.current?.();
    waiting.current = null;
  }, []);
  // The screen closed mid-celebration: nobody is left waiting.
  useEffect(() => () => waiting.current?.(), []);
  return { celebrate, layer: show ? <WinCelebration key={show.id} {...show.win} tier={show.tier} onDone={done} /> : null };
}

function WinCelebration({ amount, bet, tier, title, onDone }: WinShow & { tier: WinTier; onDone: () => void }) {
  const { reduceMotion, effectsOff } = useSettings();
  const small = tier === 'small';
  // The flourishes on top of the light and the coins: flash, rings, bursts, sparkles, fireworks, shaking.
  const lively = !small && !reduceMotion && !effectsOff;
  // A win that steps up its title while it counts: it builds up, and its jingle comes when the amount lands.
  const climbs = !small && !title && !reduceMotion && (tier === 'mega' || tier === 'epic');
  const ms = reduceMotion && !small ? Math.min(1400, WIN_SHOW[tier].ms) : WIN_SHOW[tier].ms;
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [inV] = useState(() => new Animated.Value(0));
  const [out] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(1));
  const [flash] = useState(() => new Animated.Value(0));
  const [wave] = useState(() => new Animated.Value(1));
  const [slam] = useState(() => new Animated.Value(0));
  const [shakeX] = useState(() => new Animated.Value(0));
  const [shakeY] = useState(() => new Animated.Value(0));
  const [punch] = useState(() => new Animated.Value(1));
  const [streak] = useState(() => new Animated.Value(1));
  const [shiver] = useState(() => new Animated.Value(0));
  const [twinkle] = useState(() => new Animated.Value(0));
  // Each blow's coin burst (the first comes with the show); a new key throws a new one.
  const [burst, setBurst] = useState(() => (lively ? 1 : 0));
  const [count, setCount] = useState(small || reduceMotion ? amount : 0);
  const done = useRef(onDone);
  const closing = useRef(false);
  useEffect(() => {
    done.current = onDone;
  });
  // The title climbs with the amount on show unless the game named it (JACKPOT, GRAND) or it can't count.
  const stage = !small && !title && !reduceMotion ? winStageAt(count, bet, tier) : tier;
  const big: BigTier = stage === 'small' ? 'big' : stage;

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setCount(amount);
    Animated.timing(out, { toValue: 1, duration: 240, useNativeDriver: true }).start(() => done.current());
  }, [amount, out]);

  /**
   * A blow, `strength` 0…1, as hard as the title `at` is: the title pops, the show punches in and shakes, the stage
   * flashes, rings and light streaks go out from the title. (Its coin burst is a new `burst` key.)
   */
  const blow = useCallback(
    (strength: number, at: BigTier) => {
      if (!lively) return;
      pop.setValue(1 + 0.4 * strength);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
      punch.setValue(1 + 0.07 * strength);
      Animated.spring(punch, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }).start();
      wave.setValue(0);
      Animated.timing(wave, { toValue: 1, duration: 750, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      streak.setValue(0);
      Animated.timing(streak, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      flash.setValue(0.3 + 0.45 * strength);
      Animated.timing(flash, { toValue: 0, duration: 360, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      // A damped shake, the two axes out of step.
      const p = QUAKE[at] * (0.6 + 0.4 * strength);
      const jolts = (v: Animated.Value, steps: number[]) => Animated.sequence(steps.map((k) => Animated.timing(v, { toValue: k * p, duration: 40, useNativeDriver: true })));
      Animated.parallel([jolts(shakeX, [1, -0.85, 0.7, -0.55, 0.4, -0.25, 0.12, 0]), jolts(shakeY, [-0.6, 0.75, -0.5, 0.45, -0.3, 0.18, -0.08, 0])]).start();
    },
    [lively, pop, punch, wave, streak, flash, shakeX, shakeY],
  );

  useEffect(() => {
    if (small) {
      successHaptic();
      playSfx('win', 0.8);
    } else if (tier === 'jackpot') {
      playSfx('jackpot', 1);
      rumbleHaptic([90, 120, 170]);
    } else if (climbs) {
      // The build-up: a hit, coins, and a tone rising under the count.
      playSfx('impact', 0.8);
      playSfx('riser', 0.45);
      playSfx('coins', 0.5);
      heavyHaptic();
    } else {
      playSfx('winBig', 1);
      playSfx('coins', 0.45);
      successHaptic();
      heavyHaptic();
    }
    const ring = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }));
    if (!small && !reduceMotion) ring.start();
    const sparkle = Animated.loop(Animated.timing(twinkle, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    if (lively) {
      sparkle.start();
      blow(1, big);
    }
    const a = small
      ? Animated.timing(inV, { toValue: 1, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      : Animated.spring(inV, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true });
    a.start();
    const t = setTimeout(close, ms);
    return () => {
      clearTimeout(t);
      a.stop();
      ring.stop();
      sparkle.stop();
    };
    // Started once per celebration (the layer is keyed by it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The amount counts up, ticking (longer when it has steps to climb, the plate shivering). Each step up the title
  // it passes (BÜYÜK → DEV → EFSANE) is a blow and a fanfare, EFSANE making the phone tremble; then the amount lands
  // on its plate with a blow: a coin, or a climbing win's jingle.
  useEffect(() => {
    if (small || reduceMotion) return;
    const span = ms * (climbs ? 0.66 : 0.5);
    const start = Date.now();
    let frame = 0;
    let lastTick = 0;
    let ticks = 0;
    let reached = winStageAt(0, bet, tier);
    const shake = Animated.loop(Animated.sequence([1.4, -1.4, 0.9, -0.9].map((x) => Animated.timing(shiver, { toValue: x, duration: 32, useNativeDriver: true }))));
    if (climbs && lively) shake.start();
    const step = () => {
      if (closing.current) return;
      const t = Math.min(1, (Date.now() - start) / span);
      const shown = climbs ? climbAt(amount, t) : rollAt(0, amount, t);
      setCount(shown);
      const next = title ? reached : winStageAt(shown, bet, tier);
      if (next !== reached) {
        reached = next;
        const at = next === 'small' ? 'big' : next;
        if (lively) {
          blow(0.85, at);
          setBurst((b) => b + 1);
        }
        playSfx('levelup', 0.85);
        heavyHaptic();
        if (at === 'epic') rumbleHaptic([60, 90, 120]);
      }
      const now = Date.now();
      if (t < 1 && now - lastTick > 90) {
        lastTick = now;
        playSfx('tick', 0.35);
        if (climbs && ++ticks % 3 === 0) tapHaptic();
      }
      if (t < 1) frame = requestAnimationFrame(step);
      else {
        shake.stop();
        shiver.setValue(0);
        if (climbs) {
          playSfx('winBig', 1);
          playSfx('coins', 0.5);
          successHaptic();
          if (tier === 'epic') rumbleHaptic([80, 110, 150]);
          else heavyHaptic();
        } else {
          playSfx('coin', 0.8);
          pressHaptic();
        }
        if (lively) {
          slam.setValue(1);
          Animated.spring(slam, { toValue: 0, friction: 3.5, tension: 140, useNativeDriver: true }).start();
          blow(climbs ? 1 : 0.45, tier);
          setBurst((b) => b + 1);
        }
      }
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      shake.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLayout = (e: LayoutChangeEvent) => setBox({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) });
  const fade = out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  if (small)
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
        {!reduceMotion && <Coins kind="fountain" count={WIN_SHOW.small.coins} width={box.w} height={box.h} ms={ms} from={0.42} />}
        <Animated.View style={[s.floatWrap, { opacity: inV.interpolate({ inputRange: [0, 0.12, 0.75, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateY: inV.interpolate({ inputRange: [0, 1], outputRange: [10, -46] }) }] }]}>
          <Text style={s.float}>+{fmt(amount)}</Text>
        </Animated.View>
      </View>
    );

  // The look climbs with the title.
  const look = LOOK[big];
  const x = bet > 0 ? Math.floor(amount / bet) : 0;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.layer, { opacity: fade }]} onLayout={onLayout} accessibilityLiveRegion="assertive">
      <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={close} accessibilityRole="button" accessibilityLabel={`${title ?? WIN_TITLE[tier]}, ${amount} jeton. Kapatmak için dokun`} />
      {/* Everything that shakes with a blow; the dimming behind stays put. */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: shakeX }, { translateY: shakeY }, { scale: punch }] }]} pointerEvents="none">
        <View style={s.center}>
          {!reduceMotion && (
            <Animated.View style={[s.rays, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
              {Array.from({ length: RAYS }, (_, i) => (
                <View key={i} style={[s.rayArm, { transform: [{ rotate: `${(360 / RAYS) * i}deg` }] }]}>
                  <LinearGradient colors={[look.ray, 'rgba(255,255,255,0)']} start={{ x: 0.5, y: 1 }} end={{ x: 0.5, y: 0 }} style={[s.ray, i % 2 === 1 && s.rayThin]} />
                </View>
              ))}
            </Animated.View>
          )}
          {/* The light a blow throws out: streaks shooting from the title. */}
          {lively && (
            <View style={s.rays}>
              {Array.from({ length: STREAKS }, (_, i) => (
                <View key={i} style={[s.rayArm, { transform: [{ rotate: `${(360 / STREAKS) * i + 11}deg` }] }]}>
                  <Animated.View
                    style={[
                      s.streak,
                      {
                        opacity: streak.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 0] }),
                        transform: [{ translateY: streak.interpolate({ inputRange: [0, 1], outputRange: [-40, -(150 + (i % 3) * 34)] }) }, { scaleY: streak.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.5, 0.5] }) }],
                      },
                    ]}
                  >
                    <LinearGradient colors={['rgba(255,255,255,0)', '#FFF7D6', look.ribbon[0]]} style={StyleSheet.absoluteFill} />
                  </Animated.View>
                </View>
              ))}
            </View>
          )}
          {/* The rings a blow sends out from the title: a coloured one, a white one after it. */}
          {lively && (
            <>
              <Animated.View
                style={[s.wave, { borderColor: look.ribbon[0], opacity: wave.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }), transform: [{ scale: wave.interpolate({ inputRange: [0, 1], outputRange: [0.25, 2.8] }) }] }]}
              />
              <Animated.View
                style={[s.wave, s.waveWhite, { opacity: wave.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0, 0.75, 0] }), transform: [{ scale: wave.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0.1, 0.4, 3.6] }) }] }]}
              />
            </>
          )}
          <Animated.View style={{ alignItems: 'center', opacity: inV.interpolate({ inputRange: [0, 0.4], outputRange: [0, 1], extrapolate: 'clamp' }), transform: [{ scale: inV.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
            <Animated.View style={{ transform: [{ scale: pop }] }}>
              <LinearGradient colors={look.ribbon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.ribbon}>
                <LinearGradient colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']} style={s.ribbonGloss} />
                <Text style={[s.title, { color: look.ink }]} numberOfLines={1} adjustsFontSizeToFit>
                  {title ?? WIN_TITLE[big]}
                </Text>
                {!effectsOff && <Shine radius={999} every={900} />}
              </LinearGradient>
            </Animated.View>
            {/* The amount on its plate: it shivers while a climbing win counts and lands with a bump. */}
            <Animated.View style={[s.plate, { borderColor: look.ribbon[0], transform: [{ translateX: shiver }, { scale: slam.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }) }] }]}>
              <Text style={s.amount} numberOfLines={1} adjustsFontSizeToFit>
                +{fmt(count)}
              </Text>
            </Animated.View>
            <Text style={s.unit}>jeton{x >= 2 ? ` · bahsin ${fmt(x)} katı` : ''}</Text>
          </Animated.View>
        </View>
        {lively &&
          box.w > 0 &&
          SPARKLES.map((p, i) => {
            const range = { inputRange: [0, p.at, p.at + 0.15, p.at + 0.3, 1], extrapolate: 'clamp' as const };
            return (
              <Animated.Image
                key={i}
                source={SPARKLE}
                style={{
                  position: 'absolute',
                  left: box.w / 2 + p.x * box.w - p.size / 2,
                  top: box.h * MIDDLE + p.y * box.h - p.size / 2,
                  width: p.size,
                  height: p.size,
                  opacity: twinkle.interpolate({ ...range, outputRange: [0, 0, 1, 0, 0] }),
                  transform: [{ scale: twinkle.interpolate({ ...range, outputRange: [0.3, 0.3, 1.25, 0.3, 0.3] }) }, { rotate: twinkle.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) }],
                }}
              />
            );
          })}
        {lively && box.w > 0 && (big === 'epic' || big === 'jackpot') && FIREWORKS.map((f, i) => <Firework key={i} x={f.x * box.w} y={f.y * box.h} color={f.color} delay={f.at} />)}
        {lively && burst > 0 && <Coins key={burst} kind="burst" count={Math.round(WIN_SHOW[big].coins * 0.5)} width={box.w} height={box.h} ms={1700} from={MIDDLE} />}
      </Animated.View>
      {!reduceMotion && <Coins kind="rain" count={WIN_SHOW[tier].coins} width={box.w} height={box.h} ms={ms} />}
      {lively && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.flash, { opacity: flash }]} />}
    </Animated.View>
  );
}

/** A firework over the show: sparks thrown out round a point after `delay` (ms), falling a little as they fade. */
function Firework({ x, y, color, delay }: { x: number; y: number; color: string; delay: number }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.sequence([Animated.delay(delay), Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true })]);
    a.start();
    return () => a.stop();
  }, [t, delay]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: x, top: y }}>
      <Animated.View style={[s.fireCore, { backgroundColor: color, opacity: t.interpolate({ inputRange: [0, 0.02, 0.22, 1], outputRange: [0, 0.9, 0, 0] }), transform: [{ scale: t.interpolate({ inputRange: [0, 0.22, 1], outputRange: [0.2, 2.4, 2.4] }) }] }]} />
      {Array.from({ length: SPARKS }, (_, i) => {
        const a = (i / SPARKS) * Math.PI * 2;
        const r = 44 + (i % 3) * 12;
        const dx = Math.cos(a) * r;
        const dy = Math.sin(a) * r;
        return (
          <Animated.View
            key={i}
            style={[
              s.spark,
              {
                backgroundColor: color,
                opacity: t.interpolate({ inputRange: [0, 0.02, 0.6, 1], outputRange: [0, 1, 0.85, 0] }),
                transform: [
                  { translateX: t.interpolate({ inputRange: [0, 0.3, 0.7, 1], outputRange: [0, dx * 0.75, dx * 0.95, dx] }) },
                  { translateY: t.interpolate({ inputRange: [0, 0.3, 0.7, 1], outputRange: [0, dy * 0.75, dy * 0.95 + 8, dy + 22] }) },
                  { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1.2, 0.4] }) },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  layer: { zIndex: 30, elevation: 30, overflow: 'hidden', borderRadius: 22 },
  scrim: { backgroundColor: 'rgba(4,8,22,0.78)' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  rays: { position: 'absolute', width: 2, height: 2, alignItems: 'center', justifyContent: 'center' },
  rayArm: { position: 'absolute', width: 2, height: 2, alignItems: 'center' },
  ray: { position: 'absolute', bottom: 1, width: 26, height: 230, borderTopLeftRadius: 13, borderTopRightRadius: 13 },
  rayThin: { width: 12, height: 180 },
  streak: { position: 'absolute', bottom: 1, width: 4, height: 54, borderRadius: 2, overflow: 'hidden' },
  ribbon: { borderRadius: 999, paddingHorizontal: 22, paddingVertical: 7, borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)', overflow: 'hidden', boxShadow: '0 8px 20px rgba(0,0,0,0.5)' },
  ribbonGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '50%' },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: 2.5, fontStyle: 'italic' },
  // The plate under the amount: dark glass with a rim in the title's colour and a glow round it.
  plate: { marginTop: 12, marginBottom: 4, paddingHorizontal: 22, borderRadius: 22, borderWidth: 2, backgroundColor: 'rgba(24,12,2,0.72)', boxShadow: '0 0 24px rgba(253,200,60,0.5)', maxWidth: '100%' },
  amount: { color: '#FFE08A', fontSize: 54, lineHeight: 62, fontWeight: '900', fontVariant: ['tabular-nums'], textShadowColor: 'rgba(246,189,96,0.85)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 18 },
  wave: { position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 6 },
  waveWhite: { borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  flash: { backgroundColor: '#FFF7D6' },
  unit: { color: 'rgba(255,255,255,0.86)', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  floatWrap: { position: 'absolute', left: 0, right: 0, top: '36%', alignItems: 'center' },
  float: { color: '#FDE68A', fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'], textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  fireCore: { position: 'absolute', left: -10, top: -10, width: 20, height: 20, borderRadius: 10 },
  spark: { position: 'absolute', left: -3, top: -3, width: 6, height: 6, borderRadius: 3 },
});
