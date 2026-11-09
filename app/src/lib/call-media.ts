// The voice and video of one 1v1 call (lib/live/one-on-one): a LiveKit room `call-<id>` with only the two people
// in it, joined with the token the server gives for that call. Separate from the voice room engine
// (livekit-engine): a call that starts ends the voice room this phone is in, so two rooms never play at once.
//
// One call at a time, held in a module-level store (useCallMedia). Every async step checks the room is still
// the current one, so hanging up mid-join never leaves a connection open.
import { ConnectionState, Room, RoomEvent, Track, type LocalVideoTrack, type Participant, type RemoteTrack, type TrackPublication } from 'livekit-client';
import { useSyncExternalStore } from 'react';

import { beginCall, endCall } from '@/lib/media';
import { endRoom, getSession } from '@/lib/room-session';
import { ensureWebRtc, holdAudio, playRemote, releaseAudio } from '@/lib/webrtc-globals';

/** What a video view shows (the shape of @livekit/components-react's TrackReference). */
export type TrackRef = { participant: Participant; publication: TrackPublication; source: Track.Source };
export type CallMediaState = {
  callId: number | null;
  status: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
  /** The other person is in the room (their phone joined). */
  peerHere: boolean;
  remoteVideo: TrackRef | null;
  localVideo: TrackRef | null;
  micOn: boolean;
  camOn: boolean;
  front: boolean;
  error: string | null;
};
const IDLE: CallMediaState = { callId: null, status: 'idle', peerHere: false, remoteVideo: null, localVideo: null, micOn: true, camOn: true, front: true, error: null };

let state = IDLE;
const listeners = new Set<() => void>();
const patch = (p: Partial<CallMediaState>) => {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useCallMedia = () => useSyncExternalStore(subscribe, () => state, () => state);

const URL = process.env.EXPO_PUBLIC_LIVEKIT_URL ?? '';
const CAPTURE = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

let room: Room | null = null;
// Remote voices this phone plays (web needs an element each; a phone plays them by itself).
const playing = new Map<string, () => void>();

const camRef = (r: Room): TrackRef | null => {
  const pub = r.localParticipant.getTrackPublication(Track.Source.Camera);
  return pub?.track && !pub.isMuted ? { participant: r.localParticipant, publication: pub, source: Track.Source.Camera } : null;
};
const remoteCam = (r: Room): TrackRef | null => {
  for (const p of r.remoteParticipants.values()) {
    const pub = p.getTrackPublication(Track.Source.Camera);
    if (pub?.track && !pub.isMuted) return { participant: p, publication: pub, source: Track.Source.Camera };
  }
  return null;
};
const refresh = (r: Room) => room === r && patch({ peerHere: r.remoteParticipants.size > 0, remoteVideo: remoteCam(r), localVideo: camRef(r) });

/**
 * Joins the call's room. `peer` is the other person's id on this phone (lib/media keeps the mic and camera for the
 * call, so a room screen underneath doesn't take them).
 */
export async function joinCallMedia(callId: number, token: string, video: boolean, peer: string) {
  if (room && state.callId === callId) return;
  leaveCallMedia();
  if (!URL) return patch({ ...IDLE, callId, status: 'failed', error: 'Arama sunucusu ayarlı değil' });
  // A voice room would play over the call: the call wins.
  const s = getSession().session;
  if (s && s.status !== 'ended') endRoom('left');
  ensureWebRtc();
  endCall();
  beginCall({ kind: 'direct', mode: video ? 'video' : 'voice', peerId: peer });
  const r = new Room({ adaptiveStream: true, dynacast: true });
  room = r;
  patch({ ...IDLE, callId, status: 'connecting', camOn: video });
  r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
    if (track.kind === Track.Kind.Audio && track.sid) playing.set(track.sid, playRemote(track));
    refresh(r);
  })
    .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      if (track.sid) playing.get(track.sid)?.();
      if (track.sid) playing.delete(track.sid);
      refresh(r);
    })
    .on(RoomEvent.TrackMuted, () => refresh(r))
    .on(RoomEvent.TrackUnmuted, () => refresh(r))
    .on(RoomEvent.LocalTrackPublished, () => refresh(r))
    .on(RoomEvent.LocalTrackUnpublished, () => refresh(r))
    .on(RoomEvent.ParticipantConnected, () => refresh(r))
    .on(RoomEvent.ParticipantDisconnected, () => refresh(r))
    .on(RoomEvent.Reconnecting, () => room === r && patch({ status: 'reconnecting' }))
    .on(RoomEvent.Reconnected, () => room === r && patch({ status: 'connected' }))
    .on(RoomEvent.Disconnected, () => room === r && patch({ status: 'failed', error: 'Görüşme bağlantısı koptu' }));
  try {
    await holdAudio('call');
    if (room !== r) return;
    await r.connect(URL, token);
    if (room !== r) return void r.disconnect();
    await r.startAudio().catch(() => {});
    patch({ status: 'connected' });
    await r.localParticipant.setMicrophoneEnabled(true, CAPTURE).catch(() => room === r && patch({ micOn: false, error: 'Mikrofon izni yok' }));
    if (video) await r.localParticipant.setCameraEnabled(true, { facingMode: 'user' }).catch(() => room === r && patch({ camOn: false, error: 'Kamera izni yok' }));
    refresh(r);
  } catch (e) {
    if (room !== r) return;
    patch({ status: 'failed', error: e instanceof Error ? e.message : 'Görüşmeye bağlanılamadı' });
  }
}

/** Leaves the call's room (hung up, ended, or the screen closed). */
export function leaveCallMedia() {
  const r = room;
  if (!r) return;
  room = null;
  playing.forEach((stop) => stop());
  playing.clear();
  void r.disconnect().finally(() => void releaseAudio('call'));
  endCall();
  patch(IDLE);
}

export function setCallMic(on: boolean) {
  const r = room;
  if (!r || r.state !== ConnectionState.Connected) return;
  patch({ micOn: on });
  void r.localParticipant.setMicrophoneEnabled(on, on ? CAPTURE : undefined).catch(() => room === r && patch({ micOn: !on }));
}
export function setCallCamera(on: boolean) {
  const r = room;
  if (!r || r.state !== ConnectionState.Connected) return;
  patch({ camOn: on });
  void r.localParticipant
    .setCameraEnabled(on, on ? { facingMode: state.front ? 'user' : 'environment' } : undefined)
    .then(() => refresh(r))
    .catch(() => room === r && patch({ camOn: !on }));
}
/** Front or back camera. */
export function flipCallCamera() {
  const r = room;
  const track = r?.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
  if (!r || !track) return;
  const front = !state.front;
  patch({ front });
  void track
    .restartTrack({ facingMode: front ? 'user' : 'environment' })
    .then(() => refresh(r))
    .catch(() => room === r && patch({ front: !front }));
}
