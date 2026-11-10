// How loud each person on a mic is right now (0 silent … 1 loud), for the ring around their seat: it grows and glows
// with their voice instead of beating at a fixed pace. In a server room the voice connection reports the levels
// (lib/livekit-engine, LiveKit's active speakers); the demo's rooms make up a voice-like flicker (components/room/parts).
// The values move on the native side, so a speaking ring never redraws the room.
import { Animated, Easing, Platform } from 'react-native';

const NATIVE = Platform.OS !== 'web';
const values = new Map<string, Animated.Value>();
let fed = false;

/** One value per person (their local id: 'me' for me), shared by every seat that draws them. */
export function voiceLevel(uid: string) {
  let v = values.get(uid);
  if (!v) values.set(uid, (v = new Animated.Value(0)));
  return v;
}

/** Whether real levels arrive (a server room's voice connection): otherwise a seat makes up the flicker. */
export const levelsLive = () => fed;

/**
 * A new level for a person. Quiet voices still move the ring (the square root lifts them), and the ring eases to the
 * new level, so the steps between reports (a few a second) don't show.
 */
export function reportLevel(uid: string, level: number) {
  fed = true;
  const to = Math.min(1, Math.sqrt(Math.max(0, level)) * 1.3);
  Animated.timing(voiceLevel(uid), { toValue: to, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }).start();
}
