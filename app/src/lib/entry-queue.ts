// Entry banners in a room (components/fx/entry): one plays at a time and the others wait their turn, oldest first.
// Each banner is one entrance: a person's own (their shop look) or a bonded pair's joint one (docs/BAGLAR.md).
// Pure, so the order rules are unit tested.

/** One banner: `id` names the entrance (the same one is never queued twice), `who` the people in it. */
export type EntryItem<T> = { id: string; who: readonly string[]; show: T };
/** The banner playing now and the ones waiting, in the order they play. */
export type EntryLine<T> = { now: EntryItem<T> | null; next: readonly EntryItem<T>[] };

/** At most this many wait (docs/BAGLAR.md); a longer line drops its oldest, which would be old news by its turn. */
export const ENTRY_WAITING_MAX = 3;

export const emptyEntryLine = <T>(first: EntryItem<T> | null = null): EntryLine<T> => ({ now: first, next: [] });

/**
 * `item` plays at once when nothing is playing, else it waits at the end. A person's own entrance goes ahead of a
 * joint one with them that is already waiting, so "A & B birlikte odaya girdi" follows A's and B's own banners.
 * An entrance already playing or waiting is not added again.
 */
export function pushEntry<T>(line: EntryLine<T>, item: EntryItem<T>, max = ENTRY_WAITING_MAX): EntryLine<T> {
  if (line.now?.id === item.id || line.next.some((x) => x.id === item.id)) return line;
  if (!line.now) return { now: item, next: line.next };
  const at = item.who.length === 1 ? line.next.findIndex((x) => x.who.length > 1 && x.who.includes(item.who[0])) : -1;
  const next = at < 0 ? [...line.next, item] : [...line.next.slice(0, at), item, ...line.next.slice(at)];
  return { now: line.now, next: next.slice(-max) };
}

/** The playing banner ended: the next one plays. */
export const shiftEntry = <T>(line: EntryLine<T>): EntryLine<T> => ({ now: line.next[0] ?? null, next: line.next.slice(1) });
