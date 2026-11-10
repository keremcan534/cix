/// <reference types="node" />
// Oda Süslemesi and Oda Kapağı (lib/room-decor): the demo keeps a room's decoration by the server's rules (what
// shows, what it falls back to, what a change costs), the pictures are cut to the sizes the screens name, and the
// app's catalogs and admin texts match the server's (server/api/catalog.mjs, live-registry.mjs).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOM_BACKGROUNDS, ROOM_BG_CUSTOM, ROOM_BG_PAID, ROOM_BG_SIZE, ROOM_COVER_SIZE } from '@/data/catalog';
import { DECOR_LABEL, DECOR_NUMBER_KEYS, bigChange, valueText } from '@/lib/live-settings-format';
import {
  DEMO_DECOR,
  DEMO_ROOM_COVER,
  backgroundName,
  cropRect,
  daysLeft,
  demoBackground,
  demoBuy,
  demoDecorOf,
  demoDecorView,
  demoPick,
  demoPickFree,
  demoRemoveCustom,
  demoSetCustom,
  uploadedDemoCover,
  type DemoChange,
  type DemoDecor,
} from '@/lib/room-decor';
// Plain JavaScript modules of the server; TypeScript reads them through allowJs.
import * as catalog from '../../server/api/catalog.mjs';
import * as registry from '../../server/api/live-registry.mjs';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-10T12:00:00Z');
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const done = (c: DemoChange): { decor: DemoDecor; price: number } => {
  assert.ok(c.ok, c.ok ? '' : c.error);
  return c;
};
const refused = (c: DemoChange, re: RegExp) => {
  assert.equal(c.ok, false);
  if (!c.ok) assert.match(c.error, re);
};

