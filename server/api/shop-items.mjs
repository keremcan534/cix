// Yönetim › Mağaza: the shop's profile frames and entry effects, changed and added from the finance panel without an
// app update (docs/MAGAZA_YONETIMI.md).
//
// The app's own (catalog.mjs SHOP, kinds frame and entry, their sku as id) change the way the app's gifts and emoji
// packs do: a row with their sku holds only what was changed (name, price, days, VIP level, on the shelf, order), every
// NULL column "as in the app", and is never deleted; their pictures and clips stay the app's. The admins' own frames
// ('sf' and a number) and entry effects ('se' and a number) are rows of their own (076):
//   - a frame: its picture, a transparent PNG or WebP (media.mjs shopframe), square, its empty centre's radius as a
//     share of its width (`hole`) so the photo sits inside it;
//   - an entry effect: its video, a ready stacked MP4 or a transparent source (WebM, ProRes .mov, SVGA) the server
//     turns into one, as a gift's (custom-gifts.mjs videoOf and its job), and its name plate (`plate`): where the
//     entering person's name is written over it, as shares of the 540 × 960 frame (x, y: the centre; w: the widest
//     the name may be, a long one is drawn smaller; size: the letters' height; colour; bold).
//
//   GET  /api/admin/shop                                   → { items, limits, storage, convert, svga }
//   POST /api/admin/shop        { kind, name, price, days, minVip?, enabled?, art?, hole?, video?, plate? } → { item }
//   POST /api/admin/shop/update { id, name?, price?, days?, minVip?, enabled?, art?, hole?, video?, plate? } → { item }
//        (an app's own item: name, price, days, minVip and enabled only)
//   POST /api/admin/shop/reset  { id, fields? }   an app's item back to the app's values → { item }
//        (fields: any of name, price, days, minVip, enabled, sort; none: all but its place)
//   POST /api/admin/shop/delete { id }            an admin's item nobody has now → { deleted }
//   POST /api/admin/shop/order  { kind, ids }     the shop's order of that kind, every item of it → { items }
// days: 0 sells it for good.
//
// What the phones get: GET /api/catalog?shop=1 → `shop: { items }` (shopCatalog): every frame and entry effect as it is
// now, in order; one taken off the shelf has `off: true` (whoever has it still wears it and others still see it); an
// admin's frame its `art` ({ url, hole }), an admin's entry effect `video: true` and its `plate`, its clip listed in
// the catalog's `fx` as entry <id> (served at /api/fx/s/<id>.mp4). The catalog's and /api/config's `v` add
// shopItemsRev(). The shop sells at the price, days and VIP level set here (economy.mjs sellable). An older app never
// asks: it shows its compiled shop and buys by the app's names and prices, refused (update_required, nothing taken)
// when an item's price or days moved; it draws nothing for an admin's item someone wears.
import { HttpError, auth, clientIp, db, env, int, limit, readJson, text, tx } from './core.mjs';
import { SHOP, SHOP_PAUSED } from './catalog.mjs';
import { addVideoTable, canConvert, canSvga, imageInfo, kickJobs, videoOf } from './custom-gifts.mjs';
import { FX_PATH } from './fx.mjs';
import { keyOf, kindMax, readStored, removeFiles, sendFile, storageOn, verifyUpload } from './media.mjs';
import { panelDetail } from './panel.mjs';

const positive = (v, d) => {
  const n = Number(v ?? d);
  return Number.isSafeInteger(n) && n > 0 ? n : d;
};
const POLL_MS = positive(env.SHOP_ITEMS_POLL_MS, 5000);

