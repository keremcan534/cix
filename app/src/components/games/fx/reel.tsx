// One slot reel that really rolls: a column of symbols slides down behind a window, runs at full speed and settles
// on its result with a small overshoot (lib/reel-plan). `spin()` lets it run while the round is still being asked
// for; `land()` brings it to the result and resolves when it rests. The result is decided before the reel moves:
// this only shows it.
//
// Smoothness (Kasım 2026, the owners felt a freeze on a phone): a run is ONE native timing from start to rest — the
// pull back from rest, the run at full speed and the settle are pieces of one curve (runCurve), so the reel never waits
// for the JS thread between them (it used to stop dead for a moment when JS was busy as the settle had to be started
// from there). The symbols' stretch at full speed rides a second native value of the same length, not React state,
// and the column's cells keep their places between runs (only the pictures change), so a new run mounts nothing. The
// old blur filter is gone: it was a full-column GPU effect on Android. A winning symbol beats with the others and
// glows behind.
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
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
const WAIT_SYMBOLS = 30;
/** A run from rest first pulls back this much of a symbol, over this long (ms). */
const WIND = 0.26;
const WIND_MS = 170;

// A run is the column and the value that moves it, made together: the column a new run shows is in place in the
// very frame its value starts from, so the result never flashes into the window before the reel has run.
type Run = { id: number; col: string[]; y: Animated.Value };

const backOut = Easing.out(Easing.back(SETTLE_BACK));

/**
 * The whole way of a run as one easing over its total time (0 → 1 is start → rest): a pull back of `windPart` of the
 * way and back (a sine, so it leaves and returns moving), the run at full speed to `runPart` of the way, then the
 * settle with its overshoot. Times are in ms; any piece may be 0 except the settle.
 */
function runCurve(windMs: number, runMs: number, settleMs: number, windPart: number, runPart: number) {
  const total = windMs + runMs + settleMs;
  const w = windMs / total;
  const r = runMs / total;
  return (t: number) => {
    if (w > 0 && t < w) return -windPart * Math.sin(Math.PI * (t / w));
    if (r > 0 && t < w + r) return ((t - w) / r) * runPart;
    return runPart + (1 - runPart) * backOut(Math.min(1, (t - w - r) / (1 - w - r)));
  };
}

/** 1 while the reel is at full speed (between the pull back and the settle), else 0: the symbols' stretch. */
const fastCurve = (windMs: number, runMs: number, total: number) => (t: number) => (t * total >= windMs && t * total < windMs + runMs ? 1 : 0);

type Props = {
  ref?: Ref<ReelHandle>;
  /** The window at rest before the first run (top to bottom). */
  symbols: string[];
  /** The reel's strip: what flies past comes from it, in its order. */
  strip: string[];
  /** A symbol's height and the space between two (px). */
  cell: number;
  gap?: number;
  render: (sym: string, moving: boolean) => ReactNode;
  /** Changes when `render` draws differently (a new symbol size): the reel redraws only for its own props and this. */
  renderKey?: string | number;
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
};

