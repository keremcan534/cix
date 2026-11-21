// Seviye ve VIP ayarları (docs/SEVIYE_AYARLARI.md): VIP, Rütbe, Cömertlik, Yankı and Abonelik as the owners set them in
// the finance panel: each level's points (or a Rütbe tier's price and days), names, which perk opens at which level,
// the level drop for the inactive, and the subscription plans shown. One document per system in level_settings
// (075); no row: the compiled values (catalog.mjs SVIP_XP, SHOP noble rows, VIP_SUBS; profile-rules.mjs curves),
// so nothing changes until the panel saves.
//
// Everything that decides by a level reads it here: VIP level (gift and shop gates, looks, room password), the
// Cömertlik and Yankı levels (badges, Oyun Salonu, Anlar), and the perks the server enforces (hide levels, room
// password, silent visit, profile visitors). The panel's routes, the change preview and the daily level drop are in
// levels-admin.mjs (they need the point sums, which import this module).
//
// Phones: GET /api/catalog?levels=1 sends levelsPayload() and its `v` grows with every save; an older app doesn't
// ask and keeps its compiled tables (the server's checks follow the settings for everyone).

import { HttpError, db, env, int, text } from './core.mjs';
import { SHOP, SVIP_XP, VIP_SUBS } from './catalog.mjs';
import { CHARM_XP, WEALTH_XP } from './profile-rules.mjs';

const positive = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const POLL_MS = positive(env.LEVELS_POLL_MS, 5000);

export const SYSTEMS = Object.freeze(['vip', 'noble', 'wealth', 'charm', 'sub']);
/** Where a level drop may apply (Rütbe and Abonelik end with their days). */
export const DECAYING = Object.freeze(['vip', 'wealth', 'charm']);
export const SYSTEM_NAMES = Object.freeze({ vip: 'VIP', noble: 'Rütbe', wealth: 'Cömertlik', charm: 'Yankı', sub: 'Abonelik' });

/**
 * Every perk the app may show: `ready` ones the app and the server do (they may be put at any level, turned on or
 * off), the others are not built yet (listed so the panel shows them; they can't be turned on). `gate`: a level the
 * server checks before letting someone in (always on; only its level moves). `systems`: where it may be given.
 */
