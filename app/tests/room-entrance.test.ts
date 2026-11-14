/// <reference types="node" />
// Entrances in a server room (Güncelleme 5, madde 7), on simulated phones that run the room screen's own rules:
// lib/room-entrance (who is an entrance, what it shows, with whose look), lib/entry-queue (one banner at a time) and
// data/bonds jointEntries (the bonded pair's joint banner).
//   (a) An entry effect is its owner's own and plays only for their own entrance; nobody's room role changes that.
//   (b) Someone coming in sees no replay of the entrances of the people already inside.
//   (c) One entrance makes one banner: no joint banner when a partner joins someone who was already inside.
//   (d) The joint banner only when the two came in together, once, after their own banners.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { jointEntries, type JointState, type RoomBond } from '@/data/bonds';
import { emptyEntryLine, pushEntry, shiftEntry, type EntryLine } from '@/lib/entry-queue';
import { RETURN_MS, cameInAfter, entranceView, entryPlanOf, peerChanges } from '@/lib/room-entrance';

type Look = { entry?: string | null; ride?: string | null; noble?: number | null; vipLevel?: number };
type Person = { id: string; name: string; look?: Look };
const S = 1000;
const T = 1_800_000_000_000;

/**
 * One phone in a server room (lib/live/room useLiveRoomSync and the room screen's onJoin, without React). `me` came in
 * at `meJoinedAt`; `sync(people)` is the voice connection's list (everyone else, with when each came in).
 */
function phone(me: Person, meJoinedAt: number, roomBonds: RoomBond[] = []) {
  // My own account is 'me' on my phone, in the bonds too (lib/live/bonds loadRoomBonds: toLocal).
  const local = (uid: string) => (uid === me.id ? 'me' : uid);
  const bonds = roomBonds.map((b) => ({ ...b, a: local(b.a), b: local(b.b) }));
  const names = new Map([['me', me.name]]);
  let members = ['me'];
  let joinedAt = meJoinedAt;
  const leftAt = new Map<string, number>();
  const arrivals = new Map<string, number>();
  const mine = entryPlanOf(me.look);
  let line: EntryLine<string> = emptyEntryLine(mine ? { id: 'mine', who: ['me'], show: `${me.name}:${mine.fx}` } : null);
  let joint: JointState | null = null;
  const chat: string[] = [];
  const nameOf = (uid: string) => names.get(uid) ?? uid;
  return {
    chat,
    /** The voice connection's people now; `now` is this phone's clock. */
    sync(people: (Person & { at: number })[], now: number) {
      const here = new Map(people.map((p) => [p.id, { name: p.name, joinedAt: p.at }]));
      const { leaves, joins } = peerChanges(members, here, joinedAt, leftAt, now);
      for (const uid of leaves) {
        members = members.filter((m) => m !== uid);
        leftAt.set(uid, now);
        arrivals.delete(uid);
        chat.push(`${nameOf(uid)} odadan ayrıldı`);
      }
      for (const j of joins) {
        members.push(j.uid);
        names.set(j.uid, j.name);
        arrivals.set(j.uid, j.join.at);
        const v = entranceView(j.join);
        if (v.line) chat.push(`${j.name} odaya girdi`);
        const plan = v.effect ? entryPlanOf(people.find((p) => p.id === j.uid)?.look) : null;
        if (plan) line = pushEntry(line, { id: `in:${j.uid}:${j.join.at}`, who: [j.uid], show: `${j.name}:${plan.fx}` });
      }
      // The room's bonds, read again after the people change (components/room/room-bonds).
      const r = jointEntries(bonds, new Set(members), new Map([...arrivals, ['me', joinedAt]]), joinedAt, joint);
      joint = r.state;
      for (const b of r.show) line = pushEntry(line, { id: `bond:${b.a}|${b.b}`, who: [b.a, b.b], show: `${nameOf(b.a)} & ${nameOf(b.b)}` });
    },
    /** My connection dropped and came back: LiveKit lists nobody, then everyone again, with my new join time. */
    reconnect(at: number) {
      joinedAt = at;
    },
    /** Every banner that plays from now on, in order. */
    played() {
      const out: string[] = [];
      while (line.now) {
        out.push(line.now.show);
        line = shiftEntry(line);
      }
      return out;
    },
  };
}

const owner: Person = { id: 'u-owner', name: 'Oda Sahibi', look: { entry: 'en-dragon', vipLevel: 7 } };
const admin: Person = { id: 'u-admin', name: 'Yönetici', look: { entry: 'en-dragon', ride: 'rd-sport' } };
const newbie: Person = { id: 'u-new', name: 'Yeni', look: {} };
const kaan: Person = { id: 'u-kaan', name: 'KaaN', look: { entry: 'en-dragon', ride: 'rd-scooter', noble: 2 } };
const artemis: Person = { id: 'u-artemis', name: 'ARTEMİS', look: { entry: 'en-dragon' } };
const couple: RoomBond[] = [{ a: 'u-artemis', b: 'u-kaan', kind: 'cift', level: 9 }];

