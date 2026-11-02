// Small Turkish text helpers: the suffix a number takes, and leaderboard period labels built from today's
// date instead of a fixed one.

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// The ablative suffix follows how the last word of the number is said: 5 "beş" → 5'ten, 6 "altı" → 6'dan.
const UNITS = ['', 'den', 'den', 'ten', 'ten', 'ten', 'dan', 'den', 'den', 'dan'];
const TENS = ['', 'dan', 'den', 'dan', 'tan', 'den', 'tan', 'ten', 'den', 'dan'];

/** "5’ten", "6’dan", "40’tan", "100’den": a whole number with its "from" suffix. */
export function fromN(n: number): string {
  const v = Math.abs(Math.trunc(n));
  const suffix = v === 0 ? 'dan' : v % 10 ? UNITS[v % 10] : v % 100 ? TENS[(v % 100) / 10] : 'den'; // yüz, bin → den
  return `${n}’${suffix}`;
}

const dayMonth = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

/** "2 Kasım 2026", "27 Ekim – 2 Kasım 2026", "1–30 Kasım 2026": today, this week (Mon–Sun), this month. */
export function periodLabel(period: 'daily' | 'weekly' | 'monthly', now = new Date()): string {
  const y = now.getFullYear();
  if (period === 'daily') return `${dayMonth(now)} ${y}`;
  if (period === 'monthly') return `1–${new Date(y, now.getMonth() + 1, 0).getDate()} ${MONTHS[now.getMonth()]} ${y}`;
  const start = new Date(y, now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  if (start.getFullYear() !== end.getFullYear()) return `${dayMonth(start)} ${start.getFullYear()} – ${dayMonth(end)} ${end.getFullYear()}`;
  if (start.getMonth() !== end.getMonth()) return `${dayMonth(start)} – ${dayMonth(end)} ${end.getFullYear()}`;
  return `${start.getDate()}–${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
}

/** How the user's own row is named in member lists: "Deniz (sen)", or just "Sen" while the name is still the default. */
export const youLabel = (name: string) => (name.trim().toLocaleLowerCase('tr-TR') === 'sen' ? 'Sen' : `${name} (sen)`);

/** "Bugün 14:05", "Dün 14:05", "28 Ekim 14:05": a row's time with its day (persist.today format, "2026-11-2"). */
export function stampLabel(day: string | undefined, time: string, now = new Date()): string {
  const [y, m, d] = (day ?? '').split('-').map(Number);
  if (!y || !m || !d) return time;
  const date = new Date(y, m - 1, d);
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((midnight.getTime() - date.getTime()) / 86_400_000); // round: DST days are 23 or 25 hours
  if (diff === 0) return `Bugün ${time}`;
  if (diff === 1) return `Dün ${time}`;
  return `${dayMonth(date)}${y !== now.getFullYear() ? ` ${y}` : ''} ${time}`;
}
