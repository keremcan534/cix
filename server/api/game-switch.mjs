// Oyun anahtarları: is a game open to this account now? One answer for every game the server plays
// (live-registry.mjs SWITCH_GAMES): Oyun Salonu's games and Canlı Yörünge (casino.mjs, rocket-live.mjs), Rüzgâr Gülü
// (wheel.mjs), Şanslı hediyeler (lucky.mjs) and the free room tables (room-games.mjs). A game is shut when
//   - Acil durum › Oyunlar is off (features `games`, live or .env FEATURES_OFF: the snapshot holds both), or
//   - it is in Canlı ayarlar › Oyun Salonu › Kapalı oyunlar (casino_off): for everyone, admins included, or
//   - it is in Yalnız yöneticilere açık oyunlar (games_staff) and the account is not an admin.
// Oyun Salonu and Rüzgâr Gülü are also behind casino_open (wheel.mjs paidGamesOpen), checked where they were.
// Oda roketi keeps its own switch (room-rocket.mjs, panel › Oda roketi).
//
// The reads show a shut game as off, so an installed app hides it (older apps included where they read the server's
// list: Oyun Salonu, Yörünge); the writes refuse a new round with nothing moved. Every route checks after its replay
// check, so a retry of a round that went through still gets its answer. GET /api/config sends both lists (gamesOff,
// gamesStaff): a newer app hides a shut game everywhere within the config's 30 seconds.
import { HttpError } from './core.mjs';
import { OFF_MESSAGE, gameName } from './live-registry.mjs';
import { live } from './live-settings.mjs';

/** True when `id` (a SWITCH_GAMES id) can't be played by `user` now. */
export const gameShut = (id, user, s = live()) => s.featuresOff.has('games') || s.casinoOff.has(id) || (s.gamesStaff.has(id) && user?.role !== 'admin');

/** A switched-off feature as features.mjs answers it (503, the calm sentence), for a check inside a handler. */
export function assertLiveOn(feature, s = live()) {
  if (s.featuresOff.has(feature)) throw Object.assign(new HttpError(503, OFF_MESSAGE), { feature });
}

/**
 * Inside a write, after its replay check: Acil durum › Oyunlar answers as every switched-off feature does (503); a
 * game switched off, or kept for admins, answers "<Oyun> şu an kapalı" (409). A player never reads that a game is
 * being tried by the staff: to them it is simply closed.
 */
export function assertGameOpen(id, user, s = live(), name = gameName(id)) {
  assertLiveOn('games', s);
  if (gameShut(id, user, s)) throw new HttpError(409, `${name} şu an kapalı`);
}