describe('(a) giriş efekti yalnız sahibinin, yalnız kendi girişinde', () => {
  test('efekt girenin kendi görünüşünden; oda sahibinin ve yöneticinin efekti başkasına geçmez', () => {
    assert.equal(entryPlanOf(owner.look)?.fx, 'dragon');
    assert.deepEqual(entryPlanOf(admin.look), { fx: 'dragon', rideId: 'rd-sport', ride: '🏎️' });
    // A new account wears nothing: no banner, whoever else in the room has one.
    assert.equal(entryPlanOf(newbie.look), null);
    assert.equal(entryPlanOf(undefined), null);
    // Something that isn't an entry or a ride in those places is no effect at all.
    assert.equal(entryPlanOf({ entry: 'fr-neon', ride: 'en-dragon' }), null);
    // Only status: the VIP banner in the tier's colors, with the noble badge.
    assert.deepEqual(entryPlanOf({ noble: 2, vipLevel: 3 })?.fx, 'vip');
  });

  test('yöneticinin telefonu: başkası girince yöneticinin kendi efekti oynamaz', () => {
    const p = phone(admin, T, []);
    p.sync([{ ...owner, at: T - 300 * S }], T);
    assert.deepEqual(p.played(), ['Yönetici:dragon'], 'yalnız kendi girişi');
    p.sync([{ ...owner, at: T - 300 * S }, { ...newbie, at: T + 60 * S }], T + 61 * S);
    assert.deepEqual(p.chat, ['Yeni odaya girdi']);
    assert.deepEqual(p.played(), [], 'yeni gelenin efekti yok; yöneticinin efekti tekrar oynamaz');
    p.sync([{ ...owner, at: T - 300 * S }, { ...newbie, at: T + 60 * S }, { ...kaan, at: T + 90 * S }], T + 91 * S);
    assert.deepEqual(p.played(), ['KaaN:dragon'], 'girenin kendi efekti');
  });
});

describe('(b) yeni gelen, içerideki kişilerin girişlerini tekrar görmez', () => {
  test('odaya girince: içeridekiler için satır da efekt de yok; sonra gelen için ikisi de var', () => {
    const p = phone(newbie, T);
    p.sync([{ ...owner, at: T - 900 * S }, { ...admin, at: T - 120 * S }, { ...kaan, at: T - 3 * S }], T + S);
    assert.deepEqual(p.chat, []);
    assert.deepEqual(p.played(), [], 'oda sahibinin ve yöneticinin efekti yeni gelende oynamaz');
    p.sync([{ ...owner, at: T - 900 * S }, { ...admin, at: T - 120 * S }, { ...kaan, at: T - 3 * S }, { ...artemis, at: T + 30 * S }], T + 31 * S);
    assert.deepEqual(p.chat, ['ARTEMİS odaya girdi']);
    assert.deepEqual(p.played(), ['ARTEMİS:dragon']);
  });

  test('aynı liste yeniden gelince (her ses olayında) giriş tekrarlanmaz', () => {
    const p = phone(newbie, T);
    const people = [{ ...owner, at: T - 900 * S }];
    p.sync(people, T);
    const later = [...people, { ...admin, at: T + 10 * S }];
    for (let i = 0; i < 5; i++) p.sync(later, T + (11 + i) * S);
    assert.deepEqual(p.chat, ['Yönetici odaya girdi']);
    assert.deepEqual(p.played(), ['Yönetici:dragon']);
  });

  test('benim bağlantım kopup gelince: herkes yeniden listelenir ama giriş efekti oynamaz', () => {
    const p = phone(newbie, T);
    const people = [{ ...owner, at: T - 900 * S }, { ...admin, at: T + 10 * S }];
    p.sync(people, T + 11 * S);
    p.played();
    p.sync([], T + 100 * S);
    p.reconnect(T + 104 * S);
    p.sync(people, T + 105 * S);
    assert.deepEqual(p.played(), []);
    // The lines go both ways, as the connection did.
    assert.deepEqual(p.chat.slice(-4), ['Oda Sahibi odadan ayrıldı', 'Yönetici odadan ayrıldı', 'Oda Sahibi odaya girdi', 'Yönetici odaya girdi']);
  });

  test('başkasının bağlantısı kopup bir dakika içinde gelince satır var, efekt yok; sonra gelince efekt de var', () => {
    const p = phone(newbie, T);
    p.sync([{ ...kaan, at: T + 5 * S }], T + 6 * S);
    assert.deepEqual(p.played(), ['KaaN:dragon']);
    p.sync([], T + 20 * S);
    p.sync([{ ...kaan, at: T + 24 * S }], T + 25 * S);
    assert.deepEqual(p.played(), [], 'kopup gelen');
    p.sync([], T + 30 * S);
    p.sync([{ ...kaan, at: T + 30 * S + RETURN_MS }], T + 31 * S + RETURN_MS);
    assert.deepEqual(p.played(), ['KaaN:dragon'], 'çıkıp sonra giren');
  });

  test('ses sunucusunun saatiyle: benden sonra gelen giriştir, önce gelen ya da bilinmeyen değil', () => {
    assert.equal(cameInAfter(T + 5 * S, T), true);
    assert.equal(cameInAfter(T, T), true, 'aynı saniye');
    assert.equal(cameInAfter(T - S, T), false);
    assert.equal(cameInAfter(undefined, T), false);
    assert.equal(cameInAfter(T + 5 * S, 0), false, 'ben henüz bağlanmadım');
    // Blocked, or my entry effects off: no line or no effect.
    assert.deepEqual(entranceView({ fresh: true, at: T, away: null }, { blocked: true }), { line: false, effect: false });
    assert.deepEqual(entranceView({ fresh: true, at: T, away: null }, { effectsOn: false }), { line: true, effect: false });
  });
});

