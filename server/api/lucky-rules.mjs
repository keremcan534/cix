// Şanslı hediyeler: the packages, their odds and the draw (lucky.mjs plays them; no database or LiveKit here,
// so the tests can load it on its own). The app shows the same tables (app/src/lib/lucky.ts).
import { HttpError, int, text } from './core.mjs';

/** Odds are whole numbers out of 100,000 (0.001 % steps), so the total check is exact. */
export const ODDS_TOTAL = 100_000;
export const MULTS = [2, 5, 10, 20, 50, 100, 200, 500, 1000];
/** The recipient's part of the price, as diamonds (app/src/data/rules.ts LUCKY_RECIPIENT_SHARE). */
export const SHARE = 0.2;
export const MIN_AGE = 18;

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
  const id = typeof g.id === 'string' && /^lk[a-z0-9]{1,20}$/.test(g.id) ? g.id : bad(`${i + 1}. paketin kimliği geçersiz`);
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
