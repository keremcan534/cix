// One game platform for both entry points (profile Oyun Merkezi and rooms): one catalog, one coin
// balance (the app wallet), one history. Casino rounds go through `playCasino`, which plays the part of
// the game server: it re-checks VIP and limits on every request, is idempotent per request id, and
// refunds when the provider fails after the stake was taken.
//
// House rule (lib/casino-odds): 60 % of every coin played stays with the house, 40 % is paid back as random
// winnings. Each stake is split at once — 60 % booked to the house, 40 % into the payout pool — and wins are
// paid only from the pool. A round whose top prize the pool can't cover is refused before the stake is taken.
// Winnings go to a separate game balance (playable only here; never gifted, exchanged or withdrawn).
//
// Hard rule (spec §5): nothing in this file touches rooms, seats, microphones or calls. It does not
// import lib/media and the game UI never changes room state; voice chat simply keeps running.
import { useSyncExternalStore } from 'react';

import { CASINO_GAMES, ROOM_GAMES, type CasinoGame, type RoomGame } from '@/data/games';
import { ME } from '@/data/mock';
import { announceWin } from '@/lib/broadcast';
import { BOARDS, boardMaxPayout, boardPayout } from '@/lib/board-games';
import { CASINO_HOUSE_SHARE, DUEL_MULT, PICKS, duelMultiplier, isLineSlot, maxMultiplier, outcomeOf, splitStake, type Outcome } from '@/lib/casino-odds';
import { SLOT_CONFIGS } from '@/lib/slot-configs';
import { today } from '@/lib/persist';

export type Entry = { from: 'profile' } | { from: 'room'; roomId: string; roomTitle: string };
export type CasinoPick = string; // e.g. 'big' | 'small' | 'dragon' | 'tiger' | 'tie' | '' for wheel/slot
export type { Outcome };
export type HistoryRow = {
  txId: string;
  requestId: string;
  gameId: string;
  gameName: string;
  entry: string;
  bet: number;
  payout: number;
  status: 'Tamamlandı' | 'İade edildi' | 'Reddedildi';
  detail: string;
  time: string;
};
export type PlayResult = { ok: true; row: HistoryRow; outcome: Outcome; replay: boolean } | { ok: false; reason: string; row?: HistoryRow };

/** What the platform needs from the app store; set by <GamesBridge> on every render. */
export type GameDeps = {
  wealthLevel: () => number;
  coins: () => number;
  spend: (n: number, reason: string) => boolean;
  credit: (n: number, reason: string) => void;
  /** Casino winnings balance: stakes use it first; every win is credited to it, never to the wallet. */
  gameCoins: () => number;
  spendGame: (n: number, reason: string) => boolean;
  creditGame: (n: number, reason: string) => void;
};
let deps: GameDeps | null = null;
export const setGameDeps = (d: GameDeps) => {
  deps = d;
};

/**
 * House book of all coin games: coins played, the house's 60 %, the payout pool and what it paid. `jackpots` are the
 * JACKPOT funds of the slots that have one: the game's jackpotShare of each stake moves into its fund from the pool
 * (it is part of the 40 %), and a line of wilds wins bet / max bet of the fund.
 */
export type CasinoBank = { wagered: number; house: number; pool: number; paid: number; seed: number; jackpots: Record<string, number> };
/** Opening pool: a house advance so the first rounds can pay their top prize. */
export const POOL_SEED = 2_000_000;
/** Opening JACKPOT of each game, also house advances. */
export const JACKPOT_SEEDS: Record<string, number> = { jackpot: 100_000, jungle: 1_000_000, pinata: 500_000, spellbook: 800_000, neon: 2_000_000 };
/** Small wins of these games are not announced in every room (a shot in Mercan Avı is a round of its own). */
const ANNOUNCE_MIN: Partial<Record<CasinoGame['id'], number>> = { fish: 20, rocket: 10 };
type State = { roomGames: RoomGame[]; casino: CasinoGame[]; history: HistoryRow[]; spentByDay: Record<string, number>; bank: CasinoBank };
const freshBank = (): CasinoBank => ({ wagered: 0, house: 0, pool: POOL_SEED, paid: 0, seed: POOL_SEED, jackpots: { ...JACKPOT_SEEDS } });
let state: State = { roomGames: ROOM_GAMES, casino: CASINO_GAMES, history: [], spentByDay: {}, bank: freshBank() };
const listeners = new Set<() => void>();
const emit = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
export const getGames = () => state;
export function useGames() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getGames,
    getGames,
  );
}

