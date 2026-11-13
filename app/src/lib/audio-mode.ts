// expo-audio's mode for our own sounds (room music, game effects): mixed with the room's voices, so they take no
// audio focus from them and the microphone stays on.
//
// On Android, setAudioModeAsync also puts the phone in normal mode with the speaker on. Done while a room or a call
// is open, that takes LiveKit out of call mode: its echo and noise cancellation stop, voices may move to the
// earpiece and you hear yourself. So on Android the mode is set once, when the app starts (before any room), and
// later asks do nothing. iOS sets it before each first player, as before.
import { setAudioModeAsync } from 'expo-audio';
import { Platform } from 'react-native';

let set = false;

export function mixWithVoices() {
  if (set && Platform.OS === 'android') return;
  set = true;
  void setAudioModeAsync({ interruptionMode: 'mixWithOthers', allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {});
}

/** At start-up, before any room or call (Android only, see above). */
export function prepareAudioMode() {
  if (Platform.OS === 'android') mixWithVoices();
}
