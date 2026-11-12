// Etkinlik Merkezi: the pure rules (no database, no core.mjs), so the server, its tests and the app's tests read the
// same: the themes and the room level each needs, what an event's row means on a screen, the time windows of the
// list's filters, the checks on an application's time, length and size, when each reminder is due, and the report's
// periods. The routes are in events.mjs.

/**
 * The themes an event can wear in its room (the app draws them: lib/events THEME_LOOK). A theme opens at a room
 * level; 'sade' is the room's own look. Names are SimilarClub's own.
 */
export const THEMES = [
  { id: 'sade', name: 'Sade', minLevel: 1 },
  { id: 'ilk-selam', name: 'İlk Selam', minLevel: 1 },
  { id: 'pasta', name: 'Pasta ve Mum', minLevel: 1 },
  { id: 'sahne', name: 'Sahne Işığı', minLevel: 2 },
  { id: 'yildiz', name: 'Yıldız Gecesi', minLevel: 2 },
  { id: 'kupa', name: 'Kupa Gecesi', minLevel: 3 },
  { id: 'iki-kalp', name: 'İki Kalp', minLevel: 3 },
  { id: 'ocak', name: 'Ocak Başı', minLevel: 4 },
  { id: 'altin-gala', name: 'Altın Gala', minLevel: 5 },
];
export const themeOf = (id) => THEMES.find((t) => t.id === id) ?? null;

/** What a row is now, for every screen: draft, review, rejected, cancelled, upcoming, live, ended. */
export function stateOf(e) {
  if (e.status !== 'approved') return e.status;
  if (e.ended_at) return 'ended';
  if (e.started_at) return 'live';
  return 'upcoming';
}
export const STATE_LABEL = {
  draft: 'Taslak',
  review: 'İncelemede',
  rejected: 'Reddedildi',
  cancelled: 'İptal Edildi',
  upcoming: 'Başlamadı',
  live: 'Devam Ediyor',
  ended: 'Tamamlandı',
};
export const END_LABEL = {
  owner: 'Düzenleyen bitirdi',
  time: 'Süresi doldu',
  room_closed: 'Oda kapandı',
  not_started: 'Zamanında başlatılmadı',
  admin: 'Yönetim sonlandırdı',
};

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;
/** How long before its time the organiser may start an event. */
export const EARLY_START_MINUTES = 10;
/** The shortest event, and how far ahead one may be planned. */
export const MIN_MINUTES = 15;
export const MAX_DAYS_AHEAD = 30;
/** Events of one room waiting for review or still to come, at most. */
export const MAX_OPEN_PER_ROOM = 10;
/** Ended events stay in the list's Tamamlandı this long. */
export const ENDED_LISTED_DAYS = 30;

/** A time-zone offset (minutes east of UTC, e.g. 180 for Türkiye) from a query value; Türkiye's when unreadable. */
export function offsetOf(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= -720 && n <= 840 ? n : 180;
}
/** The start (ms) of the local day `now` falls in, for offset `off`, plus `days` days. */
export const dayStart = (now, off, days = 0) => Math.floor((now + off * MINUTE) / DAY) * DAY - off * MINUTE + days * DAY;

/**
 * The time filter as a window [from, to) on the start (ms), and whether running events count whatever their start.
 * 'now': only running ones. A date is 'YYYY-MM-DD' in the person's own day. null: no time filter (or an unknown one).
 */
export function windowOf(when, now, off) {
  if (when === 'now') return { from: null, to: null, running: true, onlyRunning: true };
  if (when === 'today') return { from: dayStart(now, off), to: dayStart(now, off, 1), running: true };
  if (when === 'tomorrow') return { from: dayStart(now, off, 1), to: dayStart(now, off, 2), running: false };
  if (when === 'week') return { from: dayStart(now, off), to: dayStart(now, off, 7), running: true };
  const m = typeof when === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(when) : null;
  if (m) {
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (Number.isFinite(t) && new Date(t).getUTCDate() === Number(m[3])) {
      const from = t - off * MINUTE;
      return { from, to: from + DAY, running: false };
    }
  }
  return null;
}