export const PERKS = Object.freeze(
  [
    { key: 'badge', name: 'Rozet', systems: ['vip', 'noble', 'wealth', 'charm'], ready: true },
    { key: 'frame', name: 'Profil çerçevesi', systems: ['vip', 'noble'], ready: true },
    { key: 'hide_levels', name: 'Seviyeleri gizle', systems: ['vip', 'noble', 'sub'], ready: true },
    { key: 'room_password', name: 'Oda şifresi / kilitleme', systems: ['vip', 'noble'], ready: true },
    // Each item and gift has its own VIP level too (the shop's minVip, Yönetim › Hediyeler minSvip); this one is the
    // lowest VIP level any of them opens at (vipItemNeed).
    { key: 'vip_store', name: 'VIP mağaza eşyaları', systems: ['vip'], ready: true, gate: true },
    { key: 'vip_gifts', name: 'Üyelere özel hediyeler', systems: ['vip'], ready: true, gate: true },
    { key: 'silent_visit', name: 'Sessiz ziyaret', systems: ['vip', 'noble'], ready: true },
    { key: 'entry_greeting', name: 'Giriş karşılaması', systems: ['noble'], ready: true },
    { key: 'visitors', name: 'Profiline bakanları gör', systems: ['vip', 'sub'], ready: true },
    { key: 'discover_boost', name: "Ana Sayfa'da öne çıkma", systems: ['charm'], ready: true },
    { key: 'moments_post', name: "Anlar'da paylaşım", systems: ['charm'], ready: true, gate: true },
    { key: 'casino', name: 'Oyun Salonu', systems: ['wealth'], ready: true, gate: true },
    // Not built yet (Güncelleme 6 hid them in the app).
    { key: 'entry_announce', name: 'Özel giriş duyurusu', systems: ['vip', 'noble', 'wealth', 'charm'], ready: false },
    { key: 'chat_bubble', name: 'Renkli sohbet balonu', systems: ['vip', 'noble', 'wealth', 'charm'], ready: false },
    { key: 'points_shop', name: 'Puanla alışveriş', systems: ['vip'], ready: false },
    { key: 'card_frame', name: 'Profil kartı çerçevesi', systems: ['vip', 'noble'], ready: false },
    { key: 'gift_streak', name: 'Hediye serisi efekti', systems: ['vip'], ready: false },
    { key: 'custom_title', name: 'Kendi unvanını yaz', systems: ['vip', 'noble'], ready: false },
    { key: 'full_room', name: 'Dolu odaya girme', systems: ['vip', 'noble'], ready: false },
    { key: 'translate', name: 'Mesaj çevirisi', systems: ['vip', 'sub'], ready: false },
    { key: 'earn_bonus', name: 'Kazanç bonusu', systems: ['charm'], ready: false },
    { key: 'medal', name: 'Madalya', systems: ['vip', 'wealth', 'charm'], ready: false },
    { key: 'mic_ring', name: 'Mikrofon halkası', systems: ['vip', 'noble', 'charm'], ready: false },
    { key: 'ride', name: 'Binek', systems: ['vip', 'noble', 'charm'], ready: false },
    { key: 'level_gift', name: 'Seviye hediyesi', systems: ['wealth'], ready: false },
    { key: 'level_announce', name: 'Odada ve platformda seviye duyurusu', systems: ['wealth', 'charm'], ready: false },
    { key: 'call_discount', name: 'Arama indirimi', systems: ['sub'], ready: false },
    { key: 'free_match', name: 'Günlük ücretsiz eşleşme', systems: ['sub'], ready: false },
    { key: 'gold_name', name: 'Altın isim', systems: ['sub', 'vip'], ready: false },
    { key: 'welcome_box', name: 'Hoş Geldin Kutusu', systems: ['sub'], ready: false },
  ].map((p) => Object.freeze({ gate: false, ...p, systems: Object.freeze(p.systems) })),
);
export const PERK = new Map(PERKS.map((p) => [p.key, p]));

// --- Today's values: the settings until the panel saves -----------------------------------------------------------
const NOBLE = [1, 2, 3, 4, 5].map((tier) => SHOP.get(`noble-${tier}`));
const groups = (list) => list.map(([name, from, to]) => ({ from, to, name }));
const perk = (key, from = 1) => ({ key, from, on: true });
const OFF = Object.freeze({ on: false, idleDays: 30, drop: 1, everyDays: 30, floor: 0 });
/** The app's strike-through "was" prices (app data/status.ts VIP_PLANS); 0 shows none. */
const WAS = { 7: 299, 30: 1199, 90: 3599 };
const LABEL = { 7: '7 Gün', 30: '1 Ay', 90: '3 Ay' };

/** A price rounded to a round number of coins (100s; 1000s from 100.000). */
const roundPrice = (n) => {
  const step = n >= 100_000 ? 1000 : 100;
  return Math.max(step, Math.round(n / step) * step);
};
/**
 * A Rütbe tier's packages besides its main term (21 Nov 2026, the owners' sample: 7, 30 and 90 days): for a 30-day
 * main term at `price`, a week at its share plus about 10% (so the month reads ~9% off the week's rate) and three months
 * about 14% off the week's rate. Another main term gets none until staff set them.
 */
export function nobleDefaultPlans(price, days = 30) {
  if (days !== 30) return [];
  return [
    { days: 7, price: roundPrice((price * 7) / 30 / 0.91) },
    { days: 90, price: roundPrice(price * 3 * 0.95) },
  ];
}

