// Seviye ve VIP ayarları as the finance panel set them (server/api/levels.mjs, GET /api/catalog?levels=1 `levels`),
// read without trusting them, and what the screens draw from them. Pure (no React, no storage), so the tests run it.
//
// Every part falls back to the compiled tables on its own: no settings (demo, an older server, a saved copy from an
// older app), or a part that is malformed, gives the app's values for that part (data/status, data/wealth,
// data/charm). The pictures, colours and emblems stay the app's; the server says the points, names, prices, days,
// group ranges, which perk opens where, the level drop rule and the subscription plans shown. The server checks every
// gate again (gifts, shop, Oyun Salonu, Anlar…); this only keeps the screens in step with it.
import type { ArtName } from '@/components/Art';
import { CHARM_TIERS, CHARM_XP } from '@/data/charm';
import { NOBLE_DAYS, NOBLE_SHOWN, NOBLE_TIERS, nobleDefaultPlans, type NobleRight, SVIP_LEVELS, SVIP_SHOWN, VIP_COMPARE, VIP_PERKS, VIP_PLANS, type ShownRight } from '@/data/status';
import { WEALTH_TIERS, WEALTH_XP, levelFromTable, type LevelTier } from '@/data/wealth';
import { WHEEL_NEED_LEVEL } from '@/data/wheel';

export type LevelSystem = 'vip' | 'noble' | 'wealth' | 'charm' | 'sub';
/** A Rütbe tier as Seviye ayarları sell it: its main term and its other packages (`plans`, absent from an older server). */
export type NobleLevel = { level: number; name: string; price: number; days: number; plans?: { days: number; price: number }[] };
export type PerkAt = { key: string; from: number };
export type LevelDecay = { idleDays: number; drop: number; everyDays: number; floor: number };
export type LiveLevels = {
  rev: number;
  vip: { levels: { level: number; points: number; name: string }[]; perks: PerkAt[]; decay: LevelDecay | null } | null;
  noble: { levels: NobleLevel[]; perks: PerkAt[] } | null;
  wealth: { points: number[]; groups: { from: number; to: number; name: string }[]; perks: PerkAt[]; decay: LevelDecay | null } | null;
  charm: { points: number[]; groups: { from: number; to: number; name: string }[]; perks: PerkAt[]; decay: LevelDecay | null } | null;
  sub: { plans: { productId: string; days: number; label: string; tl: number; was: number }[]; perks: PerkAt[] } | null;
};

// --- Reading the server's answer ------------------------------------------------------------------------------
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const int = (x: unknown, min: number, max: number): number | null => (typeof x === 'number' && Number.isSafeInteger(x) && x >= min && x <= max ? x : null);
const name = (x: unknown, max = 30): string | null => (typeof x === 'string' && x.trim() && x.trim().length <= max ? x.trim() : null);
const KEY = /^[a-z_]{1,32}$/;
const POINTS_MAX = 1e12;

function perksOf(x: unknown, top: number): PerkAt[] {
  if (!Array.isArray(x)) return [];
  const out: PerkAt[] = [];
  for (const p of x) {
    const r = obj(p);
    const from = int(r.from, 0, top);
    if (typeof r.key === 'string' && KEY.test(r.key) && from !== null && !out.some((y) => y.key === r.key)) out.push({ key: r.key, from });
  }
  return out;
}
function decayOf(x: unknown, top: number): LevelDecay | null {
  if (x === null || x === undefined) return null;
  const r = obj(x);
  const idleDays = int(r.idleDays, 1, 365);
  const drop = int(r.drop, 1, 10);
  const everyDays = int(r.everyDays, 1, 365);
  const floor = int(r.floor, 0, top);
  return idleDays !== null && drop !== null && everyDays !== null && floor !== null ? { idleDays, drop, everyDays, floor } : null;
}
/** Points that grow level by level; `from0`: Lv.0–50 starting at 0. */
function growing(list: number[], from0: boolean) {
  return list.every((p, i) => (from0 && i === 0 ? p === 0 : p >= 1) && (i === 0 || p > list[i - 1]));
}

