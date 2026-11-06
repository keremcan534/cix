// "Sana en yakın oda": the home screen leads with the open room whose host has the most in common with you
// (lib/similarity), instead of leaderboards. People you follow or rooms you visited break near-ties, and a
// busy room edges out an empty one, but the match itself carries the decision.
import type { Room, User } from '@/data/mock';
import { similarity } from '@/lib/similarity';
import { youAreIn } from '@/lib/tr';

export type RoomMatch = { room: Room; host: User; score: number; reason: string; why: 'person' | 'time' | 'sparkles' | 'location' | 'flame' };

type Context = { following: ReadonlySet<string>; recent: readonly string[]; blocked?: ReadonlySet<string> };

/** One short line saying why this room is close to you; the icon kind goes with it. */
function reasonFor(me: User, host: User, room: Room, shared: string[], ctx: Context): Pick<RoomMatch, 'reason' | 'why'> {
  if (ctx.following.has(host.id)) return { reason: `Takip ettiğin ${host.name} burada`, why: 'person' };
  if (shared.length) return { reason: shared.length === 1 ? `Ortak ilgi: ${shared[0]}` : `${shared.length} ortak ilgi: ${shared.slice(0, 2).join(', ')}`, why: 'sparkles' };
  if (me.city && me.city === host.city) return { reason: `İkiniz de ${youAreIn(host.city)}`, why: 'location' };
  if (ctx.recent.includes(room.id)) return { reason: 'Son ziyaret ettiğin oda', why: 'time' };
  return { reason: `Şu an ${room.listeners.toLocaleString('tr-TR')} kişi sohbette`, why: 'flame' };
}

/** Open rooms (no password, not yours, host not blocked, somebody in it), closest first. An empty room (its owner
 *  left, or the app died without closing it) is never offered as the closest one. */
export function closestRooms(me: User, rooms: readonly Room[], hostOf: (id: string) => User, ctx: Context): RoomMatch[] {
  return rooms
    .filter((r) => !r.password && r.listeners > 0 && r.hostId !== me.id && r.hostId !== 'me' && !ctx.blocked?.has(r.hostId))
    .map((room) => {
      const host = hostOf(room.hostId);
      const sim = similarity(me, host);
      const rank = sim.score + (ctx.following.has(host.id) ? 6 : 0) + (ctx.recent.includes(room.id) ? 3 : 0) + Math.min(room.listeners, 1000) / 250;
      return { room, host, score: sim.score, rank, ...reasonFor(me, host, room, sim.shared, ctx) };
    })
    .sort((a, b) => b.rank - a.rank)
    .map(({ rank: _rank, ...m }) => m);
}
