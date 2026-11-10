// Mesajlar › Aramalar rows from the server's call history (lib/live/call-log), in the shape of the demo's CALL_HISTORY
// (data/messages-ui CallLog) plus what only a real call has: how it ended when nobody talked, and what it cost or
// earned. Pure, so the wording is unit tested.
import type { ServerCallLog } from '@/lib/api';
import { messageTime, type CallLog } from '@/data/messages-ui';

export type CallRowData = CallLog & {
  /** How a call nobody talked in ended: "Cevap yok", "Reddedildi" … */
  note?: string;
  /** "120 jeton" paid or "+120 elmas" earned. */
  money?: string;
};

const fmt = (n: number) => n.toLocaleString('tr-TR');

/** How it ended, when it never went live. */
function noteOf(c: ServerCallLog): string | undefined {
  if (c.status === 'declined') return c.outgoing ? 'Reddedildi' : 'Reddettin';
  if (c.status === 'missed' && c.outgoing) return 'Cevap yok';
  if (c.status === 'cancelled' && c.outgoing) return 'İptal edildi';
  return undefined;
}

/** `local`: a server id as this phone names people (lib/live toLocal). */
export function liveCallRows(list: readonly ServerCallLog[], local: (id: string) => string, now = new Date()): CallRowData[] {
  return list.map((c) => {
    // A call to me that rang out or that the caller gave up on is a missed one, as on a phone.
    const direction: CallLog['direction'] = c.outgoing ? 'out' : c.status === 'missed' || c.status === 'cancelled' ? 'missed' : 'in';
    const note = noteOf(c);
    const money = c.iPay ? `${fmt(c.coins)} jeton` : c.iEarn ? `+${fmt(c.coins)} elmas` : undefined;
    return {
      id: `call-${c.id}`,
      userId: local(c.other.id),
      kind: c.mode,
      direction,
      duration: c.status === 'ended' ? c.seconds : 0,
      time: messageTime({ time: '', at: c.at }, now),
      ...(note && { note }),
      ...(money && { money }),
    };
  });
}
