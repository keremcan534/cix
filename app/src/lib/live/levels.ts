// Other people's Cömertlik and Yankı levels as the server last sent them (server/api/profiles.mjs), by server id:
// Keşfet's cards and their order. Put by the lists and the profile screen when they read someone; never made up
// here, so a person whose levels haven't been read shows none.
import type { Levels } from '@/lib/api';

const known = new Map<string, Levels>();

export function putLevels(serverId: string, levels: Levels | undefined) {
  if (levels) known.set(serverId, { wealth: levels.wealth, charm: levels.charm });
}

/** Their levels, or undefined until a server answer brought them. */
export const levelsOf = (serverId: string) => known.get(serverId);
