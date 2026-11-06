/// <reference types="node" />
// Profile field rules (lib/profile-rules), which the server must enforce the same way: display name, @username and
// bio rules, city length, Turkish dates (GG.AA.YYYY) and the 18+ gate. The date of "today" is fixed, so the age
// boundary (18 today vs one day short) is checked exactly and the tests don't change with the calendar.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { CONTACT_MESSAGE, onContactRefusal, type ContactRefusal } from '@/lib/contact-filter';
import { LIMITS, ageFrom, formatTrDate, hasProfanity, noteProfileRefusal, parseTrDate, validateProfile, type ProfileDraft } from '@/lib/profile-rules';

/** 2 Kasım 2026, local time (ageFrom reads local date parts). */
const TODAY = new Date(2026, 10, 2);
const OK: ProfileDraft = { name: 'Ayşe', username: 'ayse.yilmaz', bio: 'Müzik, kahve ve gece sohbetleri', city: 'İzmir', birth: '14.03.2002' };
const errs = (patch: Partial<ProfileDraft>, selfId?: string) => validateProfile({ ...OK, ...patch }, selfId, TODAY);

const USERNAME_SHAPE = '3–20 karakter; harfle başlamalı, yalnızca a-z, 0-9, nokta ve alt çizgi.';
// The same friendly text the server sends with code contact_blocked (lib/contact-filter).
const CONTACT = CONTACT_MESSAGE;

describe('Geçerli profil', () => {
  test('kurallara uyan taslakta hata yok; birden fazla hatalı alan birlikte döner', () => {
    assert.deepEqual(errs({}), {});
    assert.deepEqual(Object.keys(errs({ name: '', username: 'ab', bio: 'x'.repeat(151), city: 'y'.repeat(31), birth: 'dün' })).sort(), [
      'bio',
      'birth',
      'city',
      'name',
      'username',
    ]);
  });
});

describe('Görünen ad', () => {
  test('boş olamaz, en fazla 20 karakter (baştaki/sondaki boşluk sayılmaz)', () => {
    assert.equal(errs({ name: '' }).name, 'Görünen ad boş olamaz.');
    assert.equal(errs({ name: '   ' }).name, 'Görünen ad boş olamaz.');
    assert.equal(errs({ name: 'a'.repeat(LIMITS.name) }).name, undefined);
    assert.equal(errs({ name: `  ${'a'.repeat(LIMITS.name)}  ` }).name, undefined);
    assert.equal(errs({ name: 'a'.repeat(LIMITS.name + 1) }).name, 'En fazla 20 karakter.');
  });

  test('küfür kelime olarak yakalanır (büyük harf, Türkçe İ dahil); kelimenin içinde geçmesi sayılmaz', () => {
    assert.equal(errs({ name: 'Ayşe AMK' }).name, 'Bu ad topluluk kurallarına uymuyor.');
    assert.equal(errs({ name: 'PİÇ' }).name, 'Bu ad topluluk kurallarına uymuyor.');
    assert.equal(errs({ name: 'Kamkat' }).name, undefined);
    assert.equal(hasProfanity('selam, nasılsın'), false);
    assert.equal(hasProfanity('çok şerefsiz!'), true);
  });
});

