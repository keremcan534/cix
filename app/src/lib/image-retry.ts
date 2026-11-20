// A face or cover that failed to load is tried again before its fallback stays (Güncelleme 7, item 1): photos come
// through the API (server/api/media.mjs), which answers 502 when the storage is slow and 429 when busy, and one such
// answer used to leave a face blank until the screen was opened again. The same address is tried after 3 s, then
// 20 s; meanwhile the fallback (initial, glyph or scene) shows. Pure, so it is unit tested (tests/image-retry.test.ts).

export const IMAGE_RETRY_MS = [3_000, 20_000];

/** After the `fails`-th failed load of one address: wait this long and try again, or null (keep the fallback). */
export const retryAfter = (fails: number): number | null => (fails >= 1 ? (IMAGE_RETRY_MS[fails - 1] ?? null) : null);

/** One address's loading: how many times it failed, and whether a retry is waiting (the fallback shows meanwhile). */
export type ImageTry = { uri: string | undefined; fails: number; waiting: boolean };
export const freshTry = (uri: string | undefined): ImageTry => ({ uri, fails: 0, waiting: false });

/** The state after a failed load of `uri` (a new address starts over). */
export function failedTry(prev: ImageTry, uri: string | undefined): ImageTry {
  const fails = (prev.uri === uri ? prev.fails : 0) + 1;
  return { uri, fails, waiting: retryAfter(fails) !== null };
}

/** Whether the picture itself is drawn now (else the fallback): an address, no retry waiting, not given up. */
export const showsImage = (t: ImageTry, uri: string | undefined) => {
  const cur = t.uri === uri ? t : freshTry(uri);
  return !!uri && !cur.waiting && (cur.fails === 0 || retryAfter(cur.fails) !== null);
};
