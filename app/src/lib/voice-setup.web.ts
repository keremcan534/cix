// Web: plug the LiveKit engine into the room session when the server is configured (EXPO_PUBLIC_LIVEKIT_URL
// and EXPO_PUBLIC_API_URL, e.g. in app/.env.local). Without them the simulated engine stays.
import { apiEnabled, ensureSignedIn, voiceToken } from '@/lib/api';
import { createLiveKitEngine } from '@/lib/livekit-engine';
import { setEngine } from '@/lib/room-session';

export function setupVoice(name: () => string) {
  const url = process.env.EXPO_PUBLIC_LIVEKIT_URL;
  if (!url || !apiEnabled()) return;
  setEngine(
    createLiveKitEngine({
      url,
      // Rooms are joined as the signed-in server user; the first room signs this device in if needed.
      getToken: async (room) => {
        await ensureSignedIn(name());
        return voiceToken(room);
      },
      onError: (m) => console.warn(`[ses] ${m}`),
    }),
  );
}
