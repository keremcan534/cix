/// <reference types="node" />
// PK server: Normal and Team PK, server-side team draw, scoring rules, dedupe, single finalization, ties,
// refunds and crown relations (Gelişmiş PK şartnamesi §2–§10).
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyServerPk,
  computeCrowns,
  drawTeams,
  drawTeamsFrom,
  finishNow,
  getPk,
  invitableRooms,
  inviteCrossPk,
  joinRoomPk,
  latecomerTeam,
  pkOfRoom,
  pkPillBox,
  pkPointsFor,
  pkPointsText,
  recordGift,
  resetPk,
  revokeGift,
  serverPkSession,
  setInviteScenario,
  shortPoints,
  startRoomPk,
  textWidth,
  type PkSession,
} from '@/lib/pk';
import type { ServerPk } from '@/lib/api';
import { ROOM_LAYOUTS } from '@/data/room-layouts';
import { join, leave, leaveSeat, resetPresence, seedRoom, setBoss, takeSeat } from '@/lib/room-presence';
import { fitGrid, layoutPlan } from '@/lib/seat-fit';

const R = 'pk-room';
const PREP_MS = 5_000;
let tx = 0;
const gift = (to: string, coins = 100, from = 'fan1', txId = `tx-${++tx}`) => ({ txId, r: recordGift(R, txId, from, to, 'g-test', coins) });
const pk = () => getPk().sessions[0];
/** Owner `host`, admin `admin`; `n` people on mics (host + admin + p1…), plus listeners fan1…fan3 and spare1, spare2. */
function room(n: number, capacity = 15) {
  const seats = ['host', 'admin', ...Array.from({ length: Math.max(0, n - 2) }, (_, i) => `p${i + 1}`)].slice(0, n);
  seedRoom(R, { ownerId: 'host', adminIds: ['admin'], seats, capacity, total: n + 5, regulars: ['fan1', 'fan2', 'fan3', 'spare1', 'spare2'] });
}
const activate = () => mock.timers.tick(PREP_MS);

beforeEach(() => {
  resetPk();
  resetPresence();
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 5_000_000 });
});
afterEach(() => mock.timers.reset());

describe('Başlatma', () => {
  test('Normal PK: mikrofondaki herkes katılır, takım kurulmaz', () => {
    room(4);
    const r = startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' });
    assert.ok(r.ok);
    assert.deepEqual(r.pk.participants.sort(), ['admin', 'host', 'p1', 'p2']);
    assert.deepEqual([r.pk.teams[0].members, r.pk.teams[1].members], [[], []]);
  });

  test('kişi sayısı önemsiz: mikrofonda tek kişi varken de Normal PK başlar; üye PK başlatamaz; odada tek PK', () => {
    room(1);
    const one = startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' });
    assert.ok(one.ok);
    assert.deepEqual(one.pk.participants, ['host']);
    resetPk();
    resetPresence();
    room(3);
    assert.equal(startRoomPk({ roomId: R, starterId: 'fan1', durationMin: 15, mode: 'solo' }).ok, false);
    assert.equal(startRoomPk({ roomId: R, starterId: 'admin', durationMin: 15, mode: 'solo' }).ok, true);
    assert.equal(startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' }).ok, false);
  });

  test('mikrofonda kimse yokken de Normal ve Takım PK başlar; takımlar boş başlayabilir', () => {
    seedRoom(R, { ownerId: 'host', adminIds: ['admin'], seats: [], capacity: 15, total: 4, regulars: ['host', 'admin', 'fan1', 'fan2'] });
    const solo = startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' });
    assert.ok(solo.ok);
    assert.deepEqual(solo.pk.participants, []);
    resetPk();
    const d = drawTeamsFrom(R, []);
    assert.deepEqual([d.draft.red, d.draft.blue, d.draft.out], [[], [], []]);
    const team = startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'team', draftId: d.draft.id });
    assert.ok(team.ok);
    assert.deepEqual(team.pk.teams.map((t) => t.members), [[], []]);
  });

  test('yalnız 15/30/60/120 dakika', () => {
    room(3);
    assert.equal(startRoomPk({ roomId: R, starterId: 'host', durationMin: 5, mode: 'solo' }).ok, false);
  });

  test('aynı istek tekrar gelirse (bağlantı kopması sonrası) ikinci PK açılmaz', () => {
    room(3);
    const a = startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo', requestId: 'req-1' });
    const b = startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo', requestId: 'req-1' });
    assert.ok(a.ok && b.ok);
    assert.equal(a.pk.id, b.pk.id);
    assert.equal(getPk().sessions.length, 1);
  });
});

