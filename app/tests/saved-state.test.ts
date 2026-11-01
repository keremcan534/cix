/// <reference types="node" />
// The device's saved state is checked before use (lib/saved-state): a broken or old save must never crash a
// launch. Bad fields fall back to their defaults; good ones are kept.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { entriesWhere, isFiniteNumber, itemsShaped, oneOf, pickValid, withDefaults, type Kind } from '@/lib/saved-state';
import { errorMessage, installCrashGuard, lastCaughtError, markStarted } from '@/lib/crash-guard';

const SPEC: Record<string, Kind> = { coins: 'number', loggedIn: 'boolean', inventory: 'strings', ledger: 'objects', weekly: 'numbers', agencyId: 'string?', owned: 'object?', settings: 'object' };

describe('Kayıtlı durum', () => {
  test('nesne olmayan kayıt hiç kullanılmaz', () => {
    for (const raw of [null, undefined, 42, 'x', [1, 2], true]) assert.equal(pickValid(raw, SPEC), null);
  });

  test('yanlış türdeki alan düşer, doğrusu kalır', () => {
    const s = pickValid<Record<string, unknown>>({ coins: '250', loggedIn: true, inventory: 'a', settings: [], agencyId: 5, owned: null }, SPEC)!;
    assert.deepEqual(s, { loggedIn: true, owned: null });
  });

  test('sonsuz ve NaN sayı kabul edilmez', () => {
    assert.deepEqual(pickValid({ coins: Infinity }, SPEC), {});
    assert.deepEqual(pickValid({ coins: NaN }, SPEC), {});
    assert.deepEqual(pickValid({ weekly: [1, NaN] }, SPEC), {});
  });

  test('listelerde bozuk öğe atılır, sağlamlar kalır', () => {
    const s = pickValid<Record<string, unknown>>({ inventory: ['a', 3, null, 'b'], ledger: [{ id: 1 }, 'x', null, [], { id: 2 }] }, SPEC)!;
    assert.deepEqual(s.inventory, ['a', 'b']);
    assert.deepEqual(s.ledger, [{ id: 1 }, { id: 2 }]);
  });

  test('bilinmeyen alanlar alınmaz', () => {
    assert.deepEqual(pickValid({ hacked: true, coins: 1 }, SPEC), { coins: 1 });
  });
});

describe('Kayıtlı liste satırları ve seçimler', () => {
  test('alanı eksik ya da türü yanlış satır atılır; fazladan alanlar korunur', () => {
    const rows = [{ id: 'n1', title: 'a', read: false, href: '/x' }, { id: 'n2' }, null, 'x', { id: 'n3', title: 5, read: true }, { id: 'n4', title: 'b', read: true }];
    assert.deepEqual(
      itemsShaped(rows, { id: 'string', title: 'string', read: 'boolean' }).map((r) => (r as { id: string }).id),
      ['n1', 'n4'],
    );
    assert.equal((itemsShaped(rows, { id: 'string', title: 'string', read: 'boolean' })[0] as { href: string }).href, '/x');
  });

  test('haritada değeri bozuk giriş atılır', () => {
    assert.deepEqual(entriesWhere({ r1: 5, r2: 'x', r3: NaN, r4: 7 }, isFiniteNumber), { r1: 5, r4: 7 });
  });

  test('sonraki sürümde adı değişen seçim tanınmaz (varsayılan kullanılır)', () => {
    const ROLES = ['owner', 'assistant', 'member'] as const;
    assert.equal(oneOf('assistant', ROLES), 'assistant');
    assert.equal(oneOf('boss', ROLES), undefined);
    assert.equal(oneOf(3, ROLES), undefined);
  });
});

describe('Varsayılanlarla birleştirme', () => {
  const DEFAULTS = { haptics: true, musicVolume: 0.7, dmFrom: 'everyone', notifyTypes: { live: true }, layoutId: null as string | null, memberIds: ['u1'] };

  test('eski kayıtta olmayan ayar varsayılanını alır', () => {
    assert.deepEqual(withDefaults(DEFAULTS, { haptics: false }), { ...DEFAULTS, haptics: false });
  });

  test('türü tutmayan değer yerine varsayılan kalır', () => {
    const merged = withDefaults(DEFAULTS, { haptics: 'no', musicVolume: NaN, dmFrom: 3, notifyTypes: [], memberIds: 'u2' });
    assert.deepEqual(merged, DEFAULTS);
  });

  test('null varsayılan dizi dışında her şeyi kabul eder; isteğe bağlı alanlar korunur', () => {
    assert.equal(withDefaults(DEFAULTS, { layoutId: 'grid-9' }).layoutId, 'grid-9');
    assert.equal(withDefaults(DEFAULTS, { layoutId: ['x'] }).layoutId, null);
    assert.equal((withDefaults(DEFAULTS, { photos: ['p1'] }) as Record<string, unknown>).photos?.toString(), 'p1');
  });

  test('görev sayaçları: yeni sayaç eski kayıtta yoksa 0 başlar (NaN olmaz)', () => {
    const stats = withDefaults({ roomMinutes: 0, giftsSent: 0, calls: 0 }, { roomMinutes: 12, giftsSent: 3 });
    assert.equal(stats.calls + 1, 1);
    assert.equal(stats.roomMinutes, 12);
  });

  test('kayıt nesne değilse varsayılanların kopyası döner', () => {
    const merged = withDefaults(DEFAULTS, 'bozuk');
    assert.deepEqual(merged, DEFAULTS);
    assert.notEqual(merged, DEFAULTS);
  });
});

describe('Hata yakalayıcı', () => {
  test('ilk ekrandan önce hatayı React Native işler; sonra uygulama kapanmaz', () => {
    const seen: unknown[] = [];
    let handler: (e: unknown, fatal?: boolean) => void = (e) => seen.push(e);
    const g = globalThis as { ErrorUtils?: unknown };
    g.ErrorUtils = { getGlobalHandler: () => handler, setGlobalHandler: (h: typeof handler) => (handler = h) };
    const quiet = console.error;
    console.error = () => {};
    try {
      installCrashGuard(false);
      handler(new Error('erken'), true);
      assert.equal(seen.length, 1, 'açılıştan önceki hata eski işleyiciye gider');
      markStarted();
      handler(new Error('zamanlayıcıda hata'), true);
      assert.equal(seen.length, 1, 'açıldıktan sonra uygulamayı kapatan işleyici çağrılmaz');
      assert.equal(lastCaughtError()?.message, 'zamanlayıcıda hata');
    } finally {
      console.error = quiet;
      delete g.ErrorUtils;
    }
  });

  test('hata mesajı her türden okunur', () => {
    assert.equal(errorMessage(new Error('a')), 'a');
    assert.equal(errorMessage('b'), 'b');
    assert.equal(errorMessage({}), 'Bilinmeyen hata');
  });
});
