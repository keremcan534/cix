// The opening, once per cold start: "İki insan, tek kalp". The story and every keyframe are in lib/intro-timeline.
// It starts on the native splash's exact picture (lib/splash: the same navy, the same mark at the same size and place,
// here cut into layers that give the mark back: assets/intro, scripts/intro-layers.py), so the mark comes alive from
// the splash's own pose: the two glass heads glance and lean in, a spark lights between them, their two lights run
// down the heart's sides and meet at the tip, light rises from it and fills the heart, which beats once, then it rises
// over the name. Then the navy rises off the screen like a curtain: over the sign-in screen the mark flies onto that
// screen's own logo meanwhile while the name fades on its way to the title (a match cut); elsewhere the lockup lifts a
// little and is gone first. It plays over the first screen while that screen draws underneath, so it adds no waiting,
// and it never uncovers that screen before it has drawn. A tap runs the same exit, faster, from wherever the mark is;
// "Animasyonları azalt" and the phone's own reduce-motion setting turn it off.
//
// On phones everything runs on the native driver: three clocks with no listeners, transform and opacity only, every
// curve baked into plain linear stops (interpolation easing doesn't run there, see lib/intro-timeline).
import { useIsFocused } from 'expo-router';
import { Asset } from 'expo-asset';
import { LinearGradient } from 'expo-linear-gradient';
import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type HostInstance,
  type LayoutChangeEvent,
  type LayoutRectangle,
} from 'react-native';

import { Text } from '@/components/text';
import { FILL_BOX, HEAD_CORAL_CLIP, HEAD_CYAN_CLIP, RING_BOX, TIP, type Box, type Circle, type Point } from '@/lib/intro-path';
import {
  COMET_SIZE,
  CURTAIN_SEAM,
  DRAWN_FRAME,
  DRAWN_WAIT,
  EXIT,
  EXIT_FAST,
  EXIT_TRACKS,
  FAILSAFE,
  FAILSAFE_GRACE,
  FAILSAFE_RUN,
  FEATHER,
  FEATHER_STOPS,
  HALO,
  HEAD_LIFT,
  LETTERS,
  OS_WAIT,
  PIVOT_CORAL,
  PIVOT_CYAN,
  SHINE_SIZE,
  SPARK,
  SPARK_AT,
  STREAKS,
  STREAK_SIZE,
  S_END,
  TIP_GLOW,
  TOTAL,
  VEIL,
  VEIL_MARK,
  WORD_BREAK,
  WORD_CYAN,
  WORD_CYAN_GLOW,
  WORD_CORAL_GLOW,
  fontSizeFor,
  liftTo,
  lockup,
  markPose,
  matchCut,
  timeline,
  uncoverAt,
  type ExitTo,
  type Landing,
  type Range,
  type Rect,
} from '@/lib/intro-timeline';
import { SPLASH_FADE, SPLASH_MARK, SPLASH_NAVY } from '@/lib/splash';
import { useSettings } from '@/store';

// The mark, cut into the three layers that together are the splash picture (heart under the coral head under the
// cyan one), and the lights. All at most 600 px.
const HEART = require('../../../assets/intro/heart.png');
const HEAD_CORAL = require('../../../assets/intro/head-coral.png');
const HEAD_CYAN = require('../../../assets/intro/head-cyan.png');
const FILL_1 = require('../../../assets/intro/fill-1.png');
const FILL_2 = require('../../../assets/intro/fill-2.png');
const FILL_3 = require('../../../assets/intro/fill-3.png');
const RING = require('../../../assets/intro/heart-ring.png');
const AURA = require('../../../assets/intro/mark-aura.png');
const SHINE = require('../../../assets/intro/shine.png');
const COMET_CYAN = require('../../../assets/intro/comet-cyan.png');
const COMET_CORAL = require('../../../assets/intro/comet-coral.png');
const STREAK_CYAN = require('../../../assets/intro/streak-cyan.png');
const STREAK_CORAL = require('../../../assets/intro/streak-coral.png');
const STAR = require('../../../assets/intro/spark.png');
const GLOW = require('../../../assets/fx/glow.png');