function ReelView({ ref, symbols, strip, cell, gap = 4, render, lit, dim, pulse, shade = 'rgba(0,0,0,0.5)', litStyle, pop = 0, popDelay = 0 }: Props) {
  const rows = symbols.length;
  const step = cell + gap;
  const [run, setRun] = useState<Run>(() => ({ id: 0, col: symbols, y: new Animated.Value(0) }));
  const [moving, setMoving] = useState(false);
  // 1 at full speed: the symbols stretch along the reel (native).
  const [fast] = useState(() => new Animated.Value(0));
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

  const start = (col: string[], from: number): Run => {
    anim.current?.stop();
    const next = { id: at.current.id + 1, col, y: new Animated.Value(from) };
    at.current = next;
    setRun(next);
    if (!running.current) setMoving(true);
    return next;
  };

  /** Starts a run's two native timings together: the way (y) and the stretch. */
  const go = (r: Run, windMs: number, runMs: number, settleMs: number, windPart: number, runPart: number, done?: (finished: boolean) => void) => {
    const total = Math.max(1, windMs + runMs + settleMs);
    fast.setValue(0);
    const a = Animated.parallel([
      Animated.timing(r.y, { toValue: 0, duration: total, easing: runCurve(windMs, runMs, Math.max(1, settleMs), windPart, runPart), useNativeDriver: true }),
      Animated.timing(fast, { toValue: 1, duration: total, easing: fastCurve(windMs, runMs, total), useNativeDriver: true }),
    ]);
    anim.current = a;
    running.current = true;
    a.start(({ finished }) => done?.(finished));
  };

  useImperativeHandle(ref, () => ({
    spin(pace) {
      // Whatever is in the window stays at the bottom of the new column and slides out first.
      const seen = at.current.col.slice(0, rows);
      const fly = fillerOf(strip, offset.current, WAIT_SYMBOLS);
      offset.current += WAIT_SYMBOLS;
      const travel = WAIT_SYMBOLS * step;
      const windMs = running.current ? 0 : WIND_MS;
      const r = start([...fly, ...seen], -travel);
      // All of it at full speed (the settle is a single frame: land() takes over long before).
      go(r, windMs, travel / pace.speed, 1, (WIND * step) / travel, 1);
    },
    land(to, plan, pace, still) {
      return new Promise<void>((resolve) => {
        if (still) {
          start(to, 0);
          setMoving(false);
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
        // From rest (the round was answered before the reels had to wait for it) the drum pulls back first.
        const windMs = running.current ? 0 : WIND_MS;
        const r = start([...to, ...fly, ...seen], -travel);
        go(r, windMs, Math.max(0, plan.runMs), plan.settleMs, (WIND * step) / travel, (travel - settle) / travel, (finished) => {
          // Stopped (a newer run took over, or the screen closed): that one answers for the reel now.
          if (alive.current && finished && at.current.id === r.id) {
            running.current = false;
            setMoving(false);
          }
          resolve();
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
  // A symbol flying past is drawn longer along the reel.
  const streak = fast.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  return (
    <View style={[s.window, { height: rows * step - gap }]}>
      <Animated.View style={{ transform: [{ translateY: run.y }] }}>
        {run.col.map((sym, i) => {
          const rest = !moving && i < rows;
          const on = rest && !!lit?.[i];
          return (
            // Keyed by place, not by run: a new run changes the pictures in the same cells instead of mounting new ones.
            <Animated.View key={i} style={[s.cell, { height: cell, marginBottom: gap }, on && (litStyle ?? s.on), rest && dim && !on && s.dim, { transform: on && beat ? [{ scale: beat }, { scale: jump }] : [{ scaleY: streak }] }]}>
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

const sameRows = (a?: boolean[], b?: boolean[]) => a === b || (!!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]));

/**
 * A reel redraws only when something it shows changes: the game's own state (a reel stopping, the status line)
 * re-renders the game every few hundred ms during a round, and five reels of thirty cells each were redrawn with it.
 * `render` and `ref` are made anew on every render of the game, so they are left out; `renderKey` stands for render.
 */
export const Reel = memo(
  ReelView,
  (a, b) =>
    a.symbols === b.symbols &&
    a.strip === b.strip &&
    a.cell === b.cell &&
    a.gap === b.gap &&
    a.renderKey === b.renderKey &&
    a.dim === b.dim &&
    a.pulse === b.pulse &&
    a.shade === b.shade &&
    a.litStyle === b.litStyle &&
    a.pop === b.pop &&
    a.popDelay === b.popDelay &&
    sameRows(a.lit, b.lit),
);

const s = StyleSheet.create({
  window: { overflow: 'hidden', borderRadius: 10 },
  cell: { alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 2, borderColor: 'transparent' },
  on: { borderColor: '#FDE047', backgroundColor: 'rgba(253,224,71,0.24)' },
  dim: { opacity: 0.32 },
  halo: { position: 'absolute', left: 3, right: 3, top: 3, bottom: 3, borderRadius: 999, backgroundColor: 'rgba(255,214,90,0.22)', boxShadow: '0 0 18px 6px rgba(255,196,60,0.7)' },
  shade: { position: 'absolute', left: 0, right: 0 },
});
