/// <reference types="node" />
// Room modes and mic layouts ("Yayına Katılma Modu"): catalog, mic rules, permission and level checks in the
// domain layer, YouTube link validation and shared playback sync.
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import { ROOM_LAYOUTS, ROOM_MODES, compileSchema, type RoomLayout } from '@/data/room-layouts';
import { getRoom, inviteToMic, resetPresence, seedRoom, setConnection, setLocks, setMicMute, takeSeat } from '@/lib/room-presence';
import {
  ALL_FEATURES,
  SYNC_TOLERANCE_S,
  changeLayout,
  checkCapacity,
  expectedPosition,
  getStage,
  getStages,
  layoutAccess,
  layoutById,
  layoutsOf,
  pauseVideo,
  playVideo,
  playerSync,
  reportPlayer,
  resetStages,
  seedStage,
  seekVideo,
  setClassicCapacity,
  setLayoutCatalog,
  setStageInfo,
  setVideo,
  slotStates,
  stageCapacity,
  stopVideo,
  type StageInfo,
} from '@/lib/room-modes';
import { parseYouTubeUrl } from '@/lib/youtube';

const R = 'stage-test';
const ID = 'dQw4w9WgXcQ';
const info = (p: Partial<StageInfo> = {}): StageInfo => ({ level: 9, theme: 'pk', manageFunctions: 'admins', classicCapacity: 10, classicMax: 10, features: ALL_FEATURES, ...p });
/** Owner "host", admin "admin", member "u1"; 10 classic mics, host and admin seated. */
function room(p: Partial<StageInfo> = {}, seats: (string | null)[] = ['host', 'admin']) {
  seedRoom(R, { ownerId: 'host', adminIds: ['admin'], seats, capacity: 10, total: 6, regulars: ['admin', 'u1', 'u2', 'u3'] });
  seedStage(R, { info: info(p) });
}
const cards = (mode: Parameters<typeof layoutsOf>[0]) => layoutsOf(mode).map((l) => `${l.microphoneCapacity}${l.isPkLayout ? 'pk' : ''}/${l.minimumRoomLevel}`);

beforeEach(() => {
  resetPresence();
  resetStages();
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 5_000_000 });
});
afterEach(() => mock.timers.reset());