describe('Takım dağıtımı (sunucu)', () => {
  test('rastgele dağıtım: farklar en fazla 1, kimse iki takımda değil, herkes mikrofonda', () => {
    for (let n = 2; n <= 15; n++) {
      resetPresence();
      room(n);
      const d = drawTeams(R, 'host');
      assert.ok(d.ok, `n=${n}`);
      const { red, blue, out } = d.draft;
      assert.ok(Math.abs(red.length - blue.length) <= 1, `n=${n} dengesiz`);
      assert.equal(new Set([...red, ...blue]).size, red.length + blue.length);
      assert.equal(red.length + blue.length + out.length, n);
    }
  });

  test('takım kapasitesini aşan kişiler PK dışında kalır', () => {
    room(15);
    const d = drawTeams(R, 'host');
    assert.ok(d.ok);
    assert.equal(d.draft.red.length + d.draft.blue.length, 15, 'varsayılan 8+8 kapasite 15 mikrofonu karşılar');
  });

  test('yeniden karıştırma yeni bir dağılım üretir; başlatma sunucudaki dağılımı kullanır', () => {
    room(8);
    const a = drawTeams(R, 'host');
    const b = drawTeams(R, 'host');
    assert.ok(a.ok && b.ok);
    assert.notEqual(a.draft.id, b.draft.id);
    const s = startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'team', draftId: b.draft.id });
    assert.ok(s.ok);
    assert.deepEqual(s.pk.teams[0].members, b.draft.red);
    assert.deepEqual(s.pk.teams[1].members, b.draft.blue);
  });

  test('dağılımdan sonra biri mikrofondan inerse başlatma reddedilir', () => {
    room(6);
    const d = drawTeams(R, 'host');
    assert.ok(d.ok);
    leaveSeat(R, d.draft.blue[0]);
    assert.equal(startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'team', draftId: d.draft.id }).ok, false);
  });

  test('manuel: aynı kişi iki takımda olamaz, mikrofonda olmayan seçilemez; takım boş başlayabilir', () => {
    room(4);
    const base = { roomId: R, starterId: 'host', durationMin: 15, mode: 'team' as const };
    assert.equal(startRoomPk({ ...base, red: ['host', 'p1'], blue: ['p1'] }).ok, false);
    assert.equal(startRoomPk({ ...base, red: ['host'], blue: ['fan1'] }).ok, false);
    assert.equal(startRoomPk({ ...base, red: ['host', 'admin', 'p1'], blue: ['p2'] }).ok, true, 'dengesiz ama kurallara uygun');
    resetPk();
    const empty = startRoomPk({ ...base, red: ['host', 'admin'], blue: [] });
    assert.ok(empty.ok, 'Mavi boş başlar, sonradan gelen ona girer');
    assert.deepEqual(empty.pk.out, ['p1', 'p2'], 'seçilmeyenler dışarıda kalır');
  });
});

