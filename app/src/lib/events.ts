// Etkinlik Merkezi in the app: how each theme looks (until its art is drawn, docs/GORSEL_URETIM_LISTESI.md § 20),
// the filter choices, and the times written the way people say them. The server decides every state
// (server/api/events.mjs); the themes' names and room levels are its (server/api/event-rules.mjs THEMES, kept
// equal by tests/events.test.ts). Also the reminder sentence, the words an event is shared with, and the report's
// numbers as shown (Aşama 4). The demo (no server) shows sample events built from the demo rooms.
//
// Pure functions only (no React, no storage).
import type Ionicons from '@expo/vector-icons/Ionicons';

import type { EventItem, EventReport, EventTheme, ReminderKind } from '@/lib/api';

type Glyph = keyof typeof Ionicons.glyphMap;

/** The themes, as on the server (name, the room level that opens it). */
export const THEMES: EventTheme[] = [
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

/** A theme's look: its two colours (cover, banner, the room's tint), its sign, and the room's light effect. */
export type ThemeLook = { colors: [string, string]; icon: Glyph; fx: 'none' | 'confetti' | 'hearts' | 'notes' | 'stars'; blurb: string };
export const THEME_LOOK: Record<string, ThemeLook> = {
  sade: { colors: ['#5B6CFF', '#8E5BFF'], icon: 'sparkles', fx: 'none', blurb: 'Odanın kendi görünümü, etkinlik başlığıyla.' },
  'ilk-selam': { colors: ['#0EA5A4', '#3B82F6'], icon: 'hand-left', fx: 'none', blurb: 'Tanışma geceleri için ferah, sakin bir görünüm.' },
  pasta: { colors: ['#EC4899', '#F59E0B'], icon: 'gift', fx: 'confetti', blurb: 'Doğum günü ve kutlamalar: renkli konfeti.' },
  sahne: { colors: ['#7C3AED', '#DB2777'], icon: 'musical-notes', fx: 'notes', blurb: 'Müzik geceleri: sahne ışığı ve notalar.' },
  yildiz: { colors: ['#1E3A8A', '#9333EA'], icon: 'star', fx: 'stars', blurb: 'Eğlence geceleri: yıldızlı bir gökyüzü.' },
  kupa: { colors: ['#B45309', '#F59E0B'], icon: 'trophy', fx: 'none', blurb: 'Yarışmalar: kupa ve sıralama havası.' },
  'iki-kalp': { colors: ['#E11D48', '#F472B6'], icon: 'heart', fx: 'hearts', blurb: 'Çiftler etkinlikleri: süzülen kalpler.' },
  ocak: { colors: ['#C2410C', '#EAB308'], icon: 'flame', fx: 'none', blurb: 'Aile buluşmaları: sıcak, ocak başı renkleri.' },
  'altin-gala': { colors: ['#92400E', '#FBBF24'], icon: 'diamond', fx: 'stars', blurb: 'Özel geceler: altın ışıltı.' },
};
export const lookOf = (theme: string): ThemeLook => THEME_LOOK[theme] ?? THEME_LOOK.sade;

// --- Filters ---------------------------------------------------------------------------------------------------
export const STATUS_OPTIONS: [string, string][] = [
  ['all', 'Tümü'],
  ['upcoming', 'Başlamadı'],
  ['live', 'Devam Ediyor'],
  ['ended', 'Tamamlandı'],
];
export const WHEN_OPTIONS: [string, string][] = [
  ['', 'Her zaman'],
  ['now', 'Şu An'],
  ['today', 'Bugün'],
  ['tomorrow', 'Yarın'],
  ['week', 'Bu Hafta'],
];
export const SORT_OPTIONS: [string, string][] = [
  ['soon', 'Yakında Başlayacaklar'],
  ['popular', 'En Çok Katılımcı Alanlar'],
  ['new', 'Yeni Eklenenler'],
];
export const DURATIONS = [30, 60, 90, 120, 180, 240];

// --- Times -----------------------------------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
export const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** "Bugün 21:30", "Yarın 20:00", "Cuma 21:00" within the week, else "14 Kasım 21:00", in the phone's own time. */
export function whenText(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const today = new Date(now);
  const tomorrow = new Date(now + 86_400_000);
  const yesterday = new Date(now - 86_400_000);
  if (dayKey(d) === dayKey(today)) return `Bugün ${clock(d)}`;
  if (dayKey(d) === dayKey(tomorrow)) return `Yarın ${clock(d)}`;
  if (dayKey(d) === dayKey(yesterday)) return `Dün ${clock(d)}`;
  const ahead = d.getTime() - now;
  if (ahead > 0 && ahead < 6 * 86_400_000) return `${DAYS[d.getDay()]} ${clock(d)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${clock(d)}`;
}
/** A day's name for the form's day chips: Bugün, Yarın, Cuma 14. */
export function dayLabel(d: Date, now = Date.now()): string {
  if (dayKey(d) === dayKey(new Date(now))) return 'Bugün';
  if (dayKey(d) === dayKey(new Date(now + 86_400_000))) return 'Yarın';
  return `${DAYS[d.getDay()].slice(0, 3)} ${d.getDate()}`;
}
/** "45 dk", "2 sa", "1 sa 30 dk". */
export function spanText(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} sa ${m % 60} dk` : `${h} sa`;
}
/** The running clock of a live event: 00:23:10. */
export function elapsedText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}
/** What an event card says about its time now. */
export function timeLine(e: Pick<EventItem, 'state' | 'startsAt' | 'endsAt' | 'startedAt' | 'endedAt'>, now = Date.now()): string {
  if (e.state === 'live' && e.startedAt) return `Devam ediyor · ${spanText(now - new Date(e.startedAt).getTime())}`;
  if (e.state === 'ended' && e.endedAt) return `Bitti · ${whenText(e.endedAt, now)}`;
  const start = new Date(e.startsAt).getTime();
  if (e.state === 'upcoming' && start > now && start - now < 3 * 3_600_000) return `${spanText(start - now)} sonra başlıyor`;
  return whenText(e.startsAt, now);
}
/** The places line: "12 / 50 yer", "12 kişi yer ayırttı", "Kontenjan doldu". */
export function placesText(e: Pick<EventItem, 'reserved' | 'capacity' | 'reservation' | 'state' | 'came'>): string {
  if (e.state === 'live' || e.state === 'ended') return `${e.came.toLocaleString('tr-TR')} katılımcı`;
  if (!e.reservation) return 'Yer ayırtmadan katılım';
  if (e.capacity && e.reserved >= e.capacity) return 'Kontenjan doldu';
  return e.capacity ? `${e.reserved} / ${e.capacity} yer` : `${e.reserved} kişi yer ayırttı`;
}

// --- Reminders, sharing, reports (Aşama 4) ----------------------------------------------------------------------
/** The reminders, as the server names them (server/api/event-rules.mjs REMINDER_KINDS / REMINDER_LABEL). */
export const REMINDER_KINDS: ReminderKind[] = ['hour', 'quarter', 'start'];
export const REMINDER_LABEL: Record<ReminderKind, string> = { hour: '1 saat önce', quarter: '15 dakika önce', start: 'Başlarken' };
/** The report's periods, in days (server/api/event-rules.mjs REPORT_DAYS). */
export const REPORT_DAYS = [7, 30, 90];

/** When the reminders come, in one sentence ("1 saat ve 15 dakika önce, bir de başlarken"), or null for none. */
export function reminderLine(kinds: readonly ReminderKind[]): string | null {
  const before = (['hour', 'quarter'] as const).filter((k) => kinds.includes(k)).map((k) => (k === 'hour' ? '1 saat' : '15 dakika'));
  const start = kinds.includes('start');
  if (!before.length) return start ? 'Etkinlik başlarken bildirim gelir.' : null;
  return `Başlamadan ${before.join(' ve ')} önce${start ? ', bir de başlarken' : ''} bildirim gelir.`;
}

/** The app path that opens an event (the scheme link and the web link are lib/links'); the app reads it on Odalar. */
export const eventPath = (id: number) => `?etkinlik=${id}`;
/** The share sheet's line: what, when and where. */
export const eventShareText = (e: Pick<EventItem, 'title' | 'startsAt' | 'room'>, now = Date.now()) => `Similar Club’da “${e.title}” etkinliği: ${whenText(e.startsAt, now)}, “${e.room.title}” odasında. Sen de gel!`;
/**
 * The message sent to a friend: no link (links don't pass the contact filter in messages). Newer apps draw the event's
 * card under it; older ones show these words, and the title finds it in Etkinlik Alanı.
 */
export const eventMessageText = (e: Pick<EventItem, 'title' | 'startsAt' | 'room'>, now = Date.now()) => `📅 Seni “${e.title}” etkinliğine bekliyorum! ${whenText(e.startsAt, now)}, “${e.room.title}” odasında.`;

/** A rate (0–1) as "%67", or "—" when there is none. */
export const rateText = (r: number | null) => (r === null ? '—' : `%${Math.round(r * 100)}`);
/** The report's headline numbers, in the order they are shown. */
export function reportTiles(r: EventReport): [string, string][] {
  const n = (x: number) => x.toLocaleString('tr-TR');
  return [
    ['Etkinlik', n(r.events)],
    ['Onaylanan', n(r.approved)],
    ['Reddedilen', n(r.rejected)],
    ['İptal edilen', n(r.cancelled)],
    ['Yer ayırtma', n(r.reservations)],
    ['Katılımcı', n(r.participants)],
    ['Katılım oranı', rateText(r.attendanceRate)],
    ['Ortalama katılım', r.avgParticipants === null ? '—' : r.avgParticipants.toLocaleString('tr-TR')],
  ];
}
/** How events of the period ended, the non-zero ones, in a fixed order. */
export const END_TEXT: Record<keyof EventReport['ends'], string> = {
  owner: 'Düzenleyen bitirdi',
  time: 'Süresi doldu',
  room_closed: 'Oda kapandı',
  not_started: 'Zamanında başlatılmadı',
  admin: 'Yönetim sonlandırdı',
};
export const endRows = (r: EventReport): [string, number][] => (Object.keys(END_TEXT) as (keyof EventReport['ends'])[]).filter((k) => r.ends[k] > 0).map((k) => [END_TEXT[k], r.ends[k]]);
/** One start or end record: "Başladı", "Bitti · Süresi doldu", "Başlatılmadı". */
export function recordText(x: EventReport['records'][number]): string {
  if (x.action === 'start') return 'Başladı';
  if (x.action === 'not_started') return 'Başlatılmadı';
  const why = x.reason && x.reason in END_TEXT ? END_TEXT[x.reason as keyof EventReport['ends']] : null;
  return why ? `Bitti · ${why}` : 'Bitti';
}

/** The first start the form offers: the next quarter hour past the earliest allowed time. */
export function firstStart(minLeadMinutes: number, now = Date.now()): Date {
  const q = 15 * 60_000;
  return new Date(Math.ceil((now + minLeadMinutes * 60_000 + 60_000) / q) * q);
}

// --- Demo ---------------------------------------------------------------------------------------------------
/** Sample events for the demo (no server), from demo rooms; times relative to `now`. */
export function demoEvents(rooms: { id: string; title: string; hostId: string; cover: string }[], hosts: (id: string) => { name: string; avatar?: string }, now = Date.now()): EventItem[] {
  const at = (m: number) => new Date(Math.round((now + m * 60_000) / 300_000) * 300_000).toISOString();
  const rows: [string, string, string, string, number, number | null, EventItem['state'], number, number][] = [
    // title, category, theme, description, start in minutes, capacity, state, reserved, came
    ['Akustik Gece', 'muzik', 'sahne', 'Gitar, şarkı ve sohbet. Mikrofona çıkmak isteyen sıraya girsin.', -25, 80, 'live', 46, 61],
    ['Doğum Günü Sürprizi', 'ozel-gun', 'pasta', 'Ece’nin doğum gününü birlikte kutluyoruz. Pasta bizden, dilekler sizden.', 95, 50, 'upcoming', 21, 0],
    ['İlk Selam Gecesi', 'tanisma', 'ilk-selam', 'Yeni gelenlerle tanışma turu: herkes kendini bir cümleyle anlatıyor.', 24 * 60 + 60, null, 'upcoming', 9, 0],
    ['Bilgi Kupası', 'yarisma', 'kupa', 'Beş tur soru, en hızlı cevaplayan kupayı alır.', 2 * 24 * 60, 40, 'upcoming', 40, 0],
    ['Ocak Başı Sohbet', 'aile', 'ocak', 'Ailemizin haftalık buluşması.', -26 * 60, null, 'ended', 18, 27],
  ];
  const cats: Record<string, [string, Glyph]> = { muzik: ['Müzik', 'musical-notes'], 'ozel-gun': ['Özel Günler', 'gift'], tanisma: ['Tanışma', 'hand-left'], yarisma: ['Yarışma', 'trophy'], aile: ['Aile Etkinlikleri', 'people'] };
  return rows.map(([title, cat, theme, description, start, capacity, state, reserved, came], i) => {
    const room = rooms[i % Math.max(1, rooms.length)];
    const host = hosts(room?.hostId ?? '');
    return {
      id: 9000 + i,
      title,
      description,
      category: { id: cat, name: cats[cat][0], icon: cats[cat][1] },
      theme,
      coverUrl: null,
      room: { id: room?.id ?? 'r1', title: room?.title ?? 'Oda', closed: false },
      host: { id: room?.hostId ?? 'u1', name: host.name, avatarUrl: host.avatar ?? null },
      startsAt: at(start),
      endsAt: at(start + 90),
      startedAt: state === 'live' || state === 'ended' ? at(start) : null,
      endedAt: state === 'ended' ? at(start + 90) : null,
      endReason: state === 'ended' ? 'owner' : null,
      state,
      stateLabel: state === 'live' ? 'Devam Ediyor' : state === 'ended' ? 'Tamamlandı' : 'Başlamadı',
      capacity,
      reservation: true,
      visibility: 'public',
      reserved,
      came,
      mine: null,
    };
  });
}
