// The gifts two people sent each other during a call (server one-on-one.mjs withGifts, on the beat's answer), read
// for the call's screen (components/call-stage). Pure, so tests read it as the phone does.

/** The coins of the gifts I received and sent during the call, and the last gift. */
export type CallGifts = { received: number; sent: number; last: { id: number; fromMe: boolean; giftId: string; count: number; total: number } | null };

const whole = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** A call's gifts read without trusting them: missing (an older server, a call still ringing) or malformed → none. */
export function callGifts(c: { gifts?: unknown } | null): CallGifts {
  const g = c?.gifts && typeof c.gifts === 'object' ? (c.gifts as Partial<Record<keyof CallGifts, unknown>>) : undefined;
  const l = g?.last && typeof g.last === 'object' ? (g.last as Partial<Record<keyof NonNullable<CallGifts['last']>, unknown>>) : null;
  const last =
    l && typeof l.id === 'number' && typeof l.giftId === 'string' ? { id: l.id, fromMe: l.fromMe === true, giftId: l.giftId, count: Math.max(1, whole(l.count)), total: whole(l.total) } : null;
  return { received: whole(g?.received), sent: whole(g?.sent), last };
}
