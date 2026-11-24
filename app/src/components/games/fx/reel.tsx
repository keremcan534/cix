// One slot reel that really rolls: a column of symbols slides down behind a window, runs at full speed and settles
// on its result with a small overshoot (lib/reel-plan). `spin()` lets it run while the round is still being asked
// for; `land()` brings it to the result and resolves when it rests. The result is decided before the reel moves:
// this only shows it. One native-driven value per run, so five reels cost five animations. At full speed the symbols
// are a blur (stretched along the reel, and blurred where the phone can: Android 12+, the web); they come sharp as
// the reel settles. A winning symbol beats with the others and glows behind.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Sparkle } from '@/components/games/fx/sparkle';
import { SETTLE_BACK, fillerOf, type ReelPace, type ReelRun } from '@/lib/reel-plan';

export type ReelHandle = {
  /** Runs without a result, for as long as the wait lasts (the strip flies past). */
  spin: (pace: ReelPace) => void;
  /** Brings the reel to `to` along `run`; resolves when it has come to rest (at once with `still`). */
  land: (to: string[], run: ReelRun, pace: ReelPace, still?: boolean) => Promise<void>;
};

/** Symbols of a run without a result: enough for a few seconds at full speed. */
const WAIT_SYMBOLS = 36;

// A run is the column and the value that moves it, made together: the column a new run shows is in place in the
// very frame its value starts from, so the result never flashes into the window before the reel has run.
type Run = { id: number; col: string[]; y: Animated.Value };

