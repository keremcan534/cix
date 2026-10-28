// Web: plug the LiveKit engine into the room session when the server address is configured
// (EXPO_PUBLIC_LIVEKIT_URL, e.g. in app/.env.local). Without it the simulated engine stays.
import { createLiveKitEngine } from '@/lib/livekit-engine';
import { setEngine } from '@/lib/room-session';

const KEY = 'similarclub:voice-id';

/** A random id per browser, kept so a reload rejoins as the same participant. */
function identity() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
    const id = `u-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return `u-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function setupVoice() {
  const url = process.env.EXPO_PUBLIC_LIVEKIT_URL;
  if (!url) return;
  const tokenUrl = process.env.EXPO_PUBLIC_LIVEKIT_TOKEN_URL ?? `${url.replace(/^ws/, 'http')}/token`;
  setEngine(createLiveKitEngine({ url, tokenUrl, identity: identity(), onError: (m) => console.warn(`[ses] ${m}`) }));
}