const NATIVE = Platform.OS !== 'web';
const BOX = SPLASH_MARK;

/** Once per launch: a store reset remounts the app but must not replay the opening. */
let played = false;

/**
 * Called from the root layout's boot path, while the fonts and the saved state load: the three layers of the first
 * frame start loading at once (on the web they come over the network), so the hand-over rarely waits for them. On the
 * web they also go into the browser image cache the Image component reads, so the cover's very first frame already
 * draws them (otherwise it would show one frame of bare navy over the page's own splash, public/index.html).
 */
export function preloadIntro() {
  if (played) return;
  const layers = [HEART, HEAD_CORAL, HEAD_CYAN];
  Asset.loadAsync(layers).catch(() => {});
  if (!NATIVE) for (const m of layers) Image.prefetch(Asset.fromModule(m).uri).catch(() => {});
}

// ---- The hand-over from the native splash (the root layout drives it) ----

let gone = false;
let goneAt = 0;
const goneListeners = new Set<() => void>();
const subscribeGone = (listener: () => void) => {
  goneListeners.add(listener);
  return () => {
    goneListeners.delete(listener);
  };
};
const isGone = () => gone;

/** The root layout hid the native splash: the opening may start moving (after its hold). */
export function splashGone() {
  if (gone) return;
  gone = true;
  goneAt = Date.now();
  goneListeners.forEach((listener) => listener());
}

let readyNow: () => void = () => {};
/**
 * Resolves once the opening's first frame has drawn its three mark layers (so hiding the native splash shows the same
 * picture, never a frame of bare navy), or at once when the opening won't play.
 */
export const introReady = new Promise<void>((resolve) => {
  readyNow = resolve;
});
const loaded = new Set<string>();
const layerLoaded = (name: string) => () => {
  loaded.add(name);
  if (loaded.size === 3) readyNow();
};
const onHeart = layerLoaded('heart');
const onCoral = layerLoaded('coral');
const onCyan = layerLoaded('cyan');

// ---- The first screen beneath it has drawn: only then may it be uncovered ----

let drawnAt: number | null = null;
const drawnListeners = new Set<() => void>();

/**
 * The first screen beneath the opening has drawn its picture (a screen's backdrop photo, components/fx/surface, or
 * the sign-in logo): the opening's veil or exit may uncover it now. Before this it waits (at most DRAWN_WAIT after the
 * splash went), so it never dissolves into an empty page that fills in a moment later.
 */
export function introScreenDrawn() {
  if (drawnAt !== null) return;
  drawnAt = Date.now();
  drawnListeners.forEach((listener) => listener());
}

/** Runs go once the cover may uncover the app (lib/intro-timeline uncoverAt), not before `earliest`. Returns a cancel. */
function whenUncover(earliest: number, go: () => void) {
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = () => {
    if (done) return;
    done = true;
    drawnListeners.delete(plan);
    go();
  };
  function plan() {
    clearTimeout(timer);
    if (!done) timer = setTimeout(fire, Math.max(0, uncoverAt(earliest, drawnAt, goneAt || Date.now()) - Date.now()));
  }
  drawnListeners.add(plan);
  plan();
  return () => {
    done = true;
    clearTimeout(timer);
    drawnListeners.delete(plan);
  };
}

// ---- Where the lockup lands: the sign-in screen's own logo and title (a match cut) ----

/** Measures the screen's logo and title in window coordinates; null when they are not there. */
type Lander = (done: (to: Landing | null) => void) => void;
let lander: Lander | null = null;
/** How long the exit waits for those measurements before it lifts the lockup away instead. */
const LANDING_WAIT = 120;

/**
 * For the sign-in screen: the opening's lockup lands on its logo (assets/brand/logo.png, drawn "contain") and title.
 * `box` is the ref of the view that holds both, `onLogo` and `onTitle` their onLayout, `onLogoLoad` the logo's onLoad
 * (the screen has drawn: the opening may uncover it).
 */
