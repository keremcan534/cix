// What a seat draws around its face (components/room/parts Seat): its frame's picture and the speaking ring. Each
// seat keeps them inside its own cell, so nothing of one seat runs over a neighbour, the row above or its own name:
// to each side up to its slot's edge, above into the gap between the rows, below down to the name's line (never onto
// its letters). Every frame and every voice wave gets the same cell. Pure numbers, unit tested.
import type { FrameArtSize } from '@/data/frame-art';
import { ROW_GAP } from '@/lib/seat-fit';

/** The room around a seat's face (px): to each side, above and below. */
export type SeatRoom = { side: number; top: number; bottom: number };

/** Between a face and its name (the seat's gap). */
export const NAME_GAP = 4;

/** The room around a face of `size` px in a slot `slot` px wide (no slot known: an eighth of the face to each side). */
export function seatRoom(size: number, slot?: number): SeatRoom {
  const side = slot === undefined ? Math.round(size / 8) : Math.max(0, Math.floor((slot - size) / 2));
  return { side, top: ROW_GAP, bottom: NAME_GAP };
}

/** A frame picture breathes (components/fx/frame-art ArtFrame): it is drawn up to this much bigger. */
export const ART_BREATHE = 1.025;
/** The photo reaches a little under the picture's ring, so no gap shows at its edge. */
const TUCK = 1.04;

/**
 * The most a frame picture may spread, as a multiple of the face, to stay in the seat's room while it breathes: its
 * wings within the slot, its crown within the gap above, its hanging gems above the name.
 */
export function artScaleIn(art: FrameArtSize, size: number, room: SeatRoom): number {
  const half = size / 2;
  const { x, top, bottom } = art.reach;
  return Math.min((half + room.side) / x, (half + room.top) / top, (half + room.bottom) / bottom) / ART_BREATHE / size;
}

/**
 * The picture's side (`frame`) and the photo's size in its hole (`avatar`) for a face of `size` px: the photo fills the
 * face unless the picture would then be more than `maxScale` × the face; then the photo gets smaller instead.
 */
export function artFit(art: FrameArtSize, size: number, maxScale: number) {
  const frame = Math.min(size / (2 * art.hole * TUCK), size * maxScale);
  return { frame, avatar: frame * 2 * art.hole * TUCK };
}

/**
 * How far (px) past the face the speaking ring may grow at full voice: a seventh of the face, never past the slot's
 * edge or into the row above (components/room/voice-wave).
 */
export const ringReach = (size: number, room: SeatRoom) => Math.max(3, Math.min(Math.round(size / 7), room.side, room.top));

/** Between the face and the speaking ring at rest. */
export const RING_GAP = 1;
/**
 * The speaking ring round a face of `size` px, the same for every voice wave and every frame: its width, its side at
 * rest (just outside the face, never on the photo) and the scale at which its outer edge is `reach` px past the face.
 */
export function ringOf(size: number, reach: number) {
  const width = Math.max(2, Math.min(4, Math.round(size * 0.06)));
  const side = size + 2 * (RING_GAP + width);
  return { width, side, max: Math.max(1, (size + 2 * reach) / side) };
}
