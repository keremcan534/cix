/// <reference types="node" />
// The server's remote config (lib/remote-config) and what may leave the phone in a crash report
// (lib/report-scrub): pure logic, read without React or the Sentry SDK.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { EMPTY_CONFIG, compareVersions, featureLabel, FEATURES, needsUpdate, offMessage, parseConfig, parseVersion, routeGate } from '@/lib/remote-config';
import { scrubBreadcrumb, scrubText, scrubUrl } from '@/lib/report-scrub';

describe('Uzaktan ayar: sürüm karşılaştırma', () => {
  test('sürüm okunur, eksik kısımlar 0 sayılır, ek kısım yok sayılır', () => {
    assert.deepEqual(parseVersion('1.2.3'), [1, 2, 3]);
    assert.deepEqual(parseVersion('2'), [2, 0, 0]);
    assert.deepEqual(parseVersion('v1.4'), [1, 4, 0]);
    assert.deepEqual(parseVersion('1.0.0-beta.2'), [1, 0, 0]);
    assert.deepEqual(parseVersion('1.0.0+7'), [1, 0, 0]);
    for (const bad of ['', 'abc', '1..2', '1.2.3.4', '-1']) assert.equal(parseVersion(bad), null, bad);
  });

  test('sayılar metin gibi değil, sayı gibi karşılaştırılır', () => {
    assert.ok(compareVersions('1.10.0', '1.9.9') > 0);
    assert.ok(compareVersions('1.0.9', '1.0.10') < 0);
    assert.equal(compareVersions('1.2', '1.2.0'), 0);
    assert.ok(compareVersions('2.0.0', '1.99.99') > 0);
  });

  test('güncelleme yalnızca uygulama en düşük sürümün altındaysa istenir', () => {
    const c = { ...EMPTY_CONFIG, minVersion: '1.2.0' };
    assert.equal(needsUpdate('1.1.9', c), true);
    assert.equal(needsUpdate('1.2.0', c), false);
    assert.equal(needsUpdate('1.3.0', c), false);
    assert.equal(needsUpdate('1.0.0', EMPTY_CONFIG), false);
    // A version this phone can't read never locks the app.
    assert.equal(needsUpdate('bilinmiyor', c), false);
  });
});

describe('Uzaktan ayar: sunucu yanıtı', () => {
  test('bozuk yanıt boş ayara döner, hata atmaz', () => {
    for (const raw of [null, undefined, 'x', 42, [], true]) assert.deepEqual(parseConfig(raw), EMPTY_CONFIG);
  });

  test('geçerli alanlar alınır, bilinmeyen özellikler ve tekrarlar düşer', () => {
    const c = parseConfig({
      minVersion: ' 1.2.0 ',
      updateUrl: 'https://example.com/indir',
      notice: '  Bu gece 02:00 bakım var  ',
      featuresOff: ['gifts', 'gifts', 'uçak', 42, 'dm'],
    });
    assert.deepEqual(c, { minVersion: '1.2.0', updateUrl: 'https://example.com/indir', notice: 'Bu gece 02:00 bakım var', featuresOff: ['gifts', 'dm'] });
  });

  test('geçersiz sürüm, https olmayan adres ve boş duyuru yok sayılır', () => {
    const c = parseConfig({ minVersion: 'yeni', updateUrl: 'http://example.com', notice: '   ', featuresOff: 'gifts' });
    assert.deepEqual(c, EMPTY_CONFIG);
    assert.equal(parseConfig({ updateUrl: 'javascript:alert(1)' }).updateUrl, null);
    assert.equal(parseConfig({ notice: 'x'.repeat(400) }).notice?.length, 300);
  });

  test('her özelliğin Türkçe adı ve sakin bir açıklaması var', () => {
    for (const f of FEATURES) {
      assert.ok(featureLabel(f).length > 2, f);
      assert.match(offMessage(f), /geçici olarak kapalı/);
      assert.match(offMessage(f), /güvende/);
    }
  });
});

describe('Uzaktan ayar: kapalı özelliğin ekranları', () => {
  const off = (...featuresOff: (typeof FEATURES)[number][]) => ({ ...EMPTY_CONFIG, featuresOff });

  test('açık özellikte ekran olduğu gibi kalır', () => {
    assert.equal(routeGate(EMPTY_CONFIG, 'oda/[id]'), null);
    assert.equal(routeGate(off('gifts'), 'oda/[id]'), null);
    assert.equal(routeGate(off('rooms'), '(tabs)'), null);
  });

  test('odalar, oyunlar ve Jeton Noktası kapanınca ekran yerine bildirim gelir', () => {
    assert.deepEqual(routeGate(off('rooms'), 'oda/[id]'), { feature: 'rooms', mode: 'block' });
    assert.deepEqual(routeGate(off('games'), 'oyunlar'), { feature: 'games', mode: 'block' });
    assert.deepEqual(routeGate(off('jeton'), 'coins-bank'), { feature: 'jeton', mode: 'block' });
  });

  test('mesajlar, cüzdan ve gelir ekranı açık kalır, üstünde bildirim çıkar', () => {
    assert.deepEqual(routeGate(off('dm'), 'sohbet/[id]'), { feature: 'dm', mode: 'banner' });
    assert.deepEqual(routeGate(off('purchases'), 'cuzdan'), { feature: 'purchases', mode: 'banner' });
    assert.deepEqual(routeGate(off('topup', 'purchases'), 'cuzdan'), { feature: 'topup', mode: 'banner' });
    assert.deepEqual(routeGate(off('exchange'), 'gelir/index'), { feature: 'exchange', mode: 'banner' });
    assert.deepEqual(routeGate(off('withdraw'), 'yayinci/cek'), { feature: 'withdraw', mode: 'banner' });
    assert.equal(routeGate(off('withdraw'), 'gelir/index'), null, 'Gelir ekranı para çekme kapalıyken de açık');
  });
});

describe('Hata raporu: telefondan çıkmayanlar', () => {
  test('telefon numarası maskelenir, kısa sayılar kalır', () => {
    assert.equal(scrubText('Arayan +90 532 123 45 67 bağlanamadı'), 'Arayan [numara] bağlanamadı');
    assert.equal(scrubText('05321234567 kayıtlı değil'), '[numara] kayıtlı değil');
    assert.equal(scrubText('oda 1234, 500 jeton'), 'oda 1234, 500 jeton');
  });

  test('adresin sorgu kısmı (oda şifresi gibi) gönderilmez', () => {
    assert.equal(scrubUrl('https://api.example.com/api/rooms/r1/token?password=gizli#x'), 'https://api.example.com/api/rooms/r1/token');
    assert.equal(scrubUrl('/sohbet/u2'), '/sohbet/u2');
  });

  test('konsol kırıntıları uyarı altındaysa düşer, gövde ve argümanlar silinir', () => {
    assert.equal(scrubBreadcrumb({ category: 'console', level: 'log', message: 'mesaj: merhaba' }), null);
    assert.equal(scrubBreadcrumb({ category: 'console', level: 'info', message: 'x' }), null);
    const warn = scrubBreadcrumb({ category: 'console', level: 'warning', message: 'numara 05321234567', data: { arguments: ['gizli'] } })!;
    assert.equal(warn.message, 'numara [numara]');
    assert.deepEqual(warn.data, {});
    const net = scrubBreadcrumb({ category: 'fetch', data: { url: 'https://x.io/api/messages?to=u2', method: 'POST', status_code: 503, body: '{"text":"selam"}' } })!;
    assert.deepEqual(net.data, { url: 'https://x.io/api/messages', method: 'POST', status_code: 503 });
  });
});