export const SHOP_KINDS = Object.freeze(['frame', 'entry']);
const KIND_NAME = { frame: 'Çerçeve', entry: 'Giriş efekti' };
/** The plate a new entry effect gets until the panel moves it: centred, a little below the middle, white. */
export const PLATE_DEFAULT = Object.freeze({ x: 0.5, y: 0.62, w: 0.6, size: 0.035, color: '#FFFFFF', bold: true });
/** The rules the panel shows and every save checks. */
export const SHOP_LIMITS = Object.freeze({
  nameMin: 2,
  nameMax: 24,
  priceMax: 10_000_000,
  daysMax: 365,
  vipMax: 15,
  frameBytes: kindMax('shopframe'),
  framePxMin: 128,
  framePxMax: 1024,
  holeMin: 0.1,
  holeMax: 0.45,
  holeDefault: 0.25,
  plate: Object.freeze({ wMin: 0.1, wMax: 1, sizeMin: 0.015, sizeMax: 0.08 }),
  itemsMax: 200,
});
const OWN_ID = /^s[fe][0-9]{1,9}$/;
const APP_ITEMS = [...SHOP.values()].filter((x) => SHOP_KINDS.includes(x.kind));
const APP_BY_ID = new Map(APP_ITEMS.map((x) => [x.sku, x]));
/** Where the app's items sit until someone moves them: after the admins' own, in the app's order. */
const APP_SORT = new Map(APP_ITEMS.map((x, i) => [x.sku, 1000 + i]));
const num = (v) => (v === null || v === undefined ? null : Number(v));
const fmt = (n) => n.toLocaleString('tr-TR');
const lower = (s) => s.toLocaleLowerCase('tr');
const bad = (message) => new HttpError(400, message);

// --- The table in memory -------------------------------------------------------------------------------------
let snap = { rev: 0, rows: new Map() };
const rowOf = (r) =>
  Object.freeze({
    id: r.id,
    builtin: r.builtin === true,
    kind: r.kind,
    name: r.name,
    price: num(r.price),
    days: num(r.days),
    minVip: num(r.min_vip),
    enabled: r.enabled,
    sort: num(r.sort),
    art: r.art_url ? Object.freeze({ url: r.art_url, px: num(r.art_px), hole: Number(r.hole) }) : null,
    video: r.video_url ? Object.freeze({ url: r.video_url, bytes: num(r.video_bytes), ms: num(r.video_ms), v: r.video_v }) : null,
    plate: r.plate ?? null,
    job: r.job_status ? Object.freeze({ status: r.job_status, error: r.job_error ?? null, preview: r.job_preview ?? null }) : null,
    deleted: !!r.deleted_at,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  });

/** Reads the table again (never back to an older copy). */
export async function refreshShopItems(q = db) {
  const r = await q.query('SELECT * FROM shop_items');
  const rev = r.rows.reduce((m, x) => Math.max(m, Number(x.rev)), 0);
  if (rev >= snap.rev) snap = { rev, rows: new Map(r.rows.map((x) => [x.id, rowOf(x)])) };
  return snap;
}
let timer = null;
/** Picks up another process's changes. */
export function startShopItems() {
  if (timer) return;
  let busy = false;
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await db.query('SELECT coalesce(max(rev), 0) AS rev FROM shop_items');
      if (Number(r.rows[0].rev) !== snap.rev) await refreshShopItems();
    } catch (e) {
      console.error('shop items sync failed', String(e?.message ?? e).slice(0, 200));
    } finally {
      busy = false;
    }
  }, POLL_MS);
  timer.unref();
}
export function stopShopItems() {
  clearInterval(timer);
  timer = null;
}
/** Added to the catalog's and /api/config's version: grows with every change a phone should see. */
export const shopItemsRev = () => snap.rev;
// An entry effect's video is made by the gifts' converter (one job at a time for both).
addVideoTable({ table: 'shop_items', rev: 'shop_item_rev', what: 'shop', refresh: () => refreshShopItems() });

