// Phone build: @livekit/react-native's WebRTC globals and audio session, shared by the voice rooms
// (voice-setup.ts) and 1v1 calls (call-media.ts). registerGlobals patches globals, so it runs once.
import { AudioSession, registerGlobals } from '@livekit/react-native';
import { AppState } from 'react-native';

import { startRoomService, stopRoomService } from '../../modules/similar-room-service';

let registered = false;
export function ensureWebRtc() {
  if (registered) return;
  registered = true;
  registerGlobals();
}

// The audio session is on while a room or a call holds it, and stops when the last one lets go. On Android a
// foreground service (modules/similar-room-service, a "room is open" notification) runs alongside it, so the voices and
// the mic keep going while the app is in the background. It starts here, while the app is on screen (rooms and calls
// are opened from the screen), as Android allows a mic service only then.
const holders = new Set<string>();
let service = false;
const NOTE_TITLE = 'Similar Club';
const NOTE_ROOM = 'Odadasın · ses ve mikrofon açık';
const NOTE_CALL = 'Görüşme sürüyor';
export async function holdAudio(who: 'room' | 'call') {
  const first = holders.size === 0;
  holders.add(who);
  if (!first) return;
  service = startRoomService(NOTE_TITLE, who === 'call' ? NOTE_CALL : NOTE_ROOM);
  await AudioSession.startAudioSession();
}
export async function releaseAudio(who: 'room' | 'call') {
  if (!holders.delete(who) || holders.size > 0) return;
  if (service) stopRoomService();
  service = false;
  await AudioSession.stopAudioSession();
}

/** The room keeps playing and the mic keeps sending while the app is in the background (the service runs). */
export const audioInBackground = () => service;

/**
 * The mic just started. Without the mic permission the service started for sound only (Android refuses a mic service
 * without it), so it is started again now that the mic runs: from then on the mic keeps sending in the background too.
 */
export function micStarted() {
  if (!service || AppState.currentState !== 'active') return;
  startRoomService(NOTE_TITLE, holders.has('call') ? NOTE_CALL : NOTE_ROOM);
}

/** Remote voices play by themselves on a phone. */
export const playRemote = (_track: { attach: () => unknown; detach: () => unknown }) => () => {};
