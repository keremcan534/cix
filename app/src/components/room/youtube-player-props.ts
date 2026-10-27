import type { PlaybackState } from '@/lib/room-modes';

/**
 * Shared YouTube player (web: IFrame Player API, native: the same API inside a WebView). The player is created
 * once per mount; a new video, play/pause and seeks are commands to the same player, never a new one.
 */
export type YouTubePlayerProps = {
  /** The room's playback state: the player follows it (drift above lib/room-modes SYNC_TOLERANCE_S is corrected). */
  playback: PlaybackState;
  /** This viewer paused for themselves: the room's play/seek is not applied until they sync again. */
  hold: boolean;
  /** This viewer muted the video for themselves. */
  muted: boolean;
  /** Facts only YouTube knows (duration, end, error), for lib/room-modes reportPlayer. */
  onReport: (r: { duration?: number; ended?: boolean; errorCode?: number }) => void;
  /** The viewer played or paused inside the player itself (not through the room's controls). */
  onUserState: (playing: boolean) => void;
  /** The platform refused to start playback without a tap (autoplay policy). */
  onBlocked: (blocked: boolean) => void;
  /** The player script couldn't load (offline, blocked). */
  onLoadError: (text: string) => void;
};
/** YT.PlayerState values. */
export const YT_STATE = { unstarted: -1, ended: 0, playing: 1, paused: 2, buffering: 3, cued: 5 } as const;
/** After our own command, state changes for this long are ours, not the viewer's (seeks can buffer and report late). */
export const OWN_COMMAND_MS = 3000;
export const DRIFT_CHECK_MS = 5000;
