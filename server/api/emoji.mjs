// Yönetim › Emojiler: the emoji panel's sticker packs and their stickers, changed and added from the panel without an
// app update (docs/EMOJI_YONETIMI.md). The app's own packs and stickers (stickers.mjs, in step with the app) change the
// way the app's gifts do (custom-gifts.mjs): a row with their id holds only what was changed, every NULL column "as in
// the app", and is never deleted; the admins' own packs ('ep' and a number) and stickers ('es' and a number) are rows
// of their own (070).
//
//   GET  /api/admin/emoji                                    → { packs, limits, storage }
//   POST /api/admin/emoji/packs          { name, price, minVip?, enabled? }        → { pack }   first among the packs
//   POST /api/admin/emoji/packs/update   { id, name?, price?, minVip?, enabled? }   → { pack }   the app's packs too
//   POST /api/admin/emoji/packs/reset    { id, fields? }   an app's pack back to the app's values → { pack }
//        (fields: any of name, price, minVip, enabled, sort; none: all but its place)
//   POST /api/admin/emoji/packs/delete   { id }            an admin's pack nobody owns    → { deleted }
//   POST /api/admin/emoji/packs/order    { ids }                                        → { packs }
//   POST /api/admin/emoji/stickers       { pack, name, emoji?, art, artLink?, enabled? } → { sticker }   last in its pack
//   POST /api/admin/emoji/stickers/update { id, pack?, name?, emoji?, art?, artLink?, enabled? } → { sticker }
//        the app's stickers too: art: null gives one its picture in the app again
//   POST /api/admin/emoji/stickers/reset  { id, fields? }  an app's sticker back (pack, name, emoji, enabled, sort, art)
//   POST /api/admin/emoji/stickers/delete { id }           an admin's sticker              → { deleted }
//   POST /api/admin/emoji/stickers/order  { pack, ids }                                  → { packs }
//   POST /api/admin/emoji/fetch           { url }  → { url, link, kind, type, bytes }  a picture from a link, stored
//        as if uploaded (link-fetch.mjs), for create and update to take with artLink
//
// A sticker's picture is a stored file (media.mjs kind stickerart, uploaded first): a transparent PNG or WebP, square
// or nearly, 96–1024 px, or a Lottie animation (its JSON, at most 10 s, its pictures inside it), at most 512 KB.
//
// What the phones get: GET /api/catalog?emoji=1 → `emoji: { packs, gone }` (emojiCatalog): every pack in its order as
// it is now, each with its stickers in their order; a sticker's `art` ({ url, kind }) only where the app has no picture
// of its own for it (an admin's, or a replaced one). A pack or sticker taken off is listed with `off: true` (the app's
// `retired`): the messages and seats that show it still draw it; a deleted sticker stays in `gone` as its name and
// emoji. The catalog's and /api/config's `v` add emojiRev(). An older app never asks and keeps its compiled packs.
//
// The shop (economy.mjs): a pack with a price is sold as 'pack-<id>' at the price here (packItem); an older app,
// which shows the app's price and names the pack in its spend, buys it by the app's name too (packByName); the shop's
// price check (price_changed) holds either way.
import { artUrl } from './art.mjs';
import { HttpError, auth, clientIp, db, env, int, limit, readJson, text, tx } from './core.mjs';
import { imageInfo } from './custom-gifts.mjs';
import { download, linkOf } from './link-fetch.mjs';
import { keyOf, kindMax, readStored, removeFiles, storageOn, storeFile, verifyUpload } from './media.mjs';
import { panelDetail } from './panel.mjs';
import { EMOJI_TAB_PACKS, PACKS_BY_ID, STICKERS_BY_ID, STICKER_PACKS } from './stickers.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const positive = (v, d) => {
  const n = Number(v ?? d);
  return Number.isSafeInteger(n) && n > 0 ? n : d;
};
const POLL_MS = positive(env.EMOJI_POLL_MS, 5000);

/** The rules the panel shows and every save checks. */
export const EMOJI_LIMITS = Object.freeze({
  packNameMin: 2,
  packNameMax: 24,
  nameMin: 1,
  nameMax: 24,
  priceMax: 1_000_000,
  vipMax: 15,
  artBytes: kindMax('stickerart'),
  artMinPx: 96,
  artMaxPx: 1024,
  lottieMaxMs: 10_000,
  packsMax: 60,
  stickersMax: 60,
});
const PACK_ID = /^ep[0-9]{1,9}$/;
const STICKER_ID = /^es[0-9]{1,9}$/;
const fmt = (n) => n.toLocaleString('tr-TR');
const lower = (s) => s.toLocaleLowerCase('tr');
const num = (v) => (v === null || v === undefined ? null : Number(v));
/** Where the app's packs and stickers sit until someone moves them: after the admins' own, in the app's order. */
const PACK_SORT = new Map(STICKER_PACKS.map((p, i) => [p.id, 1000 + i]));
const STICKER_SORT = new Map(STICKER_PACKS.flatMap((p) => p.stickers.map((s, i) => [s.id, 1000 + i])));

// --- The tables in memory ----------------------------------------------------------------------------------
/** rev: the largest emoji_rev in use (0: none yet); packs and stickers: id → the row as viewOf reads it. */
/** The app's sold packs start "Yakında" (owners, 25 Nov 2026); PACKS_SOON=0 sells them as before (the tests' server). */
const PACKS_SOON = env.PACKS_SOON !== '0';
let snap = { rev: 0, packs: new Map(), stickers: new Map() };

