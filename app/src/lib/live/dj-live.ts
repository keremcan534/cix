// DJ modu (server/api/dj-live.mjs): the room's owner or one of its DJs plugs a mixer or DJ controller into the phone
// (a USB/OTG sound card or a cable) and sends the mix live from the mic: no voice processing at all, at music quality,
// from the input they picked (lib/livekit-engine setDjMode, modules/similar-dj-input). The server says who may and
// writes the `dj` attribute every phone in the room shows; the voice engine reports here whether this phone is in it
// (and why it stopped), for the sheet (components/room/dj-live). No LiveKit import here, so Node tests can load it.
import { useSyncExternalStore } from 'react';

import * as api from '@/lib/api';

import type { DjInputDevice, DjInputKind } from '../../../modules/similar-dj-input';

export type DjPerson = { id: string; publicNo: string | null; name: string };
/** GET /api/rooms/dj-live: whether I may, whether I am on, the quality, how many at once, who is on now. */
export type DjLiveInfo = { may: boolean; on: boolean; kbps: number; perRoom: number; live: DjPerson[] };

/** Music quality bounds the engine keeps to whatever the server says (a voice is ~32 kbps). */
export const DJ_KBPS_MIN = 32;
export const DJ_KBPS_MAX = 192;
export const djKbps = (v: unknown) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 96;
  return Math.min(DJ_KBPS_MAX, Math.max(DJ_KBPS_MIN, n));
};

const OFF: DjLiveInfo = { may: false, on: false, kbps: 0, perRoom: 1, live: [] };
/** A malformed answer reads as "may not" (the switch stays hidden), never a crash. */
export function parseDjLive(raw: unknown): DjLiveInfo {
  if (!raw || typeof raw !== 'object') return OFF;
  const r = raw as Record<string, unknown>;
  const kbps = typeof r.kbps === 'number' && Number.isFinite(r.kbps) ? r.kbps : 0;
  const live = Array.isArray(r.live)
    ? r.live.flatMap((p): DjPerson[] => {
        if (!p || typeof p !== 'object') return [];
        const x = p as Record<string, unknown>;
        if (typeof x.id !== 'string') return [];
        return [{ id: x.id, publicNo: typeof x.publicNo === 'string' ? x.publicNo : null, name: typeof x.name === 'string' && x.name ? x.name : 'Üye' }];
      })
    : [];
  return {
    may: r.may === true && kbps > 0,
    on: r.on === true,
    kbps,
    perRoom: typeof r.perRoom === 'number' && r.perRoom >= 1 ? Math.floor(r.perRoom) : 1,
    live,
  };
}

export async function djLiveGet(room: string) {
  return parseDjLive(await api.apiRequest<unknown>('GET', `/api/rooms/dj-live?room=${encodeURIComponent(room)}`));
}
/** On: the server checks who I am, my mic and the others first; answers the quality to send at. */
export async function djLiveSet(room: string, on: boolean) {
  const r = await api.apiRequest<{ on?: unknown; kbps?: unknown }>('POST', '/api/rooms/dj-live', { room, on });
  return { on: r?.on === true, kbps: djKbps(r?.kbps) };
}

// --- This phone's DJ modu, as the voice engine runs it -------------------------------------------------
/** Why it stopped by itself: I left the mic, the server took it (no longer a DJ), the room ended. */
export type DjStop = 'seat' | 'server' | 'room';
export type DjState = { on: boolean; kbps: number; stopped: DjStop | null };
let state: DjState = { on: false, kbps: 0, stopped: null };
const listeners = new Set<() => void>();
export function reportDj(next: DjState) {
  if (next.on === state.on && next.kbps === state.kbps && next.stopped === state.stopped) return;
  state = next;
  listeners.forEach((l) => l());
}
export const djState = () => state;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useDjState = () => useSyncExternalStore(subscribe, djState, djState);

/** What the sheet says when it stopped by itself. */
export const DJ_STOP_TEXT: Record<DjStop, string> = {
  seat: 'Mikrofondan indiğin için DJ modu kapandı.',
  server: 'DJ modu kapandı: oda sahibi seni DJ’likten aldı ya da yönetim kapattı.',
  room: 'Odadan çıktığın için DJ modu kapandı.',
};

/**
 * Who is live as DJ in the room for the bar every phone shows: people in DJ modu whom the room lets (its owner and its
 * DJs, local ids). `peers` are the room's people with their LiveKit `dj` attribute.
 */
export function liveDjsOf<P extends { identity: string; name: string; dj?: boolean }>(peers: readonly P[], may: (identity: string) => boolean): P[] {
  return peers.filter((p) => p.dj === true && may(p.identity));
}

// --- The inputs to pick (Android: modules/similar-dj-input) ----------------------------------------------
/** One input to pick: a phone's (Android id) or the browser's (device id); `auto`: the phone picks. */
export type DjChoice = { key: string; label: string; sub: string; nativeInput?: number; deviceId?: string; external: boolean; warn?: boolean };

const KIND_LABEL: Record<DjInputKind, string> = {
  usb: 'USB ses kartı / mikser',
  line: 'Hat girişi (kablo)',
  wired: 'Kablolu giriş (kulaklık soketi)',
  phone: 'Telefonun mikrofonu',
  bluetooth: 'Bluetooth',
  other: 'Diğer giriş',
};
/** The order an external input is picked in by itself: a USB sound card first. */
const KIND_ORDER: DjInputKind[] = ['usb', 'line', 'wired', 'phone', 'bluetooth', 'other'];

/** The phone's inputs as choices, one per kind and name (a phone lists its several mics as one). */
export function choicesOf(list: readonly DjInputDevice[]): DjChoice[] {
  const seen = new Set<string>();
  const out: DjChoice[] = [];
  for (const kind of KIND_ORDER)
    for (const d of list) {
      if (d.kind !== kind) continue;
      const key = `${d.kind}:${kind === 'phone' ? '' : d.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const external = kind === 'usb' || kind === 'line' || kind === 'wired';
      out.push({
        key: `n${d.id}`,
        label: KIND_LABEL[kind],
        sub: kind === 'bluetooth' ? 'Önerilmez: gecikir ve sesi sıkıştırır.' : d.name && kind !== 'phone' ? d.name : kind === 'phone' ? 'Ortamdaki sesi alır; mikser için harici giriş kullan.' : '',
        nativeInput: d.id,
        external,
        warn: kind === 'bluetooth',
      });
    }
  return out;
}
