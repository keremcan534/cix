/// <reference types="node" />
// Gift and entry videos on the phone (lib/fx-videos), with the documents folder a temp folder here and the
// server a map of addresses (tests/fs-stub-hooks.mjs): nothing is touched before the server's list comes; then the
// folder follows it (old versions and half downloads deleted), clips are fetched ahead or the first time they're
// needed, a cut-off download never becomes a clip and isn't retried at once, and the admins' preview can fetch one now.
import { register } from 'node:module';
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-videos-'));
(globalThis as { __fsRoot?: string }).__fsRoot = root;
process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
register('./fs-stub-hooks.mjs', import.meta.url);
after(() => fs.rmSync(root, { recursive: true, force: true }));

type FxVideo = import('@/lib/fx-videos-core').FxVideo;
const clip = (n: number) => Buffer.alloc(n, 7);
const roket: FxVideo = { kind: 'gift', id: 'g6', url: '/api/fx/roket.mp4?v=0123456789ab', bytes: 300, ms: 5000 };
const ayicik: FxVideo = { kind: 'gift', id: 'h13', url: '/api/fx/tatli-ayicik.mp4?v=abcdefabcdef', bytes: 200, ms: 5000 };
const ejderha: FxVideo = { kind: 'entry', id: 'dragon', url: '/api/fx/ejderha.mp4?v=fedcba987654', bytes: 400, ms: 6000 };

const server = new Map<string, Buffer>([
  [roket.url, clip(300)],
  [ayicik.url, clip(200)],
  [ejderha.url, clip(400)],
]);
const asked: string[] = [];
(globalThis as { __download?: (url: string) => Promise<{ status: number; body?: Buffer }> }).__download = async (url) => {
  const p = url.replace('http://api.test', '');
  asked.push(p);
  await new Promise((r) => setTimeout(r, 2));
  const body = server.get(p);
  return body ? { status: 200, body } : { status: 404 };
};

const dir = path.join(root, 'fx');
const files = () => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);
async function until(ok: () => boolean, what: string) {
  const end = Date.now() + 3000;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`beklenmedi: ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}
const tick = () => new Promise((r) => setTimeout(r, 30));

describe('hediye videoları telefonda', () => {
  test('sırayla: liste gelmeden dokunulmaz, sonra klasör listeye uyar, klipler iner', async () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'roket-000000000000.mp4'), clip(10));
    fs.writeFileSync(path.join(dir, 'tatli-ayicik-abcdefabcdef.mp4.part'), clip(5));
    const fx = await import('@/lib/fx-videos');

    // No list yet (catalog not read, or an older server): the folder stays as it is.
    fx.setFxVideos(null, { prefetch: true });
    await tick();
    assert.deepEqual(files(), ['roket-000000000000.mp4', 'tatli-ayicik-abcdefabcdef.mp4.part']);
    assert.equal(fx.fxMedia('gift', 'g6'), null);

    // Düşük veri modu: the folder is tidied, nothing is fetched ahead.
    fx.setFxVideos([roket, ayicik, ejderha], { prefetch: false });
    await until(() => files().length === 0, 'eski sürüm ve yarım dosya silinsin');
    await tick();
    assert.deepEqual(asked, []);

    // The first gift that needs it plays drawn and starts the download; the next one plays the clip.
    assert.equal(fx.fxMedia('gift', 'g6'), null);
    await until(() => fx.fxMedia('gift', 'g6') !== null, 'roket insin');
    assert.deepEqual(asked, [roket.url]);
    const media = fx.fxMedia('gift', 'g6')!;
    assert.equal(media.ms, 5000);
    assert.equal(media.uri, `file://${root}/fx/roket-0123456789ab.mp4`);
    assert.ok(fs.readFileSync(path.join(dir, 'roket-0123456789ab.mp4')).equals(server.get(roket.url)!));
    assert.equal(fx.fxMedia('gift', 'yok'), null, 'listede olmayan hediye');

    // Fetching ahead: the rest come one by one.
    fx.setFxVideos([roket, ayicik, ejderha], { prefetch: true });
    await until(() => !!fx.fxMedia('gift', 'h13') && !!fx.fxMedia('entry', 'dragon'), 'hepsi insin');
    assert.deepEqual(files(), ['ejderha-fedcba987654.mp4', 'roket-0123456789ab.mp4', 'tatli-ayicik-abcdefabcdef.mp4']);
    assert.equal(asked.length, 3);
  });

  test('yarıda kalan indirme klip olmaz, hemen tekrar denenmez; önizleme şimdi indirebilir', async () => {
    const fx = await import('@/lib/fx-videos');
    // A new version of the bear: the server sends a cut-off file first.
    const yeni: FxVideo = { ...ayicik, url: '/api/fx/tatli-ayicik.mp4?v=999999999999', bytes: 250 };
    server.set(yeni.url, clip(120));
    fx.setFxVideos([roket, yeni, ejderha], { prefetch: true });
    await until(() => !files().includes('tatli-ayicik-abcdefabcdef.mp4'), 'eski sürüm silinsin');
    await until(() => asked.includes(yeni.url), 'deneme');
    await tick();
    await until(() => !files().some((f) => f.endsWith('.part')), 'yarım dosya kalmasın');
    assert.equal(fx.fxMedia('gift', 'h13'), null);
    assert.deepEqual(files(), ['ejderha-fedcba987654.mp4', 'roket-0123456789ab.mp4']);
    // Not again right away, however often the gift comes.
    const tries = asked.filter((u) => u === yeni.url).length;
    fx.fxMedia('gift', 'h13');
    fx.fxMedia('gift', 'h13');
    await tick();
    assert.equal(asked.filter((u) => u === yeni.url).length, tries);

    // The admins' preview tries once more, now; the server has the whole file this time.
    server.set(yeni.url, clip(250));
    const got = await fx.fetchFxNow('gift', 'h13');
    assert.equal(got?.uri, `file://${root}/fx/tatli-ayicik-999999999999.mp4`);
    assert.deepEqual(await fx.fetchFxNow('entry', 'dragon'), { uri: `file://${root}/fx/ejderha-fedcba987654.mp4`, ms: 6000 });
    assert.equal(await fx.fetchFxNow('gift', 'yok'), null);

    // An empty list from the server: nothing plays a video any more, the folder empties.
    fx.setFxVideos([], { prefetch: true });
    await until(() => files().length === 0, 'klasör boşalsın');
    assert.equal(fx.fxMedia('gift', 'g6'), null);
  });
});
