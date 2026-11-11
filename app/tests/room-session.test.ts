/// <reference types="node" />
// Room session: one voice connection per room, minimize/expand without reconnecting, explicit exit order,
// mic wanted vs sent, background, interruptions, audio route, permission, reconnection
// (Küçültülebilir Canlı Oda şartnamesi §2–§10, §11 A–D).
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import { createSimulatedEngine } from '@/lib/audio-engine';
import { isOnline, resetPresence, setConnection } from '@/lib/room-presence';
import {
  CONNECT_MS,
  RECONNECT_DELAYS,
  audioFocus,
  cancelSwitch,
  closeLeaveDialog,
  confirmSwitch,
  connectionLine,
  continueLeave,
  dismissEnded,
  endRoom,
  endedText,
  engineEvent,
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
  setEngine,
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

describe('Gerçek ses motoru durumu bildirir', () => {
  /** Like the LiveKit engine: joins in the background and reports the result through engineEvent. */
  const reporting = () => {
    const e = createSimulatedEngine(() => isOnline());
    setEngine({ ...e, name: e.name, capabilities: { ...e.capabilities, reportsState: true } });
  };

  test('katılım bitmeden "bağlı" gösterilmez; motor bağlandı deyince bağlı', () => {
    reporting();
    openRoom('r1', info);
    mock.timers.tick(CONNECT_MS * 10);
    assert.equal(s().status, 'connecting');
    engineEvent('r1', { type: 'connected' });
    assert.equal(s().status, 'connected');
  });

  test('bağlantı kurulamazsa bekleyerek yeniden dener; ilk katılım "yeniden kuruldu" demez, gerçek kopmadan dönüş der', () => {
    reporting();
    openRoom('r1', info);
    engineEvent('r1', { type: 'failed', final: false, message: 'Ses bağlantısı kurulamadı' });
    assert.equal(s().status, 'reconnecting');
    mock.timers.tick(RECONNECT_DELAYS[0]);
    assert.equal(s().status, 'reconnecting', 'motor bağlandı demeden bağlı gösterilmez');
    assert.equal(stats().reconnects, 1);
    engineEvent('r1', { type: 'connected' });
    assert.deepEqual([s().status, s().reconnectAttempt, s().everConnected, getSession().notice?.text], ['connected', 0, true, undefined]);
    engineEvent('r1', { type: 'lost' });
    engineEvent('r1', { type: 'connected' });
    assert.equal(getSession().notice?.text, 'Oda bağlantısı yeniden kuruldu.');
  });

  test('sunucu kesin reddederse (oda kapandı) oda sunucunun sözüyle kapanır, tekrar denenmez', () => {
    reporting();
    openRoom('r1', info);
    engineEvent('r1', { type: 'failed', final: true, reason: 'server', message: 'Oda kapandı' });
    assert.deepEqual([s().status, s().endReason, s().endText, stats().roomId], ['ended', 'server', 'Oda kapandı', null]);
  });

  test('odadan atılma ve mikrofon izni reddi doğru gösterilir; eski odanın haberi yok sayılır', () => {
    reporting();
    openRoom('r1', info);
    engineEvent('r1', { type: 'connected' });
    engineEvent('r1', { type: 'mic_denied' });
    assert.equal(s().permission, 'denied');
    engineEvent('r2', { type: 'removed', reason: 'kicked' });
    assert.equal(s().status, 'connected');
    engineEvent('r1', { type: 'removed', reason: 'kicked' });
    assert.deepEqual([s().status, s().endReason], ['ended', 'kicked']);
  });
  test('sunucu sesli susturma uygularsa mikrofon gitmez, bitince geri gelir; yazılı susturma ayrı izlenir', () => {
    reporting();
    openRoom('r1', info);
    engineEvent('r1', { type: 'connected' });
    reportRoomState('r1', { seated: true });
    setMicWant(true);
    assert.equal(micSending(s()), true);
    engineEvent('r1', { type: 'grant', canPublish: false, canChat: true });
    assert.deepEqual([micBlock(s()), micSending(s()), stats().publishing, s().micWant], ['sanctioned', false, false, true]);
    assert.match(getSession().notice?.text ?? '', /Sesli susturma/);
    engineEvent('r1', { type: 'grant', canPublish: false, canChat: false });
    assert.deepEqual([s().sanctionMuted, s().sanctionChat], [true, true]);
    engineEvent('r1', { type: 'grant', canPublish: true, canChat: true });
    assert.deepEqual([micBlock(s()), micSending(s()), stats().publishing], [null, true, true]);
    assert.equal(getSession().notice?.text, 'Yazılı susturman bitti.');
    // Another room's word changes nothing here.
    engineEvent('r2', { type: 'grant', canPublish: false, canChat: false });
    assert.equal(s().sanctionMuted, false);
  });
});

describe('Hiç bağlanmamış oda "koptu" demez', () => {
  const reporting = () => {
    const e = createSimulatedEngine(() => isOnline());
    setEngine({ ...e, name: e.name, capabilities: { ...e.capabilities, reportsState: true } });
  };
  const line = (offline = false) => connectionLine(s(), offline)?.text ?? null;

  test('ilk katılım: önce "Bağlanılıyor…", hata olunca "Bağlanılamadı · yeniden deneniyor (n. deneme)"', () => {
    reporting();
    openRoom('r1', info);
    assert.equal(s().everConnected, false);
    assert.equal(line(), 'Bağlanılıyor…');
    engineEvent('r1', { type: 'failed', final: false, message: 'Ses bağlantısı kurulamadı' });
    assert.equal(line(), 'Bağlanılamadı · yeniden deneniyor.');
    mock.timers.tick(RECONNECT_DELAYS[0]);
    assert.equal(line(), 'Bağlanılamadı · yeniden deneniyor (1. deneme).');
    assert.equal(connectionLine(s(), false)?.retry, true);
    assert.doesNotMatch(line() ?? '', /koptu|son alınan/);
  });

  test('ilk katılım hiç olmazsa "Odaya bağlanılamadı"; bağlantı kesildi ve eski liste denmez', () => {
    reporting();
    openRoom('r1', info);
    engineEvent('r1', { type: 'failed', final: false, message: 'Ses bağlantısı kurulamadı' });
    for (const d of RECONNECT_DELAYS) mock.timers.tick(d);
    assert.equal(s().status, 'disconnected');
    assert.equal(line(), 'Odaya bağlanılamadı. Ağ dönünce yeniden denenecek.');
    assert.equal(connectionLine(s(), false)?.bad, true);
  });

  test('bağlandıktan sonra gerçek kopma "Bağlantı koptu" der; bağlıyken satır yok', () => {
    reporting();
    openRoom('r1', info);
    engineEvent('r1', { type: 'connected' });
    assert.equal(line(), null);
    engineEvent('r1', { type: 'lost' });
    assert.match(line() ?? '', /^Bağlantı koptu · yeniden bağlanılıyor\./);
    mock.timers.tick(RECONNECT_DELAYS[0]);
    assert.match(line() ?? '', /\(1\. deneme\)/);
  });

  test('basit motor: ağ yokken açılan oda ağ dönünce bağlanır, "yeniden kuruldu" demez', () => {
    setConnection('offline');
    openRoom('r1', info);
    mock.timers.tick(CONNECT_MS);
    assert.equal(s().status, 'reconnecting');
    assert.equal(line(true), 'Bağlanılamadı · yeniden deneniyor.');
    setConnection('online');
    onNetwork(true);
    assert.deepEqual([s().status, s().everConnected, getSession().notice?.text], ['connected', true, undefined]);
  });
});

describe('Bitiş başlığı sunucunun sözünü kullanır', () => {
  const reporting = () => {
    const e = createSimulatedEngine(() => isOnline());
    setEngine({ ...e, name: e.name, capabilities: { ...e.capabilities, reportsState: true } });
  };
  const refused = (message: string, reason: 'kicked' | 'server' = 'kicked') => {
    reporting();
    openRoom('r1', info);
    engineEvent('r1', { type: 'failed', final: true, reason, message });
    return endedText(s());
  };

  test('girişte 403: başlık "Bu odaya giremezsin" / "Oda şifresi yanlış", "Odadan çıkarıldın" değil', () => {
    const blocked = refused('Bu odaya giremezsin');
    assert.equal(blocked.title, 'Bu odaya giremezsin');
    assert.equal(blocked.body, '“Gece Sohbeti” odasına girilemedi.', 'hiç girmeyene "mikrofonun kapatıldı" denmez');
    resetSession();
    assert.equal(refused('Oda şifresi yanlış').title, 'Oda şifresi yanlış');
    resetSession();
    assert.equal(refused('Oda kapandı', 'server').title, 'Oda kapandı');
  });

  test('içerideyken atılma (sunucu sözü yok) "Odadan çıkarıldın"; kapanan oda "Oda sona erdi"', () => {
    reporting();
    openRoom('r1', info);
    engineEvent('r1', { type: 'connected' });
    engineEvent('r1', { type: 'removed', reason: 'kicked' });
    const kicked = endedText(s());
    assert.equal(kicked.title, 'Odadan çıkarıldın');
    assert.match(kicked.body, /Mikrofonun ve ses bağlantın kapatıldı\.$/);
    resetSession();
    talking();
    endRoom('server');
    assert.equal(endedText(s()).title, 'Oda sona erdi');
  });

  test('bağlıyken gelen sunucu sözü başlık olur; gövde bağlantının kapandığını söyler', () => {
    reporting();
    openRoom('r1', info);
    engineEvent('r1', { type: 'connected' });
    engineEvent('r1', { type: 'failed', final: true, reason: 'kicked', message: 'Bu odadan geçici olarak çıkarıldın' });
    assert.deepEqual(endedText(s()), { title: 'Bu odadan geçici olarak çıkarıldın', body: 'Mikrofonun ve ses bağlantın kapatıldı.' });
  });

  test('yetkilisiz kalan oda kapanınca sunucunun nedeni başlık ve gövde olur', () => {
    reporting();
    openRoom('r1', info);
    engineEvent('r1', { type: 'connected' });
    engineEvent('r1', { type: 'removed', reason: 'server', title: 'Oda kapandı', body: 'Odada 5 dakikadır oda sahibi ya da yönetici yoktu.' });
    assert.equal(s().status, 'ended');
    assert.deepEqual(endedText(s()), { title: 'Oda kapandı', body: 'Odada 5 dakikadır oda sahibi ya da yönetici yoktu.' });
    // The voice room ending right after it changes nothing: the session already says why.
    engineEvent('r1', { type: 'removed', reason: 'server' });
    assert.equal(endedText(s()).title, 'Oda kapandı');
  });
});
