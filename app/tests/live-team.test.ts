/// <reference types="node" />
// Live mode, Similar Ekibi and the Odalar banners (lib/live/team): the inbox pages by the last id shown, opening it
// marks the newest seen, and an admin's notice puts its picture in the storage first (kind notice) and sends only the
// fields that were filled in. The kinds are the server's (server/api/team.mjs, migration 031). The phone's storage
// is a stand-in (tests/api-stub-hooks.mjs); fetch is a fake server and a fake photo storage.
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
const NOTICE = { id: '41', kind: 'event', title: 'Hafta sonu PK turnuvası', body: '', imageUrl: null, link: '/siralama', personal: false, createdAt: '2026-11-07T10:00:00.000Z' };

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

const team = () => import('@/lib/live/team');
const PHOTO = new Blob([new Uint8Array(2048)], { type: 'image/jpeg' });
const TARGET = { uploadUrl: 'https://storage.test/notice/abc.jpg?sig=1', method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, publicUrl: 'https://cdn.test/notice/u/abc.jpg', expiresIn: 300 };

describe('Similar Ekibi sunucudan', () => {
  test('sayfalar son gösterilen kimlikten öncesini ister; açınca en yenisi görüldü olur', async () => {
    const { markTeamSeen, teamPage, teamUnread } = await team();
    route = (s) => (s.path.startsWith('/api/team/seen') ? { body: { unread: 0 } } : s.path === '/api/team/unread' ? { body: { unread: 3 } } : { body: { notices: [NOTICE], unread: 1 } });
    assert.equal((await teamPage()).notices[0].id, '41');
    await teamPage('41');
    assert.equal(await teamUnread(), 3);
    assert.equal(await markTeamSeen('41'), 0);
    assert.deepEqual(
      seen.map((s) => `${s.method} ${s.path}`),
      ['GET /api/team', 'GET /api/team?before=41', 'GET /api/team/unread', 'POST /api/team/seen'],
    );
    assert.deepEqual(seen[3].body, { upTo: '41' });
  });

  test('görselli duyuru: önce görsel yüklenir (tür notice), sonra yalnız doldurulan alanlar gider', async () => {
    const { sendTeamNotice } = await team();
    route = (s) =>
      s.url === 'file:///kapak.jpg' ? { blob: PHOTO } : s.path === '/api/media/upload-url' ? { body: TARGET } : s.url === TARGET.uploadUrl ? { status: 200 } : { body: { notice: { ...NOTICE, imageUrl: TARGET.publicUrl } } };
    const n = await sendTeamNotice({ kind: 'event', title: '  Hafta sonu PK turnuvası ', body: ' Cumartesi 21:00 ', link: ' ', target: '', bannerDays: 3, image: { uri: 'file:///kapak.jpg', mimeType: 'image/jpeg' } });
    assert.equal(n.imageUrl, TARGET.publicUrl);
    assert.deepEqual(
      seen.map((s) => `${s.method} ${s.url}`),
      ['GET file:///kapak.jpg', 'POST http://api.test/api/media/upload-url', `PUT ${TARGET.uploadUrl}`, 'POST http://api.test/api/admin/team'],
    );
    assert.equal((seen[1].body as { kind: string }).kind, 'notice');
    assert.deepEqual(seen[3].body, { kind: 'event', title: 'Hafta sonu PK turnuvası', body: 'Cumartesi 21:00', imageUrl: TARGET.publicUrl, bannerDays: 3 });
  });

  test('kişiye özel duyuru banner taşımaz; kaldırma kimlikle gider', async () => {
    const { removeTeamNotice, sendTeamNotice } = await team();
    route = (s) => (s.path === '/api/admin/team/remove' ? { body: { removed: true } } : { body: { notice: { ...NOTICE, personal: true } } });
    await sendTeamNotice({ kind: 'reward', title: 'Ödülün yüklendi', body: '', target: 'aaaaaaaa-0000-4000-8000-000000000002', bannerDays: 0, image: null });
    await removeTeamNotice('41');
    assert.deepEqual(seen[0].body, { kind: 'reward', title: 'Ödülün yüklendi', body: '', target: 'aaaaaaaa-0000-4000-8000-000000000002' });
    assert.deepEqual(seen[1].body, { id: '41' });
  });

  test('duyuru türleri sunucuyla ve tabloyla aynı', async () => {
    const { TEAM_KINDS, TEAM_KIND_LABEL } = await team();
    const root = path.resolve(import.meta.dirname, '../../server/api');
    const server = fs.readFileSync(path.join(root, 'team.mjs'), 'utf8');
    const kinds = /export const KINDS = \[([^\]]+)\]/.exec(server)?.[1].match(/'([a-z]+)'/g)?.map((k) => k.slice(1, -1));
    assert.deepEqual(kinds, TEAM_KINDS);
    const table = fs.readFileSync(path.join(root, 'migrations/031_team_notices.sql'), 'utf8');
    for (const k of TEAM_KINDS) {
      assert.match(table, new RegExp(`'${k}'`), k);
      assert.ok(TEAM_KIND_LABEL[k], k);
    }
  });
});
