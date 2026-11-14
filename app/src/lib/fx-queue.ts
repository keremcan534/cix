// The room's stage (components/room/live-room): the effects that take the middle of the screen (a gift's
// full-screen video, a big gift's show, the pop of the other gifts, a full-screen Hareketli) play one at a time,
// in the order they came, each to its end: a new one never cuts the one playing. What stays instant doesn't come
// here: a gift flying to the seat, its chat line, an entry banner.
//
// What keeps a busy room's backlog short:
//  - the same sender sending the same thing again while it waits merges into that cue (×N): a run of the repeat
//    wheel plays once more after the first, not once per tap;
//  - a send to several people reaches the other phones of a server room as one announcement per person
//    (server/api/gifts.mjs), a moment apart; those pieces join the cue already playing for the first of them, so
//    the send plays once ("3 kişi");
//  - at most MAX_WAITING cues and WAIT_MS of play wait; past that the lowest-value waiting cue goes (the oldest of
//    equal ones), so a pile of small gifts never holds a big one back;
//  - a small cue (a standard gift's pop) shows only if it gets the stage within SMALL_FRESH_MS; later it is old
//    news, its flight and chat line already showed it.
// Pure: the room keeps a Stage in its state and passes the time in.

export const MAX_WAITING = 6;
export const WAIT_MS = 24_000;
export const SMALL_FRESH_MS = 6_000;
/** The pieces of one multi-recipient send come about a request apart (the sender's phone sends them in turn). */
export const BURST_MS = 2_000;
/** `to` key of an effect for the whole room (a Hareketli), which has no recipients. */
export const ROOM = '*';

export type Cue<P = unknown> = {
  key: string;
  /** Who sent it (local id) and what plays (a gift or an animation id): more of both merges. */
  from: string;
  what: string;
  /** How many each recipient got (ROOM for an effect without recipients); merging adds them up. */
  to: Record<string, number>;
  /** The count this send gave each recipient: the pieces of one multi-recipient send share it. */
  each: number;
  /** One gift's (or effect's) price in coins; the cue's value is the price of everything in `to`. */
  price: number;
  /** How long it plays (ms), for the backlog bound. */
  ms: number;
  /** A standard gift's pop: shown only while fresh. */
  small?: boolean;
  /** When its latest piece came (ms). */
  last: number;
  payload: P;
};
export type Stage<P = unknown> = { now: Cue<P> | null; next: Cue<P>[] };

export const emptyStage = <P>(): Stage<P> => ({ now: null, next: [] });

/** The recipients of a cue (none for a room effect). */
export const cueTo = (c: Cue) => Object.keys(c.to).filter((k) => k !== ROOM);
/** "×N" on its banner: the most any one recipient got. */
export const cueCount = (c: Cue) => Math.max(1, ...Object.values(c.to));
export const cueValue = (c: Cue) => c.price * Object.values(c.to).reduce((n, x) => n + x, 0);

const sameLane = (a: Cue, b: Cue) => a.from === b.from && a.what === b.what;
/** `b` folded into `a`: a keeps its key (a playing cue isn't started again) and its payload. */
function merged<P>(a: Cue<P>, b: Cue<P>): Cue<P> {
  const to = { ...a.to };
  for (const [k, n] of Object.entries(b.to)) to[k] = (to[k] ?? 0) + n;
  return { ...a, to, last: Math.max(a.last, b.last) };
}

/** Drops the lowest-value waiting cues (the oldest of equal ones) while too many or too long a wait is queued. */
function bound<P>(next: Cue<P>[]): Cue<P>[] {
  let list = next;
  const waitMs = () => list.reduce((n, c) => n + c.ms, 0);
  while (list.length > MAX_WAITING || (list.length > 1 && waitMs() > WAIT_MS)) {
    let low = 0;
    for (let i = 1; i < list.length; i++) if (cueValue(list[i]) < cueValue(list[low])) low = i;
    list = list.filter((_, i) => i !== low);
  }
  return list;
}

/** The next cue takes a free stage; small ones past their moment are skipped. `held`: something else holds it. */
function start<P>(s: Stage<P>, t: number, held: boolean): Stage<P> {
  if (s.now || held || !s.next.length) return s;
  const i = s.next.findIndex((c) => !c.small || t - c.last <= SMALL_FRESH_MS);
  return i < 0 ? { now: null, next: [] } : { now: s.next[i], next: s.next.slice(i + 1) };
}

/** A new cue (its `last` is now): joins the playing one or the last waiting one when it can, else waits in line. */
export function addCue<P>(s: Stage<P>, c: Cue<P>, held = false): Stage<P> {
  const now = s.now;
  const to = cueTo(c);
  // More recipients of the send that is playing, right behind its last piece: the same send, it plays once.
  if (now && sameLane(now, c) && c.each === now.each && c.last - now.last <= BURST_MS && to.length > 0 && to.every((k) => !(k in now.to))) {
    return { ...s, now: merged(now, c) };
  }
  const tail = s.next[s.next.length - 1];
  const next = tail && sameLane(tail, c) ? [...s.next.slice(0, -1), merged(tail, c)] : [...s.next, c];
  return start({ now, next: bound(next) }, c.last, held);
}

/** The cue `key` finished playing (an older effect's late "done" changes nothing); the next one starts. */
export function endCue<P>(s: Stage<P>, key: string, t: number, held = false): Stage<P> {
  if (s.now?.key !== key) return s;
  return start({ now: null, next: s.next }, t, held);
}

/** Whatever held the stage let go of it: the next cue starts if the stage is free. */
export const resumeCue = <P>(s: Stage<P>, t: number): Stage<P> => start(s, t, false);