function vipOf(x: unknown): LiveLevels['vip'] {
  const r = obj(x);
  if (!Array.isArray(r.levels) || r.levels.length < 1 || r.levels.length > 15) return null;
  const levels = r.levels.map((l, i) => {
    const e = obj(l);
    return { level: i + 1, points: int(e.points, 1, POINTS_MAX), name: name(e.name, 24) };
  });
  if (levels.some((l) => l.points === null || l.name === null) || !growing(levels.map((l) => l.points as number), false)) return null;
  return {
    levels: levels.map((l) => ({ level: l.level, points: l.points as number, name: l.name as string })),
    perks: perksOf(r.perks, levels.length),
    decay: decayOf(r.decay, levels.length),
  };
}
function nobleOf(x: unknown): LiveLevels['noble'] {
  const r = obj(x);
  if (!Array.isArray(r.levels) || r.levels.length !== NOBLE_TIERS.length) return null;
  const levels = r.levels.map((l, i) => {
    const e = obj(l);
    // Packages a malformed answer garbles are left out (the main term still sells).
    const plans = Array.isArray(e.plans)
      ? e.plans
          .slice(0, 2)
          .map((p) => ({ days: int(obj(p).days, 1, 365), price: int(obj(p).price, 1, 1e9) }))
          .filter((p): p is { days: number; price: number } => p.days !== null && p.price !== null)
      : undefined;
    return { level: i + 1, name: name(e.name, 24), price: int(e.price, 1, 1e9), days: int(e.days, 1, 365), ...(plans ? { plans } : {}) };
  });
  if (levels.some((l) => l.name === null || l.price === null || l.days === null)) return null;
  return { levels: levels as NobleLevel[], perks: perksOf(r.perks, NOBLE_TIERS.length) };
}
function curveOf(x: unknown): LiveLevels['wealth'] {
  const r = obj(x);
  if (!Array.isArray(r.points) || r.points.length !== 51) return null;
  const points = r.points.map((p) => int(p, 0, POINTS_MAX));
  if (points.some((p) => p === null) || !growing(points as number[], true)) return null;
  if (!Array.isArray(r.groups) || !r.groups.length || r.groups.length > 20) return null;
  let next = 0;
  const groups: { from: number; to: number; name: string }[] = [];
  for (const g of r.groups) {
    const e = obj(g);
    const from = int(e.from, 0, 50);
    const to = int(e.to, 0, 50);
    const n = name(e.name, 24);
    if (from !== next || to === null || to < from || n === null) return null;
    groups.push({ from, to, name: n });
    next = to + 1;
  }
  if (next !== 51) return null;
  return { points: points as number[], groups, perks: perksOf(r.perks, 50), decay: decayOf(r.decay, 50) };
}
function subOf(x: unknown): LiveLevels['sub'] {
  const r = obj(x);
  if (!Array.isArray(r.plans)) return null;
  const plans: NonNullable<LiveLevels['sub']>['plans'] = [];
  for (const p of r.plans) {
    const e = obj(p);
    const days = int(e.days, 1, 3650);
    const label = name(e.label, 30);
    const tl = typeof e.tl === 'number' && Number.isFinite(e.tl) && e.tl > 0 && e.tl <= 100_000 ? e.tl : null;
    const was = typeof e.was === 'number' && Number.isFinite(e.was) && e.was >= 0 && e.was <= 100_000 ? e.was : 0;
    if (typeof e.productId !== 'string' || !/^vip_\d+d$/.test(e.productId) || days === null || label === null || tl === null) continue;
    plans.push({ productId: e.productId, days, label, tl, was: was > tl ? was : 0 });
  }
  return plans.length ? { plans, perks: perksOf(r.perks, 1) } : null;
}

