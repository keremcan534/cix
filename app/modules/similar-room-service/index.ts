// Oda sesi arka planda (Android): a foreground service with a "room is open" notification keeps the room's voice and
// the mic running while the app is in the background. Not on iOS (background audio mode, app.json) or the web.
import { requireOptionalNativeModule } from 'expo';

const native = requireOptionalNativeModule<{ start(title: string, text: string): boolean; stop(): boolean }>('SimilarRoomService');

/** This build can keep a room's audio going in the background. */
export const roomServiceAvailable = !!native;

/** Start while the app is on screen (Android allows a mic service only then); true once it runs. */
export function startRoomService(title: string, text: string): boolean {
  try {
    return native?.start(title, text) ?? false;
  } catch {
    return false;
  }
}

export function stopRoomService() {
  try {
    native?.stop();
  } catch {
    // Already stopped.
  }
}
