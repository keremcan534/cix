/// <reference types="node" />
// The emoji panel (lib/emoji-panel, components/EmojiPanel): its tabs under Sabit and VIP (every sticker pack people
// bought stays reachable), the tab it opens on (the last one), and Favoriler (most used first). The phone's storage is
// an in-memory stand-in (tests/api-stub-hooks.mjs), so the saving and reading run as on a phone.
import { register } from 'node:module';
import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { ANIMATION_SEED } from '@/data/animations';
import { STICKER_PACKS } from '@/data/catalog';
import { isLive, isSentAnim, playRoomAnim, sendAnimation, simulateRemoteSend, subscribeRoom, type RoomAnimEvent } from '@/lib/animations';
import { stickerToken } from '@/lib/stickers';

register('./api-stub-hooks.mjs', import.meta.url);

type Panel = typeof import('../src/lib/emoji-panel.ts');
const store = ((globalThis as { __asyncStore?: Map<string, string> }).__asyncStore ??= new Map<string, string>());
const KEY = 'similarclub:emojiPanel:v1';
let fresh = 0;
/** A new copy of the module (its memory lives in it), as on a new app start; resolves once the saved memory is read. */
const startApp = async (): Promise<Panel> => {
  const m: Panel = await import(`../src/lib/emoji-panel.ts?start=${++fresh}`);
  await m.ready;
  return m;
};
/** The pure parts (no saved memory needed). */
const pure = () => startApp();
const saved = () => JSON.parse(store.get(KEY) ?? 'null');

beforeEach(() => store.clear());

describe('Emoji paneli: sekmeler', () => {
  test('sohbette: Sabit\'te Emoji ilk, sonra Favoriler; VIP\'te satılan paketler', async () => {
    const { panelTabs } = await pure();
    const tabs = panelTabs(false);
    assert.deepEqual(
      tabs.map((t) => `${t.kind}:${t.id}`),
      ['sabit:emoji', 'sabit:fav', 'vip:fun', 'vip:love', 'vip:animals', 'vip:vip', 'vip:anim', 'vip:voice', 'vip:tea', 'vip:feels', 'vip:party', 'vip:costume'],
    );
  });

  test('odada: Hareketli ücretsizi Sabit\'te, ücretlisi VIP\'te', async () => {
    const { panelTabs } = await pure();
    assert.deepEqual(
      panelTabs(true).map((t) => `${t.kind}:${t.id}`),
      ['sabit:emoji', 'sabit:fav', 'sabit:animated-free', 'vip:animated', 'vip:fun', 'vip:love', 'vip:animals', 'vip:vip', 'vip:anim', 'vip:voice', 'vip:tea', 'vip:feels', 'vip:party', 'vip:costume'],
    );
  });

  test('telefon klavyesi emojileri, Temel, Duygular, Müzik ve Hamle ayrı sekme değil; Emoji sekmesinin içinde', async () => {
    const { panelTabs, emojiTabPacks } = await pure();
    for (const room of [false, true]) {
      const ids = panelTabs(room).map((t) => t.id);
      for (const gone of ['basic', 'duygu', 'muzik', 'hamle', 'recent']) assert.ok(!ids.includes(gone), `${room ? 'oda' : 'sohbet'}: ${gone}`);
    }
    assert.deepEqual(emojiTabPacks(true).map((p) => p.id), ['duygu', 'muzik', 'hamle']);
    // Hamle acts on the room's mics: a chat's Emoji tab doesn't have it.
    assert.deepEqual(emojiTabPacks(false).map((p) => p.id), ['duygu', 'muzik']);
  });

  test('satın alınan ya da VIP ile açılan her paket VIP başlığında kalır', async () => {
    const { panelTabs, isVipPack } = await pure();
    const paid = STICKER_PACKS.filter(isVipPack);
    assert.ok(paid.length >= 5);
    for (const room of [false, true]) {
      const vip = panelTabs(room).filter((t) => t.kind === 'vip');
      for (const p of paid) assert.ok(vip.some((t) => t.id === p.id && t.pack === p), `${room ? 'oda' : 'sohbet'}: ${p.name}`);
    }
    // Everything a person can still pick is somewhere: a pack is either in Emoji, in a tab, or retired (Temel, free).
    for (const p of STICKER_PACKS) {
      const placed = ['duygu', 'muzik', 'hamle'].includes(p.id) || panelTabs(true).some((t) => t.id === p.id);
      assert.ok(placed || (p.retired && !isVipPack(p)), p.name);
    }
  });

  test('son sekmede açılır; bu panelde olmayan sekme Emoji\'de açar', async () => {
    const { openTab, panelTabs } = await pure();
    const room = panelTabs(true);
    const chat = panelTabs(false);
    assert.equal(openTab(null, room).id, 'emoji');
    assert.equal(openTab(undefined, chat).id, 'emoji');
    assert.deepEqual([openTab('love', chat).id, openTab('love', chat).kind], ['love', 'vip']);
    assert.equal(openTab('fav', room).id, 'fav');
    assert.equal(openTab('animated-free', room).id, 'animated-free');
    // A room's tab in a chat, a retired or unknown tab: the first one.
    assert.equal(openTab('animated-free', chat).id, 'emoji');
    assert.equal(openTab('basic', room).id, 'emoji');
    assert.equal(openTab('yok', room).id, 'emoji');
  });
});

