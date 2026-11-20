// The opening's timeline (components/fx/intro), "İki insan, tek kalp": every keyframe, ease and table, with no
// react-native import, so the tests read exactly what the phones play.
//
// The story, on one clock t in ms (0 → TOTAL), then an exit clock e (0 → EXIT):
//   0-200      hold: exactly the native splash's picture while the splash fades over it
//   200-820    the mark breathes and the room light comes up
//   200-860    the two glass heads glance at each other, then lean in on a spring (rising a hair as they lean, so
//              each keeps the logo's dark gap above its shoulder)
//   560-900    a spark lights in the gap between them; a soft glint crosses each glass head
//   660-1100   two lights run down each person's side of the heart, just outside its rim, each trailing two streaks
//              on its own path, and meet at the tip, where they swell into its flash
//   1095-1315  light rises from the tip and fills the heart in its own colours (three soft-edged stages, cross-faded)
//   1120-1520  the heads come back upright, exactly to the logo's pose
//   1170-1540  the heart beats once (lub, dub) with a soft aura; on the lub a thin bright ring ripples off its edges
//              (1250-1470) and fades as it goes
//   1300-1760  the mark rises and shrinks into the lockup (from the dub on)
//   1500-1984  "Similar" lands from the left, "Club" from the right, from the middle outwards; the finished name
//              then rests for more than 450 ms
//   1960-2160  one glint crosses both glass heads
//   exit       the navy rises off the screen like a curtain, uncovering the app from the bottom up. Over the sign-in
//              screen the mark flies onto that screen's own logo meanwhile, while the name fades on its way to the
//              title (a match cut); elsewhere the lockup lifts a little and is gone before the curtain's edge gets to
//              it. A tap runs the same exit, faster, from wherever the mark is: as it flies its lights go out and the
//              heads come upright, so it lands as the logo. It never uncovers a screen that hasn't drawn yet.
//
// Phones (React Native 0.88, the default native animation backend) ignore an interpolation's `easing` and run every
// segment linearly; only Animated.timing's own easing runs there. So no interpolation here has an easing: every curve
// is baked into extra keyframe stops (stops(), sampled()), which are plain linear segments everywhere.
import { COMET_LEFT, COMET_RIGHT, EDGE_LEFT, EDGE_RIGHT, LOGO_MARK, MARK_BOX, MARK_SHAPE, TIP, type Edge, type Point } from '@/lib/intro-path';

// ---- Clocks ----

/** The main timeline in ms; the clock runs linearly from 0 to TOTAL. */
export const TOTAL = 2280;
/** Nothing moves before this: the native splash fades out (SPLASH_FADE, lib/splash) over an identical picture. */
export const HOLD = 200;
/** The exit clock: 0 → EXIT linearly, in EXIT ms at the end and in EXIT_FAST ms after a tap. */
export const EXIT = 400;
export const EXIT_FAST = 300;
/**
 * The longest the cover waits for the first screen beneath it to draw (ms after the native splash went) before it
 * uncovers it anyway: the still path's veil and every exit start only once that screen has drawn (on the web its code
 * arrives a few hundred ms after the cover), so they never dissolve into an empty page.
 */
export const DRAWN_WAIT = 600;
/** A screen that says it has drawn is on the glass a frame later. */
export const DRAWN_FRAME = 17;
/**
 * Whatever happens, the cover never stays. No main clock this long after it mounts (the splash hand-over never came):
 * it leaves as after a tap. Once the clock runs, the same happens FAILSAFE_RUN after the clock started if the
 * timeline's end never came (a lost callback, a paused tab), so a late start on a busy phone never cuts it short.
 * And an exit that started unmounts the cover at the latest FAILSAFE_GRACE after it should have ended.
 */
export const FAILSAFE = 3000;
export const FAILSAFE_RUN = 3500;
export const FAILSAFE_GRACE = 300;
/** No answer from the phone's reduce-motion setting by then: the opening takes the still path. */
export const OS_WAIT = 500;
/** The still path (phone's reduce-motion on): the splash pose dissolves into the app in this long. */
export const VEIL = 200;

/**
 * When the cover may start uncovering the app (the still path's veil, or an exit), on the clock of its arguments:
 * not before `earliest` (the native splash's own fade is over, or the tap came), and one frame after the first screen
 * said it has drawn (`drawnAt`; null while it hasn't), but never later than DRAWN_WAIT after the splash went
 * (`goneAt`), so a screen that never says so can't hold the cover up.
 */
