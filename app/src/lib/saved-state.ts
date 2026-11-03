// Checks the state saved on the device before the store uses it. A save written by an older version (or
// cut short by a crash mid-write) can miss fields or hold the wrong kind of value; used as-is it would
// crash a screen, or every launch. Anything that doesn't look right is dropped and its default is used.

export type Kind = 'boolean' | 'number' | 'string' | 'object' | 'strings' | 'numbers' | 'objects' | 'string?' | 'object?';

const kindOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
export const isRecord = (v: unknown): v is Record<string, unknown> => kindOf(v) === 'object';
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function valid(v: unknown, kind: Kind): unknown {
  switch (kind) {
    case 'boolean':
      return typeof v === 'boolean' ? v : undefined;
    case 'number':
      return finite(v) ? v : undefined;
    case 'string':
      return typeof v === 'string' ? v : undefined;
    case 'object':
      return isRecord(v) ? v : undefined;
    case 'string?':
      return v === null || typeof v === 'string' ? v : undefined;
    case 'object?':
      return v === null || isRecord(v) ? v : undefined;
    // Lists keep their good items, so one bad entry doesn't cost the rest.
    case 'strings':
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : undefined;
    case 'numbers':
      return Array.isArray(v) && v.every(finite) ? v : undefined;
    case 'objects':
      return Array.isArray(v) ? v.filter(isRecord) : undefined;
  }
}

/** The fields of `raw` that match `spec`; null when `raw` isn't an object at all. */
export function pickValid<T>(raw: unknown, spec: Record<string, Kind>): Partial<T> | null {
  if (!isRecord(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, kind] of Object.entries(spec)) {
    if (!(key in raw)) continue;
    const v = valid(raw[key], kind);
    if (v !== undefined) out[key] = v;
  }
  return out as Partial<T>;
}

/**
 * The items of a saved list that have every field of `shape` with the right kind of value (an old or broken
 * row would crash the screen that lists it); other fields are kept as they are.
 */
export function itemsShaped<T>(list: readonly unknown[], shape: Record<string, Kind>): T[] {
  return list.filter((item) => isRecord(item) && Object.entries(shape).every(([key, kind]) => valid(item[key], kind) !== undefined)) as T[];
}

/** A saved map with only the entries whose value passes `ok`. */
export function entriesWhere<T>(map: Record<string, unknown>, ok: (v: unknown) => v is T): Record<string, T> {
  return Object.fromEntries(Object.entries(map).filter(([, v]) => ok(v))) as Record<string, T>;
}

/** `v` when it is one of `allowed` (a saved choice that a later version renamed or removed is dropped). */
export const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => (allowed.includes(v as T) ? (v as T) : undefined);

export const isFiniteNumber = finite;

/**
 * `defaults` overlaid with the fields of `raw` that have the same kind of value (a finite number for a
 * number, a list for a list…). Keys `defaults` doesn't have are optional fields and are kept; a null
 * default accepts anything but a list.
 */
export function withDefaults<T extends object>(defaults: T, raw: unknown): T {
  const out = { ...defaults } as Record<string, unknown>;
  if (!isRecord(raw)) return out as T;
  const base = defaults as Record<string, unknown>;
  for (const [key, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    if (!(key in base)) {
      out[key] = v;
      continue;
    }
    const d = base[key];
    if (d === null) {
      if (!Array.isArray(v)) out[key] = v;
      continue;
    }
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    if (kindOf(v) === kindOf(d)) out[key] = v;
  }
  return out as T;
}
