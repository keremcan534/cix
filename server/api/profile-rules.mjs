// What a profile may hold beyond the basics, and the level curve, decided here (profiles.mjs). Plain values with no
// imports, so the app's test (app/tests/profile-more.test.ts) can read them and fail when the app's lists drift:
// app/src/data/profile.ts (zodiacs, tags, relationship, education, languages), data/social-ui.ts COUNTRIES,
// data/wealth.ts levelCurve, WEALTH_XP and data/charm.ts CHARM_XP.

// --- Cömertlik (wealth) and Yankı (charm) levels ----------------------------------------------------------------
/** Readable threshold: to the nearest 5 below 100, otherwise two significant digits (app data/wealth.ts). */
export const readablePoints = (x) => {
  if (x < 100) return Math.max(5, Math.round(x / 5) * 5);
  const step = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Math.round(x / step) * step;
};

/** The app's level curve: Lv.L needs about A · L^1.5 · G^L points; two anchors (Lv.1 and the top) set it. */
export function levelCurve(first, last, max = 50) {
  const g = (last / (first * max ** 1.5)) ** (1 / (max - 1));
  const a = first / g;
  return Array.from({ length: max + 1 }, (_, l) => (l === 0 ? 0 : readablePoints(a * l ** 1.5 * g ** l)));
}

/** Cömertlik: Lv.1 at 10 points, Lv.50 at 30 million. Yankı: Lv.1 at 10, Lv.50 at 60 million. */
export const WEALTH_XP = levelCurve(10, 30_000_000);
export const CHARM_XP = levelCurve(10, 60_000_000);

/** Highest level whose threshold is reached. */
export const levelFrom = (table, xp) => {
  let lvl = 0;
  while (lvl < table.length - 1 && xp >= table[lvl + 1]) lvl++;
  return lvl;
};

// --- Personal extras: what the edit form offers ------------------------------------------------------------------
export const ZODIACS = ['Koç', 'Boğa', 'İkizler', 'Yengeç', 'Aslan', 'Başak', 'Terazi', 'Akrep', 'Yay', 'Oğlak', 'Kova', 'Balık'];
export const RELATIONSHIP = ['Bekar', 'İlişkisi var', 'Belirtilmemiş'];
export const EDUCATION = ['Lise', 'Ön lisans', 'Lisans', 'Yüksek lisans'];
/** Kişilik Etiketleri, by label (the app adds the emoji). */
export const TAGS = ['Basketbol', 'Mangal', 'Punk', 'Karaoke', 'Kahve', 'Oyuncu', 'Kitap kurdu', 'Gezgin', 'Gece kuşu', 'Esprili', 'Kedisever', 'Dans'];
export const LANGUAGES = ['Türkçe', 'English', 'Deutsch', 'العربية', 'Français', 'Español', 'Русский', 'Azərbaycanca', 'Nederlands', 'Kurdî'];
/** Ülke: the countries the app offers (without "Tüm ülkeler"). */
export const COUNTRIES = ['TR', 'AZ', 'DE', 'NL', 'CY'];

/** Lengths and ranges, the same in the app's form (lib/profile-more). */
export const EXTRA_LIMITS = { heightMin: 120, heightMax: 230, weightMin: 30, weightMax: 250, job: 30, slogan: 80, languages: 5, tags: 5 };
/** Album photos one person may keep (app lib/profile-rules LIMITS.photos). */
export const ALBUM_MAX = 6;

// --- Vitrin: medals and titles, from real records only ------------------------------------------------------------
// Ids are the app's (data/profile.ts MEDALS, TITLES), which give them their name and look. Each is earned by a rule
// on server data and is gone again once the rule no longer holds.
export const MEDAL_RULES = {
  /** Haftanın Yıldızı: among the top 3 of this week's Yankı board (gifts received, Turkey's calendar). */
  weekTop: 3,
  /** Cömert Kalp: gave gifts to this many different people. */
  generousPeople: 10,
  /** Sosyal Kelebek: this many friends (people who follow each other). */
  friends: 20,
};
export const TITLE_RULES = {
  /** Oda Efsanesi: their room reached this level (rooms.mjs roomLevel). */
  roomLevel: 10,
  /** Yükselen Yıldız: Yankı this level or more within this many days of joining. */
  risingCharm: 5,
  risingDays: 30,
};
