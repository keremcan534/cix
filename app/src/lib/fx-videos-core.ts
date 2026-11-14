// The pure part of the gift and entry videos the server hands out (GET /api/catalog `fx`, server/api/fx.mjs):
// reading the list without trusting it, the name each clip is kept under on the phone, and what to fetch or
// delete. lib/fx-videos does the downloading.

export type FxKind = 'gift' | 'entry';
/** One clip: which gift (data/mock GIFTS id) or entry effect (COSMETICS `fx`) plays it, where it is, its size and length. */
export type FxVideo = { kind: FxKind; id: string; url: string; bytes: number; ms: number };

const ID = /^[A-Za-z0-9_-]{1,32}$/;
const URL_OF = /^\/api\/fx\/([a-z0-9-]{1,64})\.mp4\?v=([0-9a-f]{6,64})$/;
/** Nothing the server lists is near this; a bigger number is a mistake, not a clip to download. */
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_MS = 60_000;
const MAX_CLIPS = 200;

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const whole = (x: unknown, max: number) => (typeof x === 'number' && Number.isSafeInteger(x) && x > 0 && x <= max ? x : 0);

/** The server's list; a malformed entry is left out, a missing list is null (an older server, or an old saved copy). */
export function parseFxList(raw: unknown): FxVideo[] | null {
  if (!Array.isArray(raw)) return null;
  const out: FxVideo[] = [];
  const seen = new Set<string>();
  for (const x of raw.slice(0, MAX_CLIPS)) {
    const o = obj(x);
    const kind = o.kind === 'gift' || o.kind === 'entry' ? o.kind : null;
    if (!kind || typeof o.id !== 'string' || !ID.test(o.id) || typeof o.url !== 'string' || !URL_OF.test(o.url)) continue;
    const bytes = whole(o.bytes, MAX_BYTES);
    if (!bytes || seen.has(`${kind}:${o.id}`)) continue;
    seen.add(`${kind}:${o.id}`);
    out.push({ kind, id: o.id, url: o.url, bytes, ms: whole(o.ms, MAX_MS) });
  }
  return out;
}

/** The file a clip is kept under: its name and its version, so a changed clip is a new file and the old one goes. */
export function fxFileName(v: FxVideo): string {
  const m = URL_OF.exec(v.url);
  return m ? `${m[1]}-${m[2]}.mp4` : '';
}

/**
 * What to do with the phone's clip folder: the listed clips not there yet (only when it may fetch ahead; otherwise
 * each one comes the first time it is needed) and the files nothing lists any more, half downloads included. Files
 * being written now (`busy`) are left alone. A file two entries share is fetched once.
 */
export function planFxSync(list: FxVideo[], have: string[], prefetch: boolean, busy: ReadonlySet<string> = new Set()): { fetch: FxVideo[]; drop: string[] } {
  const want = new Map<string, FxVideo>();
  for (const v of list) {
    const name = fxFileName(v);
    if (name && !want.has(name)) want.set(name, v);
  }
  const there = new Set(have);
  const drop = have.filter((n) => !want.has(n) && !busy.has(n.replace(/\.part$/, '')));
  const fetch = prefetch ? [...want].filter(([n]) => !there.has(n) && !busy.has(n)).map(([, v]) => v) : [];
  return { fetch, drop };
}

/** How long a clip may take before the next effect comes anyway: its length and a margin, 8 s when unknown. */
export const fxSafetyMs = (ms: number) => (ms > 0 ? Math.min(ms + 3000, MAX_MS) : 8000);