export const DEFAULTS = Object.freeze({
  vip: {
    levels: SVIP_XP.map((points, i) => ({ level: i + 1, points, name: `VIP ${i + 1}` })),
    // vip_gifts 1: a gift made in Yönetim › Hediyeler may open at VIP 1 (the app's own start at VIP 2).
    perks: [perk('badge'), perk('frame'), perk('hide_levels'), perk('room_password'), perk('vip_store'), perk('vip_gifts'), perk('silent_visit', 7)],
    decay: OFF,
  },
  noble: {
    levels: NOBLE.map((x) => ({ level: x.tier, name: x.name, price: x.price, days: x.days, plans: nobleDefaultPlans(x.price, x.days) })),
    // Any Rütbe tier hides levels and sets a room password; Sessiz ziyaret from Kont (the third tier).
    perks: [perk('badge'), perk('room_password'), perk('hide_levels'), perk('entry_greeting'), perk('frame'), perk('silent_visit', 3)],
  },
  wealth: {
    levels: WEALTH_XP.map((points, level) => ({ level, points })),
    groups: groups([['Kuvars', 0, 4], ['Opal', 5, 9], ['Akik', 10, 14], ['Ametist', 15, 19], ['Topaz', 20, 24], ['Zümrüt', 25, 28], ['Yakut', 29, 32], ['Safir', 33, 36], ['Pırlanta', 37, 40], ['Hazine', 41, 45], ['Efsane', 46, 50]]),
    perks: [perk('badge'), perk('casino', 2)],
    decay: OFF,
  },
  charm: {
    levels: CHARM_XP.map((points, level) => ({ level, points })),
    groups: groups([
      ['Kıvılcım', 0, 5], ['Işıltı', 6, 10], ['Parıltı', 11, 15], ['Şafak', 16, 20], ['Ay Işığı', 21, 25],
      ['Yıldız', 26, 30], ['Kutup Yıldızı', 31, 35], ['Gökkuşağı', 36, 40], ['Kutup Işığı', 41, 45], ['Efsane Yankı', 46, 50],
    ]),
    perks: [perk('badge'), perk('discover_boost'), perk('moments_post', 5)],
    decay: OFF,
  },
  sub: {
    plans: VIP_SUBS.map((p) => ({ productId: p.productId, days: p.days, visible: true, label: LABEL[p.days] ?? `${p.days} Gün`, tl: p.tl, was: WAS[p.days] ?? 0 })),
    perks: [perk('visitors'), perk('hide_levels')],
  },
});

// --- Checking a document the panel sends -----------------------------------------------------------------------
const LIMITS = Object.freeze({ vipLevels: 15, points: 1e12, price: 1e9, days: 365, idleDays: 365, drop: 10, groups: 20, name: 24, label: 30, tl: 100_000 });
const bad = (message) => new HttpError(400, message);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const listOf = (v, what) => {
  if (!Array.isArray(v)) throw bad(`${what} listesi gerekli`);
  return v;
};
const nameOf = (v, what) => text(v, 1, LIMITS.name, what).replace(/\s+/g, ' ');
/** Points that grow strictly level by level; `from0`: the list starts at Lv.0 with 0 points. */
function pointsList(levels, what, from0) {
  let prev = -1;
  return levels.map((l, i) => {
    const x = obj(l);
    const points = x ? int(x.points, from0 && i === 0 ? 0 : 1, LIMITS.points) : null;
    if (points === null) throw bad(`${what} Lv.${from0 ? i : i + 1}: puan 1 ile ${LIMITS.points.toLocaleString('tr-TR')} arasında tam sayı olmalı`);
    if (from0 && i === 0 && points !== 0) throw bad(`${what} Lv.0 0 puandır`);
    if (points <= prev) throw bad(`${what} Lv.${from0 ? i : i + 1} puanı bir öncekinden büyük olmalı`);
    prev = points;
    return { x, points };
  });
}
/**
 * A Rütbe tier's other packages (besides its main `days` term at `price`): at most two, each { days, price }, days
 * 1–365 and none twice nor the main term's. Missing (a document saved before packages): the defaults.
 */
function plansOf(v, price, days, tier) {
  if (v === undefined) return nobleDefaultPlans(price, days);
  const list = listOf(v, 'Paket');
  if (list.length > 2) throw bad(`Rütbe ${tier}: ana sürenin yanında en fazla 2 paket olur`);
  const seen = new Set([days]);
  return list
    .map((p) => {
      const x = obj(p) ?? {};
      const d = int(x.days, 1, LIMITS.days);
      const pr = int(x.price, 1, LIMITS.price);
      if (d === null) throw bad(`Rütbe ${tier}: paket süresi 1–${LIMITS.days} gün olmalı`);
      if (seen.has(d)) throw bad(`Rütbe ${tier}: ${d} günlük paket iki kez var`);
      seen.add(d);
      if (pr === null) throw bad(`Rütbe ${tier}: ${d} günlük paketin fiyatı 1 jeton ile ${LIMITS.price.toLocaleString('tr-TR')} jeton arasında olmalı`);
      return { days: d, price: pr };
    })
    .sort((a, b) => a.days - b.days);
}

