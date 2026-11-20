/// <reference types="node" />
// A face that failed to load is tried again before its fallback stays (lib/image-retry, Güncelleme 7 item 1): the
// fallback shows while a retry waits (3 s, then 20 s), the third failure keeps it, and a new address starts over.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { IMAGE_RETRY_MS, failedTry, freshTry, retryAfter, showsImage } from '@/lib/image-retry';

const U = 'https://api.test/api/media/f/avatar/a.jpg';
const V = 'https://api.test/api/media/f/avatar/b.jpg';

describe('Yüklenemeyen fotoğraf', () => {
  test('iki kez daha denenir: 3 sn, 20 sn; sonra yedek görünüm kalır', () => {
    assert.deepEqual(IMAGE_RETRY_MS, [3_000, 20_000]);
    assert.equal(retryAfter(0), null);
    assert.equal(retryAfter(1), 3_000);
    assert.equal(retryAfter(2), 20_000);
    assert.equal(retryAfter(3), null);
  });

  test('beklerken yedek, sırası gelince yine fotoğraf; üçüncü hatada vazgeçilir', () => {
    let t = freshTry(U);
    assert.equal(showsImage(t, U), true);
    t = failedTry(t, U);
    assert.deepEqual(t, { uri: U, fails: 1, waiting: true });
    assert.equal(showsImage(t, U), false, 'beklerken baş harf');
    t = { ...t, waiting: false };
    assert.equal(showsImage(t, U), true, 'ikinci deneme');
    t = failedTry(t, U);
    assert.deepEqual(t, { uri: U, fails: 2, waiting: true });
    t = { ...t, waiting: false };
    assert.equal(showsImage(t, U), true, 'üçüncü deneme');
    t = failedTry(t, U);
    assert.deepEqual(t, { uri: U, fails: 3, waiting: false });
    assert.equal(showsImage(t, U), false, 'artık yedek kalır');
  });

  test('yeni adres baştan denenir; adres yoksa fotoğraf yok', () => {
    const t = failedTry(failedTry(failedTry(freshTry(U), U), U), U);
    assert.equal(showsImage(t, U), false);
    assert.equal(showsImage(t, V), true, 'yeni fotoğraf');
    assert.deepEqual(failedTry(t, V), { uri: V, fails: 1, waiting: true });
    assert.equal(showsImage(freshTry(undefined), undefined), false);
  });
});
