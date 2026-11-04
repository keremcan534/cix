/// <reference types="node" />
// Live mode request bookkeeping (lib/live/requests): request ids kept after a lost answer expire, and a balance
// read that started before a money answer was applied is stale (it would show up as a fake gift).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { UNSURE_TTL_MS, replyOrder, unsureRefs } from '@/lib/live/requests';

test('cevabı gelmeyen istek numarası birkaç dakika sonra unutulur', () => {
  let now = 1_000;
  const refs = unsureRefs(UNSURE_TTL_MS, () => now);
  refs.set('topup:1000', 'r1');
  now += UNSURE_TTL_MS - 1;
  assert.equal(refs.get('topup:1000'), 'r1', 'süre dolmadan aynı numara tekrar kullanılır');
  now += 2;
  assert.equal(refs.get('topup:1000'), undefined, 'süre dolunca yeni istek yeni numara alır');
  assert.equal(refs.get('topup:1000'), undefined);
});

test('tekrar zaman aşımı süreyi yeniler; silinen ve temizlenen numara kalmaz', () => {
  let now = 0;
  const refs = unsureRefs(100, () => now);
  refs.set('a', 'r1');
  now = 90;
  refs.set('a', 'r1');
  now = 150;
  assert.equal(refs.get('a'), 'r1');
  refs.delete('a');
  assert.equal(refs.get('a'), undefined);
  refs.set('b', 'r2');
  refs.clear();
  assert.equal(refs.get('b'), undefined);
});

test('para işleminden önce başlayan bakiye okuması eskidir', () => {
  const order = replyOrder();
  const before = order.begin();
  assert.equal(order.stale(before), false, 'para işlemi yokken okuma geçerli');
  order.moneyApplied();
  assert.equal(order.stale(before), true, 'çekim cevabından sonra gelen eski okuma atılır');
  const after = order.begin();
  assert.equal(order.stale(after), false, 'sonra başlayan okuma geçerli');
  order.reset();
  assert.equal(order.stale(order.begin()), false);
});