describe('(c) bir giriş, bir bildirim', () => {
  test('KaaN, uzun süredir içeride olan eşinin yanına girince yalnız kendi girişi; çift bildirimi yok', () => {
    const inside = { ...artemis, at: T - 600 * S };
    // A third phone, ARTEMİS's phone, and KaaN's own phone.
    const third = phone(newbie, T - 700 * S, couple);
    third.sync([inside], T - 599 * S);
    third.played();
    third.sync([inside, { ...kaan, at: T }], T + S);
    assert.deepEqual(third.played(), ['KaaN:dragon']);
    assert.deepEqual(third.chat.filter((l) => l.includes('KaaN')), ['KaaN odaya girdi']);

    const hers = phone(artemis, T - 600 * S, couple);
    hers.sync([], T - 599 * S);
    hers.played();
    hers.sync([{ ...kaan, at: T }], T + S);
    assert.deepEqual(hers.played(), ['KaaN:dragon']);

    const his = phone(kaan, T, couple);
    his.sync([inside], T + S);
    assert.deepEqual(his.played(), ['KaaN:dragon'], 'kendi girişi, eşi için çift bildirimi yok');
  });
});

describe('(d) çift bildirimi yalnız aynı anda ilk girişte, kendi girişlerinden sonra', () => {
  test('birlikte girince: önce ikisinin kendi girişi, sonra bir kez "ARTEMİS & KaaN"', () => {
    const third = phone(newbie, T - 300 * S, couple);
    third.sync([], T - 299 * S);
    third.sync([{ ...artemis, at: T }], T + S);
    third.sync([{ ...artemis, at: T }, { ...kaan, at: T + 8 * S }], T + 9 * S);
    assert.deepEqual(third.played(), ['ARTEMİS:dragon', 'KaaN:dragon', 'ARTEMİS & KaaN']);
    // KaaN's phone: ARTEMİS was inside 8 s before him; his own banner, then the joint one.
    const his = phone(kaan, T + 8 * S, couple);
    his.sync([{ ...artemis, at: T }], T + 9 * S);
    assert.deepEqual(his.played(), ['KaaN:dragon', 'ARTEMİS & KaaN']);
    // Someone coming in after them sees none of it.
    const later = phone(newbie, T + 120 * S, couple);
    later.sync([{ ...artemis, at: T }, { ...kaan, at: T + 8 * S }], T + 121 * S);
    assert.deepEqual(later.played(), []);
  });

  test('ilk defa: aynı ziyarette yeniden birlikte girince çift bildirimi tekrar yok; ayrı ayrı girince hiç yok', () => {
    const third = phone(newbie, T - 300 * S, couple);
    third.sync([], T - 299 * S);
    third.sync([{ ...artemis, at: T }, { ...kaan, at: T + 2 * S }], T + 3 * S);
    assert.ok(third.played().includes('ARTEMİS & KaaN'));
    third.sync([], T + 600 * S);
    third.sync([{ ...artemis, at: T + 900 * S }, { ...kaan, at: T + 901 * S }], T + 902 * S);
    assert.deepEqual(third.played(), ['ARTEMİS:dragon', 'KaaN:dragon']);

    const apart = phone(newbie, T - 300 * S, couple);
    apart.sync([], T - 299 * S);
    apart.sync([{ ...artemis, at: T }], T + S);
    apart.sync([{ ...artemis, at: T }, { ...kaan, at: T + 45 * S }], T + 46 * S);
    assert.deepEqual(apart.played(), ['ARTEMİS:dragon', 'KaaN:dragon']);
  });
});

describe('satıştan kalkan giriş efektleri', () => {
  test('takılı kalmış olsa da oynamaz; VIP ya da rütbe bandı yerine geçer', async () => {
    const { entryPlanOf } = await import('@/lib/room-entrance');
    // The drawn ones, and the gift clips that were sold as entries for a few hours.
    for (const entry of ['en-sparkle', 'en-thunder', 'en-comet', 'en-roket', 'en-aslan', 'en-otomobil']) {
      assert.equal(entryPlanOf({ entry, vipLevel: 0 }), null, entry);
      assert.equal(entryPlanOf({ entry, noble: 2, vipLevel: 0 })?.fx, 'vip', `${entry} + rütbe`);
    }
    assert.equal(entryPlanOf({ entry: 'en-dragon', vipLevel: 0 })?.fx, 'dragon');
  });
});
