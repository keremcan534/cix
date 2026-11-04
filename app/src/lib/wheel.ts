// Rüzgâr Gülü engine (docs/RUZGAR_GULU.md). Live mode: the server draws, takes the price (game coins first, then
// coins) and pays the prize in game coins; this phone only shows the result and applies the new balance. Offline
// demo: the same rules (data/wheel.ts) play on this phone, with sample winners and a sample board.
import * as api from '@/lib/api';
import { applyServerUser, liveMode, message, once, rememberUser, toLocal } from '@/lib/live';
import { USERS } from '@/data/mock';
import {
  WHEEL_BIG_MILLI,
  WHEEL_DAILY,
  WHEEL_NEED_LEVEL,
  WHEEL_SLICES,
  WHEEL_TIERS,
  WHEEL_TIER_IDS,
  WHEEL_WEIGHT_TOTAL,
  isWheelTier,
  jackpotSeed,
  playSpins,
  type WheelCount,
  type WheelTierId,
} from '@/data/wheel';

export type WheelSpin = { id: string; tier: WheelTierId; count: number; cost: number; fromGame: number; payout: number; jackpot: number; slices: number[]; wins: number[]; at: string };
/** `id` as this phone names people ('me' for me). */
export type WheelWinner = { id: string; name: string; tier: WheelTierId; payout: number; jackpot: number; at: string };
export type WheelLeader = { id: string; name: string; total: number };
export type WheelView = {
  funds: Record<WheelTierId, number>;
  dailyLimit: number;
  playedToday: number;
  /** The server's word on the Cömertlik gate (offline: this phone's level). */
  allowed: boolean;
  /** Live: the server's game coin balance (what a spin takes first). Offline: null, the store's balance counts. */
  serverGameCoins: number | null;
  winners: WheelWinner[];
  board: WheelLeader[];
  mine: WheelSpin[];
};
/** What the demo needs from the store. */
export type WheelWallet = {
  wealthLevel: number;
  gameCoins: number;
  spendGameCoins: (n: number, reason?: string) => boolean;
  spendCoins: (n: number, reason?: string) => boolean;
  spendBlock: (n: number) => string | null;
  addGameCoins: (n: number, reason?: string) => void;
};
export type WheelPlay = { ok: true; spin: WheelSpin; replay: boolean } | { ok: false; reason: string };

export const wheelCost = (tier: WheelTierId, count: number) => WHEEL_TIERS[tier].price * count;
const spinReason = (tier: WheelTierId, count: number) => `Rüzgâr Gülü · tur (${WHEEL_TIERS[tier].label} ×${count})`;
const istanbulDay = (t: number) => new Date(t + 3 * 3600_000).toISOString().slice(0, 10);
const bestMilli = (slices: number[]) => Math.max(0, ...slices.map((s) => WHEEL_SLICES[s].milli ?? 0));
const tierOr = (t: string): WheelTierId => (isWheelTier(t) ? t : 'kiyi');

// --- Live --------------------------------------------------------------------------------------------------
const fromServer = (s: api.ServerWheelSpin): WheelSpin => ({ ...s, id: String(s.id), tier: tierOr(s.tier) });

async function liveLoad(): Promise<WheelView> {
  const r = await api.wheel();
  const funds = Object.fromEntries(WHEEL_TIER_IDS.map((t) => [t, r.tiers.find((x) => x.id === t)?.jackpot ?? jackpotSeed(t)])) as Record<WheelTierId, number>;
  for (const p of [...r.winners, ...r.board]) rememberUser(p);
  return {
    funds,
    dailyLimit: r.dailyLimit,
    playedToday: r.playedToday,
    allowed: r.allowed,
    serverGameCoins: r.gameCoins,
    winners: r.winners.map((w) => ({ id: toLocal(w.id), name: w.name, tier: tierOr(w.tier), payout: w.payout, jackpot: w.jackpot, at: w.at })),
    board: r.board.map((b) => ({ id: toLocal(b.id), name: b.name, total: b.total })),
    mine: r.mine.map(fromServer),
  };
}

async function liveSpin(tier: WheelTierId, count: WheelCount, view: WheelView, wallet: WheelWallet): Promise<WheelPlay> {
  const cost = wheelCost(tier, count);
  // The phone's own daily spending limit (Ayarlar) covers the coin part; the server checks everything else.
  const fromCoins = cost - Math.min(view.serverGameCoins ?? 0, cost);
  const blocked = fromCoins > 0 ? wallet.spendBlock(fromCoins) : null;
  if (blocked) return { ok: false, reason: blocked };
  try {
    const r = await once(`wheel:${tier}:${count}`, (ref) => api.wheelSpin(tier, count, ref));
    applyServerUser(r, spinReason(tier, count));
    return { ok: true, spin: fromServer(r.spin), replay: r.replay };
  } catch (e) {
    return { ok: false, reason: message(e) };
  }
}

