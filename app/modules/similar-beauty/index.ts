// Güzellik filtresi and Maske (video calls, Android), both on my camera: skin smoothing and brightening at the strength
// I choose (android/, BeautyEffect), then the mask I choose so I can't be recognized (MaskEffect: a masquerade over the
// eyes, the face in big blocks, or an emoji over it; while the phone finds no face, the whole picture goes in blocks).
// They are WebRTC video effects: a camera track gets them with `mediaStreamTrack._setVideoEffects(videoEffects())`.
// Not on iOS or the web: there they do nothing.
import { requireOptionalNativeModule } from 'expo';

/** What covers my face: nothing, a masquerade over the eyes, the face in big blocks, an emoji over it. */
export type MaskKind = 'off' | 'eyes' | 'mosaic' | 'emoji';

// registerMask and setMask are missing in an APK from before the mask (a newer JS update can run on it).
const native = requireOptionalNativeModule<{
  register(): boolean;
  setStrength(value: number): void;
  registerMask?(): boolean;
  setMask?(kind: MaskKind): void;
}>('SimilarBeauty');

/** The effects' names for `_setVideoEffects`. */
export const BEAUTY_EFFECT = 'similar-beauty';
export const MASK_EFFECT = 'similar-mask';

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

/**
 * Makes the mask known to WebRTC; false where there is none (iOS, web, an APK from before it). The mask runs right
 * after the beauty filter on my camera (it takes over the frame the filter hands on), so it is there only with it.
 */
export function registerMask(): boolean {
  try {
    return registerBeauty() && (native?.registerMask?.() ?? false);
  } catch {
    return false;
  }
}

/** The mask on my camera from its next frame ('off': the frames pass untouched). */
export function setMask(kind: MaskKind) {
  try {
    native?.setMask?.(kind);
  } catch {
    // No mask on this phone.
  }
}

/** My camera's effects in a call, in their order (the mask right after the beauty filter); null without any. */
export function videoEffects(): string[] | null {
  if (!registerBeauty()) return null;
  return registerMask() ? [BEAUTY_EFFECT, MASK_EFFECT] : [BEAUTY_EFFECT];
}