/** GET /api/catalog `levels` (levels=1); null when there is none or it isn't an object. Each part null when malformed. */
export function parseLiveLevels(raw: unknown): LiveLevels | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return {
    rev: int(r.rev, 0, Number.MAX_SAFE_INTEGER) ?? 0,
    vip: vipOf(r.vip),
    noble: nobleOf(r.noble),
    wealth: curveOf(r.wealth),
    charm: curveOf(r.charm),
    sub: subOf(r.sub),
  };
}

// --- Levels -----------------------------------------------------------------------------------------------------
/** VIP levels for the screens: the server's points and names with the app's colours and pictures (the last ones again past VIP 10). */
export function vipLevelsOf(l: LiveLevels | null) {
  if (!l?.vip) return SVIP_LEVELS.map((x) => ({ ...x, name: `VIP ${x.level}` }));
  return l.vip.levels.map((x, i) => {
    const look = SVIP_LEVELS[Math.min(i, SVIP_LEVELS.length - 1)];
    return { ...look, level: x.level, xp: x.points, name: x.name };
  });
}
/** The VIP (SVIP) level of these purchase points. */
export const svipLevelFor = (l: LiveLevels | null, xp: number) => (l?.vip ? l.vip.levels.filter((x) => xp >= x.points).length : SVIP_LEVELS.filter((x) => xp >= x.xp).length);
/** Cömertlik / Yankı thresholds (Lv.0–50). */
export const wealthTableOf = (l: LiveLevels | null) => l?.wealth?.points ?? WEALTH_XP;
export const charmTableOf = (l: LiveLevels | null) => l?.charm?.points ?? CHARM_XP;
export const wealthLevelFor = (l: LiveLevels | null, xp: number) => levelFromTable(wealthTableOf(l), xp);
export const charmLevelFor = (l: LiveLevels | null, xp: number) => levelFromTable(charmTableOf(l), xp);
/** The level groups (Kuvars Lv.0–4, …): the server's ranges and names with the app's colours and emblems in order. */
export function tiersOf(l: LiveLevels | null, system: 'wealth' | 'charm'): LevelTier[] {
  const compiled = system === 'wealth' ? WEALTH_TIERS : CHARM_TIERS;
  const groups = l?.[system]?.groups;
  if (!groups) return compiled;
  return groups.map((g, i) => ({ ...compiled[Math.min(i, compiled.length - 1)], from: g.from, to: g.to, name: g.name }));
}
export const tierFor = (tiers: LevelTier[], level: number) => tiers.find((t) => level >= t.from && level <= t.to) ?? tiers[0];

/** Rütbe tiers: the server's names, prices and days with the app's pictures and colours. */
/** One package on the Rütbe page: its days and price, the price at the week's rate (`was`) and the saving in %. */
export type NoblePlan = { days: number; price: number; was: number; save: number };
/**
 * The tier's packages, shortest first: its main term and the others (the server's; from an older server or the demo,
 * the app's defaults for a 30-day term). `was` and `save` measure each against the shortest one's daily rate.
 */
export function noblePlansOf(main: { price: number; days: number }, plans?: { days: number; price: number }[]): NoblePlan[] {
  const list = [{ days: main.days, price: main.price }, ...(plans ?? nobleDefaultPlans(main.price, main.days))]
    .filter((p, i, all) => all.findIndex((x) => x.days === p.days) === i)
    .sort((x, y) => x.days - y.days);
  const rate = list[0].price / list[0].days;
  return list.map((p) => {
    const was = Math.round(rate * p.days);
    const save = was > p.price ? Math.floor((1 - p.price / was) * 100) : 0;
    return { ...p, was: save > 0 ? was : p.price, save };
  });
}
export function nobleTiersOf(l: LiveLevels | null) {
  return NOBLE_TIERS.map((t, i) => {
    const s = l?.noble?.levels[i];
    const main = { price: s?.price ?? t.price, days: s?.days ?? NOBLE_DAYS };
    return { ...t, name: s?.name ?? t.name, ...main, plans: noblePlansOf(main, s?.plans) };
  });
}
/** Whether the server sells a tier other than the compiled one (another name, price or days). */
export function nobleChanged(l: LiveLevels | null, tier: number) {
  const s = l?.noble?.levels[tier - 1];
  const t = NOBLE_TIERS[tier - 1];
  return !!s && !!t && (s.name !== t.name || s.price !== t.price || s.days !== NOBLE_DAYS);
}