// --- As they are now ---------------------------------------------------------------------------------------------
/** One of the app's items as it is now: the app's values (catalog.mjs SHOP) with what was changed (`o`). */
const appItemOf = (base, o) =>
  Object.freeze({
    sku: base.sku,
    kind: base.kind,
    builtin: true,
    name: o?.name ?? base.name,
    price: o?.price ?? base.price,
    days: o?.days === null || o?.days === undefined ? base.days : o.days === 0 ? null : o.days,
    minVip: o?.minVip ?? base.minVip,
    enabled: o?.enabled ?? !SHOP_PAUSED.has(base.sku),
    sort: o?.sort ?? APP_SORT.get(base.sku),
    tier: null,
    art: null,
    video: null,
    plate: null,
    job: null,
    row: o ?? null,
  });
const ownItemOf = (r) =>
  Object.freeze({
    sku: r.id,
    kind: r.kind,
    builtin: false,
    name: r.name,
    price: r.price,
    days: r.days === 0 ? null : r.days,
    minVip: r.minVip,
    enabled: r.enabled,
    sort: r.sort,
    tier: null,
    art: r.art,
    video: r.video,
    plate: r.plate,
    job: r.job,
    row: r,
  });
const bySort = (a, b) => a.sort - b.sort || Number(a.builtin) - Number(b.builtin) || (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0);
let memo = { snap: null, list: [], byId: new Map() };
/** Every frame and entry effect that isn't deleted, in the shop's order (kind by kind as the shop shows them). */
export function allShopItems() {
  if (memo.snap === snap) return memo.list;
  const list = [...APP_ITEMS.map((b) => appItemOf(b, snap.rows.get(b.sku))), ...[...snap.rows.values()].filter((r) => !r.builtin && !r.deleted).map(ownItemOf)].sort(bySort);
  memo = { snap, list, byId: new Map(list.map((x) => [x.sku, x])) };
  return list;
}
/** A frame or entry effect as it is now (on the shelf or not), or undefined (another kind, unknown, deleted). */
export const shopItem = (sku) => (typeof sku === 'string' ? (allShopItems(), memo.byId.get(sku)) : undefined);
/** The admins' own items that aren't deleted (economy.mjs lists them with the shop's). */
export const ownShopSkus = () => allShopItems().filter((x) => !x.builtin).map((x) => x.sku);

const fxUrl = (sku, v) => `${FX_PATH}s/${sku}.mp4?v=${v}`;
/**
 * GET /api/catalog `shop` (?shop=1): every frame and entry effect in its order as it is now; `off` for one taken off
 * the shelf; an admin's frame its picture, an admin's entry effect that it has a video (in `fx`) and its plate.
 */
export function shopCatalog() {
  return {
    items: allShopItems().map((x) => ({
      sku: x.sku,
      kind: x.kind,
      name: x.name,
      price: x.price,
      days: x.days,
      minVip: x.minVip,
      ...(x.builtin ? { builtin: true } : {}),
      ...(x.enabled ? {} : { off: true }),
      ...(x.art ? { art: { url: x.art.url, hole: x.art.hole } } : {}),
      ...(x.kind === 'entry' && x.video ? { video: true, plate: x.plate } : {}),
    })),
  };
}
/** GET /api/catalog `fx`: the admins' entry effects' videos (taken off the shelf too: whoever has one still plays it). */
export const shopFx = () =>
  allShopItems()
    .filter((x) => !x.builtin && x.kind === 'entry' && x.video)
    .map((x) => ({ kind: 'entry', id: x.sku, url: fxUrl(x.sku, x.video.v), bytes: x.video.bytes, ms: x.video.ms }));
/** GET or HEAD /api/fx/s/<id>.mp4: an admin's entry effect's stacked video from the storage. */
export async function sendShopFx(req, res, name) {
  const m = /^(se[0-9]{1,9})\.mp4$/.exec(name);
  const x = m ? snap.rows.get(m[1]) : null;
  const key = x && !x.deleted && x.video ? keyOf(x.video.url) : null;
  if (!key) return void res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('Bulunamadı');
  await sendFile(req, res, key);
}

