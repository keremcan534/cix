// How big the faces on a room's mics are. As in other apps, every mic count gets the same face (FACE_STD): 2 mics
// or 20, the rows change, the faces, names and points under them don't, and the chat takes the height the stage
// leaves. Only when a row is too narrow for it (six to a row) or the phone too short (the stage would leave the chat
// less than its least) are the faces smaller, down to FACE_MIN. Pure (no drawing), so the sizes are unit tested; the
// seats draw with these numbers.
import type { LayoutSchema, LayoutSlot } from '@/data/room-layouts';

/** The smallest and the biggest face on a mic (px). */
export const FACE_MIN = 30;
export const FACE_MAX = 96;
/**
 * The face on every stage, whatever its mic count or layout (the owners' video of another app, Nov 2026: the mics
 * there keep their size from 2 to 24 and only the rows change). Before, the faces filled the stage's height (96 px
 * with 5 mics, 30 with 20), so every change of the mic count resized the seats, their frames and their names.
 */
export const FACE_STD = 52;
/**
 * The widest step between two mics. A row shares the stage's whole width (the customer's note, 18 Nov: three or four
 * seats huddled in the middle left empty sides), so this only keeps one or two seats from drifting to the edges.
 */
const STEP_MAX = 136;
/** The host's face when it has a row of its own (and a couple room's main seats'): a little bigger. */
const HOST_MAX = 112;
/** Between two rows of seats (the stage's and the classic grid's row gap). */
export const ROW_GAP = 10;
/** Room beside a face in its slot, so neighbouring faces and names don't touch. */
const SIDE = 14;
/** The Patron seat: its ring, the tag on it and the name under it. */
const BOSS_H = 98;
/**
 * The line under every name where a PK's points pill goes (lib/pk pkPillBox). Every room keeps it, with or without a
 * PK (güncelleme 6): a PK starting or ending never moves, shrinks or spreads the mics, the way the owner sees it in
 * other apps. Without a PK it is a little air under the names. It sits right under the name (the name's line has its
 * own air below its letters), so it costs 15 px a row.
 */
export const PK_LINE = 15;
/** The Patron seat with its points line (its holder is on a mic for a PK too). */
const bossHeight = () => BOSS_H + PK_LINE;
/**
 * Between two seats' cells (lib/seat-cell), beside and above or below: a seat's frame picture keeps this far from its
 * neighbour's, so an upper seat's hanging gems and a lower seat's crown never meet.
 */
export const CELL_GAP = 2;
/**
 * The room above a face in a row of seats, where its frame's crown may rise (lib/seat-cell): the gap between the rows
 * and the row above's points line (empty outside a PK; in a PK the row above is drawn over this row, its pill over a
 * crown's tip), less CELL_GAP. The stage gives its first row the same (STAGE_PAD_TOP), so a frame is as big there.
 */
export const SEAT_TOP = ROW_GAP + PK_LINE - CELL_GAP;
/**
 * components/room/fit-stage: the stage's scroller reaches this far up over its first row, into the header's lower
 * padding (it cuts what passes its edge). With no board over the mics it is part of the first row's room.
 */
export const STAGE_HEADROOM = 8;
/**
 * The padding over the stage's first row of seats (the classic grid and every layout; counted in their heights): with
 * the headroom over it, the first row's faces have SEAT_TOP above them, as every other row has.
 */
export const STAGE_PAD_TOP = SEAT_TOP - STAGE_HEADROOM;
/**
 * Under the boards and banners over the mics (music, a poll, a cross-room PK's board…; components/room/fit-stage): it
 * stands in for the headroom they cover, so the first row's frames are as big under a board and never reach it.
 */
