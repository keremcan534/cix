// Phone build: plug the LiveKit engine (lib/livekit-engine.ts) into the room session when the server is configured
// (EXPO_PUBLIC_LIVEKIT_URL and EXPO_PUBLIC_API_URL, set in eas.json for the APK). @livekit/react-native brings
// WebRTC to React Native; it needs a built app (EAS), not Expo Go. Without the addresses the simulated engine stays.
// The web build has its own setup (voice-setup.web.ts).
import { apiEnabled, ensureSignedIn, voiceToken } from '@/lib/api';
import { createLiveKitEngine } from '@/lib/livekit-engine';
import { engineEvent, setEngine } from '@/lib/room-session';
import { audioInBackground, ensureWebRtc, holdAudio, micStarted, releaseAudio } from '@/lib/webrtc-globals';

export function setupVoice(name: () => string) {
  const url = process.env.EXPO_PUBLIC_LIVEKIT_URL;
  if (!url || !apiEnabled()) return;
  ensureWebRtc();
  setEngine(
    createLiveKitEngine({
      url,
      // Rooms are joined as the signed-in server user; the first room signs this device in if needed.
      getToken: async (room) => {
        await ensureSignedIn(name());
        return voiceToken(room);
      },
      onError: (m) => console.warn(`[ses] ${m}`),
      onEvent: engineEvent,
      attachAudio: false,
      onRoomOpen: () => holdAudio('room'),
      onRoomClosed: () => releaseAudio('room'),
      backgroundAudio: audioInBackground,
      onMicStarted: micStarted,
    }),
  );
}
