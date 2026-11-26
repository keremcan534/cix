// Live chats: how the messages the server holds for one thread join the copy kept on this phone. lib/live/messages
// fetches them and the store applies them through these functions. Pure (no React, no API client), so the node
// tests can check them.
//
// Every server message has an id. `after` is the highest id this phone has settled for the thread: shown here, or
// shown and then deleted here. Ids at or below it are never added again, which is what keeps a deleted message or
// chat deleted. `hidden` holds the ids above `after` that were deleted before the next sync settled them.
import type { Conversation } from '@/data/mock';
import { parseDmGift } from '@/lib/dm-gift-fx';

export type ChatMessage = Conversation['messages'][number];
/** A message as GET /api/messages returns it (lib/api DirectMessage). */
export type ServerDm = {
  id: number;
  from: string;
  to: string;
  text: string;
  image?: string | null;
  /** An event sent with it (newer servers); the card opens it. */
  event?: { id: number; title: string | null; startsAt?: string | null } | null;
  createdAt: string;
  readAt?: string | null;
  /** An automatic message or a quick reply (newer servers, server/api/auto-chat.mjs); the bubble labels it. */
  source?: string;
  /** The line of a gift sent from the chat (newer servers): which gift and how many (lib/dm-gift-fx parseDmGift). */
  gift?: unknown;
  /** Newer servers (27 Nov 2026): the message it answers, a take-back, a paid photo. Read defensively below. */
  replyTo?: unknown;
  retracted?: unknown;
  paidPhoto?: unknown;
};
/** The card of a server message's event, or undefined. */
const eventCard = (d: ServerDm) => (d.event && Number.isSafeInteger(d.event.id) ? { event: { id: d.event.id, title: d.event.title ?? 'Etkinlik', startsAt: d.event.startsAt ?? null } } : null);
export type ThreadSync = { peer: string; after: number; hidden?: readonly number[] };
const SOURCES = ['auto_streamer', 'auto_opener', 'quick_reply'];
/** A follow's line (newer servers, server/api/social.mjs): "X seni takip etti", drawn as a note, not a message. */
const followOf = (d: ServerDm) => (d.source === 'follow' ? { follow: true as const } : null);
/** The source of an automatic message or a quick reply, or nothing (a message typed by its writer, an older server). */
const sourceOf = (d: ServerDm) => (typeof d.source === 'string' && SOURCES.includes(d.source) ? { source: d.source as 'auto_streamer' | 'auto_opener' | 'quick_reply' } : null);
/** A gift's line: its gift, or nothing (a typed message, an older server, a malformed field). */
const giftOf = (d: ServerDm) => {
  const gift = parseDmGift(d.gift);
  return gift ? { gift } : null;
};

/** The message it answers, quoted over it; nothing when missing or malformed. */
const replyOf = (d: ServerDm, peer: string) => {
  const q = d.replyTo as { id?: unknown; from?: unknown; text?: unknown; photo?: unknown } | null | undefined;
  if (!q || typeof q !== 'object' || !Number.isSafeInteger(q.id) || typeof q.text !== 'string') return null;
  return { replyTo: { sid: q.id as number, fromMe: q.from !== peer, text: q.text, photo: q.photo === true } };
};
/** Taken back by its writer, or a paid photo gone unopened. */
const retractedOf = (d: ServerDm) => (d.retracted === 'unsent' || d.retracted === 'expired' ? { retracted: d.retracted as 'unsent' | 'expired' } : null);
/** A paid photo's price and state. */
const paidOf = (d: ServerDm) => {
  const p = d.paidPhoto as { price?: unknown; state?: unknown; until?: unknown } | null | undefined;
  if (!p || typeof p !== 'object' || typeof p.price !== 'number' || !(p.price > 0) || !['locked', 'open', 'expired'].includes(p.state as string)) return null;
  return { paidPhoto: { price: p.price, state: p.state as 'locked' | 'open' | 'expired', until: typeof p.until === 'string' ? p.until : '' } };
};
/** What the bubble and the chat list say: a locked paid photo in this app's words (the server's are for older apps). */
const textOf = (d: ServerDm, mine: boolean) => {
  const p = paidOf(d)?.paidPhoto;
  return p && p.state === 'locked' && !mine ? `🔒 Ücretli fotoğraf · ${p.price} jeton` : d.text;
};
/** A paid photo that went unopened is gone from the recipient's chat (owners, 27 Nov 2026: "mesaj silinsin"). */
const goneForMe = (d: ServerDm, mine: boolean) => !mine && d.retracted === 'expired';

