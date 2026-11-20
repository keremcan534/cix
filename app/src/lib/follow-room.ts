// "Şu an odada" and "takip ederek geldi" (Güncelleme 7, item 15). Someone's profile shows the room they are in now
// (server/api/presence-room.mjs: their "Bulunduğum odayı göster", blocks and the room's door already applied), a tap
// takes me there, and the voice token carries whom I followed (GET /token `via`, checked by the server) as my `via`
// attribute, so every phone in the room writes "Kaan, Artemis’i takip ederek geldi" while Artemis is still there.
// Pure, so it is unit tested (tests/follow-room.test.ts); the voice token reads the `via` once (takeVia).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The room someone is in now, as their profile says it (GET /api/user `room`). `locked`: the door asks a password. */
export type HereRoom = { id: string; title: string; locked: boolean };

/** GET /api/user's `room`, defensively: anything malformed (or an older server's nothing) is no room. */
export function parseHereRoom(v: unknown): HereRoom | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as { id?: unknown; title?: unknown; locked?: unknown };
  if (typeof r.id !== 'string' || !UUID.test(r.id)) return null;
  const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim().slice(0, 80) : 'Oda';
  return { id: r.id, title, locked: r.locked === true };
}

/** A participant's `via` attribute: a server account id, or none. */
export const parseVia = (v: unknown): string | undefined => (typeof v === 'string' && UUID.test(v) ? v : undefined);

// The voice token of the next connect to a room takes the person I followed there (once: a reconnect is no new entrance).
const wanted = new Map<string, { via: string; at: number }>();
const WANT_MS = 2 * 60_000;
/** Opening `roomId` by following `via` (a server id; anything else, or none, forgets an earlier one). */
export function wantVia(roomId: string, via: string | undefined, now = Date.now()) {
  const id = parseVia(via);
  if (id) wanted.set(roomId, { via: id, at: now });
  else wanted.delete(roomId);
}
/** The `via` for this room's voice token, once; null when none was asked or it is older than two minutes. */
export function takeVia(roomId: string, now = Date.now()): string | null {
  const w = wanted.get(roomId);
  wanted.delete(roomId);
  return w && now - w.at <= WANT_MS ? w.via : null;
}

/** Last vowel decides a suffix's vowel (major and minor vowel harmony). */
const lastVowel = (word: string) => {
  const w = word.toLocaleLowerCase('tr-TR');
  for (let i = w.length - 1; i >= 0; i--) if ('aeıioöuü'.includes(w[i])) return w[i];
  return null;
};
const HARMONY: Record<string, string> = { a: 'ı', ı: 'ı', e: 'i', i: 'i', o: 'u', u: 'u', ö: 'ü', ü: 'ü' };

/**
 * A name in the accusative: "Artemis’i", "Kaan’ı", "Ayşe’yi", "Okan’ı", "Göktürk’ü". A name that doesn't end in a
 * letter (an emoji, a number) or has no vowel: null, and the line says "… kişisini" instead.
 */
export function accusative(name: string): string | null {
  const n = name.trim();
  const last = n.slice(-1).toLocaleLowerCase('tr-TR');
  const v = lastVowel(n);
  if (!n || !v || !/\p{L}/u.test(last)) return null;
  const vowelEnd = 'aeıioöuü'.includes(last);
  return `${n}’${vowelEnd ? 'y' : ''}${HARMONY[v]}`;
}

/** "Kaan, Artemis’i takip ederek geldi" (or "Kaan, 🌸 kişisini takip ederek geldi" for a name with no suffix). */
export function followLine(name: string, followed: string) {
  const f = followed.trim();
  return `${name}, ${accusative(f) ?? (f ? `${f} kişisini` : 'birini')} takip ederek geldi`;
}

/**
 * The person `joining` came following, if that person is still in the room: their `via` attribute names someone
 * connected now (`peers`, or me: `myId`). `peers`: the voice connection's people (server ids) with their `via`.
 */
export function followedHere(peers: readonly { identity: string; via?: string }[], joining: string, myId: string | null): string | null {
  const via = peers.find((p) => p.identity === joining)?.via;
  if (!via || via === joining) return null;
  return via === myId || peers.some((p) => p.identity === via) ? via : null;
}
