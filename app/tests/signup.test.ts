/// <reference types="node" />
// Sign-up rules (lib/signup): the birth-year messages (giris-11), the 18+ gate counted from 31 December, Devam
// naming the first missing field (giris-12), the welcome text without test coins outside a demo build (mantik-15)
// and the step counter numbering only the screens really shown (gorsel-22 f, giris-14). "Today" is fixed.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { MIN_AGE, ageFromYear, birthDateOf, birthYearError, firstSignupProblem, nameLength, signupScreens, signupStep, welcomeText } from '@/lib/signup';

/** 6 Kasım 2026 and the year's last day, local time (ageFrom reads local date parts). */
const TODAY = new Date(2026, 10, 6);
const NEW_YEARS_EVE = new Date(2026, 11, 31);
const UNDER = `Uygulamayı kullanmak için en az ${MIN_AGE} yaşında olmalısın.`;

describe('Doğum yılı', () => {
  test('gelecek yıl ve olanaksız yıl kendi sözüyle söylenir, 18 yaş sözüyle karışmaz', () => {
    assert.equal(birthYearError('2030', TODAY), 'Doğum yılı gelecekte olamaz.');
    assert.equal(birthYearError('2027', TODAY), 'Doğum yılı gelecekte olamaz.');
    assert.equal(birthYearError('1900', TODAY), 'Geçerli bir doğum yılı yaz.');
    assert.equal(birthYearError('0000', TODAY), 'Geçerli bir doğum yılı yaz.');
  });

  test('yaş yılın son gününden sayılır: bu yıl 18 olan 31 Aralık’a kadar bekler, sebebi söylenir', () => {
    assert.equal(birthDateOf(2008), '2008-12-31');
    assert.equal(ageFromYear(2008, TODAY), 17);
    assert.match(birthYearError('2008', TODAY) ?? '', /Bu yıl 18 yaşına giriyorsun.*31 Aralık/);
    assert.equal(birthYearError('2008', NEW_YEARS_EVE), null);
    assert.equal(ageFromYear(2008, NEW_YEARS_EVE), 18);
  });

  test('daha küçük yaş 18 sınırını söyler; 18 ve üstü geçer', () => {
    assert.equal(birthYearError('2009', TODAY), UNDER);
    assert.equal(birthYearError('2015', TODAY), UNDER);
    assert.equal(birthYearError('2007', TODAY), null);
    assert.equal(birthYearError('1990', TODAY), null);
    assert.equal(birthYearError('1927', TODAY), null);
  });

  test('4 haneden kısa yazılırken henüz yargılanmaz', () => {
    assert.equal(birthYearError('', TODAY), null);
    assert.equal(birthYearError('20', TODAY), null);
    assert.equal(birthYearError('201', TODAY), null);
  });
});

describe('Devam ilk eksiği söyler', () => {
  const ok = { name: 'Elif', gender: 'Kadın', year: '1998' };
  test('ekrandaki sırayla: ad, cinsiyet, yıl', () => {
    assert.equal(firstSignupProblem({ name: '  ', gender: null, year: '' }, TODAY), 'Adını yaz.');
    assert.equal(firstSignupProblem({ ...ok, name: 'E' }, TODAY), 'Adın en az 2 karakter olmalı.');
    assert.equal(firstSignupProblem({ ...ok, gender: null, year: '' }, TODAY), 'Cinsiyet seç.');
    assert.equal(firstSignupProblem({ ...ok, year: '98' }, TODAY), 'Doğum yılını 4 haneli yaz.');
    assert.equal(firstSignupProblem({ ...ok, year: '2010' }, TODAY), UNDER);
    assert.equal(firstSignupProblem(ok, TODAY), null);
  });

  test('ad uzunluğu görünen harfle sayılır (emoji tek harf)', () => {
    assert.equal(nameLength(' Ali '), 3);
    assert.equal(nameLength('😀'), 1);
    assert.equal(firstSignupProblem({ ...ok, name: '😀' }, TODAY), 'Adın en az 2 karakter olmalı.');
  });
});

describe('Hoş geldin sözü', () => {
  test('test jetonundan yalnızca demo derlemede söz edilir; demo prototip kendi 100 jetonunu söyler', () => {
    assert.equal(welcomeText(true, false), 'Hesabın açıldı.');
    assert.match(welcomeText(true, true), /test jetonu/);
    assert.match(welcomeText(false, true), /100 jeton/);
    assert.doesNotMatch(welcomeText(true, false), /jeton/);
  });
});

describe('Kayıt adım sayacı', () => {
  test('canlı derlemede tek adım (profil): sayılacak bir şey yok, toplam 1', () => {
    assert.deepEqual(signupScreens(true), ['profil']);
    assert.deepEqual(signupStep('profil', true), { step: 1, total: 1 });
  });

  test('demo dört ekranı sırayla sayar', () => {
    assert.deepEqual(signupStep('telefon', false), { step: 1, total: 4 });
    assert.deepEqual(signupStep('kod', false), { step: 2, total: 4 });
    assert.deepEqual(signupStep('profil', false), { step: 3, total: 4 });
    assert.deepEqual(signupStep('dogrulama', false), { step: 4, total: 4 });
  });
});
