// Şanslı hediyelerin şeridi (components/room/lucky-banner): its timing and colours, pure so tests can read them.

/** A multiplier this big turns the strip gold. */
export const BIG_MULT = 100;
/** How long a strip waits after its number stopped rolling before it leaves (a new gift restarts it). */
export const STRIP_HOLD_MS = 2600;

/**
 * How long the number takes to roll up by `delta`: one gift pops at once, more count up one by one, quicker the more
 * there are (×10 in about 0.75 s, ×100 in about 1.85 s, never more than 2.6 s).
 */
export function rollMs(delta: number) {
  if (delta <= 1) return 0;
  return Math.round(Math.min(2600, 250 + Math.sqrt(delta) * 160));
}

/** The strip's colours for a count: [left, right] of the strip and the number's colour. */
export function tierOf(count: number, big: boolean): { colors: [string, string]; ink: string } {
  if (big) return { colors: ['#B45309', '#FACC15'], ink: '#FDE047' };
  if (count >= 500) return { colors: ['#CA8A04', '#FDE047'], ink: '#FDE047' };
  if (count >= 200) return { colors: ['#EA580C', '#FBBF24'], ink: '#FDBA74' };
  if (count >= 50) return { colors: ['#DB2777', '#F472B6'], ink: '#F9A8D4' };
  if (count >= 10) return { colors: ['#7C3AED', '#C084FC'], ink: '#D8B4FE' };
  return { colors: ['#0284C7', '#22D3EE'], ink: '#67E8F9' };
}
