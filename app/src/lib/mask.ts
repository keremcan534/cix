// Maske in video calls (modules/similar-beauty, MaskEffect): what covers my face on my camera so the other side can't
// recognize me, kept on this phone. Women see the control on their video call screen; for everyone else it stays off.
// While a mask is on and the phone finds no face, the whole picture goes out in big blocks (never my face).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { registerMask, setMask, type MaskKind } from '../../modules/similar-beauty';

export type { MaskKind };

export const MASKS: readonly { kind: MaskKind; name: string }[] = [
  { kind: 'off', name: 'Kapalı' },
  { kind: 'eyes', name: 'Göz maskesi' },
  { kind: 'mosaic', name: 'Mozaik yüz' },
  { kind: 'emoji', name: 'Emoji yüz' },
];

const KEY = 'similarclub:mask:v1';
// Off by default: a mask is my choice, one tap puts one on.
let kind: MaskKind = 'off';
// A choice made before the saved one is read stays.
let chosen = false;
const listeners = new Set<() => void>();
// The saved mask goes to the camera as soon as it is read, not only when the call screen opens: a call's camera can
// start a moment before that screen, and its first frames must be covered too. It only ever touches a call's camera.
void AsyncStorage.getItem(KEY)
  .then((v) => {
    const saved = MASKS.find((m) => m.kind === v)?.kind;
    if (saved && !chosen && saved !== kind) {
      kind = saved;
      setMask(saved);
      listeners.forEach((l) => l());
    }
  })
  .catch(() => {});

/** Whether this phone has the mask (an Android APK from with it on; not iOS, the web or an older APK). */
export const maskAvailable = () => registerMask();

export function useMaskKind() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => kind,
    () => kind,
  );
}

/** The mask's name on the call screen. */
export const maskName = (k: MaskKind) => MASKS.find((m) => m.kind === k)?.name ?? MASKS[0].name;

/** The next mask (Kapalı → Göz maskesi → Mozaik yüz → Emoji yüz → Kapalı), kept for the next calls. */
export function nextMaskKind(): MaskKind {
  const at = MASKS.findIndex((m) => m.kind === kind);
  kind = MASKS[(at + 1) % MASKS.length].kind;
  chosen = true;
  void AsyncStorage.setItem(KEY, kind).catch(() => {});
  listeners.forEach((l) => l());
  return kind;
}

/** Sends the mask to my camera: mine when the mask is mine to use, else off. */
export function applyMask(on: boolean, k: MaskKind) {
  setMask(on ? k : 'off');
}