export const BOARD_GAP = STAGE_HEADROOM;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** A seat's name grows a little with its face; its line height is fixed, so a row's height is known here. */
export const nameSize = (face: number) => (face >= 72 ? 14 : face >= 54 ? 13 : 12);
export const nameLine = (face: number) => nameSize(face) + 5;
/** A seat: the face, the 4 px gap, the name and the points line under it (kept with or without a PK). */
export const seatHeight = (face: number) => face + 4 + nameLine(face) + PK_LINE;
export const hostFaceOf = (face: number) => Math.min(HOST_MAX, Math.round(face * 1.2));

/** The biggest face from `max` down to FACE_MIN whose stage (`heightAt`) fits `height`; FACE_MIN when none does. */
export function fitFace(heightAt: (face: number) => number, height: number, max: number): number {
  const top = Math.max(FACE_MIN, Math.floor(max));
  for (let face = top; face > FACE_MIN; face--) if (heightAt(face) <= height) return face;
  return FACE_MIN;
}

/** What every stage shape is told: the Patron seat is on. A PK changes nothing: its points line is always kept. */
export type FitOpts = { boss?: boolean };
/**
 * Seats fitted to a height: the mic face, the host's (alone on its row), the width a mic takes, the columns (the
 * classic grid; 0 for a layout, whose rows the schema sets) and the height they take.
 */
export type Fitted = { face: number; host: number; slot: number; cols: number; height: number };

/**
 * A change of sizes worth easing on screen (components/room/fit-stage): other columns, faces 4 px or more apart, or
 * a stage 24 px or more taller or shorter. A drag of the chat's handle changes them a pixel at a time: not eased.
 */
export const easedChange = (a: Fitted, b: Fitted) => a.cols !== b.cols || Math.abs(a.face - b.face) >= 4 || Math.abs(a.height - b.height) >= 24;

// ── The classic grid (no layout chosen): the host's row, then the guests `cols` to a row ──

/** The grid's inner width (the room's padding taken off). */
const gridWidth = (width: number) => Math.max(200, Math.min(width, 640) - 16);

/** The width one mic takes: its equal share of the row, so the seats spread across the stage. */
export const gridSlot = (w: number, cols: number) => Math.min(Math.floor(w / cols), STEP_MAX);

function gridAt(seats: number, w: number, cols: number, face: number, o: FitOpts): Fitted {
  const rows = Math.ceil(seats / cols);
  // The Patron seat has the row above the mics to itself; the host's mic is the grid's first, as big as the rest.
  const top = o.boss ? bossHeight() + ROW_GAP : 0;
  return { cols, slot: gridSlot(w, cols), face, host: face, height: STAGE_PAD_TOP + top + rows * seatHeight(face) + Math.max(0, rows - 1) * ROW_GAP };
}

/**
 * The classic grid's columns for `seats` mics (the host's among them), so that every row is full and the stage is
 * symmetric, as in other apps (the owners' video, Nov 2026): up to five in one row; then four (8, 12, 16), five (10,
 * 15, 20, 25), three (6, 9) or six (18, 24, 30) to a row. A count none of them fills (7, 11, 13…) gets four or five
 * (six past twenty), whichever leaves the last row fullest, then the fewer rows; that row sits in the middle
 * (live-room guestGrid).
 */
export function gridCols(seats: number): number {
  if (seats <= 5) return Math.max(1, seats);
  const fills = (cols: number, rows: number) => seats % cols === 0 && seats / cols <= rows;
  if (fills(4, 4)) return 4;
  if (fills(5, 5)) return 5;
  if (fills(3, 3)) return 3;
  if (fills(6, 6)) return 6;
  const empty = (cols: number) => Math.ceil(seats / cols) * cols - seats;
  const [a, b] = seats > 20 ? [5, 6] : [4, 5];
  return empty(b) < empty(a) || (empty(b) === empty(a) && Math.ceil(seats / b) < Math.ceil(seats / a)) ? b : a;
}

/**
 * The classic grid for `seats` mics (the Patron seat's row above them) in `height`: gridCols' columns with FACE_STD
 * faces, smaller only when the row is narrow or the height can't hold them. When even the smallest faces don't fit,
 * more to a row (the shortest stage). With `like` (the room as it is without a board over it) the columns stay and the
 * faces are at most that big: a board adds to the stage, it doesn't rearrange it.
 */