export function uncoverAt(earliest: number, drawnAt: number | null, goneAt: number): number {
  const latest = Math.max(earliest, goneAt + DRAWN_WAIT);
  return drawnAt === null ? latest : Math.min(Math.max(earliest, drawnAt + DRAWN_FRAME), latest);
}
/**
 * On the still path the mark goes first, like the lockup on the main exit: its opacity against the veil's (1 → 0), so
 * it is gone while the navy is still over half there (about the first 95 ms) and never ghosts over the screen beneath.
 */
export const VEIL_MARK: Range = { inputRange: [0, 0.55, 1], outputRange: [0, 0, 1] };

// ---- Colours (the logo's, whatever the app theme) ----

/** "Similar": the logo's cyan, 11.0:1 on the navy. */
export const WORD_CYAN = '#13D9DF';
/** "Club": the logo's coral lifted for the type (6.2:1); the logo's literal #F54366 is 5.4:1. */
export const WORD_CORAL = '#FF5470';
export const SPARK = '#FFF4EC';
export const HALO = '#FFD3E6';
export const TIP_GLOW = '#FF6FD8';
/** The name's glow: each word's own colour, faint. */
export const WORD_CYAN_GLOW = 'rgba(19,217,223,0.35)';
export const WORD_CORAL_GLOW = 'rgba(255,84,112,0.35)';

// ---- Eases ----

export type Ease = (x: number) => number;

/** A CSS cubic-bezier(x1, y1, x2, y2) as a function of progress 0..1. */
export function bezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dsx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  const solve = (x: number) => {
    let u = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(u) - x;
      if (Math.abs(err) < 1e-9) return u;
      const d = dsx(u);
      if (Math.abs(d) < 1e-6) break;
      u -= err / d;
      if (u < 0 || u > 1) break;
    }
    let lo = 0;
    let hi = 1;
    u = x;
    for (let i = 0; i < 60 && hi - lo > 1e-10; i++) {
      if (sx(u) < x) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return u;
  };
  return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)));
}

/**
 * A damped spring (damping ratio zeta, angular frequency omega) run for D seconds, squeezed into 0..1 and nudged so it
 * ends exactly on 1: x(r * D) + (1 - x(D)) * r. With the defaults it overshoots to 1.173 at r ≈ 0.456.
 */
export function springEase(D = 0.5, zeta = 0.5, omega = 16): Ease {
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  const x = (s: number) => 1 - Math.exp(-zeta * omega * s) * (Math.cos(wd * s) + ((zeta * omega) / wd) * Math.sin(wd * s));
  const end = x(D);
  return (r) => (r <= 0 ? 0 : r >= 1 ? 1 : x(r * D) + (1 - end) * r);
}

export const LIN: Ease = (x) => x;
export const OUTC = bezier(0.33, 1, 0.68, 1);
export const SINE = bezier(0.37, 0, 0.63, 1);
export const STD = bezier(0.4, 0, 0.2, 1);
export const EXPO = bezier(0.16, 1, 0.3, 1);
export const EIN = bezier(0.4, 0, 1, 1);
export const IO = bezier(0.45, 0, 0.55, 1);
export const SETTLE = bezier(0.5, 0, 0.1, 1);
/** The match cut's flight: off gently, down softly, and never more than about 28 dp in a frame over 230 dp. */
export const FLY = bezier(0.4, 0, 0.3, 1);
export const SPRING = springEase();

// ---- Keyframes ----

/** A keyframe: [ms, value, ease of the segment that starts here (none: linear)]. A step is two keys 1 ms apart. */
export type Key = readonly [ms: number, value: number, ease?: Ease];
/** What an interpolation takes: linear segments between the stops. */
export type Range = { inputRange: number[]; outputRange: number[] };

/** The rising light's stages at their brightest (they brighten the glass in its own colours, scripts/intro-layers.py). */
export const FILL_PEAK = 0.55;
/** The beat's ring at its brightest, and how far it spreads (its scale about the ring's box). */
export const RING_PEAK = 0.75;
export const RING_SPREAD = 1.12;

/** Stops per eased segment: 16 linear pieces are smooth at 60 fps for the longest segment here (700 ms). */
export const SAMPLES = 16;

