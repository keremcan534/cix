// Gift and entry videos, downloaded from the server and kept on the phone (server/api/fx.mjs; the list comes with
// the live catalog, lib/live/catalog-live `fx`). They used to be built into the app, which made every APK and every
// over-the-air update bigger with each new gift. Each clip is fetched once into the app's own folder (documents/fx,
// so the system doesn't throw it away under storage pressure the way it empties the cache) and again only when its
// version changes; a clip nothing lists any more is deleted.
//
// Fetching ahead: one clip at a time in the background after the catalog is read, unless Düşük veri modu is on;
// then a clip is fetched the first time it's needed. A clip that isn't on the phone yet plays the code-drawn effect
// instead (components/fx/video-fx), so a gift is never held up by a download.
import * as FileSystem from 'expo-file-system/legacy';
import { useSyncExternalStore } from 'react';

import { fxFileName, planFxSync, type FxKind, type FxVideo } from '@/lib/fx-videos-core';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? '';
const DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}fx/` : null;
/** After a failed download the same clip is not tried again for this long (no network, a full disk). */
const RETRY_MS = 10 * 60_000;

export type FxMedia = { uri: string; ms: number };
export type FxState = { list: FxVideo[]; ready: ReadonlySet<string>; loading: ReadonlySet<string> };

let state: FxState = { list: [], ready: new Set(), loading: new Set() };
let prefetch = false;
let scanned = false;
const listeners = new Set<() => void>();
const set = (next: Partial<FxState>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
/** The list, the clips on the phone and the ones downloading now, for a screen (Ayarlar › Hediye ve giriş efektleri). */
export const useFxState = () => useSyncExternalStore(subscribe, () => state, () => state);

const failed = new Map<string, number>();
const queue: FxVideo[] = [];
let running = false;

/** Puts a clip in line (first when a gift needs it now); never twice, never right after it failed. */
function want(v: FxVideo, first = false) {
  const name = fxFileName(v);
  if (!DIR || !BASE || !name || state.ready.has(name) || state.loading.has(name)) return;
  if (Date.now() - (failed.get(name) ?? -Infinity) < RETRY_MS) return;
  set({ loading: new Set(state.loading).add(name) });
  if (first) queue.unshift(v);
  else queue.push(v);
  void pump();
}

async function pump() {
  if (running || !DIR) return;
  running = true;
  try {
    for (let v = queue.shift(); v; v = queue.shift()) {
      const name = fxFileName(v);
      const part = `${DIR}${name}.part`;
      let ok = false;
      try {
        await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
        const r = await FileSystem.downloadAsync(`${BASE}${v.url}`, part);
        const info = r.status === 200 ? await FileSystem.getInfoAsync(part) : null;
        // A cut-off download is never played: only a whole file of the listed size becomes the clip.
        if (info?.exists && info.size === v.bytes) {
          await FileSystem.moveAsync({ from: part, to: `${DIR}${name}` });
          ok = true;
        }
      } catch {
        // Offline or no room on the phone: the effect plays drawn, and the clip is tried again later.
      }
      if (!ok) {
        failed.set(name, Date.now());
        await FileSystem.deleteAsync(part, { idempotent: true }).catch(() => {});
      }
      const loading = new Set(state.loading);
      loading.delete(name);
      set(ok ? { loading, ready: new Set(state.ready).add(name) } : { loading });
    }
  } finally {
    running = false;
  }
}

let syncing: Promise<void> | null = null;
let again = false;
/** Matches the folder to the list: deletes what's no longer listed, fetches what's missing (when it may fetch ahead). */
function sync(): Promise<void> {
  if (syncing) {
    again = true;
    return syncing;
  }
  syncing = (async () => {
    do {
      again = false;
      if (!DIR) return;
      await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
      const have = await FileSystem.readDirectoryAsync(DIR).catch(() => [] as string[]);
      const { fetch, drop } = planFxSync(state.list, have, prefetch, state.loading);
      const dropped = new Set(drop);
      scanned = true;
      set({ ready: new Set(have.filter((n) => !dropped.has(n) && !n.endsWith('.part'))) });
      await Promise.all(drop.map((n) => FileSystem.deleteAsync(`${DIR}${n}`, { idempotent: true }).catch(() => {})));
      fetch.forEach((v) => want(v));
    } while (again);
  })().finally(() => (syncing = null));
  return syncing;
}

/**
 * The clips the server lists now and whether they may be fetched ahead; called by components/fx/video-fx
 * FxVideoSync whenever either changes. Null (no catalog read yet, or an older server) leaves the folder as it is:
 * only a list the server sent may delete a clip.
 */
export function setFxVideos(list: FxVideo[] | null, opts: { prefetch: boolean }) {
  if (!DIR || !BASE) return;
  prefetch = opts.prefetch;
  if (!list) return;
  set({ list });
  void sync();
}

/**
 * The clip a gift or entry effect plays, when it is on the phone: a file address and its length. Null otherwise;
 * a listed clip that isn't here yet starts downloading, so the next one plays it.
 */
export function fxMedia(kind: FxKind, id: string): FxMedia | null {
  const v = state.list.find((x) => x.kind === kind && x.id === id);
  if (!v || !DIR) return null;
  const name = fxFileName(v);
  if (state.ready.has(name)) return { uri: `${DIR}${name}`, ms: v.ms };
  // Before the first look into the folder the clip may well be there: the look comes first, then the download.
  // Called while a room draws, so the line (and the screens that watch it) changes after that.
  if (scanned) setTimeout(() => want(v, true), 0);
  return null;
}

/** Downloads one clip now if it's missing (the admins' preview); resolves with it, or null when it couldn't come. */
export async function fetchFxNow(kind: FxKind, id: string): Promise<FxMedia | null> {
  const v = state.list.find((x) => x.kind === kind && x.id === id);
  if (!v || !DIR) return null;
  if (!scanned) await sync();
  const name = fxFileName(v);
  if (!state.ready.has(name)) {
    failed.delete(name);
    want(v, true);
    await new Promise<void>((done) => {
      const off = subscribe(() => {
        if (!state.loading.has(name)) {
          off();
          done();
        }
      });
      if (!state.loading.has(name)) {
        off();
        done();
      }
    });
  }
  return state.ready.has(name) ? { uri: `${DIR}${name}`, ms: v.ms } : null;
}
