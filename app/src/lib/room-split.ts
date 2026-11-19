// The room in two parts, split at the Balkon bar's lower edge (the "Balkon line"):
//   - the top: the header, the boards and banners, the mics and the Balkon bar. It never moves or changes size by
//     itself: not for the keyboard, the emoji panel, a sheet, a note over the controls or the chat. Its mics are
//     sized for the room as it is with no keyboard up (components/room/fit-stage), and only a change of the room
//     itself (the person's chat size, Küçült, a board or banner coming, a PK, another layout) sizes them again.
//   - the bottom: the chat, the notes over the controls and the controls. Everything done there stays under the
//     Balkon line: the keyboard takes room from the chat (the last lines stay in sight over the field), the emoji
//     panel lies over the chat, and a sheet opened from the bottom rises to the line (lib/sheet-space), or a little
//     past it on a short, crowded phone, where the line would leave the sheet no room for its rows (SHEET_LEAST).
// Pure numbers, so they are unit tested; live-room and fit-stage measure and draw with them.

/** The chat's least height under the stage when nothing is over the controls (chat-feed's handle, tabs and a line). */
export const CHAT_LEAST = 104;
/**
 * The height the mics leave the chat when they can get smaller for it (two whole messages under its tabs). The rows
 * are still chosen at CHAT_LEAST, so a short phone keeps full rows and only the faces give way.
 */
export const CHAT_ROOM = 160;

/**
 * A height measured on screen that a keyboard may change (a window that shrinks for it): while a keyboard is up only
 * a taller value is taken, so the room as it is without the keyboard is kept.
 */
export const steadyNext = (old: number, measured: number, keyboardUp: boolean) => (keyboardUp && measured < old ? old : measured);

/**
 * What the stage, the Balkon bar and the chat share with no keyboard up: the room (under the status bar, over the
 * navigation bar) less its header and its controls. 0 until all three are measured. Notes that come over the
 * controls (a mute, a refused line, @ names) take room from the chat, never from the mics.
 */
export const steadyBox = (roomH: number, headerH: number, controlsH: number) => (roomH > 0 && headerH > 0 && controlsH > 0 ? Math.max(0, roomH - headerH - controlsH) : 0);

/** Under the mics, inside the stage. */
export const STAGE_PAD = 4;

/**
 * The mics' sizes on the stage: the same in every room and for every mic count (lib/seat-fit FACE_STD) as long as the
 * stage can hold them with the chat at its least, so a change of the mic count or the layout only adds or takes rows
 * (the owners, Nov 2026: seats shrinking to leave the chat its chosen height opened wide gaps between them). As they
 * are with no boards and no PK (`calm`; `fit` when there's no PK), with the chat's least height deciding the rows and
 * CHAT_ROOM the faces: on a short phone the faces get smaller so the chat shows whole messages. Boards and banners, a
 * PK's board and the points under the names take from the same height. `fit(height, like)` sizes them for a height,
 * in `like`'s columns with faces at most its size. `box`: the room's steady share (steadyBox), so a keyboard, the emoji
 * panel or a note over the controls never comes into it.
 */
export function fitMics<F>(fit: (height: number, like?: F) => F, calm: ((height: number) => F) | null | undefined, box: number, bar: number, basis: number, boards: number): F {
  const least = box - bar - STAGE_PAD - Math.min(basis, CHAT_LEAST);
  const most = box - bar - STAGE_PAD - Math.min(basis, CHAT_ROOM);
  return fit(most - boards, (calm ?? fit)(least));
}

/**
 * The stage's height: what it holds (boards and mics as drawn), at most what leaves the chat `leave` under the
 * Balkon bar (its least for fitted mics, which are sized for the rest anyway; its chosen height for a stage that
 * isn't fitted, a team PK's arena); past that it scrolls. `floor`: never shorter than this while it holds that much.
 */
export function stageHeight(holds: number, box: number, bar: number, leave = CHAT_LEAST, floor = 0) {
  const most = Math.max(0, box - bar - Math.max(leave, CHAT_LEAST));
  return Math.round(Math.max(Math.min(holds, most), Math.min(holds, floor)));
}

/** The least a sheet over the room may have: below this its head and foot leave no room for its rows or rules. */
export const SHEET_LEAST = 400;

/**
 * How far a sheet opened over the room may rise: the height from the screen's bottom up to the Balkon line, and never
 * less than SHEET_LEAST (on a short phone with many mics the sheet then covers the last row of mics while it is open).
 * The room draws edge to edge, as do its sheets (Modal), so: the room's height (`roomH`, between the status and
 * navigation bars) and the navigation bar under it, less the header and the stage with its Balkon bar (`line`). Null
 * until measured.
 */
export const sheetSpace = (roomH: number, bottomInset: number, headerH: number, line: number) =>
  roomH > 0 && headerH > 0 && line > 0 ? Math.max(SHEET_LEAST, Math.round(roomH + bottomInset - headerH - line)) : null;

/** A bottom sheet's maxHeight: `share` of the screen; over a room never above its Balkon line (`space`). */
export const sheetMax = (share: number, screenH: number, space: number | null): number | `${number}%` =>
  space ? Math.min(space, Math.round(screenH * share)) : `${Math.round(share * 100)}%`;