function perksOf(system, v, top, bottom) {
  const seen = new Set();
  const out = [];
  for (const p of listOf(v ?? [], 'Hak')) {
    const x = obj(p);
    const def = x && typeof x.key === 'string' ? PERK.get(x.key) : undefined;
    if (!def || !def.systems.includes(system)) throw bad(`${SYSTEM_NAMES[system]} için olmayan bir hak: ${String(x?.key ?? '')}`);
    if (seen.has(def.key)) throw bad(`"${def.name}" iki kez verilmiş`);
    seen.add(def.key);
    const on = x.on === undefined ? true : x.on;
    if (typeof on !== 'boolean') throw bad(`"${def.name}": açık / kapalı seçimi geçersiz`);
    if (on && !def.ready) throw bad(`"${def.name}" henüz yapılmadı; açılamaz`);
    if (!on && def.gate) throw bad(`"${def.name}" kapatılamaz; yalnız seviyesi değişir`);
    const from = system === 'sub' ? 1 : int(x.from, bottom, top);
    if (from === null) throw bad(`"${def.name}": seviye ${bottom}–${top} arasında olmalı`);
    out.push({ key: def.key, from, on });
  }
  // A gate always exists where it is given today (Oyun Salonu, Anlar).
  for (const def of PERKS) if (def.gate && def.systems.includes(system) && !seen.has(def.key)) throw bad(`"${def.name}" seviyesi gerekli`);
  return out;
}
function decayOf(v, top) {
  const x = obj(v) ?? {};
  const on = x.on === undefined ? false : x.on;
  if (typeof on !== 'boolean') throw bad('Seviye düşmesi: açık / kapalı seçimi geçersiz');
  const idleDays = int(x.idleDays ?? OFF.idleDays, 1, LIMITS.idleDays);
  const drop = int(x.drop ?? OFF.drop, 1, LIMITS.drop);
  const everyDays = int(x.everyDays ?? OFF.everyDays, 1, LIMITS.idleDays);
  const floor = int(x.floor ?? OFF.floor, 0, top);
  if (idleDays === null) throw bad(`Seviye düşmesi: hareketsizlik 1–${LIMITS.idleDays} gün olmalı`);
  if (drop === null) throw bad(`Seviye düşmesi: bir seferde 1–${LIMITS.drop} seviye düşebilir`);
  if (everyDays === null) throw bad(`Seviye düşmesi: tekrar 1–${LIMITS.idleDays} günde bir olmalı`);
  if (floor === null) throw bad(`Seviye düşmesi: taban 0–${top} arasında olmalı`);
  return { on, idleDays, drop, everyDays, floor };
}
/** Groups covering Lv.0–50 in order, each with a name. */
function groupsOf(v, what) {
  const list = listOf(v, `${what} grup`);
  if (!list.length || list.length > LIMITS.groups) throw bad(`${what}: 1–${LIMITS.groups} grup olmalı`);
  let next = 0;
  const out = list.map((g) => {
    const x = obj(g);
    const from = x ? int(x.from, 0, 50) : null;
    const to = x ? int(x.to, 0, 50) : null;
    if (from !== next || to === null || to < from) throw bad(`${what} grupları Lv.0'dan Lv.50'ye boşluksuz ve sırayla olmalı`);
    next = to + 1;
    return { from, to, name: nameOf(x.name, `${what} grup adı`) };
  });
  if (next !== 51) throw bad(`${what} grupları Lv.50'ye kadar gitmeli`);
  return out;
}

