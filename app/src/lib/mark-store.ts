// Profil izleri on this phone (lib/profile-marks has the rules): whose photo carries a mark now, kept by person (their
// server id in live mode, the sample id in the demo; components/profile-mark markKeyOf). No lib/live here: lib/live/looks
// feeds it. Fed by every place that hears of one: a look (lib/live/looks, a
// room's people and their 'look' packets), a profile read (lib/live/profile), a room's gift packet (lib/live/room-bus:
// the leave or clean of a Kaka or a Su someone just sent) and, in the demo, the gift the demo room sends. The newest word
// wins. Screens draw a mark with components/profile-mark (useMarkOf), the room says the line with onMarkNews.
import { useSyncExternalStore } from 'react';

import { activeMark, marksAfter, type MarkNews, type ProfileMark } from '@/lib/profile-marks';

/** A landing or a wash older than this has happened already: the mark just shows (or doesn't). */
export const FRESH_MS = 3_000;
/** What just happened to a photo, for the screens to play: a mark landing ('land') or washed off ('wash'). */
export type Fresh = { type: 'land' | 'wash'; at: number; mark: ProfileMark };
type Entry = { marks: ProfileMark[]; at: number; showing: ProfileMark | null; fresh: Fresh | null; timers: ReturnType<typeof setTimeout>[] };
const store = new Map<string, Entry>();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version += 1;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const later = (fn: () => void, ms: number) => {
  const t = setTimeout(fn, Math.min(Math.max(0, ms), 2 ** 31 - 1));
  (t as { unref?: () => void }).unref?.();
  return t;
};

/**
 * Keeps `key`'s entry: works out the mark showing now and wakes up when it runs out (a mark nobody cleaned goes by
 * itself) or when `fresh` is over, so the screens read it all without a clock of their own.
 */
function keep(key: string, marks: ProfileMark[], at: number, fresh: Fresh | null) {
  store.get(key)?.timers.forEach(clearTimeout);
  const now = Date.now();
  const showing = activeMark(marks, now);
  const entry: Entry = { marks, at, showing, fresh: fresh && now - fresh.at < FRESH_MS ? fresh : null, timers: [] };
  const again = () => store.get(key) === entry && (keep(key, entry.marks, entry.at, entry.fresh), emit());
  if (showing) entry.timers.push(later(again, showing.until - now + 50));
  if (entry.fresh) entry.timers.push(later(again, entry.fresh.at + FRESH_MS - now + 10));
  store.set(key, entry);
}

/** What a read said of `key`'s marks (`at`: when the read started, so an older answer never wins over news). */
export function putMarks(key: string | null, marks: ProfileMark[], at = Date.now()) {
  if (!key) return;
  const had = store.get(key);
  if (had && had.at > at) return;
  const same = had && had.marks.length === marks.length && had.marks.every((m, i) => m.kind === marks[i].kind && m.until === marks[i].until && m.gift === marks[i].gift);
  if (same) return;
  keep(key, marks, at, had?.fresh ?? null);
  emit();
}

/**
 * A gift's news for `key` (a room packet, my own send, the demo): a leave puts the mark on at once (it lands), a clean
 * takes it off with the water's splash. Each kind keeps one mark.
 */
export function applyMarkNews(key: string | null, news: MarkNews, at = Date.now()) {
  if (!key) return;
  const had = store.get(key);
  const before = had?.marks ?? [];
  const marks = marksAfter(before, news);
  const gone = news.role === 'clean' ? before.find((m) => m.kind === news.kind && m.until > at) : undefined;
  const landed = news.role === 'leave' ? marks.find((m) => m.kind === news.kind) : undefined;
  keep(key, marks, at, landed ? { type: 'land', at, mark: landed } : gone ? { type: 'wash', at, mark: gone } : (had?.fresh ?? null));
  emit();
}

/** `key`'s marks as known here ([] when nothing is). */
export const marksOf = (key: string | null) => (key ? (store.get(key)?.marks ?? []) : []);

/** The mark on this person's photo now, and what just happened to it (to play: a mark landing, the water's splash). */
export type MarkView = { mark: ProfileMark | null; fresh: Fresh | null };
const NONE: MarkView = { mark: null, fresh: null };

/**
 * The mark on the photo of the person kept as `key` (lib/live/marks-live markKeyOf: their server id in live mode, the
 * sample id in the demo), redrawn when it changes, lands, is washed off or runs out. Null: nothing.
 */
export function useMarkOf(key: string | null | undefined): MarkView {
  useSyncExternalStore(subscribe, () => version, () => version);
  const e = key ? store.get(key) : undefined;
  return e ? { mark: e.showing, fresh: e.fresh } : NONE;
}

// --- The room's lines -------------------------------------------------------------------------------------------
/** A gift's news as the room hears it: who sent it to whom (server ids, or the demo's ids) and the gift's event. */
export type MarkEvent = { room: string; eventId: number; from: string; to: string; news: MarkNews };
const newsListeners = new Set<(e: MarkEvent) => void>();
const seen: number[] = [];
/** Every gift packet with a mark that reaches this phone (my own sends too): the store takes it, then the room. */
export function reportMarkEvent(e: MarkEvent) {
  if (seen.includes(e.eventId)) return;
  seen.push(e.eventId);
  if (seen.length > 200) seen.shift();
  applyMarkNews(e.to, e.news);
  newsListeners.forEach((l) => l(e));
}
/** Hears each gift's mark news (the room's chat line); returns the unsubscribe. */
export function onMarkNews(fn: (e: MarkEvent) => void) {
  newsListeners.add(fn);
  return () => void newsListeners.delete(fn);
}