const packRow = (r) =>
  Object.freeze({
    id: r.id,
    builtin: r.builtin === true,
    name: r.name,
    price: num(r.price),
    minVip: num(r.min_vip),
    enabled: r.enabled,
    // Yakında (128): null "as the default" (an app's pack that is sold or opened by VIP: yes; any other: no).
    soon: r.soon ?? null,
    sort: num(r.sort),
    deleted: !!r.deleted_at,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  });
const stickerRow = (r) =>
  Object.freeze({
    id: r.id,
    builtin: r.builtin === true,
    pack: r.pack_id,
    name: r.name,
    emoji: r.emoji,
    enabled: r.enabled,
    sort: num(r.sort),
    art: r.art_url ? Object.freeze({ url: r.art_url, kind: r.art_kind }) : null,
    artLink: r.art_link ?? null,
    deleted: !!r.deleted_at,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  });

/** Reads both tables again (never back to an older copy). */
export async function refreshEmoji(q = db) {
  const [p, s] = await Promise.all([q.query('SELECT * FROM emoji_packs'), q.query('SELECT * FROM emoji_stickers')]);
  const rev = [...p.rows, ...s.rows].reduce((m, x) => Math.max(m, Number(x.rev)), 0);
  if (rev >= snap.rev) snap = { rev, packs: new Map(p.rows.map((x) => [x.id, packRow(x)])), stickers: new Map(s.rows.map((x) => [x.id, stickerRow(x)])) };
  return snap;
}

let timer = null;
/** Picks up another process's changes. */
export function startEmoji() {
  if (timer) return;
  let busy = false;
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await db.query('SELECT greatest((SELECT coalesce(max(rev), 0) FROM emoji_packs), (SELECT coalesce(max(rev), 0) FROM emoji_stickers)) AS rev');
      if (Number(r.rows[0].rev) !== snap.rev) await refreshEmoji();
    } catch (e) {
      console.error('emoji sync failed', String(e?.message ?? e).slice(0, 200));
    } finally {
      busy = false;
    }
  }, POLL_MS);
  timer.unref();
}
export function stopEmoji() {
  clearInterval(timer);
  timer = null;
}
/** Added to the catalog's and /api/config's version: grows with every change a phone should see. */
export const emojiRev = () => snap.rev;

// --- As they are now -----------------------------------------------------------------------------------------
/** One of the app's packs as it is now: the app's values (stickers.mjs) with what was changed (`o`). */
const appPackOf = (base, o) => ({
  id: base.id,
  builtin: true,
  name: o?.name ?? base.name,
  price: o?.price ?? base.price,
  minVip: o?.minVip ?? base.minVip,
  enabled: o?.enabled ?? !base.retired,
  // Yakında (owners, 25 Nov 2026): every pack sold in Çarşı or opened by VIP starts so (PACKS_SOON=0: none, the tests).
  soon: o?.soon ?? (PACKS_SOON && (base.price > 0 || !!base.minVip)),
  sort: o?.sort ?? PACK_SORT.get(base.id),
  roomOnly: base.roomOnly,
  animated: base.animated,
  row: o ?? null,
});
const customPackOf = (r) => ({ id: r.id, builtin: false, name: r.name, price: r.price, minVip: r.minVip, enabled: r.enabled, soon: r.soon === true, sort: r.sort, roomOnly: false, animated: false, row: r });
/** One of the app's stickers as it is now; `art` only when it was replaced. */
const appStickerOf = (base, packId, o) => ({
  id: base.id,
  builtin: true,
  pack: o?.pack ?? packId,
  name: o?.name ?? base.name,
  emoji: o?.emoji ?? base.emoji,
  enabled: o?.enabled ?? true,
  sort: o?.sort ?? STICKER_SORT.get(base.id),
  art: o?.art ?? null,
  row: o ?? null,
});
const customStickerOf = (r) => ({ id: r.id, builtin: false, pack: r.pack, name: r.name, emoji: r.emoji, enabled: r.enabled, sort: r.sort, art: r.art, row: r });

const bySort = (a, b) => a.sort - b.sort || Number(a.builtin) - Number(b.builtin) || a.id.length - b.id.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
let memo = { snap: null, packs: [], stickers: new Map() };
/** Every pack that isn't deleted, in its order, each with its stickers (taken-off ones too) in theirs. */
export function allPacks() {
  if (memo.snap === snap) return memo.packs;
  const packs = [...STICKER_PACKS.map((p) => appPackOf(p, snap.packs.get(p.id))), ...[...snap.packs.values()].filter((r) => !r.builtin && !r.deleted).map(customPackOf)].sort(bySort);
  const ids = new Set(packs.map((p) => p.id));
  const stickers = [
    ...STICKER_PACKS.flatMap((p) => p.stickers.map((s) => appStickerOf(s, p.id, snap.stickers.get(s.id)))),
    ...[...snap.stickers.values()].filter((r) => !r.builtin && !r.deleted).map(customStickerOf),
  ];
  // A sticker moved to a pack that is gone meanwhile goes back to its own.
  for (const s of stickers) if (!ids.has(s.pack)) s.pack = STICKERS_BY_ID.get(s.id)?.pack.id ?? s.pack;
  const out = packs.map((p) => ({ ...p, stickers: stickers.filter((s) => s.pack === p.id).sort(bySort) }));
  for (const p of out) if (!p.builtin) p.animated = p.stickers.some((s) => s.art?.kind === 'lottie');
  memo = { snap, packs: out, stickers: new Map(stickers.map((s) => [s.id, s])) };
  return out;
}
const packOf = (id) => allPacks().find((p) => p.id === id);
const stickerOf = (id) => (allPacks(), memo.stickers.get(id));