describe('Emoji paneli: Favoriler', () => {
  const kahkaha = stickerToken('duygu-kahkaha');
  const dans = stickerToken('muzik-dans');
  const kalp = stickerToken('ask-kalp');

  test('en çok kullanılan önce; eşitse en son kullanılan önce', async () => {
    const { bumpUse, favourites, animKey } = await pure();
    let use = {};
    use = bumpUse(use, kahkaha, 1);
    use = bumpUse(use, dans, 2);
    use = bumpUse(use, kahkaha, 3);
    use = bumpUse(use, animKey('an-hearts'), 4);
    assert.deepEqual(use, { [kahkaha]: { n: 2, at: 3 }, [dans]: { n: 1, at: 2 }, 'anim:an-hearts': { n: 1, at: 4 } });
    assert.deepEqual(favourites(use, [], () => true), [kahkaha, 'anim:an-hearts', dans]);
    // Two more for the dance: now it leads.
    use = bumpUse(bumpUse(use, dans, 5), dans, 6);
    assert.deepEqual(favourites(use, [], () => true), [dans, kahkaha, 'anim:an-hearts']);
  });

  test('sayılmamış son kullanılanlar arkadan gelir; gönderilemeyen gösterilmez; en çok FAV_MAX', async () => {
    const { bumpUse, favourites, FAV_MAX } = await pure();
    const use = bumpUse({}, dans, 1);
    assert.deepEqual(favourites(use, [kahkaha, dans, kahkaha], () => true), [dans, kahkaha]);
    // A pack whose VIP ended (or a room's Hamle in a chat) is left out.
    assert.deepEqual(favourites(use, [kalp, kahkaha], (k) => k !== kalp), [dans, kahkaha]);
    const many = Array.from({ length: FAV_MAX + 10 }, (_, i) => stickerToken(`duygu-${i}`));
    assert.equal(favourites({}, many, () => true).length, FAV_MAX);
  });

  test('bellek dolunca en az kullanılan unutulur; yeni seçilen her zaman girer', async () => {
    const { bumpUse, USE_KEEP } = await pure();
    let use = {};
    for (let i = 0; i < USE_KEEP; i++) use = bumpUse(bumpUse(use, `k${i}`, i), `k${i}`, i);
    use = bumpUse(use, 'yeni', 1000);
    const keys = Object.keys(use);
    assert.equal(keys.length, USE_KEEP);
    assert.ok(keys.includes('yeni'));
    // The one left out: the oldest of those picked twice.
    assert.ok(!keys.includes('k0'));
  });

  test('Hareketli anahtarı çıkartmadan ayrılır', async () => {
    const { animKey, animIdOf } = await pure();
    assert.equal(animIdOf(animKey('an-clap')), 'an-clap');
    assert.equal(animIdOf(kahkaha), null);
  });
});

