// Room chat feed: one event history for the room, three filters over it (Tümü / Hediyeler / Sohbet).
// Filters only choose what is shown; they never fetch, rebuild, re-run or delete anything. Events are
// added once by id (a re-delivered event is ignored) and the history keeps the newest events of each kind
// separately, so a busy chat never pushes gifts out of the Hediyeler tab.

export type FeedKind = 'chat' | 'gift' | 'system' | 'bot';
export type FeedTab = 'all' | 'gifts' | 'chat';
export type GiftEvent = { fromId: string; toIds: string[]; emoji: string; name: string; count: number; lucky?: boolean };
export type FeedMsg = {
  id: string;
  kind?: FeedKind;
  userId?: string;
  text: string;
  system?: boolean;
  bot?: boolean;
  gift?: GiftEvent;
  /** My message could not be sent (no connection); kept locally with a retry. */
  status?: 'failed';
  /** Arrival time (ms), used to keep order when buffered events are merged after a reconnect. */
  at?: number;
};

/**
 * Classification rule:
 *  - chat:   a person's own message in the room chat;
 *  - gift:   gift sends, Lucky gifts, paid effect gifts and their win/announcement lines;
 *  - bot:    the labeled room bot;
 *  - system: everything else (joins, mic changes, moderation, PK status, announcements, envelopes).
 * Tümü shows all four; Hediyeler only gifts; Sohbet only chat. Nothing unknown falls into Sohbet: a message
 * without an author is never treated as chat.
 */
export function kindOf(m: FeedMsg): FeedKind {
  if (m.kind) return m.kind;
  if (m.gift) return 'gift';
  if (m.bot) return 'bot';
  if (m.userId && !m.system) return 'chat';
  return 'system';
}
export const TAB_KINDS: Record<FeedTab, readonly FeedKind[]> = { all: ['chat', 'gift', 'system', 'bot'], gifts: ['gift'], chat: ['chat'] };
export const inTab = (m: FeedMsg, tab: FeedTab) => TAB_KINDS[tab].includes(kindOf(m));
export const filterFeed = (list: FeedMsg[], tab: FeedTab) => (tab === 'all' ? list : list.filter((m) => inTab(m, tab)));

/** Newest events kept per kind. */
export const FEED_CAPS: Record<FeedKind, number> = { chat: 300, gift: 200, system: 150, bot: 40 };

/** Adds new events once by id, keeps arrival order, trims each kind to its cap. Returns `list` itself when nothing is new. */
export function mergeFeed(list: FeedMsg[], incoming: FeedMsg[]): FeedMsg[] {
  const ids = new Set(list.map((m) => m.id));
  const fresh = incoming.filter((m) => {
    if (ids.has(m.id)) return false;
    ids.add(m.id);
    return true;
  });
  if (!fresh.length) return list;
  let all = [...list, ...fresh];
  // Events buffered while offline can be older than the newest shown one: put them back in time order (stable).
  const lastAt = list[list.length - 1]?.at ?? 0;
  if (fresh.some((m) => (m.at ?? Infinity) < lastAt)) all = all.map((m, i) => [m, i] as const).sort(([a, i], [b, j]) => (a.at ?? 0) - (b.at ?? 0) || i - j).map(([m]) => m);
  const seen: Partial<Record<FeedKind, number>> = {};
  const kept: FeedMsg[] = [];
  for (let i = all.length - 1; i >= 0; i--) {
    const k = kindOf(all[i]);
    seen[k] = (seen[k] ?? 0) + 1;
    if (seen[k]! <= FEED_CAPS[k]) kept.push(all[i]);
  }
  return kept.reverse();
}
