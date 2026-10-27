/// <reference types="node" />
// Room session: one voice connection per room, minimize/expand without reconnecting, explicit exit order,
// mic wanted vs sent, background, interruptions, audio route, permission, reconnection
// (Küçültülebilir Canlı Oda şartnamesi §2–§10, §11 A–D).
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import { resetPresence, setConnection } from '@/lib/room-presence';
import {
  CONNECT_MS,
  RECONNECT_DELAYS,
  audioFocus,
  cancelSwitch,
  closeLeaveDialog,
  confirmSwitch,
  continueLeave,
  dismissEnded,
  endRoom,
  engineInfo,
  getSession,
  hasOpener,
  micBlock,
  micSending,
  onAppState,
  onNetwork,
  openRoom,
  phoneCall,
  registerOpener,
  reportRoomState,
  requestLeave,
  resetSession,
  retryNow,
  setMicWant,
  setPermission,
  setPersist,
  setMiniHidden,
  setRoute,
} from '@/lib/room-session';

const info = { title: 'Gece Sohbeti', cover: 'c' };
const s = () => getSession().session!;
const stats = () => engineInfo().stats;
/** Opened, connected, joined, on a mic with the mic on. */
function talking(room = 'r1') {
  openRoom(room, info);
  mock.timers.tick(CONNECT_MS);
  reportRoomState(room, { joined: true, seated: true });
  setMicWant(true);
}

beforeEach(() => {
  resetPresence();
  resetSession();
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 9_000_000 });
});
afterEach(() => mock.timers.reset());

describe('Açma, küçültme, büyütme', () => {
  test('oda açılınca tek bağlantı kurulur; kısa süre "bağlanıyor", sonra "bağlı"', () => {
    assert.equal(openRoom('r1', info), 'started');
    assert.equal(s().status, 'connecting');
    mock.timers.tick(CONNECT_MS);
    assert.equal(s().status, 'connected');
    assert.equal(stats().connects, 1);
  });

  test('aynı odayı tekrar açmak (mini karttan büyütmek) yeniden bağlanmaz, ikinci oturum açmaz', () => {
    talking();
    for (let i = 0; i < 5; i++) assert.equal(openRoom('r1', info), 'same');
    assert.deepEqual([stats().connects, stats().reconnects, stats().maxConcurrent, stats().publishStarts], [1, 0, 1, 1]);
    assert.equal(s().micWant, true, 'mikrofon durumu korunur');
  });

  test('başka bir oda açılırken önce sorulur; onayda eski oda kapanır, aynı anda iki bağlantı olmaz', () => {
    talking('r1');
    assert.equal(openRoom('r2', info), 'confirm');
    assert.equal(s().roomId, 'r1', 'onaydan önce hiçbir şey değişmez');
    cancelSwitch();
    assert.equal(getSession().switchTo, null);
    openRoom('r2', info);
    confirmSwitch();
    assert.equal(s().roomId, 'r2');
    assert.equal(s().micWant, false, 'yeni odada mikrofon kapalı başlar');
    assert.deepEqual([stats().connects, stats().disconnects, stats().maxConcurrent], [2, 1, 1]);
  });
});

describe('Odadan çıkış', () => {
  test('açık çıkış: önce mikrofon yayını, sonra bağlantı kapanır; oturum ve kayıt silinir', () => {
    const saved: unknown[] = [];
    setPersist((x) => saved.push(x));
    talking();
    assert.equal(stats().publishing, true);
    endRoom('left');
    assert.deepEqual([stats().publishing, stats().disconnects, stats().concurrent], [false, 1, 0]);
    assert.equal(getSession().session, null);
    assert.deepEqual(saved, [{ roomId: 'r1', title: 'Gece Sohbeti' }, null]);
  });

  test('sunucunun sonlandırması: oturum "bitti" olarak kalır ve nedeni gösterilir; kapatınca temizlenir', () => {
    talking();
    endRoom('server');
    assert.deepEqual([s().status, s().endReason, stats().concurrent, stats().publishing], ['ended', 'server', 0, false]);
    dismissEnded();
    assert.equal(getSession().session, null);
  });

  test('çıkış penceresi: vazgeçilirse hiçbir şey olmaz; küçült seçilirse bekleyen geri hareketi bir kez çalışır', () => {
    talking();
    let backs = 0;
    requestLeave(() => backs++);
    requestLeave(() => backs++); // back pressed again while the sheet is open
    closeLeaveDialog();
    assert.deepEqual([backs, getSession().leaveDialog, s().status], [0, false, 'connected']);
    requestLeave(() => backs++);
    assert.equal(continueLeave(), true);
    assert.equal(continueLeave(), false, 'ikinci kez çalışmaz');
    assert.deepEqual([backs, getSession().leaving, s().status], [1, true, 'connected'], 'küçültmek odadan çıkarmaz');
  });
});

