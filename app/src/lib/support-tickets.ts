// Destek talepleri as the Destek screen shows them: a server ticket (server/api/support.mjs) in the shape of the
// demo's tickets (store Ticket), and the rules the form checks before sending. Pure, so the node tests can check it.
import { TICKET_CATEGORIES, type TicketCategory } from '@/data/catalog';
import { fmtDate } from '@/lib/admin-format';
import type { ServerTicket, ServerTicketStatus } from '@/lib/api';
import type { Ticket } from '@/store';

/** The server's limits (support.mjs), checked here first so the form can say so before sending. */
export const TICKET_MIN_TEXT = 10;
export const TICKET_MAX_TEXT = 2000;
export const TICKET_MAX_PHOTOS = 3;

export const TICKET_STATUS_LABEL: Record<ServerTicketStatus, Ticket['status']> = {
  open: 'Açık',
  answered: 'Yanıtlandı',
  reopened: 'Yeniden açıldı',
  closed: 'Çözüldü',
};

/** A ticket on the Destek screen: the demo's shape, with its evidence photos and whether it is feedback. */
export type TicketView = Ticket & { photos: string[]; feedback: boolean };

const category = (c: string): TicketCategory => (TICKET_CATEGORIES.includes(c as TicketCategory) ? (c as TicketCategory) : 'Teknik');

/** A server ticket as the screen shows it; times are "4 Kas 14:05" (lib/admin-format fmtDate). */
export function ticketView(t: ServerTicket, now = new Date()): TicketView {
  return {
    id: t.id,
    number: t.number,
    category: category(t.category),
    text: t.text,
    status: TICKET_STATUS_LABEL[t.status] ?? 'Açık',
    time: fmtDate(t.createdAt, now),
    replies: t.messages.map((m) => ({ from: m.from === 'support' ? 'support' : 'me', text: m.text, time: fmtDate(m.createdAt, now) })),
    photos: t.photos ?? [],
    feedback: !!t.feedback,
  };
}

/** Why the form can't be sent yet, or null. */
export function ticketProblem(text: string, photos: number): string | null {
  const n = text.trim().length;
  if (n < TICKET_MIN_TEXT) return `Lütfen sorunu biraz daha detaylı anlat (en az ${TICKET_MIN_TEXT} karakter)`;
  if (n > TICKET_MAX_TEXT) return `Açıklama en fazla ${TICKET_MAX_TEXT.toLocaleString('tr-TR')} karakter olabilir`;
  if (photos > TICKET_MAX_PHOTOS) return `En fazla ${TICKET_MAX_PHOTOS} fotoğraf eklenebilir`;
  return null;
}

/** "3 talep · 1 yanıtlandı" for the Sorun Takibi row, or undefined with none. */
export function ticketSummary(tickets: Pick<Ticket, 'status'>[]): string | undefined {
  if (!tickets.length) return undefined;
  return `${tickets.length} talep · ${tickets.filter((t) => t.status === 'Yanıtlandı').length} yanıtlandı`;
}
