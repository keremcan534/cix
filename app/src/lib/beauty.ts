// Güzellik filtresi in video calls (modules/similar-beauty): the level I chose, kept on this phone. Women see the
// control on their video call screen; for everyone else the filter stays off.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { setBeautyStrength } from '../../modules/similar-beauty';

export const BEAUTY_LEVELS = [
  { name: 'Kapalı', strength: 0 },
  { name: 'Hafif', strength: 35 },
  { name: 'Orta', strength: 65 },
  { name: 'Güçlü', strength: 100 },
] as const;

const KEY = 'similarclub:beauty:v1';
// Light by default: the filter is there from the first call, and one tap changes or turns it off.
let level = 1;
const listeners = new Set<() => void>();
void AsyncStorage.getItem(KEY)
  .then((v) => {
    const n = Number(v);
    if (v !== null && Number.isInteger(n) && n >= 0 && n < BEAUTY_LEVELS.length && n !== level) {
      level = n;
      listeners.forEach((l) => l());
    }
  })
  .catch(() => {});

export function useBeautyLevel() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => level,
    () => level,
  );
}

/** The next level (Kapalı → Hafif → Orta → Güçlü → Kapalı), kept for the next calls. */
export function nextBeautyLevel() {
  level = (level + 1) % BEAUTY_LEVELS.length;
  void AsyncStorage.setItem(KEY, String(level)).catch(() => {});
  listeners.forEach((l) => l());
  return level;
}

/** Sends the strength to the camera's filter: mine when the filter is mine to use, else off. */
export function applyBeautyStrength(on: boolean, lvl: number) {
  setBeautyStrength(on ? (BEAUTY_LEVELS[lvl]?.strength ?? 0) : 0);
}
