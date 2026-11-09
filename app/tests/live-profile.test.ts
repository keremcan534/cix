/// <reference types="node" />
// Live mode, the profile screen (lib/live/profile): my edit goes to PATCH /api/me and the screen takes the server's
// answer (sosyal-4, gorsel-2), a birth date already set is never sent again and nothing of the demo account is
// kept (sosyal-8), a new profile photo goes to the storage and then becomes my avatar on the server (sosyal-5), and
// someone's profile brings the real follower counts (sosyal-6, gorsel-4). The phone's storage is a stand-in
// (tests/api-stub-hooks.mjs); fetch is a fake server and a fake photo storage.
import { register } from 'node:module';
import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

register('./api-stub-hooks.mjs', import.meta.url);
process.env.EXPO_PUBLIC_API_URL = 'http://api.test';

type Seen = { method: string; url: string; path: string; headers: Record<string, string>; body: unknown };
type Reply = { status?: number; body?: unknown; blob?: Blob } | 'down';

const store = ((globalThis as { __asyncStore?: Map<string, string> }).__asyncStore ??= new Map<string, string>());
const SERVER_ME = { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Zeynep', coins: 0, diamonds: 0, gameCoins: 0, createdAt: '2026-10-02T09:00:00.000Z', username: null, gender: null, age: 32, city: null, bio: 'Yeni buradayım', interests: [], avatarUrl: null };

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
    const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const s: Seen = { method: init?.method ?? 'GET', url: url.href, path: url.pathname + url.search, headers: (init?.headers ?? {}) as Record<string, string>, body };
    seen.push(s);
    const r = route(s);
    if (r === 'down') throw new TypeError('network down');
    if (r.blob) return new Response(r.blob, { status: r.status ?? 200 });
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const profile = () => import('@/lib/live/profile');
const PHOTO = new Blob([new Uint8Array(2048)], { type: 'image/jpeg' });
const TARGET = { uploadUrl: 'https://storage.test/avatars/abc.jpg?sig=1', method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'x-amz-acl': 'public-read' }, publicUrl: 'https://cdn.test/avatars/abc.jpg', expiresIn: 300 };

describe('Profil düzenleme sunucuya gider', () => {
  test('gönderilen alanlar temizlenir; boş kullanıcı adı ve girilmemiş doğum tarihi gönderilmez', async () => {
    const { profilePatch } = await profile();
    const p = profilePatch({ name: '  Zeynep ', username: '  ', bio: ' Müzik ', city: ' İzmir ', interests: ['🎧 Müzik', '🎧 Müzik', '☕ Kahve'] });
    assert.deepEqual(p, { name: 'Zeynep', bio: 'Müzik', city: 'İzmir', interests: ['🎧 Müzik', '☕ Kahve'] });
    assert.equal('birthDate' in p, false);
    assert.equal('username' in p, false);
    assert.equal('gender' in p, false);
  });

  test('kullanıcı adı küçük harfle, cinsiyet ve ilk doğum tarihi yalnızca seçildiyse gider', async () => {
    const { profilePatch } = await profile();
    const p = profilePatch({ name: 'Ali', username: 'Ali.Veli', bio: '', city: '', interests: [], gender: 'Erkek', birthDate: '1994-01-01' });
    assert.deepEqual(p, { name: 'Ali', username: 'ali.veli', bio: '', city: '', interests: [], gender: 'Erkek', birthDate: '1994-01-01' });
  });

  test('Kaydet PATCH /api/me gönderir ve ekrana sunucunun cevabı gelir (yaş sunucudan, doğum tarihi tekrar gitmez)', async () => {
    const { saveMyProfile } = await profile();
    route = (s) => (s.method === 'PATCH' && s.path === '/api/me' ? { body: { user: { ...SERVER_ME, ...(s.body as object), username: 'zeynep.y' } } } : { status: 404 });
    const me = await saveMyProfile({ name: 'Zeynep Y', username: 'zeynep.y', bio: 'Müzik ve sohbet', city: 'İzmir', interests: ['🎧 Müzik'] });
    const patch = seen.filter((s) => s.method === 'PATCH');
    assert.equal(patch.length, 1);
    assert.equal(patch[0].headers.Authorization, 'Bearer S1');
    assert.deepEqual(patch[0].body, { name: 'Zeynep Y', username: 'zeynep.y', bio: 'Müzik ve sohbet', city: 'İzmir', interests: ['🎧 Müzik'] });
    assert.equal(me.name, 'Zeynep Y');
    assert.equal(me.bio, 'Müzik ve sohbet');
    assert.equal(me.username, 'zeynep.y');
    assert.equal(me.age, 32);
  });

  test('sunucu reddederse (alınmış kullanıcı adı) hata fırlar ve sunucunun sözü gösterilir', async () => {
    const { saveMyProfile } = await profile();
    route = () => ({ status: 409, body: { error: 'Bu kullanıcı adı alınmış.' } });
    await assert.rejects(saveMyProfile({ name: 'Ali', username: 'elif', bio: '', city: '', interests: [] }), /Bu kullanıcı adı alınmış/);
  });
});

