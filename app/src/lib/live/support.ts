// Live mode (lib/live): my support tickets on the server (server/api/support.mjs) for Destek › Taleplerim and the
// Sorun Takibi row. Read again each time the Destek screen comes to the front, after each change made here, and
// while the screen is open when a staff reply arrives on the live line (type 'support'). Another account signed in
// on this phone starts from nothing. Without a server address nothing here runs.
import { useIsFocused } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';

import * as api from '@/lib/api';
import { liveMode, myServerId } from '@/lib/live';
import { onLine } from '@/lib/live/live-line';
import { uploadPhoto, type PickedImage } from '@/lib/live/profile';
import { ticketView, type TicketView } from '@/lib/support-tickets';

export type LiveTickets = { tickets: TicketView[] | null; failed: boolean; open: number; maxOpen: number };
type Snap = LiveTickets & { owner: string | null };

const EMPTY: Snap = { owner: null, tickets: null, failed: false, open: 0, maxOpen: 3 };
let snap: Snap = EMPTY;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const put = (s: Snap) => {
  snap = s;
  listeners.forEach((l) => l());
};

let reading: Promise<void> | null = null;
/** Reads my tickets again (one read at a time); a failed read keeps what was there and says so. */
export function refreshTickets(): Promise<void> {
  if (!liveMode()) return Promise.resolve();
  reading ??= (async () => {
    const owner = myServerId();
    const r = await api.myTickets();
    put({ owner, tickets: r.tickets.map((t) => ticketView(t)), failed: false, open: r.open, maxOpen: r.maxOpen });
  })()
    .catch(() => put({ ...snap, failed: true }))
    .finally(() => (reading = null));
  return reading;
}

/** My tickets: null until read (and always without a server); read again when the screen is in front. */
export function useLiveTickets(): LiveTickets {
  const s = useSyncExternalStore(subscribe, () => snap, () => snap);
  const focused = useIsFocused();
  useEffect(() => {
    if (!liveMode() || !focused) return;
    void refreshTickets();
    return onLine((e) => {
      if (e.type === 'support') void refreshTickets();
    });
  }, [focused]);
  const me = myServerId();
  return me && s.owner && s.owner !== me ? { ...EMPTY, tickets: null } : s;
}

/**
 * A new ticket: its photos go to the storage first (made smaller, lib/live/profile), then the ticket. Throws the
 * server's refusal (too many open tickets, too short) as it is.
 */
export async function sendTicket(t: { category: string; text: string; feedback: boolean; photos: PickedImage[] }): Promise<TicketView> {
  const photos: string[] = [];
  for (const p of t.photos) photos.push(await uploadPhoto('ticket', p));
  const made = await api.openTicket({ category: t.category, text: t.text, feedback: t.feedback, ...(photos.length ? { photos } : {}) });
  await refreshTickets();
  return ticketView(made);
}

/** I write again on a ticket (an answered or closed one opens again). */
export async function answerTicket(id: string, text: string) {
  await api.replyTicket(id, text);
  await refreshTickets();
}

/** "Çözüldü olarak kapat". */
export async function closeMyTicket(id: string) {
  await api.closeTicket(id);
  await refreshTickets();
}
