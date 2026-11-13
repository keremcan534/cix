// Web: the browser has WebRTC and no audio session; remote voices need a hidden <audio> element each.
export const ensureWebRtc = () => {};
export const holdAudio = async (_who: 'room' | 'call') => {};
export const releaseAudio = async (_who: 'room' | 'call') => {};
/** The browser tab keeps its voices while hidden; nothing to start for the mic. */
export const audioInBackground = () => false;
export const micStarted = () => {};

/** Plays a remote voice; returns what removes it again. */
export function playRemote(track: { attach: () => unknown; detach: () => unknown }) {
  const el = track.attach() as HTMLMediaElement;
  el.style.display = 'none';
  document.body.appendChild(el);
  return () => {
    track.detach();
    el.remove();
  };
}