// --- Admin (yönetim paneli) ------------------------------------------------------------------
export const updateRoomGame = (id: string, patch: Partial<RoomGame>) => emit({ roomGames: state.roomGames.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
export const updateCasino = (id: string, patch: Partial<CasinoGame>) => emit({ casino: state.casino.map((g) => (g.id === id ? { ...g, ...patch } : g)) });

// --- Access ----------------------------------------------------------------------------------
export type Access = { ok: true } | { ok: false; reason: string; needWealth?: number };
/** Same check the server runs on every launch and every round; the UI only uses it to explain. */
export function casinoAccess(game: CasinoGame, entry: Entry, wealthLevel: number): Access {
  if (!game.active) return { ok: false, reason: `${game.name} şu an kapalı.` };
  if (game.providerStatus === 'down') return { ok: false, reason: `${game.name} sağlayıcısı bakımda. Bakiyen etkilenmez; oda ve sesli sohbetin devam eder.` };
  if (entry.from === 'profile' && !game.fromProfile) return { ok: false, reason: `${game.name} yalnızca oda içinden açılabilir.` };
  if (entry.from === 'room' && !game.fromRoom) return { ok: false, reason: `${game.name} oda içinden açılamaz; profilindeki Oyun Merkezi'nden oynayabilirsin.` };
  if (wealthLevel < game.minWealth) return { ok: false, reason: `${game.name}, Servet Seviyesi ${game.minWealth} ve üzeri üyeler içindir. Senin seviyen: Lv.${wealthLevel}.`, needWealth: game.minWealth };
  return { ok: true };
}

// --- Casino rounds (server stand-in) -----------------------------------------------------------
const results = new Map<string, PlayResult>(); // requestId → first result (idempotency)
const clock = () => `${new Date().toLocaleDateString('tr-TR')} ${new Date().toTimeString().slice(0, 5)}`;
const txId = () => `GM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
export const newRequestId = () => `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const rnd = (n: number) => Math.floor(Math.random() * n);

/** Splits a stake: the house share is booked at once, the rest joins the payout pool. */
function book(bet: number) {
  const house = Math.round(bet * CASINO_HOUSE_SHARE);
  const b = state.bank;
  emit({ bank: { ...b, wagered: b.wagered + bet, house: b.house + house, pool: b.pool + (bet - house) } });
}
/** Pays a win from the pool (never from the house share). */
function payFromPool(n: number) {
  const b = state.bank;
  emit({ bank: { ...b, pool: b.pool - n, paid: b.paid + n } });
}
/**
 * Takes a stake from the game balance first, then the wallet. Returns the split, or null when the wallet part
 * can't be taken (balance or daily spending limit); nothing is taken then.
 */
function takeStake(d: GameDeps, bet: number, reason: string) {
  const split = splitStake(bet, d.gameCoins());
  if (split.fromWallet > 0 && !d.spend(split.fromWallet, reason)) return null;
  if (split.fromGame > 0 && !d.spendGame(split.fromGame, reason)) {
    if (split.fromWallet > 0) d.credit(split.fromWallet, `${reason} · iade`);
    return null;
  }
  return split;
}
/** Gives a stake back to where it came from. */
function refundStake(d: GameDeps, split: { fromGame: number; fromWallet: number }, reason: string) {
  if (split.fromWallet > 0) d.credit(split.fromWallet, reason);
  if (split.fromGame > 0) d.creditGame(split.fromGame, reason);
}
const POOL_LOW = 'Ödül havuzu şu an bu bahsin en yüksek ödülünü karşılayamıyor. Daha küçük bir bahisle dene; jetonun düşülmedi.';

/**
 * One casino round. Order mirrors the server: idempotency → access (VIP re-read now, not from the UI)
 * → bet and daily limit → take stake (one ledger row) → provider → pay out or refund.
 */
export function playCasino(gameId: CasinoGame['id'], bet: number, pick: CasinoPick, entry: Entry, requestId: string): PlayResult {
  return settle(gameId, bet, entry, requestId, {
    check: (game) => (!game.bets.includes(bet) ? 'Geçersiz bahis tutarı.' : !PICKS[game.id].includes(pick) ? 'Geçersiz seçim.' : null),
    maxPayout: () => bet * maxMultiplier(gameId, pick),
    resolve: () => {
      const outcome = outcomeOf(gameId, pick, rnd);
      return { outcome, payout: Math.floor(bet * outcome.multiplier) };
    },
  });
}

/**
 * One round of a bet board (Gece Yarısı Çarkı, Tatlı Tezgâh, Sihir Destesi): several bets (option → coins, each a multiple of the
 * smallest chip) settled against one drawn result. Same checks, stake, pool and history as playCasino.
 */
export function playBoard(gameId: CasinoGame['id'], bets: Record<string, number>, entry: Entry, requestId: string): PlayResult {
  const board = BOARDS[gameId];
  const placed = Object.fromEntries(Object.entries(bets).filter(([, n]) => n > 0));
  const total = Object.values(placed).reduce((a, b) => a + b, 0);
  return settle(gameId, total, entry, requestId, {
    check: (game) => {
      if (!board) return 'Bu oyun bahis tahtası değil.';
      if (!total) return 'Önce bir seçeneğe jeton koy.';
      const chip = Math.min(...game.bets);
      if (Object.entries(placed).some(([id, n]) => !board.options.some((o) => o.id === id) || !Number.isInteger(n / chip))) return 'Geçersiz bahis.';
      return null;
    },
    maxPayout: () => boardMaxPayout(board, placed),
    resolve: () => {
      const outcome = outcomeOf(gameId, '', rnd);
      const payout = boardPayout(board, placed, outcome.board!);
      return { outcome: { ...outcome, multiplier: payout / total }, payout };
    },
  });
}

/** The server's round: shared by every casino game. */
function settle(
  gameId: CasinoGame['id'],
  bet: number,
  entry: Entry,
  requestId: string,
  r: { check: (game: CasinoGame) => string | null; maxPayout: () => number; resolve: () => { outcome: Outcome; payout: number } },
): PlayResult {
  const seen = results.get(requestId);
  if (seen) return seen.ok ? { ...seen, replay: true } : seen;
  const finish = (res: PlayResult) => {
    results.set(requestId, res);
    if (res.ok || res.row) emit({ history: [(res.ok ? res.row : res.row)!, ...state.history].slice(0, 200) });
    return res;
  };
  const game = state.casino.find((g) => g.id === gameId);
  if (!game || !deps) return { ok: false, reason: 'Oyun bulunamadı.' };
  const where = entry.from === 'profile' ? 'Profil · Oyun Merkezi' : `Oda · ${entry.roomTitle}`;
  const base = { requestId, gameId, gameName: game.name, entry: where, bet, time: clock() };
  const access = casinoAccess(game, entry, deps.wealthLevel());
  if (!access.ok) return finish({ ok: false, reason: access.reason, row: { ...base, txId: txId(), payout: 0, status: 'Reddedildi', detail: access.reason } });
  const invalid = r.check(game);
  if (invalid) return { ok: false, reason: invalid };
  if (state.bank.pool < r.maxPayout()) return { ok: false, reason: POOL_LOW };
  const day = today();
  const spent = state.spentByDay[`${gameId}:${day}`] ?? 0;
  if (spent + bet > game.dailyLimit) return { ok: false, reason: `${game.name} için günlük limit ${game.dailyLimit.toLocaleString('tr-TR')} jeton. Bugün kalan: ${Math.max(0, game.dailyLimit - spent)}.` };
  if (deps.coins() + deps.gameCoins() < bet) return { ok: false, reason: 'Yetersiz jeton.' };

  const id = txId();
  const split = takeStake(deps, bet, `${game.name} · tur ${id}`);
  if (!split) return { ok: false, reason: 'Jeton düşülemedi (bakiye veya günlük harcama limiti).' };
  emit({ spentByDay: { ...state.spentByDay, [`${gameId}:${day}`]: spent + bet } });

  // Provider call. If it fails after the stake was taken, the stake is refunded with the same tx id.
  if (game.providerStatus === 'error') {
    refundStake(deps, split, `${game.name} · iade ${id} (sağlayıcı hatası)`);
    return finish({ ok: false, reason: 'Sağlayıcı yanıt vermedi; jetonun iade edildi. Oda ve sesli sohbetin etkilenmedi.', row: { ...base, txId: id, payout: bet, status: 'İade edildi', detail: 'Sağlayıcı hatası' } });
  }
  book(bet);
  const resolved = r.resolve();
  const outcome = resolved.outcome;
  let payout = resolved.payout;
  if (payout > 0) {
    payFromPool(payout);
    deps.creditGame(payout, `${game.name} · kazanç ${id}`);
  }
  const share = isLineSlot(gameId) ? SLOT_CONFIGS[gameId].jackpotShare : undefined;
  if (share) {
    // The stake's JACKPOT share moves from the pool into the game's fund; a line of wilds wins bet / max bet of it.
    const b = state.bank;
    let fund = (b.jackpots[gameId] ?? 0) + bet * share;
    let won = 0;
    if (outcome.slot?.jackpotLines.length) {
      won = Math.floor((fund * bet) / Math.max(...game.bets));
      fund -= won;
      deps.creditGame(won, `${game.name} · JACKPOT ${id}`);
      outcome.detail += ` · JACKPOT +${won.toLocaleString('tr-TR')}`;
    }
    emit({ bank: { ...b, pool: b.pool - bet * share, jackpots: { ...b.jackpots, [gameId]: fund }, paid: b.paid + won } });
    payout += won;
  }
  // A real win (more back than the stake) is announced in every room.
  if (payout > bet * Math.max(1, ANNOUNCE_MIN[game.id] ?? 1)) announceWin({ userName: ME.name, avatar: ME.avatar, source: `Oyun Merkezi › ${game.name}`, roomTitle: entry.from === 'room' ? entry.roomTitle : undefined, mult: Math.round((payout / bet) * 10) / 10, amount: payout }, { mine: true });
  return finish({ ok: true, outcome, replay: false, row: { ...base, txId: id, payout, status: 'Tamamlandı', detail: outcome.detail } });
}

/** Demo: simulate a provider outage from the admin screen (casino rounds then refund). */
export const setProviderStatus = (id: string, s: CasinoGame['providerStatus']) => updateCasino(id, { providerStatus: s });

/**
 * Zar Düellosu in a room: both dice are rolled on the server; under the house rule you win 2.4× your stake when
 * your die beats the other by 3 or more. Same split and pool as the casino.
 */
export function playDuel(bet: number): { ok: true; me: number; them: number; payout: number } | { ok: false; reason: string } {
  if (!deps) return { ok: false, reason: 'Oyun şu an açılamıyor.' };
  if (state.bank.pool < bet * DUEL_MULT) return { ok: false, reason: POOL_LOW };
  if (deps.coins() + deps.gameCoins() < bet || !takeStake(deps, bet, 'Zar Düellosu bahis')) return { ok: false, reason: 'Yetersiz jeton.' };
  book(bet);
  const me = rnd(6) + 1;
  const them = rnd(6) + 1;
  const payout = Math.floor(bet * duelMultiplier(me, them));
  if (payout > 0) {
    payFromPool(payout);
    deps.creditGame(payout, 'Zar Düellosu kazanç');
  }
  return { ok: true, me, them, payout };
}

/** Test support: forget rounds, limits and the house book. */
export function resetGames() {
  results.clear();
  state = { roomGames: ROOM_GAMES, casino: CASINO_GAMES, history: [], spentByDay: {}, bank: freshBank() };
}
