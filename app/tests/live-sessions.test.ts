/// <reference types="node" />
// Live mode, Ayarlar › Aktif oturumlar (lib/live/sessions): the list is the account's real sessions from
// GET /api/sessions with this phone first and marked, and Sonlandır ends a session on the server
// (POST /api/sessions/revoke) before the list is read again (giris-5, mantik-9, gorsel-7). The phone's storage is a
// stand-in (tests/api-stub-hooks.mjs); fetch is a fake server. "Now" is fixed.
import { register } from 'node:module';
import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

register('./api-stub-hooks.mjs', import.meta.url);
process.env.EXPO_PUBLIC_API_URL = 'http://api.test';

type Seen = { method: string; path: string; headers: Record<string, string>; body: unknown };
type Session = { id: string; device: string; createdAt: string; lastSeenAt: string; current: boolean };

const store = ((globalThis as { __asyncStore?: Map<string, string> }).__asyncStore ??= new Map<string, string>());
/** 6 Kasım 2026 12:00 UTC. */
const NOW = Date.parse('2026-11-06T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

let seen: Seen[] = [];
let server: Session[] = [];
const realFetch = globalThis.fetch;
beforeEach(() => {
  store.clear();
  store.set('similarclub:device-key', 'device-key-1');
  store.set('similarclub:api-session', 'S1');
  seen = [];
  server = [
    { id: 'aaaa000000000001', device: '', createdAt: '2026-10-20T08:00:00.000Z', lastSeenAt: ago(3 * 60 * MIN), current: false },
    { id: 'aaaa000000000002', device: 'Pixel 8', createdAt: '2026-11-01T08:00:00.000Z', lastSeenAt: ago(0), current: true },
    { id: 'aaaa000000000003', device: 'Chrome · Windows', createdAt: '2025-12-30T08:00:00.000Z', lastSeenAt: ago(25 * MIN), current: false },
  ];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const raw = init?.body;
    const s: Seen = { method: init?.method ?? 'GET', path: url.pathname, headers: (init?.headers ?? {}) as Record<string, string>, body: typeof raw === 'string' ? JSON.parse(raw) : raw };
    seen.push(s);
    if (s.method === 'GET' && s.path === '/api/sessions') return new Response(JSON.stringify({ sessions: server }), { status: 200 });
    if (s.method === 'POST' && s.path === '/api/sessions/revoke') {
      const id = (s.body as { id: string }).id;
      const had = server.some((x) => x.id === id);
      server = server.filter((x) => x.id !== id);
      return new Response(JSON.stringify({ revoked: had }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'yok' }), { status: 404 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const sessions = () => import('@/lib/live/sessions');

describe('Aktif oturumlar sunucudan', () => {
  test('son kullanım: az önce, dakika, saat, gün, sonra tarih', async () => {
    const { agoText } = await sessions();
    assert.equal(agoText(ago(30_000), NOW), 'Az önce');
    assert.equal(agoText(ago(12 * MIN), NOW), '12 dk önce');
    assert.equal(agoText(ago(3 * 60 * MIN), NOW), '3 saat önce');
    assert.equal(agoText(ago(2 * 24 * 60 * MIN), NOW), '2 gün önce');
    assert.equal(agoText('2026-10-03T12:00:00.000Z', NOW), '3 Eki');
    assert.equal(agoText('2025-03-03T12:00:00.000Z', NOW), '3 Mar 2025');
    assert.equal(agoText('bozuk', NOW), '');
  });

  test('bu cihaz önce ve işaretli, diğerleri son kullanıma göre; adı olmayan cihaz bunu söyler', async () => {
    const { sessionRows } = await sessions();
    const rows = sessionRows(server, NOW);
    assert.deepEqual(
      rows.map((r) => [r.id, r.title, r.current, r.web]),
      [
        ['aaaa000000000002', 'Bu cihaz · Pixel 8', true, false],
        ['aaaa000000000003', 'Chrome · Windows', false, true],
        ['aaaa000000000001', 'Başka bir cihaz', false, false],
      ],
    );
    assert.equal(rows[0].subtitle, 'Şu an aktif · Giriş 1 Kas');
    assert.equal(rows[1].subtitle, 'Son kullanım 25 dk önce · Giriş 30 Ara 2025');
    assert.equal(rows[2].subtitle, 'Son kullanım 3 saat önce · Giriş 20 Eki');
    // Nothing of the demo list (an SMS line, a made-up phone model) is in a live row.
    assert.doesNotMatch(JSON.stringify(rows), /SMS|iPhone|Samsung/);
  });

  test('liste GET /api/sessions ile oturumun anahtarıyla okunur', async () => {
    const { loadSessions } = await sessions();
    const rows = await loadSessions(NOW);
    assert.equal(rows.length, 3);
    const get = seen.filter((s) => s.path === '/api/sessions');
    assert.equal(get.length, 1);
    assert.equal(get[0].method, 'GET');
    assert.equal(get[0].headers.Authorization, 'Bearer S1');
  });

  test('Sonlandır sunucuda POST /api/sessions/revoke {id} gönderir, sonra liste yeniden okunur', async () => {
    const { revokeAndReload } = await sessions();
    const rows = await revokeAndReload('aaaa000000000003', NOW);
    assert.deepEqual(
      seen.map((s) => `${s.method} ${s.path}`),
      ['POST /api/sessions/revoke', 'GET /api/sessions'],
    );
    assert.deepEqual(seen[0].body, { id: 'aaaa000000000003' });
    assert.deepEqual(
      rows.map((r) => r.id),
      ['aaaa000000000002', 'aaaa000000000001'],
    );
  });

  test('zaten bitmiş oturum hata vermeden listeden düşer', async () => {
    const { revokeAndReload } = await sessions();
    server = server.filter((x) => x.id !== 'aaaa000000000001');
    const rows = await revokeAndReload('aaaa000000000001', NOW);
    assert.deepEqual(
      rows.map((r) => r.id),
      ['aaaa000000000002', 'aaaa000000000003'],
    );
  });
});
