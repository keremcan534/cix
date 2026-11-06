/// <reference types="node" />
// E-mail addresses on the sign-in and Ayarlar screens (lib/email-address): the server's checks, the Turkish
// reasons and the "did you mean" hint for the big providers.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { emailError, emailTypoHint, normalizeEmail } from '@/lib/email-address';

describe('E-posta: biçim', () => {
  test('boşluk ve büyük harf sunucudaki gibi düzelir', () => {
    assert.equal(normalizeEmail('  Ali.Veli@Gmail.COM '), 'ali.veli@gmail.com');
    assert.equal(normalizeEmail('ali+kulup@outlook.com.tr'), 'ali+kulup@outlook.com.tr');
    assert.equal(normalizeEmail("o'brien@example.co.uk"), "o'brien@example.co.uk");
  });

  test('Türkçe alan adı kabul edilir (sunucu ASCII biçimine çevirir)', () => {
    assert.equal(normalizeEmail('ali@şirket.com.tr'), 'ali@şirket.com.tr');
  });

  test('olamayacak adresler düşer', () => {
    for (const bad of ['', 'ali', 'ali@', '@gmail.com', 'ali@gmail', 'a@b@c.com', 'ali veli@gmail.com', 'ali@gmail..com', '.ali@gmail.com', 'ali.@gmail.com',
      'a..li@gmail.com', 'ali@-gmail.com', 'ali@gmail.123', 'şule@gmail.com', `${'a'.repeat(65)}@gmail.com`, `ali@${'a'.repeat(250)}.com`]) {
      assert.equal(normalizeEmail(bad), null, bad);
    }
  });
});

describe('E-posta: Türkçe uyarı', () => {
  test('geçerli adreste uyarı yok', () => {
    assert.equal(emailError('ali@gmail.com'), null);
    assert.equal(emailError(' ALI@GMAIL.COM '), null);
  });

  test('her hatanın kendi açıklaması var', () => {
    assert.equal(emailError('   '), 'E-posta adresini yaz.');
    assert.equal(emailError('ali gmail.com'), 'Adreste boşluk olmamalı.');
    assert.equal(emailError('aligmail.com'), 'Adreste @ işareti eksik.');
    assert.equal(emailError('ali@@gmail.com'), 'Adreste yalnızca bir @ olmalı.');
    assert.equal(emailError('@gmail.com'), '@ işaretinden önce adının olduğu kısım eksik.');
    assert.match(emailError('şule@gmail.com') ?? '', /Türkçe karakter/);
    assert.match(emailError('İlker@gmail.com') ?? '', /Türkçe karakter/);
    assert.match(emailError('ali@gmail') ?? '', /gmail\.com/);
    assert.match(emailError('ali@gmail..com') ?? '', /geçerli görünmüyor/);
  });
});

describe('E-posta: yazım ipucu', () => {
  test('büyük sağlayıcıların sık yazım hataları', () => {
    const cases: [string, string][] = [
      ['ali@gmial.com', 'ali@gmail.com'],
      ['ali@gmal.com', 'ali@gmail.com'],
      ['ali@gmaill.com', 'ali@gmail.com'],
      ['ali@gnail.com', 'ali@gmail.com'],
      ['ali@gmail.cmo', 'ali@gmail.com'],
      ['ali@gmail.con', 'ali@gmail.com'],
      ['ali@gmailcom', 'ali@gmail.com'],
      ['ali@gmail', 'ali@gmail.com'],
      ['ali@gmaıl.com', 'ali@gmail.com'],
      ['ali@gmail.com.tr', 'ali@gmail.com'],
      ['Ali@Hotmial.com', 'ali@hotmail.com'],
      ['ali@hotmal.com', 'ali@hotmail.com'],
      ['ali@hotmail.co', 'ali@hotmail.com'],
      ['ali@outlok.com', 'ali@outlook.com'],
      ['ali@yaho.com', 'ali@yahoo.com'],
      ['ali@icloud.co', 'ali@icloud.com'],
      ['ali@iclod.com', 'ali@icloud.com'],
      ['ali@yandx.com', 'ali@yandex.com'],
      ['ali@sirket.con', 'ali@sirket.com'],
    ];
    for (const [typed, want] of cases) assert.equal(emailTypoHint(typed), want, typed);
  });

  test('doğru ya da başka gerçek adreslerde ipucu yok', () => {
    for (const ok of ['ali@gmail.com', 'ali@hotmail.com.tr', 'ali@outlook.com.tr', 'ali@mail.com', 'ali@email.com', 'ali@ymail.com', 'ali@me.com', 'ali@gmx.com',
      'ali@yandex.com.tr', 'ali@yandex.ru', 'ali@hotmail.co.uk', 'ali@hotmail.fr', 'ali@yahoo.de', 'ali@itu.edu.tr', 'ali@sirket.co', 'ali@firma.com.tr']) {
      assert.equal(emailTypoHint(ok), null, ok);
    }
  });

  test('adres değilse ipucu da yok', () => {
    for (const bad of ['', 'ali', '@gmial.com', 'ali@', 'a@b@gmial.com', 'ali veli@gmial.com']) assert.equal(emailTypoHint(bad), null, bad);
  });

  test('ipucu sunucunun kabul edeceği bir adres verir', () => {
    for (const typed of ['ali@gmial.com', 'ali@gmailcom', 'ali@gmail', 'ali@hotmial.com']) {
      const hint = emailTypoHint(typed);
      assert.ok(hint && normalizeEmail(hint) === hint, typed);
    }
  });
});