export function Reel({
  ref,
  symbols,
  strip,
  cell,
  gap = 4,
  render,
  lit,
  dim,
  pulse,
  shade = 'rgba(0,0,0,0.5)',
  litStyle,
  pop = 0,
  popDelay = 0,
}: {
  ref?: Ref<ReelHandle>;
  /** The window at rest before the first run (top to bottom). */
  symbols: string[];
  /** The reel's strip: what flies past comes from it, in its order. */
  strip: string[];
  /** A symbol's height and the space between two (px). */
  cell: number;
  gap?: number;
  render: (sym: string, moving: boolean) => ReactNode;
  /** Winning rows of the window at rest: they pulse; with `dim` the others fade. */
  lit?: boolean[];
  dim?: boolean;
  /** 0 → 1 → 0, shared by every reel so winning symbols beat together. */
  pulse?: Animated.Value;
  /** The reel's own darkness at its top and bottom edge, for the roundness of a drum. */
  shade?: string;
  /** A winning cell's look instead of the yellow box (a skinned machine's, fx/slot-skin). */
  litStyle?: StyleProp<ViewStyle>;
  /** Counts real wins: each new one makes the winning symbols jump out once (after `popDelay` ms) before they beat. */
  pop?: number;
  popDelay?: number;
}) {
  const rows = symbols.length;
  const step = cell + gap;
  const [run, setRun] = useState<Run>(() => ({ id: 0, col: symbols, y: new Animated.Value(0) }));
  const [moving, setMoving] = useState(false);
  // Running at full speed (not yet settling): the symbols are a blur.
  const [fast, setFast] = useState(false);
  const at = useRef(run);
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const offset = useRef(0);
  const alive = useRef(true);
  // Running (or settling): a reel that starts from rest first pulls back a little, as a real drum does.
  const running = useRef(false);
  useEffect(
    () => () => {
      alive.current = false;
      anim.current?.stop();
    },
    [],
  );

  /** A quarter symbol up and back to where it was, before a run from rest. */
  const windUp = (y: Animated.Value, from: number) =>
    Animated.sequence([
      Animated.timing(y, { toValue: from - step * 0.26, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(y, { toValue: from, duration: 70, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);

  const start = (col: string[], from: number): Run => {
    anim.current?.stop();
    const next = { id: at.current.id + 1, col, y: new Animated.Value(from) };
    at.current = next;
    setRun(next);
    return next;
  };

  useImperativeHandle(ref, () => ({
    spin(pace) {
      // Whatever is in the window stays at the bottom of the new column and slides out first.
      const seen = at.current.col.slice(0, rows);
      const fly = fillerOf(strip, offset.current, WAIT_SYMBOLS);
      offset.current += WAIT_SYMBOLS;
      const r = start([...fly, ...seen], -WAIT_SYMBOLS * step);
      setMoving(true);
      setFast(true);
      const run = Animated.timing(r.y, { toValue: 0, duration: (WAIT_SYMBOLS * step) / pace.speed, easing: Easing.linear, useNativeDriver: true });
      anim.current = running.current ? run : Animated.sequence([windUp(r.y, -WAIT_SYMBOLS * step), run]);
      running.current = true;
      anim.current.start();
    },
    land(to, plan, pace, still) {
      return new Promise<void>((resolve) => {
        if (still) {
          start(to, 0);
          setMoving(false);
          setFast(false);
          running.current = false;
          return resolve();
        }
        // At rest the window is the top of the column; mid-run it is somewhere in it, and at that speed nobody
        // sees which symbols the new column starts from.
        const seen = at.current.col.slice(0, rows);
        const fly = fillerOf(strip, offset.current, plan.filler);
        offset.current += plan.filler;
        const travel = (plan.filler + rows) * step;
        const settle = Math.min(pace.settle, plan.filler + rows) * step;
        const r = start([...to, ...fly, ...seen], -travel);
        setMoving(true);
        setFast(true);
        // The run at full speed, then the settle, the symbols sharp again for it.
        const settleRun = Animated.timing(r.y, { toValue: 0, duration: Math.max(1, plan.settleMs), easing: Easing.out(Easing.back(SETTLE_BACK)), useNativeDriver: true });
        const run = Animated.timing(r.y, { toValue: -settle, duration: Math.max(1, plan.runMs), easing: Easing.linear, useNativeDriver: true });
        // From rest (the round was answered before the reels had to wait for it) the drum pulls back first.
        anim.current = running.current ? run : Animated.sequence([windUp(r.y, -travel), run]);
        running.current = true;
        anim.current.start(({ finished }) => {
          // Stopped (a newer run took over, or the screen closed): that one answers for the reel now.
          if (!alive.current || !finished || at.current.id !== r.id) return resolve();
          setFast(false);
          anim.current = settleRun;
          settleRun.start(({ finished: rested }) => {
            if (!alive.current) return resolve();
            if (rested && at.current.id === r.id) {
              setMoving(false);
              running.current = false;
            }
            resolve();
          });
        });
      });
    },
  }));

  const [jump] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!pop) return;
    jump.setValue(1);
    const a = Animated.sequence([
      Animated.delay(popDelay),
      Animated.timing(jump, { toValue: 1.34, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(jump, { toValue: 1, friction: 4, tension: 170, useNativeDriver: true }),
    ]);
    a.start();
    return () => a.stop();
    // A new win only; the delay is the reel's own and never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pop, jump]);

  const beat = pulse?.interpolate({ inputRange: [0, 1], outputRange: [1, 1.13] });
  // Lit only while the symbols beat: a game beats them for a real win, never for money back under the stake.
  const glow = pulse?.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  return (
    <View style={[s.window, { height: rows * step - gap }]}>
      <Animated.View style={[{ transform: [{ translateY: run.y }] }, fast && s.blur]}>
        {run.col.map((sym, i) => {
          const rest = !moving && i < rows;
          const on = rest && !!lit?.[i];
          return (
            <Animated.View key={`${run.id}-${i}`} style={[s.cell, { height: cell, marginBottom: gap }, on && (litStyle ?? s.on), rest && dim && !on && s.dim, on && beat ? { transform: [{ scale: beat }, { scale: jump }] } : null, fast && s.streak]}>
              {/* The win's light behind the symbol, breathing with the beat. */}
              {on && glow && <Animated.View pointerEvents="none" style={[s.halo, { opacity: glow }]} />}
              {render(sym, moving)}
              {/* A star glints on the symbol as it jumps out. */}
              {on && pop > 0 && <Sparkle key={`glint-${pop}`} size={Math.round(cell * 0.62)} delay={popDelay + 90} style={{ right: -cell * 0.08, top: -cell * 0.06 }} />}
            </Animated.View>
          );
        })}
      </Animated.View>
      <LinearGradient colors={[shade, 'rgba(0,0,0,0)']} style={[s.shade, { top: 0, height: cell * 0.55 }]} pointerEvents="none" />
      <LinearGradient colors={['rgba(0,0,0,0)', shade]} style={[s.shade, { bottom: 0, height: cell * 0.55 }]} pointerEvents="none" />
    </View>
  );
}

const s = StyleSheet.create({
  window: { overflow: 'hidden', borderRadius: 10 },
  cell: { alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 2, borderColor: 'transparent' },
  on: { borderColor: '#FDE047', backgroundColor: 'rgba(253,224,71,0.24)' },
  dim: { opacity: 0.32 },
  // A symbol flying past: drawn longer along the reel and a little faint; the column blurred where it can be
  // (the string form: the web build takes no other; a phone without it just shows the stretch).
  streak: { transform: [{ scaleY: 1.16 }], opacity: 0.88 },
  blur: { filter: 'blur(1.6px)' },
  halo: { position: 'absolute', left: 3, right: 3, top: 3, bottom: 3, borderRadius: 999, backgroundColor: 'rgba(255,214,90,0.22)', boxShadow: '0 0 18px 6px rgba(255,196,60,0.7)' },
  shade: { position: 'absolute', left: 0, right: 0 },
});
