// Entrances in a room (docs/CANLI_ODA.md, docs/BAGLAR.md): who came in while I'm here, what my phone shows for it
// and with whose look. A server room learns its people from the voice connection (lib/live/room-bus), which lists
// everyone inside, so the people already there when I came are not entrances: a newcomer gets no line and no entry
// effect for them. An entry effect is always the entering person's own shop look (their entry, ride, noble rank and
// VIP color, server/api/economy.mjs GET /api/looks): never the viewer's, and nobody's room role changes it.
// Pure, so the rules are unit tested (tests/room-entrance.test.ts).
import type { EntryFx } from '@/components/fx/entry';
import { cosmeticById } from '@/data/catalog';
import type { Plate } from '@/lib/shop-live-core';
import { vipTier } from '@/data/economy';
import { nobleInfo } from '@/data/status';

/**
 * How someone got into the room's people. `fresh`: they came in after me, an entrance I saw (the people already inside
 * when I came, after a reconnect of mine too, are not). `at`: when they came in (the voice server's clock, ms; 0 not
 * known). `away`: how long ago they left during my visit (ms; null: not seen leaving), so a dropped connection coming
 * back can be told from someone walking in.
 */
export type PeerJoin = { fresh: boolean; at: number; away: number | null };

/**
 * Whether someone who came in at `at` came in after me (`mine`), both on the voice server's clock. Someone already
 * inside when I came (earlier, or not known) did not. The same second counts as after (the clock has whole seconds).
 */
export const cameInAfter = (at: number | undefined, mine: number) => mine > 0 && !!at && at >= mine;

/**
 * The voice connection's people (`here`: local id → name and join time, my own account left out) against the room's
 * presence (`members`): who left, and who is new and how they came. `meJoinedAt`: when I came in on this connection
 * (0 while connecting: then nobody is fresh); `leftAt`: when each person left during this visit (this phone's clock).
 */
export function peerChanges(
  members: readonly string[],
  here: ReadonlyMap<string, { name: string; joinedAt?: number }>,
  meJoinedAt: number,
  leftAt: ReadonlyMap<string, number>,
  now: number,
): { leaves: string[]; joins: { uid: string; name: string; join: PeerJoin }[] } {
  const leaves = members.filter((uid) => uid !== 'me' && !here.has(uid));
  const joins = [...here]
    .filter(([uid]) => !members.includes(uid))
    .map(([uid, p]) => {
      const gone = leftAt.get(uid);
      return { uid, name: p.name, join: { fresh: cameInAfter(p.joinedAt, meJoinedAt), at: p.joinedAt ?? 0, away: gone === undefined ? null : now - gone } };
    });
  return { leaves, joins };
}

/**
 * Someone back this soon after leaving is a dropped connection coming back: the line again, not their entry effect.
 * Short on purpose: someone who walks out and back in a little later is an entrance, and everyone should see it.
 */
export const RETURN_MS = 15_000;

/**
 * What my phone shows for someone joining the room's people: the chat line ("X odaya girdi") and their own entry
 * effect. Nothing for the people already inside when I came (theirs played for the people there then), nothing for
 * someone I blocked. Someone back during my visit gets the line again, the effect only when it is an entrance and not
 * a connection back within RETURN_MS. `effectsOn`: my Efekt ayarları › Giriş efektleri. Room roles play no part.
 */
export function entranceView(join: PeerJoin, { blocked = false, effectsOn = true }: { blocked?: boolean; effectsOn?: boolean } = {}) {
  const line = !blocked && (join.fresh || join.away !== null);
  const effect = line && join.fresh && effectsOn && (join.away === null || join.away >= RETURN_MS);
  return { line, effect };
}

/**
 * A person's entry banner from their own look: the effect, the ride (`rideId` for its picture), the noble badge, and
 * the banner's colors: `tint` undefined with an entry item (its own colors), else the VIP tier's (null: the app's).
 */
export type EntryPlan = {
  fx: EntryFx;
  rideId?: string;
  ride?: string;
  badge?: string;
  tint?: readonly [string, string] | null;
  /** The team's own entry effect (Yönetim › Mağaza): its clip (fx entry <id>) and the name plate on it. */
  clip?: string;
  plate?: Plate | null;
};
/**
 * What `look` (one person's, as the server keeps it) shows when its owner comes in; null when nothing worn shows.
 * Everyone in the room sees what the person sees on their own phone (the customer's note, 18 Nov): a VIP level alone
 * brings the banner, and so does an entry effect this phone can't play: one taken out of the shop (data/catalog
 * `retired`), or one the team added after this phone last read the shop.
 */
export function entryPlanOf(look: { entry?: string | null; ride?: string | null; noble?: number | null; vipLevel?: number } | undefined): EntryPlan | null {
  if (!look) return null;
  const known = cosmeticById(look.entry ?? undefined);
  const wearing = known?.kind === 'entry' || (!!look.entry && !known);
  // Only an item of its own slot. The team's own item still plays for whoever has it after it left the shelf.
  const worn = (id: string | null | undefined, kind: 'entry' | 'ride') => {
    const c = cosmeticById(id ?? undefined);
    return c?.kind === kind && (!c.retired || !!c.remote) ? c : undefined;
  };
  const entryItem = worn(look.entry, 'entry');
  const ride = worn(look.ride, 'ride');
  const noble = look.noble ? nobleInfo(look.noble) : undefined;
  const vip = look.vipLevel ?? 0;
  if (!wearing && !ride && !noble && vip < 1) return null;
  const badge = [noble?.emoji, vip > 0 ? `VIP ${vip}` : ''].filter(Boolean).join(' ');
  return {
    fx: (entryItem?.fx as EntryFx | undefined) ?? 'vip',
    ...(entryItem?.remote?.video ? { clip: entryItem.id, plate: entryItem.remote.plate ?? null } : {}),
    ...(ride ? { rideId: ride.id, ride: ride.emoji } : {}),
    ...(badge ? { badge } : {}),
    ...(entryItem ? {} : { tint: vipTier(vip)?.color ?? null }),
  };
}
