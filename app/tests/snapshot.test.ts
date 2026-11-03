/// <reference types="node" />
// The real loader for the device save (lib/snapshot readSnapshot): every launch goes through it, so an old or
// damaged save must come out usable, with good data kept and bad data dropped or reset.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { ME } from '@/data/mock';
import { ME_DEFAULT, readSnapshot } from '@/lib/snapshot';

describe('Kayıt okuyucu (readSnapshot)', () => {
  test('nesne olmayan kayıt yok sayılır', () => {
    for (const raw of [null, undefined, 'x', 7, [1, 2]]) assert.equal(readSnapshot(raw), null);
  });

  test('sağlam alanlar olduğu gibi kalır, bilinmeyen ve bozuk alanlar düşer', () => {
    const s = readSnapshot({ coins: 1200, diamonds: 'çok', loggedIn: true, hacked: 1, inventory: ['a', 3, 'b'] })!;
    assert.equal(s.coins, 1200);
    assert.equal(s.loggedIn, true);
    assert.equal('diamonds' in s, false);
    assert.equal('hacked' in s, false);
    assert.deepEqual(s.inventory, ['a', 'b']);
  });

  test('eksik profil alanları varsayılandan tamamlanır', () => {
    const s = readSnapshot({ me: { name: 'Deniz' } })!;
    assert.equal(s.me!.name, 'Deniz');
    assert.equal(s.me!.id, ME_DEFAULT.id);
    assert.deepEqual(s.me!.interests, ME_DEFAULT.interests);
    assert.equal(ME.name, ME_DEFAULT.name, 'okuma paylaşılan ME nesnesini değiştirmez');
  });

  test('7 günlük olmayan haftalık grafik atılır', () => {
    assert.equal('weekly' in readSnapshot({ weekly: [1, 2, 3] })!, false);
    assert.deepEqual(readSnapshot({ weekly: [0, 0, 0, 0, 0, 0, 5] })!.weekly, [0, 0, 0, 0, 0, 0, 5]);
  });

  test('listede alanı eksik satır atılır', () => {
    const s = readSnapshot({
      ledger: [{ id: 'l1', ref: 'r', currency: 'coin', amount: -5, reason: 'x', time: '10:00', status: 'Başarılı' }, { id: 'l2', amount: 3 }],
      notifications: [{ id: 'n1', kind: 'system', icon: 'gift', title: 't', body: 'b', time: '10:00', read: false }, { id: 'n2', title: 5 }],
      withdrawals: [{ id: 'w1', diamonds: 100, iban: 'TR', status: 'Beklemede', time: '10:00' }, { id: 'w2' }],
    })!;
    assert.deepEqual(s.ledger!.map((r) => r.id), ['l1']);
    assert.deepEqual(s.notifications!.map((r) => r.id), ['n1']);
    assert.deepEqual(s.withdrawals!.map((r) => r.id), ['w1']);
  });

  test('bozuk hediye bilgisi olan kazanç satırı atılır', () => {
    const s = readSnapshot({
      earnings: [
        { id: 'e1', amount: 10, source: 'Hediye', time: '10:00' },
        { id: 'e2', amount: 10, source: 'Hediye', time: '10:00', gift: { id: 'g', name: 'Gül', emoji: '🌹', count: 2 } },
        { id: 'e3', amount: 10, source: 'Hediye', time: '10:00', gift: { name: 'Gül' } },
        { id: 'e4', amount: '10', source: 'Hediye', time: '10:00' },
      ],
    })!;
    assert.deepEqual(s.earnings!.map((e) => e.id), ['e1', 'e2']);
  });

  test('sohbetlerde okunmamış sayısı düzeltilir, bozuk mesaj atılır', () => {
    const s = readSnapshot({
      conversations: [
        { id: 'c1', userId: 'u1', unread: 'iki', messages: [{ text: 'selam' }, { text: 4 }, null] },
        { id: 'c2', userId: 'u2' },
        { id: 'c3', userId: 'u3', unread: 2, messages: [] },
      ],
    })!;
    assert.deepEqual(s.conversations!.map((c) => c.id), ['c1', 'c3']);
    assert.equal(s.conversations![0].unread, 0);
    assert.deepEqual(s.conversations![0].messages.map((m) => m.text), ['selam']);
    assert.equal(s.conversations![1].unread, 2);
  });

  test('hayran kulübü, hediye duvarı ve sayaç haritalarında bozuk girişler atılır', () => {
    const s = readSnapshot({
      fanClubs: { u1: { points: 40, history: [{ text: 'hediye', pts: 10, time: '10:00' }, { text: 1 }] }, u2: { points: 'x', history: [] }, u3: 5 },
      giftWall: { u1: { rose: 3 }, u2: { rose: 'x' } },
      followerInvites: { r1: 2, r2: 'x' },
      equipped: { frame: 'f1', badge: 9 },
    })!;
    assert.deepEqual(Object.keys(s.fanClubs!), ['u1']);
    assert.equal(s.fanClubs!.u1.history.length, 1);
    assert.deepEqual(s.giftWall, { u1: { rose: 3 } });
    assert.deepEqual(s.followerInvites, { r1: 2 });
    assert.deepEqual(s.equipped, { frame: 'f1' });
  });

  test('bilinmeyen ajans üyeliği ve rolü sıfırlanır, bilinen korunur', () => {
    const gone = readSnapshot({ agencyId: 'kapandi', agencyRole: 'member' })!;
    assert.equal(gone.agencyId, null);
    assert.equal(gone.agencyRole, null);
    const kept = readSnapshot({ agencyId: 'a1', agencyRole: 'assistant' })!;
    assert.equal(kept.agencyId, 'a1');
    assert.equal(kept.agencyRole, 'assistant');
    assert.equal(readSnapshot({ agencyId: 'a1', agencyRole: 'boss' })!.agencyRole, null);
  });

  test("kendi ajansı ('own') kaydı yoksa ya da bozuksa üyelik düşer", () => {
    assert.equal(readSnapshot({ agencyId: 'own', agencyRole: 'owner' })!.agencyId, null);
    const broken = readSnapshot({ agencyId: 'own', agencyRole: 'owner', ownedAgency: { name: 'X' } })!;
    assert.equal(broken.ownedAgency, null);
    assert.equal(broken.agencyId, null);
    const ok = readSnapshot({ agencyId: 'own', agencyRole: 'owner', ownedAgency: { name: 'X', code: 'X1', status: 'Onaylandı' } })!;
    assert.equal(ok.agencyId, 'own');
  });

  test('sonraki sürümde adı değişen tayfa rolü varsayılana döner', () => {
    assert.equal(readSnapshot({ familyRole: 'captain' })!.familyRole, null);
    assert.equal(readSnapshot({ familyRole: 'helper' })!.familyRole, 'helper');
  });
});
