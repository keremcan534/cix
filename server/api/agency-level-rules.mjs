// Ajans seviyeleri (owners, 24 Nov 2026): an agency's commission is set by its week (Monday 00:00 to Sunday 23:59:59,
// Türkiye time). The diamonds its own streamers earned in the week (the commission base) give the level; levels 1–6
// also need `min_active` active streamers (one who earned `active_usd` USD in the agency that week), or the agency
// gets level 0. A new agency (its first `new_weeks` weeks from approval) gets level `new_level` whatever its week.
// Each agency counts only its own streamers; a parent agency gets nothing from its sub-agencies. Pure: no database,
// so the tests and the app's drift test import it. Stored as the agency setting `weekly_levels` (agency-lib.mjs).

/** The owners' table. `shown`: the level's name appears in the app (levels 0 and 1 do not). */
export const WEEKLY_LEVELS_DEFAULT = Object.freeze({
  min_active: 20,
  active_usd: 10,
  new_weeks: 4,
  new_level: 'baslangic',
  levels: Object.freeze([
    { key: 'gonul_bagi', name: 'Gönül Bağı', rate: 0.35, from: 0, shown: false },
    { key: 'baslangic', name: 'Başlangıç', rate: 0.5, from: 200_000, shown: false },
    { key: 'bronz', name: 'Bronz', rate: 0.6, from: 300_000, shown: true },
    { key: 'gumus', name: 'Gümüş', rate: 0.7, from: 500_000, shown: true },
    { key: 'altin', name: 'Altın', rate: 0.8, from: 750_000, shown: true },
    { key: 'platin', name: 'Platin', rate: 0.9, from: 1_000_000, shown: true },
    { key: 'elmas', name: 'Elmas', rate: 1, from: 1_500_000, shown: true },
  ]),
});

/** Refuses a malformed table with a Turkish sentence (`bad`); returns it cleaned. */
export function cleanWeeklyLevels(value, bad) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad('Ajans seviyeleri nesne olmalı');
  const int = (v, min, max, f) => (Number.isSafeInteger(v) && v >= min && v <= max ? v : bad(`${f} ${min}–${max} arasında tam sayı olmalı`));
  const rate = (v, f) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1 || Math.abs(Math.round(v * 1e4) - v * 1e4) > 1e-6) bad(`${f} 0–1 arasında (en çok %100), en çok 4 ondalık olmalı`);
    return Math.round(v * 1e4) / 1e4;
  };
  const list = value.levels;
  if (!Array.isArray(list) || list.length < 1 || list.length > 12) bad('1–12 seviye olmalı');
  const keys = new Set();
  const levels = list.map((l, i) => {
    if (!l || typeof l !== 'object') bad('Seviye nesne olmalı');
    if (typeof l.key !== 'string' || !/^[a-z_]{2,20}$/.test(l.key) || keys.has(l.key)) bad('Seviye anahtarı benzersiz olmalı (a-z, _)');
    keys.add(l.key);
    const name = typeof l.name === 'string' ? l.name.trim() : '';
    if (name.length < 2 || name.length > 30) bad('Seviye adı 2–30 karakter');
    const from = i === 0 ? 0 : int(l.from, 1, 1e12, `${name}: haftalık elmas eşiği`);
    if (typeof l.shown !== 'boolean') bad(`${name}: uygulamada görünür mü evet/hayır olmalı`);
    return { key: l.key, name, rate: rate(l.rate, `${name}: komisyon oranı`), from, shown: l.shown };
  });
  for (let i = 1; i < levels.length; i++) {
    if (levels[i].from <= levels[i - 1].from) bad('Seviyelerin elmas eşiği küçükten büyüğe olmalı');
    if (levels[i].rate < levels[i - 1].rate) bad('Üst seviyenin komisyonu alttakinden düşük olamaz');
  }
  if (!keys.has(value.new_level)) bad('Yeni ajans seviyesi tabloda olmalı');
  return {
    min_active: int(value.min_active, 0, 100_000, 'Aktif yayıncı şartı'),
    active_usd: int(value.active_usd, 0, 100_000, 'Aktif yayıncı: haftalık en az kazanç (USD)'),
    new_weeks: int(value.new_weeks, 0, 52, 'Yeni ajans süresi (hafta)'),
    new_level: value.new_level,
    levels,
  };
}

/**
 * The level an agency gets for a week: `base` diamonds its streamers earned, `active` streamers who earned enough,
 * `isNew` still in its first weeks. Returns { level, index, reason }: 'new', 'threshold', 'active' (the threshold
 * reached a higher level but too few active streamers: level 0).
 */
export function levelFor({ base, active, isNew }, s = WEEKLY_LEVELS_DEFAULT) {
  if (isNew) {
    const index = s.levels.findIndex((l) => l.key === s.new_level);
    return { level: s.levels[index], index, reason: 'new' };
  }
  let index = 0;
  for (let i = 0; i < s.levels.length; i++) if (base >= s.levels[i].from) index = i;
  if (index > 0 && active < s.min_active) return { level: s.levels[0], index: 0, reason: 'active', reached: s.levels[index] };
  return { level: s.levels[index], index, reason: 'threshold' };
}

/** The next level above `base` and the diamonds still needed, or null at the top. */
export function nextLevelOf(base, s = WEEKLY_LEVELS_DEFAULT) {
  const l = s.levels.find((x) => x.from > base);
  return l ? { ...l, left: l.from - base } : null;
}

/** Whether an agency approved at `approvedAt` is still new at `t` (its first `new_weeks` weeks). */
export const isNewAgency = (approvedAt, t, s = WEEKLY_LEVELS_DEFAULT) => !!approvedAt && s.new_weeks > 0 && new Date(t).getTime() < new Date(approvedAt).getTime() + s.new_weeks * 7 * 86_400_000;
