/// <reference types="node" />
// Banner Yönetimi on the phone (lib/live/team bannersOf): the server's banners read defensively, anything malformed
// left out rather than shown half; a button without a link isn't shown; an unknown colour falls back to violet.
import { register } from 'node:module';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

register('./api-stub-hooks.mjs', import.meta.url);
process.env.EXPO_PUBLIC_API_URL = 'http://api.test';

const { bannersOf } = await import('@/lib/live/team');

describe('Banner Yönetimi: sunucunun bannerları', () => {
  test('geçerli olanlar sırasıyla; bozuk olanlar atlanır', () => {
    const good = { id: '1', title: 'Yayıncı Yarışması', subtitle: 'Büyük ödül', cta: 'Katıl', link: '/etkinlikler', imageUrl: 'https://cdn.test/notice/a/b.webp', art: null, showText: true, accent: 'pembe' };
    const out = bannersOf([good, null, 'x', { id: '2' }, { id: '3', title: 'Görselsiz' }, { id: '4', title: 'Örnek', art: 'ornek-hediye-alanlar', cta: 'Git', link: 'https://dis.site', accent: 'kirmizi' }]);
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], good);
    assert.deepEqual([out[1].link, out[1].cta, out[1].accent, out[1].showText], [null, '', 'mor', true], 'dış bağlantı yok, düğme de yok; renk morda');
    assert.deepEqual(bannersOf(undefined), []);
    assert.deepEqual(bannersOf({}), []);
  });
});
