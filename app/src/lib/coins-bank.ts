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

// --- Jeton Noktası on the server (components/coins-bank-live.tsx) ---------------------------------------------
/** Most coins one sale may move (server/api/jeton.mjs TRANSFER_MAX). */
export const BANK_SALE_MAX = 100_000_000;
const tr = (n: number) => n.toLocaleString('tr-TR');

/**
 * A Jeton Noktası selling coins from its stock: whole coins, at most its stock, and the receipt of the payment it
 * took outside the app (the server keeps it with the transfer). Null when the server would take it.
 */
export function bankSaleError({ to, coins, stock, paymentRef }: { to: string | null; coins: number; stock: number; paymentRef: string }): string | null {
  if (!to) return 'Jeton göndereceğin kişiyi seç.';
  if (!Number.isSafeInteger(coins) || coins <= 0) return 'Geçerli bir jeton miktarı gir.';
  if (coins > BANK_SALE_MAX) return `Tek aktarımda en çok ${tr(BANK_SALE_MAX)} jeton gönderilebilir.`;
  if (coins > stock) return `Stokta ${tr(stock)} jeton var.`;
  const ref = paymentRef.trim();
  if (!ref) return 'Ödemenin dekont veya havale numarasını yaz.';
  if (ref.length > 100) return 'Dekont numarası en çok 100 karakter olabilir.';
  return null;
}

/** A host selling unlocked diamonds to a Jeton Noktası: at least the exchange minimum, at most what is withdrawable. */
export function diamondSaleError(diamonds: number, withdrawable: number, r: Rules = RULES): string | null {
  if (!Number.isSafeInteger(diamonds) || diamonds <= 0) return 'Geçerli bir elmas miktarı gir.';
  if (diamonds < r.exchangeMinDiamonds) return `En az ${tr(r.exchangeMinDiamonds)} elmas bozdurabilirsin.`;
  if (diamonds > withdrawable) return 'Çekilebilir elmasın yetmiyor. Kilitli elmaslar süresi dolunca eklenir.';
  return null;
}

/** A transfer as the server lists it (GET /api/jeton/transfers). */
export type TransferLike = {
  kind: 'bank_sale' | 'diamond_sale' | 'wholesale';
  from: { id: string; name: string | null } | null;
  to: { id: string; name: string | null };
  coins: number;
  diamonds: number | null;
  valueTl: number | null;
  paymentRef: string | null;
};

/** How a transfer reads for me (`me`: my server id): what it was, with whom, and what moved on my side. */
export function transferLine(t: TransferLike, me: string | null): { title: string; detail: string; amount: string; incoming: boolean } {
  const mine = (id: string | undefined) => !!me && id === me;
  const tl = (v: number | null) => (v === null ? '' : ` · ${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`);
  const ref = t.paymentRef ? ` · Dekont ${t.paymentRef}` : '';
  if (t.kind === 'wholesale') return { title: 'Toptan jeton alımı', detail: `Yönetimden${ref}`, amount: `+${tr(t.coins)} jeton`, incoming: true };
  if (t.kind === 'diamond_sale') {
    // The host sold diamonds; the bank got coins for them and owes the host their value outside the app.
    if (mine(t.from?.id)) return { title: 'Elmas bozdurdun', detail: `${t.to.name ?? 'Jeton Noktası'}${tl(t.valueTl)}`, amount: `-${tr(t.diamonds ?? 0)} elmas`, incoming: false };
    return { title: 'Elmas bozdurma', detail: `${t.from?.name ?? 'Yayıncı'} · ${tr(t.diamonds ?? 0)} elmas${tl(t.valueTl)}`, amount: `+${tr(t.coins)} jeton`, incoming: true };
  }
  if (mine(t.from?.id)) return { title: 'Jeton satışı', detail: `${t.to.name ?? 'Alıcı'}${ref}`, amount: `-${tr(t.coins)} jeton`, incoming: false };
  return { title: 'Jeton Noktası yüklemesi', detail: t.from?.name ?? 'Jeton Noktası', amount: `+${tr(t.coins)} jeton`, incoming: true };
}