export function useIntroLanding() {
  const node = useRef<HostInstance | null>(null);
  const logo = useRef<LayoutRectangle | null>(null);
  const title = useRef<LayoutRectangle | null>(null);
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return;
    const land: Lander = (done) => {
      const l = logo.current;
      const t = title.current;
      if (!node.current || !l || !t) return done(null);
      node.current.measureInWindow((x, y) =>
        done({ logo: { x: x + l.x, y: y + l.y, width: l.width, height: l.height }, title: { x: x + t.x, y: y + t.y, width: t.width, height: t.height } }),
      );
    };
    lander = land;
    return () => {
      if (lander === land) lander = null;
    };
  }, [focused]);
  const box = useCallback((v: HostInstance | null) => {
    node.current = v;
  }, []);
  const onLogo = useCallback((e: LayoutChangeEvent) => {
    logo.current = e.nativeEvent.layout;
  }, []);
  const onTitle = useCallback((e: LayoutChangeEvent) => {
    title.current = e.nativeEvent.layout;
  }, []);
  return { box, onLogo, onTitle, onLogoLoad: introScreenDrawn };
}

// ---- Placement in the mark's 200 dp box (every child absolute, animations are offsets on top) ----

const around = (p: Point, w: number, h = w) => ({ position: 'absolute' as const, left: p.x - w / 2, top: p.y - h / 2, width: w, height: h });
const boxed = (b: Box) => ({ position: 'absolute' as const, ...b });
const clipOf = (c: Circle) => ({ position: 'absolute' as const, left: c.cx - c.r, top: c.cy - c.r, width: 2 * c.r, height: 2 * c.r, borderRadius: c.r, overflow: 'hidden' as const });
const shineIn = (c: Circle) => ({ position: 'absolute' as const, left: c.r - SHINE_SIZE.width / 2, top: c.r - SHINE_SIZE.height / 2, ...SHINE_SIZE });

