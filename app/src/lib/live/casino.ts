// Live mode (lib/live): Oyun Salonu on the server (server/api/casino.mjs). The server draws every round with the
// demo's rules (lib/casino-odds and the engines it uses), takes the stake (game coins first, then coins, through the
// daily spending limit) and pays winnings in game coins; this phone only replays the round and applies the new
// balance. The catalog (each game's switch, stakes and daily limit), the JACKPOT funds and my rounds come from
// GET /api/casino into the game platform's store (lib/games), so the screens read them as they read the demo's; it
// is read again when Oyun Merkezi comes to the front and when a game opens. Without a server address the demo's
// rounds (lib/games playCasino, playBoard) run on this phone as before.
import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';

import type { CasinoGame } from '@/data/games';
import * as api from '@/lib/api';
import { applyLiveCasino, getGames, liveRound, newRequestId, playBoard, playCasino, type CasinoPick, type Entry, type HistoryRow, type PlayResult } from '@/lib/games';
import { applyServerUser, liveMode, message, myServerId, onAccountChange, once } from '@/lib/live';

const clock = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('tr-TR')} ${d.toTimeString().slice(0, 5)}`;
};
const nameOf = (id: string) => getGames().casino.find((g) => g.id === id)?.name ?? id;

/** A server round as a row of Oyun Merkezi's Geçmiş (the server keeps only whether it was played in a room). */
export function historyRow(r: api.ServerCasinoRound, requestId = ''): HistoryRow {
  return {
    txId: `GM-${r.id}`,
    requestId,
    gameId: r.game,
    gameName: nameOf(r.game),
    entry: r.place === 'room' ? 'Oda içinden' : 'Profil · Oyun Merkezi',
    bet: r.bet,
    payout: r.payout,
    status: 'Tamamlandı',
    detail: r.detail,
    time: clock(r.at),
  };
}

let reading: Promise<void> | null = null;
/** Reads the catalog, the funds and my rounds again (one read at a time); a failed read keeps what was there. */
export function refreshCasino(): Promise<void> {
  if (!liveMode()) return Promise.resolve();
  reading ??= (async () => {
    const who = myServerId();
    let r: api.ServerCasino;
    try {
      r = await api.casino();
    } catch (e) {
      // A server without Oyun Salonu: no game is open, rather than games that would only answer "not found".
      if (e instanceof api.ApiError && e.status === 404) applyLiveCasino({ games: [] });
      return;
    }
    // Signed in as someone else meanwhile: this answer was theirs.
    if (who !== myServerId()) return;
    applyLiveCasino({
      games: r.games,
      history: r.mine.map((x) => historyRow(x)),
      jackpots: Object.fromEntries(r.games.flatMap((g) => (g.jackpot === null ? [] : [[g.id, g.jackpot]]))),
    });
  })()
    .catch(() => {})
    .finally(() => (reading = null));
  return reading;
}
// Another account on this phone starts without the last one's rounds.
onAccountChange(() => liveMode() && applyLiveCasino({ history: [] }));

/** Oyun Merkezi: reads the server's catalog again each time the screen comes to the front. */
export function useLiveCasino() {
  const focused = useIsFocused();
  useEffect(() => {
    if (liveMode() && focused) void refreshCasino();
  }, [focused]);
}

async function liveRoundOf(gameId: CasinoGame['id'], body: Omit<api.CasinoPlayBody, 'game' | 'place'>, entry: Entry): Promise<PlayResult> {
  const game = getGames().casino.find((g) => g.id === gameId);
  if (!game) return { ok: false, reason: 'Oyun bulunamadı.' };
  try {
    const key = `casino:${gameId}:${body.bet ?? ''}:${body.pick ?? ''}:${JSON.stringify(body.bets ?? {})}`;
    const r = await once(key, (ref) => api.casinoPlay({ game: gameId, place: entry.from, ...body }, ref));
    // "Oyun Salonu": the store counts the coin part as today's spending (never for Cömertlik: "· tur ").
    applyServerUser(r, `Oyun Salonu: ${game.name} · tur (${r.round.bet.toLocaleString('tr-TR')})`);
    const row = historyRow(r.round);
    if (!r.replay) liveRound(row, entry, r.fund);
    return { ok: true, row, outcome: r.round.outcome, replay: r.replay };
  } catch (e) {
    return { ok: false, reason: message(e) };
  }
}

/**
 * One round of a casino game (a pick for Balon Avı and Yörünge, '' otherwise): the server's in a live build, the
 * demo's on this phone otherwise. Resolves with the round for the screen to replay, or the reason it was refused.
 */
export function playRound(gameId: CasinoGame['id'], bet: number, pick: CasinoPick, entry: Entry): Promise<PlayResult> {
  if (!liveMode()) return Promise.resolve(playCasino(gameId, bet, pick, entry, newRequestId()));
  return liveRoundOf(gameId, { bet, ...(pick ? { pick } : {}) }, entry);
}

/** One round of a bet board (option → coins), as playRound. */
export function playBoardRound(gameId: CasinoGame['id'], bets: Record<string, number>, entry: Entry): Promise<PlayResult> {
  if (!liveMode()) return Promise.resolve(playBoard(gameId, bets, entry, newRequestId()));
  const placed = Object.fromEntries(Object.entries(bets).filter(([, n]) => n > 0));
  if (!Object.keys(placed).length) return Promise.resolve({ ok: false, reason: 'Önce bir seçeneğe jeton koy.' });
  return liveRoundOf(gameId, { bets: placed }, entry);
}