/**
 * GET /api/catalog `emoji` (?emoji=1): every pack in its order, each with its stickers, as they are now. `art` only
 * where the app has no picture of its own (an admin's sticker, a replaced one); `off` for what was taken off (still
 * drawn where it was sent); `gone`: the admins' deleted stickers, drawn as their emoji.
 */
export function emojiCatalog() {
  const packs = allPacks().map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    minVip: p.minVip,
    ...(p.roomOnly ? { roomOnly: true } : {}),
    ...(p.animated ? { animated: true } : {}),
    ...(p.enabled ? {} : { off: true }),
    // On Çarşı's shelf with a "Yakında" tag, not sold (an older app shows it as before and is refused at the purchase).
    ...(p.soon ? { soon: true } : {}),
    ...(p.builtin ? {} : { custom: true }),
    stickers: p.stickers.map((s) => ({
      id: s.id,
      name: s.name,
      emoji: s.emoji,
      ...(s.art ? { art: { url: s.art.url, kind: s.art.kind } } : {}),
      ...(s.enabled ? {} : { off: true }),
      ...(s.builtin ? {} : { custom: true }),
    })),
  }));
  const gone = [...snap.stickers.values()].filter((r) => !r.builtin && r.deleted).map((r) => ({ id: r.id, name: r.name, emoji: r.emoji }));
  return { packs, gone };
}

/**
 * The shop's item for 'pack-<id>' as the pack is now: one with a price, on the shelves, not a room's own (Hamle). null
 * for a pack that isn't for sale; undefined for a sku that isn't a pack's. `any`: the pack whatever it is (a grant).
 */
export function packItem(sku, { any = false } = {}) {
  if (typeof sku !== 'string' || !sku.startsWith('pack-')) return undefined;
  const p = packOf(sku.slice(5));
  if (!p || (!any && (!p.enabled || p.soon || p.roomOnly || p.price <= 0))) return null;
  return Object.freeze({ sku, kind: 'sticker', name: p.name, price: p.price, days: null, minVip: p.minVip, tier: null, ...(p.soon ? { soon: true } : {}) });
}
/** Every pack's sku, in the packs' order (the shop lists those packItem sells). */
export const packSkus = () => allPacks().map((p) => `pack-${p.id}`);
/** The pack an older app's spend names ("Çıkartma paketi: Eğlence"): by its name now, or by the app's name for it. */
export function packByName(name) {
  const n = lower(String(name ?? '').trim());
  const p = allPacks().find((x) => lower(x.name) === n) ?? allPacks().find((x) => x.builtin && lower(PACKS_BY_ID.get(x.id).name) === n);
  return p ? packItem(`pack-${p.id}`) : null;
}

// --- Pictures ----------------------------------------------------------------------------------------------
/** A Lottie animation's size and length from its JSON; a 400 that says what is wrong with it. */
export function lottieInfo(buf) {
  let j;
  try {
    j = JSON.parse(buf.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Lottie dosyası okunamadı: JSON değil');
  }
  const n = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!j || typeof j !== 'object' || Array.isArray(j) || !n(j.fr) || !n(j.ip) || !n(j.op) || !n(j.w) || !n(j.h) || !Array.isArray(j.layers) || !j.layers.length) {
    throw new HttpError(400, 'Lottie animasyonu değil: boyutu, kare hızı ya da katmanları yok');
  }
  if (j.fr <= 0 || j.fr > 120) throw new HttpError(400, `Lottie kare hızı 1–120 olmalı (bu ${j.fr})`);
  if (j.w < 1 || j.h < 1 || j.w > 4096 || j.h > 4096) throw new HttpError(400, 'Lottie boyutu 1–4096 piksel olmalı');
  const ms = Math.round(((j.op - j.ip) / j.fr) * 1000);
  if (!(ms > 0)) throw new HttpError(400, 'Lottie animasyonunun süresi yok');
  if (ms > EMOJI_LIMITS.lottieMaxMs) throw new HttpError(400, `Animasyon en çok ${EMOJI_LIMITS.lottieMaxMs / 1000} saniye olabilir (bu ${(ms / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn)`);
  // Only pictures inside it: one it loaded from elsewhere would be fetched by every phone, or not at all.
  for (const a of Array.isArray(j.assets) ? j.assets : []) {
    if (a && typeof a === 'object' && typeof a.p === 'string' && a.p && !a.p.startsWith('data:')) throw new HttpError(400, 'Lottie dosyasındaki resimler dosyanın içinde olmalı (dışarıdan resim yükleyen animasyon olmaz)');
  }
  return { w: j.w, h: j.h, ms };
}

/** The picture at `url`: uploaded as a sticker's, a transparent PNG or WebP (square or nearly, 96–1024 px) or a Lottie animation. Its kind. */
async function checkArt(url) {
  const key = keyOf(url);
  if (typeof url !== 'string' || !key?.startsWith('stickerart/')) throw new HttpError(400, 'Resmi önce yükle');
  await verifyUpload(url, 'stickerart');
  const kind = key.endsWith('.json') ? 'lottie' : 'image';
  // A stand-in storage (most tests) has nothing to read.
  if (env.UPLOAD_VERIFY === '0') return kind;
  const buf = await readStored(key, EMOJI_LIMITS.artBytes);
  if (kind === 'lottie') {
    lottieInfo(buf);
    return kind;
  }
  const info = imageInfo(buf);
  if (!info) throw new HttpError(400, 'Resim PNG ya da WebP olmalı');
  const { width: w, height: h } = info;
  const L = EMOJI_LIMITS;
  if (Math.min(w, h) < L.artMinPx || Math.max(w, h) > L.artMaxPx) throw new HttpError(400, `Resim ${L.artMinPx}–${L.artMaxPx} piksel olmalı (bu ${w} × ${h})`);
  if (Math.max(w, h) / Math.min(w, h) > 1.25) throw new HttpError(400, `Resim kare olmalı (bu ${w} × ${h})`);
  if (!info.alpha) throw new HttpError(400, 'Resim saydam olmalı: arka planı silinmiş PNG ya da WebP yükle');
  return kind;
}