// --- Offline demo -------------------------------------------------------------------------------------------
const demo = {
  funds: Object.fromEntries(WHEEL_TIER_IDS.map((t) => [t, jackpotSeed(t) + (WHEEL_TIERS[t].price * 148)])) as Record<WheelTierId, number>,
  mine: [] as WheelSpin[],
  played: { day: '', coins: 0 },
  seq: 0,
};
/** Sample winners and board: fixed, so the lists don't jump between renders. `ago` in minutes. */
const DEMO_WINNERS: (Omit<WheelWinner, 'at'> & { ago: number })[] = (
  [
    [0, 'okyanus', 1_000_000, 0, 4],
    [4, 'acik', 62_500, 0, 11],
    [1, 'kiyi', 9_820, 9_820, 26],
    [7, 'okyanus', 250_000, 0, 48],
    [2, 'acik', 25_000, 0, 75],
    [5, 'kiyi', 25_000, 0, 140],
  ] as const
).map(([who, tier, payout, jackpot, ago]) => {
  const u = USERS[who % USERS.length];
  return { id: u.id, name: u.name, tier, payout, jackpot, ago };
});
const DEMO_BOARD: WheelLeader[] = [0, 4, 7, 1, 2, 5, 3].map((who, i) => {
  const u = USERS[who % USERS.length];
  return { id: u.id, name: u.name, total: [1_184_000, 402_500, 266_750, 98_300, 41_200, 18_900, 6_400][i] };
});

function demoView(wealthLevel: number, now: number): WheelView {
  const today = istanbulDay(now);
  const playedToday = demo.played.day === today ? demo.played.coins : 0;
  const mineToday = demo.mine.filter((s) => istanbulDay(Date.parse(s.at)) === today).reduce((a, s) => a + s.payout, 0);
  const myWins = demo.mine
    .filter((s) => s.jackpot > 0 || bestMilli(s.slices) >= WHEEL_BIG_MILLI)
    .map((s): WheelWinner => ({ id: 'me', name: 'Sen', tier: s.tier, payout: s.payout, jackpot: s.jackpot, at: s.at }));
  const sample = DEMO_WINNERS.map(({ ago, ...w }) => ({ ...w, at: new Date(now - ago * 60_000).toISOString() }));
  const board = mineToday > 0 ? [...DEMO_BOARD, { id: 'me', name: 'Sen', total: mineToday }].sort((a, b) => b.total - a.total) : DEMO_BOARD;
  return {
    funds: { ...demo.funds },
    dailyLimit: WHEEL_DAILY,
    playedToday,
    allowed: wealthLevel >= WHEEL_NEED_LEVEL,
    serverGameCoins: null,
    winners: [...myWins, ...sample].slice(0, 30),
    board: board.slice(0, 20),
    mine: demo.mine.slice(0, 20),
  };
}

function demoSpin(tier: WheelTierId, count: WheelCount, wallet: WheelWallet, now: number): WheelPlay {
  if (wallet.wealthLevel < WHEEL_NEED_LEVEL) return { ok: false, reason: `Rüzgâr Gülü Cömertlik Lv.${WHEEL_NEED_LEVEL} ve üstü için` };
  const cost = wheelCost(tier, count);
  const today = istanbulDay(now);
  const played = demo.played.day === today ? demo.played.coins : 0;
  if (played + cost > WHEEL_DAILY) {
    return { ok: false, reason: `Rüzgâr Gülü'nde günlük sınır ${WHEEL_DAILY.toLocaleString('tr-TR')} jeton. Bugün kalan: ${Math.max(0, WHEEL_DAILY - played).toLocaleString('tr-TR')}` };
  }
  const fromGame = Math.min(wallet.gameCoins, cost);
  const fromCoins = cost - fromGame;
  if (fromCoins > 0) {
    const blocked = wallet.spendBlock(fromCoins);
    if (blocked) return { ok: false, reason: blocked === 'Yetersiz bakiye.' ? 'Yetersiz jeton' : blocked };
  }
  const what = spinReason(tier, count);
  if (fromGame && !wallet.spendGameCoins(fromGame, what)) return { ok: false, reason: 'Yetersiz oyun jetonu' };
  if (fromCoins && !wallet.spendCoins(fromCoins, what)) {
    if (fromGame) wallet.addGameCoins(fromGame, 'Rüzgâr Gülü iadesi');
    return { ok: false, reason: 'Yetersiz jeton' };
  }
  const r = playSpins(tier, count, demo.funds[tier], () => Math.floor(Math.random() * WHEEL_WEIGHT_TOTAL));
  demo.funds[tier] = r.fund;
  if (r.payout) wallet.addGameCoins(r.payout, r.jackpot ? `Rüzgâr Gülü JACKPOT (${WHEEL_TIERS[tier].label})` : `Rüzgâr Gülü kazancı (${WHEEL_TIERS[tier].label} ×${count})`);
  demo.played = { day: today, coins: played + cost };
  const spin: WheelSpin = { id: `demo-${++demo.seq}`, tier, count, cost, fromGame, payout: r.payout, jackpot: r.jackpot, slices: r.slices, wins: r.wins, at: new Date(now).toISOString() };
  demo.mine = [spin, ...demo.mine].slice(0, 50);
  return { ok: true, spin, replay: false };
}

// --- Both -----------------------------------------------------------------------------------------------------
/** `wealthLevel`: the offline demo's gate (live mode asks the server). */
export async function loadWheel(wealthLevel: number): Promise<WheelView> {
  return liveMode() ? liveLoad() : demoView(wealthLevel, Date.now());
}

export async function playWheel(tier: WheelTierId, count: WheelCount, view: WheelView, wallet: WheelWallet): Promise<WheelPlay> {
  return liveMode() ? liveSpin(tier, count, view, wallet) : demoSpin(tier, count, wallet, Date.now());
}
