// Şanslı hediyeler: the packages, their odds and the draw (lucky.mjs plays them; no database or LiveKit here,
// so the tests can load it on its own). The app shows the same tables (app/src/lib/lucky.ts).
import { HttpError, int, text } from './core.mjs';

/** Odds are whole numbers out of 100,000 (0.001 % steps), so the total check is exact. */
export const ODDS_TOTAL = 100_000;
export const MULTS = [2, 5, 10, 20, 50, 100, 200, 500, 1000];
/** The recipient's part of the price, as diamonds (app/src/data/rules.ts LUCKY_RECIPIENT_SHARE). */
export const SHARE = 0.2;
export const MIN_AGE = 18;
/** A package's id: the app's four (lk1–lk4) and the panel's own (Güncelleme 7 madde 10). */
export const LUCKY_ID = /^lk[a-z0-9]{1,20}$/;

/** mult 0 = no reward; it takes whatever the listed multipliers leave, so a table always adds up to 100 %. */
const tiers = (w) => {
  const list = [0, ...MULTS].filter((m) => m === 0 || w[m] !== undefined).map((m) => ({ mult: m, weight: w[m] ?? 0 }));
  const rest = ODDS_TOTAL - list.reduce((n, t) => n + t.weight, 0);
  return list.map((t) => (t.mult === 0 ? { ...t, weight: rest } : t));
};
// The app's packages (lib/lucky.ts). Expected return about 0.65× the price, paid as coins.
const STANDARD = tiers({ 2: 15_000, 5: 3_000, 10: 800, 20: 250, 50: 60, 100: 20, 500: 2, 1000: 1 });
export const DEFAULT_CONFIG = {
  gifts: [
    { id: 'lk1', name: 'Şans Yoncası', emoji: '🍀', price: 20, enabled: true, tiers: STANDARD },
    { id: 'lk2', name: 'Uğur Böceği', emoji: '🐞', price: 100, enabled: true, tiers: STANDARD },
    { id: 'lk3', name: 'Altın Nal', emoji: '🧲', price: 500, enabled: true, tiers: STANDARD },
    { id: 'lk4', name: 'Kayan Yıldız', emoji: '🌠', price: 1000, enabled: true, tiers: tiers({ 2: 14_000, 5: 3_200, 10: 900, 20: 200, 50: 70, 100: 25, 200: 5 }) },
  ],
  /** Game coins paid as rewards per day across the platform. */
  dailyPayoutLimit: 20_000_000,
  /** Wins from this multiplier up are announced in the room. */
  announceFrom: 50,
};

const bad = (m) => {
  throw new HttpError(400, m);
};
export const maxMult = (g) => Math.max(0, ...g.tiers.filter((t) => t.weight > 0).map((t) => t.mult));

/** A package from input, checked; a 400 saying what is wrong otherwise. */
function checkGift(g, i) {
  if (!g || typeof g !== 'object') bad('Geçersiz paket');
  const id = typeof g.id === 'string' && LUCKY_ID.test(g.id) ? g.id : bad(`${i + 1}. paketin kimliği geçersiz`);
  const name = text(g.name, 1, 30, 'paket adı');
  const emoji = typeof g.emoji === 'string' && g.emoji.trim().length >= 1 && g.emoji.trim().length <= 8 ? g.emoji.trim() : bad(`${name}: simge geçersiz`);
  // At least 5: the recipient's 20 % has to be a whole diamond.
  const price = int(g.price, 5, 100_000) ?? bad(`${name}: fiyat 5 ile 100.000 jeton arası olmalı`);
  if (!Array.isArray(g.tiers) || g.tiers.length < 1 || g.tiers.length > MULTS.length + 1) bad(`${name}: olasılık tablosu geçersiz`);
  const seen = new Set();
  const list = g.tiers.map((t) => {
    const mult = int(t?.mult, 0, 1000);
    if (mult === null || (mult !== 0 && !MULTS.includes(mult))) bad(`${name}: tanımsız çarpan var`);
    if (seen.has(mult)) bad(`${name}: aynı çarpan iki kez var`);
    seen.add(mult);
    const weight = int(t?.weight, 0, ODDS_TOTAL);
    if (weight === null) bad(`${name}: olasılıklar 0 ile %100 arası tam sayı olmalı`);
    return { mult, weight };
  });
  const sum = list.reduce((n, t) => n + t.weight, 0);
  if (sum !== ODDS_TOTAL) bad(`${name}: olasılıkların toplamı %${(sum / 1000).toLocaleString('tr-TR')}; %100 olmalı`);
  return { id, name, emoji, price, enabled: g.enabled === true, tiers: list.sort((a, b) => a.mult - b.mult) };
}

