// Oyun anahtarları on this phone: which games the server switched off or keeps for admins (GET /api/config gamesOff,
// gamesStaff; server/api/game-switch.mjs). Every screen that offers a game asks here, so a shut game leaves the room
// menu, the game panel, the room's wheel shortcut, the gift sheet's Şanslı shelf and Oyun Merkezi together, within
// the config's 30 seconds. The demo (no server) shuts nothing. The server refuses a shut game either way.
import { useCallback } from 'react';

import { useIsAdmin } from '@/lib/live/admin';
import { gameShut } from '@/lib/remote-config';
import { useRemoteConfig } from '@/lib/remote-control';

/** (id) => true when that game is shut for this account now; the screen re-renders on a new config or role. */
export function useGameShut() {
  const config = useRemoteConfig();
  const admin = useIsAdmin();
  return useCallback((id: string) => gameShut(config, id, admin), [config, admin]);
}
