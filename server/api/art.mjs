// The app's own pictures for the finance panel and Yönetim: small WebP copies of the gifts' and the stickers' art
// (made from app/assets by tools/panel-art.py, kept in ./art), so the panel can show one of the app's gifts or
// stickers next to what was changed about it. Phones never load these: they draw their own.
//
//   GET|HEAD /api/fx/art/<gifts|stickers>/<id>.webp → the picture (public, kept a day)
import fs from 'node:fs';
import path from 'node:path';

import { FX_PATH } from './fx.mjs';

const DIR = path.join(import.meta.dirname, 'art');
const KINDS = ['gifts', 'stickers'];
const NAME = /^[a-z0-9-]{1,64}\.webp$/;

/** `<kind>/<file>` → its bytes, read once (about a megabyte in all). */
let files = null;
function load() {
  files = new Map();
  for (const kind of KINDS) {
    let names = [];
    try {
      names = fs.readdirSync(path.join(DIR, kind));
    } catch {}
    for (const n of names) if (NAME.test(n)) files.set(`${kind}/${n}`, fs.readFileSync(path.join(DIR, kind, n)));
  }
  return files;
}

/** Where the panel opens the picture of `id` (a gift or a sticker of the app's), or null when there is none. */
export const artUrl = (kind, id) => ((files ?? load()).has(`${kind}/${id}.webp`) ? `${FX_PATH}art/${kind}/${id}.webp` : null);

/** GET or HEAD /api/fx/art/<kind>/<id>.webp. */
export function sendArt(req, res, name) {
  const buf = (files ?? load()).get(name);
  if (!buf) return void res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('Bulunamadı');
  res.writeHead(200, {
    'Content-Type': 'image/webp',
    'Content-Length': String(buf.length),
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  res.end(req.method === 'HEAD' ? undefined : buf);
}
