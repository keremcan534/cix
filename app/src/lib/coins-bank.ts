// Diamonds → coins (server stand-in).
//   - Çevir (everyone, Gelir screen): your own diamonds become coins at their official value, priced like the
//     best coin pack in the store, with no fee. Coins are rounded down, so a diamond never buys more than the
//     coins its cash value would buy (server/api/catalog.mjs exchangeCoins does the same sum).
// Coins Bank rules: the main Jeton Noktası account also trades with hosts and management.
//   - Exchange: it pays a host or agency the official value of their diamonds at once and receives coins worth
//     that value plus its fee (3 %) at its selling price. The rate is derived from value, never a fixed number,
//     so a diamond can't be sold for more than it is worth when the exchange rate or pack prices change.
//   - Wholesale: it buys coins from management at its selling price minus its fee (2 %).
// Every other account is refused, whatever the client sends. Pure functions: the server and the tests run them.
//
// Every sum takes the rules as its last argument (RULES when left out). Çevir screens pass liveRules()
// (lib/live/catalog-live): the server's live rate (Canlı ayarlar exchange_usd_try), the same one the request
// sends back. The Coins Bank sums keep the compiled rate, as the server does for them.
import { RULES, type Rules } from '@/data/rules';

export type AccountKind = 'standard' | 'coins_bank_main';
export type Quote<T extends object> = ({ ok: true } & T) | { ok: false; reason: string };

/** What diamonds are worth in TL under the payout rule (e.g. 1.000.000 💎 = 200 USD). */
export const diamondValueTl = (diamonds: number, r: Rules = RULES) => (diamonds / r.diamondsPerUsd) * r.usdTry;
/** Coins per diamond for the Coins Bank: value × its selling price × (1 + fee). */
export const exchangeRate = (r: Rules = RULES) => (1 / r.diamondsPerUsd) * r.usdTry * r.coinsBankRetailCoinsPerTl * (1 + r.coinsBankExchangeFee);

/** Coins per diamond for Çevir: value × the best pack's coins per TL (no fee). Pass liveRules() for the live rate. */
export const selfExchangeRate = (r: Rules = RULES) => (1 / r.diamondsPerUsd) * r.usdTry * r.coinsBankRetailCoinsPerTl;

/** Çevir: whole diamonds from your own balance, at least the rule's minimum; coins rounded down. */
export function exchangeOwnDiamonds(diamonds: number, balance: number, r: Rules = RULES): Quote<{ coins: number; valueTl: number }> {
  if (!Number.isInteger(diamonds) || diamonds <= 0) return { ok: false, reason: 'Geçerli bir elmas miktarı gir.' };
  if (diamonds < r.exchangeMinDiamonds) return { ok: false, reason: `En az ${r.exchangeMinDiamonds.toLocaleString('tr-TR')} elmas çevirebilirsin.` };
  if (diamonds > balance) return { ok: false, reason: 'Yetersiz elmas bakiyesi.' };
  return { ok: true, coins: Math.floor(diamonds * selfExchangeRate(r)), valueTl: diamondValueTl(diamonds, r) };
}

/**
 * Coins Bank exchange: the bank buys a host's diamonds at value and takes coins plus its fee. Only the main
 * Coins Bank account; whole diamonds and coins only (coins are rounded down, so the bank never gets more than
 * its fee).
 */
export function convertDiamonds(kind: AccountKind, diamonds: number, r: Rules = RULES): Quote<{ coins: number; paidTl: number; feeTl: number }> {
  if (kind !== 'coins_bank_main') return { ok: false, reason: 'Bu kur yalnızca ana Jeton Noktası hesabına açıktır. Kendi elmasını Gelir > Çevir ile jetona çevirebilirsin.' };
  if (!Number.isInteger(diamonds) || diamonds <= 0) return { ok: false, reason: 'Geçerli bir elmas miktarı gir.' };
  const coins = Math.floor(diamonds * exchangeRate(r));
  const paidTl = diamondValueTl(diamonds, r);
  return { ok: true, coins, paidTl, feeTl: coins / r.coinsBankRetailCoinsPerTl - paidTl };
}

/** Price the Coins Bank pays management for coins: its selling price minus its wholesale fee. */
export function wholesaleQuote(kind: AccountKind, coins: number, r: Rules = RULES): Quote<{ priceTl: number; retailTl: number; feeTl: number }> {
  if (kind !== 'coins_bank_main') return { ok: false, reason: 'Toptan jeton alımı yalnızca ana Jeton Noktası hesabına açıktır.' };
  if (!Number.isInteger(coins) || coins <= 0) return { ok: false, reason: 'Geçerli bir jeton miktarı gir.' };
  const retailTl = coins / r.coinsBankRetailCoinsPerTl;
  const priceTl = retailTl * (1 - r.coinsBankWholesaleFee);
  return { ok: true, priceTl, retailTl, feeTl: retailTl - priceTl };
}
