// Canlı Yörünge's round as the server sends it (GET /api/casino/rocket, and the live line's 'rocket' events), read
// defensively: a malformed answer or event is left out, never a crash. And what the screen derives from it at a given
// moment: the phase by the server's clock, the multiplier of the climb, the seconds left to bet. Pure, so the unit
// tests run it under Node.
import type { RocketGame, RocketMine, RocketPhase, RocketRound, RocketSeat, RocketView } from '@/lib/api';
import { multAt } from '@/lib/rocket-live';

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) ? v : null);
const PHASES: RocketPhase[] = ['idle', 'bet', 'fly', 'done'];
const rec = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
/** A multiplier in hundredths: 100 (1,00×) or more, or null. */
const mult = (v: unknown) => {
  const x = int(v);
  return x !== null && x >= 100 ? x : null;
};

export function readSeat(v: unknown): RocketSeat | null {
  const o = rec(v);
  if (!o) return null;
  const k = int(o.k);
  const b = int(o.b);
  if (k === null || b === null || b <= 0 || typeof o.n !== 'string') return null;
  const c = int(o.c);
  return { k, n: o.n.slice(0, 20), b, a: mult(o.a), c: c !== null && c >= 0 ? c : null, p: Math.max(0, int(o.p) ?? 0) };
}

export function readRound(v: unknown): RocketRound | null {
  const o = rec(v);
  if (!o) return null;
  const id = int(o.id);
  const phase = PHASES.find((p) => p === o.phase);
  const betUntil = num(o.betUntil);
  if (id === null || !phase || betUntil === null) return null;
  const ret = int(o.ret);
  return {
    id,
    phase,
    ret: ret !== null && ret > 0 && ret < 100 ? ret : 40,
    betUntil,
    launchAt: num(o.launchAt),
    crash: mult(o.crash),
    players: Math.max(0, int(o.players) ?? 0),
    fuel: Math.max(0, int(o.fuel) ?? 0),
  };
}

export function readView(v: unknown): RocketView | null {
  const o = rec(v);
  if (!o) return null;
  const now = num(o.now);
  const rate = num(o.rate);
  if (now === null || rate === null || rate <= 0) return null;
  const round = o.round === null || o.round === undefined ? null : readRound(o.round);
  if (o.round && !round) return null;
  const players = Array.isArray(o.players) ? o.players.map(readSeat).filter((x): x is RocketSeat => !!x) : [];
  const last = Array.isArray(o.last) ? o.last.map(mult).filter((x): x is number => x !== null) : [];
  return { v: int(o.v) ?? 0, now, rate, round, players, last };
}

export function readMine(v: unknown): RocketMine | null {
  const o = rec(v);
  if (!o) return null;
  const k = int(o.k);
  const fuel = int(o.fuel);
  if (k === null || fuel === null) return null;
  const cashed = int(o.cashed);
  return { k, fuel, onBoard: Math.max(0, int(o.onBoard) ?? 0), auto: mult(o.auto), cashed: cashed !== null && cashed >= 0 ? cashed : null, payout: Math.max(0, int(o.payout) ?? 0) };
}

export function readGame(v: unknown): RocketGame | null {
  const o = rec(v);
  if (!o) return null;
  const bets = Array.isArray(o.bets) ? o.bets.map(int).filter((x): x is number => x !== null && x > 0) : [];
  return {
    active: o.active === true,
    allowed: o.allowed === true,
    needLevel: int(o.needLevel) ?? 2,
    bets,
    maxFuel: int(o.maxFuel) ?? bets[bets.length - 1] ?? 0,
    dailyLimit: int(o.dailyLimit) ?? 0,
    playedToday: int(o.playedToday) ?? 0,
  };
}

/** The view a line event carries ({ type: 'rocket', round: '<json>' }), or null. */
export function viewOfEvent(e: { type: string } & Record<string, unknown>): RocketView | null {
  if (e.type !== 'rocket' || typeof e.round !== 'string') return null;
  try {
    return readView(JSON.parse(e.round));
  } catch {
    return null;
  }
}

/** Whether `next` is newer than `cur`: a later round, or the same round told later. */
export const newer = (cur: RocketView | null, next: RocketView) => !cur || (next.round?.id ?? 0) > (cur.round?.id ?? 0) || ((next.round?.id ?? 0) === (cur.round?.id ?? 0) && next.v >= cur.v);

/**
 * Where the round stands at server time `t` (ms): the betting window with its seconds left, the engine lighting, the
 * climb with its multiplier, or blown up. The server's phase leads; the clock only moves the climb along between two
 * of its messages (a crash is known only when the server says it).
 */
export type Moment =
  | { kind: 'idle' }
  | { kind: 'bet'; left: number }
  | { kind: 'ignite'; left: number }
  | { kind: 'fly'; x: number; ms: number }
  | { kind: 'done'; crash: number };
export function momentOf(view: RocketView | null, t: number): Moment {
  const r = view?.round;
  if (!r || r.phase === 'idle') return { kind: 'idle' };
  if (r.phase === 'bet') return { kind: 'bet', left: Math.max(0, r.betUntil - t) };
  if (r.phase === 'done') return { kind: 'done', crash: r.crash ?? 100 };
  const launch = r.launchAt ?? r.betUntil;
  if (t < launch) return { kind: 'ignite', left: launch - t };
  return { kind: 'fly', x: multAt(t - launch, view.rate), ms: t - launch };
}

/** The server's clock from a request that took from `sent` to `got` (local ms) and answered `now`: server − local. */
export const offsetOf = (now: number, sent: number, got: number) => now - (sent + got) / 2;

/** My seat in the view: by my key once I have fuel in the round. */
export const mySeat = (view: RocketView | null, mine: RocketMine | null) => (mine ? (view?.players.find((p) => p.k === mine.k) ?? null) : null);

/** The crash points' share of the last `n` rounds in each band, for Son turlar: [pad and 1–2×, 2–3×, 3–5×, 5–10×, 10× and up]. */
export const BANDS = [
  { from: 100, to: 200, label: '1–2×' },
  { from: 200, to: 300, label: '2–3×' },
  { from: 300, to: 500, label: '3–5×' },
  { from: 500, to: 1000, label: '5–10×' },
  { from: 1000, to: Infinity, label: '10× +' },
];
export function bandCounts(history: number[], n: number): number[] {
  const last = history.slice(0, n);
  return BANDS.map((b) => last.filter((x) => x >= b.from && x < b.to).length);
}
