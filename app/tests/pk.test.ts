/// <reference types="node" />
// PK server: Normal and Team PK, server-side team draw, scoring rules, dedupe, single finalization, ties,
// refunds and crown relations (Gelişmiş PK şartnamesi §2–§10).
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import { computeCrowns, drawTeams, finishNow, getPk, recordGift, resetPk, revokeGift, startRoomPk, type PkSession } from '@/lib/pk';
import { join, leave, leaveSeat, resetPresence, seedRoom, takeSeat } from '@/lib/room-presence';

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

  test('Normal PK için en az 2 mikrofon kullanıcısı; üye PK başlatamaz; odada tek PK', () => {
    room(1);
    assert.equal(startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' }).ok, false);
    resetPresence();
    room(3);
    assert.equal(startRoomPk({ roomId: R, starterId: 'fan1', durationMin: 15, mode: 'solo' }).ok, false);
    assert.equal(startRoomPk({ roomId: R, starterId: 'admin', durationMin: 15, mode: 'solo' }).ok, true);
    assert.equal(startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' }).ok, false);
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

  test('manuel: aynı kişi iki takımda olamaz, mikrofonda olmayan seçilemez, takım boş kalamaz', () => {
    room(4);
    const base = { roomId: R, starterId: 'host', durationMin: 15, mode: 'team' as const };
    assert.equal(startRoomPk({ ...base, red: ['host', 'p1'], blue: ['p1'] }).ok, false);
    assert.equal(startRoomPk({ ...base, red: ['host'], blue: ['fan1'] }).ok, false);
    assert.equal(startRoomPk({ ...base, red: ['host', 'admin'], blue: [] }).ok, false);
    assert.equal(startRoomPk({ ...base, red: ['host', 'admin', 'p1'], blue: ['p2'] }).ok, true, 'dengesiz ama kurallara uygun');
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

  test('Takım PK: takımlar sabit; sonradan mikrofona geçen kişi takımsız kalır ve puan almaz', () => {
    room(4);
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'team', red: ['host', 'admin'], blue: ['p1', 'p2'] });
    activate();
    takeSeat(R, 'spare1', 8);
    assert.equal(gift('spare1').r.ok, false);
    assert.equal(pk().teams[0].score + pk().teams[1].score, 0);
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
