// Gift and entry videos come from this server, not from inside the app: an APK (and every over-the-air update)
// that carried each clip would grow with every new gift. The MP4s sit in ./fx, made by app/scripts/alpha-stack.sh
// (the picture in the top half, its alpha in the bottom); FX_VIDEOS says which gift (app data/mock GIFTS id) or
// entry effect (app data/catalog COSMETICS `fx`) plays which file. GET /api/catalog lists them as `fx`, each with a
// version taken from the file's content, so a phone downloads a clip once and again only when it changes
// (app/src/lib/fx-videos.ts). A new clip: put the file in ./fx, add its line below and deploy; phones fetch it on
// their own, no app update, as long as the gift itself is in the app.
//
//   GET|HEAD /api/fx/<name>.mp4   → the file (Range allowed); kept for good, the catalog's ?v= changes with it
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(import.meta.dirname, 'fx');
export const FX_PATH = '/api/fx/';
const NAME = /^[a-z0-9-]{1,64}\.mp4$/;

export const FX_VIDEOS = {
  gift: {
    g6: 'roket.mp4',
    h13: 'tatli-ayicik.mp4',
    h14: 'kraliyet-taci.mp4',
    c13: 'pirlanta-yuzuk.mp4',
    h15: 'sevimli-panda.mp4',
    h16: 'hazine-sandigi.mp4',
    h17: 'efsanevi-tek-boynuz.mp4',
    h18: 'anka-kusu.mp4',
    h19: 'altin-gemi.mp4',
    h20: 'kristal-saray.mp4',
    h21: 'altin-super-otomobil.mp4',
    h22: 'altin-aslan.mp4',
  },
  entry: { dragon: 'ejderha.mp4' },
};

/** An MP4's length in ms from its movie header (moov › mvhd); 0 when it can't be read. */
export function mp4Duration(buf) {
  const box = (start, end, type) => {
    let p = start;
    while (p + 8 <= end) {
      let size = buf.readUInt32BE(p);
      let head = 8;
      if (size === 1) {
        if (p + 16 > end) return null;
        size = Number(buf.readBigUInt64BE(p + 8));
        head = 16;
      } else if (size === 0) size = end - p;
      if (size < head || p + size > end) return null;
      if (buf.toString('latin1', p + 4, p + 8) === type) return { start: p + head, end: p + size };
      p += size;
    }
    return null;
  };
  try {
    const moov = box(0, buf.length, 'moov');
    const mvhd = moov && box(moov.start, moov.end, 'mvhd');
    if (!mvhd) return 0;
    const v1 = buf[mvhd.start] === 1;
    const scale = buf.readUInt32BE(mvhd.start + (v1 ? 20 : 12));
    const duration = v1 ? Number(buf.readBigUInt64BE(mvhd.start + 24)) : buf.readUInt32BE(mvhd.start + 16);
    return scale ? Math.round((duration / scale) * 1000) : 0;
  } catch {
    return 0;
  }
}

/** Every listed clip, read once: name → {size, v, ms}, and the catalog's list. A missing file is left out. */
function load() {
  const files = new Map();
  const list = [];
  for (const [kind, map] of Object.entries(FX_VIDEOS)) {
    for (const [id, name] of Object.entries(map)) {
      let f = files.get(name);
      if (!f) {
        let buf;
        try {
          buf = fs.readFileSync(path.join(DIR, name));
        } catch {
          console.error('fx file missing', name);
          continue;
        }
        f = { size: buf.length, v: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12), ms: mp4Duration(buf) };
        files.set(name, f);
      }
      list.push({ kind, id, url: `${FX_PATH}${name}?v=${f.v}`, bytes: f.size, ms: f.ms });
    }
  }
  return { files, list };
}
let loaded = null;
const fx = () => (loaded ??= load());

/** GET /api/catalog `fx`: [{kind: 'gift' | 'entry', id, url, bytes, ms}], the gifts hidden in Canlı ayarlar left out. */
export const fxCatalog = (giftsHidden = new Set()) => fx().list.filter((x) => !(x.kind === 'gift' && giftsHidden.has(x.id)));

/** GET or HEAD /api/fx/<name>: the clip as it is on disk, a `Range` as asked (bytes=a-b, a- or -n). */
export function sendFx(req, res, name) {
  const plain = (code, text, extra = {}) => void res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra }).end(text);
  const f = NAME.test(name) ? fx().files.get(name) : undefined;
  if (!f) return plain(404, 'Bulunamadı');
  const tag = `"${f.v}"`;
  const head = {
    'Content-Type': 'video/mp4',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes',
    ETag: tag,
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  };
  let start = 0;
  let end = f.size - 1;
  let status = 200;
  const r = typeof req.headers.range === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range.trim()) : null;
  if (r && (r[1] || r[2])) {
    if (r[1]) {
      start = Number(r[1]);
      if (r[2]) end = Math.min(Number(r[2]), f.size - 1);
    } else start = Math.max(0, f.size - Number(r[2]));
    if (start > end || start >= f.size) return plain(416, 'Bu aralık yok', { 'Content-Range': `bytes */${f.size}` });
    status = 206;
    head['Content-Range'] = `bytes ${start}-${end}/${f.size}`;
  } else if (req.headers['if-none-match'] === tag) {
    res.writeHead(304, head);
    return void res.end();
  }
  head['Content-Length'] = String(end - start + 1);
  res.writeHead(status, head);
  if (req.method === 'HEAD') return void res.end();
  const stream = fs.createReadStream(path.join(DIR, name), { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}
