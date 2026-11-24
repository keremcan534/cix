// The emoji panel's packs and stickers for the screens: as the server says they are now (Yönetim › Emojiler,
// lib/emoji-live-core), else the app's own (data/catalog STICKER_PACKS). The emoji panel, the shop, the store's pack
// ownership, a message's or seat's sticker and the pictures (components/ReactionArt) all read them here.
//
// livePacks(): the packs as StickerPacks, their visible stickers only (a sticker taken off is left out; a pack taken
// off is `retired`). liveSticker(id) and livePackOf(id): any sticker the phone may have to draw, those taken off and
// the deleted admins' ones (`gone`, drawn as their emoji) too. stickerArt(id): the address of a picture the server
// gave (an admin's sticker, a replaced one), else undefined: the app's own picture.
import { STICKER_PACKS, type Sticker, type StickerPack } from '@/data/catalog';
import type { LiveSticker, StickerArtRef } from '@/lib/emoji-live-core';
import { liveCatalog, type LiveCatalog } from '@/lib/live/catalog-live';

type Views = { emoji: LiveCatalog['emoji'] | undefined; packs: StickerPack[]; byId: Map<string, LiveSticker>; packOf: Map<string, StickerPack> };
let views: Views | null = null;

/** The packs and stickers worked out once per copy of the catalog's emoji (the same objects until it changes). */
function viewsOf(c: LiveCatalog | null): Views {
  const emoji = c?.emoji;
  if (views && views.emoji === emoji) return views;
  const byId = new Map<string, LiveSticker>();
  const packOf = new Map<string, StickerPack>();
  let packs: StickerPack[];
  if (!emoji) {
    packs = STICKER_PACKS;
    for (const p of STICKER_PACKS)
      for (const s of p.stickers) {
        byId.set(s.id, s);
        packOf.set(s.id, p);
      }
  } else {
    packs = emoji.packs.map((p) => {
      const pack: StickerPack = {
        id: p.id,
        name: p.name,
        price: p.price,
        ...(p.minVip ? { minVip: p.minVip } : {}),
        ...(p.animated ? { animated: true } : {}),
        ...(p.roomOnly ? { roomOnly: true } : {}),
        ...(p.off ? { retired: true } : {}),
        ...(p.soon ? { soon: true } : {}),
        stickers: p.stickers.filter((s) => !s.off).map(({ id, name, emoji: e }) => ({ id, name, emoji: e })),
      };
      for (const s of p.stickers) {
        byId.set(s.id, s);
        packOf.set(s.id, pack);
      }
      return pack;
    });
    for (const s of emoji.gone) if (!byId.has(s.id)) byId.set(s.id, s);
  }
  views = { emoji, packs, byId, packOf };
  return views;
}

/** The packs as they are now, in their order (visible stickers only). */
export const livePacks = (c: LiveCatalog | null = liveCatalog()): StickerPack[] => viewsOf(c).packs;
/** A pack by id as it is now. */
export const livePack = (id: string, c: LiveCatalog | null = liveCatalog()): StickerPack | undefined => viewsOf(c).packs.find((p) => p.id === id);
/** Any sticker this phone may have to draw, by id (taken off and deleted ones too). */
export const liveSticker = (id: string, c: LiveCatalog | null = liveCatalog()): Sticker | undefined => viewsOf(c).byId.get(id);
/** The pack a sticker is in now (none for a deleted one). */
export const livePackOf = (id: string, c: LiveCatalog | null = liveCatalog()): StickerPack | undefined => viewsOf(c).packOf.get(id);
/** The picture the server gave a sticker (an admin's own, a replaced one); undefined: the app's own picture. */
export const stickerArt = (id: string, c: LiveCatalog | null = liveCatalog()): StickerArtRef | undefined => viewsOf(c).byId.get(id)?.art;
