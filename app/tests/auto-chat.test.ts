/// <reference types="node" />
// Otomatik mesaj in the app (lib/msg-reward, lib/live/auto-chat, lib/dm-thread): the line under a paid message (the
// diamonds, the time left, "kazanıldı" only once paid), the payer's line that never shows what the other one earns,
// the labels of automatic messages, and the server's answers read defensively: an older server or a malformed field
// draws nothing and never throws. The parsers are lib/auto-chat-core's (pure).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { countdown, extraOf, feeLine, rewardLine, sourceLabel } from '@/lib/msg-reward';
import { mergeThread, type ServerDm } from '@/lib/dm-thread';

const live = () => import('@/lib/auto-chat-core');

const NOW = Date.parse('2026-11-18T12:00:00.000Z');
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe('Elmas göstergesi (lib/msg-reward)', () => {
  test('bekleyen ödül: miktar ve kalan süre; süre bitince doğrulanıyor; kazanıldı yalnız ödenince', () => {
    const r = { diamonds: 240, state: 'waiting' as const, deadline: at(275_000) };
    assert.deepEqual(rewardLine(r, NOW), { title: '💎 +240 Elmas', sub: '04:35 kaldı · 5 dakika içinde yanıtla ve kazan.', tone: 'gold' });
    assert.equal(rewardLine(r, NOW + 280_000).sub, 'Ödül doğrulanıyor.', 'süre bitti ama sunucu henüz karar vermedi');
    assert.equal(rewardLine({ ...r, state: 'checking' }, NOW).sub, 'Ödül doğrulanıyor.');
    assert.equal(rewardLine({ ...r, state: 'won' }, NOW).title, '💎 +240 kazanıldı.');
    assert.equal(rewardLine({ ...r, state: 'expired' }, NOW).title, 'Ödül süresi doldu.');
    assert.equal(rewardLine({ ...r, diamonds: 12_500 }, NOW).title, '💎 +12.500 Elmas');
  });

  test('geri sayım dakika:saniye, sıfırın altına inmez', () => {
    assert.equal(countdown(300_000), '05:00');
    assert.equal(countdown(1), '00:01');
    assert.equal(countdown(-5_000), '00:00');
  });

  test('ödeyen yalnız kendi jetonunu görür', () => {
    assert.equal(feeLine({ coins: 240, state: 'held', returned: 0 }), '240 jeton · cevap bekleniyor (gelmezse iade edilir)');
    assert.equal(feeLine({ coins: 240, state: 'paid', returned: 0 }), '240 jeton ödendi');
    assert.equal(feeLine({ coins: 240, state: 'refunded', returned: 240 }), 'Cevap gelmedi · 240 jeton iade edildi');
    assert.equal(feeLine({ coins: 240, state: 'paid', returned: 0 }).includes('elmas'), false);
  });

  test('otomatik mesaj işaretli; kendi yazdığın düz mesajda etiket yok', () => {
    assert.equal(sourceLabel('auto_streamer', false), 'Otomatik mesaj');
    assert.equal(sourceLabel('auto_opener', true), 'Senin adına gönderilen ücretsiz sohbet başlangıcı');
    assert.equal(sourceLabel('auto_opener', false), 'Otomatik sohbet başlangıcı');
    assert.equal(sourceLabel('quick_reply', true), 'Hazır cevap');
    assert.equal(sourceLabel(undefined, true), null);
  });

  test('sunucu cevabı savunmalı okunur: eski sunucu, bozuk alan hiçbir şey çizmez', () => {
    assert.deepEqual(extraOf({ id: 1, text: 'Selam' }), {});
    assert.deepEqual(extraOf(null), {});
    assert.deepEqual(extraOf({ reward: { diamonds: '240', state: 'waiting', deadline: at(1) } }), {}, 'sayı olmayan elmas');
    assert.deepEqual(extraOf({ reward: { diamonds: 240, state: 'bilinmeyen', deadline: at(1) } }), {});
    assert.deepEqual(extraOf({ reward: { diamonds: 240, state: 'waiting', deadline: 'dün' } }), {});
    assert.deepEqual(extraOf({ fee: { coins: 240, state: 'held' }, source: 'auto_streamer' }), { fee: { coins: 240, state: 'held', returned: 0 }, source: 'auto_streamer' });
    assert.deepEqual(extraOf({ source: 'robot' }), {});
  });
});

