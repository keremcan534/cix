// Balon Avı: shoot the balloons floating across the sky. Each shot is one casino round aimed at one balloon: the
// stake is the shot, and the balloon is hit with a chance that makes its expected return exactly the house rule's
// 40 %: a balloon worth m× is hit when the server's draw (0…10m−1) is below FISH_HIT, so P = 4 / 10m and m × P = 0.4.
// Shots that hit no balloon are not rounds and cost nothing. Freeze and lock-on only change aiming, never the odds.
// The game began as a fish hunt: its ids (fish, clown, sardine…) are still the ones the history and the server key on.
//
// Pure functions only (no app or storage imports), so the server and the tests run the same rules.

export type FishKind = {
  id: string;
  name: string;
  emoji: string;
  /** Payout in multiples of the stake when caught. */
  mult: number;
  /** Drawn size on screen (px) and crossing time (s). */
  size: number;
  cross: number;
  /** How often it shows up (relative). */
  spawn: number;
};

export const FISH: FishKind[] = [
  { id: 'clown', name: 'Küçük Balon', emoji: '🎈', mult: 2, size: 34, cross: 9, spawn: 30 },
  { id: 'sardine', name: 'Kalp Balon', emoji: '💖', mult: 3, size: 36, cross: 10, spawn: 26 },
  { id: 'puffer', name: 'Yıldız Balon', emoji: '🌟', mult: 5, size: 40, cross: 11, spawn: 18 },
  { id: 'squid', name: 'Konfeti Balonu', emoji: '🎊', mult: 8, size: 44, cross: 12, spawn: 12 },
  { id: 'octopus', name: 'Ay Balon', emoji: '🌙', mult: 10, size: 48, cross: 13, spawn: 10 },
  { id: 'turtle', name: 'Uçurtma', emoji: '🪁', mult: 15, size: 50, cross: 15, spawn: 8 },
  { id: 'dolphin', name: 'Disko Balonu', emoji: '🪩', mult: 20, size: 56, cross: 12, spawn: 6 },
  { id: 'shark', name: 'Uçan Daire', emoji: '🛸', mult: 30, size: 64, cross: 14, spawn: 4 },
  { id: 'whale', name: 'Dev Balon', emoji: '🎈', mult: 50, size: 76, cross: 18, spawn: 2 },
  { id: 'dragon', name: 'Altın Ejderha', emoji: '🐉', mult: 100, size: 84, cross: 20, spawn: 1 },
];
export const FISH_HIT = 4;
export const fishById = (id: string) => FISH.find((f) => f.id === id);
/** Size of the server's draw for a shot at this balloon. */
export const fishDraw = (f: FishKind) => f.mult * 10;

/** The result of one shot from its raw draw (0…fishDraw−1). */
export function shootFish(f: FishKind, d: number) {
  const caught = d < FISH_HIT;
  return { caught, multiplier: caught ? f.mult : 0 };
}

/** Exact expected return of a shot at this balloon, over every draw. */
export function fishReturn(f: FishKind): number {
  let sum = 0;
  for (let d = 0; d < fishDraw(f); d++) sum += shootFish(f, d).multiplier;
  return sum / fishDraw(f);
}
