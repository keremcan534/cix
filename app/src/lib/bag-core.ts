// Çantam (server/api/economy.mjs GET /api/economy `items`, docs/CANTA.md): what I own on the server, until when, and
// where each came from (Çarşı, a staff gift, an event, a task, a level reached), read without trusting it. Pure (no
// React, no storage), so the tests run it. An older server sends no `source`: everything reads as Çarşı's.

export type BagSource = 'shop' | 'admin' | 'event' | 'task' | 'level';
/** One item I own: `until` null for good; `origin` a few words of where (the event's title, "VIP 5"). */
export type BagItem = { sku: string; kind: string; until: number | null; source: BagSource; origin?: string };
/** `at`: the server's time of the read, so days left don't follow the phone's clock. */
export type Bag = { items: BagItem[]; at: number };

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const SKU = /^[a-z0-9-]{2,40}$/;
const SOURCE: Record<string, BagSource> = { buy: 'shop', bridge: 'shop', migrate: 'shop', admin: 'admin', event: 'event', task: 'task', level: 'level' };
const DAY = 86_400_000;

/** GET /api/economy as the bag: null when it has no item list. A malformed item is left out. */
export function parseBag(raw: unknown): Bag | null {
  const r = obj(raw);
  if (!Array.isArray(r.items)) return null;
  const items: BagItem[] = [];
  const seen = new Set<string>();
  for (const x of r.items.slice(0, 500)) {
    const o = obj(x);
    if (typeof o.sku !== 'string' || !SKU.test(o.sku) || seen.has(o.sku) || typeof o.kind !== 'string' || !o.kind) continue;
    const until = o.until === null ? null : typeof o.until === 'string' && Number.isFinite(Date.parse(o.until)) ? Date.parse(o.until) : undefined;
    if (until === undefined) continue;
    seen.add(o.sku);
    const origin = typeof o.origin === 'string' ? o.origin.trim().slice(0, 60) : '';
    items.push({ sku: o.sku, kind: o.kind, until, source: SOURCE[String(o.source)] ?? 'shop', ...(origin ? { origin } : {}) });
  }
  const at = typeof r.serverNow === 'string' && Number.isFinite(Date.parse(r.serverNow)) ? Date.parse(r.serverNow) : Date.now();
  return { items, at };
}

const SOURCE_TEXT: Record<BagSource, string> = { shop: 'Çarşı', admin: 'Yetkili hediyesi', event: 'Etkinlik ödülü', task: 'Görev ödülü', level: 'Seviye ödülü' };
/** Where it came from, as the bag says it: "Çarşı", "Yetkili hediyesi", "Seviye ödülü · VIP 5". */
export const sourceText = (x: Pick<BagItem, 'source' | 'origin'>) => (x.origin && x.source !== 'shop' ? `${SOURCE_TEXT[x.source]} · ${x.origin}` : SOURCE_TEXT[x.source]);

/** How long it lasts at `now`: "Kalıcı", "12 gün kaldı", "Bugün bitiyor" (its last day), "Bitti". */
export function termText(until: number | null, now: number): string {
  if (until === null) return 'Kalıcı';
  const left = until - now;
  if (left <= 0) return 'Bitti';
  if (left <= DAY) return 'Bugün bitiyor';
  return `${Math.ceil(left / DAY)} gün kaldı`;
}

/** Çantam's tabs of items (gifts have their own): rides are with the entry effects, as in Çarşı. */
export const BAG_TABS = [
  { key: 'frame', label: 'Çerçeveler', kinds: ['frame'] },
  { key: 'entry', label: 'Giriş efektleri', kinds: ['entry', 'ride'] },
  { key: 'bubble', label: 'Sohbet balonları', kinds: ['bubble'] },
  { key: 'wave', label: 'Ses dalgaları', kinds: ['wave'] },
] as const;
export type BagTab = (typeof BAG_TABS)[number]['key'];
