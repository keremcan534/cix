// The app's expo-audio mode (room music, game sounds): mixed with the room's voices, never taking the microphone
// away. It is set ONCE per app run, before the first voice room or call starts its audio session, and never again:
// on Android expo-audio's setAudioModeAsync also sets the phone's AudioManager mode to MODE_NORMAL (it only knows
// "earpiece or not"). Called while a room holds the session, it took the phone out of the call mode LiveKit had set,
// so echo cancellation and voice processing stopped: after music started, speakers sounded broken and echoed until
// the room was joined again. expo-audio keeps the interruption mode for every later player, so once is enough.
import { setAudioModeAsync } from 'expo-audio';

let set: Promise<void> | null = null;
export function ensureMixAudioMode() {
  set ??= setAudioModeAsync({ interruptionMode: 'mixWithOthers', allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {});
  return set;
}