describe('Profilim sunucudan: demo değeri kalmaz', () => {
  test('boş alanlar boş kalır (@sen, İstanbul, demo cinsiyet yok); üyelik tarihi hesabın kendi tarihi', async () => {
    const { meFromServer } = await profile();
    const me = meFromServer(SERVER_ME);
    assert.equal(me.username, '');
    assert.equal(me.city, '');
    assert.equal(me.gender, undefined);
    assert.deepEqual(me.interests, []);
    assert.equal(me.joinedAt, '2026-10-02');
    assert.equal(me.age, 32);
    assert.equal('avatar' in me, false);
    assert.equal('birthDate' in me, false);
  });

  test('sunucuda yaş yoksa yaş uydurulmaz', async () => {
    const { meFromServer } = await profile();
    assert.equal('age' in meFromServer({ ...SERVER_ME, age: null }), false);
  });

  test('loadMe GET /api/me okur', async () => {
    const { loadMe } = await profile();
    route = (s) => (s.path === '/api/me' ? { body: { user: { ...SERVER_ME, username: 'zeynep', avatarUrl: 'https://cdn.test/a.jpg' } } } : { status: 404 });
    const me = await loadMe();
    assert.equal(me.username, 'zeynep');
    assert.equal(me.avatar, 'https://cdn.test/a.jpg');
  });
});

describe('Başkasının profili: gerçek sayılar', () => {
  test('takipçi, takip ve takip durumu sunucudan; kişi telefonda güncellenir', async () => {
    const { loadPublicProfile } = await profile();
    const { userById } = await import('@/data/mock');
    const id = 'bbbbbbbb-0000-4000-8000-000000000002';
    route = (s) =>
      s.path === `/api/user?id=${id}`
        ? { body: { user: { id, name: 'Elif', username: 'elif', gender: 'Kadın', age: 27, city: 'Ankara', bio: 'Selam', interests: ['☕ Kahve'], avatarUrl: null, followers: 3, following: 1, isFollowing: true, blockedByMe: false } } }
        : { status: 404 };
    assert.deepEqual(await loadPublicProfile(id), { followers: 3, following: 1, isFollowing: true, blockedByMe: false });
    const u = userById(id);
    assert.equal(u.name, 'Elif');
    assert.equal(u.age, 27);
    assert.equal(u.city, 'Ankara');
    assert.equal(u.username, 'elif');
  });

  test('engelden sonra sunucunun engel durumu da gelir (ekran eski takip durumunu tutmaz)', async () => {
    const { loadPublicProfile } = await profile();
    const id = 'bbbbbbbb-0000-4000-8000-000000000003';
    route = (s) =>
      s.path === `/api/user?id=${id}`
        ? { body: { user: { id, name: 'Can', username: null, gender: null, age: null, city: null, bio: '', interests: [], avatarUrl: null, followers: 0, following: 0, isFollowing: false, blockedByMe: true } } }
        : { status: 404 };
    assert.deepEqual(await loadPublicProfile(id), { followers: 0, following: 0, isFollowing: false, blockedByMe: true });
  });

  test('ajansı ve ailesi profilin cevabından (cevapta yoksa yok)', async () => {
    const { loadPublicProfile, tiesOf } = await profile();
    const id = 'bbbbbbbb-0000-4000-8000-000000000004';
    const user = { id, name: 'Ece', username: null, gender: null, age: null, city: null, bio: '', interests: [], avatarUrl: null, followers: 0, following: 0, isFollowing: false, blockedByMe: false };
    const shown = () => tiesOf(id);
    assert.equal(shown(), undefined, 'okunmadan bilinmez');
    route = (s) => (s.path === `/api/user?id=${id}` ? { body: { user, agency: { id: '7', name: 'Mavi' }, family: { id: '3', name: 'Martılar', role: 'helper' } } } : { status: 404 });
    await loadPublicProfile(id);
    assert.deepEqual(shown(), { agency: { id: '7', name: 'Mavi' }, family: { id: '3', name: 'Martılar', role: 'helper' } });
    route = (s) => (s.path === `/api/user?id=${id}` ? { body: { user } } : { status: 404 });
    await loadPublicProfile(id);
    assert.deepEqual(shown(), { agency: null, family: null });
  });

  test('takip sunucuya gider ve cevap sunucunun takip durumudur', async () => {
    const { followOnServer } = await profile();
    route = (s) => (s.path === '/api/follow' ? { body: { following: false } } : { status: 404 });
    assert.equal(await followOnServer('bbbbbbbb-0000-4000-8000-000000000002', true), false);
    assert.deepEqual(seen[0].body, { to: 'bbbbbbbb-0000-4000-8000-000000000002', follow: true });
  });

  test('takip reddedilirse hata fırlar (ekran puan vermez, düğme değişmez)', async () => {
    const { followOnServer } = await profile();
    route = () => ({ status: 403, body: { error: 'Bu kişiyi takip edemezsin.' } });
    await assert.rejects(followOnServer('bbbbbbbb-0000-4000-8000-000000000002', true), /takip edemezsin/);
  });
});