describe('Sohbet eşitleme: kaynak', () => {
  test('otomatik mesajın kaynağı telefondaki kopyada kalır; eski sunucu göndermezse yok', () => {
    const dms: ServerDm[] = [
      { id: 1, from: 'p1', to: 'me', text: 'Merhaba 😊', createdAt: at(0), source: 'auto_streamer' },
      { id: 2, from: 'p1', to: 'me', text: 'Nasılsın?', createdAt: at(1000) },
      { id: 3, from: 'p1', to: 'me', text: 'x', createdAt: at(2000), source: 'bilinmeyen' },
    ];
    const r = mergeThread([], dms, { peer: 'p1', after: 0 });
    assert.deepEqual(r.messages.map((m) => m.source), ['auto_streamer', undefined, undefined]);
  });
});

describe('Otomatik mesaj sunucu cevapları (lib/live/auto-chat)', () => {
  test('haklarım: kadın yayıncının, erkeğin, eski sunucunun cevabı', async () => {
    const { autoMeOf, NO_AUTO } = await live();
    const star = autoMeOf({
      tools: true,
      auto: { total: 10, used: 3, left: 7, on: true, sending: true, done: null },
      quick: { total: 10, used: 10, left: 0, on: true, replies: [{ no: 1, text: 'Selam' }, { no: 'x', text: 'bozuk' }], done: 'Günlük 10 hazır cevap hakkını kullandın.' },
      opener: null,
      receive: true,
      reply: { minutes: 5 },
    });
    assert.equal(star.tools, true);
    assert.deepEqual([star.auto?.left, star.quick?.left, star.quick?.replies.length, star.replyMinutes], [7, 0, 1, 5]);
    assert.match(star.quick?.done ?? '', /hazır cevap hakkını kullandın/);
    const man = autoMeOf({ tools: false, auto: null, quick: null, opener: { total: 2, used: 0, left: 2, on: true, sending: true, seen: false }, receive: false });
    assert.deepEqual([man.tools, man.opener?.seen, man.opener?.sending, man.receive], [false, false, true, false]);
    assert.deepEqual(autoMeOf(undefined), NO_AUTO);
    assert.deepEqual(autoMeOf('çöp'), NO_AUTO);
  });

  test('şablonlar, performans ve ajans raporu bozuk alanlarda varsayılana düşer', async () => {
    const { templatesOf, performanceOf, agencyPerformanceOf, figuresOf, secondsText } = await live();
    const t = templatesOf({ templates: [{ no: 1, text: 'A', custom: true, defaultText: 'B' }, { no: 99, text: 'yok' }, 'çöp'], limits: { min: 5, max: 200 } });
    assert.deepEqual(t.templates.map((x) => [x.no, x.custom]), [[1, true]]);
    assert.deepEqual(templatesOf(null).limits, { min: 5, max: 200 });
    const p = performanceOf({ stats: { total: 4, inTime: 2, inTimeRate: 50, avgSeconds: 125 }, days: [{ day: '2026-11-18', total: 4 }, { day: 'dün' }] });
    assert.deepEqual([p.stats.total, p.stats.inTimeRate, p.days.length, p.replyMinutes], [4, 50, 1, 5]);
    assert.equal(figuresOf({}).inTimeRate, null, 'mesaj yokken oran yok, %0 değil');
    const a = agencyPerformanceOf({ streamers: [{ id: 's1', name: 'Ela', total: 3 }, { name: 'kimliksiz' }], totals: { total: 3 } });
    assert.deepEqual(a.streamers.map((x) => x.id), ['s1']);
    assert.deepEqual([secondsText(null), secondsText(45), secondsText(125), secondsText(3700)], ['—', '45 sn', '2 dk 05 sn', '1 sa 1 dk']);
  });

  test('açık sohbetin ödülleri: sunucunun saati ve her mesajın durumu', async () => {
    const { noteThread, serverNowMs } = await live();
    noteThread('peer-1', [{ id: 7, reward: { diamonds: 240, state: 'waiting', deadline: at(60_000) } }, { id: 8, text: 'düz' }], new Date(Date.now() + 5_000).toISOString());
    assert.ok(Math.abs(serverNowMs() - (Date.now() + 5_000)) < 1_000, 'telefonun saati değil sunucunun');
  });
});
