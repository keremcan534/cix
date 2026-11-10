// Small motion helpers for the app's touches (rolling numbers and the like). Pure, so they are unit tested.

/** Starts quick and lands softly; `t` from 0 to 1 (clamped). */
export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** A number rolling from `from` to `to`: the whole number shown at `t` (0 to 1) of the way. */
export const rollAt = (from: number, to: number, t: number) => Math.round(from + (to - from) * easeOut(t));