/** Keyframes as interpolation stops, each eased segment baked into SAMPLES linear pieces. */
export function stops(keys: readonly Key[]): Range {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  keys.forEach(([ms, v, ease], i) => {
    inputRange.push(ms);
    outputRange.push(v);
    const next = keys[i + 1];
    if (next && ease && ease !== LIN) {
      for (let k = 1; k < SAMPLES; k++) {
        const x = k / SAMPLES;
        inputRange.push(ms + x * (next[0] - ms));
        outputRange.push(v + ease(x) * (next[1] - v));
      }
    }
  });
  return { inputRange, outputRange };
}

/** A curve made of several (a product, a sum of springs) sampled every `step` ms from `from` to `to` (both ends kept). */
export function sampled(fn: (ms: number) => number, from: number, to: number, step = 10): Range {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  const n = Math.ceil((to - from) / step);
  for (let i = 0; i <= n; i++) {
    const ms = i === n ? to : from + i * step;
    inputRange.push(ms);
    outputRange.push(fn(ms));
  }
  return { inputRange, outputRange };
}

/** Keyframes evaluated exactly (with their eases), held before the first and after the last. */
export function track(keys: readonly Key[]): (ms: number) => number {
  return (ms) => {
    if (ms <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [m0, v0, ease] = keys[i];
      const [m1, v1] = keys[i + 1];
      if (ms < m1) return v0 + (ease ?? LIN)((ms - m0) / (m1 - m0)) * (v1 - v0);
    }
    return keys[keys.length - 1][1];
  };
}

/** What an interpolation with extrapolate 'clamp' gives at ms: what the screen shows. */
export function at(r: Range, ms: number): number {
  const { inputRange: x, outputRange: y } = r;
  if (ms <= x[0]) return y[0];
  const last = x.length - 1;
  if (ms >= x[last]) return y[last];
  let i = 1;
  while (x[i] < ms) i++;
  return y[i - 1] + ((ms - x[i - 1]) / (x[i] - x[i - 1])) * (y[i] - y[i - 1]);
}

// ---- Geometry (dp in the mark's 200 dp box, lib/intro-path) ----

/** Each head leans about its outer neck corner, where it and the heart part, so the outer neck never cracks. */
export const PIVOT_CYAN: Point = { x: EDGE_LEFT.x[0], y: EDGE_LEFT.y[0] };
export const PIVOT_CORAL: Point = { x: EDGE_RIGHT.x[0], y: EDGE_RIGHT.y[0] };
/** The middle of the gap between the two heads at the lean's peak: where the spark lights. */
export const SPARK_AT: Point = { x: 101.7, y: 51.5 };
/** Each head rises this far (dp) per degree of its lean: 2 dp at the peak, so its inner rim stays clear of its shoulder. */
export const HEAD_LIFT = -2 / 11.45;
/**
 * The sprites' sizes (assets/intro, scripts/intro-layers.py): the glint, the comet (its head at its centre, its tail
 * 28 dp behind) and the streak (centred).
 */
export const SHINE_SIZE = { width: 44, height: 72 };
export const COMET_SIZE = { width: 64, height: 14 };
export const STREAK_SIZE = { width: 18, height: 8 };
/**
 * The two streaks trailing each comet on its own path, each turned to the path where it is: how far behind (ms), their
 * size (times STREAK_SIZE) and opacity. Close enough that they overlap the comet's tail and each other even where the
 * light runs fastest, so the trail is one bending run of light, not dots.
 */
export const STREAKS = [
  { lag: 16, size: 1, opacity: 0.85 },
  { lag: 32, size: 0.8, opacity: 0.55 },
] as const;

// ---- The lockup: the mark over the name ----

/** The mark's scale in the lockup, and the gap between its tip and the name's cap line. */
export const S_END = 0.72;
export const GAP = 20;
/** Half the drawn mark's height (head tops to tip, centred in the box). */
export const HALF_MARK = TIP.y - MARK_BOX / 2;
/** The cap line above the word row's centre, in font sizes (Plus Jakarta Sans ExtraBold, line height 1.25). */
export const CAP_TOP = 0.349;
/** The space between "Similar" and "Club", in font sizes. */
export const WORD_SPACE = 0.18;

/** The name's font size for a window width: 34 at 393 dp, 31 at 360, 28 at 320. */
export function fontSizeFor(width: number) {
  return Math.min(34, Math.round(width * 0.087));
}

