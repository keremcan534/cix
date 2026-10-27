/// <reference types="node" />
// Room presence server: counting, Balkon/mic transitions, moderation, mic invites, event dedupe and the
// viewer's offline snapshot (Canlı Oda şartnamesi §3, §6, §7, §10, §13).
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  INVITE_COOLDOWN_MS,
  INVITE_TTL_MS,
  activeBans,
  answerInvite,
  deriveView,
  enterRoom,
  exitRoom,
  forceLeaveSeat,
  getPresence,
  getRoom,
  inviteToMic,
  join,
  kick,
  leave,
  leaveSeat,
  resetPresence,
  resize,
  seatBy,
  seedRoom,
  setBlacklist,
  setBoss,
  setConnection,
  setInviteAnswer,
  setLocks,
  setMicMute,
  takeSeat,
} from '@/lib/room-presence';

const R = 'room-test';
const view = () => deriveView(getRoom(R)!);
/** 20 mics, all taken; 50 unique people in the room. */
function fullRoom() {
  const seats = Array.from({ length: 20 }, (_, i) => (i === 0 ? 'host' : `m${i}`));
  return seedRoom(R, { ownerId: 'host', adminIds: ['admin'], seats, capacity: 20, total: 50, regulars: ['admin', 'u1', 'u2'] });
}
/** 10 mics, 3 taken, 12 people. */
function smallRoom() {
  return seedRoom(R, { ownerId: 'host', adminIds: ['admin'], seats: ['host', 'admin', 'm1'], capacity: 10, total: 12, regulars: ['u1', 'u2', 'u3'] });
}

beforeEach(() => {
  resetPresence();
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  setInviteAnswer('timeout'); // invited bots stay silent unless a test answers for them
});
afterEach(() => mock.timers.reset());

describe('Katılımcı sayımı', () => {
  test('20 mikrofon dolu, 50 kişi: Balkon 30, mikrofonda 20, toplam 50', () => {
    fullRoom();
    const v = view();
    assert.equal(v.total, 50);
    assert.equal(v.mic, 20);
    assert.equal(v.balcony, 30);
    assert.equal(new Set([...v.micIds, ...v.balconyIds]).size, 50, 'kimse iki listede birden yok');
  });

  test('mikrofondaki kişi Balkon’da ikinci kez sayılmaz; odada olmayan koltuk sahibi sayılmaz', () => {
    smallRoom();
    const r = getRoom(R)!;
    assert.ok(!deriveView(r).balconyIds.includes('m1'));
    // A stale seat entry for someone no longer in the room never counts.
    const broken = { ...r, seats: ['host', 'ghost', ...r.seats.slice(2)] };
    assert.equal(deriveView(broken).total, deriveView(broken).micIds.length + deriveView(broken).balconyIds.length);
    assert.ok(!deriveView(broken).micIds.includes('ghost'));
  });

  test('Balkon → mikrofon ve mikrofon → Balkon geçişinde iki sayaç birlikte değişir, toplam sabit', () => {
    smallRoom();
    const before = view();
    assert.equal(takeSeat(R, 'u1', 5).ok, true);
    assert.deepEqual([view().mic, view().balcony, view().total], [before.mic + 1, before.balcony - 1, before.total]);
    leaveSeat(R, 'u1');
    assert.deepEqual([view().mic, view().balcony, view().total], [before.mic, before.balcony, before.total]);
  });

  test('odadan ayrılan kişi listeden ve sayaçlardan çıkar, mikrofonu boşalır', () => {
    smallRoom();
    leave(R, 'm1');
    assert.equal(view().total, 11);
    assert.ok(!getRoom(R)!.seats.includes('m1'));
    assert.ok(!view().balconyIds.includes('m1'));
  });

  test('aynı katılma olayı iki kez gelirse kişi bir kez sayılır; eski olay tekrar gelince ayrılan kişi geri eklenmez', () => {
    smallRoom();
    assert.equal(join(R, 'newbie', { eventId: 'ev-1' }).ok, true);
    const dup = join(R, 'newbie', { eventId: 'ev-1' });
    assert.equal(dup.ok, false);
    assert.equal(view().total, 13);
    leave(R, 'newbie', 'ev-2');
    assert.equal(join(R, 'newbie', { eventId: 'ev-1' }).ok, false, 'gecikmiş tekrar olay uygulanmaz');
    assert.equal(view().total, 12);
    assert.ok(getPresence().duplicates >= 2);
  });

  test('bağlantı kopunca görüntü dondurulur, sunucu değişmeye devam eder, yeniden bağlanınca senkron olur', () => {
    smallRoom();
    setConnection('offline');
    join(R, 'late', { eventId: 'ev-late' });
    assert.equal(deriveView(getPresence().frozen![R]).total, 12, 'çevrimdışı görüntü eski veriyi gösterir');
    assert.equal(view().total, 13, 'sunucu güncel');
    setConnection('online');
    assert.equal(getPresence().frozen, null);
    assert.equal(view().total, 13);
  });

  test('gizli giriş: Balkon’dayken sayılmaz, mikrofona geçince sayılır', () => {
    smallRoom();
    join(R, 'me', { hidden: true });
    assert.equal(view().total, 12);
    takeSeat(R, 'me', 6);
    assert.equal(view().total, 13);
  });

  test('mikrofon sayısı azalınca kaldırılan koltuktakiler Balkon’a geçer, odadan düşmez', () => {
    smallRoom();
    takeSeat(R, 'u1', 9);
    resize(R, 5);
    assert.equal(view().total, 12);
    assert.ok(view().balconyIds.includes('u1'));
  });
});

