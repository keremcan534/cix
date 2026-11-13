// How big the faces on a room's mics are. The stage doesn't scroll: its mics take the height the room's chat
// leaves them (few mics: big faces, up to FACE_MAX; many: smaller ones, down to FACE_MIN), and when the faces are
// as big as they get the chat takes the rest, so no empty band opens. Only when even the smallest faces don't fit
// does the chat give way. Pure (no drawing), so the sizes are unit tested; the seats draw with these numbers.
import type { LayoutSchema, LayoutSlot } from '@/data/room-layouts';

/** The smallest and the biggest face on a mic (px). */
export const FACE_MIN = 30;
export const FACE_MAX = 96;
/** The host's face when it has a row of its own (and a couple room's main seats'): a little bigger. */
const HOST_MAX = 112;
/** Between two rows of seats (the stage's and the classic grid's row gap). */
export const ROW_GAP = 10;
/** Room beside a face in its slot, so neighbouring faces and names don't touch. */
const SIDE = 14;
/** The Patron seat: its ring, the tag on it and the name under it. */
const BOSS_H = 98;
/** The points pill under a name while a PK runs. */
const PK_ROOM = 24;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** A seat's name grows a little with its face; its line height is fixed, so a row's height is known here. */
export const nameSize = (face: number) => (face >= 72 ? 14 : face >= 54 ? 13 : 12);
export const nameLine = (face: number) => nameSize(face) + 5;
/** A seat: the face, the 4 px gap and the name; while a PK runs, the points pill too. */
export const seatHeight = (face: number, pk = false) => face + 4 + nameLine(face) + (pk ? PK_ROOM : 0);
export const hostFaceOf = (face: number) => Math.min(HOST_MAX, Math.round(face * 1.2));

/** The biggest face from `max` down to FACE_MIN whose stage (`heightAt`) fits `height`; FACE_MIN when none does. */
export function fitFace(heightAt: (face: number) => number, height: number, max: number): number {
  const top = Math.max(FACE_MIN, Math.floor(max));
  for (let face = top; face > FACE_MIN; face--) if (heightAt(face) <= height) return face;
  return FACE_MIN;
}

/** What every stage shape is told: the Patron seat is on, a PK is running (the points pill under the names). */
export type FitOpts = { boss?: boolean; pk?: boolean };
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

/**
 * The width one mic takes: never more than its share of the row, and no wider than its face and a short gap, so a
 * row of small faces stays together in the middle instead of spreading over the whole screen.
 */
export const gridSlot = (w: number, cols: number, face: number) => Math.min(Math.floor(w / cols), Math.round(face * 1.25) + 16);

function gridAt(guests: number, w: number, cols: number, face: number, o: FitOpts): Fitted {
  const rows = Math.ceil(guests / cols);
  // Beside the Patron seat the host is at most the boss seat's ring; alone on its row a little bigger than the rest.
  const host = o.boss ? Math.min(hostFaceOf(face), 70) : hostFaceOf(face);
  const top = o.boss ? Math.max(BOSS_H, seatHeight(host, o.pk)) : seatHeight(host, o.pk);
  return { cols, slot: gridSlot(w, cols, face), face, host, height: 8 + top + rows * (ROW_GAP + seatHeight(face, o.pk)) };
}

/** Fits beats doesn't; then the bigger face; then the one that fills the height more. None fits: the shortest. */
function better(a: Fitted, b: Fitted, height: number) {
  const fa = a.height <= height;
  const fb = b.height <= height;
  if (fa !== fb) return fa;
  if (!fa) return a.height < b.height;
  return a.face > b.face || (a.face === b.face && a.height > b.height);
}

/**
 * The columns and faces with which `guests` mics (and the host's row) fit `height` best. With `like` (the room as
 * it is without its PK) the columns stay and the faces are at most that big: a PK adds to the stage, it doesn't
 * rearrange it.
 */
