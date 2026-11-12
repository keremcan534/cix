// How the heart level between two people looks (1v1, server/api/one-on-one.mjs): the higher the level, the more
// the heart does. Six looks over the server's 0–10 levels: none yet, a soft spark, a glow, a pulse, a beat with
// small hearts rising, and the top one with a gold rim. From the pulse up a heartbeat runs along the line between
// the two photos; from the beat up the heart also beats on the profile photo. Pure, so it is unit tested; the
// drawing is components/heart-level.

/**
 * Heart points needed for each level: the server's HEART_LEVELS (server/api/one-on-one.mjs), the same numbers.
 * A live build shows the server's level and never counts its own; these give the demo's sample hearts a level.
 */
export const HEART_LEVELS = [0, 300, 1500, 5000, 15_000, 40_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000] as const;
/** The highest level. */
export const HEART_TOP = HEART_LEVELS.length - 1;

/** The heart between two people as the server's pair sends it (lib/live/one-on-one Pair.heart). */
export type HeartView = { points: number; level: number; next: number | null; floor: number };

/** The level `points` reach. */
export function heartLevelOf(points: number) {
  let level = 0;
  while (level < HEART_TOP && points >= HEART_LEVELS[level + 1]) level += 1;
  return level;
}

/** The heart `points` make, as the server would send it (the demo's sample hearts). */
export function heartView(points: number): HeartView {
  const p = Math.max(0, Math.floor(points));
  const level = heartLevelOf(p);
  return { points: p, level, floor: HEART_LEVELS[level], next: HEART_LEVELS[level + 1] ?? null };
}

/** How far into its level the heart is, 0 to 1 (1 at the top level). */
export const heartShare = (h: HeartView) => (h.next === null ? 1 : Math.max(0, Math.min(1, (h.points - h.floor) / Math.max(1, h.next - h.floor))));

/** "Lv.2’de", "Lv.3’te", "Lv.6’da": a level with the locative suffix its number takes. */
const SUFFIX = ['’da', '’de', '’de', '’te', '’te', '’te', '’da', '’de', '’de', '’da'];
export const lvAt = (n: number) => `Lv.${n}${SUFFIX[n % 10]}`;

// --- The looks ---------------------------------------------------------------------------------------------

/** What the heart itself does: nothing, a glow that breathes, a slow swell, a double beat (lub-dub). */
export type HeartMotion = 'still' | 'breathe' | 'pulse' | 'beat';
/** The line between the two photos: none, a plain line, a pulse from me to them, pulses from both meeting at the heart. */
export type HeartLine = 'none' | 'still' | 'one' | 'both';

export type HeartTier = {
  id: 'none' | 'soft' | 'glow' | 'pulse' | 'beat' | 'crown';
  /** Its name on the screen. */
  name: string;
  /** Its first and last level. */
  from: number;
  to: number;
  /** The badge's fill (white heart and text on it). */
  fill: readonly [string, string];
  /** The heart drawn on the screen's own surface (no fill), the progress bar, the travelling pulse. */
  tint: string;
  /** The light around the heart; null: none. */
  glow: string | null;
  /** A gold edge around the heart and the badge (the top look). */
  rim: string | null;
  motion: HeartMotion;
  /** One loop of the motion, ms (0 when still). Everything a heart draws moves on this one loop. */
  periodMs: number;
  /** Small hearts rising from it in each loop. */
  particles: number;
  line: HeartLine;
  /** The heart beats on their profile photo. */
  pin: boolean;
  /** What reaching this look brings, after "Lv.5’te …"; null for the first. */
  brings: string | null;
};

