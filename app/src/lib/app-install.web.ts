// The web build has no APK to update (lib/app-update finds no build number there): a link only opens in the browser.
import { useSyncExternalStore } from 'react';

import type { Update } from '@/lib/app-update';

export type InstallState =
  | { phase: 'idle' }
  | { phase: 'downloading'; build: number; progress: number }
  | { phase: 'installing'; build: number }
  | { phase: 'failed'; build: number; error: string };

const IDLE: InstallState = { phase: 'idle' };
export const useInstallState = () => useSyncExternalStore(() => () => {}, () => IDLE, () => IDLE);
export const cleanOldDownloads = async () => {};
export const installUpdate = async (u: Update) => void window.open(u.url, '_blank');
