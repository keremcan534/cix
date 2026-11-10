// The Patron seat (Patron Koltuğu): the room's top gifter holds it. One person, one place: the holder is drawn
// on it only while they are in the room and on no numbered mic. On a numbered mic they are drawn there and the
// Patron seat waits empty for them. Pure, so the node tests can check it.

/**
 * Who is drawn on the Patron seat: `holder` (the top gifter, as the server or the demo names them) when they are
 * in the room (`members`; my own phone is always in it) and not on one of `seats`; otherwise nobody.
 */
export function patronOnSeat(holder: string | null, seats: readonly (string | null)[], members: readonly string[]): string | null {
  if (!holder) return null;
  if (seats.includes(holder)) return null;
  return holder === 'me' || members.includes(holder) ? holder : null;
}
