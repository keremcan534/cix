// Phone build: @livekit/react-native's WebRTC globals and audio session, shared by the voice rooms
// (voice-setup.ts) and 1v1 calls (call-media.ts). registerGlobals patches globals, so it runs once.
import { AudioSession, registerGlobals } from '@livekit/react-native';

import { ensureMixAudioMode } from '@/lib/audio-mode';

let registered = false;
export function ensureWebRtc() {
  if (registered) return;
  registered = true;
  registerGlobals();
}

// The audio session is on while a room or a call holds it, and stops when the last one lets go.
const holders = new Set<string>();
export async function holdAudio(who: 'room' | 'call') {
  const first = holders.size === 0;
  holders.add(who);
  // Before the session: setting the music/game-sound mode later would undo the call mode it sets (lib/audio-mode).
  await ensureMixAudioMode();
  if (first) await AudioSession.startAudioSession();
}
export async function releaseAudio(who: 'room' | 'call') {
  if (!holders.delete(who) || holders.size > 0) return;
  await AudioSession.stopAudioSession();
}

/** Remote voices play by themselves on a phone. */
export const playRemote = (_track: { attach: () => unknown; detach: () => unknown }) => () => {};
