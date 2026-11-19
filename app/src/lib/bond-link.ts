// The Lv4 bond line between two bonded people sitting side by side on the mics (components/room/room-bonds,
// docs/BAGLAR.md), drawn in two parts so it passes BEHIND both their frames with its knot IN FRONT (Güncelleme 7, madde
// 13: it ran over the left frame and under the right one). A row's seats are siblings drawn left to right, so:
//  - the LEFT seat draws the line first, before its own face: its frame covers the line's left end, and the right
//    seat, drawn later, covers its right end;
//  - the RIGHT seat draws the knot last, after its own face: nothing drawn later reaches it, so it is over both frames.
// Pure, so the tests check which seat draws what.
import { micLinkOf, type RoomBond } from '@/data/bonds';

/** The knot's size (px): the bond kind's icon in its colour. */
export const KNOT = 16;

/** The seat beside this one on the same mic row, and the gap between the two. */
export type Beside = { index: number; gap: number };
export type BondPart = { bond: RoomBond; gap: number };

/**
 * What seat `i` draws of its neighbours' bond lines: `line`, the line to the seat after it (`next`), and `knot`, the knot
 * of the line from the seat before it (`prev`). Both need a bond with the Lv4 reward between the two seated people.
 */
export function bondParts(list: readonly RoomBond[], seats: readonly (string | null)[], i: number, next?: Beside, prev?: Beside): { line: BondPart | null; knot: BondPart | null } {
  const line = next ? micLinkOf([...list], seats[i], seats[next.index]) : null;
  const knot = prev ? micLinkOf([...list], seats[prev.index], seats[i]) : null;
  return { line: line && next ? { bond: line, gap: next.gap } : null, knot: knot && prev ? { bond: knot, gap: prev.gap } : null };
}

/**
 * The line's box inside the left seat (a face `size` px, row `gap`): from the edge of its face to the edge of the next
 * seat's face, through the faces' middle. `left` / `right` are shares of the seat's width (the next seat is as wide).
 */
export const lineBox = (size: number, gap: number) => ({ left: '50%' as const, right: '-50%' as const, top: size / 2 - 1.5, height: 3, marginLeft: size / 2 - 1, marginRight: size / 2 - 1 - gap });

/** The knot's box inside the right seat: in the middle of the gap between the two seats, on the faces' middle line. */
export const knotBox = (size: number, gap: number) => ({ left: -gap / 2 - KNOT / 2, top: size / 2 - KNOT / 2, width: KNOT, height: KNOT });
