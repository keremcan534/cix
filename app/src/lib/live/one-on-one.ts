// 1v1 on the server (server/api/one-on-one.mjs): what two people can do together (message price, heart level,
// which calls are open), voice and video calls, and Eşleşme. The server decides and charges everything; the
// phone only shows its answers.
//
// The open call is one module-level store (useCall), so the incoming call card (components/incoming-call) and the
// call and Eşleşme screens read the same thing. While a call is open it is beaten every few seconds (the server
// ends a call nobody hears from); otherwise GET /api/calls/current is read now and then, so a call that rings
// while the app is open shows at once.
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import * as api from '@/lib/api';
import { liveCalls, once, refreshWallet, rememberUser, toLocal } from '@/lib/live';

export type CallMode = 'voice' | 'video';
export type CallStatus = 'ringing' | 'live' | 'ended' | 'missed' | 'declined' | 'cancelled';
export type CallView = {
  id: number;
  kind: 'call' | 'match';
  mode: CallMode;
  status: CallStatus;
  endReason: string | null;
  incoming: boolean;
  other: { id: string; name: string; avatarUrl: string | null };
  iPay: boolean;
  iEarn: boolean;
  price: number;
  free: boolean;
  maxSeconds: number | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  minutes: number;
  coins: number;
  serverNow: string;
};
export type CallGate = { open: boolean; price: number; why: string | null };
export type Pair = {
  streamer: boolean;
  meStreamer: boolean;
  mutual: boolean;
  iPay: boolean;
  dmPrice: number;
  heart: { points: number; level: number; next: number | null; floor: number; voiceAt: number; videoAt: number };
  calls: { voice: CallGate; video: CallGate };
};
export type MatchRights = { streamer: boolean; free: number; freeLeft: number; nextFreeAt: string | null; seconds: number; price: { voice: number; video: number } };
export type MatchAnswer = { state: 'idle' | 'waiting' | 'matched'; mode?: CallMode | null; call: CallView | null; rights: MatchRights };

export { liveCalls };

export const isOpen = (c: CallView | null | undefined): boolean => !!c && (c.status === 'ringing' || c.status === 'live');

// --- Pair ----------------------------------------------------------------------------------------------------
export async function loadPair(peer: string) {
  return (await api.apiRequest<{ pair: Pair }>('GET', `/api/one-on-one?with=${encodeURIComponent(peer)}`)).pair;
}

