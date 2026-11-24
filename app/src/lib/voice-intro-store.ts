// Ses tanıtımı in the demo (no server): my clip kept on this phone only, copied out of the recorder's cache so it
// stays after a restart. In live mode the server keeps it (lib/live/voice-intro) and nothing is stored here.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import type { VoiceIntro } from '@/lib/voice-intro-core';

const KEY = 'voice-intro-demo.v1';
let mine: VoiceIntro | null = null;
let loaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      const v = raw ? (JSON.parse(raw) as Partial<VoiceIntro>) : null;
      if (v && typeof v.url === 'string' && typeof v.ms === 'number') {
        mine = { url: v.url, ms: v.ms };
        emit();
      }
    })
    .catch(() => {});
}

/** My demo clip (null for none), as the profile shows it. */
export function useDemoVoice(): VoiceIntro | null {
  load();
  return useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => mine,
    () => mine,
  );
}

/** Keeps the recorder's file as my demo clip (the one before is deleted). */
export async function keepDemoVoice(uri: string, ms: number): Promise<void> {
  let url = uri;
  if (Platform.OS !== 'web' && FileSystem.documentDirectory) {
    url = `${FileSystem.documentDirectory}voice-intro-${Date.now().toString(36)}.m4a`;
    await FileSystem.copyAsync({ from: uri, to: url });
  }
  const before = mine;
  mine = { url, ms };
  emit();
  await AsyncStorage.setItem(KEY, JSON.stringify(mine)).catch(() => {});
  if (before) void FileSystem.deleteAsync(before.url, { idempotent: true }).catch(() => {});
}

/** Takes my demo clip off (its file too). */
export async function dropDemoVoice(): Promise<void> {
  const before = mine;
  mine = null;
  emit();
  await AsyncStorage.removeItem(KEY).catch(() => {});
  if (before) void FileSystem.deleteAsync(before.url, { idempotent: true }).catch(() => {});
}
