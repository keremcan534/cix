/// <reference types="node" />
// Which screens stay dark in the light theme (components/fx/dark-routes): the live room always; a call and Hemen
// Tanış only while calls exist. Without calls they show the "Yakında" placeholder, which follows the theme like
// /eslesme (gorsel-22 g).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { isDarkRoute } from '@/components/fx/dark-routes';

describe('Koyu ekranlar', () => {
  test('oda ve ajans ekranları her zaman koyu', () => {
    for (const calls of [true, false]) {
      assert.equal(isDarkRoute('oda/[id]', calls), true);
      assert.equal(isDarkRoute('ajans', calls), true);
      assert.equal(isDarkRoute('ajans/basvuru', calls), true);
    }
  });

  test('arama ve Hemen Tanış yalnızca aramalar açıkken koyu; kapalıyken "Yakında" temayı izler', () => {
    assert.equal(isDarkRoute('tanis', true), true);
    assert.equal(isDarkRoute('arama/[id]', true), true);
    assert.equal(isDarkRoute('tanis', false), false);
    assert.equal(isDarkRoute('arama/[id]', false), false);
  });

  test('diğer ekranlar temayı izler; benzer adlar karışmaz', () => {
    for (const name of ['eslesme', 'ayarlar', 'odalar', 'tanisma', 'aramalar', 'giris/profil']) assert.equal(isDarkRoute(name, true), false, name);
  });
});