describe('Puanlama', () => {
  test('Normal PK: puan alıcıya yazılır; Balkon’daki kişiye giden hediye sayılmaz ama kaydı tutulur', () => {
    room(3);
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' });
    activate();
    assert.ok(gift('p1', 300).r.ok);
    const off = gift('fan2', 500);
    assert.equal(off.r.ok, false);
    assert.equal(pk().points.p1, 300);
    assert.equal(pk().points.fan2, undefined);
    assert.equal(pk().records.find((r) => r.txId === off.txId)?.status, 'Reddedildi');
  });

  test('PK başlamadan (hazırlıkta) ve bittikten sonra gönderilen hediye sayılmaz', () => {
    room(3);
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' });
    assert.equal(gift('p1').r.ok, false);
    activate();
    finishNow(pk().id);
    assert.equal(gift('p1').r.ok, false);
    assert.equal(pk().result!.validGifts, 0);
  });

  test('aynı hediye işlemi iki kez gelirse bir kez sayılır', () => {
    room(3);
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' });
    activate();
    gift('p1', 100, 'fan1', 'same');
    const again = gift('p1', 100, 'fan1', 'same');
    assert.equal(again.r.ok, false);
    assert.equal(pk().points.p1, 100);
    assert.equal(getPk().duplicates, 1);
  });

  test('PK sırasında mikrofona geçen kişi Normal PK’ya katılır; mikrofondan inen kişinin puanı kalır, yenisi yazılmaz', () => {
    room(3);
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' });
    activate();
    takeSeat(R, 'spare1', 7);
    assert.ok(gift('spare1', 50).r.ok);
    assert.ok(pk().participants.includes('spare1'));
    gift('p1', 200);
    leave(R, 'p1');
    assert.equal(gift('p1', 900).r.ok, false);
    assert.equal(pk().points.p1, 200);
  });

  test('Takım PK: sonradan mikrofona geçen kişi az kişili takıma girer ve puanı takımına yazılır', () => {
    room(3);
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'team', red: ['host', 'admin'], blue: ['p1'] });
    activate();
    takeSeat(R, 'spare1', 8);
    assert.deepEqual(joinRoomPk(R, 'spare1'), { ok: true, changed: true });
    assert.deepEqual(pk().teams[1].members, ['p1', 'spare1'], 'Mavi az kişili');
    assert.deepEqual(joinRoomPk(R, 'spare1'), { ok: true, changed: false }, 'ikinci kez değişmez');
    assert.ok(gift('spare1', 300).r.ok);
    assert.equal(pk().teams[1].score, 300);
  });

  test('Takım PK: katılma isteği gelmeden hediye alan mikrofondaki kişi önce takıma girer; dışarıda bırakılan girmez', () => {
    room(4);
    // Manual split: p2 is on a mic and left out of both teams.
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'team', red: ['host'], blue: ['admin', 'p1'] });
    assert.deepEqual(pk().out, ['p2']);
    activate();
    takeSeat(R, 'spare1', 9);
    assert.equal(gift('spare1', 200).r.ok, true);
    assert.deepEqual(pk().teams[0].members, ['host', 'spare1']);
    assert.equal(gift('p2', 500).r.ok, false);
    assert.deepEqual(joinRoomPk(R, 'p2'), { ok: true, changed: false });
    assert.ok(!pk().teams.some((t) => t.members.includes('p2')));
    assert.deepEqual(joinRoomPk(R, 'fan2'), { ok: false, reason: 'PK’ya katılmak için mikrofonda olmalısın.' }, 'Balkon’daki katılamaz');
  });

  test('takımlar doluysa sonradan gelen PK dışında kalır', () => {
    room(15, 20);
    const d = drawTeams(R, 'host');
    assert.ok(d.ok);
    assert.equal(d.draft.out.length, 0);
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'team', draftId: d.draft.id });
    takeSeat(R, 'spare1', 15);
    assert.deepEqual(joinRoomPk(R, 'spare1'), { ok: true, changed: true }, '16. kişi 7 kişilik takıma');
    takeSeat(R, 'spare2', 16);
    assert.deepEqual(joinRoomPk(R, 'spare2'), { ok: true, changed: false }, '8 + 8: yer yok');
    assert.deepEqual(pk().teams.map((t) => t.members.length), [8, 8]);
  });

  test('sonradan gelenin takımı: az kişili olan, eşitse rastgele, ikisi de doluysa yok', () => {
    assert.equal(latecomerTeam(3, 2, 8), 'blue');
    assert.equal(latecomerTeam(0, 1, 8), 'red');
    assert.equal(latecomerTeam(8, 7, 8), 'blue');
    assert.equal(latecomerTeam(2, 2, 8, () => 0.2), 'red');
    assert.equal(latecomerTeam(2, 2, 8, () => 0.7), 'blue');
    assert.equal(latecomerTeam(8, 8, 8), null);
  });

  test('takım toplamı her zaman üyelerin geçerli puanlarının toplamına eşit', () => {
    room(6);
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'team', red: ['host', 'admin', 'p1'], blue: ['p2', 'p3', 'p4'] });
    activate();
    const people = ['host', 'admin', 'p1', 'p2', 'p3', 'p4', 'fan1', 'spare2'];
    const sent = Array.from({ length: 200 }, (_, i) => gift(people[i % people.length], 10 + ((i * 37) % 500), `fan${1 + (i % 3)}`));
    assert.deepEqual(revokeGift(sent[3].txId, 'test iadesi'), { ok: true, changed: true });
    const s = pk();
    for (const t of s.teams) assert.equal(t.score, t.members.reduce((sum, m) => sum + (s.points[m] ?? 0), 0), t.id);
  });
});

