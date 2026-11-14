/// <reference types="node" />
// "Mikrofon denoise": the line under the switch says whether the AI cleaning really runs on this phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { denoiseLine } from '@/lib/mic-denoise';

test('kapalıyken ya da yapay zekâ temizleme olmayan telefonda bir şey yazılmaz', () => {
  assert.equal(denoiseLine(false, { attached: true, frames: 120 }), null);
  assert.equal(denoiseLine(true, null), null);
});

test('mikrofonun yoluna girip ses temizlediyse "çalışıyor", henüz ses gelmediyse mikrofon açılınca', () => {
  assert.deepEqual(denoiseLine(true, { attached: true, frames: 0 }), { text: 'Mikrofonun açılınca devreye girer.', tone: 'wait' });
  assert.equal(denoiseLine(true, { attached: true, frames: 500 })?.tone, 'ok');
  assert.match(denoiseLine(true, { attached: true, frames: 500 })!.text, /^Çalışıyor/);
});

test('başlatılamadıysa (ör. LiveKit güncellemesi kancayı taşıdı) açıkça söylenir', () => {
  const line = denoiseLine(true, { attached: false, frames: 0 });
  assert.equal(line?.tone, 'bad');
  assert.match(line!.text, /başlatılamadı/);
});