/** Where the mark ends (TY_END, its box centre from the screen's) and the word row's centre (WORD_Y), for font size F. */
export function lockup(F: number) {
  const TY_END = -(2 * HALF_MARK * S_END + GAP + 0.771 * F) / 2 - 10 + HALF_MARK * S_END;
  const WORD_Y = TY_END + HALF_MARK * S_END + GAP + 0.36 * F;
  return { F, TY_END, WORD_Y, lineHeight: Math.round(1.25 * F), space: WORD_SPACE * F };
}

// ---- Tables ----

/** The comets' times along the 24 points of their paths: they speed up toward the tip. */
export const COMET_MS = COMET_LEFT.x.map((_, i) => Math.round(660 + 440 * (i / (COMET_LEFT.x.length - 1)) ** 0.625));

export type Letter = { ch: string; k: number; dx: number; color: string };
/** "Similar Club", letter by letter: rank k from the middle out (start letterStart(k)), arriving from dx. */
export const LETTERS: readonly Letter[] = [
  ...'Similar'.split('').map((ch, i) => ({ ch, k: 6 - i, dx: -(10 + 2 * (6 - i)), color: WORD_CYAN })),
  ...'Club'.split('').map((ch, i) => ({ ch, k: i, dx: 10 + 2 * i, color: WORD_CORAL })),
];
/** The space between the words comes after this letter (the r). */
export const WORD_BREAK = 6;
export const letterStart = (k: number) => 1500 + 24 * k;
/** Each letter fades in this long, slides in LETTER_MOVE and rises LETTER_RISE font sizes (a hint, so the line stays level). */
export const LETTER_FADE = 160;
export const LETTER_MOVE = 340;
export const LETTER_RISE = 0.1;

/** Every animated view of the opening besides the letters (components/fx/intro draws each once). */
export const LAYERS = [
  'root',
  'curtain',
  'ambience',
  'mark',
  'name',
  'aura',
  'fill1',
  'fill2',
  'fill3',
  'ring',
  'coralGroup',
  'coralShine',
  'cyanGroup',
  'cyanShine',
  'sparkHalo',
  'spark',
  'streakL1',
  'streakL2',
  'streakR1',
  'streakR2',
  'cometL',
  'cometR',
  'tipBloom',
  'tipFlash',
] as const;
/** The budget is about 35 animated views (transform and opacity only, on the native driver). */
export const ANIMATED_VIEWS = LAYERS.length + LETTERS.length;

// ---- Tracks ----

/** A light on its path, `lag` ms behind the comet: where it is, and which way it heads. */
const onPath = (path: Edge, lag = 0) => {
  const times = COMET_MS.map((ms) => ms + lag);
  return {
    x: { inputRange: times, outputRange: [...path.x] },
    y: { inputRange: times, outputRange: [...path.y] },
    angle: { inputRange: times, outputRange: [...path.angle] },
  };
};

const comet = (path: Edge) => ({
  ...onPath(path),
  opacity: stops([[660, 0], [700, 1], [1085, 1], [1125, 0]]),
  /** It sets off small and stretches to its length (its tail never lies over its head's glass), and both swell into
   * the tip's flash as they meet. */
  scale: stops([[660, 0.4, OUTC], [780, 1], [1040, 1, SINE], [1095, 1.9, OUTC], [1125, 1.5]]),
});

/** A streak trailing a comet: on the same path `lag` ms behind it, turned to it; it fades into the tip's flash. */
const streak = (path: Edge, lag: number, peak: number) => ({
  ...onPath(path, lag),
  opacity: stops([[660 + lag, 0], [720 + lag, peak], [1060, peak], [1105, 0]]),
});

/** The head's lean in degrees (each head turns toward the other by this): a glance, a spring lean, then upright. */
export const leanAt = (() => {
  const glance = track([[200, 0, OUTC], [360, 5]]);
  const lean = track([[360, 0, SPRING], [860, 5.5]]);
  const back = track([[1120, 0, SINE], [1520, -10.5]]);
  return (ms: number) => glance(ms) + lean(ms) + back(ms);
})();

/** The mark rises and shrinks into the lockup over these ms (from the heartbeat's dub on). */
export const RISE = [1300, 1760] as const;

