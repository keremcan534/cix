// Real voice engine on LiveKit (docs/SUNUCU.md). The web build uses the browser's WebRTC (voice-setup.web.ts);
// the phone build uses @livekit/react-native's WebRTC (voice-setup.ts), which plays remote voices by itself and
// needs its audio session started while in a room.
//
// The AudioEngine calls are synchronous while joining is not: connect() updates the counters at once and joins
// in the background (token from our API, then the room). Every async step checks that the room is
// still the current one, so leaving or switching rooms mid-join never leaves a second connection open.
import { ConnectionState, DisconnectReason, Room, RoomEvent, Track } from 'livekit-client';

import type { AudioEngine, EngineStats } from '@/lib/audio-engine';
import { bindLink, decodeSignal, encodeSignal, parseSeat, reportPeers, reportRoomMeta, reportServerSeat, reportSignal, type PeerSignal } from '@/lib/live/room-bus';
import type { EngineEvent } from '@/lib/room-session';
import { setAiDenoise } from '../../modules/similar-denoise';

export type LiveKitConfig = {
  /** wss:// address of the LiveKit server. */
  url: string;
  /** Access token for a LiveKit room name, from our API (signed-in users only). */
  getToken: (room: string) => Promise<string>;
  onError?: (message: string) => void;
  /** The room's real state for the session (room-session engineEvent): joined, dropped, refused, mic blocked. */
  onEvent?: (roomId: string, e: EngineEvent) => void;
  /** Web: remote voices need hidden <audio> elements. Native plays them without any. */
  attachAudio?: boolean;
  /** Native: start / stop the phone's audio session around a room. */
  onRoomOpen?: () => Promise<void> | void;
  onRoomClosed?: () => Promise<void> | void;
};