describe('Oda süslemesi: demo odası sunucunun kurallarıyla', () => {
  test('ücretsiz süsleme oda seviyesiyle açılır; seçilen, odanın döneceği süslemedir', () => {
    assert.deepEqual(demoBackground(DEMO_DECOR, NOW), { kind: 'free', id: null, url: null, until: null });
    refused(demoPickFree(DEMO_DECOR, 'bg4', 6), /Lv\.7/);
    refused(demoPickFree(DEMO_DECOR, 'yok', 15), /Geçersiz/);
    const d = done(demoPickFree(DEMO_DECOR, 'bg3', 4));
    assert.deepEqual([d.price, d.decor.bgId, demoBackground(d.decor, NOW).id], [0, 'bg3', 'bg3']);
    assert.equal(done(demoPickFree(d.decor, null, 1)).decor.bgId, null, 'tema görünümüne dönülür');
  });

  test('özel görsel: 5.000 jeton ve 30 gün; süre içinde ücretsiz değişir, günde en fazla 10 kez; kaldırılınca süre işler', () => {
    const bought = done(demoSetCustom({ ...DEMO_DECOR, bgId: 'bg1' }, 'file:///a.jpg', NOW));
    assert.equal(bought.price, ROOM_BG_CUSTOM.price);
    assert.deepEqual(demoBackground(bought.decor, NOW), { kind: 'custom', id: null, url: 'file:///a.jpg', until: new Date(NOW + 30 * DAY).toISOString() });
    let d = bought.decor;
    for (let i = 0; i < ROOM_BG_CUSTOM.changesPerDay; i++) {
      const c = done(demoSetCustom(d, `file:///b${i}.jpg`, NOW + 1000));
      assert.equal(c.price, 0, 'süre içinde yeniden ödenmez');
      d = c.decor;
    }
    refused(demoSetCustom(d, 'file:///c.jpg', NOW + 2000), /en fazla 10 kez/);
    assert.equal(done(demoSetCustom(d, 'file:///c.jpg', NOW + DAY)).price, 0, 'ertesi gün yeniden değiştirilir');
    // Another background over it, and back to the picture without paying.
    const free = done(demoPickFree(d, 'bg1', 4)).decor;
    assert.equal(demoBackground(free, NOW).kind, 'free');
    assert.equal(demoBackground(done(demoPick(free, 'custom', NOW)).decor, NOW).kind, 'custom');
    // Removed: the room is on its free background, the term still runs, a new picture is free.
    const removed = done(demoRemoveCustom(d)).decor;
    assert.deepEqual(demoBackground(removed, NOW), { kind: 'free', id: 'bg1', url: null, until: null });
    refused(demoPick(removed, 'custom', NOW), /yok ya da süresi doldu/);
    assert.equal(done(demoSetCustom(removed, 'file:///d.jpg', NOW + DAY)).price, 0);
    // The term over: not shown any more (the room's last free background), and a new picture is a new purchase.
    const later = NOW + 31 * DAY;
    assert.deepEqual(demoBackground(bought.decor, later), { kind: 'free', id: 'bg1', url: null, until: null });
    assert.equal(done(demoSetCustom(bought.decor, 'file:///e.jpg', later)).price, ROOM_BG_CUSTOM.price);
  });

  test('ücretli süsleme: süresi boyunca sahibinin; yeniden alınca süre eklenir; bitince ücretsize dönülür', () => {
    const item = ROOM_BG_PAID[0];
    refused(demoPick(DEMO_DECOR, item.id, NOW), /sende yok/);
    refused(demoBuy(DEMO_DECOR, 'rb-yok', NOW), /Geçersiz/);
    const b = done(demoBuy({ ...DEMO_DECOR, bgId: 'bg2' }, item.id, NOW));
    assert.equal(b.price, item.price);
    assert.deepEqual(demoBackground(b.decor, NOW), { kind: 'paid', id: item.id, url: null, until: new Date(NOW + item.days * DAY).toISOString() });
    const again = done(demoBuy(b.decor, item.id, NOW + DAY));
    assert.equal(again.decor.owned[item.id], NOW + 2 * item.days * DAY, 'kalan süreye eklenir');
    assert.deepEqual(demoBackground(b.decor, NOW + (item.days + 1) * DAY), { kind: 'free', id: 'bg2', url: null, until: null });
    refused(demoPick(b.decor, item.id, NOW + (item.days + 1) * DAY), /süresi doldu/);
  });

  test('ayar ekranına sunucunun verdiği biçimde gider', () => {
    const d = done(demoSetCustom(done(demoBuy(DEMO_DECOR, 'rb-neon', NOW)).decor, 'file:///a.jpg', NOW)).decor;
    const v = demoDecorView(d, { level: 4, uploadedCover: null, now: NOW });
    assert.deepEqual([v.canEdit, v.owner, v.level, v.pick, v.showing.kind], [true, true, 4, 'custom', 'custom']);
    assert.deepEqual(v.free.map((f) => [f.id, f.open]), [['bg1', true], ['bg2', true], ['bg3', true], ['bg4', false]]);
    assert.deepEqual(v.paid.items.map((p) => [p.sku, !!p.until]), ROOM_BG_PAID.map((p) => [p.id, p.id === 'rb-neon']));
    assert.deepEqual(v.custom, { on: true, price: 5_000, days: 30, until: new Date(NOW + 30 * DAY).toISOString(), url: 'file:///a.jpg', changesLeft: 10, removed: false });
    assert.equal(v.cover.url, null);
    assert.equal(demoDecorView(d, { level: 4, uploadedCover: 'file:///k.jpg', now: NOW }).cover.url, 'file:///k.jpg');
    const over = demoDecorView(d, { level: 4, uploadedCover: null, now: NOW + 40 * DAY });
    assert.deepEqual([over.custom.until, over.custom.url, over.showing.kind, over.paid.items.some((p) => p.until)], [null, null, 'free', false]);
  });

  test('kayıttan gelen bozuk ya da eski süsleme güvenli hâle gelir', () => {
    assert.deepEqual(demoDecorOf(undefined), DEMO_DECOR);
    assert.deepEqual(demoDecorOf('x'), DEMO_DECOR);
    assert.deepEqual(demoDecorOf({ bgId: 'bg9', pick: 'rb-eski', owned: { 'rb-eski': 5, 'rb-neon': 'x', 'rb-salon': 7 }, custom: { uri: 3, until: 'yarın' } }), { bgId: null, pick: null, owned: { 'rb-salon': 7 }, custom: null });
    assert.deepEqual(demoDecorOf({ bgId: 'bg2', pick: 'custom', owned: [], custom: { uri: 'file:///a.jpg', until: 9, changes: 2.7, day: '2026-11-10' } }), {
      bgId: 'bg2',
      pick: 'custom',
      owned: {},
      custom: { uri: 'file:///a.jpg', until: 9, changes: 2, day: '2026-11-10' },
    });
  });

  test('demo kapağı: yüklenen görsel kapaktır, örnek resim değildir', () => {
    assert.equal(uploadedDemoCover(DEMO_ROOM_COVER), null);
    assert.equal(uploadedDemoCover('https://picsum.photos/seed/night/600/400'), null, 'eski seçicinin örnek resmi');
    assert.equal(uploadedDemoCover(''), null);
    assert.equal(uploadedDemoCover('file:///cache/kapak.jpg'), 'file:///cache/kapak.jpg');
  });
});