// --- Admin -----------------------------------------------------------------------------------------------------
async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}
const writeLimit = (a) => limit(`emoji-admin:${a.id}`, 60, 'Çok fazla deneme, biraz bekle');
const audited = (c, a, action, detail, req) =>
  c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, NULL, $3, $4)', [a.id, action, JSON.stringify({ ...detail, ...panelDetail(a) }), clientIp(req)]);
const packNameOf = (v) => text(v, EMOJI_LIMITS.packNameMin, EMOJI_LIMITS.packNameMax, 'Paket adı').replace(/\s+/g, ' ');
const nameOf = (v) => text(v, EMOJI_LIMITS.nameMin, EMOJI_LIMITS.nameMax, 'Ad').replace(/\s+/g, ' ');
const priceOf = (v) => {
  const n = int(v, 0, EMOJI_LIMITS.priceMax);
  if (n === null) throw new HttpError(400, `Fiyat 0–${fmt(EMOJI_LIMITS.priceMax)} jeton arasında bir tam sayı olmalı (0: ücretsiz)`);
  return n;
};
const vipOf = (v) => {
  const n = int(v ?? 0, 0, EMOJI_LIMITS.vipMax);
  if (n === null) throw new HttpError(400, `VIP seviyesi 0–${EMOJI_LIMITS.vipMax} olmalı (0: herkes)`);
  return n;
};
const emojiOf = (v, fallback) => {
  if (v === undefined || v === null || v === '') return fallback;
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s || s.length > 16 || /[\p{L}\p{N}<>&]/u.test(s)) throw new HttpError(400, 'Emoji yalnız bir emoji olmalı');
  return s;
};
const enabledOf = (v) => {
  if (typeof v !== 'boolean') throw new HttpError(400, 'Açık/kapalı geçersiz');
  return v;
};
const linkField = (v) => (v === undefined ? undefined : v === null || v === '' ? null : linkOf(v));
/** No two packs with one name (an older app buys a pack by its name): the app's as they are named now, and the admins'. */
function packNameFree(name, self) {
  const n = lower(name);
  const taken = allPacks().find((p) => p.id !== self && lower(p.name) === n);
  if (taken) throw new HttpError(409, `“${name}” adında bir paket zaten var`);
}
/** The unique name index lost a race: the same answer. */
async function saving(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e?.code === '23505' && e.constraint === 'emoji_packs_name') throw new HttpError(409, 'Bu adda bir paket zaten var');
    throw e;
  }
}
const packId = (v) => {
  if (typeof v === 'string' && (PACK_ID.test(v) || PACKS_BY_ID.has(v))) return v;
  throw new HttpError(400, 'Geçersiz paket');
};
const stickerId = (v) => {
  if (typeof v === 'string' && (STICKER_ID.test(v) || STICKERS_BY_ID.has(v))) return v;
  throw new HttpError(400, 'Geçersiz çıkartma');
};
/** A pack that isn't deleted, as it is now; a 404 otherwise. */
const livePack = (id) => {
  const p = packOf(id);
  if (!p) throw new HttpError(404, 'Paket bulunamadı');
  return p;
};
const liveSticker = (id) => {
  const s = stickerOf(id);
  if (!s) throw new HttpError(404, 'Çıkartma bulunamadı');
  return s;
};
/** Rows for the app's packs or stickers, made the first time anything about one changes: every column null. */
const appPackRows = (c, ids, actor) =>
  c.query(
    `INSERT INTO emoji_packs (id, builtin, created_by, updated_by) SELECT x, true, $2, $2 FROM unnest($1::text[]) AS x ON CONFLICT (id) DO NOTHING`,
    [ids, actor],
  );
const appStickerRows = (c, ids, actor) =>
  c.query(
    `INSERT INTO emoji_stickers (id, builtin, created_by, updated_by) SELECT x, true, $2, $2 FROM unnest($1::text[]) AS x ON CONFLICT (id) DO NOTHING`,
    [ids, actor],
  );
/** UPDATE … SET from a column → value map (undefined left out), the row's rev and who changed it; RETURNING *. */
async function setRow(c, table, id, cols, actor) {
  const vals = [id];
  const sets = [];
  for (const [col, v] of Object.entries(cols)) {
    if (v === undefined) continue;
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  }
  vals.push(actor);
  sets.push(`updated_by = $${vals.length}`, 'updated_at = now()', "rev = nextval('emoji_rev')");
  return (await c.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals)).rows[0];
}
/** What the audit keeps of a row. */
const auditOf = (r) => r && Object.fromEntries(Object.entries(r).filter(([k]) => !['created_at', 'updated_at', 'created_by', 'updated_by', 'rev'].includes(k)));

