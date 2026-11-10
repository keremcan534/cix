// The small touches' rules: numbers roll to exactly their new value, the greeting follows the hour, and only real
// changes of the mics' sizes are eased (not each pixel of a drag).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { easeOut, rollAt } from '@/lib/motion';
import { firstName, greetingFor, greetingLine } from '@/lib/greeting';
import { easedChange, type Fitted } from '@/lib/seat-fit';

describe('Yuvarlanan sayılar', () => {
  test('baştan başlar, tam yeni değerde biter, geri gitmez', () => {
    assert.equal(rollAt(100, 2600, 0), 100);
    assert.equal(rollAt(100, 2600, 1), 2600);
    assert.equal(rollAt(2600, 100, 1), 100, 'azalırken de');
    let last = 100;
    for (let t = 0; t <= 1; t += 0.05) {
      const n = rollAt(100, 2600, t);
      assert.ok(n >= last, `${t}: ${n} < ${last}`);
      last = n;
    }
    assert.ok(rollAt(0, 1000, 0.5) > 500, 'önce hızlı, sonra yavaş');
    assert.equal(easeOut(-1), 0);
    assert.equal(easeOut(2), 1);
  });
});

describe('Saate göre karşılama', () => {
  test('sabah, öğlen, akşam ve gece', () => {
    assert.equal(greetingFor(5), 'Günaydın');
    assert.equal(greetingFor(11), 'Günaydın');
    assert.equal(greetingFor(12), 'İyi günler');
    assert.equal(greetingFor(17), 'İyi günler');
    assert.equal(greetingFor(18), 'İyi akşamlar');
    assert.equal(greetingFor(2), 'İyi akşamlar', 'gece yarısından sonra da "İyi geceler" denmez');
  });
  test('adın ilk kelimesiyle; ad yoksa yalnızca karşılama', () => {
    assert.equal(firstName('  Ayşe Nur  Kaya '), 'Ayşe');
    assert.equal(greetingLine(9, 'Ayşe Nur'), 'Günaydın, Ayşe');
    assert.equal(greetingLine(20, '  '), 'İyi akşamlar');
    assert.equal(greetingLine(9, 'Sen'), 'Günaydın', 'demodaki "Sen" ad sayılmaz');
  });
});

describe('Mikrofon boyu değişince yumuşak geçiş', () => {
  const f = (face: number, cols = 4, height = 300): Fitted => ({ face, cols, height, host: face, slot: 80 });
  test('sütun ya da belirgin boy değişimi yumuşar, sürüklemenin piksel adımı yumuşamaz', () => {
    assert.ok(easedChange(f(48), f(48, 5)));
    assert.ok(easedChange(f(48), f(56)));
    assert.ok(easedChange(f(48, 4, 300), f(48, 4, 340)));
    assert.ok(!easedChange(f(48), f(49, 4, 304)));
  });
});
