// The profile's wide photo card (lib/cover-focus): the face of a square portrait sits in the card's middle, and the
// picture always covers the card.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { FACE_AT, coverTop } from '@/lib/cover-focus';

describe('Profil fotoğraf kartı', () => {
  test('yüz kartın ortasına gelir', () => {
    const [w, h] = [250, 108];
    const top = coverTop(w, h);
    assert.ok(Math.abs(top + w * FACE_AT - h / 2) <= 0.5);
  });

  test('resim kartın dışında boşluk bırakmaz', () => {
    for (const w of [150, 200, 250, 320, 500]) {
      for (const h of [60, 108, 149]) {
        const top = coverTop(w, h);
        assert.ok(top <= 0, 'üstte boşluk yok');
        assert.ok(top + w >= h, 'altta boşluk yok');
      }
    }
    assert.equal(coverTop(250, 108, 0), 0, 'en üste dayanır');
    assert.equal(coverTop(250, 108, 1), 108 - 250, 'en alta dayanır');
  });

  test('ölçü gelmeden ya da kart kare ise resim yerinde kalır', () => {
    assert.equal(coverTop(0, 0), 0);
    assert.equal(coverTop(108, 108), 0);
    assert.equal(coverTop(90, 108), 0);
  });
});