describe('Oda görselleri: adlar, kalan gün, kırpma', () => {
  test('odanın gösterdiği şeyin adı ve kalan günü', () => {
    assert.equal(backgroundName(null), 'Tema görünümü');
    assert.equal(backgroundName({ kind: 'free', id: null, url: null }), 'Tema görünümü');
    assert.equal(backgroundName({ kind: 'free', id: 'bg2', url: null }), 'Deniz Feneri');
    assert.equal(backgroundName({ kind: 'paid', id: 'rb-salon', url: null }), 'Altın Salon');
    assert.equal(backgroundName({ kind: 'paid', id: 'rb-yeni', url: null }), 'Süsleme', 'bu sürümün tanımadığı süsleme');
    assert.equal(backgroundName({ kind: 'custom', id: null, url: 'https://x/y.jpg' }), 'Özel görsel');
    assert.equal(daysLeft(new Date(NOW + 30 * DAY).toISOString(), NOW), 30);
    assert.equal(daysLeft(new Date(NOW + 29 * DAY + 1).toISOString(), NOW), 30, 'yukarı yuvarlanır');
    assert.equal(daysLeft(new Date(NOW + 1000).toISOString(), NOW), 1);
    assert.deepEqual([daysLeft(new Date(NOW).toISOString(), NOW), daysLeft(null, NOW), daysLeft('bozuk', NOW)], [0, 0, 0]);
  });

  test('görsel ortasından, sahnenin (1080 × 1920) ve listenin (800 × 800) biçimine kırpılır', () => {
    assert.deepEqual([ROOM_BG_SIZE, ROOM_COVER_SIZE], [{ width: 1080, height: 1920 }, { width: 800, height: 800 }]);
    // A 4000 × 3000 landscape photo: a 9:16 strip from its middle, a square from its middle.
    assert.deepEqual(cropRect(4000, 3000, ROOM_BG_SIZE), { originX: 1156, originY: 0, width: 1688, height: 3000 });
    assert.deepEqual(cropRect(4000, 3000, ROOM_COVER_SIZE), { originX: 500, originY: 0, width: 3000, height: 3000 });
    // A tall screenshot: the full width, the middle of its height.
    assert.deepEqual(cropRect(1080, 2400, ROOM_BG_SIZE), { originX: 0, originY: 240, width: 1080, height: 1920 });
    assert.deepEqual(cropRect(1080, 1920, ROOM_BG_SIZE), { originX: 0, originY: 0, width: 1080, height: 1920 }, 'zaten o biçimde');
    for (const [w, h] of [[4000, 3000], [3000, 4000], [1080, 2400], [500, 500], [333, 1000], [7, 5]]) {
      for (const size of [ROOM_BG_SIZE, ROOM_COVER_SIZE]) {
        const r = cropRect(w, h, size)!;
        assert.ok(r.originX >= 0 && r.originY >= 0 && r.originX + r.width <= w && r.originY + r.height <= h, `${w}×${h} içinde`);
        assert.ok(Math.abs(r.width / r.height - size.width / size.height) < 0.02 || Math.min(r.width, r.height) < 20, `${w}×${h} biçimi`);
      }
    }
    assert.equal(cropRect(0, 100, ROOM_BG_SIZE), null);
  });
});