/** The mark's breath and heartbeat, times its shrink into the lockup. */
export const markScaleAt = (() => {
  const pulse = track([
    [200, 1, SINE],
    [480, 1.02, SINE],
    [820, 1],
    [1170, 1, OUTC],
    [1250, 1.06, SINE],
    [1330, 0.992, OUTC],
    [1400, 1.028, SINE],
    [1540, 1],
  ]);
  const p = track([[RISE[0], 0, SETTLE], [RISE[1], 1]]);
  return (ms: number) => pulse(ms) * (1 - (1 - S_END) * p(ms));
})();

/** Every track on the main clock t, for the name at font size F. */
export function timeline(F: number) {
  const { TY_END } = lockup(F);
  return {
    ambience: stops([[200, 0, SINE], [900, 1]]),
    mark: {
      scale: sampled(markScaleAt, 200, RISE[1]),
      y: stops([[RISE[0], 0, SETTLE], [RISE[1], TY_END]]),
    },
    aura: {
      opacity: stops([[1170, 0, OUTC], [1260, 0.35, SINE], [1900, 0.22]]),
      scale: stops([[1170, 0.97, OUTC], [1290, 1.04, SINE], [1900, 1.02]]),
    },
    /**
     * Light rising from the tip: three stages of the lit heart (35%, 70%, all of it), each cross-faded into the next,
     * over 220 ms so the soft edge is seen to climb; the whole heart holds it a moment, then lets it go.
     */
    fill: [
      { opacity: stops([[1095, 0], [1150, FILL_PEAK], [1225, 0]]) },
      { opacity: stops([[1150, 0], [1225, FILL_PEAK], [1315, 0]]) },
      { opacity: stops([[1225, 0], [1315, FILL_PEAK], [1380, FILL_PEAK, SINE], [1800, 0]]) },
    ],
    /**
     * On the lub a thin bright ring ripples off the heart's edges: it is brightest (RING_PEAK) once it is a few dp off
     * the rim, where it reads against the navy instead of melting into the rim's own glow, and it is gone while it is
     * still spreading fast, so it never hangs as a second outline.
     */
    ring: {
      opacity: stops([[1250, 0, OUTC], [1280, RING_PEAK, SINE], [1375, 0]]),
      scale: stops([[1250, 1, OUTC], [1470, RING_SPREAD]]),
    },
    /** Degrees: the cyan head turns by +lean, the coral one by -lean. */
    lean: sampled(leanAt, 200, 1520),
    coralShine: {
      x: stops([[580, -38, STD], [880, 38], [1000, 38], [1001, -38], [2000, -38, STD], [2160, 38]]),
      opacity: stops([[580, 0], [630, 0.45], [820, 0.45], [880, 0], [2000, 0], [2030, 0.4], [2130, 0.4], [2160, 0]]),
    },
    cyanShine: {
      x: stops([[580, 38, STD], [880, -38], [1960, -38, STD], [2120, 38]]),
      opacity: stops([[580, 0], [630, 0.45], [820, 0.45], [880, 0], [1960, 0], [1990, 0.4], [2090, 0.4], [2120, 0]]),
    },
    sparkHalo: {
      opacity: stops([[560, 0, OUTC], [640, 0.6, SINE], [900, 0]]),
      scale: stops([[560, 0.6, EXPO], [700, 1.2], [900, 1.4]]),
    },
    spark: {
      opacity: stops([[560, 0], [620, 1], [720, 1], [820, 0]]),
      scale: stops([[560, 0.2, EXPO], [640, 1.3, EIN], [820, 0.7]]),
      rotate: stops([[560, 0], [820, 60]]),
    },
    cometL: comet(COMET_LEFT),
    cometR: comet(COMET_RIGHT),
    streaks: [
      ...STREAKS.map((b) => streak(COMET_LEFT, b.lag, b.opacity)),
      ...STREAKS.map((b) => streak(COMET_RIGHT, b.lag, b.opacity)),
    ],
    tipBloom: {
      opacity: stops([[1090, 0], [1170, 0.85, OUTC], [1500, 0]]),
      scale: stops([[1090, 0.5, EXPO], [1260, 1.35], [1560, 1.6]]),
    },
    tipFlash: {
      opacity: stops([[1080, 0], [1110, 1], [1240, 1], [1380, 0]]),
      scale: stops([[1080, 0.3, EXPO], [1180, 1.7, SINE], [1380, 1]]),
      rotate: stops([[1080, 0], [1380, 45]]),
    },
    letters: LETTERS.map(({ k, dx }) => {
      const s = letterStart(k);
      return {
        opacity: stops([[s, 0, OUTC], [s + LETTER_FADE, 1]]),
        x: stops([[s, dx, EXPO], [s + LETTER_MOVE, 0]]),
        y: stops([[s, LETTER_RISE * F, EXPO], [s + LETTER_MOVE, 0]]),
      };
    }),
  };
}