export const HEART_TIERS: readonly HeartTier[] = [
  { id: 'none', name: 'Başlangıç', from: 0, to: 0, fill: ['#A3B1CF', '#6E7C99'], tint: '#8C99B5', glow: null, rim: null, motion: 'still', periodMs: 0, particles: 0, line: 'none', pin: false, brings: null },
  { id: 'soft', name: 'Kıvılcım', from: 1, to: 2, fill: ['#FF9DAA', '#E2586E'], tint: '#FF7F90', glow: null, rim: null, motion: 'still', periodMs: 0, particles: 0, line: 'still', pin: false, brings: 'kalbiniz kıvılcımlanır' },
  { id: 'glow', name: 'Işıltı', from: 3, to: 4, fill: ['#FF8296', '#E0405D'], tint: '#FF6576', glow: '#FF6576', rim: null, motion: 'breathe', periodMs: 2600, particles: 0, line: 'still', pin: false, brings: 'kalbiniz ışıldar' },
  { id: 'pulse', name: 'Nabız', from: 5, to: 6, fill: ['#FF6F91', '#D81B4A'], tint: '#FF4F7B', glow: '#FF4F7B', rim: null, motion: 'pulse', periodMs: 1800, particles: 0, line: 'one', pin: false, brings: 'kalpler atmaya başlar' },
  { id: 'beat', name: 'Tutku', from: 7, to: 8, fill: ['#FF5470', '#B8123C'], tint: '#FF3B5C', glow: '#FF3B5C', rim: null, motion: 'beat', periodMs: 1400, particles: 3, line: 'both', pin: true, brings: 'kalp atışları aranızda gidip gelir' },
  { id: 'crown', name: 'Sonsuz', from: 9, to: HEART_TOP, fill: ['#FF5A7A', '#B8123C'], tint: '#FF3B5C', glow: '#F6BD60', rim: '#F6BD60', motion: 'beat', periodMs: 1200, particles: 5, line: 'both', pin: true, brings: 'kalbiniz altınla parlar' },
];

const clampLevel = (level: number) => Math.max(0, Math.min(HEART_TOP, Math.floor(Number.isFinite(level) ? level : 0)));

/** The look of a level (a level past the top looks like the top). */
export const heartTier = (level: number): HeartTier => {
  const l = clampLevel(level);
  return HEART_TIERS.find((t) => l >= t.from && l <= t.to) ?? HEART_TIERS[0];
};

/** The next look above this level's, or null at the top. */
export const nextHeartTier = (level: number): HeartTier | null => HEART_TIERS.find((t) => t.from > clampLevel(level)) ?? null;

/** What the next look brings and where: "Lv.5’te kalpler atmaya başlar"; null at the top look. */
export function nextLookText(level: number): string | null {
  const next = nextHeartTier(level);
  return next?.brings ? `${lvAt(next.from)} ${next.brings}` : null;
}

/** "Kalp Lv.7 · Tutku" (level 0 has no look name). */
export const heartTitle = (level: number) => {
  const l = clampLevel(level);
  return l === 0 ? 'Kalp Lv.0' : `Kalp Lv.${l} · ${heartTier(l).name}`;
};

/** Whether the heart moves: its look moves, and neither "Animasyonları azalt" nor "Efektleri kapat" is on. */
export const heartMoves = (tier: HeartTier, settings: { reduceMotion: boolean; effectsOff: boolean }) =>
  tier.motion !== 'still' && tier.periodMs > 0 && !settings.reduceMotion && !settings.effectsOff;

// --- The motion over one loop (t from 0 to 1) ----------------------------------------------------------------
// Each is an Animated interpolation: inputs rise from 0 to 1, and the output ends where it starts, so the loop
// never jumps. Pulses from the photos reach the heart at t = 0.5, where the heart beats.

export type Curve = { inputRange: number[]; outputRange: number[] };
/** The moment the pulses reach the heart. */
export const MEET = 0.5;

/** A curve through [t, value] points; a point at or before the one kept last is dropped (inputs must rise). */
export function curve(points: readonly (readonly [number, number])[]): Curve {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (const [t, v] of points) {
    if (inputRange.length && t <= inputRange[inputRange.length - 1]) continue;
    inputRange.push(t);
    outputRange.push(v);
  }
  return { inputRange, outputRange };
}

