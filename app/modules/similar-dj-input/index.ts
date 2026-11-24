// DJ modu (Android): the phone's sound inputs (a USB/OTG sound card, a mixer's cable, a wired headset, the phone's mic)
// and the one the voice engine records the mic from (android/, DjInput). Not on iOS or the web: there the phone or the
// browser picks (the web build passes the browser's device id to the engine instead, lib/livekit-engine).
import { requireOptionalNativeModule } from 'expo';

export type DjInputKind = 'usb' | 'line' | 'wired' | 'phone' | 'bluetooth' | 'other';
export type DjInputDevice = { id: number; kind: DjInputKind; name: string };

const native = requireOptionalNativeModule<{ inputs(): unknown; prefer(id: number): boolean }>('SimilarDjInput');
const KINDS: readonly DjInputKind[] = ['usb', 'line', 'wired', 'phone', 'bluetooth', 'other'];

/** This build can pick the input (an Android APK with the module). */
export const djInputAvailable = () => native !== null;

/** The phone's inputs now; [] without the module or when they can't be read. */
export function djInputs(): DjInputDevice[] {
  try {
    const list = native?.inputs();
    if (!Array.isArray(list)) return [];
    return list.flatMap((x): DjInputDevice[] => {
      if (!x || typeof x !== 'object') return [];
      const r = x as Record<string, unknown>;
      if (typeof r.id !== 'number') return [];
      const kind = KINDS.includes(r.kind as DjInputKind) ? (r.kind as DjInputKind) : 'other';
      return [{ id: r.id, kind, name: typeof r.name === 'string' ? r.name : '' }];
    });
  } catch {
    return [];
  }
}

/** Records the mic from input `id` from the next time it opens (-1: the phone's choice). True when the engine took it. */
export function preferDjInput(id: number): boolean {
  try {
    return native?.prefer(id) ?? false;
  } catch {
    return false;
  }
}