describe('Oda süslemesi: uygulama ve sunucu aynı', () => {
  type ServerBg = { sku: string; kind: string; name: string; price: number; days: number; sale: boolean };
  const stage = readFileSync(resolve(SRC, 'components/room/stage-backdrop.tsx'), 'utf8');
  const art = new Map([...stage.slice(stage.indexOf('export const ROOM_BG_ART')).matchAll(/^ {2}'?([a-z0-9-]+)'?: require\('([^']+)'\)/gm)].map((m) => [m[1], m[2]]));

  test('ücretli süslemelerin adı, fiyatı ve süresi; ücretsizlerin her birinin görseli', () => {
    const server = [...(catalog.ROOM_BGS as Map<string, ServerBg>).values()];
    assert.deepEqual(server.map((x) => [x.sku, x.name, x.price, x.days]), ROOM_BG_PAID.map((b) => [b.id, b.name, b.price, b.days]));
    for (const b of ROOM_BACKGROUNDS) assert.ok(art.has(b.id), `${b.id} ${b.name}: sahne görseli yok`);
    for (const [id, file] of art) {
      assert.ok(existsSync(resolve(SRC, 'components/room', file)), `${id}: ${file}`);
      assert.ok(ROOM_BACKGROUNDS.some((b) => b.id === id) || ROOM_BG_PAID.some((b) => b.id === id), `${id} katalogda yok`);
    }
    assert.equal(new Set(art.values()).size, art.size, 'iki süsleme aynı görseli kullanmaz');
  });

  test('sunucu yalnızca görseli uygulamada olan ücretli süslemeyi satar', () => {
    for (const x of (catalog.ROOM_BGS as Map<string, ServerBg>).values()) if (x.sale) assert.ok(art.has(x.sku), `${x.sku} satışta ama görseli uygulamada yok`);
  });

  test('canlı ayarlar paneli: anahtarlar, adlar, ikinci onay ve değer yazıları', () => {
    assert.deepEqual(registry.DECOR_LABEL, DECOR_LABEL);
    assert.deepEqual(registry.REGISTRY.room_decor_off.bounds.options, Object.keys(DECOR_LABEL));
    assert.deepEqual(DECOR_NUMBER_KEYS.map((k) => k.key), ['room_bg_custom_price', 'room_bg_custom_days']);
    assert.deepEqual([registry.DEFAULTS.room_bg_custom_price, registry.DEFAULTS.room_bg_custom_days], [ROOM_BG_CUSTOM.price, ROOM_BG_CUSTOM.days]);
    for (const after of [100, 2_400, 2_500, 5_000, 10_000, 10_100, 100_000, null]) assert.equal(bigChange('room_bg_custom_price', 5_000, after), registry.isBig('room_bg_custom_price', 5_000, after), `5000 → ${after}`);
    for (const after of [1, 30, 90, null]) assert.equal(bigChange('room_bg_custom_days', 30, after), registry.isBig('room_bg_custom_days', 30, after));
    assert.equal(bigChange('room_decor_off', [], ['custom', 'paid']), registry.isBig('room_decor_off', [], ['custom', 'paid']));
    assert.equal(valueText('room_decor_off', []), 'Hepsi açık');
    assert.equal(valueText('room_decor_off', ['custom']), 'Kapalı: Özel süsleme (kendi görselini yükleme)');
    assert.equal(valueText('room_bg_custom_price', 5_000), '5.000 jeton');
    assert.equal(valueText('room_bg_custom_days', 30), '30 gün');
  });
});