/** Every animated value of the opening, made once: the three clocks, the exit's targets and the nodes they drive. */
function build(F: number) {
  const t = new Animated.Value(0);
  const e = new Animated.Value(0);
  const veil = new Animated.Value(1);
  const tl = timeline(F);
  const L = lockup(F);
  const on = (r: Range) => t.interpolate({ inputRange: r.inputRange, outputRange: r.outputRange, extrapolate: 'clamp' });
  const deg = (r: Range) => t.interpolate({ inputRange: r.inputRange, outputRange: r.outputRange.map((v) => `${v}deg`), extrapolate: 'clamp' });
  const off = (r: Range) => e.interpolate({ inputRange: r.inputRange, outputRange: r.outputRange, extrapolate: 'clamp' });
  // After a tap part-way through, the story calms as the mark flies off (1 → 0): its lights go out and its heads come
  // upright, so it lands as the logo. At the timeline's end they already are, and this changes nothing.
  const story = Animated.subtract(1, off(EXIT_TRACKS.calm));
  const lit = (r: Range) => Animated.multiply(on(r), story);
  const lean = Animated.multiply(on(tl.lean), story);
  // Each head rises a hair as it leans (HEAD_LIFT a degree), so its inner rim keeps clear of its shoulder.
  const headUp = lean.interpolate({ inputRange: [-360, 360], outputRange: [-360 * HEAD_LIFT, 360 * HEAD_LIFT] });
  const pivot = (p: Point, turn: Animated.AnimatedInterpolation<string>) => [
    { translateY: headUp },
    { translateX: p.x - BOX / 2 },
    { translateY: p.y - BOX / 2 },
    { rotate: turn },
    { translateX: BOX / 2 - p.x },
    { translateY: BOX / 2 - p.y },
  ];

  // The exit, either way, on the one clock e: `lifting` and `landing` weigh the two (1 and 0 until the exit picks the
  // match cut), and where it takes the lockup (the mark's pose, the name's move) is set just before e starts.
  const lifting = new Animated.Value(1);
  const landing = new Animated.Value(0);
  const markTo = { x: new Animated.Value(0), y: new Animated.Value(L.TY_END), k: new Animated.Value(S_END) };
  const nameTo = { x: new Animated.Value(0), y: new Animated.Value(0), grow: new Animated.Value(0) };
  const progress = Animated.add(Animated.multiply(off(EXIT_TRACKS.lift), lifting), Animated.multiply(off(EXIT_TRACKS.fly), landing));
  // The mark goes from its pose on the main clock (which plays on underneath) to the exit's: exactly where it is at
  // the start, so a tap never makes it jump, and exactly on target at the end (lib/intro-timeline flight).
  const markY = on(tl.mark.y);
  const markK = on(tl.mark.scale);
  const toward = (live: Animated.AnimatedInterpolation<number>, target: Animated.Value) => Animated.add(live, Animated.multiply(progress, Animated.subtract(target, live)));
  const either = (lifted: Range, cut: Range) => Animated.add(Animated.multiply(off(lifted), lifting), Animated.multiply(off(cut), landing));
  // The lockup lifts and is gone before the curtain's edge gets to it. In the match cut the mark stays until it has
  // landed on the screen's own logo, and the name fades on its way (the screen's title is uncovered only after).
  const markOpacity = Animated.multiply(either(EXIT_TRACKS.lockupOpacity, EXIT_TRACKS.markCut), veil.interpolate({ ...VEIL_MARK, extrapolate: 'clamp' }));
  const nameOpacity = either(EXIT_TRACKS.lockupOpacity, EXIT_TRACKS.nameCut);
  // The navy rises off the screen like a curtain, by the screen's height, the seam and its feather (set with the exit).
  const rise = new Animated.Value(0);

  const comet = (c: (typeof tl)['cometL']) => ({
    opacity: lit(c.opacity),
    transform: [{ translateX: on(c.x) }, { translateY: on(c.y) }, { rotate: deg(c.angle) }, { scale: on(c.scale) }],
  });
  return {
    t,
    e,
    veil,
    tl,
    L,
    /** Where the exit takes the lockup, and the screen's height for the curtain (set before the exit clock starts). */
    aim(to: ExitTo, land: boolean, height: number) {
      lifting.setValue(land ? 0 : 1);
      landing.setValue(land ? 1 : 0);
      rise.setValue(-(height + CURTAIN_SEAM + FEATHER));
      markTo.x.setValue(to.mark.x);
      markTo.y.setValue(to.mark.y);
      markTo.k.setValue(to.mark.k);
      nameTo.x.setValue(to.name.x);
      nameTo.y.setValue(to.name.y);
      nameTo.grow.setValue(to.name.k - 1);
    },
    // The still path's veil only: every exit is the curtain.
    root: veil,
    curtainY: Animated.multiply(off(EXIT_TRACKS.curtain), rise),
    ambience: on(tl.ambience),
    // The mark's own rise and shrink into the lockup (t), and its way off (e). Its glass layers overlap, so it fades
    // as one picture.
    markStyle: {
      opacity: markOpacity,
      transform: [{ translateX: Animated.multiply(progress, markTo.x) }, { translateY: toward(markY, markTo.y) }, { scale: toward(markK, markTo.k) }],
    },
    nameStyle: {
      opacity: nameOpacity,
      transform: [
        { translateX: Animated.multiply(progress, nameTo.x) },
        { translateY: Animated.add(L.WORD_Y, Animated.multiply(progress, nameTo.y)) },
        { scale: Animated.add(1, Animated.multiply(progress, nameTo.grow)) },
      ],
    },
    // The aura goes as the lockup moves off: none of it is left around the landed mark.
    auraStyle: { opacity: Animated.multiply(on(tl.aura.opacity), Animated.subtract(1, progress)), transform: [{ scale: on(tl.aura.scale) }] },
    fillStyles: tl.fill.map((f) => ({ opacity: lit(f.opacity) })),
    ringStyle: { opacity: lit(tl.ring.opacity), transform: [{ scale: on(tl.ring.scale) }] },
    // Each head turns toward the other about its outer neck corner: the cyan one by +lean, the coral one by -lean.
    coralGroupStyle: { transform: pivot(PIVOT_CORAL, lean.interpolate({ inputRange: [-360, 360], outputRange: ['360deg', '-360deg'] })) },
    cyanGroupStyle: { transform: pivot(PIVOT_CYAN, lean.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] })) },
    coralShineStyle: { opacity: lit(tl.coralShine.opacity), transform: [{ translateX: on(tl.coralShine.x) }, { rotate: '-20deg' }] },
    cyanShineStyle: { opacity: lit(tl.cyanShine.opacity), transform: [{ translateX: on(tl.cyanShine.x) }, { rotate: '20deg' }] },
    sparkHaloStyle: { opacity: lit(tl.sparkHalo.opacity), transform: [{ scale: on(tl.sparkHalo.scale) }] },
    sparkStyle: { opacity: lit(tl.spark.opacity), transform: [{ scale: on(tl.spark.scale) }, { rotate: deg(tl.spark.rotate) }] },
    comets: [comet(tl.cometL), comet(tl.cometR)],
    streaks: tl.streaks.map((b) => ({ opacity: lit(b.opacity), transform: [{ translateX: on(b.x) }, { translateY: on(b.y) }, { rotate: deg(b.angle) }] })),
    tipBloomStyle: { opacity: lit(tl.tipBloom.opacity), transform: [{ scale: on(tl.tipBloom.scale) }] },
    tipFlashStyle: { opacity: lit(tl.tipFlash.opacity), transform: [{ scale: on(tl.tipFlash.scale) }, { rotate: deg(tl.tipFlash.rotate) }] },
    letters: tl.letters.map((l) => ({ opacity: on(l.opacity), transform: [{ translateX: on(l.x) }, { translateY: on(l.y) }] })),
  };
}

