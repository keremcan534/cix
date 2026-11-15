// The emoji panel's sticker packs as the server says they are now (GET /api/catalog?emoji=1, server/api/emoji.mjs:
// Yönetim › Emojiler), read without trusting the answer. Pure (no React Native), so it is unit tested; the screens get
// it through lib/live/emoji-live, laid over the app's own packs (data/catalog STICKER_PACKS).
//
// Every pack comes in the server's order with its stickers in theirs. The app's own keep their pictures unless the
// server gives one (`art`: a replaced picture, or an admin's own sticker: a PNG/WebP or a Lottie animation, drawn from
// its address). `off`: taken off the panel and the shop, still drawn where it was sent (the app's `retired`); `gone`:
// the admins' deleted stickers, drawn as their emoji. Anything malformed is left out or keeps the app's value; the
// app's packs and stickers the answer leaves out stay as the app has them, so nothing is ever lost.
import { STICKER_PACKS, type Sticker } from '@/data/catalog';

export type StickerArtRef = { url: string; kind: 'image' | 'lottie' };
export type LiveSticker = { id: string; name: string; emoji: string; art?: StickerArtRef; off?: true; custom?: true };
export type LivePack = { id: string; name: string; price: number; minVip?: number; animated?: true; roomOnly?: true; off?: true; custom?: true; stickers: LiveSticker[] };
export type LiveEmoji = { packs: LivePack[]; gone: Sticker[] };

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ART_URL = /^https?:\/\/[^\s"'<>\\]{1,600}$/;
/** Nothing the server lists is near these; past them it is a mistake, not packs to show. */
const PACKS_MAX = 100;
const STICKERS_MAX = 200;
const PRICE_MAX = 10_000_000;

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const whole = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max ? v : undefined);
const emojiOf = (v: unknown) => (typeof v === 'string' && v.trim() && v.length <= 16 ? v.trim() : undefined);
export function artOf(v: unknown): StickerArtRef | undefined {
  const a = obj(v);
  return typeof a.url === 'string' && ART_URL.test(a.url) && (a.kind === 'image' || a.kind === 'lottie') ? { url: a.url, kind: a.kind } : undefined;
}

const COMPILED_PACKS = new Map(STICKER_PACKS.map((p) => [p.id, p]));
const COMPILED_STICKERS = new Map(STICKER_PACKS.flatMap((p) => p.stickers.map((s) => [s.id, s] as const)));
/** One of the app's packs as a LivePack (as the app has it). */
const asLive = (p: (typeof STICKER_PACKS)[number], stickers = p.stickers): LivePack => ({
  id: p.id,
  name: p.name,
  price: p.price,
  ...(p.minVip ? { minVip: p.minVip } : {}),
  ...(p.animated ? { animated: true as const } : {}),
  ...(p.roomOnly ? { roomOnly: true as const } : {}),
  ...(p.retired ? { off: true as const } : {}),
  stickers: stickers.map((s) => ({ id: s.id, name: s.name, emoji: s.emoji })),
});

/** The server's `emoji` (or the copy kept on the phone); null when it said nothing usable (then the app's own packs). */
export function parseLiveEmoji(raw: unknown): LiveEmoji | null {
  const r = obj(raw);
  if (!Array.isArray(r.packs) || !r.packs.length) return null;
  const packs: LivePack[] = [];
  const seenPacks = new Set<string>();
  const seen = new Set<string>();
  for (const x of r.packs.slice(0, PACKS_MAX)) {
    const p = obj(x);
    if (typeof p.id !== 'string' || p.id.length > 16 || !ID.test(p.id) || seenPacks.has(p.id)) continue;
    const base = COMPILED_PACKS.get(p.id);
    // An id the app doesn't know is only the admins' own pack.
    if (!base && p.custom !== true) continue;
    const name = clean(p.name, 40) || base?.name;
    if (!name) continue;
    const stickers: LiveSticker[] = [];
    for (const y of Array.isArray(p.stickers) ? p.stickers.slice(0, STICKERS_MAX) : []) {
      const s = obj(y);
      if (typeof s.id !== 'string' || s.id.length > 40 || !ID.test(s.id) || seen.has(s.id)) continue;
      const sb = COMPILED_STICKERS.get(s.id);
      const art = artOf(s.art);
      // The admins' sticker is its picture: none (or a broken address), nothing to draw.
      if (!sb && (s.custom !== true || !art)) continue;
      const sname = clean(s.name, 40) || sb?.name;
      if (!sname) continue;
      seen.add(s.id);
      stickers.push({ id: s.id, name: sname, emoji: emojiOf(s.emoji) ?? sb?.emoji ?? '🙂', ...(art ? { art } : {}), ...(s.off === true ? { off: true as const } : {}), ...(sb ? {} : { custom: true as const }) });
    }
    const price = whole(p.price, 0, PRICE_MAX) ?? base?.price ?? 0;
    const minVip = whole(p.minVip, 0, 15) ?? base?.minVip ?? 0;
    seenPacks.add(p.id);
    packs.push({
      id: p.id,
      name,
      price,
      ...(minVip ? { minVip } : {}),
      ...(p.animated === true || base?.animated ? { animated: true as const } : {}),
      ...(base?.roomOnly ? { roomOnly: true as const } : {}),
      ...(p.off === true ? { off: true as const } : {}),
      ...(base ? {} : { custom: true as const }),
      stickers,
    });
  }
  if (!packs.length) return null;
  // The app's own the answer left out stay as the app has them: a pack after the rest, a sticker at the end of its own.
  for (const p of STICKER_PACKS) {
    const missing = p.stickers.filter((s) => !seen.has(s.id));
    if (!missing.length && seenPacks.has(p.id)) continue;
    const home = packs.find((x) => x.id === p.id);
    if (home) home.stickers.push(...asLive(p, missing).stickers);
    else packs.push(asLive(p, missing));
    missing.forEach((s) => seen.add(s.id));
  }
  const gone: Sticker[] = [];
  for (const y of Array.isArray(r.gone) ? r.gone.slice(0, 1000) : []) {
    const s = obj(y);
    const name = clean(s.name, 40);
    const emoji = emojiOf(s.emoji);
    if (typeof s.id === 'string' && s.id.length <= 40 && ID.test(s.id) && !seen.has(s.id) && name && emoji) {
      seen.add(s.id);
      gone.push({ id: s.id, name, emoji });
    }
  }
  return { packs, gone };
}
