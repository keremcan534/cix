// Şanslı çanta on the server (server/api/lucky-bags.mjs): a bag of coins or of gifts dropped in a room, shared at
// random by the first people who open it. The server takes the coins, draws the shares, pays each opener and gives
// back what nobody took; the phone only shows its answers. A new bag is announced in the room by the server
// (LiveKit packet 'bag', lib/live/room-bus), so the room reads its bags again at once.
import { useEffect, useRef, useState } from 'react';

import * as api from '@/lib/api';
import { applyServerUser, once, refreshWallet, rememberUser } from '@/lib/live';
import { onServerBag } from '@/lib/live/room-bus';

export type BagKind = 'coins' | 'gift';
export type BagPerson = { id: string; name: string; avatarUrl: string | null };
export type Bag = {
  id: number;
  room: string;
  kind: BagKind;
  giftId: string | null;
  unitPrice: number;
  units: number;
  coins: number;
  packets: number;
  left: number;
  followersOnly: boolean;
  opensAt: string;
  closesAt: string;
  status: 'open' | 'done' | 'returned';
  from: BagPerson;
  mine: boolean;
  /** What I took from it (units), or null. */
  got: number | null;
};
export type BagGrab = { user: BagPerson; units: number; coins: number };
export type BagRules = { coins: number[]; coinPackets: number[]; giftCounts: number[]; giftPackets: number[]; delays: number[]; windowSeconds: number };
export type BagDrop = { kind: 'coins'; amount: number; packets: number; delay: number; followersOnly: boolean } | { kind: 'gift'; giftId: string; count: number; packets: number; delay: number; followersOnly: boolean };
export type BagGot = { units: number; coins: number; kind: BagKind; giftId: string | null };

/** What the server allows when it hasn't answered yet (server/api/lucky-bag-rules.mjs). */
export const BAG_DEFAULTS: BagRules = { coins: [1_000, 5_000, 10_000, 50_000], coinPackets: [5, 10, 20, 30], giftCounts: [10, 30, 99], giftPackets: [5, 10, 15], delays: [0, 120, 300], windowSeconds: 180 };

let offset = 0;
const clock = (serverNow: string | undefined) => {
  const t = serverNow ? Date.parse(serverNow) : NaN;
  if (Number.isFinite(t)) offset = t - Date.now();
};
/** Now on the server's clock (a bag opens and closes by it). */
export const serverNow = () => Date.now() + offset;

export async function roomBags(room: string) {
  const r = await api.apiRequest<{ bags: Bag[]; rules: BagRules; serverNow: string }>('GET', `/api/lucky-bags?room=${encodeURIComponent(room)}`);
  clock(r.serverNow);
  r.bags.forEach((b) => rememberUser(b.from));
  return r;
}

export async function bagDetail(id: number) {
  const r = await api.apiRequest<{ bag: Bag; grabs: BagGrab[]; serverNow: string }>('GET', `/api/lucky-bags/one?id=${id}`);
  clock(r.serverNow);
  return r;
}

/** Drops a bag (the coins leave at once). A short balance comes back as an ApiError (code insufficient). */
export async function dropBag(room: string, d: BagDrop) {
  const key = d.kind === 'coins' ? `bag:${room}:c:${d.amount}:${d.packets}:${d.delay}:${d.followersOnly}` : `bag:${room}:g:${d.giftId}:${d.count}:${d.packets}:${d.delay}:${d.followersOnly}`;
  const r = await once(key, (ref) => api.apiRequest<{ user: api.ServerUser; replay: boolean; bag: Bag }>('POST', '/api/lucky-bags', { room, ...d, ref }));
  applyServerUser(r, d.kind === 'coins' ? 'Jeton çantası' : 'Hediye çantası');
  return r.bag;
}

/** Opens a bag: my share, the bag after it and who took what. Refusals (early, empty, taken, followers) are ApiErrors. */
export async function grabBag(id: number) {
  const r = await api.apiRequest<{ got: BagGot; bag: Bag; grabs: BagGrab[] }>('POST', '/api/lucky-bags/grab', { id });
  void refreshWallet().catch(() => {});
  return r;
}

/** Why the server refused to open a bag, as a code the sheet shows differently (or null for anything else). */
export const grabCode = (e: unknown): 'early' | 'empty' | 'taken' | 'followers' | null => {
  const c = e instanceof api.ApiError ? e.data.code : null;
  return c === 'early' || c === 'empty' || c === 'taken' || c === 'followers' ? c : null;
};

const POLL_MS = 15_000;

/**
 * The room's open bags while I'm in a server room (`on`), read again when the server announces one and now and
 * then while any is open. Bags past their time drop off here. `onNew` hears of each bag the first time a read
 * brings it (a bag `put` here never comes to it).
 */
/** `onNew(bag, fresh)`: a bag seen for the first time; `fresh` when it came after the room's first answer (just dropped). */
export function useRoomBags(room: string, on: boolean, onNew?: (b: Bag, fresh: boolean) => void) {
  const [state, setState] = useState<{ room: string; bags: Bag[]; rules: BagRules }>({ room, bags: [], rules: BAG_DEFAULTS });
  const [n, setN] = useState(0);
  const [now, setNow] = useState(() => serverNow());
  const heard = useRef(onNew);
  useEffect(() => {
    heard.current = onNew;
  });
  const seen = useRef(new Set<number>());
  // The bags already there when the room opened are no news: only later ones are "fresh".
  const loaded = useRef(false);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    roomBags(room)
      .then((r) => {
        if (!alive) return;
        for (const b of r.bags) {
          if (seen.current.has(b.id)) continue;
          seen.current.add(b.id);
          heard.current?.(b, loaded.current);
        }
        loaded.current = true;
        setState({ room, bags: r.bags, rules: r.rules });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [room, on, n]);
  useEffect(() => {
    if (!on) return;
    return onServerBag(room, () => setN((x) => x + 1));
  }, [room, on]);
  const mine = state.room === room ? state.bags : [];
  const any = on && mine.length > 0;
  useEffect(() => {
    if (!any) return;
    const tick = setInterval(() => setNow(serverNow()), 1000);
    const poll = setInterval(() => setN((x) => x + 1), POLL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [any]);
  const bags = on ? mine.filter((b) => b.status === 'open' && Date.parse(b.closesAt) > now && (b.left > 0 || b.got !== null)) : [];
  return {
    bags,
    rules: state.rules,
    now,
    reload: () => setN((x) => x + 1),
    /** A bag the screen learned about (dropped or opened here): shown at once, before the next read. */
    put: (b: Bag) => {
      seen.current.add(b.id);
      setState((s) => (s.room === room ? { ...s, bags: [...s.bags.filter((x) => x.id !== b.id), b] } : s));
    },
  };
}