export function Intro() {
  const { reduceMotion } = useSettings();
  // Decided once, at mount: already played (a store reset remounts the app), or "Animasyonları azalt" is on. Then the
  // only transition is the native splash's own short fade.
  const [off] = useState(() => played || reduceMotion);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!off) return;
    played = true;
    readyNow();
  }, [off]);
  const finish = useCallback(() => {
    played = true;
    setDone(true);
  }, []);
  if (off || done) return null;
  return <Opening reduceMotion={reduceMotion} onDone={finish} />;
}

function Opening({ reduceMotion, onDone }: { reduceMotion: boolean; onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const [n] = useState(() => build(fontSizeFor(width)));
  const splashOff = useSyncExternalStore(subscribeGone, isGone, isGone);
  // null until the phone says whether it asks for reduced motion; meanwhile the splash pose holds.
  const [still, setStill] = useState<boolean | null>(null);
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const startedAt = useRef(0);
  const cover = useRef<HostInstance | null>(null);
  const coverHeight = useRef(height);
  const nameWidth = useRef(0);
  const cancelWait = useRef<() => void>(() => {});

  // The failsafe: whatever happens, the cover never stays. `soft` leaves as a tap does; `hard` unmounts it.
  const timers = useRef<{ soft?: ReturnType<typeof setTimeout>; hard?: ReturnType<typeof setTimeout> }>({});
  const leaveRef = useRef<(fast: boolean) => void>(() => {});
  const arm = useCallback(
    (soft: number | null, hard: number) => {
      clearTimeout(timers.current.soft);
      clearTimeout(timers.current.hard);
      timers.current.soft = soft === null ? undefined : setTimeout(() => leaveRef.current(true), soft);
      timers.current.hard = setTimeout(onDone, hard);
    },
    [onDone],
  );
  useEffect(() => {
    const own = timers.current;
    const wait = cancelWait;
    return () => {
      clearTimeout(own.soft);
      clearTimeout(own.hard);
      wait.current();
    };
  }, []);

  // The phone's reduce-motion answer, taken as "yes" when it doesn't come in time; and the failsafe until the clock runs.
  useEffect(() => {
    let live = true;
    const answer = (v: boolean) => live && setStill((s) => s ?? v);
    AccessibilityInfo.isReduceMotionEnabled().then(
      (v) => answer(!!v),
      () => answer(true),
    );
    const wait = setTimeout(() => answer(true), OS_WAIT);
    if (!startedAt.current && !leavingRef.current) arm(FAILSAFE, FAILSAFE + EXIT_FAST + FAILSAFE_GRACE);
    return () => {
      live = false;
      clearTimeout(wait);
    };
  }, [arm]);

  useEffect(
    () => () => {
      n.t.stopAnimation();
      n.e.stopAnimation();
      n.veil.stopAnimation();
    },
    [n],
  );

  // The exit itself (e: 0 → EXIT): the curtain rises, the lockup lands or lifts away, then the cover goes. The main
  // clock keeps running underneath, so a skip never freezes the picture; the app beneath takes touches at once.
  const run = useCallback(
    (fast: boolean, to: ExitTo, land: boolean, screenHeight: number) => {
      n.aim(to, land, screenHeight > 0 ? screenHeight : coverHeight.current);
      const duration = fast ? EXIT_FAST : EXIT;
      arm(null, duration + FAILSAFE_GRACE);
      setLeaving(true);
      Animated.timing(n.e, { toValue: EXIT, duration, easing: Easing.linear, useNativeDriver: NATIVE }).start(onDone);
    },
    [n, onDone, arm],
  );

  // Where the exit takes the lockup: over the sign-in screen onto its own logo and title, elsewhere (or when they
  // can't be measured in time) a little lift from wherever the mark is now.
  const land = useCallback(
    (fast: boolean) => {
      const ms = startedAt.current ? Math.min(TOTAL, Date.now() - startedAt.current) : 0;
      const lift = liftTo(n.L.F, markPose(n.tl, ms));
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const go = (to: ExitTo, landing: boolean, h: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        run(fast, to, landing, h);
      };
      const box = cover.current;
      if (!box) return go(lift, false, coverHeight.current);
      timer = setTimeout(() => go(lift, false, coverHeight.current), LANDING_WAIT);
      box.measureInWindow((x, y, w, h) => {
        const measure = lander;
        if (!measure || !nameWidth.current) return go(lift, false, h);
        measure((to) => {
          const cut = to ? matchCut(n.L.F, { x, y, width: w, height: h } satisfies Rect, nameWidth.current, to) : null;
          go(cut ?? lift, !!cut, h);
        });
      });
    },
    [n, run],
  );

  // From a tap, the failsafe or the end of the timeline, once: as soon as the screen beneath has drawn (at once,
  // nearly always), the exit.
  const leave = useCallback(
    (fast: boolean) => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      played = true;
      arm(null, DRAWN_WAIT + DRAWN_FRAME + LANDING_WAIT + EXIT + FAILSAFE_GRACE);
      cancelWait.current = whenUncover(Date.now(), () => land(fast));
    },
    [arm, land],
  );
  useEffect(() => {
    leaveRef.current = leave;
  }, [leave]);

  // The clock starts on the first frame after the native splash has gone, unless motion is off or a tap came first.
  useEffect(() => {
    if (!splashOff || still !== false || reduceMotion || startedAt.current || leavingRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (startedAt.current || leavingRef.current) return;
      startedAt.current = Date.now();
      played = true;
      // From here the failsafe counts from the clock's own start, so a late start never cuts the opening short.
      arm(FAILSAFE_RUN, FAILSAFE_RUN + EXIT_FAST + FAILSAFE_GRACE);
      Animated.timing(n.t, { toValue: TOTAL, duration: TOTAL, easing: Easing.linear, useNativeDriver: NATIVE }).start(({ finished }) => {
        if (finished) leave(false);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [splashOff, still, reduceMotion, n, leave, arm]);

  // The phone asks for reduced motion (or never answered): no movement at all. The splash pose dissolves into the app
  // once the native splash has finished its own fade over it and the screen beneath has drawn.
  useEffect(() => {
    if (!splashOff || still !== true || startedAt.current || leavingRef.current) return;
    leavingRef.current = true;
    played = true;
    arm(null, DRAWN_WAIT + DRAWN_FRAME + VEIL + FAILSAFE_GRACE);
    cancelWait.current = whenUncover(goneAt + SPLASH_FADE, () => {
      Animated.timing(n.veil, { toValue: 0, duration: VEIL, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }).start(onDone);
    });
  }, [splashOff, still, n, onDone, arm]);

  // "Animasyonları azalt" switched on while it plays: it leaves at once.
  useEffect(() => {
    if (reduceMotion) leave(true);
  }, [reduceMotion, leave]);

  const through = leaving || reduceMotion || still === true;
  const { L } = n;
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, s.root, { opacity: n.root, pointerEvents: through ? 'none' : 'auto' }]}
      onLayout={(ev: LayoutChangeEvent) => {
        coverHeight.current = ev.nativeEvent.layout.height;
      }}
    >
      {/* The navy and its room light (cyan from the top left, coral from the bottom right, darker at the top and
          bottom). Every exit raises it off the screen like a curtain; its soft lower edge waits below the screen,
          overlapping the navy by CURTAIN_SEAM (solid there), so no seam opens between the two as it moves. */}
      <Animated.View style={[s.curtain, { transform: [{ translateY: n.curtainY }] }]}>
        <View style={s.navy} />
        <Animated.View style={[s.sky, { opacity: n.ambience }]}>
          <LinearGradient colors={AMBIENT_A} locations={[0, 0.5, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={AMBIENT_B} locations={[0, 0.28, 0.72, 1]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <LinearGradient colors={FEATHER_FADE} locations={FEATHER_AT} style={s.feather} />
      </Animated.View>

      <View ref={cover} collapsable={false} style={s.layer}>
        <Animated.View needsOffscreenAlphaCompositing style={[s.box, n.markStyle]}>
          <Animated.Image source={AURA} fadeDuration={0} style={[s.full, n.auraStyle]} />
          <Image source={HEART} fadeDuration={0} onLoad={onHeart} style={s.full} />
          {/* Light rising from the tip: the lit heart up to 35%, 70% and all of its height, cross-faded in turn. */}
          {[FILL_1, FILL_2, FILL_3].map((source, i) => (
            <Animated.Image key={i} source={source} fadeDuration={0} style={[s.fill, n.fillStyles[i]]} />
          ))}
          <Animated.Image source={RING} fadeDuration={0} style={[s.ring, n.ringStyle]} />
          <Animated.View style={[s.full, n.coralGroupStyle]}>
            <Image source={HEAD_CORAL} fadeDuration={0} onLoad={onCoral} style={s.full} />
            <View style={s.coralClip}>
              <Animated.Image source={SHINE} fadeDuration={0} style={[s.coralShine, n.coralShineStyle]} />
            </View>
          </Animated.View>
          <Animated.View style={[s.full, n.cyanGroupStyle]}>
            <Image source={HEAD_CYAN} fadeDuration={0} onLoad={onCyan} style={s.full} />
            <View style={s.cyanClip}>
              <Animated.Image source={SHINE} fadeDuration={0} style={[s.cyanShine, n.cyanShineStyle]} />
            </View>
          </Animated.View>
          <Animated.Image source={GLOW} fadeDuration={0} style={[s.sparkHalo, n.sparkHaloStyle]} />
          <Animated.Image source={STAR} fadeDuration={0} style={[s.spark, n.sparkStyle]} />
          {/* Two streaks trail each light on its own path, so the trail bends with the rim. */}
          {n.streaks.map((style, i) => (
            <Animated.Image key={i} source={STREAK_LAYERS[i].source} fadeDuration={0} style={[STREAK_LAYERS[i].style, style]} />
          ))}
          <Animated.Image source={COMET_CYAN} fadeDuration={0} style={[s.comet, n.comets[0]]} />
          <Animated.Image source={COMET_CORAL} fadeDuration={0} style={[s.comet, n.comets[1]]} />
          <Animated.Image source={GLOW} fadeDuration={0} style={[s.tipBloom, n.tipBloomStyle]} />
          <Animated.Image source={STAR} fadeDuration={0} style={[s.tipFlash, n.tipFlashStyle]} />
        </Animated.View>
      </View>

      {/* The name, letter by letter; the phone's text size doesn't change it (it is part of the logo). */}
      <View style={s.layer}>
        <Animated.View
          style={[s.row, n.nameStyle]}
          onLayout={(ev: LayoutChangeEvent) => {
            nameWidth.current = ev.nativeEvent.layout.width;
          }}
        >
          {LETTERS.map((l, i) => (
            <Fragment key={i}>
              <Animated.View style={n.letters[i]}>
                <Text
                  allowFontScaling={false}
                  accessible={false}
                  style={[{ fontSize: L.F, lineHeight: L.lineHeight, fontWeight: '800', letterSpacing: 0, color: l.color }, l.color === WORD_CYAN ? s.cyanGlow : s.coralGlow]}
                >
                  {l.ch}
                </Text>
              </Animated.View>
              {i === WORD_BREAK && <View style={{ width: L.space }} />}
            </Fragment>
          ))}
        </Animated.View>
      </View>

      <Pressable style={StyleSheet.absoluteFill} onPress={() => leave(true)} accessibilityRole="button" accessibilityLabel="Similar Club" accessibilityHint="Açılışı geçmek için dokun" />
    </Animated.View>
  );
}

const AMBIENT_A = ['rgba(19,217,223,0.10)', 'rgba(1,14,41,0)', 'rgba(255,90,122,0.08)'] as const;
const AMBIENT_B = ['rgba(0,6,20,0.55)', 'rgba(0,6,20,0)', 'rgba(0,6,20,0)', 'rgba(0,6,20,0.65)'] as const;
// The curtain's soft lower edge: the navy as the room light leaves it at the bottom of the screen (AMBIENT_B's last
// stop over SPLASH_NAVY), solid over the seam, then to nothing along a smoothstep (lib/intro-timeline FEATHER_STOPS).
const FEATHER_FADE = FEATHER_STOPS.alpha.map((a) => `rgba(0,9,27,${a})`) as [string, string, ...string[]];
const FEATHER_AT = FEATHER_STOPS.locations as [number, number, ...number[]];

const s = StyleSheet.create({
  // Clipped, so the curtain's feather below the screen never shows (or scrolls) until the curtain rises.
  root: { zIndex: 1000, elevation: 1000, overflow: 'hidden' },
  // The screen, then the overlap and the soft edge below it: the navy reaches CURTAIN_SEAM past the screen's bottom,
  // the room light ends at it, and the soft edge starts at it.
  curtain: { position: 'absolute', top: 0, right: 0, bottom: -(CURTAIN_SEAM + FEATHER), left: 0, pointerEvents: 'none' },
  navy: { position: 'absolute', top: 0, right: 0, bottom: FEATHER, left: 0, backgroundColor: SPLASH_NAVY },
  sky: { position: 'absolute', top: 0, right: 0, bottom: CURTAIN_SEAM + FEATHER, left: 0 },
  feather: { position: 'absolute', right: 0, bottom: 0, left: 0, height: CURTAIN_SEAM + FEATHER },
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  box: { width: BOX, height: BOX },
  full: { position: 'absolute', left: 0, top: 0, width: BOX, height: BOX },
  fill: boxed(FILL_BOX),
  ring: boxed(RING_BOX),
  coralClip: clipOf(HEAD_CORAL_CLIP),
  cyanClip: clipOf(HEAD_CYAN_CLIP),
  coralShine: shineIn(HEAD_CORAL_CLIP),
  cyanShine: shineIn(HEAD_CYAN_CLIP),
  sparkHalo: { ...around(SPARK_AT, 60), tintColor: HALO },
  spark: { ...around(SPARK_AT, 36), tintColor: SPARK },
  // The comet's head is the sprite's centre, put on the box's origin: the path moves it from there.
  comet: around({ x: 0, y: 0 }, COMET_SIZE.width, COMET_SIZE.height),
  tipBloom: { ...around(TIP, 72), tintColor: TIP_GLOW },
  tipFlash: { ...around(TIP, 32), tintColor: SPARK },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  // A faint glow in each word's own colour ties the type to the neon mark.
  cyanGlow: { textShadowColor: WORD_CYAN_GLOW, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
  coralGlow: { textShadowColor: WORD_CORAL_GLOW, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
});
// The streaks: centred on the box's origin (their paths move and turn them from there), in the order of
// timeline().streaks (the left comet's, then the right one's).
const STREAK_LAYERS = [STREAK_CYAN, STREAK_CORAL].flatMap((source) =>
  STREAKS.map((b) => ({ source, style: around({ x: 0, y: 0 }, STREAK_SIZE.width * b.size, STREAK_SIZE.height * b.size) })),
);
