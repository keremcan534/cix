// A sheet, menu or popup does not grey out the whole screen: its tap-outside area is clear (theme SCRIM) and the
// sheet carries its own edge. Only the dialogs that must stop everything keep a veil (KEEPS_VEIL). This reads the
// sources: a backdrop style with a dark fill next to a Modal fails here.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// theme.ts needs react-native, which doesn't load under Node: it is read as text like the rest.
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

/**
 * Kept on purpose: a sanction, a forced update, an incoming match, the PK result, the room ending under me, and the
 * full-screen photo viewer of an agency application (a document photo reads on a dark ground).
 */
const KEEPS_VEIL = new Set(['components/sanction-screen.tsx', 'components/remote-control.tsx', 'components/match-layer.tsx', 'components/room/pk-result.tsx', 'app/ajans/yonetim/[id].tsx']);
const KEEPS_KEY = new Set(['components/room/session-ui.tsx:centerDim']);

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(n) ? [p] : [];
  });
// A backdrop-like style (or inline Pressable) filled with a dark colour at 30 % or more.
const VEIL = /(\b(?:backdrop|scrim|sheetWrap|wrap|root|center|centerDim|dim)\w*): \{[^}]*backgroundColor: [^,}]*rgba\(\s*([0-3]?\d)\s*,\s*([0-3]?\d)\s*,\s*([0-3]?\d)\s*,\s*0?\.([3-9]\d?)\)/g;
const INLINE = /<Pressable style=\{\{ flex: 1, backgroundColor: 'rgba\(0, ?0, ?0, ?0?\.[3-9]\d?\)'/g;

describe('Açılan pencerenin arkası', () => {
  test('perde şeffaf; açılan alan kendi kenarı ve gölgesiyle ayrılır', () => {
    const theme = readFileSync(resolve(SRC, 'theme.ts'), 'utf8');
    assert.match(theme, /export const SCRIM = 'transparent';/);
    // Both schemes give a sheet a top edge and a popup card a rim, each with a shadow.
    assert.equal(theme.match(/ {4}sheet: \{ borderTopWidth: [^}]*boxShadow: '[^']+' \}/g)?.length, 2, 'alt pencerenin kenarı');
    assert.equal(theme.match(/ {4}card: \{ borderWidth: [^}]*boxShadow: '[^']+' \}/g)?.length, 2, 'açılır kartın kenarı');
  });

  test('Modal açan hiçbir dosyada bütün ekranı karartan perde yok (yalnızca durduran pencereler)', () => {
    const found: string[] = [];
    for (const path of files(SRC)) {
      const rel = relative(SRC, path).split('\\').join('/');
      const code = readFileSync(path, 'utf8');
      if (!code.includes('<Modal') || KEEPS_VEIL.has(rel)) continue;
      for (const m of code.matchAll(VEIL)) if (!KEEPS_KEY.has(`${rel}:${m[1]}`)) found.push(`${rel}: ${m[1]}`);
      for (const m of code.matchAll(INLINE)) found.push(`${rel}: ${m[0].slice(0, 40)}`);
    }
    assert.deepEqual(found, []);
  });
});
