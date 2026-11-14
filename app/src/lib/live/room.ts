// A server room on the room screen (lib/live): the room's presence model (lib/room-presence) follows the real
// voice connection instead of the demo's simulated people. Everyone connected to the room's LiveKit room is in
// it; the mic each one sits on is their own `seat` attribute; talking rings follow LiveKit's active speakers.
// The people already connected when this phone comes in join its presence too, but as people who were here first
// (lib/room-entrance PeerJoin.fresh false): only someone who comes in after me is an entrance (a line, their effect).
// Returns who has switched their mic off, so their seat shows it on every phone.
// My own seat goes out the same way, so every phone draws the same mics. When the owner or an admin moves me or
// takes me off a mic (server/api/rooms.mjs), the server changes that attribute and this phone follows it.
import { useEffect, useMemo, useRef } from 'react';

import { getRoom, join, leave, leaveSeat, takeSeat } from '@/lib/room-presence';
import { rememberUser, refreshWallet, toLocal } from '@/lib/live';
import { onServerSeat, onSignal, publishSeat, useLivePeers, type RoomSignal } from '@/lib/live/room-bus';
import { peerChanges, type PeerJoin } from '@/lib/room-entrance';

type Hooks = {
  /** Someone is now in the room / went out (their local id and name). */
  onJoin: (uid: string, name: string, join: PeerJoin) => void;
  onLeave: (uid: string, name: string) => void;
  /** A chat line another phone sent here, or a gift the server announced. `from` is the sender's local id. */
  onSignal: (from: string, msg: RoomSignal) => void;
  setSpeaking: (ids: Set<string>) => void;
  /** The owner or an admin put me on this mic (null = took me off); presence already follows. */
  onServerSeat?: (seat: number | null) => void;
};

export function useLiveRoomSync(roomId: string, enabled: boolean, mySeat: number | null, hooks: Hooks) {
  const { peers, meSpeaking, meJoinedAt } = useLivePeers(roomId);
  const hooksRef = useRef(hooks);
  useEffect(() => {
    hooksRef.current = hooks;
  });
  const names = useRef(new Map<string, string>());
  // When each person left during this visit (this phone's clock).
  const leftAt = useRef(new Map<string, number>());

  // Presence and mics follow the connected phones.
  useEffect(() => {
    if (!enabled || !getRoom(roomId)) return;
    const here = new Map(peers.map((p) => [toLocal(p.identity), p]));
    here.delete('me'); // my own account on a second phone: not shown twice
    for (const p of peers) rememberUser({ id: p.identity, name: p.name });
    const now = Date.now();
    const { leaves, joins } = peerChanges(getRoom(roomId)!.members, here, meJoinedAt, leftAt.current, now);
    for (const uid of leaves) {
      leave(roomId, uid);
      leftAt.current.set(uid, now);
      hooksRef.current.onLeave(uid, names.current.get(uid) ?? 'Bir üye');
      names.current.delete(uid);
    }
    for (const j of joins) if (join(roomId, j.uid).ok) hooksRef.current.onJoin(j.uid, j.name, j.join);
    for (const [uid, p] of here) {
      names.current.set(uid, p.name);
      const r = getRoom(roomId)!;
      if (p.seat !== null && r.seats[p.seat] !== uid) takeSeat(roomId, uid, p.seat);
      else if (p.seat === null && r.seats.includes(uid)) leaveSeat(roomId, uid);
    }
    const talking = new Set(peers.filter((p) => p.speaking).map((p) => toLocal(p.identity)));
    if (meSpeaking) talking.add('me');
    hooksRef.current.setSpeaking(talking);
  }, [enabled, roomId, peers, meSpeaking, meJoinedAt]);

  // My mic, for the other phones.
  useEffect(() => {
    if (enabled) publishSeat(mySeat);
  }, [enabled, mySeat]);
  useEffect(() => () => void (enabled && publishSeat(null)), [enabled]);

  // A seat the server set for me: presence follows, and the mic effect above then has nothing new to publish.
  useEffect(() => {
    if (!enabled) return;
    return onServerSeat(roomId, (seat) => {
      if (!getRoom(roomId)) return;
      if (seat === null || !takeSeat(roomId, 'me', seat).ok) leaveSeat(roomId, 'me');
      hooksRef.current.onServerSeat?.(seat === null || getRoom(roomId)!.seats[seat] !== 'me' ? null : seat);
    });
  }, [enabled, roomId]);

  // Chat lines from the other phones and gifts the server announced. A gift to me also changed my balance on
  // the server: read it now. My own gift was already drawn when the server said it was paid (no second time).
  useEffect(() => {
    if (!enabled) return;
    return onSignal(roomId, (from, msg) => {
      const sender = toLocal(from);
      const gift = msg.t === 'gift' || msg.t === 'lucky';
      // My own gifts and paid Hareketli were drawn when the server said they were paid (no second time).
      if ((gift || msg.t === 'fx') && sender === 'me') return;
      if (gift && msg.to.some((t) => toLocal(t) === 'me')) void refreshWallet().catch(() => {});
      hooksRef.current.onSignal(sender, msg);
    });
  }, [enabled, roomId]);

  return useMemo(() => new Set(enabled ? peers.filter((p) => !p.micOn).map((p) => toLocal(p.identity)) : []), [enabled, peers]);
}