/** The heart's size over a loop (1 = its own size). */
export function scaleCurve(motion: HeartMotion): Curve {
  if (motion === 'pulse') return { inputRange: [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1], outputRange: [1, 1.01, 1.04, 1.1, 1.04, 1.01, 1] };
  // Lub at the meeting, a smaller dub right after, then rest.
  if (motion === 'beat') return { inputRange: [0, 0.44, MEET, 0.56, 0.64, 0.74, 1], outputRange: [1, 1, 1.2, 1.03, 1.13, 1, 1] };
  return { inputRange: [0, 1], outputRange: [1, 1] };
}

/** How bright the light around the heart is over a loop (0 to 1). */
export function glowCurve(motion: HeartMotion): Curve {
  if (motion === 'breathe') return { inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0.35, 0.6, 0.9, 0.6, 0.35] };
  if (motion === 'pulse') return { inputRange: [0, 0.3, 0.5, 0.7, 1], outputRange: [0.45, 0.55, 0.9, 0.55, 0.45] };
  if (motion === 'beat') return { inputRange: [0, 0.44, MEET, 0.62, 0.8, 1], outputRange: [0.5, 0.5, 1, 0.8, 0.5, 0.5] };
  return { inputRange: [0, 1], outputRange: [0.6, 0.6] };
}

/** A ring that leaves the heart at the beat and fades (the top look): its size and its opacity. */
export const rippleCurves = (): { scale: Curve; opacity: Curve } => ({
  scale: { inputRange: [0, MEET, 0.9, 1], outputRange: [1, 1, 1.9, 1.9] },
  opacity: { inputRange: [0, MEET - 0.001, MEET, 0.9, 1], outputRange: [0, 0, 0.7, 0, 0] },
});

/**
 * Where a pulse is on the line, as a share of the line from my photo (0) to theirs (1), and how visible it is.
 * `from`: whose photo it leaves. 'one' crosses the whole line in a loop; 'both' sends one from each side to meet
 * at the heart in the middle.
 */
export function pulseCurves(line: HeartLine, from: 'me' | 'them'): { at: Curve; opacity: Curve } | null {
  if (line === 'one') {
    if (from === 'them') return null;
    return { at: { inputRange: [0, 1], outputRange: [0, 1] }, opacity: { inputRange: [0, 0.08, 0.9, 1], outputRange: [0, 1, 1, 0] } };
  }
  if (line === 'both') {
    const start = from === 'me' ? 0 : 1;
    return {
      at: { inputRange: [0, MEET, 1], outputRange: [start, 0.5, 0.5] },
      opacity: { inputRange: [0, 0.06, MEET - 0.04, MEET, 1], outputRange: [0, 1, 1, 0, 0] },
    };
  }
  return null;
}

/** Each rising heart's part of the loop: it starts at `start`, is gone at `end`, and drifts `dx` (-1 to 1) sideways. */
export function particleWindows(count: number): { start: number; end: number; dx: number }[] {
  const n = Math.max(0, Math.floor(count));
  // One after another over the first part of the loop, each for a little over half of it, left and right in turn.
  return Array.from({ length: n }, (_, i) => {
    const start = Math.round((i / n) * 0.4 * 1000) / 1000;
    const side = 1 - i / (2 * n);
    return { start, end: Math.round((start + 0.58) * 1000) / 1000, dx: i % 2 === 0 ? -side : side };
  });
}

/** A rising heart over the loop: how far it has risen (0 to 1 of its way) and how visible it is. */
export function particleCurves(w: { start: number; end: number }): { rise: Curve; opacity: Curve } {
  const span = w.end - w.start;
  return {
    rise: curve([[0, 0], [w.start, 0], [w.end, 1], [1, 1]]),
    opacity: curve([[0, 0], [w.start, 0], [w.start + span * 0.2, 1], [w.start + span * 0.65, 1], [w.end, 0], [1, 0]]),
  };
}
