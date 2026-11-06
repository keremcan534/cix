// Who "Yayıncı davet et" (Ajans → Ofis → Yayıncılar) is meant for: the owner types what the app shows them, the
// profile ID number ("ID:123456789012"), a server account id, or a username (@name). The server's invite takes a
// user id or a username (server/api/agency.mjs POST /api/agency/invite), so a profile number is matched against
// the people the phone can list first. Pure, for node --test.

export type InviteInput = { kind: 'user'; id: string } | { kind: 'public'; publicId: string; username: string } | { kind: 'username'; username: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads the invite field. A number of 9 to 14 digits (spaces and an "ID:" prefix allowed) is a profile ID; it is
 *  also kept as a username to try if no one matches it. Null when there is nothing usable. */
export function parseInviteInput(raw: string): InviteInput | null {
  const t = raw.trim();
  if (UUID.test(t)) return { kind: 'user', id: t.toLowerCase() };
  const digits = t.replace(/^id\s*:?\s*/i, '').replace(/[\s.-]/g, '');
  if (/^\d{9,14}$/.test(digits)) return { kind: 'public', publicId: digits, username: digits };
  const username = t.replace(/^@+/, '').trim();
  if (username.length < 2) return null;
  return { kind: 'username', username };
}

/** The people whose profile ID is `publicId` (`idOf` is the app's own displayId), each once. */
export function pickByPublicId<T extends { id: string }>(publicId: string, people: readonly T[], idOf: (id: string) => string): T[] {
  const seen = new Set<string>();
  return people.filter((p) => {
    if (seen.has(p.id) || idOf(p.id) !== publicId) return false;
    seen.add(p.id);
    return true;
  });
}
