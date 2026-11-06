// Live chats: how the messages the server holds for one thread join the copy kept on this phone. lib/live/messages
// fetches them and the store applies them through these functions. Pure (no React, no API client), so the node
// tests can check them.
//
// Every server message has an id. `after` is the highest id this phone has settled for the thread: shown here, or
// shown and then deleted here. Ids at or below it are never added again, which is what keeps a deleted message or
// chat deleted. `hidden` holds the ids above `after` that were deleted before the next sync settled them.
import type { Conversation } from '@/data/mock';

export type ChatMessage = Conversation['messages'][number];
/** A message as GET /api/messages returns it (lib/api DirectMessage). */
export type ServerDm = { id: number; from: string; to: string; text: string; createdAt: string; readAt?: string | null };
export type ThreadSync = { peer: string; after: number; hidden?: readonly number[] };

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
  for (const d of [...server].sort((a, b) => a.id - b.id)) {
    const at = known.get(d.id);
    if (at !== undefined) {
      // Already here: only the read receipt can change.
      if (isMine(d, sync.peer) && d.readAt && !out[at].read) {
        out[at] = { ...out[at], read: true };
        changed = true;
      }
      continue;
    }
    if (d.id <= sync.after || hidden.has(d.id)) continue;
    const mine = isMine(d, sync.peer);
    const seen = mine && d.readAt ? { read: true } : null;
    const pending = mine ? out.findIndex((m) => m.fromMe && m.sid === undefined && m.text === d.text) : -1;
    if (pending >= 0) {
      out[pending] = { ...withoutFailure(out[pending]), sid: d.id, at: d.createdAt, ...seen };
      known.set(d.id, pending);
    } else {
      out.push({ id: `s${d.id}`, fromMe: mine, text: d.text, time: clockOf(d.createdAt), at: d.createdAt, sid: d.id, ...seen });
      known.set(d.id, out.length - 1);
      if (!mine) incoming++;
    }
    changed = true;
  }
  return { messages: out, incoming, changed };
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
  // Deleted meanwhile, or a sync already matched it by its text: nothing to do.
  if (!conv || at < 0 || conv.messages.some((m) => m.sid === d.id)) return list;
  const messages = conv.messages.map((m, j) => (j === at ? { ...withoutFailure(m), sid: d.id, at: d.createdAt } : m));
  return list.map((c, j) => (j === i ? { ...conv, messages } : c));
}
