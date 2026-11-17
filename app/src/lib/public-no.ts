// Everyone's own number (server/api/public-no.mjs, docs/KIMLIK_NUMARASI.md): the server gives each account a 12-digit
// number that never changes; it is their profile's ID and their room's, and GET /api/lookup finds anyone by it. The
// server's answers are read here, pure for node --test: a malformed one is nobody, never a crash.

/** A person's own number as the server sends it (users.public_no: 12 digits); anything else is none. */
export const serverNo = (v: unknown): string | null => (typeof v === 'string' && /^\d{12}$/.test(v) ? v : null);

/** Someone found by a number, and their room if it is open (its ID is their number). */
export type Lookup = {
  user: { id: string; name: string; avatarUrl: string | null; publicNo: string | null };
  room: { id: string; title: string; code: string | null } | null;
};

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);

/** GET /api/lookup's answer; null when it names nobody this app can open. */
export function parseLookup(raw: unknown): Lookup | null {
  const u = obj(obj(raw)?.user);
  const id = text(u?.id);
  if (!u || !id) return null;
  const r = obj(obj(raw)?.room);
  const roomId = text(r?.id);
  return {
    user: { id, name: text(u.name) ?? 'Kullanıcı', avatarUrl: text(u.avatarUrl), publicNo: serverNo(u.publicNo) },
    room: r && roomId ? { id: roomId, title: text(r.title) ?? 'Oda', code: serverNo(r.code) } : null,
  };
}