describe('Moderasyon yetkileri (sunucuda)', () => {
  test('yetkisiz kullanıcı odadan çıkaramaz, susturamaz, mikrofondan indiremez; deneme kayda geçer', () => {
    smallRoom();
    assert.equal(kick(R, 'u1', 'u2').ok, false);
    assert.equal(setMicMute(R, 'u1', 'm1', true).ok, false);
    assert.equal(forceLeaveSeat(R, 'u1', 'm1').ok, false);
    assert.ok(getPresence().audit.some((a) => a.action.startsWith('Reddedildi')));
  });

  test('yönetici oda sahibini veya diğer yöneticiyi çıkaramaz; kimse kendini çıkaramaz', () => {
    smallRoom();
    assert.equal(kick(R, 'admin', 'host').ok, false);
    assert.equal(kick(R, 'host', 'host').ok, false);
  });

  test('odadan çıkarma: kişi odadan düşer, 10 dk giremez; kara liste kalıcı', () => {
    smallRoom();
    assert.equal(kick(R, 'admin', 'u1').ok, true);
    assert.ok(!getRoom(R)!.members.includes('u1'));
    assert.equal(join(R, 'u1').ok, false);
    mock.timers.tick(10 * 60_000 + 1);
    assert.equal(join(R, 'u1').ok, true, 'süre bitince kurallar tekrar katılmaya izin verir');
    assert.equal(kick(R, 'host', 'u2', null).ok, true);
    mock.timers.tick(24 * 60 * 60_000);
    assert.equal(join(R, 'u2').ok, false);
  });

  test('mikrofon susturma yalnızca mikrofondaki kişiye uygulanır', () => {
    smallRoom();
    assert.equal(setMicMute(R, 'admin', 'u1', true).ok, false, 'Balkon kullanıcısının mikrofonu yok');
    assert.equal(setMicMute(R, 'admin', 'm1', true).ok, true);
    assert.ok(getRoom(R)!.micMuted.includes('m1'));
  });
});

describe('Mikrofon daveti', () => {
  test('üye davet gönderemez; mikrofondaki kişiye davet gönderilemez', () => {
    smallRoom();
    assert.equal(inviteToMic(R, 'u1', 'u2').ok, false);
    assert.equal(inviteToMic(R, 'admin', 'm1').ok, false);
  });

  test('davet kişiyi otomatik oturtmaz; kabul edince boş mikrofona geçer', () => {
    smallRoom();
    const r = inviteToMic(R, 'admin', 'u1');
    assert.ok(r.ok);
    assert.ok(!getRoom(R)!.seats.includes('u1'));
    assert.equal(answerInvite(R, r.invite.id, 'u2', true).ok, false, 'başkası yanıtlayamaz');
    const a = answerInvite(R, r.invite.id, 'u1', true);
    assert.ok(a.ok);
    assert.equal(getRoom(R)!.seats[a.seat!], 'u1');
    assert.equal(getRoom(R)!.invites[0].status, 'accepted');
  });

  test('ret ve zaman aşımı kişiyi oturtmaz', () => {
    smallRoom();
    const r1 = inviteToMic(R, 'admin', 'u1');
    assert.ok(r1.ok);
    answerInvite(R, r1.invite.id, 'u1', false);
    assert.equal(getRoom(R)!.invites.find((i) => i.id === r1.invite.id)!.status, 'declined');
    const r2 = inviteToMic(R, 'admin', 'u2');
    assert.ok(r2.ok);
    mock.timers.tick(INVITE_TTL_MS + 1);
    assert.equal(getRoom(R)!.invites.find((i) => i.id === r2.invite.id)!.status, 'expired');
    assert.equal(answerInvite(R, r2.invite.id, 'u2', true).ok, false);
    assert.ok(!getRoom(R)!.seats.includes('u1') && !getRoom(R)!.seats.includes('u2'));
  });

  test('aynı kişiye art arda davet sınırlanır', () => {
    smallRoom();
    const r = inviteToMic(R, 'admin', 'u1');
    assert.ok(r.ok);
    assert.equal(inviteToMic(R, 'admin', 'u1').ok, false, 'bekleyen davet varken');
    answerInvite(R, r.invite.id, 'u1', false);
    assert.equal(inviteToMic(R, 'admin', 'u1').ok, false, 'bekleme süresi içinde');
    mock.timers.tick(INVITE_COOLDOWN_MS + 1);
    assert.equal(inviteToMic(R, 'admin', 'u1').ok, true);
  });

  test('davet beklerken mikrofonlar dolarsa kabul mikrofon ataması yapmaz', () => {
    seedRoom(R, { ownerId: 'host', adminIds: ['admin'], seats: ['host', 'admin', null], capacity: 3, total: 6, regulars: ['u1', 'u2'] });
    const r = inviteToMic(R, 'admin', 'u1');
    assert.ok(r.ok);
    takeSeat(R, 'u2', 2); // last free mic taken meanwhile
    const a = answerInvite(R, r.invite.id, 'u1', true);
    assert.equal(a.ok, false);
    assert.ok(!getRoom(R)!.seats.includes('u1'));
    assert.equal(getRoom(R)!.invites[0].status, 'failed');
  });

  test('boş mikrofon yoksa davet gönderilmez; kilitli mikrofon boş sayılmaz', () => {
    seedRoom(R, { ownerId: 'host', adminIds: [], seats: ['host', null], capacity: 2, total: 4, regulars: ['u1'] });
    setLocks(R, [1]);
    assert.equal(inviteToMic(R, 'host', 'u1').ok, false);
  });

  test('davet edilen kişi odadan ayrılırsa davet iptal olur', () => {
    smallRoom();
    const r = inviteToMic(R, 'admin', 'u1');
    assert.ok(r.ok);
    leave(R, 'u1');
    assert.equal(getRoom(R)!.invites[0].status, 'cancelled');
  });
});

