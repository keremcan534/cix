/// <reference types="node" />
// Big gift shows: every show points at a real gift, the most expensive gifts all have one, the stage
// numbers stay on the stage, and every part file is on the ChatGPT list (docs/BUYUK_HEDIYELER.md).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GIFT_SHOWS, giftShowOf, partFile, showFiles } from '@/data/gift-shows';
import { GIFTS } from '@/data/mock';

const doc = readFileSync(new URL('../../docs/BUYUK_HEDIYELER.md', import.meta.url), 'utf8');

describe('gift shows', () => {
  test('each show is a real catalog gift, once', () => {
    const ids = GIFT_SHOWS.map((s) => s.giftId);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.ok(GIFTS.some((g) => g.id === id), id);
  });

  test('the ten most expensive gifts all get a show', () => {
    const top = [...GIFTS].sort((a, b) => b.price - a.price).slice(0, 10);
    for (const g of top) assert.ok(giftShowOf(g.id), `${g.name} (${g.id})`);
  });

  test('parts stay on the stage and loops are sane', () => {
    for (const s of GIFT_SHOWS) {
      assert.ok(s.parts.length > 0, s.giftId);
      assert.ok(s.durationMs >= 4000 && s.durationMs <= 7000, s.giftId);
      assert.match(s.glow, /^#[0-9A-F]{6}$/i);
      for (const p of s.parts) {
        assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, `${s.giftId}/${p.part}`);
        assert.ok(p.size > 0 && p.size <= 1, `${s.giftId}/${p.part}`);
        if (p.pivot) assert.ok(Math.abs(p.pivot.x) <= 0.5 && Math.abs(p.pivot.y) <= 0.5, `${s.giftId}/${p.part}`);
        assert.match(p.part, /^[a-z-]+$/);
      }
    }
  });

  test('every part file is on the art list', () => {
    for (const s of GIFT_SHOWS) {
      for (const f of showFiles(s)) assert.ok(doc.includes(`\`${f}\``), f);
      assert.equal(partFile(s, 'x'), `${s.slug}-x.png`);
    }
  });
});
