// The Mesajlar tab badge. A blocked person's chat is hidden from the list (and "Tümünü okundu yap" skips it), so
// its unread messages must not count on the badge either: the user could never clear them.

/** Unread direct messages, leaving out conversations with blocked people. */
export const unreadTotal = (conversations: readonly { userId: string; unread: number }[], blocked: ReadonlySet<string>) =>
  conversations.reduce((sum, c) => (blocked.has(c.userId) ? sum : sum + c.unread), 0);
