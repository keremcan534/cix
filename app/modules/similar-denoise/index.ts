// "Mikrofon denoise" (AI, Android): RNNoise on the phone's mic (android/, AiDenoise), cleaning background noise
// (fans, traffic, keyboards, a TV) from every voice this phone sends, after the phone's own noise suppression. Not on
// iOS or the web: there is no switch there, the voice engine's own noise suppression is always on.
import { requireOptionalNativeModule } from 'expo';

/** In the mic's path yet, and how many 10 ms frames it has cleaned since the app started. */
export type AiDenoiseStatus = { attached: boolean; frames: number };

const native = requireOptionalNativeModule<{ setEnabled(on: boolean): boolean; status?(): AiDenoiseStatus }>('SimilarDenoise');

/** This build has the AI denoise (an Android APK with the module). */
export const aiDenoiseAvailable = () => native !== null;

/** On or off; true once it is in the mic's path (it attaches once the voice engine has started). */
export function setAiDenoise(on: boolean): boolean {
  try {
    return native?.setEnabled(on) ?? false;
  } catch {
    return false;
  }
}

/** What it reports; null without it (or from an APK older than status()). */
export function aiDenoiseStatus(): AiDenoiseStatus | null {
  try {
    return native?.status?.() ?? null;
  } catch {
    return null;
  }
}
