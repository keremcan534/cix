// Coins Bank rules (server stand-in). The Coins Bank is the one account that may turn diamonds into coins.
//   - Exchange: it pays a host or agency the official value of their diamonds at once and receives coins worth
//     that value plus its fee (3 %) at its selling price. The rate is derived from value, never a fixed number,
//     so a diamond can't be sold for more than it is worth when the exchange rate or pack prices change.
//   - Wholesale: it buys coins from management at its selling price minus its fee (2 %).
// Every other account is refused, whatever the client sends. Pure functions: the server and the tests run them.
import { RULES, type Rules } from '@/data/rules';

export type AccountKind = 'standard' | 'coins_bank_main';
export type Quote<T extends object> = ({ ok: true } & T) | { ok: false; reason: string };

/** What diamonds are worth in TL under the payout rule (e.g. 1.000.000 💎 = 200 USD). */
export const diamondValueTl = (diamonds: number, r: Rules = RULES) => (diamonds / r.diamondsPerUsd) * r.usdTry;
/** Coins per diamond for the Coins Bank: value × its selling price × (1 + fee). */
export const exchangeRate = (r: Rules = RULES) => (1 / r.diamondsPerUsd) * r.usdTry * r.coinsBankRetailCoinsPerTl * (1 + r.coinsBankExchangeFee);

/**
 * Diamonds → coins. Only the main Coins Bank account; whole diamonds and coins only (coins are rounded down,
 * so the bank never gets more than its fee).
 */
export function convertDiamonds(kind: AccountKind, diamonds: number, r: Rules = RULES): Quote<{ coins: number; paidTl: number; feeTl: number }> {
  if (kind !== 'coins_bank_main') return { ok: false, reason: 'Elmas yalnızca ana Coins Bank hesabında jetona çevrilir. Kazancını Coins Bank üzerinden bozdurabilir veya haftalık çekebilirsin.' };
  if (!Number.isInteger(diamonds) || diamonds <= 0) return { ok: false, reason: 'Geçerli bir elmas miktarı gir.' };
  const coins = Math.floor(diamonds * exchangeRate(r));
  const paidTl = diamondValueTl(diamonds, r);
  return { ok: true, coins, paidTl, feeTl: coins / r.coinsBankRetailCoinsPerTl - paidTl };
}

/** Price the Coins Bank pays management for coins: its selling price minus its wholesale fee. */
export function wholesaleQuote(kind: AccountKind, coins: number, r: Rules = RULES): Quote<{ priceTl: number; retailTl: number; feeTl: number }> {
  if (kind !== 'coins_bank_main') return { ok: false, reason: 'Toptan jeton alımı yalnızca ana Coins Bank hesabına açıktır.' };
  if (!Number.isInteger(coins) || coins <= 0) return { ok: false, reason: 'Geçerli bir jeton miktarı gir.' };
  const retailTl = coins / r.coinsBankRetailCoinsPerTl;
  const priceTl = retailTl * (1 - r.coinsBankWholesaleFee);
  return { ok: true, priceTl, retailTl, feeTl: retailTl - priceTl };
}