/** The panel's document for `system`, checked and in its stored shape; a 400 that says what to fix. */
export function validate(system, input) {
  const doc = obj(input);
  if (!doc) throw bad('Ayarlar gerekli');
  if (system === 'vip') {
    const levels = listOf(doc.levels, 'Seviye');
    if (levels.length < 1 || levels.length > LIMITS.vipLevels) throw bad(`VIP 1–${LIMITS.vipLevels} seviye olabilir`);
    const pts = pointsList(levels, 'VIP', false);
    const top = levels.length;
    return {
      levels: pts.map(({ x, points }, i) => ({ level: i + 1, points, name: nameOf(x.name ?? `VIP ${i + 1}`, `VIP ${i + 1} adı`) })),
      perks: perksOf('vip', doc.perks, top, 1),
      decay: decayOf(doc.decay, top),
    };
  }
  if (system === 'noble') {
    const levels = listOf(doc.levels, 'Kademe');
    if (levels.length !== NOBLE.length) throw bad(`Rütbe ${NOBLE.length} kademedir`);
    return {
      levels: levels.map((l, i) => {
        const x = obj(l) ?? {};
        const price = int(x.price, 1, LIMITS.price);
        const days = int(x.days, 1, LIMITS.days);
        if (price === null) throw bad(`Rütbe ${i + 1}: fiyat 1 jeton ile ${LIMITS.price.toLocaleString('tr-TR')} jeton arasında olmalı`);
        if (days === null) throw bad(`Rütbe ${i + 1}: süre 1–${LIMITS.days} gün olmalı`);
        return { level: i + 1, name: nameOf(x.name, `Rütbe ${i + 1} adı`), price, days, plans: plansOf(x.plans, price, days, i + 1) };
      }),
      perks: perksOf('noble', doc.perks, NOBLE.length, 1),
    };
  }
  if (system === 'wealth' || system === 'charm') {
    const what = SYSTEM_NAMES[system];
    const levels = listOf(doc.levels, 'Seviye');
    if (levels.length !== 51) throw bad(`${what} Lv.0–50 olmak üzere 51 seviyedir`);
    return {
      levels: pointsList(levels, what, true).map(({ points }, level) => ({ level, points })),
      groups: groupsOf(doc.groups, what),
      perks: perksOf(system, doc.perks, 50, 0),
      decay: decayOf(doc.decay, 50),
    };
  }
  if (system === 'sub') {
    const plans = listOf(doc.plans, 'Paket');
    const known = new Map(VIP_SUBS.map((p) => [p.productId, p]));
    const seen = new Set();
    const out = plans.map((p) => {
      const x = obj(p) ?? {};
      const base = known.get(x.productId);
      if (!base || seen.has(base.productId)) throw bad('Bilinmeyen ya da iki kez yazılmış abonelik paketi');
      seen.add(base.productId);
      if (typeof x.visible !== 'boolean') throw bad(`${base.productId}: görünür / gizli seçimi geçersiz`);
      const tl = Number(x.tl);
      const was = Number(x.was ?? 0);
      if (!Number.isFinite(tl) || tl <= 0 || tl > LIMITS.tl) throw bad(`${base.productId}: uygulamada yazan fiyat 0 ile ${LIMITS.tl.toLocaleString('tr-TR')} TL arasında olmalı`);
      if (!Number.isFinite(was) || was < 0 || was > LIMITS.tl || (was > 0 && was <= tl)) throw bad(`${base.productId}: üstü çizili fiyat ya 0 (yok) ya da fiyattan büyük olmalı`);
      return { productId: base.productId, days: base.days, visible: x.visible, label: text(x.label, 1, LIMITS.label, `${base.productId} etiketi`), tl: Math.round(tl * 100) / 100, was: Math.round(was * 100) / 100 };
    });
    if (out.length !== known.size) throw bad('Her abonelik paketi listede olmalı');
    if (!out.some((p) => p.visible)) throw bad('En az bir abonelik paketi görünür olmalı');
    return { plans: out, perks: perksOf('sub', doc.perks, 1, 1) };
  }
  throw bad('Bilinmeyen seviye sistemi');
}

// --- The settings in effect, read again when another process saves -----------------------------------------------
const clone = (x) => JSON.parse(JSON.stringify(x));
let snap = { rev: 0, docs: clone(DEFAULTS), meta: {} };