describe('Bitiş nedenleri ve mini görünüm', () => {
  test('odaya girişin reddi oturumu iz bırakmadan kapatır; atılma "bitti" olarak kalır', () => {
    openRoom('r1', info);
    endRoom('denied');
    assert.equal(getSession().session, null);
    talking('r2');
    endRoom('kicked');
    assert.deepEqual([s().status, s().endReason, s().micWant, stats().concurrent], ['ended', 'kicked', false, 0]);
    assert.equal(openRoom('r3', info), 'started', 'bitmiş oturum yeni odayı engellemez');
  });

  test('mini kartı gizlemek bağlantıya ve mikrofona dokunmaz; aynı odayı açmak kartı geri getirir', () => {
    talking();
    setMiniHidden(true);
    assert.deepEqual([s().miniHidden, s().status, micSending(s()), stats().disconnects], [true, 'connected', true, 0]);
    openRoom('r1', info);
    assert.equal(s().miniHidden, false);
  });

  test('oda rotası sayılır: büyütme, yığında duran odaya geri döner', () => {
    const a = registerOpener('r1');
    const b = registerOpener('r1');
    a();
    assert.equal(hasOpener('r1'), true);
    b();
    assert.equal(hasOpener('r1'), false);
  });

  test('yeniden başlatma: kayıtlı odaya dönüş mikrofon kapalı başlar ve kullanıcıya söylenir', () => {
    openRoom('r1', { ...info, recovered: true });
    assert.deepEqual([s().recovered, s().micWant], [true, false]);
    assert.match(getSession().notice!.text, /mikrofonun kapalı/);
  });

  test('arka plana geçerken oda diske yazılır (işletim sistemi uygulamayı kapatabilir)', () => {
    const saved: unknown[] = [];
    setPersist((x) => saved.push(x));
    talking();
    onAppState('background');
    assert.deepEqual(saved, [{ roomId: 'r1', title: 'Gece Sohbeti' }, { roomId: 'r1', title: 'Gece Sohbeti' }]);
  });
});

describe('Mikrofon: istenen ve gerçekten giden', () => {
  test('mikrofonda değilken açık istense de ses gitmez; nedeni bilinir', () => {
    openRoom('r1', info);
    mock.timers.tick(CONNECT_MS);
    setMicWant(true);
    assert.equal(micSending(s()), false);
    assert.equal(micBlock(s()), 'not_seated');
    reportRoomState('r1', { seated: true });
    assert.equal(micSending(s()), true);
    assert.equal(stats().publishing, true);
  });

  test('izin kaldırılınca ses gitmez ama kullanıcının ayarı silinmez; izin dönünce devam eder', () => {
    talking();
    setPermission(false);
    assert.deepEqual([s().micWant, micSending(s()), micBlock(s()), stats().publishing], [true, false, 'permission', false]);
    assert.equal(getSession().notice?.tone, 'warn');
    setPermission(true);
    assert.equal(stats().publishing, true);
  });

  test('moderatör susturması sunucudan gelir ve uygulanır', () => {
    talking();
    reportRoomState('r1', { modMuted: true });
    assert.deepEqual([micBlock(s()), stats().publishing], ['mod_muted', false]);
  });
});

describe('Arka plan', () => {
  test('arka plana geçmek odadan çıkarmaz ve mikrofon ayarını değiştirmez', () => {
    talking();
    onAppState('background');
    assert.deepEqual([s().status, s().micWant, s().joined], ['connected', true, true]);
  });

  test('arka plan sesini desteklemeyen motorda ses "gidiyor" gösterilmez; dönünce aynı oturum sürer', () => {
    talking();
    onAppState('background');
    assert.deepEqual([micSending(s()), micBlock(s()), stats().publishing], [false, 'background', false]);
    onAppState('active');
    assert.deepEqual([micSending(s()), stats().connects, stats().reconnects], [true, 1, 0]);
    assert.match(getSession().notice!.text, /arka plan/);
  });
});

describe('Kesintiler ve ses çıkışı', () => {
  test('telefon görüşmesi: ses durur, mikrofon gitmez; bitince ses sürer, mikrofon güvenlik için kapalı kalır', () => {
    talking();
    phoneCall(true);
    assert.deepEqual([micBlock(s()), stats().publishing], ['phone_call', false]);
    phoneCall(false);
    assert.deepEqual([s().interruption, s().micWant, s().status], [null, false, 'connected']);
  });

  test('kısa ses odağı kaybı: geri gelince her şey olduğu gibi sürer', () => {
    talking();
    audioFocus(true);
    assert.equal(stats().publishing, false);
    audioFocus(false);
    assert.deepEqual([s().micWant, stats().publishing], [true, true]);
  });

  test('Bluetooth bağlanınca ses ona, ayrılınca hoparlöre geçer', () => {
    talking();
    setRoute('bluetooth');
    assert.equal(stats().route, 'bluetooth');
    setRoute('speaker');
    assert.equal(stats().route, 'speaker');
  });
});

describe('Bağlantı kopması', () => {
  test('ağ gidince "yeniden bağlanıyor"; ağ dönünce aynı oturum yeniden kurulur (yeni katılım yok)', () => {
    talking();
    setConnection('offline');
    onNetwork(false);
    assert.deepEqual([s().status, micSending(s())], ['reconnecting', false]);
    mock.timers.tick(RECONNECT_DELAYS[0]); // first try fails: still offline
    assert.equal(s().reconnectAttempt, 1);
    setConnection('online');
    onNetwork(true);
    assert.deepEqual([s().status, stats().connects, stats().reconnects, micSending(s())], ['connected', 1, 1, true]);
  });

  test('uzun kesinti: denemeler bitince "bağlantı kesildi" gösterilir; yeniden dene ile kurulur', () => {
    talking();
    setConnection('offline');
    onNetwork(false);
    for (const d of RECONNECT_DELAYS) {
      assert.equal(s().status, 'reconnecting');
      mock.timers.tick(d); // each try fails while the network is down: 1, 2, 4, 8, 16 s
    }
    assert.equal(s().status, 'disconnected');
    assert.equal(stats().reconnects, 0, 'başarısızlık bağlıymış gibi gösterilmez');
    retryNow();
    assert.equal(s().status, 'reconnecting', 'ağ yokken başarı gösterilmez');
    setConnection('online');
    retryNow();
    assert.equal(s().status, 'connected');
  });
});