export function fitGrid(seats: number, width: number, height: number, o: FitOpts = {}, like?: Fitted): Fitted {
  const w = gridWidth(width);
  const widest = (cols: number) => Math.min(FACE_STD, Math.floor(w / cols) - SIDE);
  const at = (cols: number, max: number) => gridAt(seats, w, cols, fitFace((f) => gridAt(seats, w, cols, f, o).height, height, max), o);
  if (like && like.cols >= 1) return at(like.cols, Math.min(widest(like.cols), like.face));
  const most = Math.max(3, Math.min(8, Math.floor(w / (FACE_MIN + SIDE))));
  const cols = Math.min(gridCols(seats), most);
  let best = at(cols, widest(cols));
  for (let more = Math.max(cols + 1, 4); best.height > height && more <= Math.min(most, Math.max(seats, cols)); more++) {
    const shorter = gridAt(seats, w, more, FACE_MIN, o);
    if (shorter.height < best.height) best = shorter;
  }
  return best;
}

// ── A chosen layout (data/room-layouts): its rows as the schema draws them (components/room/stage-layout) ──

/** The room's padding beside the stage. */
const PAD = 12;

export type LayoutPlan = {
  inner: number;
  /** The gap between two mics of a row (none: the room between faces is in their slots, as in the classic grid) and
   * the width each mic takes. */
  micGap: number;
  micW: number;
  /** The biggest mic face the rows' width allows. */
  maxFace: number;
  /** In a PK room, team rows sit in red/blue bands. */
  bands: boolean;
  /** A big video with mics in a column beside it (its sizes don't change with the height). */
  sided: boolean;
};

/** A row of mics that is all video tiles: their width and height. */
export function videoTile(plan: Pick<LayoutPlan, 'inner'>, count: number) {
  // Three to a row on the narrowest phones are a little under 96 px rather than the third falling to a line of its own.
  const fits = (plan.inner - (count - 1) * 8) / count;
  const w = Math.floor(clamp(fits, Math.min(96, fits), count === 1 ? plan.inner * 0.72 : 220));
  return { w, h: Math.round(clamp(w * 0.72, 96, 170)) };
}

export function layoutPlan(s: LayoutSchema, width: number, pkRoom: boolean): LayoutPlan {
  const inner = Math.max(240, Math.min(width, 640) - PAD * 2);
  const stage = s.slots.filter((x) => x.area === 'stage');
  const bands = pkRoom && stage.some((x) => x.team);
  // The widest mic row must fit on one line and shares the stage's width, as the classic grid's rows do.
  const micCols = Math.max(3, ...[...Array(s.rows).keys()].map((r) => stage.filter((x) => x.row === r && x.kind === 'mic').length));
  const micGap = 0;
  const rowW = inner - (bands ? 12 : 0);
  const micW = Math.floor(clamp(rowW / micCols, 40, STEP_MAX));
  // Seven team mics on a narrow phone leave less than a face and its margins: they keep the smallest face.
  return { inner, micGap, micW, maxFace: Math.max(FACE_MIN, Math.min(FACE_MAX, micW - SIDE)), bands, sided: s.slots.some((x) => x.area === 'side') };
}

/** The sizes of a layout's seats for mic faces of `face` px. */
export function layoutSizes(plan: LayoutPlan, face: number) {
  const host = hostFaceOf(face);
  const mainW = Math.round(clamp(plan.inner / 3, 84, 120));
  return {
    mic: { width: plan.micW, size: face },
    /** The host alone on its row. */
    host: { width: Math.max(plan.micW, host + 2 * SIDE), size: host },
    /** A couple room's two main seats. */
    main: { width: mainW, size: Math.min(host, mainW - 20) },
  };
}

