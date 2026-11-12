// Şeffaf video testi (POC, Yönetim): the four test clips, the stacked format's arithmetic (the same as the
// Android renderer's aspect fit), each overlay's offset and the readout's FPS. Pure: no React, no native code.

export type AlphaVariantKey = '720p24' | '720p30' | '1080p24' | '1080p30';
export type AlphaVariant = { key: AlphaVariantKey; label: string; height: number; fps: number };

/** assets/video/alpha-test/alpha_<key>.mp4: 16:9, encoded height twice the visible height, 7 s, no sound. */
export const ALPHA_VARIANTS: AlphaVariant[] = [
  { key: '720p24', label: '720p · 24', height: 720, fps: 24 },
  { key: '720p30', label: '720p · 30', height: 720, fps: 30 },
  { key: '1080p24', label: '1080p · 24', height: 1080, fps: 24 },
  { key: '1080p30', label: '1080p · 30', height: 1080, fps: 30 },
];

export const ALPHA_COUNTS = [1, 3, 5] as const;
export type AlphaCount = (typeof ALPHA_COUNTS)[number];

/** The file a variant is copied to in the cache folder (Önbellekten oynat). */
export const alphaCacheName = (key: AlphaVariantKey) => `alpha_${key}.mp4`;

/** The picture people see: the encoded frame's top half. */
export function visibleSize(encodedWidth: number, encodedHeight: number) {
  return { width: encodedWidth, height: Math.floor(encodedHeight / 2) };
}

/** Aspect-fit of the visible picture in a box, centred (Android's renderer draws its quad the same way). */
export function fitRect(boxWidth: number, boxHeight: number, videoWidth: number, videoHeight: number) {
  if (boxWidth <= 0 || boxHeight <= 0 || videoWidth <= 0 || videoHeight <= 0) return { x: 0, y: 0, width: 0, height: 0 };
  const scale = Math.min(boxWidth / videoWidth, boxHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height };
}

/** Where overlay `index` of `count` sits: a little lower and alternately left/right of the first, all in view. */
export function overlayOffset(index: number, count: number, step = 26) {
  if (count <= 1 || index <= 0) return { dx: 0, dy: 0 };
  const side = index % 2 === 1 ? 1 : -1;
  return { dx: side * Math.ceil(index / 2) * (step / 2), dy: index * step };
}

/** Frames per second over the last `windowMs` of requestAnimationFrame timestamps (ms); 0 with fewer than 2. */
export function fpsOf(stamps: number[], now: number, windowMs = 1000) {
  const recent = stamps.filter((t) => now - t <= windowMs);
  if (recent.length < 2) return 0;
  const span = recent[recent.length - 1] - recent[0];
  return span > 0 ? Math.round(((recent.length - 1) * 1000) / span) : 0;
}

/** Mount → onReady times: "–" until one arrives, else the average and slowest (ms). */
export function readySummary(ms: number[]) {
  if (!ms.length) return '–';
  const avg = Math.round(ms.reduce((a, b) => a + b, 0) / ms.length);
  const max = Math.round(Math.max(...ms));
  return ms.length === 1 ? `${avg} ms` : `ort. ${avg} ms · en yavaş ${max} ms`;
}
