// The chat on screen right now, by the other person's server id: a notification about it needs no banner (lib/push).
// Plain logic: the unit tests import it.
let open: string | null = null;

/** The chat with `peer` came on screen. Returns the call for when it leaves. */
export function markChatOpen(peer: string) {
  open = peer;
  return () => {
    // Another chat may have opened over this one.
    if (open === peer) open = null;
  };
}

/** This notification is a message in the chat already on screen. */
export function isOpenChat(data: Record<string, unknown> | undefined) {
  if (!open || data?.type !== 'message') return false;
  return (data.sender ?? data.from) === open;
}