describe('Katalog', () => {
  test('sekmeler sırayla Ses, Video, Sinema Salonu, Çift Odası', () => {
    assert.deepEqual(ROOM_MODES.map((m) => m.name), ['Ses', 'Video', 'Sinema Salonu', 'Çift Odası']);
  });
  test('her sekme doğru kartları doğru seviyelerle gösterir', () => {
    assert.deepEqual(cards('audio'), ['2/1', '5pk/1', '6/1', '6/1', '6pk/1', '9pk/1', '9pk/1', '11/1', '12pk/1', '13pk/4', '15pk/1', '15/5', '16pk/6', '20/7', '24/8', '30/9']);
    assert.deepEqual(cards('video'), ['5/5', '6/5', '6/6', '7/7', '8/5', '8/7', '10/5', '10/8', '11/6', '12/7', '13/8', '15/9']);
    assert.deepEqual(cards('cinema'), ['2/2', '3/2', '4/2', '7/5']);
    assert.deepEqual(layoutsOf('couple').map((l) => `${l.name}:${l.microphoneCapacity}/${l.minimumRoomLevel}`), ['Randevu:5/1', 'Düğün:10/3']);
  });
  test('kapasite her yerleşimde şemadaki yuva sayısına eşit; yuva numaraları 0..n-1', () => {
    for (const l of ROOM_LAYOUTS) {
      assert.equal(l.layoutSchema.slots.length, l.microphoneCapacity, l.id);
      assert.deepEqual(l.layoutSchema.slots.map((s) => s.index), [...Array(l.microphoneCapacity).keys()], l.id);
    }
  });
  test('kimlikler benzersiz; aynı kapasitede birden fazla yerleşim olabilir', () => {
    assert.equal(new Set(ROOM_LAYOUTS.map((l) => l.id)).size, ROOM_LAYOUTS.length);
    const sixes = layoutsOf('audio').filter((l) => l.microphoneCapacity === 6);
    assert.equal(sixes.length, 3);
    assert.notDeepEqual(sixes[0].layoutSchema, sixes[1].layoutSchema);
    assert.equal(layoutsOf('video').filter((l) => l.microphoneCapacity === 10).length, 2);
  });
  test('şema içeriği: sinemada ve videoda ortak ekran, seste yok; PK takım yerleşiminde kırmızı/mavi bölgeler eşit', () => {
    assert.ok(layoutsOf('cinema').every((l) => l.layoutSchema.content));
    assert.ok(layoutsOf('video').every((l) => l.layoutSchema.content));
    assert.ok(layoutsOf('audio').every((l) => !l.layoutSchema.content));
    const team = layoutById('audio-9-team')!.layoutSchema.slots;
    assert.equal(team.filter((s) => s.team === 'red').length, 4);
    assert.equal(team.filter((s) => s.team === 'blue').length, 4);
    const side = layoutById('video-10-side')!.layoutSchema.slots;
    assert.equal(side.filter((s) => s.area === 'side').length, 9);
    assert.deepEqual(layoutById('couple-wedding')!.layoutSchema.pairs, [[0, 1]]);
  });
  test('yeni yerleşim kod yazmadan katalog verisiyle eklenir ve hemen seçilebilir', () => {
    room();
    const extra: RoomLayout = { id: 'audio-8-custom', modeId: 'audio', name: '8 mikrofon', microphoneCapacity: 8, minimumRoomLevel: 2, layoutSchema: compileSchema(['hmm', 'mmm', 'mm'], '', 'audio'), isPkLayout: false, isEnabled: true, sortOrder: 1500 };
    setLayoutCatalog([...ROOM_LAYOUTS, extra]);
    assert.ok(layoutsOf('audio').some((l) => l.id === 'audio-8-custom'));
    assert.equal(changeLayout(R, 'host', 'audio-8-custom').ok, true);
    assert.equal(getRoom(R)!.seats.length, 8);
  });
  test('kapalı yerleşim sekmede görünmez ve id ile gönderilse de reddedilir', () => {
    room();
    setLayoutCatalog(ROOM_LAYOUTS.map((l) => (l.id === 'audio-20' ? { ...l, isEnabled: false } : l)));
    assert.ok(!layoutsOf('audio').some((l) => l.id === 'audio-20'));
    const r = changeLayout(R, 'host', 'audio-20');
    assert.equal(r.ok, false);
  });
});

describe('Yetki ve kilit (domain katmanında)', () => {
  test('üye düzen değiştiremez; oda değişmez ve ret kaydı tutulur', () => {
    room();
    const r = changeLayout(R, 'u1', 'audio-11');
    assert.equal(r.ok, false);
    assert.equal(getStage(R)!.layoutId, null);
    assert.equal(getRoom(R)!.seats.length, 10);
    assert.equal(getStages().audit[0].ok, false);
  });
  test('yönetici, oda işlevleri yalnız sahibe aitse düzen değiştiremez; sahip değiştirebilir', () => {
    room({ manageFunctions: 'owner' });
    assert.equal(changeLayout(R, 'admin', 'audio-11').ok, false);
    assert.equal(changeLayout(R, 'host', 'audio-11').ok, true);
    setStageInfo(R, info({ manageFunctions: 'admins' }));
    assert.equal(changeLayout(R, 'admin', 'audio-15').ok, true);
  });
  test('seviyesi yetmeyen (kilitli) yerleşim, istemciden id gönderilse bile reddedilir', () => {
    room({ level: 7 });
    const r = changeLayout(R, 'host', 'audio-24');
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.reason : '', /Lv\.8/);
    assert.equal(getStage(R)!.layoutId, null);
    assert.equal(changeLayout(R, 'host', 'audio-20').ok, true, 'Lv.7 yerleşim açık');
  });
  test('kilit kartta da aynı kuraldan hesaplanır; gereken özellik yoksa yerleşim kapalı', () => {
    assert.equal(layoutAccess(layoutById('video-15')!, { level: 8, features: ALL_FEATURES }).ok, false);
    assert.equal(layoutAccess(layoutById('video-15')!, { level: 9, features: ALL_FEATURES }).ok, true);
    room({ features: ['youtube'] });
    const r = changeLayout(R, 'host', 'video-5');
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.reason : '', /Görüntülü/);
  });
  test('bilinmeyen yerleşim ve bağlantı yokken değişiklik reddedilir (başarılı gösterilmez)', () => {
    room();
    assert.equal(changeLayout(R, 'host', 'yok-boyle-bir-sey').ok, false);
    setConnection('offline');
    const r = changeLayout(R, 'host', 'audio-11');
    assert.equal(r.ok, false);
    assert.equal(getStage(R)!.layoutId, null);
    setConnection('online');
  });
});

