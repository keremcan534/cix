/// <reference types="node" />
// Ajans ofisi (owners, 22 Nov 2026): no "Yayıncı davet et" (a streamer joins with the agency's code or invite link;
// the server refuses every app's invite), and while the server says this agency sees its sub-agencies by name only
// (subsHidden), no "Referans ajans yayıncıları" and a names-only Referans ajanslar list.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const office = readFileSync(resolve(import.meta.dirname, '../src/app/ajans/ofis.tsx'), 'utf8');

describe('Ajans ofisi kuralları', () => {
  test('yayıncı davet düğmesi yok; kod ya da bağlantı', () => {
    assert.doesNotMatch(office, /title="Yayıncı davet et"/);
    assert.doesNotMatch(office, /<InviteSheet/);
    assert.match(office, /Yayıncılar ajansına kodunla ya da davet bağlantınla katılır\./);
  });
  test('referans ajanslar gizliyken yalnız adlar', () => {
    // Yayıncılar lists only the agency's own streamers (owners, 26 Nov 2026).
    assert.match(office, /const scope = 'direct' as const;/);
    assert.match(office, /if \(\(d as \{ hidden\?: boolean \}\)\.hidden\)/);
    assert.match(office, /Referans ajansların yayıncıları ve rakamları referans veren ajansa gösterilmez\./);
    assert.match(office, /o\.subsHidden \? undefined : `\$\{o\.counts\.sub_streamers\} yayıncı`/);
  });
});
