// Çantam's shelf in the gift panel (components/room/gift-sheet): how many of each gift and where they came from,
// from the server's backpack in a live build (lib/live/backpack) or the demo's sample stock. Pure, so node --test
// can load it (tests/backpack.test.ts).
export type BagItem = { giftId: string; count: number; label: string };

/** giftId → count, only gifts there are some of. */
export const bagCounts = (items: readonly BagItem[]): Record<string, number> => Object.fromEntries(items.filter((i) => i.count > 0).map((i) => [i.giftId, i.count]));

/** Where a gift in the backpack came from ("Görev ödülü"), or `fallback`. */
export const bagLabel = (items: readonly BagItem[], giftId: string, fallback = 'Çanta') => items.find((i) => i.giftId === giftId)?.label ?? fallback;

/** Gifts one send takes from the backpack: `count` to each person picked. */
export const bagNeed = (count: number, people: number) => count * people;

/** True when the backpack holds fewer of the gift than a send of `count` to `people` takes. */
export const bagShort = (counts: Record<string, number>, giftId: string, count: number, people: number) => bagNeed(count, people) > (counts[giftId] ?? 0);