/** A whole configuration from input (the admin's save), checked. */
export function checkConfig(v) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.gifts) || v.gifts.length < 1 || v.gifts.length > 20) bad('Geçersiz ayarlar');
  const gifts = v.gifts.map(checkGift);
  if (new Set(gifts.map((g) => g.id)).size !== gifts.length) bad('Aynı paket iki kez var');
  // Two packages with one name would read alike on the shelf, in the room and in the history.
  const names = gifts.map((g) => g.name.toLocaleLowerCase('tr'));
  const twice = gifts.find((g, k) => names.indexOf(names[k]) !== k);
  if (twice) bad(`“${twice.name}” adında iki paket var; her paketin adı ayrı olmalı`);
  const dailyPayoutLimit = int(v.dailyPayoutLimit, 1, 1_000_000_000_000) ?? bad('Günlük ödül limiti geçersiz');
  const announceFrom = MULTS.includes(v.announceFrom) ? v.announceFrom : bad('Duyuru çarpanı geçersiz');
  return { gifts, dailyPayoutLimit, announceFrom };
}

/** One draw: the multiplier `r` (0 ≤ r < ODDS_TOTAL) falls on. */
export function drawMult(list, r) {
  for (const t of list) {
    if (r < t.weight) return t.mult;
    r -= t.weight;
  }
  return 0;
}

const tiersKey = (list) => JSON.stringify([...list].sort((a, b) => a.mult - b.mult).map((t) => [t.mult, t.weight]));
/** A package's `since` (withSince), or `version` for one saved before packages had it: as it is now from then on. */
export const sinceOf = (g, version) => int(g?.since, 1, version) ?? version;
/**
 * The packages of a configuration saved as `version` (checkConfig's), each with `since`: the version from which its
 * price and odds are as now. Kept from the configuration before (`prev`, version `prevVersion`) when neither changed;
 * this version otherwise (a new package, or one put back after it was taken out, too).
 */
export function withSince(gifts, prev, prevVersion, version) {
  const before = new Map((prev?.gifts ?? []).map((g) => [g.id, g]));
  return gifts.map((g) => {
    const p = before.get(g.id);
    const same = p && p.price === g.price && tiersKey(p.tiers) === tiersKey(g.tiers);
    return { ...g, since: same ? sinceOf(p, prevVersion) : version };
  });
}

/**
 * What a newer app sends with a send: the package's price it showed and the settings' version it read them at
 * (GET /api/lucky `version`); undefined each when it sent none (an older app). A 400 when malformed.
 */
export function shownOf(b) {
  const price = b.price === undefined || b.price === null ? undefined : int(b.price, 1, Number.MAX_SAFE_INTEGER);
  const version = b.version === undefined || b.version === null ? undefined : int(b.version, 1, Number.MAX_SAFE_INTEGER);
  if (price === null || version === null) throw new HttpError(400, 'Geçersiz istek');
  return { price, version };
}

const fmt = (n) => n.toLocaleString('tr-TR');
/**
 * The send goes on only at what the phone showed: a package whose price moved is refused (409 price_changed with the
 * price now), one whose odds or price changed after the version the phone read them at too (409 odds_changed with
 * the version now); the phone reads the packages again and nothing moves. Called inside the send's transaction, after
 * its replay check, so a retry of a send that went through gets its first answer. An older app sends neither and is
 * played at the server's price and odds, as always.
 */
export function checkShownLucky(gift, shown, version) {
  if (shown.price !== undefined && shown.price !== gift.price) {
    throw Object.assign(new HttpError(409, `${gift.name} Şanslı hediyesinin fiyatı değişti: artık ${fmt(gift.price)} jeton. Yeni fiyatı görüp yeniden gönder.`), {
      extra: { code: 'price_changed', giftId: gift.id, price: gift.price, version },
    });
  }
  if (shown.version !== undefined && (shown.version > version || shown.version < sinceOf(gift, version))) {
    throw Object.assign(new HttpError(409, `${gift.name} Şanslı hediyesinin olasılıkları değişti. Yeni olasılık tablosunu görüp yeniden gönder.`), {
      extra: { code: 'odds_changed', giftId: gift.id, version },
    });
  }
}
