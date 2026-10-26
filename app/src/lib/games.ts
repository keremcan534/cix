// One game platform for both entry points (profile Oyun Merkezi and rooms): one catalog, one coin
// balance (the app wallet), one history. Casino rounds go through `playCasino`, which plays the part of
// the game server: it re-checks VIP and limits on every request, is idempotent per request id, and
// refunds when the provider fails after the stake was taken.
//
// Hard rule (spec §5): nothing in this file touches rooms, seats, microphones or calls. It does not
// import lib/media and the game UI never changes room state; voice chat simply keeps running.
import { useSyncExternalStore } from 'react';

import { CASINO_GAMES, ROOM_GAMES, type CasinoGame, type RoomGame } from '@/data/games';
import { today } from '@/lib/persist';

export type Entry = { from: 'profile' } | { from: 'room'; roomId: string; roomTitle: string };
export type CasinoPick = string; // e.g. 'big' | 'small' | 'dragon' | 'tiger' | 'tie' | '' for wheel/slot
export type Outcome = { display: string[]; multiplier: number; detail: string };
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
};
let deps: GameDeps | null = null;
export const setGameDeps = (d: GameDeps) => {
  deps = d;
};

type State = { roomGames: RoomGame[]; casino: CasinoGame[]; history: HistoryRow[]; spentByDay: Record<string, number> };
let state: State = { roomGames: ROOM_GAMES, casino: CASINO_GAMES, history: [], spentByDay: {} };
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

const WHEEL = [0, 0.5, 1, 1.5, 2, 3, 5, 10];
const WHEEL_WEIGHTS = [30, 22, 16, 12, 9, 6, 4, 1];
const SLOT = ['7', '🍒', '🍋', '🍇', '🔔'];
const CARD = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function roll(game: CasinoGame['id'], pick: CasinoPick): Outcome {
  if (game === 'wheel') {
    let r = rnd(WHEEL_WEIGHTS.reduce((a, b) => a + b, 0));
    const i = WHEEL_WEIGHTS.findIndex((w) => (r -= w) < 0);
    return { display: [String(i)], multiplier: WHEEL[i], detail: `Çark ${WHEEL[i]}x` };
  }
  if (game === 'dice') {
    const a = rnd(6) + 1;
    const b = rnd(6) + 1;
    const sum = a + b;
    const side = sum >= 8 ? 'big' : sum <= 6 ? 'small' : 'seven';
    return { display: [String(a), String(b)], multiplier: side === pick ? 1.9 : 0, detail: `${a}+${b}=${sum} · ${side === 'seven' ? '7, kasa' : side === 'big' ? 'Büyük' : 'Küçük'}` };
  }
  if (game === 'slot') {
    const reels = [SLOT[rnd(5)], SLOT[rnd(5)], SLOT[rnd(5)]];
    const sevens = reels.filter((x) => x === '7').length;
    const same = reels[0] === reels[1] && reels[1] === reels[2];
    const m = sevens === 3 ? 20 : same ? 5 : sevens === 2 ? 2 : 0;
    return { display: reels, multiplier: m, detail: reels.join(' ') };
  }
  const d = rnd(13);
  const t = rnd(13);
  const winner = d > t ? 'dragon' : t > d ? 'tiger' : 'tie';
  const m = pick === winner ? (winner === 'tie' ? 8 : 1.95) : winner === 'tie' ? 0.5 : 0;
  return { display: [CARD[d], CARD[t]], multiplier: m, detail: `Ejder ${CARD[d]} · Kaplan ${CARD[t]} · ${winner === 'tie' ? 'Beraberlik' : winner === 'dragon' ? 'Ejder' : 'Kaplan'}` };
}

/**
 * One casino round. Order mirrors the server: idempotency → access (VIP re-read now, not from the UI)
 * → bet and daily limit → take stake (one ledger row) → provider → pay out or refund.
 */
export function playCasino(gameId: CasinoGame['id'], bet: number, pick: CasinoPick, entry: Entry, requestId: string): PlayResult {
  const seen = results.get(requestId);
  if (seen) return seen.ok ? { ...seen, replay: true } : seen;
  const finish = (r: PlayResult) => {
    results.set(requestId, r);
    if (r.ok || r.row) emit({ history: [(r.ok ? r.row : r.row)!, ...state.history].slice(0, 200) });
    return r;
  };
  const game = state.casino.find((g) => g.id === gameId);
  if (!game || !deps) return { ok: false, reason: 'Oyun bulunamadı.' };
  const where = entry.from === 'profile' ? 'Profil · Oyun Merkezi' : `Oda · ${entry.roomTitle}`;
  const base = { requestId, gameId, gameName: game.name, entry: where, bet, time: clock() };
  const access = casinoAccess(game, entry, deps.wealthLevel());
  if (!access.ok) return finish({ ok: false, reason: access.reason, row: { ...base, txId: txId(), payout: 0, status: 'Reddedildi', detail: access.reason } });
  if (!game.bets.includes(bet)) return { ok: false, reason: 'Geçersiz bahis tutarı.' };
  const day = today();
  const spent = state.spentByDay[`${gameId}:${day}`] ?? 0;
  if (spent + bet > game.dailyLimit) return { ok: false, reason: `${game.name} için günlük limit ${game.dailyLimit.toLocaleString('tr-TR')} jeton. Bugün kalan: ${Math.max(0, game.dailyLimit - spent)}.` };
  if (deps.coins() < bet) return { ok: false, reason: 'Yetersiz jeton.' };

  const id = txId();
  if (!deps.spend(bet, `${game.name} · tur ${id}`)) return { ok: false, reason: 'Jeton düşülemedi (bakiye veya günlük harcama limiti).' };
  emit({ spentByDay: { ...state.spentByDay, [`${gameId}:${day}`]: spent + bet } });

  // Provider call. If it fails after the stake was taken, the stake is refunded with the same tx id.
  if (game.providerStatus === 'error') {
    deps.credit(bet, `${game.name} · iade ${id} (sağlayıcı hatası)`);
    return finish({ ok: false, reason: 'Sağlayıcı yanıt vermedi; jetonun iade edildi. Oda ve sesli sohbetin etkilenmedi.', row: { ...base, txId: id, payout: bet, status: 'İade edildi', detail: 'Sağlayıcı hatası' } });
  }
  const outcome = roll(game.id, pick);
  const payout = Math.floor(bet * outcome.multiplier);
  if (payout > 0) deps.credit(payout, `${game.name} · kazanç ${id}`);
  return finish({ ok: true, outcome, replay: false, row: { ...base, txId: id, payout, status: 'Tamamlandı', detail: outcome.detail } });
}

/** Demo: simulate a provider outage from the admin screen (casino rounds then refund). */
export const setProviderStatus = (id: string, s: CasinoGame['providerStatus']) => updateCasino(id, { providerStatus: s });