/** Reads level_settings again: each saved system its stored document, the others the compiled values. */
export async function refreshLevels(q = db) {
  const r = await q.query('SELECT system, doc, rev, updated_at, updated_by FROM level_settings');
  const docs = clone(DEFAULTS);
  const meta = {};
  let rev = 0;
  for (const row of r.rows) {
    if (!SYSTEMS.includes(row.system)) continue;
    try {
      // Checked again: a stored document a later version can't read keeps today's values instead of failing.
      docs[row.system] = validate(row.system, row.doc);
      meta[row.system] = { rev: Number(row.rev), updatedAt: row.updated_at, updatedBy: row.updated_by };
    } catch (e) {
      console.error('level settings unreadable', row.system, String(e?.message ?? e).slice(0, 200));
    }
    rev = Math.max(rev, Number(row.rev));
  }
  snap = { rev, docs, meta };
  return snap;
}

let timer = null;
export function startLevels() {
  if (timer) return;
  let busy = false;
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await db.query('SELECT coalesce(max(rev), 0) AS rev FROM level_settings');
      if (Number(r.rows[0].rev) !== snap.rev) await refreshLevels();
    } catch (e) {
      console.error('level settings sync failed', String(e?.message ?? e).slice(0, 200));
    } finally {
      busy = false;
    }
  }, POLL_MS);
  timer.unref();
  void refreshLevels().catch((e) => console.error('level settings read failed', String(e?.message ?? e).slice(0, 200)));
}
export function stopLevels() {
  clearInterval(timer);
  timer = null;
}
/** Grows with every save (the phones' catalog version follows it). */
export const levelsRev = () => snap.rev;
/** One system's document in effect (a copy) and when it was saved. */
export const settingsOf = (system) => ({ doc: clone(snap.docs[system]), meta: snap.meta[system] ?? null });
/** Every system's document in effect (read only: the helpers below take it to compare with a draft). */
export const docsNow = () => snap.docs;

// --- Levels by the settings in effect ---------------------------------------------------------------------------
const highest = (levels, points) => {
  let n = 0;
  for (const l of levels) if (points >= l.points) n = l.level;
  return n;
};
/** VIP (SVIP) level of these purchase points. */
export const svipLevel = (xp, docs = snap.docs) => highest(docs.vip.levels, Number(xp) || 0);
/**
 * The VIP level the app shows (frames, shop gates): the person's own VIP level, by purchase points. Rütbe is a system of
 * its own (its own badge and rights, levels.mjs noble) and adds nothing to it (owners' decision, 21 Nov 2026: before,
 * three VIP levels per Rütbe tier made Paşa show "VIP 15"). `nobleTier` is kept for the callers and ignored.
 */
export const vipLevelOf = (svipXp, nobleTier, docs = snap.docs) => svipLevel(svipXp, docs);
export const wealthLevel = (points, docs = snap.docs) => highest(docs.wealth.levels, Number(points) || 0);
export const charmLevel = (points, docs = snap.docs) => highest(docs.charm.levels, Number(points) || 0);
/** The points `level` starts at in `system` (vip, wealth, charm); 0 below the first. */
export const pointsAt = (system, level, docs = snap.docs) => docs[system].levels.find((l) => l.level === level)?.points ?? (level <= 0 ? 0 : docs[system].levels.at(-1).points);
/** The top level's points (test servers put admins there, test-admin.mjs). */
export const topPoints = (system) => snap.docs[system].levels.at(-1).points;
/** A Rütbe tier as the panel set it (name, price, days), or null. */
export const nobleTierOf = (tier) => snap.docs.noble.levels.find((l) => l.level === Number(tier)) ?? null;
/**
 * The shop item for a Rütbe tier with the panel's name, price and days (economy.mjs sells and labels with it): its main
 * term, or the package of `days` when the tier has one (7 and 90 days by default); the main term for any other `days`.
 */
export const nobleItem = (item, days) => {
  if (!item || item.kind !== 'noble') return item;
  const t = nobleTierOf(item.tier);
  if (!t) return item;
  const plan = days !== undefined && days !== t.days ? t.plans?.find((p) => p.days === days) : undefined;
  return Object.freeze({ ...item, name: t.name, price: plan?.price ?? t.price, days: plan?.days ?? t.days });
};
/** The subscription plans as the panel set them (shown ones first in their order). */
export const subPlans = () => snap.docs.sub.plans.map((p) => ({ ...p }));

