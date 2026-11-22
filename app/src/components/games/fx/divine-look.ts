// The look of the GPU light layer over a big win (fx/divine-fx): per title, its colour, how many rays turn behind the
// title, and what joins it as the title climbs (lightning from EFSANE KAZANÇ up, the beam of light from above on a
// JACKPOT). Plain data, shared by the phone layer and its web stand-in, and checked by tests/divine-look.test.ts.

export type DivineTier = 'big' | 'mega' | 'epic' | 'jackpot';

export type DivineProps = {
  tier: DivineTier;
  /** A new number is a new blow: a shock wave, a burst of embers and, from EFSANE up, lightning. */
  pulse: number;
  width: number;
  height: number;
  /** Where the title stands (px from the layer's top-left): the light and the bursts come from there. */
  cx: number;
  cy: number;
};

export type DivineLook = {
  /** The title's colour: the rays, the third ring, the tinted embers. */
  tint: string;
  /** The same colour for the light shader (0…1). */
  rgb: [number, number, number];
  /** Rays round the title. */
  rays: number;
  /** 0…1: how hard bursts throw and how bright the light is. */
  power: number;
  lightning: boolean;
  beam: boolean;
};

export const DIVINE: Record<DivineTier, DivineLook> = {
  big: { tint: '#FFC94A', rgb: [1, 0.79, 0.29], rays: 10, power: 0.6, lightning: false, beam: false },
  mega: { tint: '#FF7A2F', rgb: [1, 0.48, 0.18], rays: 12, power: 0.78, lightning: false, beam: false },
  epic: { tint: '#5FF3FF', rgb: [0.37, 0.95, 1], rays: 14, power: 0.92, lightning: true, beam: false },
  jackpot: { tint: '#FFD54A', rgb: [1, 0.84, 0.29], rays: 16, power: 1, lightning: true, beam: true },
};

/** Embers a phone draws at most: a burst's and the ones rising all the time. A phone that can't keep up gets the low ones. */
export const EMBERS = { high: 360, low: 140 } as const;
export const RISING = { high: 72, low: 28 } as const;
/** Bursts alive at once (each blow takes the next slot). */
export const SLOTS = 4;

/** A small seeded random (mulberry32), so every phone draws the same embers. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Each ember of a burst, fixed once: its direction, speed (px/s on a 400 px stage), the turn it takes as it flies
 * (rad/s), its size, life (ms) and colour (0 gold, 1 white-hot, 2 the title's). The slot is its index mod SLOTS.
 */
export function makeEmbers(n: number, seed = 7) {
  const r = seeded(seed);
  return Array.from({ length: n }, () => ({
    angle: r() * Math.PI * 2,
    speed: 140 + r() * 420,
    swirl: (r() - 0.5) * 2.4,
    size: 1.2 + r() * 2.6,
    life: 900 + r() * 1000,
    color: r() < 0.45 ? 0 : r() < 0.6 ? 1 : 2,
  }));
}

/** The embers rising all the time: where across, how fast a climb (ms), where in it, how far they sway, size. */
export function makeRising(n: number, seed = 11) {
  const r = seeded(seed);
  return Array.from({ length: n }, () => ({ x: r(), period: 2600 + r() * 2800, phase: r(), sway: 6 + r() * 22, size: 0.9 + r() * 1.9, color: r() < 0.6 ? 0 : 1 }));
}

/** Where an ember of a burst is `age` ms after it, from (cx, cy) on a stage scaled by `k`; null once it has burnt out. */
export function emberAt(e: { angle: number; speed: number; swirl: number; size: number; life: number }, age: number, cx: number, cy: number, k: number, power: number) {
  'worklet';
  if (age < 0 || age > e.life) return null;
  const s = age / 1000;
  const drag = 2.2;
  const dist = ((e.speed * k * (0.55 + 0.45 * power)) / drag) * (1 - Math.exp(-drag * s));
  const a = e.angle + e.swirl * s;
  const left = 1 - age / e.life;
  return { x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist + 70 * k * s * s, r: e.size * Math.max(0.8, k) * Math.pow(left, 0.7) };
}