export type Timeline = ReturnType<typeof timeline>;

/** The curtain's soft lower edge (dp): the navy fades out over this much as it rises off the screen. */
export const FEATHER = 120;
/**
 * The curtain's navy and its soft edge are two views. Butted together, at a fractional offset each covers the row
 * where they meet only in part and the screen beneath shows through: a light line running up with the curtain. So
 * they overlap by this much (dp): the navy reaches this far below the screen's bottom and the soft edge starts at the
 * screen's bottom, solid over the overlap. The navy's own lower edge always lies under solid feather, the feather's
 * top edge over navy, and at rest the overlap is below the screen (the first frame stays the splash's picture).
 */
export const CURTAIN_SEAM = 2;
/** The curtain's opaque lower edge (dp from the screen's top) on a screen H dp tall, at curtain progress c (0 → 1). */
export const curtainEdge = (H: number, c: number) => H + CURTAIN_SEAM - (H + CURTAIN_SEAM + FEATHER) * c;
/** 1 - smoothstep: how much of the navy is left across its soft edge (0 at its top, 1 at its bottom). */
export const featherLeft = (x: number) => (x <= 0 ? 1 : x >= 1 ? 0 : 1 - x * x * (3 - 2 * x));
/**
 * The soft edge's gradient over its FEATHER + CURTAIN_SEAM dp: solid over the seam, then from the navy as the room
 * light leaves it at the bottom of the screen to nothing, along a smoothstep (its opacity at each stop).
 */
export const FEATHER_STOPS = (() => {
  const h = FEATHER + CURTAIN_SEAM;
  const fade = [0, 0.25, 0.5, 0.75, 1];
  return {
    locations: [0, ...fade.map((f) => (CURTAIN_SEAM + f * FEATHER) / h)],
    alpha: [1, ...fade.map(featherLeft)],
  };
})();

/** The tracks on the exit clock e (0 → EXIT; in EXIT_FAST ms after a tap, so every part keeps its place in it). */
export const EXIT_TRACKS = {
  /**
   * With no sign-in logo to land on, the lockup lifts a little (0 → 1, LIFT) and fades as the curtain starts to
   * uncover the screen from the bottom (so there is never a moment of bare navy), and it is gone before the
   * curtain's edge gets to it (so it never hangs over the uncovered screen).
   */
  lockupOpacity: stops([[0, 1], [30, 1, SINE], [170, 0]]),
  lift: stops([[0, 0, OUTC], [200, 1]]),
  /**
   * Over the sign-in screen the mark flies onto that screen's own logo (0 → 1) and, as the curtain uncovers that
   * beneath it (never faster), fades into it: the same picture, so all that goes is its glow, made for the navy.
   */
  fly: stops([[0, 0, FLY], [320, 1]]),
  markCut: stops([[0, 1], [280, 1], [380, 0]]),
  /** The name only drifts toward the title as it fades: the screen's own title, in its own type, is uncovered later. */
  nameCut: stops([[0, 1, OUTC], [140, 0]]),
  /**
   * After a tap part-way through, the mark is still in its story: its lights go out and its heads come upright as it
   * flies (0 → 1), well before it fades into the screen's logo, so it lands as that same picture. (At the timeline's
   * end it already is: this changes nothing there.)
   */
  calm: stops([[0, 0, SINE], [220, 1]]),
  /**
   * Either way the navy rises off the screen like a curtain (0 → 1 of the screen's height and its FEATHER): no
   * dissolve, so no grey on a light screen and no bare navy. On the sign-in screen it uncovers the title once the name
   * has gone and the logo once the mark is nearly on it.
   */
  curtain: stops([[40, 0, SINE], [EXIT, 1]]),
};

/** The lockup's lift as it goes: up this far (dp) and grown this much, as one picture about the screen's centre. */
export const LIFT = { y: -16, scale: 1.04 };