describe('Mikrofon kuralları', () => {
  test('bir kullanıcı tek yuvada: başka yuvaya geçince eskisi boşalır', () => {
    room();
    assert.equal(takeSeat(R, 'u1', 3).ok, true);
    assert.equal(takeSeat(R, 'u1', 5).ok, true);
    assert.deepEqual(getRoom(R)!.seats.map((s, i) => (s === 'u1' ? i : -1)).filter((i) => i >= 0), [5]);
  });
  test('dolu yuvaya ikinci kişi oturamaz', () => {
    room();
    takeSeat(R, 'u1', 3);
    const r = takeSeat(R, 'u2', 3);
    assert.equal(r.ok, false);
    assert.equal(getRoom(R)!.seats[3], 'u1');
  });
  test('kapasite küçültülürken sınır dışında konuşmacı varsa işlem reddedilir, açıklama verilir, kimse taşınmaz', () => {
    room();
    takeSeat(R, 'u1', 7);
    const r = changeLayout(R, 'host', 'audio-6');
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.reason : '', /8\. mikrofonda/);
    assert.equal(getRoom(R)!.seats.length, 10);
    assert.equal(getRoom(R)!.seats[7], 'u1');
    assert.equal(checkCapacity(R, 6).ok, false);
  });
  test('sınır içinde herkes oturuyorsa küçültme başarılı; yerinden kimse oynamaz, sınır dışı kilitler düşer', () => {
    room();
    takeSeat(R, 'u1', 4);
    setLocks(R, [2, 8]);
    assert.equal(changeLayout(R, 'host', 'audio-6').ok, true);
    const r = getRoom(R)!;
    assert.deepEqual([r.seats.length, r.seats[0], r.seats[1], r.seats[4]], [6, 'host', 'admin', 'u1']);
    assert.deepEqual(r.locked, [2]);
    assert.equal(stageCapacity(R), 6);
  });
  test('büyütme her zaman serbest; klasik düzene dönüş aynı kurala tabi', () => {
    room();
    changeLayout(R, 'host', 'audio-30');
    takeSeat(R, 'u1', 25);
    assert.equal(changeLayout(R, 'host', null).ok, false);
    takeSeat(R, 'u1', 4);
    assert.equal(changeLayout(R, 'host', null).ok, true);
    assert.equal(getRoom(R)!.seats.length, 10);
  });
  test('klasik mikrofon sayısı da aynı kuralla ve oda sınırıyla değişir', () => {
    room({ classicMax: 10 });
    takeSeat(R, 'u1', 9);
    assert.equal(setClassicCapacity(R, 'host', 8).ok, false);
    assert.equal(setClassicCapacity(R, 'host', 12).ok, false, 'oda sınırının üstü');
    assert.equal(setClassicCapacity(R, 'u1', 10).ok, false, 'üye');
  });
  test('yuva durumları: boş, kilitli, davet bekliyor, mikrofon açık, kapalı, susturulmuş', () => {
    room({}, ['host', 'admin', 'u1']);
    setLocks(R, [5]);
    setMicMute(R, 'host', 'u1', true);
    const inv = inviteToMic(R, 'host', 'u2', 4);
    assert.equal(inv.ok, true);
    const st = slotStates(getRoom(R)!, (uid) => uid === 'admin').map((x) => x.state);
    assert.deepEqual(st.slice(0, 6), ['on', 'mic_off', 'mod_muted', 'empty', 'invited', 'locked']);
  });
});