// --- Checking what the panel sends -----------------------------------------------------------------------------
async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}
const writeLimit = (a) => limit(`shop-admin:${a.id}`, 60, 'Çok fazla değişiklik, biraz bekle');
const audited = (c, a, action, detail, req) =>
  c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, NULL, $3, $4)', [a.id, action, JSON.stringify({ ...detail, ...panelDetail(a) }), clientIp(req)]);

const kindOf = (v) => {
  if (!SHOP_KINDS.includes(v)) throw bad('Tür çerçeve (frame) ya da giriş efekti (entry) olmalı');
  return v;
};
const nameOf = (v) => text(v, SHOP_LIMITS.nameMin, SHOP_LIMITS.nameMax, 'Ad').replace(/\s+/g, ' ');
const priceOf = (v) => {
  const n = int(v, 1, SHOP_LIMITS.priceMax);
  if (n === null) throw bad(`Fiyat 1 ile ${fmt(SHOP_LIMITS.priceMax)} jeton arasında tam sayı olmalı`);
  return n;
};
const daysOf = (v) => {
  const n = int(v, 0, SHOP_LIMITS.daysMax);
  if (n === null) throw bad(`Süre 1–${SHOP_LIMITS.daysMax} gün olmalı (0: süresiz)`);
  return n;
};
const vipOf = (v) => {
  const n = int(v, 0, SHOP_LIMITS.vipMax);
  if (n === null) throw bad(`VIP seviyesi 0–${SHOP_LIMITS.vipMax} olmalı (0: herkes)`);
  return n;
};
const boolOf = (v, what) => {
  if (typeof v !== 'boolean') throw bad(`${what} geçersiz`);
  return v;
};
const holeOf = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < SHOP_LIMITS.holeMin || n > SHOP_LIMITS.holeMax) throw bad(`Fotoğraf alanı resmin %${SHOP_LIMITS.holeMin * 100}–%${SHOP_LIMITS.holeMax * 100}'i olmalı`);
  return Math.round(n * 1000) / 1000;
};
/** The name plate: shares of the 540 × 960 frame, a colour and bold or not; null: none (the app's usual banner). */
export function plateOf(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  if (!o) throw bad('İsim plakası geçersiz');
  const P = SHOP_LIMITS.plate;
  const share = (k, min, max, what) => {
    const n = Number(o[k]);
    if (!Number.isFinite(n) || n < min || n > max) throw bad(`İsim plakası: ${what} %${Math.round(min * 1000) / 10}–%${Math.round(max * 1000) / 10} olmalı`);
    return Math.round(n * 1000) / 1000;
  };
  const color = typeof o.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(o.color) ? o.color.toUpperCase() : null;
  if (!color) throw bad('İsim plakası: renk #RRGGBB biçiminde olmalı');
  if (o.bold !== undefined && typeof o.bold !== 'boolean') throw bad('İsim plakası: kalın yazı seçimi geçersiz');
  return { x: share('x', 0, 1, 'yatay yer'), y: share('y', 0, 1, 'dikey yer'), w: share('w', P.wMin, P.wMax, 'genişlik'), size: share('size', P.sizeMin, P.sizeMax, 'yazı boyu'), color, bold: o.bold !== false };
}
/** A frame's picture: uploaded as one, a transparent PNG or WebP, square or nearly, 128–1024 px. */
async function frameArt(url) {
  const key = typeof url === 'string' ? keyOf(url) : null;
  if (!key?.startsWith('shopframe/')) throw bad('Çerçeve resmini önce yükle');
  await verifyUpload(url, 'shopframe');
  const info = imageInfo(await readStored(key, SHOP_LIMITS.frameBytes));
  if (!info) throw bad('Çerçeve resmi PNG ya da WebP olmalı');
  if (!info.alpha) throw bad('Çerçeve resminde saydamlık yok: ortası (fotoğrafın yeri) ve çevresi saydam olmalı');
  if (Math.abs(info.width - info.height) > Math.max(2, info.width * 0.02)) throw bad(`Çerçeve resmi kare olmalı (bu ${info.width} × ${info.height})`);
  if (info.width < SHOP_LIMITS.framePxMin || info.width > SHOP_LIMITS.framePxMax) throw bad(`Çerçeve resmi ${SHOP_LIMITS.framePxMin}–${SHOP_LIMITS.framePxMax} piksel olmalı (bu ${info.width})`);
  return { url, px: info.width };
}
const idOf = (v) => {
  if (typeof v === 'string' && (OWN_ID.test(v) || APP_BY_ID.has(v))) return v;
  throw bad('Geçersiz eşya');
};
const liveItem = (id) => {
  const x = shopItem(id);
  if (!x) throw new HttpError(404, 'Eşya bulunamadı');
  return x;
};
/** No other item of the kind with this name (the app's own included, by its name now and in the app). */
function nameFree(kind, name, self) {
  const n = lower(name);
  const taken = allShopItems().some((x) => x.kind === kind && x.sku !== self && lower(x.name) === n) || APP_ITEMS.some((x) => x.kind === kind && x.sku !== self && lower(x.name) === n);
  if (taken) throw new HttpError(409, `Bu adda bir ${lower(KIND_NAME[kind])} zaten var`);
}
async function saving(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e?.code === '23505' && e.constraint === 'shop_items_name') throw new HttpError(409, 'Bu adda bir eşya zaten var');
    throw e;
  }
}
/** UPDATE … SET from a column → value map (undefined left out), the row's rev and who changed it; RETURNING *. */
async function setRow(c, id, cols, actor) {
  const vals = [id];
  const sets = [];
  for (const [col, v] of Object.entries(cols)) {
    if (v === undefined) continue;
    vals.push(col === 'plate' && v !== null ? JSON.stringify(v) : v);
    sets.push(`${col} = $${vals.length}`);
  }
  vals.push(actor);
  sets.push(`updated_by = $${vals.length}`, 'updated_at = now()', "rev = nextval('shop_item_rev')");
  return (await c.query(`UPDATE shop_items SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals)).rows[0];
}
/** The row for one of the app's items, made the first time anything about it changes (every column null). */
const appRow = (c, id, actor) =>
  c.query('INSERT INTO shop_items (id, builtin, kind, created_by, updated_by) VALUES ($1, true, $2, $3, $3) ON CONFLICT (id) DO NOTHING', [id, APP_BY_ID.get(id).kind, actor]);
const auditOf = (r) => r && Object.fromEntries(Object.entries(r).filter(([k]) => !['created_at', 'updated_at', 'created_by', 'updated_by', 'rev', 'job_at', 'job_tries'].includes(k)));

/** How many people have each item now (entitlements, economy.mjs). */
async function owners(skus = null) {
  const r = await db.query(
    `SELECT e.sku, count(DISTINCT e.user_id)::int AS n FROM entitlements e
      WHERE e.kind = ANY($1::text[]) AND e.revoked_at IS NULL AND e.starts_at <= now() AND (e.ends_at IS NULL OR e.ends_at > now())
        AND ($2::text[] IS NULL OR e.sku = ANY($2::text[])) GROUP BY e.sku`,
    [SHOP_KINDS, skus],
  );
  return new Map(r.rows.map((x) => [x.sku, x.n]));
}
const CHANGED = ['name', 'price', 'days', 'minVip', 'enabled'];
const changedOf = (r) => (r ? CHANGED.filter((k) => r[k] !== null && r[k] !== undefined) : []);
/** An item as the panel shows it. */
function itemView(x, owned) {
  const base = APP_BY_ID.get(x.sku);
  return {
    id: x.sku,
    kind: x.kind,
    builtin: x.builtin,
    name: x.name,
    price: x.price,
    days: x.days,
    minVip: x.minVip,
    enabled: x.enabled,
    sort: x.sort,
    owners: owned.get(x.sku) ?? 0,
    art: x.art ? { url: x.art.url, px: x.art.px, hole: x.art.hole } : null,
    video: x.video ? { url: fxUrl(x.sku, x.video.v), bytes: x.video.bytes, ms: x.video.ms } : null,
    plate: x.plate,
    job: x.job,
    ...(base ? { original: { name: base.name, price: base.price, days: base.days, minVip: base.minVip, enabled: !SHOP_PAUSED.has(base.sku) }, changed: changedOf(x.row) } : {}),
    updatedAt: x.row?.updatedAt ?? null,
  };
}
async function adminItems() {
  const owned = await owners();
  return allShopItems().map((x) => itemView(x, owned));
}
const oneItem = async (id) => {
  const x = shopItem(id);
  return x ? itemView(x, await owners([id])) : null;
};
/** The place before every item of `kind` (a new one goes first). */
const firstSort = (kind) => Math.min(1, ...allShopItems().filter((x) => x.kind === kind).map((x) => x.sort)) - 1;

const RESET = ['name', 'price', 'days', 'minVip', 'enabled', 'sort'];
const COLUMN = { name: 'name', price: 'price', days: 'days', minVip: 'min_vip', enabled: 'enabled', sort: 'sort' };

export const shopRoutes = {
  async 'GET /api/admin/shop'(req) {
    await admin(req);
    return { items: await adminItems(), limits: { ...SHOP_LIMITS, plateDefault: PLATE_DEFAULT }, storage: storageOn(), convert: await canConvert(), svga: await canSvga() };
  },

  /** An admin's own frame (with its picture) or entry effect (with its video and name plate), first of its kind. */
  async 'POST /api/admin/shop'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 8192);
    const kind = kindOf(b.kind);
    const name = nameOf(b.name);
    const price = priceOf(b.price);
    const days = daysOf(b.days);
    const minVip = vipOf(b.minVip ?? 0);
    const enabled = b.enabled === undefined ? true : boolOf(b.enabled, 'Açık / kapalı');
    nameFree(kind, name, null);
    if (allShopItems().filter((x) => !x.builtin).length >= SHOP_LIMITS.itemsMax) throw bad(`En fazla ${SHOP_LIMITS.itemsMax} eşya eklenebilir`);
    let art = null;
    let hole = null;
    let video = null;
    let plate = null;
    if (kind === 'frame') {
      if (b.video !== undefined || b.plate !== undefined) throw bad('Çerçevenin videosu ya da isim plakası olmaz');
      art = await frameArt(b.art);
      hole = holeOf(b.hole ?? SHOP_LIMITS.holeDefault);
    } else {
      if (b.art !== undefined || b.hole !== undefined) throw bad('Giriş efektinin çerçeve resmi olmaz');
      video = await videoOf(b.video ?? null);
      if (!video) throw bad('Giriş efektinin videosunu önce yükle');
      plate = plateOf(b.plate === undefined ? PLATE_DEFAULT : b.plate);
    }
    const source = video?.kind === 'source' ? video : null;
    const stacked = video?.kind === 'stacked' ? video : null;
    const id = await saving(() =>
      tx(async (c) => {
        const id = `${kind === 'frame' ? 'sf' : 'se'}${(await c.query("SELECT nextval('shop_item_no') AS n")).rows[0].n}`;
        const r = await c.query(
          `INSERT INTO shop_items (id, kind, name, price, days, min_vip, enabled, sort, art_url, art_px, hole, video_url, video_bytes, video_ms, video_v, plate,
                                   job_status, job_source, job_fill, job_opaque, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $21) RETURNING *`,
          [id, kind, name, price, days, minVip, enabled, firstSort(kind), art?.url ?? null, art?.px ?? null, hole, stacked?.url ?? null, stacked?.bytes ?? null, stacked?.ms ?? null,
            stacked?.v ?? null, plate ? JSON.stringify(plate) : null, source ? 'processing' : null, source?.url ?? null, source?.fill ?? null, source?.opaque === true, a.id],
        );
        await audited(c, a, 'shop.create', { item: id, before: null, after: auditOf(r.rows[0]) }, req);
        return id;
      }),
    );
    await refreshShopItems();
    if (source) kickJobs();
    return { item: await oneItem(id) };
  },

  /** Changes what the body names; a new picture or video replaces the old file, which is then deleted. */
  async 'POST /api/admin/shop/update'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 8192);
    const id = idOf(b.id);
    const cur = liveItem(id);
    const cols = {};
    if (b.name !== undefined) {
      cols.name = nameOf(b.name);
      nameFree(cur.kind, cols.name, id);
    }
    if (b.price !== undefined) cols.price = priceOf(b.price);
    if (b.days !== undefined) cols.days = daysOf(b.days);
    if (b.minVip !== undefined) cols.min_vip = vipOf(b.minVip);
    if (b.enabled !== undefined) cols.enabled = boolOf(b.enabled, 'Açık / kapalı');
    const drop = [];
    if (cur.builtin) {
      if (['art', 'hole', 'video', 'plate'].some((k) => b[k] !== undefined)) throw bad('Uygulamanın kendi eşyasının görseli buradan değişmez; yeni görselle kendi eşyanı ekle');
    } else if (cur.kind === 'frame') {
      if (b.video !== undefined || b.plate !== undefined) throw bad('Çerçevenin videosu ya da isim plakası olmaz');
      if (b.art !== undefined && b.art !== cur.art?.url) {
        const art = await frameArt(b.art);
        Object.assign(cols, { art_url: art.url, art_px: art.px });
        if (cur.art) drop.push(cur.art.url);
      }
      if (b.hole !== undefined) cols.hole = holeOf(b.hole);
    } else {
      if (b.art !== undefined || b.hole !== undefined) throw bad('Giriş efektinin çerçeve resmi olmaz');
      if (b.plate !== undefined) cols.plate = plateOf(b.plate);
      if (b.video === null) throw bad('Giriş efektinin videosu kaldırılamaz; yenisini yükle');
      const video = await videoOf(b.video);
      if (video?.kind === 'stacked') {
        Object.assign(cols, { video_url: video.url, video_bytes: video.bytes, video_ms: video.ms, video_v: video.v, job_status: null, job_source: null, job_error: null, job_preview: null, job_tries: 0 });
        if (cur.video) drop.push(cur.video.url);
        if (cur.job?.preview) drop.push(cur.job.preview);
      } else if (video?.kind === 'source') {
        // The video in use stays until the new one is ready (custom-gifts.mjs convertJob puts it in effect).
        Object.assign(cols, { job_status: 'processing', job_source: video.url, job_fill: video.fill, job_opaque: video.opaque === true, job_error: null, job_tries: 0, job_at: new Date() });
        if (cur.job?.preview) {
          cols.job_preview = null;
          drop.push(cur.job.preview);
        }
      }
    }
    if (!Object.keys(cols).length) throw bad('Değişecek bir şey yok');
    await saving(() =>
      tx(async (c) => {
        if (cur.builtin) await appRow(c, id, a.id);
        const before = (await c.query('SELECT * FROM shop_items WHERE id = $1 FOR UPDATE', [id])).rows[0];
        if (before.job_source && cols.job_source !== undefined && before.job_source !== cols.job_source) drop.push(before.job_source);
        const r = await setRow(c, id, cols, a.id);
        await audited(c, a, 'shop.update', { item: id, before: auditOf(before), after: auditOf(r) }, req);
      }),
    );
    removeFiles(drop.filter(Boolean));
    await refreshShopItems();
    if (cols.job_status === 'processing') kickJobs();
    return { item: await oneItem(id) };
  },

  /** One of the app's items back to the app's values (all of them but its place, or `fields`). */
  async 'POST /api/admin/shop/reset'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req);
    const id = idOf(b.id);
    if (!APP_BY_ID.has(id)) throw bad('Yalnız uygulamanın kendi eşyası orijinaline döner');
    let fields = RESET.filter((f) => f !== 'sort');
    if (b.fields !== undefined) {
      if (!Array.isArray(b.fields) || !b.fields.length || !b.fields.every((f) => RESET.includes(f))) throw bad(`Geri alınabilenler: ${RESET.join(', ')}`);
      fields = [...new Set(b.fields)];
    }
    if (fields.includes('name')) nameFree(APP_BY_ID.get(id).kind, APP_BY_ID.get(id).name, id);
    await tx(async (c) => {
      await appRow(c, id, a.id);
      const before = (await c.query('SELECT * FROM shop_items WHERE id = $1 FOR UPDATE', [id])).rows[0];
      const r = await setRow(c, id, Object.fromEntries(fields.map((f) => [COLUMN[f], null])), a.id);
      await audited(c, a, 'shop.reset', { item: id, fields, before: auditOf(before), after: auditOf(r) }, req);
    });
    await refreshShopItems();
    return { item: await oneItem(id) };
  },

  /** An admin's own item that nobody has now; its files go too. One somebody has is taken off the shelf instead. */
  async 'POST /api/admin/shop/delete'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req);
    const id = idOf(b.id);
    if (APP_BY_ID.has(id)) throw bad('Uygulamanın kendi eşyası silinmez; satıştan kaldırmak için kapat');
    liveItem(id);
    const files = await tx(async (c) => {
      const cur = (await c.query('SELECT * FROM shop_items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id])).rows[0];
      if (!cur) throw new HttpError(404, 'Eşya bulunamadı');
      const n = (
        await c.query("SELECT count(DISTINCT user_id)::int AS n FROM entitlements WHERE sku = $1 AND revoked_at IS NULL AND (ends_at IS NULL OR ends_at > now())", [id])
      ).rows[0].n;
      if (n) throw new HttpError(409, `Bu eşya ${fmt(n)} kişide var; silinemez. Satıştan kaldırmak için kapat (sahipleri kullanmaya devam eder).`);
      await c.query("UPDATE shop_items SET deleted_at = now(), job_status = NULL, job_source = NULL, rev = nextval('shop_item_rev'), updated_by = $2, updated_at = now() WHERE id = $1", [id, a.id]);
      await audited(c, a, 'shop.delete', { item: id, before: auditOf(cur), after: null }, req);
      return [cur.art_url, cur.video_url, cur.job_source, cur.job_preview];
    });
    removeFiles(files.filter(Boolean));
    await refreshShopItems();
    return { deleted: true };
  },

  /** The shop's order of one kind: `ids` is every item of it, first to last. */
  async 'POST /api/admin/shop/order'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 16_384);
    const kind = kindOf(b.kind);
    const now = allShopItems().filter((x) => x.kind === kind).map((x) => x.sku);
    const ids = Array.isArray(b.ids) ? b.ids : [];
    if (ids.length !== now.length || new Set(ids).size !== ids.length || !ids.every((id) => now.includes(id))) throw bad('Sıra, bu türün bütün eşyalarını bir kez içermeli');
    await tx(async (c) => {
      for (const [i, id] of ids.entries()) {
        if (APP_BY_ID.has(id)) await appRow(c, id, a.id);
        await c.query("UPDATE shop_items SET sort = $2, rev = nextval('shop_item_rev'), updated_by = $3, updated_at = now() WHERE id = $1", [id, i, a.id]);
      }
      await audited(c, a, 'shop.order', { kind, before: now, after: ids }, req);
    });
    await refreshShopItems();
    return { items: await adminItems() };
  },
};
