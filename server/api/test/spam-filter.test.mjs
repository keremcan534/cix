// The Anlar spam filter (spam-filter.mjs): swearing, sexual text and ads are refused however they are typed, and
// everyday Turkish that starts like one of those words stays fine.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkSpam } from '../spam-filter.mjs';

const REFUSED = {
  swear: ['amk ya', 's1kt1r git', 'a.m.k', 'SİKTİR', 'orospu çocuğu', 'yarraaak', 'piç', 'oç', 'amına', 'fuck you', 's i k t i r'],
  sexual: ['porno izle', 'seks yapalım', 'p0rn0', '18+ içerik', 'görüntülü show', 'onlyfans', 'azgın kızlar'],
  ad: ['takipçi satılır', 'ucuz jeton burada', 'evden para kazan', 'şu uygulamayı indirin', 'başka uygulamaya geçin', 'deneme bonusu veren siteler', 'profilimdeki linke bak', 'referans kodum 123', 'bahis siteleri', 'uygulamaya gelin'],
};
const FINE = [
  'Bugün çok sıkıcı bir gündü', 'sıkıntı yok', 'sıkıştım trafikte', 'SIKILDIM', 'seksen yaşında dedem', 'analiz yaptım', 'Ankara güzel',
  'harika!', 'mal sahibi', '2024 yazı', '18 yaşındayım', 'çok güzel 😍', 'uygulamaya yeni geldim', 'bu oyunu kurduk', 'para kazandım çarktan',
  'amcam geldi', 'aqua park', 'sikke koleksiyonum', 'yaramaz kedi', 'yaram iyileşti', 'oral sınav', 'başka bir uygulama var mı',
  'talk show var', 'gotik tarz', 'serefe', 'seviyorum seni', 'servis', 'sevimli', 'kedi pustu', '',
];

test('Anlar filtresi: küfür, cinsel içerik ve reklam reddedilir', () => {
  for (const [category, list] of Object.entries(REFUSED)) for (const t of list) assert.deepEqual(checkSpam(t), { ok: false, category }, t);
});

test('Anlar filtresi: benzeyen günlük kelimeler geçer', () => {
  for (const t of FINE) assert.deepEqual(checkSpam(t), { ok: true }, t);
});
