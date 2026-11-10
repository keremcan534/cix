// Destek talepleri on the Destek screen (lib/support-tickets): a server ticket in the demo's shape (status words, "Destek"
// for staff lines, photos), the form's checks before sending, and the Sorun Takibi summary.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { ServerTicket } from '@/lib/api';
import { TICKET_STATUS_LABEL, ticketProblem, ticketSummary, ticketView } from '@/lib/support-tickets';

const at = (h: number, m = 0) => new Date(2026, 10, 10, h, m).toISOString();
const ticket = (p: Partial<ServerTicket> = {}): ServerTicket => ({
  id: '7',
  number: 'TK-10007',
  category: 'Ödeme',
  feedback: false,
  text: 'Ödemem bakiyeme yansımadı',
  photos: ['https://x/ticket/u/a.jpg'],
  status: 'answered',
  createdAt: at(9, 5),
  updatedAt: at(10),
  closedAt: null,
  messages: [
    { id: '1', from: 'support', text: 'İnceliyoruz', createdAt: at(9, 30) },
    { id: '2', from: 'user', text: 'Teşekkürler', createdAt: at(9, 45) },
  ],
  ...p,
});

describe('Destek talepleri', () => {
  test('sunucudaki talep demodaki gibi görünür', () => {
    const v = ticketView(ticket(), new Date(2026, 10, 10, 12));
    assert.deepEqual(
      { id: v.id, number: v.number, category: v.category, status: v.status, time: v.time, photos: v.photos, feedback: v.feedback },
      { id: '7', number: 'TK-10007', category: 'Ödeme', status: 'Yanıtlandı', time: '10 Kas 09:05', photos: ['https://x/ticket/u/a.jpg'], feedback: false },
    );
    assert.deepEqual(v.replies, [
      { from: 'support', text: 'İnceliyoruz', time: '10 Kas 09:30' },
      { from: 'me', text: 'Teşekkürler', time: '10 Kas 09:45' },
    ]);
  });

  test('durumlar ve bilinmeyen kategori', () => {
    assert.deepEqual(Object.values(TICKET_STATUS_LABEL), ['Açık', 'Yanıtlandı', 'Yeniden açıldı', 'Çözüldü']);
    assert.equal(ticketView(ticket({ status: 'closed' })).status, 'Çözüldü');
    assert.equal(ticketView(ticket({ status: 'reopened' })).status, 'Yeniden açıldı');
    assert.equal(ticketView(ticket({ category: 'Eski kategori' })).category, 'Teknik', 'listede olmayan Teknik görünür');
  });

  test('form kontrolleri ve özet', () => {
    assert.match(ticketProblem('kısa', 0) ?? '', /en az 10 karakter/);
    assert.equal(ticketProblem('Uygulama açılışta donuyor', 3), null);
    assert.match(ticketProblem('Uygulama açılışta donuyor', 4) ?? '', /En fazla 3 fotoğraf/);
    assert.match(ticketProblem('x'.repeat(2001), 0) ?? '', /en fazla 2\.000 karakter/);
    assert.equal(ticketSummary([]), undefined);
    assert.equal(ticketSummary([{ status: 'Yanıtlandı' }, { status: 'Açık' }, { status: 'Yanıtlandı' }]), '3 talep · 2 yanıtlandı');
  });
});
