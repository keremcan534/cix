// What a seat draws around its face (components/room/parts Seat): its frame's picture and the speaking ring. Each
// seat keeps them inside its own cell, so nothing of one seat runs over a neighbour's face or name or the row above's
// name: to each side up to CELL_GAP short of its slot's edge (two neighbours' cells never touch), above into the gap
// between the rows and the row above's points line (SEAT_TOP; a container with less room says how much it has), below
// down to the bottom of the seat's own name line (the name is drawn over the picture's hanging gems). Every frame and
// every voice wave gets the same cell. Pure numbers, unit tested.
//
// The rule for a frame picture on a seat (19 Nov 2026, seatArt), in this order:
// 1. The picture sits with its ring on the photo's edge, the photo filling the face.
// 2. Too big for the cell: the picture is drawn smaller, its ring over the photo's edge, down to RING_OVER of the
//    photo's radius. The photo keeps the face's size.
// 3. Still too big: the picture keeps the cell's size and the photo shrinks under it, the ring covering RING_OVER of
//    it, down to PHOTO_MIN of the face.
// 4. Only past that (a container with almost no room above, a very wide picture) is the picture cut at the cell's
//    edge, and then it stands still: a breathing picture under a fixed cut would slide the cut edge.
// The speaking ring keeps its own, smaller reach (ringReach): it never grows onto the name's letters.
import type { FrameArtSize } from '@/data/frame-art';
import { PK_LINE, ROW_GAP, nameLine } from '@/lib/seat-fit';

/**
 * The room around a seat's face (px): to each side, above and below, for its frame's picture; `ring` how far the
 * speaking ring may grow past the face (ringReach).
 */
export type SeatRoom = { side: number; top: number; bottom: number; ring: number };
/** The room a frame's picture is fitted to. */
export type ArtRoom = Pick<SeatRoom, 'side' | 'top' | 'bottom'>;

/** Between a face and its name (the seat's gap). */
export const NAME_GAP = 4;
/** Between two neighbouring seats' cells, each side: their pictures never touch. */
export const CELL_GAP = 2;
/**
 * The room above a face in a row of seats: the gap between the rows and the row above's points line (lib/seat-fit
 * PK_LINE), which is empty outside a PK; in a PK the row above is drawn over this row (its pill over a crown's tip).
 */
export const SEAT_TOP = ROW_GAP + PK_LINE;
/** Under the face the speaking ring may go this much past the name gap: the name's line has this much air above its letters. */
const NAME_AIR = 3;

/**
 * The room around a face of `size` px in a slot `slot` px wide (no slot known: an eighth of the face to each side),
 * with `top` px free above it (SEAT_TOP in a row of seats; a container with less says so).
 */
export function seatRoom(size: number, slot?: number, top: number = SEAT_TOP): SeatRoom {
  const half = slot === undefined ? Math.round(size / 8) : Math.max(0, Math.floor((slot - size) / 2));
  const side = slot === undefined ? half : Math.max(0, half - CELL_GAP);
  // The speaking ring keeps the reach it always had: the slot's edge, the row gap (or less, where a container has less
  // above the face), the air above the name's letters.
  return { side, top: Math.max(0, top), bottom: NAME_GAP + nameLine(size), ring: Math.max(0, Math.min(half, ROW_GAP, top, NAME_GAP + NAME_AIR)) };
}

/** A frame picture breathes (components/fx/frame-art ArtFrame): it is drawn up to this much bigger. */
export const ART_BREATHE = 1.025;
/** The photo reaches a little under the picture's ring, so no gap shows at its edge. */
const TUCK = 1.04;

/**
 * The most a frame picture may spread, as a multiple of the face, to stay in the seat's room while it breathes: its
 * wings within the slot, its crown within the room above, its hanging gems within the name's line.
 */
export function artScaleIn(art: FrameArtSize, size: number, room: ArtRoom): number {
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

/** How much of the photo's radius a frame's ring may cover on a seat (rule steps 2 and 3). */
export const RING_OVER = 0.3;
/** The smallest photo under a frame on a seat, as a share of the face (rule step 3); smaller would need a cut. */
export const PHOTO_MIN = 0.8;

/** What a seat draws for a frame: the picture's side, the photo's size, whether it is cut and the cell it is cut to. */
export type SeatArt = { frame: number; avatar: number; clip: boolean; box: { left: number; top: number; width: number; height: number } };

/**
 * A frame picture on a seat whose face is `size` px, by the rule above: the picture's side (`frame`), the photo's size
 * in it (`avatar`, centred in the face's box), and whether it must be cut to the seat's cell (`clip`, the cell's box
 * round the face: `box`).
 */
export function seatArt(art: FrameArtSize, size: number, room: ArtRoom): SeatArt {
  // The picture's side for a photo of `photo` px whose radius its ring covers RING_OVER of.
  const over = (photo: number) => ((1 - RING_OVER) * photo) / (2 * art.hole);
  const edge = size / (2 * art.hole * TUCK);
  const fit = artScaleIn(art, size, room) * size;
  const box = { left: -room.side, top: -room.top, width: size + 2 * room.side, height: size + room.top + room.bottom };
  const frame = Math.min(edge, Math.max(over(size), fit));
  if (frame <= fit + 0.5) return { frame, avatar: size, clip: false, box };
  // The picture keeps the cell's size; the photo shrinks under it, the ring covering RING_OVER of it.
  const avatar = Math.min(size, (2 * art.hole * fit) / (1 - RING_OVER));
  if (avatar >= PHOTO_MIN * size) return { frame: fit, avatar, clip: false, box };
  const least = PHOTO_MIN * size;
  return { frame: over(least), avatar: least, clip: true, box };
}

/**
 * How far (px) past the face the speaking ring may grow at full voice: a seventh of the face, never past the slot's
 * edge, into the row gap or onto the name's letters (components/room/voice-wave).
 */
export const ringReach = (size: number, room: Pick<SeatRoom, 'ring'>) => Math.max(3, Math.min(Math.round(size / 7), room.ring));

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
