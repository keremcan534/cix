/// <reference types="node" />
// Codes for e-mail sign-in and for checking an address or a number (lib/verify-code): the resend wait, the
// countdown, phone numbers on screen and what the server's answers mean, in Turkish.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { codeFailure, codeFailureText, deviceAccountText, formatCountdown, formatPhone, groupTrDigits, resendLabel, retrySeconds, reusableCode, trMobile, waitFromMessage, whatsappResultText } from '@/lib/verify-code';

describe('Kod: tekrar gönderme süresi', () => {
  test('sunucunun süresi alınır, 1–600 saniyeye sığdırılır', () => {
    assert.equal(retrySeconds(60), 60);
    assert.equal(retrySeconds(42.2), 43);
    assert.equal(retrySeconds('30'), 30);
    assert.equal(retrySeconds(5000), 600);
    assert.equal(retrySeconds(0.2), 1);
  });

  test('süre gelmezse ya da bozuksa varsayılan kullanılır', () => {
    for (const bad of [undefined, null, '', 'abc', 0, -5, NaN, Infinity, {}]) assert.equal(retrySeconds(bad), 60, String(bad));
    assert.equal(retrySeconds(undefined, 30), 30);
  });

  test('sayaç metni', () => {
    assert.equal(formatCountdown(45), '45 sn');
    assert.equal(formatCountdown(59.2), '60 sn');
    assert.equal(formatCountdown(75), '75 sn');
    assert.equal(formatCountdown(90), '90 sn');
    assert.equal(formatCountdown(125), '2:05');
    assert.equal(formatCountdown(600), '10:00');
    assert.equal(formatCountdown(0), '0 sn');
    assert.equal(formatCountdown(-3), '0 sn');
  });

  test('sunucunun 60 saniyesi baştan sona aynı biçimde sayılır', () => {
    for (let s = 60; s >= 0; s--) assert.match(formatCountdown(s), /^\d+ sn$/, String(s));
  });

  test('kod ekranı ve Ayarlar aynı sözcüklerle sayar', () => {
    assert.equal(resendLabel(60), 'Kodu tekrar gönder (60 sn)');
    assert.equal(resendLabel(7), 'Kodu tekrar gönder (7 sn)');
  });

  test('bekleme bitmeden aynı adrese tekrar gönderme, gönderilmiş kodu kullanır', () => {
    const now = 1_000_000;
    const last = { target: 'ali@gmail.com', challenge: 'c1', resendAt: now + 42_500 };
    assert.deepEqual(reusableCode(last, 'ali@gmail.com', now), { challenge: 'c1', retryAfter: 43 });
    // Another address, the wait over, or nothing sent yet: a new code.
    assert.equal(reusableCode(last, 'veli@gmail.com', now), null);
    assert.equal(reusableCode(last, 'ali@gmail.com', now + 42_500), null);
    assert.equal(reusableCode(null, 'ali@gmail.com', now), null);
  });

  test('"N saniye bekle" yanıtından süre okunur', () => {
    assert.equal(waitFromMessage('Yeni kod için 42 saniye bekle'), 42);
    assert.equal(waitFromMessage('Kod yanlış'), null);
    assert.equal(waitFromMessage('Bu adrese çok fazla kod gönderildi, bir saat sonra tekrar dene'), null);
  });
});

describe('Kod: telefon numarası', () => {
  test('+90 sonrası yazılan cep numarası sunucu biçimine döner', () => {
    assert.equal(trMobile('5321234567'), '+905321234567');
    assert.equal(trMobile('532 123 45 67'), '+905321234567');
    assert.equal(trMobile('05321234567'), '+905321234567');
    for (const bad of ['', '532123456', '4321234567', '53212345678', '2121234567']) assert.equal(trMobile(bad), null, bad);
  });

  test('yazarken gruplanır', () => {
    assert.equal(groupTrDigits(''), '');
    assert.equal(groupTrDigits('53'), '53');
    assert.equal(groupTrDigits('5321'), '532 1');
    assert.equal(groupTrDigits('5321234567'), '532 123 45 67');
  });

  test('ekranda okunur biçim', () => {
    assert.equal(formatPhone('+905321234567'), '+90 532 123 45 67');
    assert.equal(formatPhone('+447700900123'), '+447700900123');
  });
});

