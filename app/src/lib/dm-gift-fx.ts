// A gift sent from a chat (Mesajlar, the room's messages sheet, a call): the server writes its line in the chat with
// the gift (server/api/messages.mjs, `gift: { id, count }`). The sender's phone plays the gift's animation as soon as
// the server took the gift; the other phone plays it once, when the chat is open: the newest one it hasn't played on
// opening the chat, each new one while it stays open (components/chat-thread). Only the server's field counts: a
// typed "Hediye gönderdi: …" plays nothing. Pure (no React, no storage), so the node tests can check it.

/** The gift a chat line carries. */
export type DmGift = { id: string; count: number };

const GIFT_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The `gift` of a server message, or null (none, an older server, or anything malformed). */
export function parseDmGift(x: unknown): DmGift | null {
  if (!x || typeof x !== 'object') return null;
  const { id, count } = x as { id?: unknown; count?: unknown };
  if (typeof id !== 'string' || !GIFT_ID.test(id)) return null;
  const n = typeof count === 'number' && Number.isSafeInteger(count) && count >= 1 && count <= 10_000 ? count : 1;
  return { id, count: n };
}

/** A gift older than this is not played on opening the chat (a week-old gift is old news). */
export const GIFT_FX_FRESH_MS = 3 * 86_400_000;
/** How long after a chat opens its lines still count as "found on opening" (its first read from the server). */
export const GIFT_FX_OPENING_MS = 4_000;

/** A chat line as this needs it (data/mock Conversation messages). */
export type FxLine = { fromMe: boolean; sid?: number; at?: string; gift?: DmGift };

/**
 * Which of the other person's gift lines to play now, and the new "played up to" server id for this chat. `played`:
 * the highest server id already handled here (0: none). `opening`: the chat has just opened, so only the newest
 * unplayed gift plays (a pile of them would hold the screen); later each new one plays, in order. Either way only a
 * fresh one (GIFT_FX_FRESH_MS) and each at most once.
 */
export function giftFxToPlay<L extends FxLine>(lines: readonly L[], played: number, opening: boolean, now: number): { play: L[]; played: number } {
  const unplayed = lines
    .filter((m): m is L & { sid: number; gift: DmGift } => !m.fromMe && !!m.gift && typeof m.sid === 'number' && m.sid > played)
    .sort((a, b) => a.sid - b.sid);
  if (!unplayed.length) return { play: [], played };
  const fresh = (m: L) => {
    const t = m.at ? Date.parse(m.at) : NaN;
    return Number.isFinite(t) && now - t < GIFT_FX_FRESH_MS;
  };
  const next = unplayed[unplayed.length - 1].sid;
  const play = (opening ? unplayed.slice(-1) : unplayed).filter(fresh);
  return { play, played: next };
}

/** The name a gift line shows when the catalog doesn't know its gift: what its text says after "Hediye gönderdi: ". */
export function giftNameOfText(text: string): string {
  const i = text.indexOf(':');
  const name = (i >= 0 ? text.slice(i + 1) : '').replace(/\s*×\s*\d+\s*$/, '').trim();
  return name || 'Hediye';
}