describe('Kullanıcı adı', () => {
  test('3–20 karakter, harfle başlar, yalnız a-z 0-9 . _; büyük harf küçültülür', () => {
    for (const ok of ['abc', 'a'.repeat(20), 'Elif.Can', 'deniz_24', '  mert.k  ']) assert.equal(errs({ username: ok }).username, undefined, ok);
    for (const bad of ['ab', 'a'.repeat(21), '1abc', '_abc', '.abc', 'ayşe', 'ab-c', 'a b c', '']) assert.equal(errs({ username: bad }).username, USERNAME_SHAPE, bad);
  });

  test('nokta/alt çizgi art arda veya sonda olamaz', () => {
    for (const bad of ['ab..c', 'ab._c', 'ab__c', 'abc.', 'abc_']) assert.equal(errs({ username: bad }).username, 'Nokta/alt çizgi art arda veya sonda olamaz.', bad);
  });

  test('ayrılmış kelimeyi içeren ad alınamaz', () => {
    for (const bad of ['admin', 'superadmin', 'destek.ekibi', 'similarclub.tr', 'resmi_hesap', 'moderator2'])
      assert.equal(errs({ username: bad }).username, 'Bu kullanıcı adı ayrılmış; başka bir tane seç.', bad);
  });

  test('başkasının adı alınmış sayılır, kendi adım değil', () => {
    // u1 (Elif) is elif.10 in the demo users.
    assert.equal(errs({ username: 'elif.10' }).username, 'Bu kullanıcı adı alınmış.');
    assert.equal(errs({ username: 'ELIF.10' }).username, 'Bu kullanıcı adı alınmış.');
    assert.equal(errs({ username: 'elif.10' }, 'u1').username, undefined);
  });

  test('küfürlü kullanıcı adı reddedilir', () => {
    for (const bad of ['aq.123', 'amk_x']) assert.equal(errs({ username: bad }).username, 'Bu kullanıcı adı topluluk kurallarına uymuyor.', bad);
  });
});

describe('Biyografi ve şehir', () => {
  test('biyografi en fazla 150, şehir en fazla 30 karakter', () => {
    assert.equal(errs({ bio: '' }).bio, undefined);
    assert.equal(errs({ bio: 'x'.repeat(LIMITS.bio) }).bio, undefined);
    assert.equal(errs({ bio: 'x'.repeat(LIMITS.bio + 1) }).bio, 'En fazla 150 karakter.');
    assert.equal(errs({ city: 'y'.repeat(LIMITS.city) }).city, undefined);
    assert.equal(errs({ city: 'y'.repeat(LIMITS.city + 1) }).city, 'En fazla 30 karakter.');
  });

  test('uygunsuz ifade ve iletişim bilgisi paylaşılamaz', () => {
    assert.equal(errs({ bio: 'Bana yavşak deme' }).bio, 'Biyografide uygunsuz ifade var.');
    for (const bad of ['Ara: 0532 123 45 67', 'IBAN TR33 0006 1005 1978 6457 8413 26', "Instagram'dan ekleyin", 'https://ornek.com', 'www.ornek.com'])
      assert.equal(errs({ bio: bad }).bio, CONTACT, bad);
  });

  test('protokolsüz alan adına benzeyen yazım, sunucudaki filtre gibi, bağlantı sayılır', () => {
    // The server refuses 'dinlerim.Net' as a link too; the app says so before sending instead of after.
    assert.equal(errs({ bio: 'Müzik dinlerim.Net konuşurum' }).bio, CONTACT);
    assert.equal(errs({ bio: 'Müzik dinlerim. Net konuşurum' }).bio, undefined);
  });

  test('ad, kullanıcı adı ve şehirde de iletişim bilgisi paylaşılamaz', () => {
    assert.equal(errs({ name: '05321234567' }).name, CONTACT);
    assert.equal(errs({ name: 'Ayşe insta' }).name, CONTACT);
    assert.equal(errs({ city: 'İzmir wp 0532 123 45 67' }).city, CONTACT);
    assert.equal(errs({ username: 'ig_ayse' }).username, CONTACT, 'alt çizgi boşluk gibi okunur');
    assert.equal(errs({ username: 'snap.ayse' }).username, CONTACT);
    assert.deepEqual(errs({ name: 'Mehmet 34', username: 'mehmet_34', city: 'İstanbul' }), {}, 'gündelik sayı ve şehir geçer');
  });

  test('denetim sayılmaz; reddedilen kayıt bir kez, ilk alanında sayılır (sunucu gibi)', () => {
    const heard: ContactRefusal[] = [];
    const off = onContactRefusal((r) => heard.push(r));
    try {
      const draft = { ...OK, username: 'ig_ayse', bio: 'Ara: 0532 123 45 67' };
      const e = validateProfile(draft, 'me', TODAY);
      validateProfile(draft, 'me', TODAY);
      assert.equal(heard.length, 0, 'validateProfile yalnızca denetler');
      noteProfileRefusal(draft, e);
      assert.deepEqual(
        heard.map((r) => [r.category, r.place]),
        [['social', 'profile.username']],
      );
      noteProfileRefusal(OK, validateProfile(OK, 'me', TODAY));
      assert.equal(heard.length, 1, 'geçen kayıt sayılmaz');
    } finally {
      off();
    }
  });
});

