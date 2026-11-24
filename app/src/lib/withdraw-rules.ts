// Para çekme: the checks the app makes before a withdrawal request, the same as the server's (server/api
// withdraw.mjs), so a mistake is caught on the phone. The server checks everything again. Pure logic, no React.
import { RULES } from '@/data/rules';

export type WithdrawMethod = 'iban' | 'other';
export type WithdrawStatus = 'pending' | 'paid' | 'rejected' | 'cancelled';

export const WITHDRAW_STATUS_LABEL: Record<WithdrawStatus, string> = {
  pending: 'Beklemede',
  paid: 'Ödendi',
  rejected: 'Reddedildi',
  cancelled: 'İptal edildi',
};

/** Whether this account may take money out (server streamer-rule.mjs): `why` says what to do when it may not. */
export type CashOut = { allowed: boolean; code: string | null; why: string | null };
/** The server's answer; null when it says nothing (an older server) or something odd. */
export function parseCashOut(raw: unknown): CashOut | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!o || typeof o.allowed !== 'boolean') return null;
  return { allowed: o.allowed, code: typeof o.code === 'string' ? o.code : null, why: typeof o.why === 'string' ? o.why.slice(0, 300) : null };
}
/** Whether a screen offers Para Çek and Anında bozdur: not until the server said; an older server doesn't say and allows. */
export const offersCashOut = (live: boolean, s: { loaded: boolean; cashOut: CashOut | null }) => !live || (s.loaded && s.cashOut?.allowed !== false);

export const cleanAccount = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * An IBAN of any country: two letters, two check digits, 11–30 letters or digits, and correct ISO 13616 check
 * digits (the first 4 characters moved to the end, letters read as 10–35, mod 97 = 1). Digit by digit, no BigInt.
 */
export function validAnyIban(raw: string) {
  const iban = cleanAccount(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  let rest = 0;
  for (const ch of iban.slice(4) + iban.slice(0, 4)) {
    const v = parseInt(ch, 36);
    rest = (rest * (v > 9 ? 100 : 10) + v) % 97;
  }
  return rest === 1;
}

/** "GB82 WEST 1234 …" grouping while typing. */
export const formatIban = (raw: string) =>
  cleanAccount(raw)
    .slice(0, 34)
    .replace(/(.{4})/g, '$1 ')
    .trim();

/** Short form for a list: "GB82 •••• 5432" for an IBAN, the start of anything else. */
export function maskAccount(method: WithdrawMethod, account: string) {
  if (method === 'iban') {
    const c = cleanAccount(account);
    return `${c.slice(0, 4)} •••• ${c.slice(-4)}`;
  }
  const t = account.trim();
  return t.length > 24 ? `${t.slice(0, 24)}…` : t;
}

/** What the server pays for `diamonds`, in USD, cents rounded down (server catalog.mjs diamondValueUsd); `perUsd`: the live diamond value. */
export const withdrawUsd = (diamonds: number, perUsd = RULES.diamondsPerUsd) => Math.floor((diamonds / perUsd) * 100) / 100;

export type WithdrawForm = { diamonds: number; withdrawable: number; method: WithdrawMethod; holder: string; account: string };

/** The first problem with a request, in the words the screen shows, or null when it can be sent. */
export function checkWithdraw(f: WithdrawForm): string | null {
  const fmt = (n: number) => n.toLocaleString('tr-TR');
  if (!Number.isSafeInteger(f.diamonds) || f.diamonds < RULES.minWithdrawDiamonds) return `En az ${fmt(RULES.minWithdrawDiamonds)} elmas çekebilirsin.`;
  if (f.diamonds > RULES.maxWithdrawDiamonds) return `Tek talepte en çok ${fmt(RULES.maxWithdrawDiamonds)} elmas çekebilirsin.`;
  if (f.diamonds > f.withdrawable) return 'Çekilebilir elmasın yetmiyor. Kilitli elmaslar süresi dolunca eklenir.';
  const holder = f.holder.trim().replace(/\s+/g, ' ');
  if (holder.length < 3 || holder.length > 80) return 'Hesap sahibinin adını gir.';
  if (f.method === 'iban') {
    if (!validAnyIban(f.account)) return 'IBAN geçersiz. Harfleri ve rakamları tek tek kontrol et.';
  } else {
    const a = f.account.trim().replace(/\s+/g, ' ');
    if (a.length < 5 || a.length > 120) return 'Hesap bilgisini yaz (5–120 karakter).';
  }
  return null;
}
