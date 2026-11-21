// Bağ işaretleri as staff design them in the panel (server/api/bond-looks.mjs, docs/BAGLAR.md "Panelden bağ
// işaretleri"): for each bond kind, the levels that have a design of their own. The catalog sends them when asked
// (?bondlooks=1); a level without one takes the nearest lower level's, and below the kind's first design the app draws
// its own mark (components/bond-mark.tsx). Pure: the catalog parses with it, the mark reads with it.
import { BOND_KINDS, type BondKind } from '@/data/bonds';

export type BondLookPicture = { url: string; v: string; px?: number };
/** One level's design: a still picture and/or a moving one (an animated WebP), and how big it is drawn (1–3 times). */
export type BondLook = { art?: BondLookPicture; motion?: BondLookPicture; size: number };
/** kind → level → design. */
export type BondLooks = Partial<Record<BondKind, Record<number, BondLook>>>;

const MAX_LEVEL = 20;
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});

function pictureOf(x: unknown): BondLookPicture | undefined {
  const p = obj(x);
  if (typeof p.url !== 'string' || !/^https?:\/\//.test(p.url) || p.url.length > 1000) return undefined;
  if (typeof p.v !== 'string' || !/^[0-9a-z]{1,40}$/i.test(p.v)) return undefined;
  const px = typeof p.px === 'number' && Number.isInteger(p.px) && p.px > 0 && p.px <= 4096 ? p.px : undefined;
  return { url: p.url, v: p.v, ...(px ? { px } : {}) };
}

/**
 * The catalog's `bondLooks` (or the copy kept on the phone): what doesn't parse is left out (that level draws as if
 * staff made nothing for it), so a broken answer never breaks a mark. Null when there is nothing at all.
 */
export function parseBondLooks(raw: unknown): BondLooks | null {
  const out: BondLooks = {};
  let any = false;
  for (const [kind, levels] of Object.entries(obj(raw))) {
    if (!Object.hasOwn(BOND_KINDS, kind)) continue;
    const byLevel: Record<number, BondLook> = {};
    for (const [lv, x] of Object.entries(obj(levels))) {
      const level = Number(lv);
      if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) continue;
      const d = obj(x);
      const art = pictureOf(d.art);
      const motion = pictureOf(d.motion);
      if (!art && !motion) continue;
      const size = typeof d.size === 'number' && Number.isFinite(d.size) ? Math.min(3, Math.max(1, d.size)) : 1;
      byLevel[level] = { ...(art ? { art } : {}), ...(motion ? { motion } : {}), size };
      any = true;
    }
    if (Object.keys(byLevel).length) out[kind as BondKind] = byLevel;
  }
  return any ? out : null;
}

/** The design a `kind` bond at `level` shows: its own level's, else the nearest lower one's; null for the app's own mark. */
export function bondLookAt(looks: BondLooks | null | undefined, kind: BondKind, level: number): BondLook | null {
  const byLevel = looks?.[kind];
  if (!byLevel || !Number.isFinite(level)) return null;
  for (let l = Math.min(Math.floor(level), MAX_LEVEL); l >= 1; l--) {
    const x = byLevel[l];
    if (x) return x;
  }
  return null;
}
