// Mock data for the messages tab (Mesajlar / Arkadaşlarım / Aramalar).

/**
 * Heart points with each sample person (gifts and paid messages and minutes both ways, as on the server): the
 * demo's "Yakınlık" order and its heart level (lib/heart-tiers), so every look of the heart can be seen.
 */
export const INTIMACY: Record<string, number> = {
  u1: 2_150_000,
  u2: 21_000,
  u3: 7_400,
  u4: 2_600,
  u5: 300_000,
  u6: 420,
  u7: 52_000,
  u8: 120,
  u9: 120_000,
  u10: 900,
  u11: 1_100_000,
  u12: 0,
};

export const intimacyOf = (userId: string) => INTIMACY[userId] ?? 0;

/** One decimal, none when it is ",0": "1,3", "21". */
const oneDecimal = (x: number) => x.toFixed(x >= 100 ? 0 : 1).replace(/\.0$/, '').replace('.', ',');
/** "940", "1,3B", "21B", "300B", "2,2Mn". */
export const formatIntimacy = (n: number) => (n >= 999_500 ? `${oneDecimal(n / 1_000_000)}Mn` : n >= 1000 ? `${oneDecimal(n / 1000)}B` : String(n));

type Stamp = { time: string; at?: string };
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const dayOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const readAt = (m: Stamp) => {
  if (!m.at) return null;
  const d = new Date(m.at);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * A message's time as shown: "HH:MM" today, "Dün" yesterday, otherwise the day ("3 Kas", with the year when it
 * isn't this year). Messages with a stored moment (`at`, every live message) are formatted from it; the demo's
 * written labels ("21:02", "Pzt") are shown as they are.
 */
export function messageTime(m: Stamp, now = new Date()) {
  const d = readAt(m);
  if (!d) return m.time;
  if (dayOf(d) === dayOf(now)) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayOf(d) === dayOf(yesterday)) return 'Dün';
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? day : `${day} ${d.getFullYear()}`;
}

/** The "Bugün" filter: sent today by its stored moment; a demo label counts when it is a bare "HH:MM". */
export function isTodayTime(m: Stamp, now = new Date()) {
  const d = readAt(m);
  return d ? dayOf(d) === dayOf(now) : /^\d{1,2}:\d{2}$/.test(m.time);
}

export type CallKind = 'voice' | 'video';
export type CallDirection = 'in' | 'out' | 'missed';
export type CallLog = {
  id: string;
  userId: string;
  kind: CallKind;
  direction: CallDirection;
  /** seconds; 0 for missed calls */
  duration: number;
  time: string;
};

export const CALL_HISTORY: CallLog[] = [
  {
    id: 'cl1',
    userId: 'u1',
    kind: 'video',
    direction: 'out',
    duration: 754,
    time: '21:14',
  },
  {
    id: 'cl2',
    userId: 'u7',
    kind: 'voice',
    direction: 'missed',
    duration: 0,
    time: '19:52',
  },
  {
    id: 'cl3',
    userId: 'u11',
    kind: 'video',
    direction: 'in',
    duration: 312,
    time: '17:03',
  },
  {
    id: 'cl4',
    userId: 'u2',
    kind: 'voice',
    direction: 'out',
    duration: 95,
    time: 'Dün',
  },
  {
    id: 'cl5',
    userId: 'u5',
    kind: 'video',
    direction: 'missed',
    duration: 0,
    time: 'Dün',
  },
  {
    id: 'cl6',
    userId: 'u9',
    kind: 'voice',
    direction: 'in',
    duration: 1820,
    time: 'Pzt',
  },
  {
    id: 'cl7',
    userId: 'u4',
    kind: 'voice',
    direction: 'out',
    duration: 41,
    time: 'Paz',
  },
];

export const formatDuration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mmss = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
};

export type ProfileVisitor = {
  id: string;
  userId: string;
  count: number;
  time: string;
};

export const PROFILE_VISITORS: ProfileVisitor[] = [
  { id: 'v1', userId: 'u11', count: 4, time: '12 dk önce' },
  { id: 'v2', userId: 'u3', count: 2, time: '1 sa önce' },
  { id: 'v3', userId: 'u8', count: 1, time: '3 sa önce' },
  { id: 'v4', userId: 'u12', count: 3, time: 'Dün' },
  { id: 'v5', userId: 'u6', count: 1, time: 'Dün' },
  { id: 'v6', userId: 'u10', count: 2, time: 'Pzt' },
];