// --- Perks ------------------------------------------------------------------------------------------------------
type Look = { name: string; emoji: string; art?: ArtName };
/** How the app draws a perk the server names (its key), per system where the words differ. */
const LOOK: Record<string, Look> = {
  badge: { name: 'VIP rozeti', emoji: '🎖️', art: 'ayricalik-svip-rozeti' },
  frame: { name: 'Profil çerçevesi', emoji: '🖼️', art: 'ayricalik-profil-cercevesi' },
  hide_levels: { name: 'Seviyeleri gizle', emoji: '🙈', art: 'ayricalik-gizemli-kisi-kimligi' },
  room_password: { name: 'Oda şifresi', emoji: '🔑', art: 'ayricalik-oda-kilitleme' },
  vip_store: { name: 'VIP mağaza eşyaları', emoji: '🛍️', art: 'ayricalik-puan-takas-magazasi' },
  vip_gifts: { name: 'Üyelere özel hediyeler', emoji: '🎁', art: 'ayricalik-svip-e-ozel-hediye' },
  silent_visit: { name: 'Sessiz ziyaret', emoji: '🥷', art: 'ayricalik-gizli-ziyaret' },
  entry_greeting: { name: 'Giriş karşılaması', emoji: '🌟', art: 'ayricalik-giris-ekrani' },
  visitors: { name: 'Profiline bakanları gör', emoji: '👀' },
  // Gizlilik (owners, 26 Nov 2026; lib/privacy-perks).
  privacy_room: { name: 'Bulunduğum odayı gizle', emoji: '🚪', art: 'ayricalik-gizli-oda-girisi' },
  privacy_global: { name: 'Duyurularda adımı gizle', emoji: '📢', art: 'ayricalik-platform-duyurusu' },
  privacy_online: { name: 'Çevrimiçi gizlilik', emoji: '🫥' },
  privacy_marks: { name: 'Profilime iz bırakılmasın', emoji: '🛡️' },
  privacy_profile: { name: 'Profilimi gizle', emoji: '🎭', art: 'ayricalik-klan-gizliligi' },
};
const shown = (perks: PerkAt[], looks: Record<string, Look>): ShownRight[] =>
  perks
    .filter((p) => looks[p.key] ?? LOOK[p.key])
    .map((p) => ({ ...(looks[p.key] ?? LOOK[p.key]), level: Math.max(1, p.from) }))
    .sort((a, b) => a.level - b.level);
/** The VIP rights a page lists, by the level they open at (the server's when it says, else the app's list). */
export const vipRightsOf = (l: LiveLevels | null): ShownRight[] => (l?.vip ? shown(l.vip.perks, {}) : SVIP_SHOWN);
/**
 * Every Rütbe right in the page's order (data/status NOBLE_SHOWN). One the app gives opens at the tier Seviye ayarları
 * give it (its place in the list until they say); one they turned off is left out. The others stay as they are, `soon`.
 */
