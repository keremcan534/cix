// Bağlar kinds, prices and level steps: pure data, shared by the API (bonds.mjs, bond-life.mjs) and the app's test that
// keeps app/src/data/bonds.ts equal to it.

/**
 * Bond kinds: label, the bond gift's price in coins, and how many of the kind one person may have (the defaults of
 * Canlı ayarlar › Bağlar, bonds.mjs maxOf: one Çift; Aile kinds and Kanka practically unlimited, Güncelleme 7).
 */
export const KINDS = {
  cift: { label: 'Çift', gift: 'Bağ Yüzüğü', price: 5000, max: 1 },
  kardes: { label: 'Kardeş', gift: 'Kardeş Bilekliği', price: 1000, max: 1000 },
  baci: { label: 'Bacı', gift: 'Bacı Kolyesi', price: 1000, max: 1000 },
  agabey: { label: 'Ağabey', gift: 'Ağabey Saati', price: 1000, max: 1000 },
  abla: { label: 'Abla', gift: 'Abla Broşu', price: 1000, max: 1000 },
  yenge: { label: 'Yenge', gift: 'Yenge Çiçeği', price: 1000, max: 1000 },
  enishte: { label: 'Enişte', gift: 'Enişte Kravatı', price: 1000, max: 1000 },
  kanka: { label: 'Kanka', gift: 'Kanka Rozeti', price: 500, max: 1000 },
};
/**
 * Points needed for Lv.1 … Lv.20 (the first ten as they always were). Canlı ayarlar › Bağlar › bond_levels may set
 * other steps (always 20, the first 0, each higher than the one before): levelsOf reads them.
 */
export const LEVELS = [0, 10, 30, 60, 100, 200, 400, 700, 1200, 2000, 3000, 4500, 6500, 9000, 12000, 16000, 21000, 27000, 35000, 45000];
/** The highest level. */
export const MAX_LEVEL = LEVELS.length;
/** What each level opens (the app draws them). The mic mark shows from Lv1 (Güncelleme 7; older apps keep their Lv4). */
export const REWARDS = [
  { level: 1, key: 'mikrofon', label: 'Mikrofonda yan yana oturunca bağ işareti' },
  { level: 2, key: 'rozet', label: 'Profilde bağ rozeti' },
  { level: 6, key: 'cerceve', label: 'Profil çerçevesi' },
  { level: 8, key: 'giris', label: 'Odaya birlikte giriş efekti' },
  { level: 10, key: 'balon', label: 'Özel sohbet balonu' },
];
/** The level a reward opens at. */
export const rewardLevel = (key) => REWARDS.find((r) => r.key === key)?.level ?? Infinity;
/** The mark between two bonded people grows every five levels: tier 1 (Lv1–5) … tier 4 (Lv16–20). */
export const TIER_SIZE = 5;
export const tierOf = (level) => Math.min(Math.ceil(MAX_LEVEL / TIER_SIZE), Math.max(1, Math.ceil(level / TIER_SIZE)));

/**
 * The nightly drop and the end of a bond nobody gifts any more (Canlı ayarlar › Bağlar; these are the defaults): a
 * night after a day with no gift either way costs `dropPct` % of the points, at least `dropFlat` (never below 0); the
 * first night after the accept is free; `idleEndDays` days with no gift end the bond (0: never), with a SimilarClub
 * Sistem warning `idleWarnDays` days before (0: none).
 */
export const DECAY = { dropPct: 10, dropFlat: 10, idleEndDays: 30, idleWarnDays: 3 };

/** The steps the f9671d9 APK has compiled (its BOND_LEVELS: Lv1 … Lv10); past Lv10 it takes 0 as the level's start. */
const OLD_APP_STEPS = [0, 10, 30, 60, 100, 200, 400, 700, 1200, 2000];
/**
 * `score` and `nextLevelAt` for an app that doesn't send ?lv=20 (bonds.mjs). Its bar is (score - its step) /
 * (nextLevelAt - its step), with its step OLD_APP_STEPS[level - 1] ?? 0, and its text "score / nextLevelAt puan · Lv.N
 * için nextLevelAt - score puan". Both are moved by the same amount, so the bar is the real progress within the level
 * and the points still needed stay true; where its step is the level's real start (Lv1–10 with the default steps)
 * nothing moves. At the top level (no next) the points go as they are ("en yüksek seviye").
 */
export function oldAppPoints(score, level, levels) {
  const next = levels[level] ?? null;
  const shift = (OLD_APP_STEPS[level - 1] ?? 0) - (levels[level - 1] ?? 0);
  return next === null || shift === 0 ? { score, nextLevelAt: next } : { score: score + shift, nextLevelAt: next + shift };
}
/** The level of `score` points with the steps `levels` (Lv1 at 0). */
export const levelOf = (score, levels = LEVELS) => levels.reduce((lv, need, i) => (score >= need ? i + 1 : lv), 1);
/** A bond's points: every 100 coins the two gave each other, their talk points, less what the nights took (never below 0). */
export const scoreOf = (b) => Math.max(0, Math.floor(Number(b.gift_coins) / 100) + Number(b.talk_points) - Number(b.points_lost ?? 0));

/** The steps of a level list setting ("0, 10, 30, …" or numbers): 20 whole numbers from 0, each higher. Null otherwise. */
export function levelsOf(v) {
  const parts = Array.isArray(v)
    ? v
    : typeof v === 'string'
      ? v
          .split(',')
          .map((x) => x.trim().replaceAll('.', ''))
          .filter(Boolean)
          .map((x) => (/^\d{1,10}$/.test(x) ? Number(x) : NaN))
      : null;
  if (!parts || parts.length !== MAX_LEVEL || parts[0] !== 0) return null;
  for (let i = 0; i < parts.length; i++) if (!Number.isSafeInteger(parts[i]) || parts[i] > 1_000_000_000 || (i > 0 && parts[i] <= parts[i - 1])) return null;
  return parts;
}
