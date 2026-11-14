/// <reference types="node" />
// Entry banners in a room (lib/entry-queue): one at a time in arrival order, each entrance once, a person's own
// banner ahead of the joint one it belongs to, and no more than three waiting.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { ENTRY_WAITING_MAX, emptyEntryLine, pushEntry, shiftEntry, type EntryItem, type EntryLine } from '@/lib/entry-queue';

const solo = (uid: string, at = 1): EntryItem<string> => ({ id: `in:${uid}:${at}`, who: [uid], show: uid });
const pair = (a: string, b: string): EntryItem<string> => ({ id: `bond:${a}|${b}`, who: [a, b], show: `${a}&${b}` });
const order = (l: EntryLine<string>) => [l.now?.show ?? null, ...l.next.map((x) => x.show)];

describe('Giriş efektleri sırası', () => {
  test('boşken hemen oynar, sonra gelenler sırayla bekler', () => {
    let l = pushEntry(emptyEntryLine<string>(), solo('ali'));
    assert.deepEqual(order(l), ['ali']);
    l = pushEntry(l, solo('ece'));
    l = pushEntry(l, solo('can'));
    assert.deepEqual(order(l), ['ali', 'ece', 'can']);
    l = shiftEntry(l);
    assert.deepEqual(order(l), ['ece', 'can']);
    l = shiftEntry(shiftEntry(l));
    assert.deepEqual(order(l), [null]);
    assert.deepEqual(order(shiftEntry(l)), [null]);
  });

  test('aynı giriş iki kez eklenmez', () => {
    let l = pushEntry(emptyEntryLine(solo('ali')), solo('ece'));
    assert.equal(pushEntry(l, solo('ali')), l, 'oynayan');
    assert.equal(pushEntry(l, solo('ece')), l, 'bekleyen');
    l = pushEntry(l, solo('ece', 2));
    assert.deepEqual(order(l), ['ali', 'ece', 'ece'], 'yeniden giriş ayrı bir giriştir');
  });

  test('kişinin kendi girişi, onu içeren birlikte girişin önüne geçer', () => {
    let l = pushEntry(emptyEntryLine(solo('me')), solo('ali'));
    l = pushEntry(l, pair('ali', 'ece'));
    // Ece's own banner was read after the joint one was queued: it still plays first.
    l = pushEntry(l, solo('ece'));
    assert.deepEqual(order(l), ['me', 'ali', 'ece', 'ali&ece']);
    // Someone else's goes at the end.
    assert.deepEqual(order(pushEntry(shiftEntry(l), solo('can'))), ['ali', 'ece', 'ali&ece', 'can']);
    // A joint banner while nothing plays plays at once.
    assert.deepEqual(order(pushEntry(emptyEntryLine<string>(), pair('ali', 'ece'))), ['ali&ece']);
  });

  test(`en çok ${ENTRY_WAITING_MAX} bekler; fazlası en eskiden düşer`, () => {
    let l = emptyEntryLine(solo('me'));
    for (const u of ['a', 'b', 'c', 'd', 'e']) l = pushEntry(l, solo(u));
    assert.deepEqual(order(l), ['me', 'c', 'd', 'e']);
  });
});
