// Aile's game rules, in step with the app (app/src/data/kabile.ts KABILE_TASKS, KABILE_CHESTS, KABILE_THEMES,
// CP_GIFT_IDS, CHEST_MIN_CONTRIBUTION; data/rules familyRates); app tests/server-catalog.test.ts fails when they drift.
// Plain data: the app's tests import it.

/** Daily tasks (Turkey's day). count: done at `goal`; rate: `power` for every `per` coins. Points, never coins. */
export const FAMILY_TASKS = [
  { id: 'k-chat', source: 'chatMsgs', kind: 'count', goal: 1, per: 0, power: 1, treasure: 1 },
  { id: 'k-room', source: 'roomMinutes', kind: 'count', goal: 15, per: 0, power: 1, treasure: 1 },
  { id: 'k-newbie', source: 'giftsSent', kind: 'count', goal: 1, per: 0, power: 3, treasure: 3 },
  { id: 'k-checkin', source: 'checkIn', kind: 'count', goal: 1, per: 0, power: 1, treasure: 1 },
  { id: 'k-roomgift', source: 'roomGiftCoins', kind: 'rate', goal: 0, per: 500, power: 2, treasure: 2 },
  { id: 'k-cp', source: 'cpGiftCoins', kind: 'rate', goal: 0, per: 350, power: 2, treasure: 2 },
  { id: 'k-chatgift', source: 'chatGiftCoins', kind: 'rate', goal: 0, per: 400, power: 2, treasure: 2 },
];
/** Weekly milestone chests: open once a week each when the family's week (gift coins) reaches `need`. */
export const FAMILY_CHESTS = [
  { id: 'c1', name: 'Ahşap Sandık', need: 10_000, coins: 20 },
  { id: 'c2', name: 'Yeşil Sandık', need: 25_000, coins: 50 },
  { id: 'c3', name: 'Mavi Sandık', need: 50_000, coins: 50 },
  { id: 'c4', name: 'Kırmızı Sandık', need: 80_000, coins: 100 },
];
/** A chest opens for someone who did at least this much for the family this week (gift coins + task points). */
export const CHEST_MIN_CONTRIBUTION = 1;
/** Family themes, each from a family level. */
export const FAMILY_THEMES = [
  { id: 'gece', minLevel: 1 },
  { id: 'ates', minLevel: 1 },
  { id: 'orman', minLevel: 4 },
  { id: 'okyanus', minLevel: 7 },
  { id: 'altin', minLevel: 10 },
  { id: 'galaksi', minLevel: 13 },
];
/** Pair (İkili) gifts: the Uyum Köşesi task counts them. */
export const CP_GIFT_IDS = ['c9', 'c12', 'c1'];
/** The weekly family bonus rate by family level (shown as an estimate; paying it is a management decision). */
export const FAMILY_RATES = [0.01, 0.0125, 0.015, 0.0175, 0.02, 0.0225, 0.025, 0.0275, 0.03, 0.0325, 0.035, 0.0375, 0.04, 0.045, 0.05];
/** Points a task gives for its progress. */
export const taskPoints = (t, progress) => (t.kind === 'count' ? (progress >= t.goal ? t.power : 0) : Math.floor(progress / t.per) * t.power);
