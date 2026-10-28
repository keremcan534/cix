// Real voice engine on LiveKit (docs/SUNUCU.md), for the web build: livekit-client uses the browser's WebRTC.
// Native needs @livekit/react-native, its config plugin and a development build; until then native keeps the
// simulated engine (lib/voice-setup.ts).
//
// The AudioEngine calls are synchronous while joining is not: connect() updates the counters at once and joins
// in the background (token from our token service, then the room). Every async step checks that the room is
// still the current one, so leaving or switching rooms mid-join never leaves a second connection open.
import { ConnectionState, Room, RoomEvent, Track } from 'livekit-client';

import type { AudioEngine, EngineStats } from '@/lib/audio-engine';

export type LiveKitConfig = {
  /** wss:// address of the LiveKit server. */
  url: string;
  /** https:// address of the token service (GET ?room=&identity=&name=). */
  tokenUrl: string;
  identity: string;
  onError?: (message: string) => void;
};

/** LiveKit room names allow what the token service allows: letters, digits, _ and -. */
const roomName = (roomId: string) => `oda-${roomId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);

export function createLiveKitEngine(cfg: LiveKitConfig): AudioEngine {
  const s: EngineStats = { roomId: null, connects: 0, reconnects: 0, disconnects: 0, concurrent: 0, maxConcurrent: 0, publishing: false, publishStarts: 0, route: 'speaker' };
  let room: Room | null = null;
  const fail = (what: string, e: unknown) => cfg.onError?.(`${what}: ${e instanceof Error ? e.message : String(e)}`);

  const setMic = (r: Room, on: boolean) => {
    if (r.state === ConnectionState.Connected) r.localParticipant.setMicrophoneEnabled(on).catch((e) => fail('Mikrofon', e));
  };

  async function join(roomId: string, r: Room) {
    try {
      const q = new URLSearchParams({ room: roomName(roomId), identity: cfg.identity, name: cfg.identity });
      const res = await fetch(`${cfg.tokenUrl}?${q}`);
      if (!res.ok) throw new Error(`token ${res.status}`);
      const { token } = (await res.json()) as { token: string };
      if (room !== r) return;
      await r.connect(cfg.url, token);
      if (room !== r) return void r.disconnect();
      // Browsers block sound until a user gesture; opening a room is one, so this usually succeeds at once.
      await r.startAudio().catch(() => {});
      if (s.publishing) setMic(r, true);
    } catch (e) {
      if (room === r) fail('Ses bağlantısı', e);
    }
  }

  function newRoom() {
    const r = new Room({ dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    // Remote voices play through hidden <audio> elements, removed when the track goes away.
    r.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach();
      el.style.display = 'none';
      document.body.appendChild(el);
    });
    r.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
    return r;
  }

  const engine: AudioEngine = {
    name: 'LiveKit (gerçek ses)',
    capabilities: { realAudio: true, backgroundAudio: false },
    connect(roomId) {
      if (s.roomId === roomId) return;
      if (s.roomId) engine.disconnect();
      s.roomId = roomId;
      s.connects++;
      s.concurrent++;
      s.maxConcurrent = Math.max(s.maxConcurrent, s.concurrent);
      room = newRoom();
      void join(roomId, room);
    },
    reconnect() {
      if (!room || !s.roomId || (typeof navigator !== 'undefined' && !navigator.onLine)) return false;
      s.reconnects++;
      // LiveKit retries a dropped transport by itself; only a fully closed room needs a new join.
      if (room.state === ConnectionState.Disconnected) void join(s.roomId, room);
      return true;
    },
    disconnect() {
      if (!s.roomId) return;
      const r = room;
      room = null;
      s.publishing = false;
      s.roomId = null;
      s.concurrent--;
      s.disconnects++;
      if (r) {
        r.remoteParticipants.forEach((p) => p.audioTrackPublications.forEach((pub) => pub.track?.detach().forEach((el) => el.remove())));
        void r.disconnect();
      }
    },
    setPublishing(on) {
      if (!s.roomId) on = false;
      if (on === s.publishing) return;
      if (on) s.publishStarts++;
      s.publishing = on;
      if (room) setMic(room, on);
    },
    setRoute(route) {
      // The browser picks the output device; the route is kept for the session's state only.
      s.route = route;
    },
    stats: () => ({ ...s }),
  };
  return engine;
}