// --- The open call -------------------------------------------------------------------------------------------
let current: CallView | null = null;
// The server's clock minus this phone's, from the last answer (a call's timer counts on the server's time).
let offset = 0;
const listeners = new Set<() => void>();
function put(c: CallView | null) {
  if (c) {
    offset = Date.parse(c.serverNow) - Date.now();
    rememberUser(c.other);
  }
  const was = current;
  current = c;
  // Money moved (a minute or a match charged): the wallet follows.
  if (c && was && c.id === was.id && c.coins !== was.coins && c.iPay) void refreshWallet().catch(() => {});
  listeners.forEach((l) => l());
  schedule();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useCall = () => useSyncExternalStore(subscribe, () => current, () => current);
export const currentCall = () => current;
/** Seconds since the call went live, on the server's clock. */
export const liveSeconds = (c: CallView) => (c.startedAt ? Math.max(0, Math.floor((Date.now() + offset - Date.parse(c.startedAt)) / 1000)) : 0);
/** The other person as this phone names them. */
export const otherId = (c: CallView) => toLocal(c.other.id);

let timer: ReturnType<typeof setTimeout> | undefined;
let watching = false;
let busy = false;
const BEAT_MS = 3_000;
const IDLE_MS = 6_000;
function schedule() {
  clearTimeout(timer);
  if (!watching) return;
  timer = setTimeout(tick, isOpen(current) ? BEAT_MS : IDLE_MS);
}
async function tick() {
  if (busy || !watching) return schedule();
  // In the background nothing rings on screen; an open call keeps beating so it isn't ended as lost.
  if (AppState.currentState !== 'active' && !isOpen(current)) return schedule();
  busy = true;
  try {
    if (current && isOpen(current)) put((await api.apiRequest<{ call: CallView }>('POST', '/api/calls/beat', { id: current.id })).call);
    else {
      // Nothing open: a call that rings now shows (an ended one this phone still shows stays until dismissed).
      const r = await api.apiRequest<{ call: CallView | null }>('GET', '/api/calls/current');
      if (r.call) put(r.call);
    }
  } catch {
    // No connection: the next tick asks again.
  } finally {
    busy = false;
    schedule();
  }
}
/** Starts reading the open call (components/incoming-call, once signed in). Returns the stop. */
export function watchCalls() {
  watching = true;
  void tick();
  // Back in the app (a push about a call opened it): ask at once.
  const sub = AppState.addEventListener('change', (s) => s === 'active' && void tick());
  return () => {
    watching = false;
    clearTimeout(timer);
    sub.remove();
  };
}
/** Reads the open call now (a screen that just opened). */
export async function refreshCall() {
  const r = await api.apiRequest<{ call: CallView | null }>('GET', '/api/calls/current');
  put(r.call);
  return r.call;
}
/** A call this screen is done with stops showing (the ended call stays only until it is dismissed). */
export const dismissCall = (id: number) => current?.id === id && !isOpen(current) && put(null);

/** Calls `to` (my answer: the ringing call). A short balance or a locked gate comes back as an ApiError. */
export async function startCall(to: string, mode: CallMode) {
  const r = await once(`call:${to}:${mode}`, (ref) => api.apiRequest<{ call: CallView }>('POST', '/api/calls', { to, mode, ref }));
  put(r.call);
  return r.call;
}
/** Answers an incoming call: the call and the media token (null when my answer found the caller out of coins). */
export async function answerCall(id: number) {
  const r = await api.apiRequest<{ call: CallView; token: string | null }>('POST', '/api/calls/answer', { id });
  put(r.call);
  return r;
}
/** The media token of a live call (the caller, once answered; a match). */
export async function callToken(id: number) {
  return (await api.apiRequest<{ token: string }>('POST', '/api/calls/join', { id })).token;
}
/** Hangs up, declines or cancels. */
export async function hangUp(id: number) {
  const r = await api.apiRequest<{ call: CallView }>('POST', '/api/calls/end', { id });
  put(r.call);
  void refreshWallet().catch(() => {});
  return r.call;
}

// --- Eşleşme -------------------------------------------------------------------------------------------------
function matchPut(r: MatchAnswer) {
  if (r.call) put(r.call);
  return r;
}
export const joinMatch = async (mode: CallMode) => matchPut(await api.apiRequest<MatchAnswer>('POST', '/api/match/join', { mode }));
export const matchState = async () => matchPut(await api.apiRequest<MatchAnswer>('POST', '/api/match/state', {}));
export const leaveMatch = async () => matchPut(await api.apiRequest<MatchAnswer>('POST', '/api/match/leave', {}));

// --- Words ---------------------------------------------------------------------------------------------------
export const MODE_NAME: Record<CallMode, string> = { voice: 'Sesli', video: 'Görüntülü' };

/** Why an ended call ended, for the end screen. */
export function endText(c: CallView): string {
  if (c.status === 'missed') return c.incoming ? 'Cevapsız arama' : 'Cevap yok';
  if (c.status === 'declined') return c.incoming ? 'Aramayı reddettin' : `${c.other.name} aramayı reddetti`;
  if (c.status === 'cancelled') return c.incoming ? `${c.other.name} aramayı iptal etti` : 'Arama iptal edildi';
  if (c.endReason === 'time') return 'Ücretsiz eşleşme süresi doldu';
  if (c.endReason === 'coins') return c.iPay ? 'Jetonun bittiği için görüşme bitti' : 'Karşı tarafın jetonu bittiği için görüşme bitti';
  if (c.endReason === 'lost') return 'Bağlantı koptuğu için görüşme bitti';
  if (c.endReason === 'deleted') return 'Görüşme sona erdi';
  return 'Görüşme bitti';
}

/** A refusal from the server, in words the call screens show. */
export function refusal(e: unknown): { text: string; coins: boolean } {
  if (e instanceof api.ApiError) {
    const code = e.data.code;
    if (code === 'insufficient' || code === 'reward_coins_only') return { text: code === 'insufficient' ? 'Yetersiz jeton. Jeton yükleyip tekrar dene.' : e.message, coins: true };
    return { text: e.message, coins: false };
  }
  return { text: 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.', coins: false };
}
