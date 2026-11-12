// Words and numbers of the Yönetim panel (components/admin): dates, amounts, labels and the short result lines
// shown after an action. Pure functions, so the tests can check what the owner reads.

const n = (v: number) => Math.round(v).toLocaleString('tr-TR');

export const fmtNum = n;
export const fmtUsd = (v: number) => `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
export const fmtTl = (v: number) => `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
export const fmtDiamonds = (v: number) => `${n(v)} elmas`;
export const fmtCoins = (v: number) => `${n(v)} jeton`;

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** "4 Kas 14:05", with the year when it isn't this year. */
export function fmtDate(iso: string | null | undefined, now = new Date()) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year} ${hm}`;
}

/** "az önce", "5 dk önce", "3 sa önce", "2 gün önce", else the date. */
export function ago(iso: string | null | undefined, now = new Date()) {
  if (!iso) return '';
  const ms = now.getTime() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'az önce';
  if (min < 60) return `${min} dk önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} sa önce`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} gün önce`;
  return fmtDate(iso, now);
}

/** Server uptime in seconds as "3 gün 4 sa", "2 sa 10 dk" or "12 dk". */
export function fmtUptime(s: number) {
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d} gün ${h % 24} sa`;
  if (h > 0) return `${h} sa ${m % 60} dk`;
  return `${Math.max(0, m)} dk`;
}

/** 'Süresiz' in the ban choices: the server's longest length, sent with permanent: true (banBody). */
export const PERMANENT_BAN_DAYS = 3650;
export const isPermanentBan = (days: number) => days >= PERMANENT_BAN_DAYS;
/** Ban lengths the server accepts (1–3650 days). */
export const BAN_OPTIONS: { days: number; label: string }[] = [
  { days: 1, label: '1 gün' },
  { days: 3, label: '3 gün' },
  { days: 7, label: '7 gün' },
  { days: 30, label: '30 gün' },
  { days: PERMANENT_BAN_DAYS, label: 'Süresiz' },
];
export const banLabel = (days: number) => BAN_OPTIONS.find((o) => o.days === days)?.label ?? `${days} gün`;
/** "7 gün askıya alındı" / "süresiz askıya alındı"; `future`: "… alınacak". */
export const banPhrase = (days: number, future = false) => `${isPermanentBan(days) ? 'süresiz' : `${days} gün`} askıya ${future ? 'alınacak' : 'alındı'}`;
/**
 * What a ban choice sends: the days, plus permanent: true for 'Süresiz' so the server records a lifetime ban
 * (is_permanent) rather than a 10-year one. A server that does not know the flag still bans for the 3650 days.
 */
export const banBody = (days: number): { days: number; permanent?: true } => (isPermanentBan(days) ? { days: PERMANENT_BAN_DAYS, permanent: true } : { days });

export const REPORT_TARGET_LABEL: Record<string, string> = { user: 'Kişi', room: 'Oda', message: 'Mesaj', moment: 'An', comment: 'Yorum', family: 'Aile' };

export const PLATFORM_LABEL: Record<string, string> = { android: 'Google Play', ios: 'App Store', test: 'Test' };

/** A device's verification state (user_devices.device_verification_status) in words. */
export const VERIFICATION_LABEL: Record<string, string> = { unverified: 'Doğrulanmamış', verified: 'Doğrulandı', failed: 'Doğrulama başarısız' };
export const verificationLabel = (v: string) => VERIFICATION_LABEL[v] ?? v;

/** The line under a sanction permission (its title is already the Turkish description): where it comes from. */
export const permSource = (on: boolean, fromRole: boolean) => (fromRole ? 'Rolden geliyor' : on ? 'Ek yetki' : undefined);

/** The agency commission ledger's kinds (agency_ledger.kind on the server) as the office and centre show them. */
export const AGENCY_LEDGER_LABEL: Record<string, string> = {
  direct: 'Doğrudan komisyon',
  difference: 'Fark komisyonu',
  transition: 'Geçiş komisyonu',
  transfer_fee: 'Transfer ücreti',
  adjustment: 'Düzeltme',
  reversal: 'İptal / iade',
  bd: 'BD komisyonu',
  assistant: 'Asistan payı',
};

/** "5.000 jeton + 2.500 hediye". */
export const purchaseCoins = (coins: number, bonus: number) => (bonus > 0 ? `${fmtCoins(coins)} + ${n(bonus)} hediye` : fmtCoins(coins));

/** What a manual refund took back, in one or two sentences. */
export function refundResult(r: { coins: number; diamonds: number; unrecoveredDiamonds: number }) {
  const back = [r.coins > 0 && fmtCoins(r.coins), r.diamonds > 0 && fmtDiamonds(r.diamonds)].filter(Boolean).join(' ve ');
  const first = back ? `${back} geri alındı.` : 'Geri alınacak jeton kalmamıştı.';
  return r.unrecoveredDiamonds > 0 ? `${first} ${fmtDiamonds(r.unrecoveredDiamonds)} kilidi açıldığı için geri alınamadı.` : first;
}

/** The answer of "Google iadelerini şimdi kontrol et". */
export function voidedResult(r: { checked: number; refunded: number; unknown: number }) {
  if (r.checked === 0) return 'Google Play’de yeni iade yok.';
  const parts = [`${n(r.checked)} iade kaydı okundu`, r.refunded ? `${n(r.refunded)} tanesi uygulandı` : 'yeni uygulanacak iade yok'];
  if (r.unknown) parts.push(`${n(r.unknown)} tanesi bu uygulamanın alımı değil`);
  return `${parts.join(', ')}.`;
}

/** Things waiting for the owner, for the Özet tiles and the tab badges. */
export type Pending = { reports: number; withdrawals: number; payouts: number; support: number };
