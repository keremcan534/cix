/// <reference types="node" />
// Gift and entry videos from the server (lib/fx-videos-core; server/api/fx.mjs): the list is read without trusting
// it, each clip is kept under its name and version, the folder is matched to the list (missing clips fetched only
// when it may fetch ahead, unlisted files and half downloads deleted, files being written left alone), and the
// live catalog carries the list and keeps it on the phone.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { fxFileName, fxSafetyMs, parseFxList, planFxSync, type FxVideo } from '@/lib/fx-videos-core';
import { parseLiveCatalog, parseSavedLiveCatalog } from '@/lib/live/catalog-live';

const roket: FxVideo = { kind: 'gift', id: 'g6', url: '/api/fx/roket.mp4?v=0123456789ab', bytes: 2_716_520, ms: 5000 };
const ayicik: FxVideo = { kind: 'gift', id: 'h13', url: '/api/fx/tatli-ayicik.mp4?v=abcdefabcdef', bytes: 2_347_859, ms: 5000 };
const ejderha: FxVideo = { kind: 'entry', id: 'dragon', url: '/api/fx/ejderha.mp4?v=fedcba987654', bytes: 4_657_552, ms: 5000 };

describe('hediye videoları: sunucunun listesi', () => {
  test('liste okunur; bozuk, tekrar eden ya da başka adrese giden kayıt atılır', () => {
    assert.deepEqual(parseFxList([roket, ayicik, ejderha]), [roket, ayicik, ejderha]);
    const got = parseFxList([
      roket,
      { ...roket, url: '/api/fx/roket-2.mp4?v=111111111111' },
      { ...ayicik, kind: 'sticker' },
      { ...ayicik, id: '../../x' },
      { ...ayicik, url: 'https://kotu.example/roket.mp4?v=0123456789ab' },
      { ...ayicik, url: '/api/fx/../core.mjs?v=0123456789ab' },
      { ...ayicik, bytes: 0 },
      { ...ayicik, bytes: 10 ** 12 },
      { ...ejderha, ms: 'uzun' },
      'x',
      null,
    ]);
    assert.deepEqual(got, [roket, { ...ejderha, ms: 0 }]);
    for (const raw of [undefined, null, 'x', 42, {}]) assert.equal(parseFxList(raw), null, String(raw));
    assert.deepEqual(parseFxList([]), []);
  });

  test('her klip adı ve sürümüyle saklanır: değişen klip yeni dosya olur', () => {
    assert.equal(fxFileName(roket), 'roket-0123456789ab.mp4');
    assert.equal(fxFileName({ ...roket, url: '/api/fx/roket.mp4?v=999999999999' }), 'roket-999999999999.mp4');
    assert.equal(fxFileName({ ...roket, url: 'bozuk' }), '');
  });

  test('klasör listeye uyar: eksik iner (önceden indirme açıksa), eski ve yarım dosyalar silinir', () => {
    const have = ['roket-0123456789ab.mp4', 'roket-000000000000.mp4', 'tatli-ayicik-abcdefabcdef.mp4.part', 'baska.txt'];
    const plan = planFxSync([roket, ayicik, ejderha], have, true);
    assert.deepEqual(plan.fetch, [ayicik, ejderha]);
    assert.deepEqual(plan.drop, ['roket-000000000000.mp4', 'tatli-ayicik-abcdefabcdef.mp4.part', 'baska.txt']);
    // Düşük veri modu: nothing is fetched ahead, the folder is still tidied.
    assert.deepEqual(planFxSync([roket, ayicik, ejderha], have, false).fetch, []);
    // A clip being written now keeps its half file and isn't put in line twice.
    const busy = new Set(['tatli-ayicik-abcdefabcdef.mp4']);
    const during = planFxSync([roket, ayicik, ejderha], have, true, busy);
    assert.deepEqual(during.fetch, [ejderha]);
    assert.ok(!during.drop.includes('tatli-ayicik-abcdefabcdef.mp4.part'));
    // Two entries playing one file fetch it once.
    assert.deepEqual(planFxSync([ejderha, { ...ejderha, kind: 'gift', id: 'v9' }], [], true).fetch, [ejderha]);
    // An empty list (nothing to play any more) empties the folder.
    assert.deepEqual(planFxSync([], ['roket-0123456789ab.mp4'], true), { fetch: [], drop: ['roket-0123456789ab.mp4'] });
  });

  test('güvenlik süresi klibin uzunluğuna göre', () => {
    assert.equal(fxSafetyMs(5000), 8000);
    assert.equal(fxSafetyMs(10_000), 13_000);
    assert.equal(fxSafetyMs(0), 8000);
  });

  test('canlı katalog listeyi taşır ve telefonda saklar; eski kopya yeniden okunacak sayılır', () => {
    const c = parseLiveCatalog({ gifts: [{ id: 'g6' }], fx: [roket, ejderha], v: 3 });
    assert.deepEqual(c.fx, [roket, ejderha]);
    assert.equal(parseLiveCatalog({ gifts: [{ id: 'g6' }] }).fx, null, 'eski sunucu: liste yok');
    const back = parseSavedLiveCatalog(JSON.stringify({ ...c, fetchedAt: 1234 }));
    assert.deepEqual(back, { catalog: c, fetchedAt: 1234 });
    // Saved by an app from before the videos: kept, but as old, so the next config poll reads the catalog again.
    const { fx: _fx, ...before } = c;
    const old = parseSavedLiveCatalog(JSON.stringify({ ...before, fetchedAt: 1234 }));
    assert.equal(old?.fetchedAt, 0);
    assert.equal(old?.catalog.fx, null);
  });
});