/** The level from which `key` opens in `system`, or null when it isn't given there or is off. */
export const perkFrom = (system, key, docs = snap.docs) => {
  const p = docs[system].perks.find((x) => x.key === key && x.on);
  return p ? p.from : null;
};
/**
 * Whether one with these has `key` from any system that gives it: VIP by purchase points, a Rütbe tier, a running
 * subscription, Cömertlik and Yankı by points (left out when not known: those don't count).
 */
export function hasPerk(key, { svipXp = 0, nobleTier = 0, sub = false, wealth = null, charm = null } = {}, docs = snap.docs) {
  const vip = perkFrom('vip', key, docs);
  if (vip !== null && svipLevel(svipXp, docs) >= vip) return true;
  const noble = perkFrom('noble', key, docs);
  if (noble !== null && nobleTier && Number(nobleTier) >= noble) return true;
  if (sub && perkFrom('sub', key, docs) !== null) return true;
  const w = perkFrom('wealth', key, docs);
  if (w !== null && wealth !== null && wealthLevel(wealth, docs) >= w) return true;
  const c = perkFrom('charm', key, docs);
  return c !== null && charm !== null && charmLevel(charm, docs) >= c;
}
/** A gate's level and the points it starts at: Oyun Salonu (Cömertlik), Anlar posting (Yankı). */
const gate = (system, key, fallback) => {
  const level = perkFrom(system, key) ?? fallback;
  return { level, points: pointsAt(system, level) };
};
export const casinoNeed = () => gate('wealth', 'casino', 2);
export const momentsNeed = () => gate('charm', 'moments_post', 5);
/**
 * The VIP level a members-only item needs: its own (a gift's minSvip, a shop item's minVip) and at least the level
 * the settings open `vip_gifts` / `vip_store` at. 0 for an item open to everyone.
 */
export const vipItemNeed = (key, own) => (Number(own) > 0 ? Math.max(Number(own), perkFrom('vip', key) ?? 1) : 0);

/**
 * Cömertlik and Yankı are summed from the ledger; a level drop takes points off in level_offsets (levels-admin.mjs).
 * `points` (id → summed points) less each one's offset, never below 0.
 */
export async function withOffsets(c, system, points) {
  const ids = [...points.keys()];
  if (!ids.length) return points;
  const r = await c.query('SELECT user_id, points FROM level_offsets WHERE system = $1 AND user_id = ANY($2::uuid[]) AND points > 0', [system, ids]);
  for (const x of r.rows) points.set(x.user_id, Math.max(0, (points.get(x.user_id) ?? 0) - Number(x.points)));
  return points;
}

/**
 * What a phone that asks (catalog levels=1) reads: each system's levels, group names, the perks that are on and
 * built, the level drop when it is on (the pages say it), and the shown subscription plans.
 */
export function levelsPayload() {
  const d = snap.docs;
  const shown = (perks) => perks.filter((p) => p.on && PERK.get(p.key)?.ready).map(({ key, from }) => ({ key, from }));
  const decay = (x) => (x.on ? { idleDays: x.idleDays, drop: x.drop, everyDays: x.everyDays, floor: x.floor } : null);
  return {
    rev: snap.rev,
    perks: PERKS.filter((p) => p.ready).map(({ key, name }) => ({ key, name })),
    vip: { levels: d.vip.levels, perks: shown(d.vip.perks), decay: decay(d.vip.decay) },
    noble: { levels: d.noble.levels, perks: shown(d.noble.perks) },
    wealth: { points: d.wealth.levels.map((l) => l.points), groups: d.wealth.groups, perks: shown(d.wealth.perks), decay: decay(d.wealth.decay) },
    charm: { points: d.charm.levels.map((l) => l.points), groups: d.charm.groups, perks: shown(d.charm.perks), decay: decay(d.charm.decay) },
    sub: { plans: d.sub.plans.filter((p) => p.visible).map(({ productId, days, label, tl, was }) => ({ productId, days, label, tl, was })), perks: shown(d.sub.perks) },
  };
}
