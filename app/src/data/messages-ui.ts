// Mock data for the messages tab (Mesajlar / Arkadaşlarım / Aramalar).

/** Intimacy ("yakınlık") points per user, used by the "Yakınlık" filter. */
export const INTIMACY: Record<string, number> = {
  u1: 1280,
  u2: 340,
  u3: 95,
  u4: 60,
  u5: 760,
  u6: 25,
  u7: 410,
  u8: 18,
  u9: 520,
  u10: 40,
  u11: 980,
  u12: 12,
};

export const intimacyOf = (userId: string) => INTIMACY[userId] ?? 0;

export const formatIntimacy = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')}B` : String(n));

/** Last-message times are "HH:MM" for today, otherwise "Dün", "Pzt" etc. */
export const isTodayTime = (time: string) => /^\d{1,2}:\d{2}$/.test(time);

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
