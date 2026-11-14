// Which gifts a shelf of the gift sheet (components/room/gift-sheet) lists, in which order. Pure, so it is unit tested.
import type { Gift, GiftCat } from '@/data/mock';

export type Shelf = GiftCat | 'lucky' | 'fav' | 'bag';
export type PriceSort = 'default' | 'asc' | 'desc';

/**
 * `shown`: the gifts the server still offers (visibleGifts); `inBag`: what the backpack may send (bagGifts). Popüler
 * also lists every gift with a video (`video`, the server's fx list) whatever its own shelf, after its own gifts and in
 * the same order (Pırlanta Yüzük is İkili), so all of them are found where the others are.
 */
export function shelfGifts(shown: Gift[], shelf: Shelf, sort: PriceSort, favs: Set<string>, bag: Record<string, number>, inBag: Gift[] = shown, video: ReadonlySet<string> = new Set()) {
  if (shelf === 'lucky') return [];
  if (shelf === 'fav') return shown.filter((g) => favs.has(g.id));
  if (shelf === 'bag') return inBag.filter((g) => (bag[g.id] ?? 0) > 0);
  const own = shown.filter((g) => (g.cat ?? 'hot') === shelf);
  const list = shelf === 'hot' ? [...own, ...shown.filter((g) => (g.cat ?? 'hot') !== 'hot' && video.has(g.id))] : own;
  if (sort !== 'default') list.sort((a, b) => (sort === 'asc' ? a.price - b.price : b.price - a.price));
  return list;
}