/**
 * The checks on an application's time and size against the live rules `r` ({ minLead, maxMinutes, maxCapacity }):
 * a Turkish reason, or null when it is fine. `startsAt` ms, `minutes` whole, `capacity` null or whole.
 */
export function planError({ startsAt, minutes, capacity }, now, r) {
  if (!Number.isFinite(startsAt)) return 'Başlangıç zamanı gerekli';
  if (startsAt < now + r.minLead * MINUTE) return r.minLead ? `Etkinlik en erken ${r.minLead} dakika sonrası için planlanabilir` : 'Başlangıç zamanı geçmiş olamaz';
  if (startsAt > now + MAX_DAYS_AHEAD * DAY) return `Etkinlik en fazla ${MAX_DAYS_AHEAD} gün sonrası için planlanabilir`;
  if (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > r.maxMinutes) return `Süre ${MIN_MINUTES} ile ${r.maxMinutes} dakika arasında olmalı`;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 2 || capacity > r.maxCapacity)) return `Kapasite 2 ile ${r.maxCapacity.toLocaleString('tr-TR')} kişi arasında olmalı`;
  return null;
}

/** Whether the organiser may start an approved event at `now` (from EARLY_START_MINUTES before to the grace after). */
export const mayStartAt = (startsAt, now, graceMinutes) => now >= startsAt - EARLY_START_MINUTES * MINUTE && now <= startsAt + graceMinutes * MINUTE;

// --- Reminders ----------------------------------------------------------------------------------------------------
/**
 * The reminders a confirmed place gets: 1 hour and 15 minutes before, and when the event starts. Canlı ayarlar ›
 * Etkinlikler turns each one off for everyone (event_reminders_off); a person turns them off for one event or for all.
 */
export const REMINDER_KINDS = ['hour', 'quarter', 'start'];
export const REMINDER_LABEL = { hour: '1 saat önce', quarter: '15 dakika önce', start: 'Başlarken' };
/** Before the start, a reminder is due from `before` minutes ahead until the next one's moment. */
const REMINDER_WINDOWS = [
  { kind: 'hour', before: 60, until: 15 },
  { kind: 'quarter', before: 15, until: 0 },
];

/**
 * The reminder due at `now` for a confirmed place, or null (all times ms; `startedAt` null while it hasn't started).
 * Before the start: the window `now` is in, if the place was taken before that window opened (someone who reserves
 * 40 minutes ahead gets only the 15-minute one). Once it runs: the start one. A start time that came without the event
 * starting waits for the real start. `on`: the kinds the platform sends. Whether it went already is the database's
 * (event_reminders_sent), so a restart or two sweeps never send one twice.
 */
export function reminderDue({ startsAt, startedAt, reservedAt }, now, on = REMINDER_KINDS) {
  if (startedAt) return on.includes('start') ? 'start' : null;
  const left = startsAt - now;
  const w = REMINDER_WINDOWS.find((x) => left <= x.before * MINUTE && left > x.until * MINUTE);
  if (!w || !on.includes(w.kind) || reservedAt > startsAt - w.before * MINUTE) return null;
  return w.kind;
}

/** A reminder's push and notice: its title and line, with the time really left (`left` ms) before the start. */
export function reminderText(kind, title, left) {
  if (kind === 'start') return { title: 'Etkinlik başladı', body: `“${title}” başladı, odasına girip katılabilirsin.` };
  const m = Math.max(1, Math.round(left / MINUTE));
  return { title: 'Etkinlik hatırlatması', body: `“${title}” ${m >= 55 ? '1 saat' : `${m} dakika`} sonra başlıyor.` };
}

// --- Reports ------------------------------------------------------------------------------------------------------
/** The report's periods (days back from now). */
export const REPORT_DAYS = [7, 30, 90];
/** a / b to three decimals, or null when there is nothing to divide by. */
export const ratio = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : null);
