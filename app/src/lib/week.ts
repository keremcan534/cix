// The app's week (owners, 24 Nov 2026): Monday 00:00 to Sunday 23:59:59, Türkiye time, for sıralamalar, bonuslar and
// every weekly figure. Yayıncı Merkezi's "Bu hafta" chart reads the server's days (GET /api/wallet/week); the demo
// keeps its own tally. Pure, so the node tests load it.
import { trCalendar } from '@/lib/tr';

/** The week's days as the chart draws them: Monday first. */
export const WEEK_DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

/** This week, day by day: the diamonds earned each day (Monday first) and today's place (0 Monday … 6 Sunday). */
export type WeekDays = { days: number[]; today: number };

const whole = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);

/** The server's answer, or null when it is not one (the screen then keeps what it had). */
export function parseWeek(raw: unknown): WeekDays | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const today = whole(r.today);
  const days = Array.isArray(r.days) && r.days.length === 7 ? r.days.map(whole) : null;
  if (today === null || today > 6 || !days || days.some((d) => d === null)) return null;
  return { days: days as number[], today };
}

/**
 * The demo's tally (its last slot is today, the six before it the days before) laid on this week: days before this
 * Monday drop out, days after today are 0.
 */
export function weekFromTally(tally: number[], now: Date | number = Date.now()): WeekDays {
  const today = trCalendar(now).weekday;
  const days = [0, 0, 0, 0, 0, 0, 0];
  for (let back = 0; back <= today && back < tally.length; back++) days[today - back] = Math.max(0, Math.floor(tally[tally.length - 1 - back] ?? 0));
  return { days, today };
}
