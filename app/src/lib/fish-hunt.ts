// Balık Avı: shoot the fish swimming across the screen. Each shot is one casino round aimed at one fish: the stake
// is the shot, and the fish is caught with a chance that makes its expected return exactly the house rule's 40 %:
// a fish worth m× is caught when the server's draw (0…10m−1) is below FISH_HIT, so P = 4 / 10m and m × P = 0.4.
// Shots that hit no fish are not rounds and cost nothing. Freeze and lock-on only change aiming, never the odds.
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
  { id: 'clown', name: 'Palyaço Balığı', emoji: '🐠', mult: 2, size: 34, cross: 9, spawn: 30 },
  { id: 'sardine', name: 'Sarı Balık', emoji: '🐟', mult: 3, size: 36, cross: 10, spawn: 26 },
  { id: 'puffer', name: 'Balon Balığı', emoji: '🐡', mult: 5, size: 40, cross: 11, spawn: 18 },
  { id: 'squid', name: 'Kalamar', emoji: '🦑', mult: 8, size: 44, cross: 12, spawn: 12 },
  { id: 'octopus', name: 'Ahtapot', emoji: '🐙', mult: 10, size: 48, cross: 13, spawn: 10 },
  { id: 'turtle', name: 'Kaplumbağa', emoji: '🐢', mult: 15, size: 50, cross: 15, spawn: 8 },
  { id: 'dolphin', name: 'Yunus', emoji: '🐬', mult: 20, size: 56, cross: 12, spawn: 6 },
  { id: 'shark', name: 'Köpekbalığı', emoji: '🦈', mult: 30, size: 64, cross: 14, spawn: 4 },
  { id: 'whale', name: 'Balina', emoji: '🐳', mult: 50, size: 76, cross: 18, spawn: 2 },
  { id: 'dragon', name: 'Altın Ejderha', emoji: '🐉', mult: 100, size: 84, cross: 20, spawn: 1 },
];
export const FISH_HIT = 4;
export const fishById = (id: string) => FISH.find((f) => f.id === id);
/** Size of the server's draw for a shot at this fish. */
export const fishDraw = (f: FishKind) => f.mult * 10;

/** The result of one shot from its raw draw (0…fishDraw−1). */
export function shootFish(f: FishKind, d: number) {
  const caught = d < FISH_HIT;
  return { caught, multiplier: caught ? f.mult : 0 };
}

/** Exact expected return of a shot at this fish, over every draw. */
export function fishReturn(f: FishKind): number {
  let sum = 0;
  for (let d = 0; d < fishDraw(f); d++) sum += shootFish(f, d).multiplier;
  return sum / fishDraw(f);
}
