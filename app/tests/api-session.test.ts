/// <reference types="node" />
// lib/api on a cold start (mantik-1, odalar-2, para-13): the saved session goes with the very first requests, a
// request made while the sign-in runs waits for it, and one that still got 401 without a session is sent again
// once the sign-in is done. Also the password room's voice token (odalar-7). The phone's storage, random bytes
// and device signals are stand-ins (tests/api-stub-hooks.mjs); fetch is a fake server.
import { register } from 'node:module';
import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

register('./api-stub-hooks.mjs', import.meta.url);
process.env.EXPO_PUBLIC_API_URL = 'http://api.test';

type Api = typeof import('../src/lib/api.ts');
type Seen = { method: string; path: string; auth: string | null; body: unknown };
type Reply = { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>;

const store = ((globalThis as { __asyncStore?: Map<string, string> }).__asyncStore ??= new Map<string, string>());
const USER = { id: 'u-1', name: 'Ali', coins: 0, diamonds: 0, gameCoins: 0, createdAt: '2026-01-01' };

let seen: Seen[] = [];
let route: (s: Seen) => Reply = () => ({ status: 404, body: { error: 'yok' } });
let fresh = 0;
/** A new copy of lib/api (its session lives in the module), as on a new app start. */
const startApp = async (): Promise<Api> => import(`../src/lib/api.ts?start=${++fresh}`);
const roomPasswords = () => import('@/lib/live/room-password');

const realFetch = globalThis.fetch;
beforeEach(() => {
  store.clear();
  store.set('similarclub:device-key', 'device-key-1');
  seen = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const s: Seen = { method: init?.method ?? 'GET', path: url.pathname + url.search, auth: headers.Authorization ?? null, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    seen.push(s);
    const r = await route(s);
    if (r.status === -1) throw new TypeError('network down');
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** A server that knows `sessions` and signs this device in as `next`. */
const server = (sessions: Set<string>, next: string) => (s: Seen): Reply => {
  if (s.path === '/api/auth/dev') {
    sessions.add(next);
    return { body: { session: next, user: USER } };
  }
  if (!s.auth || !sessions.has(s.auth.replace('Bearer ', ''))) return { status: 401, body: { error: 'Giriş gerekli' } };
  if (s.path === '/api/me') return { body: { user: USER } };
  if (s.path === '/api/rooms') return { body: { rooms: [] } };
  return { body: {} };
};

describe('Soğuk açılış: kayıtlı oturum', () => {
  test('ilk istek kayıtlı oturumla gider (oda bağlantısı giriş beklemeden açılır)', async () => {
    store.set('similarclub:api-session', 'S1');
    route = server(new Set(['S1']), 'S-new');
    const api = await startApp();
    assert.deepEqual(await api.serverRooms(), []);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].auth, 'Bearer S1');
  });

  test('giriş sürerken yapılan istek girişi bekler ve yeni oturumla gider', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const sessions = new Set<string>();
    const base = server(sessions, 'S2');
    route = async (s) => {
      if (s.path === '/api/auth/dev') await gate;
      return base(s);
    };
    const api = await startApp();
    const signing = api.ensureSignedIn('Ali');
    const rooms = api.serverRooms();
    await new Promise((r) => setTimeout(r, 10));
    release();
    await signing;
    assert.deepEqual(await rooms, []);
    const roomCalls = seen.filter((s) => s.path === '/api/rooms');
    assert.equal(roomCalls.length, 1, 'tek istek, 401 yok');
    assert.equal(roomCalls[0].auth, 'Bearer S2');
  });

  test('oturumsuz giden ve 401 alan istek, giriş bitince bir kez yeniden gönderilir', async () => {
    const sessions = new Set<string>();
    const base = server(sessions, 'S3');
    let releaseRooms!: () => void;
    const roomsGate = new Promise<void>((r) => (releaseRooms = r));
    let firstRooms = true;
    route = async (s) => {
      if (s.path === '/api/rooms' && firstRooms) {
        firstRooms = false;
        await roomsGate;
      }
      return base(s);
    };
    const api = await startApp();
    const rooms = api.serverRooms(); // goes out before any sign-in started
    await new Promise((r) => setTimeout(r, 10));
    await api.ensureSignedIn('Ali');
    releaseRooms();
    assert.deepEqual(await rooms, []);
    const roomCalls = seen.filter((s) => s.path === '/api/rooms');
    assert.deepEqual(
      roomCalls.map((s) => s.auth),
      [null, 'Bearer S3'],
    );
  });

  test('ilk giriş ağ yüzünden olmadıysa, sonraki 401 bir kez kendisi giriş yapar', async () => {
    const sessions = new Set<string>();
    const base = server(sessions, 'S4');
    let online = false;
    route = (s) => (online ? base(s) : { status: -1 });
    const api = await startApp();
    await assert.rejects(api.ensureSignedIn('Ali'));
    online = true;
    assert.deepEqual(await api.serverRooms(), []);
    assert.deepEqual(
      seen.filter((s) => s.path !== '/api/auth/dev' || online).map((s) => `${s.path} ${s.auth ?? '-'}`).slice(-3),
      ['/api/rooms -', '/api/auth/dev -', '/api/rooms Bearer S4'],
    );
  });

  test('çıkıştan sonra kimse sessizce yeniden giriş yapmaz', async () => {
    store.set('similarclub:api-session', 'S5');
    route = server(new Set(['S5']), 'S-silent');
    const api = await startApp();
    await api.ensureSignedIn('Ali');
    await api.logout();
    seen = [];
    await assert.rejects(api.serverRooms(), (e: Error & { status?: number }) => e.status === 401);
    assert.equal(
      seen.some((s) => s.path === '/api/auth/dev'),
      false,
    );
  });

  test('başarılı giriş dinleyenlere haber verir (yaptırımlar yeniden sorulur)', async () => {
    route = server(new Set(), 'S6');
    const api = await startApp();
    let heard = 0;
    const stop = api.onSignedIn(() => heard++);
    await api.ensureSignedIn('Ali');
    stop();
    await api.ensureSignedIn('Ali');
    assert.equal(heard, 1);
  });
});

describe('Şifreli oda', () => {
  test('ses anahtarı yazılan şifreyle istenir; yanlışsa şifre unutulur', async () => {
    store.set('similarclub:api-session', 'S7');
    route = (s) =>
      s.path.startsWith('/token')
        ? new URL(`http://x${s.path}`).searchParams.get('password') === 'dogru1'
          ? { body: { token: 'tok' } }
          : { status: 403, body: { error: 'Oda şifresi yanlış' } }
        : { body: {} };
    const api = await startApp();
    const pw = await roomPasswords();
    const id = '11111111-2222-3333-4444-555555555555';

    pw.setRoomPassword(id, 'yanlis');
    await assert.rejects(api.voiceToken(`oda-${id}`), (e: Error & { status?: number }) => e.status === 403 && e.message === 'Oda şifresi yanlış');
    assert.equal(pw.roomPassword(id), undefined, 'yanlış şifre bir dahaki girişte yeniden sorulur');
    assert.match(seen.at(-1)!.path, /&password=yanlis$/);

    pw.setRoomPassword(id, 'dogru1');
    assert.equal(await api.voiceToken(`oda-${id}`), 'tok');
    assert.equal(pw.roomPassword(id), 'dogru1');

    pw.forgetRoomPasswords();
    await api.voiceToken(`oda-${id}`).catch(() => {});
    assert.equal(seen.at(-1)!.path, `/token?room=oda-${id}`, 'şifresiz odada şifre gönderilmez');
  });

  test('oda açarken şifre yalnızca verildiyse gider', async () => {
    store.set('similarclub:api-session', 'S8');
    const room = { id: 'r', owner: { id: 'u-1', name: 'Ali', avatarUrl: null }, title: 'Gece', announcement: '', roomType: 'free', hasPassword: false, createdAt: '', closed: false, listeners: 0 };
    route = () => ({ body: { room } });
    const api = await startApp();
    await api.createRoom('Gece', '', 'music');
    await api.createRoom('Gece', 'Merhaba', 'free', 'gizli12');
    assert.deepEqual(seen[0].body, { title: 'Gece', announcement: '', roomType: 'music' });
    assert.deepEqual(seen[1].body, { title: 'Gece', announcement: 'Merhaba', roomType: 'free', password: 'gizli12' });
  });
});
