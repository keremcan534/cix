// "Güncelle": the side-loaded APK fetches its newer build (lib/app-update) into the app's cache with a progress bar,
// then opens Android's installer on it; the phone shows its own "Güncelle" screen and keeps the app's data. Nothing
// lands in Downloads: the file is the app's, and the next start deletes it. Android allows this with the
// REQUEST_INSTALL_PACKAGES permission (plugins/with-app-self-update); the first time, it asks to allow installs from
// Similar Club.
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { useSyncExternalStore } from 'react';
import { Linking, Platform } from 'react-native';

import type { Update } from '@/lib/app-update';

export type InstallState =
  | { phase: 'idle' }
  | { phase: 'downloading'; build: number; progress: number }
  | { phase: 'installing'; build: number }
  | { phase: 'failed'; build: number; error: string };

let state: InstallState = { phase: 'idle' };
const listeners = new Set<() => void>();
const set = (next: InstallState) => {
  state = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useInstallState = () => useSyncExternalStore(subscribe, () => state, () => state);

const PREFIX = 'similar-club-';
const fileOf = (build: number) => `${FileSystem.cacheDirectory}${PREFIX}${build}.apk`;
const INSTALL_FLAGS = 1; // Intent.FLAG_GRANT_READ_URI_PERMISSION: the installer may read our file.

/** Earlier downloads (installed or given up): removed at start, so no APK stays on the phone. */
export async function cleanOldDownloads() {
  if (Platform.OS !== 'android' || !FileSystem.cacheDirectory) return;
  try {
    const names = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
    await Promise.all(names.filter((n) => n.startsWith(PREFIX) && n.endsWith('.apk')).map((n) => FileSystem.deleteAsync(FileSystem.cacheDirectory + n, { idempotent: true })));
  } catch {
    // Nothing to clean, or the cache is not readable: the system clears it on its own.
  }
}

let running: Promise<void> | null = null;
/** Downloads the update (once, even when tapped twice) and opens the installer; the browser where that can't work. */
export function installUpdate(u: Update): Promise<void> {
  if (Platform.OS !== 'android' || !u.url.endsWith('.apk')) return Linking.openURL(u.url).then(() => {}, () => {});
  running ??= (async () => {
    const target = fileOf(u.build);
    try {
      set({ phase: 'downloading', build: u.build, progress: 0 });
      const have = await FileSystem.getInfoAsync(target);
      if (!have.exists || !have.size) {
        const task = FileSystem.createDownloadResumable(u.url, target, {}, (p) => {
          const total = p.totalBytesExpectedToWrite;
          if (total > 0) set({ phase: 'downloading', build: u.build, progress: Math.min(1, p.totalBytesWritten / total) });
        });
        const r = await task.downloadAsync();
        if (!r || r.status !== 200) throw new Error('İndirme yarıda kaldı');
      }
      set({ phase: 'installing', build: u.build });
      const uri = await FileSystem.getContentUriAsync(target);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: uri, flags: INSTALL_FLAGS, type: 'application/vnd.android.package-archive' });
      // Back from the installer without updating (Vazgeç): the button is there again; the file stays for a retry.
      set({ phase: 'idle' });
    } catch (e) {
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
      set({ phase: 'failed', build: u.build, error: e instanceof Error && e.message ? e.message : 'Güncelleme indirilemedi' });
    } finally {
      running = null;
    }
  })();
  return running;
}
