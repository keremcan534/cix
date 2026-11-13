// Cameras of a server room's camera seats (görüntülü yuva, the Video layouts): the LiveKit engine
// (lib/livekit-engine) reports whose camera is live, by LiveKit identity ('me' for this phone), and the stage draws
// them (components/room/stage-layout). No LiveKit import here, so Node tests can load it.
import { useSyncExternalStore } from 'react';

import type { TrackRef } from '@/lib/call-media';

let cams: ReadonlyMap<string, TrackRef> = new Map();
// Who has which camera track: the same list again redraws nothing.
let key = '';
const listeners = new Set<() => void>();

export function reportCams(next: Map<string, TrackRef>) {
  const k = [...next].map(([id, t]) => `${id}:${t.publication.trackSid}`).join(',');
  if (k === key) return;
  key = k;
  cams = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useRoomCams = () => useSyncExternalStore(subscribe, () => cams, () => cams);