describe('Sonuç ve taç', () => {
  test('sonuç bir kez kesinleşir; tekrar bitirme sonucu değiştirmez', () => {
    room(3);
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' });
    activate();
    gift('p1', 400);
    mock.timers.tick(15 * 60_000);
    const first = pk().result;
    assert.equal(pk().status, 'done');
    finishNow(pk().id);
    gift('host', 99_999);
    assert.equal(pk().result, first);
    assert.deepEqual(first!.winners, ['p1']);
  });

  test('Normal PK beraberlik: yanlış kazanan ilan edilmez, taç verilmez', () => {
    room(3);
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' });
    activate();
    gift('p1', 300);
    gift('admin', 300);
    finishNow(pk().id);
    const r = pk().result!;
    assert.equal(r.winners.length, 2);
    assert.equal(r.diff, 0);
    assert.equal(r.crowns.length, 0);
    assert.ok(r.noCrown);
  });

  test('kimse puan almazsa kazanan yok', () => {
    room(3);
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' });
    activate();
    finishNow(pk().id);
    assert.deepEqual(pk().result!.winners, []);
    assert.equal(pk().result!.crowns.length, 0);
  });

  test('Takım beraberliği: "tie", taç yok', () => {
    room(2);
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'team', red: ['host'], blue: ['admin'] });
    activate();
    gift('host', 250);
    gift('admin', 250);
    finishNow(pk().id);
    assert.equal(pk().result!.winner, 'tie');
    assert.equal(pk().result!.crowns.length, 0);
  });

  test('Normal PK tacı: kazanana hediye gönderenler, katkıya göre, en büyük katkı işaretli', () => {
    room(3);
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' });
    activate();
    gift('p1', 500, 'fan1');
    gift('p1', 300, 'fan2');
    gift('p1', 400, 'fan1');
    gift('admin', 600, 'fan3'); // to the runner-up: not a crown relation
    finishNow(pk().id);
    const r = pk().result!;
    assert.deepEqual(r.crowned, ['p1']);
    assert.deepEqual(
      r.crowns.map((c) => [c.senderId, c.recipientId, c.points, c.gifts, c.top]),
      [
        ['fan1', 'p1', 900, 2, true],
        ['fan2', 'p1', 300, 1, false],
      ],
    );
    assert.equal(Math.round(r.crowns.reduce((s, c) => s + c.share, 0) * 1000), 1000);
  });

  test('Takım tacı: yalnız kazanan takımın puan alan üyeleri; kaybeden takıma gidenler ilişki üretmez', () => {
    room(4);
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'team', red: ['host', 'admin'], blue: ['p1', 'p2'] });
    activate();
    gift('host', 700, 'fan1');
    gift('admin', 100, 'fan2');
    gift('p1', 500, 'fan3');
    finishNow(pk().id);
    const r = pk().result!;
    assert.equal(r.winner, 'red');
    assert.deepEqual(r.crowned, ['host', 'admin']);
    assert.ok(r.crowns.every((c) => ['host', 'admin'].includes(c.recipientId)));
    assert.ok(!r.crowns.some((c) => c.senderId === 'fan3'));
  });

  test('taç ilişkileri yalnızca gerçek ve geçerli kayıtlardan; iade edilen hediye sayılmaz', () => {
    room(3);
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' });
    activate();
    gift('p1', 500, 'fan1');
    const refunded = gift('p1', 900, 'fan2');
    assert.deepEqual(revokeGift(refunded.txId, 'ödeme iade edildi'), { ok: true, changed: true });
    finishNow(pk().id);
    const s: PkSession = pk();
    assert.equal(s.points.p1, 500);
    assert.deepEqual(s.result!.crowns.map((c) => c.senderId), ['fan1']);
    for (const c of s.result!.crowns) assert.ok(s.records.some((x) => x.status === 'Doğrulandı' && x.senderId === c.senderId && x.recipientId === c.recipientId));
    assert.deepEqual(computeCrowns(s, null, s.result!.winners).crowns, s.result!.crowns, 'aynı kayıtlar aynı sonucu verir');
  });

  test('sonuçtan sonra gelen iade sonucu değiştirmez, mutabakat kaydına düşer', () => {
    room(3);
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' });
    activate();
    const g = gift('p1', 500);
    finishNow(pk().id);
    const before = pk().result;
    assert.deepEqual(revokeGift(g.txId, 'geç iade'), { ok: true, changed: false });
    assert.equal(pk().result, before);
    assert.equal(getPk().mismatches.length, 1);
  });

  test('oda sahibi odadan ayrılsa da PK sunucuda biter ve sonuç yazılır', () => {
    room(3);
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 30, mode: 'solo' });
    activate();
    gift('p1', 100);
    leave(R, 'host');
    join(R, 'fan9');
    mock.timers.tick(30 * 60_000);
    assert.equal(pk().status, 'done');
    assert.deepEqual(pk().result!.winners, ['p1']);
  });
});