describe('İnceleme düzeltmeleri', () => {
  test('aynı oda iki ekranda açıksa birini kapatmak kişiyi odadan çıkarmaz', () => {
    smallRoom();
    assert.equal(enterRoom(R, 'me').ok, true);
    takeSeat(R, 'me', 6);
    enterRoom(R, 'me'); // the same room stacked again (room → profile → room)
    exitRoom(R, 'me');
    assert.ok(getRoom(R)!.members.includes('me'));
    assert.equal(getRoom(R)!.seats[6], 'me', 'mikrofon korunur');
    exitRoom(R, 'me');
    assert.ok(!getRoom(R)!.members.includes('me'), 'son ekran kapanınca ayrılır');
  });

  test('patron koltuğundaki kişi mikrofonda sayılır, Balkon’da değil', () => {
    smallRoom();
    const before = deriveView(getRoom(R)!);
    setBoss(R, 'u1');
    const v = deriveView(getRoom(R)!);
    assert.deepEqual([v.mic, v.balcony, v.total], [before.mic + 1, before.balcony - 1, before.total]);
    leave(R, 'u1');
    assert.equal(getRoom(R)!.boss, null);
  });

  test('başkasını mikrofona almak rol ister; üst rolü taşıyamazsın; kendin oturabilirsin', () => {
    smallRoom();
    assert.equal(seatBy(R, 'u1', 'u2', 5).ok, false, 'üye başkasını oturtamaz');
    assert.equal(seatBy(R, 'admin', 'u2', 5).ok, true, 'yönetici Balkon’daki kişiyi alabilir');
    assert.equal(seatBy(R, 'admin', 'host', 7).ok, false, 'yönetici sahibi taşıyamaz');
    assert.equal(seatBy(R, 'u3', 'u3', 8).ok, true);
  });

  test('kara liste: listedeki kişi odadan çıkar ve giremez; listeden çıkınca girebilir', () => {
    seedRoom(R, { ownerId: 'host', adminIds: [], seats: ['host'], capacity: 5, total: 6, regulars: ['u1', 'u2'], blacklist: ['u2'] });
    assert.ok(!getRoom(R)!.members.includes('u2'), 'seed kara listeyi uygular');
    setBlacklist(R, ['u2', 'u1']);
    assert.ok(!getRoom(R)!.members.includes('u1'));
    assert.equal(join(R, 'u1').ok, false);
    setBlacklist(R, ['u2']);
    assert.equal(join(R, 'u1').ok, true);
  });

  test('süresi dolan yasak etkin sayılmaz', () => {
    smallRoom();
    kick(R, 'host', 'u1');
    assert.deepEqual(activeBans(getRoom(R)!), ['u1']);
    mock.timers.tick(10 * 60_000 + 1);
    assert.deepEqual(activeBans(getRoom(R)!), []);
  });
});
