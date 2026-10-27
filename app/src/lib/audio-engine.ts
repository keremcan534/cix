// The seam between the room session and the voice service. The session (lib/room-session) only talks to
// an AudioEngine, so the simulated engine below can be swapped for a real one (LiveKit or Agora, which need a
// development build and their own config plugins) without touching the session or any screen.
//
// Rules every engine keeps:
//  - at most one room connection at a time (connecting to another room drops the old one first);
//  - connect() to the room already connected does nothing (expanding or minimizing never reconnects);
//  - reconnect() restores the same room's transport, it is not a new join;
//  - the microphone track is published only while setPublishing(true).

export type AudioRoute = 'speaker' | 'bluetooth';
export type EngineCapabilities = {
  /** Plays and captures real audio. The prototype engine doesn't. */
  realAudio: boolean;
  /** Keeps audio running while the app is in the background (iOS background audio, Android foreground service). */
  backgroundAudio: boolean;
};
export type EngineStats = {
  roomId: string | null;
  connects: number;
  reconnects: number;
  disconnects: number;
  /** Open connections right now (must never exceed 1). */
  concurrent: number;
  maxConcurrent: number;
  publishing: boolean;
  /** Times the mic track started being published. */
  publishStarts: number;
  route: AudioRoute;
};
export interface AudioEngine {
  readonly name: string;
  readonly capabilities: EngineCapabilities;
  connect(roomId: string): void;
  /** Re-establish the current room's transport after a drop; false when the network isn't back yet. */
  reconnect(): boolean;
  disconnect(): void;
  setPublishing(on: boolean): void;
  setRoute(route: AudioRoute): void;
  stats(): EngineStats;
}

/** Prototype engine: no sound, but the same connection rules and counters, so the session logic is testable. */
export function createSimulatedEngine(networkUp: () => boolean): AudioEngine {
  const s: EngineStats = { roomId: null, connects: 0, reconnects: 0, disconnects: 0, concurrent: 0, maxConcurrent: 0, publishing: false, publishStarts: 0, route: 'speaker' };
  const engine: AudioEngine = {
    name: 'Simülasyon (gerçek ses yok)',
    capabilities: { realAudio: false, backgroundAudio: false },
    connect(roomId) {
      if (s.roomId === roomId) return;
      if (s.roomId) engine.disconnect();
      s.roomId = roomId;
      s.connects++;
      s.concurrent++;
      s.maxConcurrent = Math.max(s.maxConcurrent, s.concurrent);
    },
    reconnect() {
      if (!s.roomId || !networkUp()) return false;
      s.reconnects++;
      return true;
    },
    disconnect() {
      if (!s.roomId) return;
      s.publishing = false;
      s.roomId = null;
      s.concurrent--;
      s.disconnects++;
    },
    setPublishing(on) {
      if (!s.roomId) on = false;
      if (on && !s.publishing) s.publishStarts++;
      s.publishing = on;
    },
    setRoute(route) {
      s.route = route;
    },
    stats: () => ({ ...s }),
  };
  return engine;
}