describe('İnceleme düzeltmeleri', () => {
  test('odalar arası PK: aynı kişinin iki odadaki puanları karışmaz', () => {
    room(3);
    setInviteScenario('accept');
    assert.ok(inviteCrossPk(R, 'host', 'pk-other', 15).ok);
    mock.timers.tick(2_500); // the other room accepts
    activate();
    assert.ok(recordGift(R, 'x-1', 'fan1', 'u1', 'g-test', 100).ok);
    assert.ok(recordGift('pk-other', 'x-2', 'fan2', 'u1', 'g-test', 500).ok);
    assert.equal(pkPointsFor(pk(), R, 'u1'), 100);
    assert.equal(pkPointsFor(pk(), 'pk-other', 'u1'), 500);
    finishNow(pk().id);
    assert.equal(pk().result!.ranking.filter((x) => x.userId === 'u1').length, 2, 'oda başına ayrı satır');
  });

  test('patron koltuğundaki kişi Normal PK’ya katılır ve puan alır', () => {
    room(3);
    setBoss(R, 'spare1');
    const s = startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' });
    assert.ok(s.ok);
    assert.ok(s.pk.participants.includes('spare1'));
    activate();
    assert.ok(gift('spare1', 250).r.ok);
    assert.equal(pk().points.spare1, 250);
  });
});

describe('Canlı mod: telefonda PK açılmaz (sunucunun işi)', () => {
  const live = (on: boolean) => {
    if (on) process.env.EXPO_PUBLIC_API_URL = 'https://api.test';
    else delete process.env.EXPO_PUBLIC_API_URL;
  };
  afterEach(() => live(false));

  test('davet edilecek oda listesi boş; odalar arası, Normal ve Takım PK başlatılamaz', () => {
    room(4);
    assert.ok(invitableRooms(R).length > 0, 'demoda örnek odalar var');
    live(true);
    assert.deepEqual(invitableRooms(R), []);
    assert.equal(inviteCrossPk(R, 'host', 'pk-other', 15).ok, false);
    assert.equal(startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' }).ok, false);
    assert.equal(startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'team', red: ['host', 'admin'], blue: ['p1', 'p2'] }).ok, false);
    assert.equal(getPk().sessions.length, 0, 'PK kaydı açılmaz');
    live(false);
    assert.ok(startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' }).ok, 'demoda Normal PK sürer');
  });

  test('canlı modda rakip odaya uydurma hediye yazılmaz', () => {
    room(3);
    setInviteScenario('accept');
    assert.ok(inviteCrossPk(R, 'host', 'pk-other', 15).ok); // opened in the demo
    mock.timers.tick(2_500);
    live(true);
    activate();
    mock.timers.tick(60_000);
    assert.equal(pk().status, 'active');
    assert.equal(pk().records.filter((x) => x.txId.startsWith('OPP-')).length, 0);
    assert.deepEqual(pk().teams.map((t) => t.score), [0, 0]);
  });
});