/** How many people own each sold pack now (entitlements, economy.mjs). */
async function owners() {
  const r = await db.query(
    `SELECT e.sku, count(DISTINCT e.user_id)::int AS n FROM entitlements e
      WHERE e.kind = 'sticker' AND e.revoked_at IS NULL AND e.starts_at <= now() AND (e.ends_at IS NULL OR e.ends_at > now()) GROUP BY e.sku`,
  );
  return new Map(r.rows.map((x) => [x.sku, x.n]));
}

/** Which of an app's pack's values were changed (its row's columns that aren't null), its place aside. */
const packChanged = (r) => (r ? ['name', 'price', 'minVip', 'enabled', 'soon'].filter((k) => r[k] !== null) : []);
const stickerChanged = (r) => (r ? ['pack', 'name', 'emoji', 'enabled', 'art'].filter((k) => r[k] !== null) : []);

/** A sticker as the panel shows it: `picture` is what to draw (the app's own served here, a replaced or own file). */
function stickerView(s) {
  const base = STICKERS_BY_ID.get(s.id);
  const own = base ? artUrl('stickers', s.id) : null;
  return {
    id: s.id,
    builtin: s.builtin,
    pack: s.pack,
    name: s.name,
    emoji: s.emoji,
    enabled: s.enabled,
    sort: s.sort,
    art: s.art ? { url: s.art.url, kind: s.art.kind } : null,
    artLink: s.row?.artLink ?? null,
    picture: s.art?.kind === 'image' ? s.art.url : s.art ? null : own,
    ...(base
      ? { original: { pack: base.pack.id, name: base.sticker.name, emoji: base.sticker.emoji, picture: own, animated: base.pack.animated || EMOJI_TAB_PACKS.includes(base.pack.id) }, changed: stickerChanged(s.row) }
      : {}),
    updatedAt: s.row?.updatedAt ?? null,
  };
}
/** A pack as the panel shows it, with its stickers and how many people own it. */
function packView(p, owned) {
  const base = PACKS_BY_ID.get(p.id);
  return {
    id: p.id,
    builtin: p.builtin,
    name: p.name,
    price: p.price,
    minVip: p.minVip,
    enabled: p.enabled,
    soon: p.soon,
    sort: p.sort,
    roomOnly: p.roomOnly,
    animated: p.animated,
    // The free packs drawn inside the emoji panel's Emoji tab (Duygular, Müzik, Hamle) rather than a tab of their own.
    emojiTab: EMOJI_TAB_PACKS.includes(p.id),
    owners: owned.get(`pack-${p.id}`) ?? 0,
    ...(base ? { original: { name: base.name, price: base.price, minVip: base.minVip, enabled: !base.retired, soon: PACKS_SOON && (base.price > 0 || !!base.minVip) }, changed: packChanged(p.row) } : {}),
    stickers: p.stickers.map(stickerView),
    updatedAt: p.row?.updatedAt ?? null,
  };
}
async function adminPacks() {
  const owned = await owners();
  return allPacks().map((p) => packView(p, owned));
}
const onePack = async (id) => (await adminPacks()).find((p) => p.id === id);
const oneSticker = async (id) => {
  const s = stickerOf(id);
  return s ? stickerView(s) : null;
};
const after = async () => {
  await refreshEmoji();
};

/** The next place at the end of `pack` (a new sticker, or one moved there). */
const lastSort = (pack) => Math.max(-1, ...(packOf(pack)?.stickers ?? []).map((s) => s.sort)) + 1;
/** The place before every pack (a new one goes first). */
const firstPackSort = () => Math.min(1, ...allPacks().map((p) => p.sort)) - 1;

/** Link downloads running now (each up to a sticker's size). */
let fetching = 0;

const PACK_RESET = ['name', 'price', 'minVip', 'enabled', 'soon', 'sort'];
const STICKER_RESET = ['pack', 'name', 'emoji', 'enabled', 'sort', 'art'];
const fieldsOf = (v, all) => {
  if (v === undefined) return all.filter((f) => f !== 'sort');
  if (!Array.isArray(v) || !v.length || !v.every((f) => all.includes(f))) throw new HttpError(400, `Geri alınabilenler: ${all.join(', ')}`);
  return [...new Set(v)];
};