const pad = (n: number) => String(n).padStart(2, '0');
/** 'HH:MM' of an ISO time on this phone's clock, or '' when it can't be read. */
export function clockOf(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const isMine = (d: ServerDm, peer: string) => d.from !== peer;
const withoutFailure = ({ failed: _failed, noRetry: _noRetry, ...m }: ChatMessage): ChatMessage => m;

/**
 * Adds the server's messages that this phone hasn't settled yet, both directions, with the server's time. My own
 * message that this phone sent but never heard back about (the app closed before the answer) is matched by its
 * text and gets the server id instead of a second copy. Also marks my messages the other person has read.
 * `incoming` counts the other person's messages that were added.
 */
export function mergeThread(local: readonly ChatMessage[], server: readonly ServerDm[], sync: ThreadSync) {
  const hidden = new Set(sync.hidden ?? []);
  const out = local.slice();
  const known = new Map<number, number>();
  out.forEach((m, i) => m.sid !== undefined && known.set(m.sid, i));
  let incoming = 0;
  let changed = false;
  const drop = new Set<number>();
  for (const d of [...server].sort((a, b) => a.id - b.id)) {
    const at = known.get(d.id);
    if (at !== undefined) {
      // Already here: the read receipt, and what can happen to a message after it arrived (taken back, a paid photo
      // opened or gone, the quote its answer carries).
      if (isMine(d, sync.peer) && d.readAt && !out[at].read) {
        out[at] = { ...out[at], read: true };
        changed = true;
      }
      const cur = out[at];
      if (goneForMe(d, isMine(d, sync.peer))) {
        drop.add(at);
        changed = true;
        continue;
      }
      const r = retractedOf(d);
      const p = paidOf(d);
      const q = replyOf(d, sync.peer);
      if ((r && cur.retracted !== r.retracted) || (p && cur.paidPhoto?.state !== p.paidPhoto.state) || (q && (!cur.replyTo || cur.replyTo.text !== q.replyTo.text))) {
        const { image: _image, ...rest } = cur;
        out[at] = { ...rest, text: textOf(d, isMine(d, sync.peer)), ...(d.image && { image: d.image }), ...r, ...p, ...q };
        changed = true;
      }
      continue;
    }
    if (d.id <= sync.after || hidden.has(d.id)) continue;
    const mine = isMine(d, sync.peer);
    if (goneForMe(d, mine)) continue;
    const seen = mine && d.readAt ? { read: true } : null;
    // My message still waiting for its answer, else one whose send failed without an answer (the server may have
    // stored it); the oldest first, as the server numbers messages in the order they arrive. A message the server
    // refused (noRetry) was never stored, so it never takes the id.
    let pending = -1;
    // A gift's line is the server's (never sent ahead from this phone), so it matches no local message either.
    if (mine && !giftOf(d) && !followOf(d)) {
      // A photo is never sent ahead on this phone (it comes in from the server), so it matches no local message.
      const unconfirmed = (m: ChatMessage) => !d.image && m.fromMe && m.sid === undefined && !m.noRetry && m.text === d.text;
      pending = out.findIndex((m) => unconfirmed(m) && !m.failed);
      if (pending < 0) pending = out.findIndex(unconfirmed);
    }
    if (pending >= 0) {
      out[pending] = { ...withoutFailure(out[pending]), sid: d.id, at: d.createdAt, ...seen };
      known.set(d.id, pending);
    } else {
      out.push({ id: `s${d.id}`, fromMe: mine, text: textOf(d, mine), time: clockOf(d.createdAt), at: d.createdAt, sid: d.id, ...(d.image && { image: d.image }), ...eventCard(d), ...sourceOf(d), ...giftOf(d), ...followOf(d), ...replyOf(d, sync.peer), ...retractedOf(d), ...paidOf(d), ...seen });
      known.set(d.id, out.length - 1);
      if (!mine) incoming++;
    }
    changed = true;
  }
  return { messages: drop.size ? out.filter((_, i) => !drop.has(i)) : out, incoming, changed };
}

/** The thread's new `after` once the given server messages are applied, and the deleted ids still worth keeping. */
export function settle(sync: ThreadSync, server: readonly ServerDm[]) {
  const after = Math.max(sync.after, ...server.map((d) => d.id));
  return { after, hidden: (sync.hidden ?? []).filter((id) => id > after) };
}

/** Deleting messages here: the ones the next sync would otherwise bring back. */
export const hideIds = (sync: ThreadSync, sids: readonly (number | undefined)[]) => [
  ...new Set([...(sync.hidden ?? []), ...sids.filter((id): id is number => id !== undefined && id > sync.after)]),
];

/**
 * The conversation list after a sync of one thread. `unread` is the server's count, or null when the thread was read
 * on its own (an open chat): then the new messages from the other person are added to the local count. A count the
 * server lowered (read on another phone) is taken; it only goes up with new messages, so a chat being read here
 * doesn't light up again. A chat with nothing to show is not created.
 */
export function applyThread(list: Conversation[], userId: string, server: readonly ServerDm[], sync: ThreadSync, unread: number | null): Conversation[] {
  const i = list.findIndex((c) => c.userId === userId);
  const conv = i >= 0 ? list[i] : undefined;
  const r = mergeThread(conv?.messages ?? [], server, sync);
  const local = conv?.unread ?? 0;
  const count = unread === null ? local + r.incoming : !conv || r.incoming > 0 ? unread : Math.min(local, unread);
  if (!conv) return r.messages.length ? [{ id: `c-${userId}`, userId, messages: r.messages, unread: count }, ...list] : list;
  if (!r.changed && count === local) return list;
  const next = { ...conv, messages: r.messages, unread: count };
  return r.incoming > 0 ? [next, ...list.filter((_, j) => j !== i)] : list.map((c, j) => (j === i ? next : c));
}

/** The server took my message: it keeps the server's id and time, and any earlier failure is cleared. */
export function markSent(list: Conversation[], userId: string, ref: string, d: Pick<ServerDm, 'id' | 'createdAt'>): Conversation[] {
  const i = list.findIndex((c) => c.userId === userId);
  const conv = i >= 0 ? list[i] : undefined;
  const at = conv ? conv.messages.findIndex((m) => m.ref === ref) : -1;
  // Deleted meanwhile: nothing to do.
  if (!conv || at < 0) return list;
  const holder = conv.messages.findIndex((m) => m.sid === d.id);
  // A sync already matched it by its text.
  if (holder === at) return list;
  const sent = conv.messages[at];
  const messages = conv.messages.map((m, j) => {
    if (j === at) return { ...withoutFailure(m), sid: d.id, at: d.createdAt, ...(holder >= 0 && conv.messages[holder].read ? { read: true } : null) };
    if (j !== holder) return m;
    // A sync gave this id to another message of mine with the same text (sent twice, the later one stored first):
    // that one takes what this one held instead, and its own answer settles it.
    const { sid: _sid, read: _read, ...rest } = m;
    return { ...rest, ...(sent.sid !== undefined ? { sid: sent.sid, at: sent.at } : null), ...(sent.read ? { read: true } : null) };
  });
  return list.map((c, j) => (j === i ? { ...conv, messages } : c));
}
