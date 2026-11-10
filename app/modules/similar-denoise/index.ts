// "Mikrofon denoise" (AI, Android): RNNoise on the phone's mic (android/, AiDenoise), cleaning background noise
// (fans, traffic, keyboards, a TV) from every voice this phone sends. Not on iOS or the web: there it does nothing
// and the voice engine's own noise suppression stays as it was.
import { requireOptionalNativeModule } from 'expo';

const native = requireOptionalNativeModule<{ setEnabled(on: boolean): boolean }>('SimilarDenoise');

/** On or off; true once it is in the mic's path (it attaches once the voice engine has started). */
export function setAiDenoise(on: boolean): boolean {
  try {
    return native?.setEnabled(on) ?? false;
  } catch {
    return false;
  }
}