/** Where the mark's box stands: its centre's offset (dp) from the screen's centre, and its scale. */
export type Pose = { x: number; y: number; k: number };
/** A move of the name at the exit's end: an offset (dp) from where it stands and a scale about its centre. */
export type Move = { x: number; y: number; k: number };
/** Where an exit takes the lockup: the mark's pose at its end, and the name's move. */
export type ExitTo = { mark: Pose; name: Move };

/** The mark's pose at ms on the main clock (it never moves sideways). */
export function markPose(tl: Timeline, ms: number): Pose {
  return { x: 0, y: at(tl.mark.y, ms), k: at(tl.mark.scale, ms) };
}

/**
 * The mark on its way off: from its pose on the main clock (`from`, which keeps playing underneath) to the exit's
 * (`to`), by the exit's progress p (0 → 1). At 0 exactly where it is, so a tap never makes it jump; at 1 exactly on
 * its target, wherever the main clock has got to. components/fx/intro builds the same out of Animated nodes.
 */
export function flight(from: Pose, to: Pose, p: number): Pose {
  return { x: from.x + p * (to.x - from.x), y: from.y + p * (to.y - from.y), k: from.k + p * (to.k - from.k) };
}

/** No sign-in logo to land on: the lockup lifts as one picture about the screen's centre, from where the mark is. */
export function liftTo(F: number, from: Pose): ExitTo {
  const { WORD_Y } = lockup(F);
  return {
    mark: { x: LIFT.scale * from.x, y: LIFT.y + LIFT.scale * from.y, k: LIFT.scale * from.k },
    name: { x: 0, y: LIFT.y + (LIFT.scale - 1) * WORD_Y, k: LIFT.scale },
  };
}

/** A box on the screen (window coordinates, dp), as measureInWindow gives it. */
export type Rect = { x: number; y: number; width: number; height: number };
/** Where the sign-in screen's own lockup is: its logo picture (assets/brand/logo.png, drawn "contain") and its title. */
export type Landing = { logo: Rect; title: Rect };

/**
 * The match cut: the mark's pose on the sign-in screen's logo (same place, same size: the logo is the same drawing,
 * LOGO_MARK) and the name's move onto the title (same centre, same width). `cover` is the opening's own box,
 * `nameWidth` the name's laid-out width. Null when the answer doesn't make sense (a screen not laid out yet, a box off
 * the screen), and the lockup then lifts away instead.
 */
export function matchCut(F: number, cover: Rect, nameWidth: number, to: Landing): ExitTo | null {
  const { WORD_Y } = lockup(F);
  const cx = cover.x + cover.width / 2;
  const cy = cover.y + cover.height / 2;
  // The logo picture is square and drawn "contain": centred in its box at the box's shorter side.
  const side = Math.min(to.logo.width, to.logo.height);
  const logoX = to.logo.x + (to.logo.width - side) / 2;
  const logoY = to.logo.y + (to.logo.height - side) / 2;
  const k = (side * LOGO_MARK.width) / MARK_SHAPE.width;
  const mark = {
    x: logoX + side * LOGO_MARK.cx - cx - k * (MARK_SHAPE.cx - MARK_BOX / 2),
    y: logoY + side * LOGO_MARK.cy - cy - k * (MARK_SHAPE.cy - MARK_BOX / 2),
    k,
  };
  const name = {
    x: to.title.x + to.title.width / 2 - cx,
    y: to.title.y + to.title.height / 2 - cy - WORD_Y,
    k: to.title.width / nameWidth,
  };
  const numbers = [cover.width, cover.height, nameWidth, mark.x, mark.y, mark.k, name.x, name.y, name.k];
  if (!numbers.every(Number.isFinite) || cover.width <= 0 || cover.height <= 0 || nameWidth <= 0) return null;
  // From a quarter to one and a half times the lockup's mark; the name from half to twice its width.
  if (mark.k < 0.25 * S_END || mark.k > 1.5 * S_END || name.k < 0.5 || name.k > 2) return null;
  // Both land on the screen.
  const inside = (x: number, y: number) => Math.abs(x) <= cover.width / 2 && Math.abs(y) <= cover.height / 2;
  if (!inside(mark.x, mark.y) || !inside(name.x, name.y + WORD_Y)) return null;
  return { mark, name };
}