/** The layout's height with mic faces of `face` px (the Patron seat's row above it included). */
export function layoutHeight(s: LayoutSchema, plan: LayoutPlan, face: number, o: FitOpts = {}): number {
  const boss = o.boss ? bossHeight() + 6 : 0;
  if (plan.sided) {
    // The big video and the side column (60 px seats, 38 px faces) as StageLayout draws them; rows under it as usual.
    const side = s.slots.filter((x) => x.area === 'side');
    const sideCols = side.length > 6 ? 3 : side.length > 3 ? 2 : 1;
    const bigH = Math.round(clamp((plan.inner - 60 * sideCols - 8) * 0.95, 150, 320));
    const sideRows = Math.ceil(side.length / sideCols);
    const block = Math.max(bigH, sideRows * seatHeight(38) + (sideRows - 1) * 6);
    return boss + STAGE_PAD_TOP + block + rowsHeight(s, plan, face, 1);
  }
  return boss + STAGE_PAD_TOP + rowsHeight(s, plan, face, 0);
}

/** A layout's stage rows that hold seats, top to bottom (an empty row isn't drawn). */
export const drawnRows = (s: LayoutSchema) => [...Array(s.rows).keys()].filter((r) => s.slots.some((x) => x.area === 'stage' && x.row === r));
/** A row of video tiles only (the seats in them keep to their tiles). */
export const isVideoRow = (s: LayoutSchema, r: number) => {
  const xs = s.slots.filter((x) => x.area === 'stage' && x.row === r);
  return xs.length > 0 && xs.every((x) => x.kind === 'video');
};

/**
 * The gap over a layout's row `r` (components/room/stage-layout draws it): none over the first row drawn, else the row
 * gap; a row of seats under a row of video tiles (or under a side layout's big video and its column) also gets a points
 * line's height, which a tile doesn't have under it, so its frames have the same room above (SEAT_TOP) as under a row
 * of seats.
 */
export function rowGapOver(s: LayoutSchema, r: number): number {
  const drawn = drawnRows(s);
  const k = drawn.indexOf(r);
  if (k <= 0) return 0;
  const prev = drawn[k - 1];
  const underVideo = (prev === 0 && s.slots.some((x) => x.area === 'side')) || isVideoRow(s, prev);
  return ROW_GAP + (underVideo && !isVideoRow(s, r) ? PK_LINE : 0);
}

function rowsHeight(s: LayoutSchema, plan: LayoutPlan, face: number, from: number) {
  const sizes = layoutSizes(plan, face);
  let h = 0;
  for (let r = from; r < s.rows; r++) {
    const xs = s.slots.filter((x) => x.area === 'stage' && x.row === r);
    if (!xs.length) continue;
    h += rowGapOver(s, r) + rowHeight(xs, plan, sizes);
  }
  return h;
}

function rowHeight(xs: LayoutSlot[], plan: LayoutPlan, sizes: ReturnType<typeof layoutSizes>) {
  if (xs.every((x) => x.kind === 'video')) return videoTile(plan, xs.length).h;
  const lone = xs.length === 1 && xs[0].host;
  const tallest = xs.some((x) => x.kind === 'main') ? sizes.main.size : lone ? sizes.host.size : sizes.mic.size;
  // A team row in a PK room sits in a band: padding and border (12) and the team's name over it (18 + 4).
  return seatHeight(tallest) + (plan.bands && xs[0].team ? 34 : 0);
}

/**
 * A layout's mic face: FACE_STD (or what its widest row allows), smaller only when `height` can't hold it; at most
 * `like`'s (the room without its boards), as in fitGrid.
 */
export function fitLayout(s: LayoutSchema, plan: LayoutPlan, height: number, o: FitOpts = {}, like?: Fitted): Fitted {
  const face = fitFace((f) => layoutHeight(s, plan, f, o), height, Math.min(FACE_STD, plan.maxFace, like ? like.face : FACE_MAX));
  return { face, host: hostFaceOf(face), slot: layoutSizes(plan, face).mic.width, cols: 0, height: layoutHeight(s, plan, face, o) };
}
