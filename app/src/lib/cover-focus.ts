// A square portrait inside the wide photo card of a profile: the card shows a strip of it, and the middle strip of a
// portrait is the chest (the head was cut off). The strip is moved up to where a portrait's face sits.

/** Where the face of a portrait usually is, as a share of the picture's height from its top. */
export const FACE_AT = 0.36;

/** How far up (points, 0 or less) a square picture as wide as the card moves so the face is in the card's middle. */
export function coverTop(width: number, height: number, focus = FACE_AT) {
  if (!(width > height) || !(height > 0)) return 0;
  const top = height / 2 - width * focus;
  // Never past the picture's edges: no empty strip above or below it.
  return Math.round(Math.min(0, Math.max(height - width, top)));
}
