/// <reference types="node" />
// Live mode, Anlar (lib/live/moments): the feed asks the server with the tab, topic and page, a post with a photo
// puts the photo in the storage first and then sends its address with the post's request id, and the time under a
// post reads like a person would say it. The phone's storage is a stand-in (tests/api-stub-hooks.mjs); fetch is a
// fake server and a fake photo storage.
import { register } from 'node:module';
import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

register('./api-stub-hooks.mjs', import.meta.url);
process.env.EXPO_PUBLIC_API_URL = 'http://api.test';

type Seen = { method: string; url: string; path: string; body: unknown };
type Reply = { status?: number; body?: unknown; blob?: Blob };

const store = ((globalThis as { __asyncStore?: Map<string, string> }).__asyncStore ??= new Map<string, string>());
const AUTHOR = { id: 'aaaaaaaa-0000-4000-8000-000000000002', name: 'Deniz', avatarUrl: 'https://cdn.test/avatar/d.jpg', gender: 'Kadın', age: 27, vipLevel: 0, frame: null };
const MOMENT = { id: '41', author: AUTHOR, text: 'Merhaba', imageUrl: null, topic: null, likes: 2, comments: 1, liked: false, createdAt: '2026-11-07T10:00:00.000Z' };

let seen: Seen[] = [];
let route: (s: Seen) => Reply = () => ({ status: 404, body: { error: 'yok' } });
const realFetch = globalThis.fetch;
beforeEach(() => {
  store.clear();
  store.set('similarclub:device-key', 'device-key-1');
  store.set('similarclub:api-session', 'S1');
  seen = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const raw = init?.body;
    const s: Seen = { method: init?.method ?? 'GET', url: url.href, path: url.pathname + url.search, body: typeof raw === 'string' ? JSON.parse(raw) : raw };
    seen.push(s);
    const r = route(s);
    if (r.blob) return new Response(r.blob, { status: r.status ?? 200 });
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const moments = () => import('@/lib/live/moments');
const PHOTO = new Blob([new Uint8Array(2048)], { type: 'image/jpeg' });
const TARGET = { uploadUrl: 'https://storage.test/moment/abc.jpg?sig=1', method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, publicUrl: 'https://cdn.test/moment/u/abc.jpg', expiresIn: 300 };

describe('Anlar sunucudan', () => {
  test('akış sekme, konu ve sayfayla istenir; yazanlar telefonda tanınır', async () => {
    const { feed } = await moments();
    route = () => ({ body: { moments: [MOMENT] } });
    const list = await feed({ tab: 'recent', topic: 'music', before: '90' });
    assert.equal(list.length, 1);
    assert.equal(seen[0].path, '/api/moments?tab=recent&topic=music&before=90');
    const { userById } = await import('@/data/mock');
    assert.equal(userById(AUTHOR.id).name, 'Deniz');
  });

  test('fotoğraflı an: önce fotoğraf yüklenir, sonra adresi ve istek kimliğiyle an gönderilir', async () => {
    const { post } = await moments();
    route = (s) =>
      s.url === 'file:///photo.jpg' ? { blob: PHOTO } : s.path === '/api/media/upload-url' ? { body: TARGET } : s.url === TARGET.uploadUrl ? { status: 200 } : { body: { moment: { ...MOMENT, imageUrl: TARGET.publicUrl } } };
    const m = await post('Deniz kenarı', { uri: 'file:///photo.jpg', mimeType: 'image/jpeg' }, 'travel', 'ref-1');
    assert.equal(m.imageUrl, TARGET.publicUrl);
    assert.deepEqual(
      seen.map((s) => `${s.method} ${s.url}`),
      ['GET file:///photo.jpg', 'POST http://api.test/api/media/upload-url', `PUT ${TARGET.uploadUrl}`, 'POST http://api.test/api/moments'],
    );
    assert.equal((seen[1].body as { kind: string }).kind, 'moment');
    assert.deepEqual(seen[3].body, { text: 'Deniz kenarı', ref: 'ref-1', imageUrl: TARGET.publicUrl, topic: 'travel' });
  });

  test('fotoğraf yüklenemezse an gönderilmez ve sebep söylenir', async () => {
    const { post } = await moments();
    route = (s) => (s.url === 'file:///photo.jpg' ? { blob: PHOTO } : s.path === '/api/media/upload-url' ? { status: 503, body: { error: 'Fotoğraf yükleme henüz açık değil' } } : { body: {} });
    await assert.rejects(post('Selam', { uri: 'file:///photo.jpg' }, null), /Fotoğraf yükleme henüz açık değil/);
    assert.equal(seen.some((s) => s.path === '/api/moments'), false);
  });

  test('zaman: şimdi, dakika, saat, gün, sonra tarih', async () => {
    const { agoText } = await moments();
    const now = Date.parse('2026-11-07T12:00:00.000Z');
    assert.equal(agoText('2026-11-07T11:59:40.000Z', now), 'şimdi');
    assert.equal(agoText('2026-11-07T11:55:00.000Z', now), '5 dakika önce');
    assert.equal(agoText('2026-11-07T09:00:00.000Z', now), '3 saat önce');
    assert.equal(agoText('2026-11-05T12:00:00.000Z', now), '2 gün önce');
    assert.match(agoText('2026-10-01T12:00:00.000Z', now), /^01\.10\.2026$/);
  });

  test('paylaşım Yankı Lv.5 ile açılır: telefonun eğrisi sunucunun 250 puanıyla aynı', async () => {
    const { CHARM_XP } = await import('@/data/charm');
    assert.equal(CHARM_XP[5], 250);
    const server = fs.readFileSync(path.join(import.meta.dirname, '../../server/api/moments.mjs'), 'utf8');
    assert.match(server, /POST_LEVEL = 5;/);
    assert.match(server, /MOMENT_CHARM \?\? 250\)/);
  });

  test('akış paylaşım iznini getirir; Yankı yetmeyince ret ne kadar kaldığını söyler', async () => {
    const { feedPage, post, postingRefusal } = await moments();
    const posting = { allowed: false, needLevel: 5, need: 250, points: 40 };
    route = () => ({ body: { moments: [MOMENT], posting } });
    assert.deepEqual((await feedPage({})).posting, posting);
    route = () => ({ body: { moments: [] } });
    assert.equal((await feedPage({})).posting, null, 'eski sunucu: izin bilinmiyor');
    route = () => ({ status: 403, body: { error: "Anlar'da paylaşım Yankı Lv.5 ve üstü için", code: 'charm', ...posting } });
    const e = await post('Merhaba', null, null).then(
      () => null,
      (x: unknown) => x,
    );
    assert.deepEqual(postingRefusal(e), posting);
    assert.equal(postingRefusal(new Error('başka')), null);
  });

  test('yorum beğenme sunucuya yorumun kimliğiyle gider', async () => {
    const { likeComment } = await moments();
    route = () => ({ body: { liked: true, likes: 3 } });
    assert.deepEqual(await likeComment('77', true), { liked: true, likes: 3 });
    assert.deepEqual(seen[0].body, { id: '77', like: true });
    assert.equal(seen[0].path, '/api/moments/comment/like');
  });
});