describe('Profil fotoğrafı sunucuya yüklenir', () => {
  test('yükleme adresi alınır, fotoğraf başlıklarıyla PUT edilir, sonra adresi profilime kaydedilir', async () => {
    const { uploadAvatar } = await profile();
    route = (s) => {
      if (s.url === 'file:///photo.jpg') return { blob: PHOTO };
      if (s.path === '/api/media/upload-url') return { body: TARGET };
      if (s.url === TARGET.uploadUrl) return { status: 200 };
      if (s.method === 'PATCH' && s.path === '/api/me') return { body: { user: { ...SERVER_ME, avatarUrl: (s.body as { avatarUrl: string }).avatarUrl } } };
      return { status: 404 };
    };
    const me = await uploadAvatar({ uri: 'file:///photo.jpg', mimeType: 'image/jpeg' });
    assert.deepEqual(
      seen.map((s) => `${s.method} ${s.url}`),
      ['GET file:///photo.jpg', 'POST http://api.test/api/media/upload-url', `PUT ${TARGET.uploadUrl}`, 'PATCH http://api.test/api/me'],
    );
    assert.deepEqual(seen[1].body, { kind: 'avatar', contentType: 'image/jpeg', size: 2048 });
    assert.deepEqual(seen[2].headers, TARGET.headers);
    assert.ok(seen[2].body instanceof Blob);
    assert.deepEqual(seen[3].body, { avatarUrl: TARGET.publicUrl });
    assert.equal(me.avatar, TARGET.publicUrl);
  });

  test('fotoğraf deposu kurulu değilse (503) hata fırlar ve profil değişmez', async () => {
    const { uploadAvatar } = await profile();
    route = (s) => (s.url === 'file:///photo.jpg' ? { blob: PHOTO } : s.path === '/api/media/upload-url' ? { status: 503, body: { error: 'Fotoğraf yükleme şu an kapalı.' } } : { status: 200, body: {} });
    await assert.rejects(uploadAvatar({ uri: 'file:///photo.jpg' }), /Fotoğraf yükleme şu an kapalı/);
    assert.equal(seen.some((s) => s.method === 'PATCH'), false);
  });

  test('depoya yükleme başarısızsa hata fırlar ve avatar kaydedilmez', async () => {
    const { uploadAvatar } = await profile();
    route = (s) => (s.url === 'file:///photo.jpg' ? { blob: PHOTO } : s.path === '/api/media/upload-url' ? { body: TARGET } : s.url === TARGET.uploadUrl ? { status: 403 } : { status: 200, body: {} });
    await assert.rejects(uploadAvatar({ uri: 'file:///photo.jpg' }), /Fotoğraf yüklenemedi \(403\)/);
    assert.equal(seen.some((s) => s.method === 'PATCH'), false);
  });

  test('bağlantı koparsa anlaşılır bir hata verir ve avatar kaydedilmez', async () => {
    const { uploadAvatar } = await profile();
    route = (s) => (s.url === 'file:///photo.jpg' ? { blob: PHOTO } : s.path === '/api/media/upload-url' ? { body: TARGET } : s.url === TARGET.uploadUrl ? 'down' : { status: 200, body: {} });
    await assert.rejects(uploadAvatar({ uri: 'file:///photo.jpg' }), /İnternetini kontrol edip tekrar dene/);
    assert.equal(seen.some((s) => s.method === 'PATCH'), false);
  });

  test('fotoğrafın türü: seçicinin, yoksa dosyanın, yoksa uzantıdan (bilinmiyorsa JPEG)', async () => {
    const { imageType } = await profile();
    assert.equal(imageType('file:///a.png', 'image/webp', 'image/png'), 'image/webp');
    assert.equal(imageType('file:///a.png', null, 'image/heic'), 'image/heic');
    assert.equal(imageType('file:///a.PNG?x=1', null, ''), 'image/png');
    assert.equal(imageType('file:///a', undefined, ''), 'image/jpeg');
  });

  test('fotoğraf yüklenmeden önce küçülür: uzun kenarı sınıra iner, küçükse boyutu değişmez', async () => {
    const { shrinkSize, PHOTO_KEEP } = await profile();
    assert.deepEqual(shrinkSize(4000, 3000, 1280), { width: 1280 });
    assert.deepEqual(shrinkSize(3000, 4000, 1280), { height: 1280 });
    assert.equal(shrinkSize(1280, 960, 1280), null);
    assert.equal(shrinkSize(0, 0, 1280), null, 'boyutu bilinmiyorsa önce okunur');
    // Small enough to look the same on a phone, well inside the server's caps (media.mjs: 5 MB, 8 MB).
    assert.deepEqual(
      Object.fromEntries(Object.entries(PHOTO_KEEP).map(([k, v]) => [k, v.side])),
      { avatar: 640, moment: 1280, dm: 1280, notice: 1600 },
    );
  });
});