describe('Türkçe tarih', () => {
  test('GG.AA.YYYY (ve / -) ISO tarihe çevrilir; gerçek olmayan tarih null', () => {
    assert.equal(parseTrDate('14.03.2002'), '2002-03-14');
    assert.equal(parseTrDate('1/3/2002'), '2002-03-01');
    assert.equal(parseTrDate(' 14-03-2002 '), '2002-03-14');
    assert.equal(parseTrDate('29.02.2024'), '2024-02-29', 'artık yıl');
    for (const bad of ['29.02.2023', '31.04.2002', '00.01.2002', '14.13.2002', '2002-03-14', '14.03.02', 'dün', '']) assert.equal(parseTrDate(bad), null, bad);
  });

  test('ISO tarih GG.AA.YYYY olarak yazılır; boşsa boş metin', () => {
    assert.equal(formatTrDate('2002-03-14'), '14.03.2002');
    assert.equal(formatTrDate(undefined), '');
    assert.equal(parseTrDate(formatTrDate('2008-11-02')), '2008-11-02');
  });

  test('biçimi yanlış ya da gerçek olmayan doğum tarihi', () => {
    for (const bad of ['2002-03-14', '31.02.2002', '']) assert.equal(errs({ birth: bad }).birth, 'Tarihi GG.AA.YYYY biçiminde yaz (ör. 14.03.2002).', bad);
  });
});

describe('18 yaş sınırı', () => {
  test('yaş doğum gününde artar', () => {
    assert.equal(ageFrom('2008-11-02', TODAY), 18);
    assert.equal(ageFrom('2008-11-03', TODAY), 17);
    assert.equal(ageFrom('2008-12-01', TODAY), 17);
    assert.equal(ageFrom('2008-10-31', TODAY), 18);
    // 29 February birthdays count from 1 March in other years.
    assert.equal(ageFrom('2008-02-29', new Date(2026, 1, 28)), 17);
    assert.equal(ageFrom('2008-02-29', new Date(2026, 2, 1)), 18);
  });

  test('bugün 18 olan geçer, bir gün eksik olan geçemez', () => {
    assert.equal(errs({ birth: '02.11.2008' }).birth, undefined);
    assert.equal(errs({ birth: '03.11.2008' }).birth, 'Similar Club 18 yaş ve üzeri içindir.');
    assert.equal(validateProfile({ ...OK, birth: '03.11.2008' }, 'me', new Date(2026, 10, 3)).birth, undefined, 'ertesi gün geçer');
  });

  test('100 yaşın üstü geçerli doğum tarihi sayılmaz', () => {
    assert.equal(errs({ birth: '03.11.1925' }).birth, undefined, 'tam 100');
    assert.equal(errs({ birth: '02.11.1925' }).birth, 'Geçerli bir doğum tarihi gir.', '101');
  });

  test('tarih verilmezse bugünün tarihi kullanılır (mevcut çağrılar)', () => {
    assert.equal(validateProfile(OK).birth, undefined);
    assert.equal(validateProfile({ ...OK, birth: '01.01.2100' }).birth, 'Similar Club 18 yaş ve üzeri içindir.');
  });
});