describe('Sunucu PK’sı (canlı mod): herkes aynı skoru ve sonucu görür', () => {
  const T0 = Date.parse('2026-11-06T12:00:00Z');
  const base = (over: Partial<ServerPk> = {}): ServerPk => ({
    id: '7',
    room: 'srv-room',
    mode: 'solo',
    status: 'active',
    startedBy: 'u-host',
    durationMin: 15,
    participants: ['u-me', 'u-a', 'u-b'],
    red: [],
    blue: [],
    startAt: new Date(T0).toISOString(),
    endAt: new Date(T0 + 15 * 60_000).toISOString(),
    pairs: [
      { from: 'u-fan', to: 'u-a', team: null, points: 400, gifts: 2 },
      { from: 'u-me', to: 'u-b', team: null, points: 150, gifts: 1 },
      { from: 'u-fan2', to: 'u-a', team: null, points: 100, gifts: 3 },
    ],
    people: [],
    ...over,
  });
  const local = (id: string) => (id === 'u-me' ? 'me' : id);

  test('Normal PK: puanlar alıcıya yazılır, benim kimliğim "me" olur, saat farkı düzeltilir', () => {
    const s = serverPkSession(base(), local, 2_000, T0 + 60_000);
    assert.equal(s.id, 'SPK-7');
    assert.equal(s.status, 'active');
    assert.deepEqual(s.participants, ['me', 'u-a', 'u-b']);
    assert.deepEqual(s.points, { 'u-a': 500, 'u-b': 150 });
    assert.equal(s.startAt, T0 - 2_000, 'sunucu 2 sn ileride: yerel saate çevrilir');
    assert.equal(s.records.find((r) => r.recipientId === 'u-b')?.senderId, 'me');
  });

  test('geri sayım bitmeden "hazırlık"; iptal ve bitiş sunucudan gelir', () => {
    assert.equal(serverPkSession(base(), local, 0, T0 - 1).status, 'prep');
    const c = serverPkSession(base({ status: 'cancelled' }), local, 0, T0 + 1);
    assert.equal(c.status, 'cancelled');
    assert.ok(c.cancelReason);
    assert.equal(c.result, undefined);
  });

  test('bitince sonuç her telefonda aynı: sıralama, hediye sayısı ve taçlar', () => {
    const a = serverPkSession(base({ status: 'done' }), local, 0, T0 + 20 * 60_000);
    const b = serverPkSession(base({ status: 'done' }), local, 5_000, T0 + 30 * 60_000);
    assert.deepEqual(a.result, b.result);
    assert.deepEqual(a.result!.ranking.map((r) => r.userId), ['u-a', 'u-b', 'me']);
    assert.deepEqual(a.result!.winners, ['u-a']);
    assert.equal(a.result!.validGifts, 6);
    const top = a.result!.crowns.find((c) => c.top);
    assert.equal(top?.senderId, 'u-fan');
    assert.equal(top?.gifts, 2);
  });

  test('Takım PK: takım skorları ve üyeler', () => {
    const s = serverPkSession(
      base({
        mode: 'team',
        participants: ['u-me', 'u-a', 'u-b'],
        red: ['u-me'],
        blue: ['u-a', 'u-b'],
        pairs: [
          { from: 'u-fan', to: 'u-a', team: 'blue', points: 300, gifts: 1 },
          { from: 'u-fan', to: 'u-me', team: 'red', points: 100, gifts: 1 },
        ],
      }),
      local,
      0,
      T0 + 1,
    );
    assert.deepEqual(s.participants, []);
    assert.deepEqual(s.teams.map((t) => [t.id, t.members, t.score]), [
      ['red', ['me'], 100],
      ['blue', ['u-a', 'u-b'], 300],
    ]);
  });

  test('odanın PK’sı sunucunun cevabıyla değişir; yok derse kalkar', () => {
    applyServerPk('srv-room', serverPkSession(base(), local, 0, T0 + 1));
    assert.equal(pkOfRoom('srv-room')?.id, 'SPK-7');
    applyServerPk('srv-room', serverPkSession(base({ id: '8' }), local, 0, T0 + 1));
    assert.deepEqual(getPk().sessions.map((s) => s.id), ['SPK-8']);
    applyServerPk('srv-room', null);
    assert.equal(getPk().sessions.length, 0);
  });

  test('canlı odada takımlar ekrandaki mikrofon listesinden karıştırılır', () => {
    const r = drawTeamsFrom('srv-room', ['me', 'u-a', 'u-b', 'u-c']);
    assert.ok(r.ok);
    assert.equal(r.draft.red.length, 2);
    assert.equal(r.draft.blue.length, 2);
    assert.deepEqual([...r.draft.red, ...r.draft.blue].sort(), ['me', 'u-a', 'u-b', 'u-c']);
  });

  test('Takım PK: dışarıda bırakılanlar sunucudan gelir (eski sunucu göndermez)', () => {
    const team = { mode: 'team' as const, red: ['u-me'], blue: ['u-a'] };
    assert.deepEqual(serverPkSession(base({ ...team, out: ['u-b', 'u-me'] }), local, 0, T0 + 1).out, ['u-b', 'me']);
    assert.equal(serverPkSession(base(team), local, 0, T0 + 1).out, undefined);
    assert.equal(serverPkSession(base({ out: ['u-b'] }), local, 0, T0 + 1).out, undefined, 'Normal PK’da dışarıda yok');
  });
});

