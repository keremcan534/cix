// Oda katkı sıralaması (components/room/contrib-board): Cömertlik is who sent the most gift coins in this room, Yankı
// who received the most, this hour, today or this week on Turkey's clock; 1 coin = 1 point. A server room's lists
// come from the server (GET /api/rooms/contrib, lib/live/room-contrib); a demo room's from sample people plus the
// gifts sent while the room is open. Pure, so it is unit tested.

export type ContribSide = 'sent' | 'received';
export type ContribPeriod = 'hour' | 'day' | 'week';
export type ContribRow = { uid: string; score: number; rank: number };
/** My own place: rank null while I'm not on the list. */
export type MyPlace = { rank: number | null; score: number };

/** Rows shown under the podium go down to this place. */
export const CONTRIB_TOP = 50;
export const CONTRIB_SIDES: readonly { key: ContribSide; label: string }[] = [
  { key: 'sent', label: 'Cömertlik' },
  { key: 'received', label: 'Yankı' },
];
export const CONTRIB_PERIODS: readonly { key: ContribPeriod; label: string }[] = [
  { key: 'hour', label: 'Saatlik' },
  { key: 'day', label: 'Günlük' },
  { key: 'week', label: 'Haftalık' },
];

/** The line under the tabs: how a point is earned. */
export const pointsRule = (side: ContribSide) => (side === 'sent' ? 'Bu odada gönderilen hediyelerde 1 jeton = 1 puan' : 'Bu odada alınan hediyelerde 1 jeton = 1 puan');
/** When the list starts again. */
export const resetNote = (period: ContribPeriod) =>
  `${period === 'hour' ? 'Her saat başı' : period === 'day' ? 'Her gün 00:00’da' : 'Her pazartesi 00:00’da'} yenilenir · Türkiye saati`;
/** An empty list. */
export function emptyNote(side: ContribSide, period: ContribPeriod) {
  const when = period === 'hour' ? 'Bu saat' : period === 'day' ? 'Bugün' : 'Bu hafta';
  return side === 'sent' ? `${when} henüz hediye gönderilmedi` : `${when} henüz hediye alan yok`;
}
/** "12.450", "1,25 Mn": room amounts stay whole up to a million. */
export const contribAmount = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: n >= 10_000_000 ? 1 : 2 })} Mn` : Math.round(n).toLocaleString('tr-TR');

/** Highest first; a tie keeps the order people came in (whoever got there first). Nobody with 0 points is listed. */
export function rankScores(scores: Iterable<readonly [string, number]>): ContribRow[] {
  return [...scores]
    .map(([uid, score], i) => ({ uid, score, i }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x, i) => ({ uid: x.uid, score: x.score, rank: i + 1 }));
}
/** My place in a whole ranking (not only the rows shown). */
export function placeOf(rows: readonly ContribRow[], uid = 'me'): MyPlace {
  const row = rows.find((r) => r.uid === uid);
  return row ? { rank: row.rank, score: row.score } : { rank: null, score: 0 };
}
/** Coins per person in a gift log, by sender (Cömertlik) or recipient (Yankı), in the order they first appear. */
export function totalsBy(log: readonly { from: string; to: string; coins: number }[], side: ContribSide): Map<string, number> {
  const out = new Map<string, number>();
  for (const g of log) {
    const who = side === 'sent' ? g.from : g.to;
    out.set(who, (out.get(who) ?? 0) + g.coins);
  }
  return out;
}

/** 0 ≤ x < 1 from a text, the same every time (FNV-1a, then mixed so close texts land far apart). */
function unit(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}
const tens = (n: number) => Math.max(10, Math.round(n / 10) * 10);

/**
 * A demo room's list: some sample people already gave (or got) gifts in it, the same ones every time for that room,
 * fewer this hour than today and today than this week, and nobody's week below their day. `session` is what was
 * sent or received while the room was open (it happened now, so it counts in every period).
 */
export function demoBoard({ roomId, side, period, people, session }: { roomId: string; side: ContribSide; period: ContribPeriod; people: readonly string[]; session: ReadonlyMap<string, number> | Readonly<Record<string, number>> }): ContribRow[] {
  const sample = new Map<string, number>();
  for (const uid of people) {
    if (uid === 'me') continue;
    const k = `${roomId}:${side}:${uid}`;
    const r = unit(k);
    const hour = r < 0.35 ? tens(20 + unit(`${k}:h`) * 1_800) : 0;
    const day = r < 0.7 ? hour + tens(50 + unit(`${k}:d`) * 14_000) : 0;
    const week = day + tens(200 + unit(`${k}:w`) * 90_000);
    const v = period === 'hour' ? hour : period === 'day' ? day : week;
    if (v > 0) sample.set(uid, v);
  }
  const now = session instanceof Map ? session : new Map(Object.entries(session));
  for (const [uid, coins] of now) sample.set(uid, (sample.get(uid) ?? 0) + coins);
  return rankScores(sample);
}
