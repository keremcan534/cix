/// <reference types="node" />
// Private-message safety check (lib/safety): what the scanner flags (IBAN, phone, link, off-platform app, money/code
// requests), which warning wins when a message has several, Turkish text, and that ordinary messages — times, short
// numbers, prices, buying jeton in the shop — get no warning at all.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { incomingWarning, outgoingWarning, scanMessage, type Risk } from '@/lib/safety';

const IN = {
  money: 'Para, kod veya ucuz jeton isteyen mesajlar genellikle dolandırıcılıktır. Similar Club asla dışarıdan ödeme istemez.',
  iban: 'Bu mesajda IBAN var. Tanımadığın birine para gönderme.',
  away: 'Seni uygulama dışına çekmeye çalışıyor olabilir. Dışarıda yaşananlarda seni koruyamayız.',
  link: 'Bağlantıya tıklamadan önce emin ol; şifre veya kod isteyen sayfalara bilgi girme.',
};
const OUT = {
  iban: 'Mesajında IBAN var. Banka bilgilerini yalnızca güvendiğin kişilerle paylaş.',
  phone: 'Mesajında telefon numarası var. Numaranı paylaşınca karşı taraf seni uygulama dışında da arayabilir.',
};

const flags = (text: string, risks: Risk[]) => assert.deepEqual(scanMessage(text), risks, text);

describe('Tarayıcı (scanMessage)', () => {
  test('IBAN: boşluklu, bitişik, küçük harf', () => {
    for (const t of ['IBAN: TR33 0006 1005 1978 6457 8413 26', 'TR330006100519786457841326', 'tr 33 0006 1005 1978 6457 8413 26']) flags(t, ['iban']);
  });

  test('telefon: 0 / +90 önekli, öneksiz, boşluk-nokta-tire ayraçlı', () => {
    for (const t of ['Numaram 0532 123 45 67', '+90 532 123 45 67', '+905321234567', '05321234567', '5321234567', '0532-123-45-67', '532.123.45.67'])
      flags(t, ['phone']);
  });

  test('bağlantı: protokollü, www ile ya da çıplak alan adı', () => {
    for (const t of ['https://bit.ly/abc', 'www.ornek.com.tr', 'şuraya bak: ornek.xyz', 'site.org adresinde']) flags(t, ['link']);
  });

  test('uygulama dışı: WhatsApp, Telegram, Instagram ekli halleri, Snapchat, Discord', () => {
    for (const t of ["wp'den yaz", 'WhatsApp’tan yazarsın', 'Telegram grubuma gel', "insta'dan ekle", 'instagramdan bak', 'snapchat var mı', 'discord sunucusu'])
      flags(t, ['offplatform']);
  });

  test('telefon klavyesinin kesme işareti (’) de aynı sayılır', () => {
    for (const t of ['wp’den yaz', 'tg’den ulaş', 'insta’dan ekle']) flags(t, ['offplatform']);
  });

  test('para / kod isteği', () => {
    for (const t of [
      'Para gönder hemen',
      'havale yapar mısın',
      'EFT ile at',
      'papara hesabım var',
      'doğrulama kodunu söyler misin',
      'sana gelen SMS kodu',
      'ucuz jeton lazım mı',
      'jeton satıyorum',
      'hediye çeki kazandın',
      'yatırım fırsatı kaçmaz',
      'kripto ile kazan',
    ])
      flags(t, ['money']);
  });

  test('Türkçe büyük harf: İ ve I de yakalanır', () => {
    flags("İnstagram'dan yaz", ['offplatform']);
    flags('KRİPTO KAZANCI', ['money']);
    flags('YATIRIM FIRSATI', ['money']);
    flags('DOĞRULAMA KODU', ['money']);
    flags('PARA GÖNDER', ['money']);
  });

  test('birden fazla risk birlikte döner', () => {
    flags('Papara olmazsa IBAN TR33 0006 1005 1978 6457 8413 26, olmadı 0532 123 45 67 whatsapp, www.ornek.com', ['iban', 'phone', 'link', 'offplatform', 'money']);
  });

  test('sıradan mesajlar: saat, kısa sayı, fiyat, tarih, skor, jeton satın almak', () => {
    for (const t of [
      'Merhaba, nasılsın?',
      'Saat 12:30’da buluşalım',
      'Saat 12.30 olur mu',
      'Bu akşam 21:45’te odadayım',
      '5 dk sonra geliyorum',
      'Seviye 25 oldum, 500 jeton kazandım',
      'Bu çanta 1.250 TL',
      'Fiyatı ₺549,99',
      '14.03.2002 doğumluyum',
      'Maç 2-1 bitti',
      'Mağazadan jeton satın aldım',
      'JETON SATIN ALDIM',
      'jeton satin aldim',
      'Telefonum bozuldu',
      'parasız kaldım',
      'instant kahve içiyorum',
      'snapshot aldım',
    ])
      flags(t, []);
  });
});