describe('Koltuk altındaki PK puanı her mikrofon düzeninde okunur', () => {
  test('kısa yazım: B ve Mn, aşağı yuvarlanır (kimse olduğundan fazla görünmez)', () => {
    assert.equal(shortPoints(0), '0');
    assert.equal(shortPoints(940), '940');
    assert.equal(shortPoints(1_000), '1B');
    assert.equal(shortPoints(1_099), '1B');
    assert.equal(shortPoints(16_450), '16,4B');
    assert.equal(shortPoints(16_450, false), '16B');
    assert.equal(shortPoints(61_990), '61,9B');
    assert.equal(shortPoints(123_456), '123B');
    assert.equal(shortPoints(999_999), '999B');
    assert.equal(shortPoints(1_250_000), '1,2Mn');
    assert.equal(shortPoints(2_500_000_000), '2,5Mr');
  });

  test('yer varsa tam sayı, yoksa kısa yazım; hediye simgesi yalnız tam sayının yanına sığdığında', () => {
    const pill = (value: number, width: number, scale = 1) => {
      const box = pkPillBox(width, scale);
      return `${box.icon ? '🎁' : ''}${pkPointsText(value, box.room, box.size * scale)}`;
    };
    // 30 mikrofon, 390 px (ekran görüntüsü): koltuk 57 px.
    assert.equal(pill(16_450, 57), '16.450');
    assert.equal(pill(1_234_567, 57), '1,2Mn');
    // Telefonun yazısı büyütülmüşse kısa yazıma geçer, yine kesilmez.
    assert.equal(pill(123_456, 57, 1.15), '123B');
    // 15 mikrofon, 390 px: koltuk 66 px.
    assert.equal(pill(61_990, 66), '🎁61.990');
    assert.equal(pill(169_990, 66), '🎁169B');
    // Takım arenası ve geniş koltuklar.
    assert.equal(pill(123_456, 80), '🎁123.456');
  });

  test('her düzende, her telefonda ve yazı büyütmede puan koltuğun içinde kalır', () => {
    const widths = new Set<number>([56, 60, 64, 80, 96]);
    for (const phone of [320, 360, 390, 412, 430])
      for (const l of ROOM_LAYOUTS) for (const pkRoom of [false, true]) widths.add(layoutPlan(l.layoutSchema, phone, pkRoom).micW);
    for (const phone of [320, 360, 390, 412]) for (const mics of [4, 10, 15]) for (const h of [200, 300, 420]) widths.add(fitGrid(mics - 1, phone, h).slot);
    assert.ok(Math.min(...widths) <= 42, `en dar koltuk ${Math.min(...widths)} px`);
    for (const width of widths)
      for (const scale of [1, 1.15])
        for (const value of [0, 7, 940, 9_999, 16_450, 61_990, 123_456, 999_999, 1_250_000, 9_999_999]) {
          const box = pkPillBox(width, scale);
          const text = pkPointsText(value, box.room, box.size * scale);
          const drawn = 2 + 2 * box.pad + (box.icon ? box.size + 2 : 0) + textWidth(text, box.size * scale);
          assert.ok(drawn <= width - 2, `${width} px, ${scale}x, ${value}: "${text}" ${drawn.toFixed(1)} px`);
        }
  });
});
