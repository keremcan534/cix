// The room in two parts, split at the Balkon bar's lower edge (the "Balkon line"):
//   - the top: the header, the boards and banners, the mics and the Balkon bar. It never moves or changes size by
//     itself: not for the keyboard, the emoji panel, a sheet, a note over the controls or the chat. Its mics are
//     sized for the room as it is with no keyboard up (components/room/fit-stage), and only a change of the room
//     itself (the person's chat size, Küçült, a board or banner coming, a PK, another layout) sizes them again.
//   - the bottom: the chat, the notes over the controls and the controls. Everything done there stays under the
//     Balkon line: the keyboard takes room from the chat (the last lines stay in sight over the field), the emoji
//     panel lies over the chat, and a sheet opened from the bottom rises at most to the line (lib/sheet-space).
// Pure numbers, so they are unit tested; live-room and fit-stage measure and draw with them.

/** The chat's least height under the stage when nothing is over the controls (chat-feed's handle, tabs and a line). */
export const CHAT_LEAST = 96;

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

/**
 * The stage's height: what it holds (boards and mics as drawn), at most what leaves the chat its least under the
 * Balkon bar; past that it scrolls. `floor`: a stage that is never made shorter than this (a team PK's arena), as
 * long as it holds that much.
 */
export function stageHeight(holds: number, box: number, bar: number, floor = 0) {
  const most = Math.max(0, box - bar - CHAT_LEAST);
  return Math.round(Math.max(Math.min(holds, most), Math.min(holds, floor)));
}

/**
 * How far a sheet opened over the room may rise: the height from the screen's bottom up to the Balkon line. The room
 * draws edge to edge, as do its sheets (Modal), so: the room's height (`roomH`, between the status and navigation
 * bars) and the navigation bar under it, less the header and the stage with its Balkon bar (`line`). Null until
 * measured.
 */
export const sheetSpace = (roomH: number, bottomInset: number, headerH: number, line: number) =>
  roomH > 0 && headerH > 0 && line > 0 ? Math.max(0, Math.round(roomH + bottomInset - headerH - line)) : null;

/** A bottom sheet's maxHeight: `share` of the screen; over a room never above its Balkon line (`space`). */
export const sheetMax = (share: number, screenH: number, space: number | null): number | `${number}%` =>
  space ? Math.min(space, Math.round(screenH * share)) : `${Math.round(share * 100)}%`;
