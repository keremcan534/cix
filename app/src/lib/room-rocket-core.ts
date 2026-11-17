// Oda roketi on the phone (server/api/room-rocket.mjs, GET /api/rooms/rocket, docs/ODA_ROKETI.md): the room's rocket
// today, read without trusting it, and what the screens show from it. Pure (no React, no storage), so the tests run
// it. An answer without its five levels is no rocket at all (null: nothing shown); a prize or a person that doesn't
// read is left out of its list.

export type RocketUser = { id: string; name: string; avatarUrl: string | null };
export type RocketPrize =
  | { kind: 'coins'; amount: number; winners: number }
  | { kind: 'item'; sku: string; name: string; itemKind: string | null; days: number; winners: number };
export type RocketTop = { rank: number; user: RocketUser; coins: number };
export type RocketLevel = { level: number; goal: number; filled: number; launched: boolean; prizes: RocketPrize[]; top: RocketTop[]; mine: number };
export type RocketWin = { user: RocketUser; prize: RocketPrize; paid: boolean };
export type RoomRocket = {
  on: boolean;
  fuel: number;
  /** The level filling now; null when all five launched today. */
  current: number | null;
  resetsAt: string | null;
  levels: RocketLevel[];
  last: { launch: number; level: number; winners: RocketWin[] } | null;
};
export const ROCKET_LEVELS = 5;

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const whole = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max ? v : null);
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

function userOf(raw: unknown): RocketUser | null {
  const r = obj(raw);
  const id = str(r.id, 64);
  const name = typeof r.name === 'string' ? r.name.slice(0, 40) : null;
  if (!id || name === null) return null;
  return { id, name, avatarUrl: typeof r.avatarUrl === 'string' && /^https?:\/\//.test(r.avatarUrl) ? r.avatarUrl : null };
}

/** A prize the server described; null when it doesn't read. */
export function parsePrize(raw: unknown): RocketPrize | null {
  const r = obj(raw);
  const winners = whole(r.winners, 1, 50) ?? 1;
  if (r.kind === 'coins') {
    const amount = whole(r.amount, 1);
    return amount === null ? null : { kind: 'coins', amount, winners };
  }
  if (r.kind === 'item') {
    const sku = str(r.sku, 32);
    const days = whole(r.days, 1, 365);
    if (!sku || days === null) return null;
    return { kind: 'item', sku, name: str(r.name, 40) ?? sku, itemKind: str(r.itemKind, 16), days, winners };
  }
  return null;
}

const list = <T>(v: unknown, read: (x: unknown) => T | null, max: number): T[] => (Array.isArray(v) ? v.slice(0, max).map(read).filter((x): x is T => x !== null) : []);

/** GET /api/rooms/rocket; null when it isn't a rocket (an older server, a malformed answer). */
export function parseRocket(raw: unknown): RoomRocket | null {
  const r = obj(raw);
  if (!Array.isArray(r.levels) || r.levels.length !== ROCKET_LEVELS) return null;
  const levels: RocketLevel[] = [];
  for (const [i, x] of r.levels.entries()) {
    const l = obj(x);
    const goal = whole(l.goal, 1);
    if (goal === null) return null;
    levels.push({
      level: i + 1,
      goal,
      filled: Math.min(goal, whole(l.filled, 0) ?? 0),
      launched: l.launched === true,
      prizes: list(l.prizes, parsePrize, 6),
      top: list(
        l.top,
        (t) => {
          const o = obj(t);
          const user = userOf(o.user);
          const rank = whole(o.rank, 1, 3);
          const coins = whole(o.coins, 1);
          return user && rank !== null && coins !== null ? { rank, user, coins } : null;
        },
        3,
      ),
      mine: whole(l.mine, 0) ?? 0,
    });
  }
  const current = whole(r.current, 1, ROCKET_LEVELS);
  const last = obj(r.last);
  const lastLevel = whole(last.level, 1, ROCKET_LEVELS);
  const lastLaunch = whole(last.launch, 1);
  return {
    on: r.on === true,
    fuel: whole(r.fuel, 0) ?? 0,
    current,
    resetsAt: str(r.resetsAt, 40),
    levels,
    last:
      lastLevel !== null && lastLaunch !== null
        ? {
            launch: lastLaunch,
            level: lastLevel,
            winners: list(
              last.winners,
              (w) => {
                const o = obj(w);
                const user = userOf(o.user);
                const prize = parsePrize(o.prize);
                return user && prize ? { user, prize, paid: o.paid !== false } : null;
              },
              50,
            ),
          }
        : null,
  };
}

/** How full a level is, 0–100, one decimal down (a level shows 100 only once it is full). */
export function rocketPct(l: Pick<RocketLevel, 'filled' | 'goal' | 'launched'>): number {
  if (l.launched || l.filled >= l.goal) return 100;
  return Math.min(99.9, Math.floor((l.filled / l.goal) * 1000) / 10);
}
/** "57,5%" (Turkish decimals; a whole number without them). */
export const pctText = (pct: number) => `${pct.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`;
/** The level the pill and the sheet show first: the one filling now, else the last. */
export const shownLevel = (r: RoomRocket) => r.current ?? ROCKET_LEVELS;
/** A prize in a few words: "750 jeton", "Neon Halka · 3 gün". */
export const prizeLabel = (p: RocketPrize) => (p.kind === 'coins' ? `${p.amount.toLocaleString('tr-TR')} jeton` : `${p.name} · ${p.days} gün`);