describe('Kod: sunucu yanıtının anlamı', () => {
  test('yanlış, süresi dolmuş, çok deneme ve kilit ayrılır', () => {
    assert.equal(codeFailure(400, undefined, 'Kod yanlış'), 'wrong');
    assert.equal(codeFailure(400, undefined, 'Kodun süresi doldu, yeni kod iste'), 'expired');
    assert.equal(codeFailure(429, undefined, 'Çok fazla yanlış deneme, yeni kod iste'), 'tries');
    assert.equal(codeFailure(429, undefined, 'Çok fazla yanlış kod denendi, yarın tekrar dene'), 'locked');
    assert.equal(codeFailure(429, undefined, 'Çok fazla yanlış deneme, bir saat sonra tekrar dene'), 'locked');
  });

  test('başka hesaba yönlendiren yanıtlar', () => {
    assert.equal(codeFailure(409, 'device_has_account', 'Bu telefonda zaten bir hesap var.'), 'device_has_account');
    assert.equal(codeFailure(409, 'use_google', 'Bu adres bir Google hesabına bağlı.'), 'use_other');
    assert.equal(codeFailure(409, 'use_email', 'E-posta koduyla giriş yap.'), 'use_other');
    assert.equal(codeFailure(409, undefined, 'Bu e-posta başka bir hesaba bağlı'), 'other');
    assert.equal(codeFailure(0, undefined, 'Sunucuya ulaşılamadı.'), 'other');
  });

  test('telefonda zaten hesap var: o hesabın giriş yolu söylenir', () => {
    const server = 'Bu telefonda zaten bir hesap var. O hesapla giriş yap.';
    assert.equal(deviceAccountText(server, 'email'), `${server}\n\nBu telefondaki hesap e-posta ile giriş yapıyor.`);
    assert.match(deviceAccountText(server, 'google'), /Google ile giriş yapıyor\.$/);
    assert.match(deviceAccountText(server, 'phone'), /telefon numarasıyla giriş yapıyor\.$/);
    // An older server sends no method, or one this build doesn't know: only the server's words.
    for (const m of [undefined, null, '', 'device', 'toString', 7]) assert.equal(deviceAccountText(server, m), server, String(m));
  });

  test('kutuların altındaki Türkçe satır', () => {
    assert.equal(codeFailureText('wrong', 'Kod yanlış'), 'Kod yanlış. Tekrar dene.');
    assert.equal(codeFailureText('expired', 'Kodun süresi doldu, yeni kod iste'), 'Kodun süresi doldu. Yeni kod iste.');
    assert.equal(codeFailureText('locked', 'Çok fazla yanlış kod denendi, yarın tekrar dene'), 'Çok fazla yanlış kod denendi, yarın tekrar dene');
  });
});

describe('WhatsApp doğrulaması: sonuç metni', () => {
  test('her sonucun Türkçe başlığı ve açıklaması var', () => {
    for (const r of ['verified', 'taken', 'country', 'no_number', 'expired']) {
      const t = whatsappResultText(r);
      assert.ok(t && t.title.length > 3 && t.body.length > 10, r);
      assert.equal(t?.ok, r === 'verified', r);
    }
    assert.match(whatsappResultText('taken')?.title ?? '', /başka bir hesaba/);
    // The body says what to do next instead of repeating the title.
    assert.doesNotMatch(whatsappResultText('taken')?.body ?? '', /başka bir hesap/);
  });

  test('beklerken ya da bilinmeyen sonuçta metin yok', () => {
    for (const r of [null, undefined, '', 'pending', 'toString', 42]) assert.equal(whatsappResultText(r), null, String(r));
  });
});
