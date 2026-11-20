// Where the stage's seats sit and how much room each face has above it for its frame's crown (lib/seat-cell seatRoom):
// the classic grid's rows, a chosen layout's rows (data/room-layouts; components/room/stage-layout draws them), a side
// layout's column and the seat on a camera tile. The rule: every row of seats, the first one included, has a row's
// room above its faces (lib/seat-fit SEAT_TOP), so the same frame is as big on every row and nothing is cut under a
// board or a video tile; a row higher on the screen is drawn over the rows under it (its names and points pills over a
// lower crown's tip). Pure numbers, unit tested; live-room and stage-layout draw with them.
import type { LayoutSchema } from '@/data/room-layouts';
import { BOARD_GAP, PK_LINE, ROW_GAP, SEAT_TOP, STAGE_HEADROOM, STAGE_PAD_TOP, drawnRows, isVideoRow, rowGapOver, seatHeight } from '@/lib/seat-fit';

/** What is over the stage's first row: the Patron seat's row, a board or banner (FitStage measures them), a layout. */
export type StageTopOpts = { boss?: boolean; boards?: boolean; layout?: boolean };

/**
 * The px really free above the stage's first row of faces as the room lays it out: under the Patron seat its points
 * line and the gap under it (the classic grid's row gap; a layout's top padding); under a board the gap under the
 * boards and the stage's top padding; else that padding and the stage's headroom over it (components/room/fit-stage).
 */
export function firstRowRoom({ boss, boards, layout }: StageTopOpts): number {
  if (boss) return PK_LINE + (layout ? STAGE_PAD_TOP : ROW_GAP);
  return STAGE_PAD_TOP + (boards ? BOARD_GAP : STAGE_HEADROOM);
}

/** What the first row's seats are told (Seat roomTop): a row's room, or less where the stage really has less. */
export const stageTop = (o: StageTopOpts) => Math.min(SEAT_TOP, firstRowRoom(o));

/** A seat's or a row's place: the px free above its faces (Seat roomTop) and its stacking (zIndex; higher is over). */
export type RowPlace = { top: number; layer: number };

/** Seat `i` of the classic grid's `count` mics, `cols` to a row, under a stage whose first row has `first` above it. */
export function gridPlace(i: number, cols: number, count: number, first: number): RowPlace {
  const row = Math.floor(i / cols);
  return { top: row === 0 ? first : SEAT_TOP, layer: Math.ceil(count / cols) - row };
}

/** A layout's stage row as drawn: the gap over it (lib/seat-fit rowGapOver), whether it is video tiles, its place. */
export type LayoutRow = RowPlace & { row: number; gap: number; video: boolean };

/**
 * A layout's stage rows that hold seats, top to bottom, under a stage whose first row has `first` above its faces. A
 * row of seats under another row of seats has the gap and that row's points line above it; under a row of video tiles
 * (or a side layout's big video and its column) the stage adds a points line's height to the gap (rowGapOver), so every
 * row of seats after the first has SEAT_TOP.
 */
export function layoutRows(s: LayoutSchema, first: number): LayoutRow[] {
  const drawn = drawnRows(s);
  return drawn.map((row, k) => ({ row, gap: rowGapOver(s, row), video: isVideoRow(s, row), top: k === 0 ? first : SEAT_TOP, layer: drawn.length - k }));
}

/** Between two seats of the side column beside the big video (lib/seat-fit layoutHeight budgets it). */
export const SIDE_GAP = 6;

/**
 * Seat `k` of a side layout's column (`cols` to a row, `rows` rows), beside the big video at the stage's top (`first`
 * above its first row): under a seat of the column, the gap and its points line; a higher seat over the ones under it.
 */
export function sidePlace(k: number, cols: number, rows: number, first: number): RowPlace {
  const row = Math.floor(k / cols);
  return { top: row === 0 ? first : SIDE_GAP + PK_LINE, layer: rows - row };
}

/** A video tile's border; the tile cuts what passes its edge. */
export const TILE_BORDER = 1;
/** With the camera's picture on, the seat shrinks to the tile's corner, this far in from its border. */
export const TILE_INSET = 2;
/** The corner seat (camera on). */
export const TILE_CORNER = { width: 64, size: 28 } as const;
/** The least room above a camera-off tile's face, should a tile be too short for a row's (SEAT_TOP). */
export const TILE_TOP_MIN = 16;
/** The camera-off tile's face: at most as big as a host's, at least this. */
const TILE_FACE = { min: 32, max: 72 } as const;

/** Where a seat goes on a video tile: its slot's width, its face, the room above its face and its top in the tile. */
export type TileSeat = { width: number; size: number; top: number; y: number };

/**
 * The seat on a `w` × `h` video tile with the camera off: the biggest face (from 72 down to 32, and 40 px narrower than
 * the tile) that leaves a row's room above it (SEAT_TOP; TILE_TOP_MIN on a tile too short for that) inside the tile,
 * so its frame is as big as on a row and the tile cuts nothing of it. The room over the face and the seat under it
 * stand in the tile's middle: `y` is the seat's top inside the tile's border, `top` all the room over its face.
 */
export function tileSeat(w: number, h: number): TileSeat {
  const inner = h - 2 * TILE_BORDER;
  const most = Math.min(TILE_FACE.max, Math.floor(Math.min(w, h) - 40));
  const face = (top: number) => {
    for (let size = most; size >= TILE_FACE.min; size--) if (top + seatHeight(size) <= inner) return size;
    return 0;
  };
  const want = face(SEAT_TOP) ? SEAT_TOP : TILE_TOP_MIN;
  const size = face(want) || TILE_FACE.min;
  const y = Math.max(0, Math.floor((inner - want - seatHeight(size)) / 2) + want);
  return { width: w - 8, size, top: y, y };
}

/** The corner seat on a tile `h` px tall with the camera on, and the room the tile leaves above its face. */
export const tileCornerSeat = (h: number) => ({ ...TILE_CORNER, top: Math.max(0, h - 2 * TILE_BORDER - TILE_INSET - seatHeight(TILE_CORNER.size)) });
