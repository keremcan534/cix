/// <reference types="node" />
// The room games' drawn pictures (docs/GORSEL_URETIM_LISTESI.md §15 Ludo, §18 Renk Kartları, XOX, Dört Taş) are
// wired in one place, components/games/room/table-art: every file the list names has its entry there, every entry is
// a file the list names, and an entry that has been delivered points at a file that is on disk.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(ROOT, 'src/components/games/room/table-art.tsx');
const source = readFileSync(FILE, 'utf8');
const doc = readFileSync(resolve(ROOT, '../docs/GORSEL_URETIM_LISTESI.md'), 'utf8');

/** The PNG names in a section of the list, from its heading to the next one. */
function filesOf(heading: string) {
  const start = doc.indexOf(heading);
  assert.ok(start >= 0, heading);
  const end = doc.indexOf('\n## ', start + 1);
  return [...doc.slice(start, end).matchAll(/`([a-z0-9-]+)\.png`/g)].map((m) => m[1]).filter((n) => !n.startsWith('oyun-') && !n.startsWith('zar-'));
}

const entries = new Map([...source.matchAll(/^ {2}'([a-z0-9-]+)': (null|require\('([^']+)'\)),/gm)].map((m) => [m[1], m[3] ?? null]));

describe('Oda oyunlarının görselleri', () => {
  test('listedeki her dosyanın tek bir yeri var, fazlası yok', () => {
    const named = [...filesOf('## 15. Oda oyunları: Ludo'), ...filesOf('## 18. Oda oyunları: Renk Kartları, XOX, Dört Taş')];
    assert.deepEqual([...entries.keys()].sort(), [...new Set(named)].sort());
  });

  test('teslim edilen her görsel diskte var', () => {
    for (const [name, path] of entries) if (path) assert.ok(existsSync(resolve(dirname(FILE), path)), `${name}: ${path}`);
  });
});
