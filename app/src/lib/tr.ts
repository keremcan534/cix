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

/** Türkiye's offset (UTC+3 all year since 2016): the app's days and week are counted in it, wherever the phone is. */
const TR_OFFSET_MS = 3 * 3_600_000;
/**
 * The calendar in Türkiye at `now`: year, month (0–11), day of the month, weekday (0 Monday … 6 Sunday), hour and
 * minute. The app's week (owners, 24 Nov 2026) is Monday 00:00 to Sunday 23:59:59 in it.
 */
export function trCalendar(now: Date | number = Date.now()) {
  const t = new Date(+now + TR_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), weekday: (t.getUTCDay() + 6) % 7, h: t.getUTCHours(), min: t.getUTCMinutes() };
}

/** A calendar day (UTC midnight of it) moved `days` days. */
const dayAt = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const dayMonth = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;

/**
 * "2 Kasım 2026", "27 Ekim – 2 Kasım 2026", "1–30 Kasım 2026": today, this week (Mon–Sun), this month, as the server
 * counts them: in Türkiye, whatever the phone's own time zone.
 */
export function periodLabel(period: 'daily' | 'weekly' | 'monthly', now: Date | number = new Date()): string {
  const c = trCalendar(now);
  if (period === 'daily') return `${c.d} ${MONTHS[c.m]} ${c.y}`;
  if (period === 'monthly') return `1–${dayAt(c.y, c.m + 1, 0).getUTCDate()} ${MONTHS[c.m]} ${c.y}`;
  const start = dayAt(c.y, c.m, c.d - c.weekday);
  const end = dayAt(c.y, c.m, c.d - c.weekday + 6);
  if (start.getUTCFullYear() !== end.getUTCFullYear()) return `${dayMonth(start)} ${start.getUTCFullYear()} – ${dayMonth(end)} ${end.getUTCFullYear()}`;
  if (start.getUTCMonth() !== end.getUTCMonth()) return `${dayMonth(start)} – ${dayMonth(end)} ${end.getUTCFullYear()}`;
  return `${start.getUTCDate()}–${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
}

const SHORT_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const two = (n: number) => String(n).padStart(2, '0');
/** "24 Kas 2026": a moment's date in Türkiye (a date the server set at Monday 00:00 Türkiye stays Monday abroad). */
export const trDate = (at: Date | number) => {
  const c = trCalendar(at);
  return `${c.d} ${SHORT_MONTHS[c.m]} ${c.y}`;
};
/** "24 Kas 13:05": a moment's date and time in Türkiye. */
export const trDateTime = (at: Date | number) => {
  const c = trCalendar(at);
  return `${c.d} ${SHORT_MONTHS[c.m]} ${two(c.h)}:${two(c.min)}`;
};

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
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${y !== now.getFullYear() ? ` ${y}` : ''} ${time}`;
}

/** Last vowel of a word decides suffix vowels (major vowel harmony): a ı o u are back, e i ö ü front. */
const isBack = (word: string) => {
  const w = word.toLocaleLowerCase('tr-TR');
  for (let i = w.length - 1; i >= 0; i--) {
    if ('aıou'.includes(w[i])) return true;
    if ('eiöü'.includes(w[i])) return false;
  }
  return false;
};

/** "İstanbul’da", "İzmir’de", "Antep’te": place name with the locative suffix. */
export function locative(place: string): string {
  const p = place.trim();
  const d = 'çfhkpsşt'.includes(p.toLocaleLowerCase('tr-TR').slice(-1)) ? 't' : 'd';
  return `${p}’${d}${isBack(p) ? 'a' : 'e'}`;
}

/** "İstanbul’dasınız", "İzmir’desiniz": you (plural) are in that place. */
export const youAreIn = (place: string) => `${locative(place)}${isBack(place) ? 'sınız' : 'siniz'}`;