export function fitGrid(guests: number, width: number, height: number, o: FitOpts = {}, like?: Fitted): Fitted {
  const w = gridWidth(width);
  if (like && like.cols >= 3) {
    const max = Math.min(FACE_MAX, Math.floor(w / like.cols) - SIDE, like.face);
    return gridAt(guests, w, like.cols, fitFace((f) => gridAt(guests, w, like.cols, f, o).height, height, max), o);
  }
  const most = Math.max(3, Math.min(8, Math.floor(w / (FACE_MIN + SIDE)), guests));
  let best: Fitted | null = null;
  for (let cols = 3; cols <= most; cols++) {
    const max = Math.min(FACE_MAX, Math.floor(w / cols) - SIDE);
    const at = gridAt(guests, w, cols, fitFace((f) => gridAt(guests, w, cols, f, o).height, height, max), o);
    if (!best || better(at, best, height)) best = at;
  }
  return best!;
}

// ── A chosen layout (data/room-layouts): its rows as the schema draws them (components/room/stage-layout) ──

/** The room's padding beside the stage. */
const PAD = 12;

export type LayoutPlan = {
  inner: number;
  /** The gap between two mics of a row and the width each mic takes. */
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
  const w = Math.floor(clamp((plan.inner - (count - 1) * 8) / count, 96, count === 1 ? plan.inner * 0.72 : 220));
  return { w, h: Math.round(clamp(w * 0.72, 96, 170)) };
}

export function layoutPlan(s: LayoutSchema, width: number, pkRoom: boolean): LayoutPlan {
  const inner = Math.max(240, Math.min(width, 640) - PAD * 2);
  const stage = s.slots.filter((x) => x.area === 'stage');
  const bands = pkRoom && stage.some((x) => x.team);
  // The widest mic row must fit on one line together with the gaps between its seats; six across get a narrower gap.
  const micCols = Math.max(3, ...[...Array(s.rows).keys()].map((r) => stage.filter((x) => x.row === r && x.kind === 'mic').length));
  const micGap = micCols >= 6 ? 4 : 8;
  const rowW = inner - (bands ? 12 : 0);
  const micW = Math.floor(clamp((rowW - (micCols - 1) * micGap) / micCols, 40, FACE_MAX + 2 * SIDE));
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
  const boss = o.boss ? BOSS_H + 6 : 0;
  if (plan.sided) {
    // The big video and the side column (60 px seats, 38 px faces) as StageLayout draws them; rows under it as usual.
    const side = s.slots.filter((x) => x.area === 'side');
    const sideCols = side.length > 5 ? 2 : 1;
    const bigH = Math.round(clamp((plan.inner - 60 * sideCols - 8) * 0.95, 150, 320));
    const sideRows = Math.ceil(side.length / sideCols);
    const block = Math.max(bigH, sideRows * seatHeight(38, o.pk) + (sideRows - 1) * 6);
    return boss + 8 + block + rowsHeight(s, plan, face, o, 1);
  }
  return boss + 8 + rowsHeight(s, plan, face, o, 0);
}

function rowsHeight(s: LayoutSchema, plan: LayoutPlan, face: number, o: FitOpts, from: number) {
  const sizes = layoutSizes(plan, face);
  let h = 0;
  for (let r = from; r < s.rows; r++) {
    const xs = s.slots.filter((x) => x.area === 'stage' && x.row === r);
    if (!xs.length) continue;
    h += ROW_GAP * (r > 0 ? 1 : 0) + rowHeight(xs, plan, sizes, o);
  }
  return h;
}

function rowHeight(xs: LayoutSlot[], plan: LayoutPlan, sizes: ReturnType<typeof layoutSizes>, o: FitOpts) {
  if (xs.every((x) => x.kind === 'video')) return videoTile(plan, xs.length).h;
  const lone = xs.length === 1 && xs[0].host;
  const tallest = xs.some((x) => x.kind === 'main') ? sizes.main.size : lone ? sizes.host.size : sizes.mic.size;
  // A team row in a PK room sits in a band: padding and border (12) and the team's name over it (18 + 4).
  return seatHeight(tallest, o.pk) + (plan.bands && xs[0].team ? 34 : 0);
}

/** The mic face with which a layout fits `height` best; at most `like`'s (the room without its PK), as in fitGrid. */
export function fitLayout(s: LayoutSchema, plan: LayoutPlan, height: number, o: FitOpts = {}, like?: Fitted): Fitted {
  const face = fitFace((f) => layoutHeight(s, plan, f, o), height, like ? Math.min(plan.maxFace, like.face) : plan.maxFace);
  return { face, host: hostFaceOf(face), slot: plan.micW, cols: 0, height: layoutHeight(s, plan, face, o) };
}