describe('Gelen mesaj uyarısı (incomingWarning)', () => {
  test('her risk kendi uyarısını verir; risk yoksa uyarı yok', () => {
    assert.equal(incomingWarning(['money']), IN.money);
    assert.equal(incomingWarning(['iban']), IN.iban);
    assert.equal(incomingWarning(['phone']), IN.away);
    assert.equal(incomingWarning(['offplatform']), IN.away);
    assert.equal(incomingWarning(['link']), IN.link);
    assert.equal(incomingWarning([]), null);
  });

  test('öncelik: para > IBAN > uygulama dışı / telefon > bağlantı', () => {
    assert.equal(incomingWarning(['iban', 'phone', 'link', 'offplatform', 'money']), IN.money);
    assert.equal(incomingWarning(['link', 'offplatform', 'phone', 'iban']), IN.iban);
    assert.equal(incomingWarning(['link', 'phone']), IN.away);
    assert.equal(incomingWarning(['link', 'offplatform']), IN.away);
  });

  test('gerçek mesajlarda uçtan uca', () => {
    assert.equal(incomingWarning(scanMessage('IBAN’ım TR33 0006 1005 1978 6457 8413 26, havale yap')), IN.money);
    assert.equal(incomingWarning(scanMessage('IBAN’ım TR33 0006 1005 1978 6457 8413 26')), IN.iban);
    assert.equal(incomingWarning(scanMessage('Buradan değil, wp’den yaz: 0532 123 45 67 · ornek.com')), IN.away);
    assert.equal(incomingWarning(scanMessage('Şu videoya bak https://ornek.com/v/1')), IN.link);
    assert.equal(incomingWarning(scanMessage('Saat 12:30’da odada görüşürüz')), null);
  });
});

describe('Giden mesaj onayı (outgoingWarning)', () => {
  test('yalnız kendi IBAN’ım ve telefonum sorulur; IBAN önce gelir', () => {
    assert.equal(outgoingWarning(['iban']), OUT.iban);
    assert.equal(outgoingWarning(['phone']), OUT.phone);
    assert.equal(outgoingWarning(['phone', 'iban']), OUT.iban);
    for (const r of ['link', 'offplatform', 'money'] as const) assert.equal(outgoingWarning([r]), null, r);
    assert.equal(outgoingWarning([]), null);
  });

  test('gerçek mesajlarda uçtan uca', () => {
    assert.equal(outgoingWarning(scanMessage('Numaram 0532 123 45 67, IBAN TR33 0006 1005 1978 6457 8413 26')), OUT.iban);
    assert.equal(outgoingWarning(scanMessage('Numaram 0532 123 45 67')), OUT.phone);
    assert.equal(outgoingWarning(scanMessage('Instagram’dan ekle beni')), null);
    assert.equal(outgoingWarning(scanMessage('Saat 12:30, 5 dk geç kalırım')), null);
  });
});
