// The bond line between two bonded people sitting side by side on the mics (components/room/room-bonds,
// docs/BAGLAR.md), from Lv1, drawn in two parts so it passes BEHIND both their frames with its mark IN FRONT of both
// (Güncelleme 7, madde 13: it ran over the left frame and under the right one). A row's seats are siblings drawn left
// to right, so:
//  - the LEFT seat draws the line first, before its own face: its frame covers the line's left end, and the right
//    seat, drawn later, covers its right end;
//  - the RIGHT seat draws the mark last, after its own face: nothing drawn later reaches it, so it is over both frames.
// The mark (components/bond-mark) is the bond kind's picture in a ring that grows with the level, with a "Lv" label.
// Pure, so the tests check which seat draws what.
import { micLinkOf, type RoomBond } from '@/data/bonds';

/** The mark's size (px) between two faces `size` px across: half a face, 24–34 px (the old knot was 16). */
export const markSize = (size: number) => Math.max(24, Math.min(34, Math.round(size * 0.5)));

/** The seat beside this one on the same mic row, and the gap between the two. */
export type Beside = { index: number; gap: number };
export type BondPart = { bond: RoomBond; gap: number };

/**
 * What seat `i` draws of its neighbours' bond lines: `line`, the line to the seat after it (`next`), and `knot`, the mark
 * of the line from the seat before it (`prev`). Both need a bond with the mic reward (Lv1 on) between the two seated people.
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

/** The mark's box inside the right seat: in the middle of the gap between the two seats, on the faces' middle line. */
export const knotBox = (size: number, gap: number) => {
  const m = markSize(size);
  return { left: -gap / 2 - m / 2, top: size / 2 - m / 2, width: m, height: m };
};
