// "Senden bahsedildi" in the room chat (components/room/chat-feed; Güncelleme 7, madde 2): someone wrote my name
// (@bahset) and the chat moved on, the room was minimised or a sheet was over it, so the line went by unseen. A chip
// over the chat says so; a tap scrolls to the line and lights it up for a moment. Mentions stay unseen until their line
// has been on screen while the chat could be read, until it was jumped to, or until it left the feed (lib/chat-feed
// keeps the newest lines only). Pure, so the unit tests run it under Node.

/** An unseen mention: its chat line's id, and who wrote it (local id). */
export type MentionMark = { id: string; from: string };

/** At most this many are remembered: the oldest go first. */
export const MAX_MENTIONS = 5;
/** How long the line jumped to stays lit (ms). */
export const FLASH_MS = 1_800;

/** A new mention (the same line twice is kept once), oldest first. */
export const addMention = (list: readonly MentionMark[], m: MentionMark): MentionMark[] => [...list.filter((x) => x.id !== m.id), m].slice(-MAX_MENTIONS);

/** Without the ones whose lines were seen (on screen, or jumped to). Returns `list` itself when none was. */
export function seenMentions(list: MentionMark[], seen: Iterable<string>): MentionMark[] {
  const ids = new Set(seen);
  return list.some((m) => ids.has(m.id)) ? list.filter((m) => !ids.has(m.id)) : list;
}

/** Only the ones whose lines are still in the feed (`feed`: its line ids). */
export const mentionsIn = (list: readonly MentionMark[], feed: ReadonlySet<string>) => list.filter((m) => feed.has(m.id));

/**
 * The chip, when it shows: an unseen mention whose line isn't on screen now (`onScreen`: the line ids the chat shows).
 * `to`: the line a tap goes to, the oldest first; `count`: how many are unseen. null: no chip.
 */
export function mentionChip(list: readonly MentionMark[], onScreen: ReadonlySet<string>): { to: string; count: number } | null {
  if (!list.length || list.some((m) => onScreen.has(m.id))) return null;
  return { to: list[0].id, count: list.length };
}

/** "Senden bahsedildi", "Senden 3 kez bahsedildi". */
export const chipLabel = (count: number) => (count > 1 ? `Senden ${count} kez bahsedildi` : 'Senden bahsedildi');