export function nobleRightsOf(l: LiveLevels | null): NobleRight[] {
  if (!l?.noble) return NOBLE_SHOWN;
  const perks = new Map(l.noble.perks.map((p) => [p.key, p.from]));
  return NOBLE_SHOWN.flatMap((r) => {
    if (!r.perk) return [r];
    const from = perks.get(r.perk);
    return from === undefined ? [] : [{ ...r, level: Math.max(1, from) }];
  });
}
/** How many of `rights` a tier has (the ones not built yet aside) and how many there are. */
export const nobleRightsCount = (rights: NobleRight[], tier: number) => ({ have: rights.filter((r) => !r.soon && r.level <= tier).length, all: rights.length });
/** From which level a Cömertlik / Yankı perk opens (the app's key), or null when the server turned it off; undefined: the server didn't say. */
export function curvePerkFrom(l: LiveLevels | null, system: 'wealth' | 'charm', appKey: string): number | null | undefined {
  const s = l?.[system];
  if (!s) return undefined;
  const key = ({ rank: 'discover_boost', moments: 'moments_post' } as Record<string, string>)[appKey] ?? appKey;
  return s.perks.find((p) => p.key === key)?.from ?? null;
}
/** The Cömertlik level Oyun Salonu opens at. */
export const casinoLevelOf = (l: LiveLevels | null) => l?.wealth?.perks.find((p) => p.key === 'casino')?.from ?? WHEEL_NEED_LEVEL;

// --- Abonelik -----------------------------------------------------------------------------------------------------
/** The plans shown (the server's when it says, in its order), with the saving the badge shows (0: none). */
export function subPlansOf(l: LiveLevels | null): { productId: string; days: number; tl: number; was: number; label: string; save: number }[] {
  const list = l?.sub?.plans ?? VIP_PLANS.map((p) => ({ productId: `vip_${p.days}d`, days: p.days, label: p.label, tl: p.tl, was: p.was }));
  return list.map((p) => ({ ...p, save: p.was > p.tl ? Math.floor((1 - p.tl / p.was) * 100) : 0 }));
}
/** The subscription's rights: the comparison rows and the carousel, as the server gives them. */
export function subRightsOf(l: LiveLevels | null): { compare: typeof VIP_COMPARE; perks: typeof VIP_PERKS } {
  if (!l?.sub) return { compare: VIP_COMPARE, perks: VIP_PERKS };
  const on = new Set(l.sub.perks.map((p) => p.key));
  const rows: [string, string, string][] = [
    ['visitors', 'Profiline bakanları gör', 'Ziyaretçiler'],
    ['hide_levels', 'Seviyeleri gizle', 'Seviyeleri gizle'],
  ];
  const kept = rows.filter(([k]) => on.has(k));
  return {
    compare: kept.map(([, n]) => [n, false, true]),
    perks: kept.map(([k, n, short]) => ({ name: short, desc: k === 'hide_levels' ? 'Cömertlik ve Yankı seviyeni gizle' : n, icon: k === 'visitors' ? 'eye' : 'eye-off' })),
  };
}

// --- The level drop ---------------------------------------------------------------------------------------------------
const ACTIVITY = { vip: 'jeton yüklemezsen', wealth: 'jeton harcamazsan', charm: 'hediye almazsan' } as const;
/** The rule as the level pages say it, or null when it is off (or the server doesn't say). */
export function decayLineOf(l: LiveLevels | null, system: 'vip' | 'wealth' | 'charm'): string | null {
  const d = l?.[system]?.decay;
  if (!d) return null;
  const unit = system === 'vip' ? 'VIP ' : 'Lv.';
  const what = system === 'vip' ? 'VIP seviyen' : system === 'wealth' ? 'Cömertlik seviyen' : 'Yankı seviyen';
  const again = d.everyDays === d.idleDays ? `hareketsizlik sürdükçe her ${d.everyDays} günde bir yeniden` : `hareketsizlik sürdükçe ${d.everyDays} günde bir yeniden`;
  // A floor of 0 says nothing (no level is below it); "seviyesinin" keeps the number free of suffixes (5'in, 3'ün).
  const floor = d.floor > 0 ? `, ${unit}${d.floor} seviyesinin altına inmez` : '';
  return `${d.idleDays} gün ${ACTIVITY[system]} ${what} ${d.drop} düşer; ${again} düşer${floor}. Yeniden ${system === 'charm' ? 'hediye aldıkça' : system === 'vip' ? 'yükledikçe' : 'harcadıkça'} puanın her zamanki gibi artar.`;
}
