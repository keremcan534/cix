// The 6-digit codes of e-mail sign-in and of checking an address or a number in Ayarlar (server/api/auth.mjs,
// whatsapp.mjs): the resend wait, the countdown text, phone numbers on screen and what an answer means, in
// Turkish. Pure logic, no React.

export const CODE_LENGTH = 6;
const DEFAULT_WAIT = 60;

/** The wait the server asked for, in whole seconds within 1–600; `fallback` when it sent nothing usable. */
export function retrySeconds(raw: unknown, fallback = DEFAULT_WAIT): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(600, Math.max(1, Math.ceil(n))) : fallback;
}

/**
 * 45 → "45 sn", 0 or less → "0 sn". Seconds up to 90, so the server's 60-second wait reads the same way from start
 * to end; only a longer wait (never sent today) starts as minutes, 125 → "2:05".
 */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s <= 90) return `${s} sn`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The greyed resend line while the wait runs, the same on the code screen and in the Ayarlar sheet. */
export const resendLabel = (seconds: number) => `Kodu tekrar gönder (${formatCountdown(seconds)})`;

/** A code that went out: where to, the challenge that goes back with it, and when another may be asked for. */
export type SentCode = { target: string; challenge: string; resendAt: number };

/**
 * Sending again to the same address or number while the resend wait runs: the code already sent still works and
 * the server would refuse a new one (429), so the screen goes back to that code. Null for another target or once
 * the wait is over.
 */
export function reusableCode(last: SentCode | null, target: string, now: number): { challenge: string; retryAfter: number } | null {
  if (!last || last.target !== target || now >= last.resendAt) return null;
  return { challenge: last.challenge, retryAfter: Math.ceil((last.resendAt - now) / 1000) };
}

/** "Yeni kod için 42 saniye bekle" → 42: the wait inside the server's 429, null when it isn't that message. */
export function waitFromMessage(message: string): number | null {
  const m = /(\d+)\s*saniye bekle/.exec(message);
  return m ? retrySeconds(Number(m[1])) : null;
}

/** "5321234567" → "532 123 45 67": the digits after +90 as they are typed. */
export const groupTrDigits = (digits: string) => [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 8), digits.slice(8, 10)].filter(Boolean).join(' ');

/** The digits typed after +90 as the server's form (+905321234567), or null unless a Turkish mobile number. */
export function trMobile(typed: string): string | null {
  const d = typed.replace(/\D/g, '').replace(/^0/, '');
  return /^5\d{9}$/.test(d) ? `+90${d}` : null;
}

/** "+905321234567" → "+90 532 123 45 67"; another country's number stays as it is. */
export function formatPhone(phone: string): string {
  const m = /^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  return m ? `+90 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}

export type CodeFailure = 'wrong' | 'expired' | 'tries' | 'locked' | 'device_has_account' | 'use_other' | 'other';

/** What a refused code (or a refused sign-in after it) means for the screen. */
export function codeFailure(status: number, code: string | undefined, message: string): CodeFailure {
  if (status === 409 && code === 'device_has_account') return 'device_has_account';
  if (status === 409 && (code === 'use_google' || code === 'use_email')) return 'use_other';
  if (status === 400 && message === 'Kod yanlış') return 'wrong';
  if (status === 400 && message.includes('süresi doldu')) return 'expired';
  if (status === 429 && message.includes('yeni kod iste')) return 'tries';
  if (status === 429) return 'locked';
  return 'other';
}

const SIGNS_IN_WITH: Record<string, string> = {
  email: 'Bu telefondaki hesap e-posta ile giriş yapıyor.',
  google: 'Bu telefondaki hesap Google ile giriş yapıyor.',
  phone: 'Bu telefondaki hesap telefon numarasıyla giriş yapıyor.',
};

/** 409 device_has_account: the server's words, then which way the phone's account signs in (its `method`). */
export function deviceAccountText(message: string, method: unknown): string {
  const how = typeof method === 'string' && Object.prototype.hasOwnProperty.call(SIGNS_IN_WITH, method) ? SIGNS_IN_WITH[method] : null;
  return how ? `${message}\n\n${how}` : message;
}

/** The line under the code boxes for a refused code: our own words for the two common ones, else the server's. */
export function codeFailureText(failure: CodeFailure, message: string): string {
  if (failure === 'wrong') return 'Kod yanlış. Tekrar dene.';
  if (failure === 'expired') return 'Kodun süresi doldu. Yeni kod iste.';
  return message;
}

export type WhatsappResult = 'verified' | 'taken' | 'country' | 'no_number' | 'expired';
const RESULTS: Record<WhatsappResult, { title: string; body: string; ok: boolean }> = {
  verified: { title: 'Numaran doğrulandı', body: 'Telefon numaran hesabına bağlandı. Numaran profilinde görünmez.', ok: true },
  taken: { title: 'Bu numara başka bir hesaba bağlı', body: 'Başka bir numarayla dene ya da o hesapla giriş yap.', ok: false },
  country: { title: 'Bu ülke henüz desteklenmiyor', body: 'Bu ülkenin numaraları henüz doğrulanamıyor.', ok: false },
  no_number: { title: 'Numaran okunamadı', body: 'Mesajın geldi ama numaran okunamadı. Mesajı kendi numarandan, değiştirmeden gönder.', ok: false },
  expired: { title: 'Süre doldu', body: 'Mesaj 10 dakika içinde gelmedi. Yeniden dene.', ok: false },
};

/** The WhatsApp check's result (GET /api/me/phone/status) in Turkish; null while it is still waiting. */
export function whatsappResultText(result: unknown): { title: string; body: string; ok: boolean } | null {
  return typeof result === 'string' && Object.prototype.hasOwnProperty.call(RESULTS, result) ? RESULTS[result as WhatsappResult] : null;
}