describe('YouTube bağlantıları', () => {
  test('desteklenen biçimlerden güvenli 11 karakterli kimlik çıkar', () => {
    const ok = [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?feature=share&v=${ID}`,
      `http://m.youtube.com/watch?v=${ID}&list=PL123`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?si=abc`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `youtube.com/watch?v=${ID}`,
      `  https://WWW.YOUTUBE.COM/watch?v=${ID}  `,
    ];
    for (const u of ok) assert.deepEqual(parseYouTubeUrl(u), { ok: true, videoId: ID }, u);
  });
  test('başlangıç zamanı (t=) okunur', () => {
    assert.deepEqual(parseYouTubeUrl(`https://youtu.be/${ID}?t=90`), { ok: true, videoId: ID, startSeconds: 90 });
    assert.deepEqual(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&t=1m30s`), { ok: true, videoId: ID, startSeconds: 90 });
  });
  test('yabancı alan adı, benzer alan adı, javascript: ve diğer şemalar reddedilir', () => {
    const bad = [
      `https://vimeo.com/123456`,
      `https://www.youtube.com.evil.com/watch?v=${ID}`,
      `https://evil-youtube.com/watch?v=${ID}`,
      `https://youtu.be.example.org/${ID}`,
      `https://notyoutube.com/watch?v=${ID}`,
      `https://youtube.co/watch?v=${ID}`,
      `https://www.youtube.com@evil.com/watch?v=${ID}`,
      `https://evil.com@www.youtube.com/watch?v=${ID}`,
      `https://www.youtube.com:8080/watch?v=${ID}`,
      `javascript:alert(1)//youtube.com/watch?v=${ID}`,
      `JaVaScRiPt:alert(1)`,
      `data:text/html,<script>alert(1)</script>`,
      `file:///etc/passwd`,
      `ftp://youtube.com/watch?v=${ID}`,
      `//youtube.com/watch?v=${ID}`,
      `https://evil.com/?u=https://youtube.com/watch?v=${ID}`,
      `https://evil.com/redirect#https://youtu.be/${ID}`,
    ];
    for (const u of bad) assert.equal(parseYouTubeUrl(u).ok, false, u);
  });
  test('kimliği bozuk veya eksik bağlantılar reddedilir', () => {
    const bad = [
      '',
      'https://www.youtube.com/',
      'https://www.youtube.com/watch',
      'https://www.youtube.com/watch?v=short',
      `https://www.youtube.com/watch?v=${ID}x`,
      `https://www.youtube.com/watch?v=${ID.slice(0, 10)}"`,
      `https://youtu.be/${ID}/extra`,
      `https://www.youtube.com/channel/UC1234567890`,
      `https://www.youtube.com/watch?v=<script>alert</script>`,
      `https://youtu.be/%3Cscript%3E`,
      `https://www.youtube.com/watch?v=${ID} onerror=x`,
      ID,
    ];
    for (const u of bad) assert.equal(parseYouTubeUrl(u).ok, false, u);
  });
});