/** LiveKit room names allow what the token service allows: letters, digits, _ and -. */
const roomName = (roomId: string) => `oda-${roomId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);

export function createLiveKitEngine(cfg: LiveKitConfig): AudioEngine {
  const s: EngineStats = { roomId: null, connects: 0, reconnects: 0, disconnects: 0, concurrent: 0, maxConcurrent: 0, publishing: false, publishStarts: 0, route: 'speaker' };
  let room: Room | null = null;
  // The mic I sit on, shown to the other phones as my `seat` attribute (lib/live/room-bus); set again after a reconnect.
  let seat: number | null = null;
  // My own `seat` writes the server hasn't echoed yet: their echo is not the owner or an admin moving me.
  let pendingSeats: { v: string; at: number }[] = [];
  const fail = (what: string, e: unknown) => cfg.onError?.(`${what}: ${e instanceof Error ? e.message : String(e)}`);
  // "Mikrofon denoise": the mic is captured with these (WebRTC's own noise suppressor), and the AI denoise
  // (modules/similar-denoise, RNNoise on Android) cleans it further; a change takes a new mic track (recapture).
  let denoise = true;
  const capture = () => ({ echoCancellation: true, noiseSuppression: denoise, autoGainControl: true });
  let recapturing: Promise<void> | null = null;
  // "Konuşma sesi" / "Oda sesini kapat": every remote voice plays at this volume (0..1), new ones too.
  let volume = 1;
  const applyVolume = (r: Room) =>
    r.remoteParticipants.forEach((p) => p.audioTrackPublications.forEach((pub) => (pub.track as { setVolume?: (v: number) => void } | undefined)?.setVolume?.(volume)));
  /** Only for the room still current: a late answer from a room we already left says nothing. */
  const tell = (r: Room, e: EngineEvent) => {
    if (room === r && s.roomId) cfg.onEvent?.(s.roomId, e);
  };

  /** The server's say on mic and chat (voice token, and live changes when a mute starts or ends). */
  const grant = (r: Room) => {
    const p = r.localParticipant.permissions;
    return { canPublish: p?.canPublish !== false, canChat: p?.canPublishData !== false };
  };
  const setMic = (r: Room, on: boolean) => {
    if (r.state !== ConnectionState.Connected) return;
    // A new mic track is on its way: the wanted state is put on it when it is ready.
    if (recapturing) return void recapturing.then(() => room === r && setMic(r, s.publishing));
    // Voice muted by the server: asking LiveKit would only fail (and read as a missing phone permission).
    if (on && !grant(r).canPublish) return;
    r.localParticipant.setMicrophoneEnabled(on, on ? capture() : undefined).catch((e) => {
      // The phone said no to the microphone: the session shows "Mikrofon izni yok" and keeps the room playing.
      const name = e instanceof Error ? e.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || /permission/i.test(String(e))) tell(r, { type: 'mic_denied' });
      else fail('Mikrofon', e);
    });
  };

  // Rooms holding the phone's audio session. A left room closes only after its disconnect finishes, which can be
  // after the next room opened the session: the session stops when the last room lets go, not on every close.
  const audioRooms = new Set<Room>();
  const releaseAudio = (r: Room) => {
    if (audioRooms.delete(r) && audioRooms.size === 0) void cfg.onRoomClosed?.();
  };

  async function join(roomId: string, r: Room) {
    try {
      const token = await cfg.getToken(roomName(roomId));
      if (room !== r) return;
      audioRooms.add(r);
      await cfg.onRoomOpen?.();
      if (room !== r) return;
      await r.connect(cfg.url, token);
      if (room !== r) return void r.disconnect();
      // The AI denoise goes into the mic's path once the voice engine has started (Android; no-op elsewhere).
      setAiDenoise(denoise);
      // Browsers block sound until a user gesture; opening a room is one, so this usually succeeds at once.
      await r.startAudio().catch(() => {});
      if (s.publishing) setMic(r, true);
      if (seat !== null) pushSeat(r);
      snapshot(r);
      if (s.roomId) reportRoomMeta(s.roomId, r.metadata);
      tell(r, { type: 'connected' });
      tell(r, { type: 'grant', ...grant(r) });
    } catch (e) {
      if (room !== r) return;
      fail('Ses bağlantısı', e);
      // Our API refused the token for good: closed or unknown room (410, 404), banned or wrong password (403).
      const status = (e as { status?: unknown } | null)?.status;
      if (status === 403 || status === 404 || status === 410) {
        tell(r, { type: 'failed', final: true, reason: status === 403 ? 'kicked' : 'server', message: e instanceof Error ? e.message : 'Odaya girilemedi' });
      } else {
        tell(r, { type: 'failed', final: false, message: 'Ses bağlantısı kurulamadı' });
      }
    }
  }

  const pushSeat = (r: Room) => {
    if (r.state !== ConnectionState.Connected) return;
    const v = seat === null ? '' : String(seat);
    pendingSeats = [...pendingSeats.filter((p) => Date.now() - p.at < 10_000), { v, at: Date.now() }].slice(-10);
    r.localParticipant.setAttributes({ seat: v }).catch((e) => fail('Koltuk', e));
  };
  /**
   * My `seat` attribute changed and this phone didn't write it: the owner or an admin moved me or took me off
   * (server/api/rooms.mjs POST /api/rooms/seat). The room screen follows; it isn't written back.
   */
  const seatFromServer = (r: Room, changed: Record<string, string>) => {
    if (room !== r || !s.roomId || r.state !== ConnectionState.Connected || !('seat' in changed)) return;
    const v = changed.seat;
    pendingSeats = pendingSeats.filter((p) => Date.now() - p.at < 10_000);
    const i = pendingSeats.findIndex((p) => p.v === v);
    if (i >= 0) return void pendingSeats.splice(0, i + 1);
    const next = parseSeat(v);
    if (next === seat) return;
    seat = next;
    reportServerSeat(s.roomId, next);
  };
  /** Everyone else in the room for the room screen (lib/live/room-bus). */
  const snapshot = (r: Room) => {
    if (room !== r || !s.roomId) return;
    const peers = [...r.remoteParticipants.values()].map((p) => ({ identity: p.identity, name: p.name || 'Üye', seat: parseSeat(p.attributes?.seat), speaking: p.isSpeaking, micOn: p.isMicrophoneEnabled }));
    reportPeers(s.roomId, peers, r.localParticipant.isSpeaking);
  };
  bindLink({
    setSeat(next) {
      if (next === seat) return;
      seat = next;
      if (room) pushSeat(room);
    },
    send(msg: PeerSignal) {
      if (room?.state !== ConnectionState.Connected) return false;
      room.localParticipant.publishData(encodeSignal(msg), { reliable: true }).catch((e) => fail('Mesaj', e));
      return true;
    },
  });

  function newRoom() {
    const r = new Room({ dynacast: true, audioCaptureDefaults: capture() });
    const update = () => snapshot(r);
    [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.ParticipantAttributesChanged, RoomEvent.ParticipantNameChanged, RoomEvent.ActiveSpeakersChanged, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.TrackPublished, RoomEvent.TrackUnpublished, RoomEvent.Reconnected].forEach((ev) => r.on(ev, update));
    r.on(RoomEvent.Reconnected, () => {
      if (seat !== null) pushSeat(r);
      tell(r, { type: 'connected' });
    });
    r.on(RoomEvent.Reconnecting, () => tell(r, { type: 'lost' }));
    r.on(RoomEvent.ParticipantAttributesChanged, (changed, participant) => {
      if (participant === r.localParticipant) seatFromServer(r, changed);
    });
    // Locked mics live in the room's metadata, written only by the server (server/api/rooms.mjs).
    r.on(RoomEvent.RoomMetadataChanged, (metadata) => {
      if (room === r && s.roomId) reportRoomMeta(s.roomId, metadata);
    });
    // A mute starting or ending changes our permissions on the live connection (server/api/sanctions.mjs).
    r.on(RoomEvent.ParticipantPermissionsChanged, (_prev, participant) => {
      if (participant !== r.localParticipant) return;
      const g = grant(r);
      tell(r, { type: 'grant', ...g });
      if (g.canPublish && s.publishing) setMic(r, true);
    });
    // Our own leave sets `room` to null first, so this only reports drops we didn't ask for.
    r.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      if (reason === DisconnectReason.PARTICIPANT_REMOVED) tell(r, { type: 'removed', reason: 'kicked' });
      else if (reason === DisconnectReason.ROOM_DELETED) tell(r, { type: 'removed', reason: 'server' });
      else if (reason === DisconnectReason.DUPLICATE_IDENTITY) tell(r, { type: 'failed', final: true, reason: 'server', message: 'Bu hesapla başka bir cihazdan odaya girildi' });
      else tell(r, { type: 'lost' });
    });
    // No participant = the server sent it (a paid gift's announcement); room-bus decides what each may say.
    r.on(RoomEvent.DataReceived, (payload, participant) => {
      if (room === r && s.roomId) reportSignal(s.roomId, participant ? participant.identity : null, decodeSignal(payload));
    });
    // A new voice starts at the volume I chose (the phone build plays it without an element).
    r.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) (track as { setVolume?: (v: number) => void }).setVolume?.(volume);
    });
    if (cfg.attachAudio === false) return r;
    // Remote voices play through hidden <audio> elements, removed when the track goes away.
    r.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach();
      (track as { setVolume?: (v: number) => void }).setVolume?.(volume);
      el.style.display = 'none';
      document.body.appendChild(el);
    });
    r.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
    return r;
  }

  const engine: AudioEngine = {
    name: 'LiveKit (gerçek ses)',
    capabilities: { realAudio: true, backgroundAudio: false, reportsState: true },
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
      if (!room || !s.roomId || (typeof navigator !== 'undefined' && navigator.onLine === false)) return false;
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
      seat = null;
      pendingSeats = [];
      reportPeers(null, []);
      s.concurrent--;
      s.disconnects++;
      if (r) {
        if (cfg.attachAudio !== false) r.remoteParticipants.forEach((p) => p.audioTrackPublications.forEach((pub) => pub.track?.detach().forEach((el) => el.remove())));
        void r.disconnect().finally(() => releaseAudio(r));
      }
    },
    setPublishing(on) {
      if (!s.roomId) on = false;
      if (on === s.publishing) return;
      if (on) s.publishStarts++;
      s.publishing = on;
      if (room) setMic(room, on);
    },
    setPlaybackVolume(v) {
      volume = v;
      if (room) applyVolume(room);
    },
    setNoiseSuppression(on) {
      // The AI denoise (RNNoise) cleans what the phone's own suppression leaves (traffic, keyboards, a TV).
      setAiDenoise(on);
      if (on === denoise) return;
      denoise = on;
      const r = room;
      if (r) r.options.audioCaptureDefaults = capture();
      // Constraints can't be changed on a live mic everywhere (the phone's WebRTC): the mic track is dropped and,
      // when I'm speaking, taken again with the new setting. With no mic track yet, the next one uses it.
      const track = r?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
      if (!r || !track || recapturing) return;
      recapturing = r.localParticipant
        .unpublishTrack(track, true)
        .then(
          () => {},
          (e) => fail('Mikrofon', e),
        )
        .finally(() => {
          recapturing = null;
          if (room === r && s.publishing) setMic(r, true);
        });
    },
    setRoute(route) {
      // The system picks the output device; the route is kept for the session's state only.
      s.route = route;
    },
    stats: () => ({ ...s }),
  };
  return engine;
}
