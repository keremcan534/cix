// The live line's stream (server/api/live-line.mjs) read into events: "data: {json}" lines, a blank line after
// each event, ": …" comments that only keep the line open. Pure, so the unit tests run it under Node.

/**
 * One event: what changed for me (its type) and the ids that go with it, never content; a win announced to everyone
 * ('win', lib/live/win-news) also carries its banner's words, null where there are none.
 */
export type LineEvent = { type: string } & Record<string, string | number | boolean | null>;

/** The events complete in `buf`, and what is left of it (an event still arriving). */
export function takeEvents(buf: string): { events: LineEvent[]; rest: string } {
  const events: LineEvent[] = [];
  let rest = buf.replace(/\r\n/g, '\n');
  for (let i = rest.indexOf('\n\n'); i >= 0; i = rest.indexOf('\n\n')) {
    const block = rest.slice(0, i);
    rest = rest.slice(i + 2);
    const data = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).replace(/^ /, ''))
      .join('\n');
    if (!data) continue;
    try {
      const e = JSON.parse(data) as unknown;
      if (e && typeof e === 'object' && typeof (e as { type?: unknown }).type === 'string') events.push(e as LineEvent);
    } catch {
      // Not ours: skipped.
    }
  }
  return { events, rest };
}
