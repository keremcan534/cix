// Ajans sohbet grubu (lib/agency-chat-view): how a member's status reads and in which order members are listed.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { byPresence, lastSeenText, memberStatus, type AgencyChatMember } from '@/lib/agency-chat-view';

const NOW = Date.parse('2026-11-11T12:00:00Z');
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const m = (name: string, x: Partial<AgencyChatMember>): AgencyChatMember => ({ id: name, name, avatarUrl: null, gender: null, role: 'streamer', online: false, room: null, lastSeenAt: null, ...x });

describe('Ajans sohbet grubu: üye durumu', () => {
  test('en son ne zaman', () => {
    assert.equal(lastSeenText(ago(0), NOW), 'Şimdi');
    assert.equal(lastSeenText(ago(12), NOW), '12 dk önce');
    assert.equal(lastSeenText(ago(3 * 60 + 5), NOW), '3 sa önce');
    assert.equal(lastSeenText(ago(30 * 60), NOW), 'Dün');
    assert.equal(lastSeenText(ago(4 * 24 * 60), NOW), '4 gün önce');
    assert.equal(lastSeenText(null, NOW), '');
    assert.equal(lastSeenText('bozuk', NOW), '');
  });
  test('oda, çevrim içi, son görülme, gizli', () => {
    assert.equal(memberStatus({ online: true, room: { id: 'r', title: 'Keyfe keder' }, lastSeenAt: ago(0) }, NOW), 'Odada · Keyfe keder');
    assert.equal(memberStatus({ online: true, room: null, lastSeenAt: ago(1) }, NOW), 'Çevrim içi');
    assert.equal(memberStatus({ online: false, room: null, lastSeenAt: ago(90) }, NOW), 'Son görülme: 1 sa önce');
    assert.equal(memberStatus({ online: false, room: null, lastSeenAt: null }, NOW), 'Çevrim dışı');
    assert.equal(memberStatus({ online: null, room: null, lastSeenAt: null }, NOW), 'Durumunu gizliyor');
  });
  test('sıra: odadakiler, çevrim içi olanlar, en son girenler, gizleyenler', () => {
    const list = [
      m('Gizli', { online: null }),
      m('Dün', { lastSeenAt: ago(30 * 60) }),
      m('Çevrim içi', { online: true, lastSeenAt: ago(1) }),
      m('Az önce', { lastSeenAt: ago(20) }),
      m('Odada', { online: true, room: { id: 'r', title: 'Oda' }, lastSeenAt: ago(2) }),
    ];
    assert.deepEqual(list.sort(byPresence).map((x) => x.name), ['Odada', 'Çevrim içi', 'Az önce', 'Dün', 'Gizli']);
  });
});
