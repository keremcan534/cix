// The sizes of Çarşı's frame preview (components/frame-preview, Güncelleme 7): a frame round my own photo before I buy
// it, three ways. Pure numbers, unit tested (tests/frame-preview.test.ts).
// - Large: the photo big, the frame's picture free to spread round it in a square box.
// - On a room seat: exactly the numbers a room uses (lib/seat-fit fitGrid for a full room of ten mics, five to a row,
//   on this phone's width; lib/seat-cell seatRoom for the seat's cell), so the frame is drawn there as others will
//   see it on my mic: smaller, its ring over the photo's edge or the photo a little smaller when it is wide.
// - On the profile: the profile header's size (app/kullanici/[id], what others open), with the same spread.
import { SEAT_TOP, seatRoom, type SeatRoom } from '@/lib/seat-cell';
import { fitGrid, nameLine, nameSize } from '@/lib/seat-fit';

/** The room the seat view copies: a full room of ten mics (five to a row, the standard face). */
export const PREVIEW_ROOM_MICS = 10;
/** The profile header's framed photo (app/kullanici/[id] FramedAvatar): its size and how far a picture frame spreads. */
export const PROFILE_FACE = { size: 96, artScale: 2.2 } as const;
/** The large view's box at most (px): the frame's picture fills at most this square. */
export const LARGE_BOX_MAX = 230;

export type FramePreviewSizes = {
  /** `size`: the photo; `artScale`: how far the picture may spread (box / size); `box`: the square it stays in. */
  large: { size: number; artScale: number; box: number };
  /** One mic as a room draws it: the face, the slot's width, the seat's cell, the name's font and line, the room above. */
  seat: { face: number; slot: number; room: SeatRoom; nameSize: number; nameLine: number; top: number };
  profile: { size: number; artScale: number };
};

/** The preview's sizes on a phone `width` px wide (a tablet's counts as at most 640, as a room's stage does). */
export function framePreviewSizes(width: number): FramePreviewSizes {
  const w = Math.max(280, Math.min(Number.isFinite(width) ? width : 360, 640));
  const box = Math.round(Math.min(LARGE_BOX_MAX, w - 80));
  const size = Math.round(box / 2);
  // A room's stage of this width with room to spare in height: its faces are the standard size unless the row is
  // too narrow for them (a small phone), as in a real room.
  const grid = fitGrid(PREVIEW_ROOM_MICS, w, 10_000);
  return {
    large: { size, artScale: box / size, box },
    seat: { face: grid.face, slot: grid.slot, room: seatRoom(grid.face, grid.slot), nameSize: nameSize(grid.face), nameLine: nameLine(grid.face), top: SEAT_TOP },
    profile: { ...PROFILE_FACE },
  };
}
