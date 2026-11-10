// Güzellik filtresi (video calls, Android): skin smoothing and brightening on my camera (android/, BeautyEffect),
// at the strength I choose. The effect is a WebRTC video effect: a camera track gets it with
// `mediaStreamTrack._setVideoEffects([BEAUTY_EFFECT])`. Not on iOS or the web: there it does nothing.
import { requireOptionalNativeModule } from 'expo';

const native = requireOptionalNativeModule<{ register(): boolean; setStrength(value: number): void }>('SimilarBeauty');

/** The effect's name for `_setVideoEffects`. */
export const BEAUTY_EFFECT = 'similar-beauty';

/** Makes the effect known to WebRTC; false where there is none (iOS, web, an older app build). */
export function registerBeauty(): boolean {
  try {
    return native?.register() ?? false;
  } catch {
    return false;
  }
}

/** 0 (off) to 100. */
export function setBeautyStrength(value: number) {
  try {
    native?.setStrength(Math.max(0, Math.min(100, Math.round(value))));
  } catch {
    // No filter on this phone.
  }
}
