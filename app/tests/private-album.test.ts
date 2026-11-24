/// <reference types="node" />
// Özel albüm (lib/private-album-core): the server's album read defensively (a malformed one is no album, a photo
// without a usable address is skipped) and what the profile shows of it: nothing, mine, locked or open.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { albumShow, parseAlbum, unlockLabel } from '@/lib/private-album-core';

const base = { on: true, price: 500, count: 2, max: 12, mine: false, can: false, unlocked: false, photos: [] };

test('sunucunun cevabı: bozuk alanlar güvenli değerlere düşer, adresi bozuk fotoğraf atlanır', () => {
  assert.equal(parseAlbum(null), null);
  assert.equal(parseAlbum('x'), null);
  assert.deepEqual(parseAlbum({}), { on: false, price: 0, count: 0, max: 12, mine: false, can: false, unlocked: false, photos: [] });
  const a = parseAlbum({ ...base, unlocked: true, photos: [{ id: 1, url: 'https://x/api/media/f/private/u/a.jpg' }, { id: 'x', url: 'https://x/b.jpg' }, { id: 3, url: 'javascript:1' }, null] });
  assert.deepEqual(a?.photos, [{ id: 1, url: 'https://x/api/media/f/private/u/a.jpg' }]);
  assert.equal(parseAlbum({ ...base, price: -5 })?.price, 0);
  assert.equal(parseAlbum({ ...base, price: 499.6 })?.price, 500);
});

test('profilde ne görünür: hiçbir şey, benimki, kilitli ya da açık', () => {
  assert.equal(albumShow(null), 'none');
  assert.equal(albumShow(parseAlbum(base)), 'locked');
  assert.equal(albumShow(parseAlbum({ ...base, count: 0 })), 'none', 'boş albüm görünmez');
  assert.equal(albumShow(parseAlbum({ ...base, on: false })), 'none', 'kapalıyken satılmaz');
  assert.equal(albumShow(parseAlbum({ ...base, unlocked: true, photos: [{ id: 1, url: '/a.jpg' }] })), 'open');
  assert.equal(albumShow(parseAlbum({ ...base, on: false, unlocked: true, photos: [{ id: 1, url: '/a.jpg' }] })), 'open', 'önceden açan kapanınca da görür');
  assert.equal(albumShow(parseAlbum({ ...base, mine: true, can: true, count: 0 })), 'mine', 'yayıncı boş albümüne ekler');
  assert.equal(albumShow(parseAlbum({ ...base, mine: true, can: false, count: 0 })), 'none', 'yayıncı değilse kendi profilinde de yok');
  assert.equal(albumShow(parseAlbum({ ...base, mine: true, can: false, count: 3 })), 'mine', 'eskiden eklediği fotoğrafları görür');
  assert.equal(unlockLabel(1500), '1.500 jetonla aç');
});