export const emojiRoutes = {
  async 'GET /api/admin/emoji'(req) {
    await admin(req);
    return { packs: await adminPacks(), limits: EMOJI_LIMITS, storage: storageOn() };
  },

  /** A new pack, first among the packs; on the shelves at once unless enabled is false. Stickers come next. */
  async 'POST /api/admin/emoji/packs'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 4096);
    const name = packNameOf(b.name);
    const price = priceOf(b.price);
    const minVip = vipOf(b.minVip);
    const enabled = b.enabled === undefined ? true : enabledOf(b.enabled);
    packNameFree(name, null);
    if (allPacks().length >= EMOJI_LIMITS.packsMax) throw new HttpError(400, `En çok ${EMOJI_LIMITS.packsMax} paket olabilir`);
    const id = await saving(() =>
      tx(async (c) => {
        const id = `ep${(await c.query("SELECT nextval('emoji_ids') AS n")).rows[0].n}`;
        const r = await c.query(
          'INSERT INTO emoji_packs (id, name, price, min_vip, enabled, sort, created_by, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING *',
          [id, name, price, minVip, enabled, firstPackSort(), a.id],
        );
        await audited(c, a, 'emoji.pack_create', { pack: id, after: auditOf(r.rows[0]) }, req);
        return id;
      }),
    );
    await after();
    return { pack: await onePack(id) };
  },

  /** Changes what the body names; the app's own packs too (a value equal to the app's is kept as "unchanged"). */
  async 'POST /api/admin/emoji/packs/update'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 4096);
    const id = packId(b.id);
    const cur = livePack(id);
    const base = PACKS_BY_ID.get(id);
    const as = (v, was) => (base && v === was ? null : v);
    const cols = {};
    if (b.name !== undefined) {
      const name = packNameOf(b.name);
      packNameFree(name, id);
      cols.name = as(name, base?.name);
    }
    if (b.price !== undefined) {
      const price = priceOf(b.price);
      if (price > 0 && cur.roomOnly) throw new HttpError(400, 'Hamle odanın kendi paketi: satılmaz');
      cols.price = as(price, base?.price);
    }
    if (b.minVip !== undefined) cols.min_vip = as(vipOf(b.minVip), base?.minVip);
    if (b.enabled !== undefined) cols.enabled = as(enabledOf(b.enabled), base ? !base.retired : undefined);
    if (b.soon !== undefined) cols.soon = as(enabledOf(b.soon), base ? PACKS_SOON && (base.price > 0 || !!base.minVip) : undefined);
    if (!Object.keys(cols).length) throw new HttpError(400, 'Değişiklik yok');
    await saving(() =>
      tx(async (c) => {
        if (base) await appPackRows(c, [id], a.id);
        const r = (await c.query('SELECT * FROM emoji_packs WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id])).rows[0];
        if (!r) throw new HttpError(404, 'Paket bulunamadı');
        const next = await setRow(c, 'emoji_packs', id, cols, a.id);
        await audited(c, a, 'emoji.pack_update', { pack: id, before: auditOf(r), after: auditOf(next) }, req);
      }),
    );
    await after();
    return { pack: await onePack(id) };
  },

  async 'POST /api/admin/emoji/packs/reset'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 2048);
    const id = packId(b.id);
    const base = PACKS_BY_ID.get(id);
    if (!base) throw new HttpError(400, 'Yalnız uygulamanın kendi paketleri orijinaline döner');
    const fields = fieldsOf(b.fields, PACK_RESET);
    if (fields.includes('name')) packNameFree(base.name, id);
    await saving(() =>
      tx(async (c) => {
        const r = (await c.query('SELECT * FROM emoji_packs WHERE id = $1 FOR UPDATE', [id])).rows[0];
        if (!r) return;
        const col = { name: 'name', price: 'price', minVip: 'min_vip', enabled: 'enabled', soon: 'soon', sort: 'sort' };
        const next = await setRow(c, 'emoji_packs', id, Object.fromEntries(fields.map((f) => [col[f], null])), a.id);
        await audited(c, a, 'emoji.pack_reset', { pack: id, fields, before: auditOf(r), after: auditOf(next) }, req);
      }),
    );
    await after();
    return { pack: await onePack(id) };
  },

  /** An admin's pack nobody owns: gone with its stickers (their pictures too); the app's stickers in it go home. */
  async 'POST /api/admin/emoji/packs/delete'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 1024);
    if (typeof b.id === 'string' && PACKS_BY_ID.has(b.id)) throw new HttpError(400, 'Uygulamanın kendi paketi silinemez: kapatabilir ya da orijinaline döndürebilirsin');
    const id = packId(b.id);
    livePack(id);
    const n = (await owners()).get(`pack-${id}`) ?? 0;
    if (n) throw new HttpError(409, `Bu paketi ${fmt(n)} kişi aldı: silinemez, kapatabilirsin (aldıkları çıkartmalar mesajlarda görünmeye devam eder)`);
    const drop = [];
    await tx(async (c) => {
      const r = (await c.query('SELECT * FROM emoji_packs WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id])).rows[0];
      if (!r) throw new HttpError(404, 'Paket bulunamadı');
      await c.query("UPDATE emoji_packs SET deleted_at = now(), enabled = false, updated_by = $2, updated_at = now(), rev = nextval('emoji_rev') WHERE id = $1", [id, a.id]);
      const s = await c.query(
        "UPDATE emoji_stickers SET deleted_at = now(), enabled = false, art_url = NULL, art_kind = NULL, updated_by = $2, updated_at = now(), rev = nextval('emoji_rev') WHERE pack_id = $1 AND NOT builtin AND deleted_at IS NULL RETURNING id",
        [id, a.id],
      );
      drop.push(...[...snap.stickers.values()].filter((x) => s.rows.some((y) => y.id === x.id)).map((x) => x.art?.url));
      await c.query("UPDATE emoji_stickers SET pack_id = NULL, sort = NULL, updated_by = $2, updated_at = now(), rev = nextval('emoji_rev') WHERE pack_id = $1 AND builtin", [id, a.id]);
      await audited(c, a, 'emoji.pack_delete', { pack: id, before: auditOf(r), stickers: s.rows.map((x) => x.id) }, req);
    });
    removeFiles(drop.filter(Boolean));
    await after();
    return { deleted: true };
  },

  /** The packs' order: each id's place is its index in `ids` (lower first); the app's and the admins' together. */
  async 'POST /api/admin/emoji/packs/order'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 8192);
    if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 200) throw new HttpError(400, 'Sıra listesi geçersiz');
    const ids = b.ids.map(packId);
    if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Bir paket sırada iki kez olamaz');
    ids.forEach(livePack);
    const before = allPacks()
      .filter((p) => ids.includes(p.id))
      .map((p) => p.id);
    await tx(async (c) => {
      await appPackRows(c, ids.filter((id) => PACKS_BY_ID.has(id)), a.id);
      await c.query(
        `UPDATE emoji_packs p SET sort = x.n - 1, rev = nextval('emoji_rev'), updated_by = $2, updated_at = now()
           FROM unnest($1::text[]) WITH ORDINALITY AS x(id, n) WHERE p.id = x.id AND p.sort IS DISTINCT FROM x.n - 1`,
        [ids, a.id],
      );
      await audited(c, a, 'emoji.pack_order', { before, after: ids }, req);
    });
    await after();
    return { packs: await adminPacks() };
  },

  /** A new sticker, last in its pack; on the shelves at once unless enabled is false. */
  async 'POST /api/admin/emoji/stickers'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 4096);
    const pack = livePack(packId(b.pack));
    if (pack.roomOnly) throw new HttpError(400, 'Hamle paketine çıkartma eklenmez: her çıkartması odada bir şey yapar');
    if (pack.stickers.length >= EMOJI_LIMITS.stickersMax) throw new HttpError(400, `Bir pakette en çok ${EMOJI_LIMITS.stickersMax} çıkartma olabilir`);
    const name = nameOf(b.name);
    const emoji = emojiOf(b.emoji, '🙂');
    const enabled = b.enabled === undefined ? true : enabledOf(b.enabled);
    if (typeof b.art !== 'string' || !b.art) throw new HttpError(400, 'Resmi önce yükle');
    const kind = await checkArt(b.art);
    const link = linkField(b.artLink) ?? null;
    const id = await tx(async (c) => {
      const id = `es${(await c.query("SELECT nextval('emoji_ids') AS n")).rows[0].n}`;
      const r = await c.query(
        `INSERT INTO emoji_stickers (id, pack_id, name, emoji, enabled, sort, art_url, art_kind, art_link, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) RETURNING *`,
        [id, pack.id, name, emoji, enabled, lastSort(pack.id), b.art, kind, link, a.id],
      );
      await audited(c, a, 'emoji.sticker_create', { sticker: id, after: auditOf(r.rows[0]) }, req);
      return id;
    });
    await after();
    return { sticker: await oneSticker(id) };
  },

  /** Changes what the body names; the app's own stickers too. A new picture replaces the old file, which is then deleted. */
  async 'POST /api/admin/emoji/stickers/update'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 4096);
    const id = stickerId(b.id);
    const cur = liveSticker(id);
    const base = STICKERS_BY_ID.get(id);
    const cols = {};
    if (b.pack !== undefined) {
      const to = livePack(packId(b.pack));
      if (to.roomOnly || (base?.pack.roomOnly && to.id !== base.pack.id)) throw new HttpError(400, 'Hamle çıkartmaları yalnız kendi paketinde durur');
      if (to.id !== cur.pack) {
        if (to.stickers.length >= EMOJI_LIMITS.stickersMax) throw new HttpError(400, `Bir pakette en çok ${EMOJI_LIMITS.stickersMax} çıkartma olabilir`);
        cols.pack_id = base && to.id === base.pack.id ? null : to.id;
        // At the end of its new pack (back in its own: its place there, unless it was moved within it).
        cols.sort = base && to.id === base.pack.id ? null : lastSort(to.id);
      }
    }
    if (b.name !== undefined) {
      const name = nameOf(b.name);
      cols.name = base && name === base.sticker.name ? null : name;
    }
    if (b.emoji !== undefined) {
      const emoji = emojiOf(b.emoji, base?.sticker.emoji ?? cur.emoji);
      cols.emoji = base && emoji === base.sticker.emoji ? null : emoji;
    }
    if (b.enabled !== undefined) cols.enabled = base && b.enabled === true ? null : enabledOf(b.enabled);
    const drop = [];
    if (b.art !== undefined) {
      if (b.art === null || (base && b.art === artUrl('stickers', id))) {
        if (!base) throw new HttpError(400, 'Çıkartmanın bir resmi olmalı');
        if (cur.art) {
          Object.assign(cols, { art_url: null, art_kind: null, art_link: null });
          drop.push(cur.art.url);
        }
      } else if (b.art !== cur.art?.url) {
        const kind = await checkArt(b.art);
        Object.assign(cols, { art_url: b.art, art_kind: kind, art_link: linkField(b.artLink) ?? null });
        if (cur.art) drop.push(cur.art.url);
      }
    }
    if (cols.art_url === undefined && b.artLink !== undefined && cur.art) cols.art_link = linkField(b.artLink);
    if (!Object.keys(cols).length) throw new HttpError(400, 'Değişiklik yok');
    await tx(async (c) => {
      if (base) await appStickerRows(c, [id], a.id);
      const r = (await c.query('SELECT * FROM emoji_stickers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id])).rows[0];
      if (!r) throw new HttpError(404, 'Çıkartma bulunamadı');
      const next = await setRow(c, 'emoji_stickers', id, cols, a.id);
      await audited(c, a, 'emoji.sticker_update', { sticker: id, before: auditOf(r), after: auditOf(next) }, req);
    });
    removeFiles(drop.filter(Boolean));
    await after();
    return { sticker: await oneSticker(id) };
  },

  async 'POST /api/admin/emoji/stickers/reset'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 2048);
    const id = stickerId(b.id);
    if (!STICKERS_BY_ID.has(id)) throw new HttpError(400, 'Yalnız uygulamanın kendi çıkartmaları orijinaline döner');
    const fields = fieldsOf(b.fields, STICKER_RESET);
    const drop = [];
    await tx(async (c) => {
      const r = (await c.query('SELECT * FROM emoji_stickers WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!r) return;
      const cols = {};
      if (fields.includes('pack')) Object.assign(cols, { pack_id: null, ...(r.pack_id !== null ? { sort: null } : {}) });
      if (fields.includes('name')) cols.name = null;
      if (fields.includes('emoji')) cols.emoji = null;
      if (fields.includes('enabled')) cols.enabled = null;
      if (fields.includes('sort')) cols.sort = null;
      if (fields.includes('art')) {
        Object.assign(cols, { art_url: null, art_kind: null, art_link: null });
        drop.push(r.art_url);
      }
      const next = await setRow(c, 'emoji_stickers', id, cols, a.id);
      await audited(c, a, 'emoji.sticker_reset', { sticker: id, fields, before: auditOf(r), after: auditOf(next) }, req);
    });
    removeFiles(drop.filter(Boolean));
    await after();
    return { sticker: await oneSticker(id) };
  },

  /** An admin's sticker off every pack; where it was sent it shows as its emoji, its picture goes. */
  async 'POST /api/admin/emoji/stickers/delete'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 1024);
    if (typeof b.id === 'string' && STICKERS_BY_ID.has(b.id)) throw new HttpError(400, 'Uygulamanın kendi çıkartması silinemez: kapatabilir ya da orijinaline döndürebilirsin');
    const id = stickerId(b.id);
    const cur = liveSticker(id);
    await tx(async (c) => {
      const r = (await c.query('SELECT * FROM emoji_stickers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id])).rows[0];
      if (!r) throw new HttpError(404, 'Çıkartma bulunamadı');
      await c.query("UPDATE emoji_stickers SET deleted_at = now(), enabled = false, art_url = NULL, art_kind = NULL, updated_by = $2, updated_at = now(), rev = nextval('emoji_rev') WHERE id = $1", [id, a.id]);
      await audited(c, a, 'emoji.sticker_delete', { sticker: id, before: auditOf(r) }, req);
    });
    removeFiles([cur.art?.url].filter(Boolean));
    await after();
    return { deleted: true };
  },

  /** A pack's stickers' order: each id's place is its index in `ids` (lower first). */
  async 'POST /api/admin/emoji/stickers/order'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 16_384);
    const pack = livePack(packId(b.pack));
    if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 200) throw new HttpError(400, 'Sıra listesi geçersiz');
    const ids = b.ids.map(stickerId);
    if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Bir çıkartma sırada iki kez olamaz');
    if (!ids.every((id) => pack.stickers.some((s) => s.id === id))) throw new HttpError(400, 'Sıradaki çıkartmalar bu pakette olmalı');
    const before = pack.stickers.filter((s) => ids.includes(s.id)).map((s) => s.id);
    await tx(async (c) => {
      await appStickerRows(c, ids.filter((id) => STICKERS_BY_ID.has(id)), a.id);
      await c.query(
        `UPDATE emoji_stickers s SET sort = x.n - 1, rev = nextval('emoji_rev'), updated_by = $2, updated_at = now()
           FROM unnest($1::text[]) WITH ORDINALITY AS x(id, n) WHERE s.id = x.id AND s.sort IS DISTINCT FROM x.n - 1`,
        [ids, a.id],
      );
      await audited(c, a, 'emoji.sticker_order', { pack: pack.id, before, after: ids }, req);
    });
    await after();
    return { packs: await adminPacks() };
  },

  /**
   * A sticker's picture from a link the admin pasted: downloaded once here (link-fetch.mjs: public addresses only, the
   * kind's size, a minute), what it is read from its first bytes (PNG, WebP or a Lottie JSON), stored as if uploaded;
   * the save then checks it like any upload. Each try (a refusal too) is an audit_events row with the link.
   */
  async 'POST /api/admin/emoji/fetch'(req) {
    const a = await admin(req);
    limit(`emoji-fetch:${a.id}`, 10, 'Çok fazla bağlantı denemesi, biraz bekle');
    const b = await readJson(req, 4096);
    const pasted = typeof b.url === 'string' ? b.url.trim().slice(0, 2000) : null;
    const note = (detail) => db.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, NULL, $3, $4)', [a.id, 'emoji.fetch', JSON.stringify({ link: pasted, ...detail, ...panelDetail(a) }), clientIp(req)]).catch(() => {});
    let counted = false;
    try {
      const link = linkOf(b.url);
      if (!storageOn()) throw new HttpError(503, 'Dosya deposu ayarlı değil: bağlantıdan da yüklenemez');
      if (fetching >= 4) throw new HttpError(429, 'Şu an başka bağlantılar indiriliyor, biraz sonra tekrar dene');
      fetching++;
      counted = true;
      const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'similar-sticker-'));
      try {
        const file = path.join(dir, 'file');
        const got = await download(link, file, { max: EMOJI_LIMITS.artBytes, ms: 60_000 });
        const head = got.head;
        const type =
          head.length >= 8 && head.readUInt32BE(0) === 0x89504e47 ? 'image/png'
          : head.length >= 12 && head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP' ? 'image/webp'
          : /^\s*\{/.test(head.toString('utf8', 0, Math.min(head.length, 64))) ? 'application/json'
          : null;
        if (!type) throw new HttpError(400, 'Çıkartma resmi PNG, WebP ya da Lottie (JSON) olmalı; bağlantıdaki başka bir dosya');
        const url = await storeFile('stickerart', a.id, file, type);
        await note({ type, bytes: got.bytes, file: keyOf(url) });
        return { url, link, kind: type === 'application/json' ? 'lottie' : 'image', type, bytes: got.bytes };
      } finally {
        await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    } catch (e) {
      await note({ refused: String(e?.message ?? e).slice(0, 300) });
      throw e;
    } finally {
      if (counted) fetching--;
    }
  },
};