describe('Emoji paneli: telefonda kalan bellek', () => {
  test('son sekme ve seçimler kaydedilir, uygulama yeniden açılınca geri gelir', async () => {
    const a = await startApp();
    assert.equal(a.lastTab(), null);
    a.setLastTab('animated-free');
    a.notePick(stickerToken('duygu-alkis'), 10);
    a.notePick(stickerToken('duygu-alkis'), 20);
    assert.deepEqual(saved(), { tab: 'animated-free', use: { '⟦duygu-alkis⟧': { n: 2, at: 20 } } });

    const b = await startApp();
    assert.equal(b.lastTab(), 'animated-free');
    assert.deepEqual(b.pickCounts(), { '⟦duygu-alkis⟧': { n: 2, at: 20 } });
    assert.equal(b.openTab(b.lastTab(), b.panelTabs(true)).id, 'animated-free');
  });

  test('bozuk ya da eski kayıt açılışı bozmaz: yalnız doğru olanlar alınır', async () => {
    store.set(KEY, '{bozuk');
    const a = await startApp();
    assert.equal(a.lastTab(), null);
    assert.deepEqual(a.pickCounts(), {});

    store.set(KEY, '{"tab":42,"use":{"ok":{"n":3,"at":5},"sifir":{"n":0,"at":1},"kesir":{"n":1.5,"at":1},"yazi":{"n":"2","at":1},"liste":[1,2],"__proto__":{"n":1,"at":1}}}');
    const b = await startApp();
    assert.equal(b.lastTab(), null);
    assert.deepEqual(b.pickCounts(), { ok: { n: 3, at: 5 } });
  });

  test('kayıt okunmadan yapılan seçim kaybolmaz, kayıtlı olanla toplanır', async () => {
    store.set(KEY, JSON.stringify({ tab: 'love', use: { x: { n: 2, at: 5 } } }));
    let release = () => {};
    (globalThis as { __asyncDelay?: () => Promise<void> }).__asyncDelay = () => new Promise<void>((done) => (release = done));
    try {
      const m: Panel = await import(`../src/lib/emoji-panel.ts?start=${++fresh}`);
      m.notePick('x', 9);
      m.setLastTab('fav');
      release();
      await m.ready;
      assert.equal(m.lastTab(), 'fav');
      assert.deepEqual(m.pickCounts(), { x: { n: 3, at: 9 } });
      assert.deepEqual(saved(), { tab: 'fav', use: { x: { n: 3, at: 9 } } });
    } finally {
      delete (globalThis as { __asyncDelay?: unknown }).__asyncDelay;
    }
  });
});

describe('Hareketli: kişinin mikrofonunda', () => {
  const free = { spend: () => true, refund: () => {} };

  test('Hareketli sekmelerinin gönderdiği her şey koltukta da görünür; mikrofon efekti ve giriş gönderilmez', () => {
    const kinds = new Set(ANIMATION_SEED.filter(isSentAnim).map((a) => a.display_type));
    assert.deepEqual([...kinds].sort(), ['fullscreen', 'gift', 'reaction']);
    for (const a of ANIMATION_SEED.filter((x) => !isSentAnim(x))) assert.ok(a.display_type === 'mic_effect' || a.display_type === 'entry', a.name);
    // The free ones are in Sabit's Hareketli tab, the paid ones in VIP's; every one of them reaches the seat.
    assert.ok(ANIMATION_SEED.some((a) => isSentAnim(a) && a.is_free && isLive(a)));
    assert.ok(ANIMATION_SEED.some((a) => isSentAnim(a) && !a.is_free && isLive(a)));
  });

  test('benim, başka telefonun ve örnek odanın gönderdiği oda yayınına göndereniyle gelir (koltuk oradan çizer)', () => {
    const seen: RoomAnimEvent[] = [];
    const stop = subscribeRoom('oda-1', (e) => seen.push(e));
    try {
      const r = sendAnimation('an-hearts', 'oda-1', 'me', 'istek-1', free);
      assert.ok(r.ok);
      // Another phone's free one (room-bus 'anim') and a paid one the server announced ('fx') are played the same way.
      assert.ok(playRoomAnim('oda-1', 'u-2', 'an-clap', 'p:u-2:1'));
      assert.ok(playRoomAnim('oda-1', 'u-3', 'an-bouquet', 'fx:7'));
      simulateRemoteSend('oda-1', 'u-4', 'an-laugh');
      assert.deepEqual(
        seen.map((e) => [e.fromUserId, e.animationId]),
        [
          ['me', 'an-hearts'],
          ['u-2', 'an-clap'],
          ['u-3', 'an-bouquet'],
          ['u-4', 'an-laugh'],
        ],
      );
      // The same announcement twice (a reconnect) is drawn once.
      assert.equal(playRoomAnim('oda-1', 'u-3', 'an-bouquet', 'fx:7'), false);
      // A mic effect can't be sent at all.
      assert.equal(sendAnimation('an-mic-neon', 'oda-1', 'me', 'istek-2', free).ok, false);
    } finally {
      stop();
    }
  });
});