describe('Ortak izleme', () => {
  function cinema() {
    room();
    changeLayout(R, 'host', 'cinema-4');
  }
  test('ortak ekranı olmayan düzende video açılamaz', () => {
    room();
    assert.equal(setVideo(R, 'host', `https://youtu.be/${ID}`).ok, false);
  });
  test('yetkili açar ve oynatır; yetkisiz kontrol reddedilir ve durumu değiştirmez', () => {
    cinema();
    assert.equal(setVideo(R, 'u1', `https://youtu.be/${ID}`).ok, false, 'üye video açamaz');
    const r = setVideo(R, 'admin', `https://youtu.be/${ID}`);
    assert.equal(r.ok, true);
    const before = getStage(R)!.playback;
    assert.equal(pauseVideo(R, 'u1').ok, false);
    assert.equal(seekVideo(R, 'u1', 100).ok, false);
    assert.equal(stopVideo(R, 'u1').ok, false);
    assert.deepEqual(getStage(R)!.playback, before);
    assert.equal(before!.playbackStatus, 'playing');
    assert.equal(before!.updatedBy, 'admin');
  });
  test('yabancı bağlantı oynatıcıya ulaşmaz', () => {
    cinema();
    assert.equal(setVideo(R, 'host', 'https://evil.com/watch?v=dQw4w9WgXcQ').ok, false);
    assert.equal(getStage(R)!.playback, null);
  });
  test('yeniden bağlanınca konum = konum + (şimdi − güncellenme)', () => {
    cinema();
    setVideo(R, 'host', `https://youtu.be/${ID}?t=30`);
    mock.timers.tick(45_000);
    const p = getStage(R)!.playback!;
    assert.equal(expectedPosition(p), 75);
    // A viewer who was offline still shows second 30 when coming back: the player seeks to 75 and plays.
    const sync = playerSync(p, { position: 30, playing: false });
    assert.deepEqual(sync, { seek: 75, play: true, target: 75 });
    // Close enough: no seek (no stutter).
    assert.equal(playerSync(p, { position: 75 - SYNC_TOLERANCE_S + 0.5, playing: true }).seek, null);
    // A viewer who paused for themselves is left alone.
    assert.deepEqual(playerSync(p, { position: 30, playing: false }, Date.now(), true), { seek: null, play: false, target: 75 });
  });
  test('duraklatma konumu sabitler; ileri sarma ve süre sınırı', () => {
    cinema();
    setVideo(R, 'host', `https://youtu.be/${ID}`);
    reportPlayer(R, 'u1', { videoId: ID, duration: 200 });
    mock.timers.tick(20_000);
    pauseVideo(R, 'host');
    mock.timers.tick(60_000);
    assert.equal(expectedPosition(getStage(R)!.playback!), 20);
    seekVideo(R, 'host', 500);
    assert.equal(getStage(R)!.playback!.position, 200, 'süreyle sınırlı');
    seekVideo(R, 'host', 50);
    playVideo(R, 'host');
    mock.timers.tick(10_000);
    assert.equal(expectedPosition(getStage(R)!.playback!), 60);
  });
  test('videoya ait hata (silinmiş/özel/gömülemez) tüm odada gösterilir; cihaz hatası odayı etkilemez', () => {
    cinema();
    setVideo(R, 'host', `https://youtu.be/${ID}`);
    reportPlayer(R, 'u1', { videoId: ID, errorCode: 5 });
    assert.equal(getStage(R)!.playback!.playbackStatus, 'playing');
    reportPlayer(R, 'u1', { videoId: 'aaaaaaaaaaa', errorCode: 150 });
    assert.equal(getStage(R)!.playback!.playbackStatus, 'playing', 'eski videoya ait geç rapor yok sayılır');
    reportPlayer(R, 'u1', { videoId: ID, errorCode: 150 });
    assert.equal(getStage(R)!.playback!.playbackStatus, 'error');
    assert.equal(playVideo(R, 'host').ok, false);
  });
  test('ekransız düzene geçince video o anki konumda duraklar; geri dönünce kaldığı yerden', () => {
    cinema();
    setVideo(R, 'host', `https://youtu.be/${ID}`);
    mock.timers.tick(12_000);
    assert.equal(changeLayout(R, 'host', 'audio-11').ok, true);
    const p = getStage(R)!.playback!;
    assert.deepEqual([p.playbackStatus, p.position], ['paused', 12]);
    assert.equal(changeLayout(R, 'host', 'cinema-7').ok, true);
    assert.equal(getStage(R)!.playback!.videoId, ID);
  });
});
