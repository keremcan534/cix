// Agency network engine shared by agency.mjs (agency panels, streamers) and agency-admin.mjs (the centre):
// settings with history, the permission catalog and access checks, the audit log, dated lookups (parent,
// rate, settings at a moment), the commission calculation and commission periods. docs/AJANS_HIYERARSI.md.
//
// Money: commissions are in diamonds with 4 decimals (numeric(20,4)), computed with integers in units of
// 1/10,000 diamond so a split never loses or invents a fraction. Rates are numeric(6,4). 5,000 diamonds = 1 USD.
import crypto from 'node:crypto';

import { HttpError, db, move } from './core.mjs';
import { LOCK_HOURS } from './wallet.mjs';

export const DIAMONDS_PER_USD = 5000;
/** The first release runs two agency levels (top, sub). The data model allows more; settings can't exceed this. */
export const MAX_LEVELS_V1 = 2;
// 'message' and 'call': 1v1 paid messages and call or match minutes (one-on-one.mjs).
export const INCOME_TYPES = ['gift', 'lucky_gift', 'campaign', 'bonus', 'task_reward', 'refund', 'other', 'message', 'call'];
export const CRITERIA = ['volume', 'active', 'average', 'growth', 'retention', 'acquisition', 'operations', 'reliability'];

// --- Permission catalog (action types the code enforces; roles that bundle them are data) --------------------
export const AGENCY_PERMS = {
  'streamers.view': 'Yayıncıları görüntüleme',
  'streamers.invite': 'Yayıncı daveti gönderme',
  'streamers.approve': 'Yayıncı başvurusu onaylama',
  'subagencies.view': 'Alt ajansları görüntüleme',
  'subagencies.manage': 'Alt ajans başvurusu yönetme',
  'subagencies.earnings': 'Alt ajans kazançlarını görüntüleme',
  'reports.performance': 'Performans raporlarını görüntüleme',
  'reports.commission': 'Komisyon raporlarını görüntüleme',
  'reports.export': 'Finansal raporları dışa aktarma',
  'payouts.request': 'Ödeme talebi oluşturma',
  'transfers.manage': 'Transfer taleplerini onaylama',
  'staff.manage': 'Personel yönetimi',
};
export const PLATFORM_PERMS = {
  'agencies.view': 'Bütün ajansları ve ağacı görüntüleme',
  'agencies.manage': 'Ajans oluşturma, onay, askıya alma, kapatma, ilişki değişikliği',
  'agencies.rates': 'Komisyon oranı ve kademe düzeltme',
  'agencies.settings': 'Komisyon, performans ve transfer değişkenleri',
  'agencies.performance': 'Performans değerlendirmesi, operasyon puanı, ihlal kaydı',
  'agencies.transfers': 'Transfer, bağımsızlaşma ve üst ajans değişikliği kararları',
  'agencies.payouts.approve': 'Ödeme onayı',
  'agencies.payouts.pay': 'Ödendi olarak işaretleme',
  'agencies.ledger': 'Gelir kaydı, düzeltme, ters kayıt, dönem kapama',
  'agencies.audit': 'Denetim kayıtları',
  'agencies.roles': 'Rol ve izin yönetimi',
  'agencies.appeals': 'İtirazları değerlendirme',
  'bd.assigned': 'BD: sorumlu olduğu ajansları ve performanslarını görme',
  'bd.acquire': 'BD: üst ve alt ajans kazanımı (başvuru oluşturma)',
  'bd.reports': 'BD: büyüme ve BD komisyon raporu',
};
/** What anyone allowed to look at an agency (centre viewers) may see; never write actions. */
const VIEW_PERMS = ['streamers.view', 'subagencies.view', 'subagencies.earnings', 'reports.performance', 'reports.commission'];
const BD_VIEW_PERMS = ['streamers.view', 'subagencies.view', 'reports.performance'];

// --- Settings ------------------------------------------------------------------------------------------------
export const DEFAULTS = {
  pool_cap: 0.4,
  top_rate: 0.4,
  max_levels: 2,
  subagency_policy: { enabled: true, approval: 'center', min_active_streamers: 0 },
  join_policy: { requires_approval: true },
  // Who may be a streamer and how they move (docs/AJANS_HIYERARSI.md, "Yayıncı kuralları"): only women's accounts
  // (men take part through Aile); a code or link joins at once in the first pick_days days after sign-up (0 = no
  // limit), later or once out of an agency only by a transfer the centre approves; no leaving without one; a second
  // account on the same device goes to the agency of the first.
  streamer_policy: { women_only: true, pick_days: 3, can_leave: false, one_agency_per_person: true },
  income_types: { gift: true, lucky_gift: true, campaign: false, bonus: false, task_reward: false, refund: true, other: false, message: true, call: true },
  commission_period: 'month',
  period_close_days: 7,
  payout_policy: { min_diamonds: 50000, currencies: ['USD', 'TRY'], two_person: true },
  transfer_policy: { decision_days: 7, require_center: false, free_below_diamonds: 50000, fee_rate: 0.1, fee_payer: 'to_agency', fee_account: 'platform', agency_fee_rate: 0.1, owner_choice: true },
  performance: { window_months: 3, cadence: 'month', promotion_min_periods: 2, demotion_min_periods: 2, max_step: 1, min_active_streamers: 3, active_days: 30, require_verified: false, decline_drop: 15, effective: 'next_period' },
  weights: { volume: 20, active: 15, average: 10, growth: 15, retention: 15, acquisition: 10, operations: 5, reliability: 10 },
  tiers: [
    { key: 'start', name: 'Başlangıç', min_score: 0, sub_rate: 0.25, min_active: 0, overtake: false },
    { key: 'growing', name: 'Gelişen', min_score: 40, sub_rate: 0.3, min_active: 3, overtake: false },
    { key: 'successful', name: 'Başarılı', min_score: 60, sub_rate: 0.35, min_active: 5, overtake: false },
    { key: 'overtook', name: 'Üst ajansı geçmiş', min_score: 60, sub_rate: 0.38, min_active: 5, overtake: true },
    { key: 'elite', name: 'Çok yüksek performans', min_score: 80, sub_rate: 0.39, min_active: 10, overtake: true },
  ],
  parent_min_rate: 0.01,
  parent_zero: { enabled: false, tier: 'elite' },
  parent_sees_sub_earnings: true,
  bd_policy: { rate: 0.05, basis: 'base_plus_pool' },
  suspension_policy: { reliability_below: 40, inactive_days: 90 },
  // Ajans asistanı (docs/AJANS_ASISTANI.md): how many assistants an agency may have at once.
  assistant_policy: { max: 1 },
};

const bad = (msg) => {
  throw new HttpError(400, msg);
};
const num = (v, min, max, f) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : bad(`${f} ${min}–${max} arasında olmalı`));
const rate4 = (v, max, f) => {
  num(v, 0, max, f);
  if (Math.abs(Math.round(v * 1e4) - v * 1e4) > 1e-6) bad(`${f} en fazla 4 ondalık basamak olabilir`);
  return Math.round(v * 1e4) / 1e4;
};
const whole = (v, min, max, f) => (Number.isSafeInteger(v) && v >= min && v <= max ? v : bad(`${f} ${min}–${max} arasında tam sayı olmalı`));
const bool = (v, f) => (typeof v === 'boolean' ? v : bad(`${f} evet/hayır olmalı`));
const oneOf = (v, list, f) => (list.includes(v) ? v : bad(`${f}: ${list.join(', ')}`));
const obj = (v, f) => (v && typeof v === 'object' && !Array.isArray(v) ? v : bad(`${f} nesne olmalı`));

/** Checks one setting's new value against the others; returns the cleaned value. */
export function validateSetting(key, value, cur) {
  switch (key) {
    case 'pool_cap':
      return rate4(value, 1, 'Toplam ajans komisyon sınırı');
    case 'top_rate':
      return rate4(value, cur.pool_cap, 'Üst ajans oranı (havuz sınırını aşamaz)');
    case 'max_levels':
      return whole(value, 1, MAX_LEVELS_V1, 'Ajans katmanı');
    case 'subagency_policy': {
      const v = { ...cur.subagency_policy, ...obj(value, key) };
      return { enabled: bool(v.enabled, 'Alt ajans oluşturma'), approval: oneOf(v.approval, ['center', 'auto'], 'Onay politikası'), min_active_streamers: whole(v.min_active_streamers, 0, 100000, 'Asgari aktif yayıncı') };
    }
    case 'join_policy':
      return { requires_approval: bool(obj(value, key).requires_approval ?? cur.join_policy.requires_approval, 'Katılım onayı') };
    case 'streamer_policy': {
      const v = { ...cur.streamer_policy, ...obj(value, key) };
      return {
        women_only: bool(v.women_only, 'Yalnız kadın yayıncı'),
        pick_days: whole(v.pick_days, 0, 365, 'Ajans seçme süresi (gün)'),
        can_leave: bool(v.can_leave, 'Transfersiz ayrılma'),
        one_agency_per_person: bool(v.one_agency_per_person, 'Aynı cihazdaki hesaplar tek ajansta'),
      };
    }
    case 'income_types': {
      const v = { ...DEFAULTS.income_types, ...cur.income_types, ...obj(value, key) };
      return Object.fromEntries(INCOME_TYPES.map((t) => [t, bool(v[t], t)]));
    }
    case 'commission_period':
      return oneOf(value, ['month', 'week'], 'Komisyon dönemi');
    case 'period_close_days':
      return whole(value, 0, 90, 'Dönem kapanış süresi');
    case 'payout_policy': {
      const v = { ...cur.payout_policy, ...obj(value, key) };
      if (!Array.isArray(v.currencies) || !v.currencies.length || v.currencies.some((x) => !['USD', 'TRY'].includes(x))) bad('Para birimleri USD ve/veya TRY');
      return { min_diamonds: whole(v.min_diamonds, 0, 1e12, 'Ödeme alt limiti'), currencies: [...new Set(v.currencies)], two_person: bool(v.two_person, 'İki kişili onay') };
    }
    case 'transfer_policy': {
      const v = { ...cur.transfer_policy, ...obj(value, key) };
      return {
        decision_days: whole(v.decision_days, 1, 60, 'Karar süresi'),
        require_center: bool(v.require_center, 'Merkez onayı'),
        free_below_diamonds: whole(v.free_below_diamonds, 0, 1e12, 'Ücretsiz transfer sınırı'),
        fee_rate: rate4(v.fee_rate, 1, 'Transfer ücreti oranı'),
        fee_payer: oneOf(v.fee_payer, ['to_agency', 'streamer', 'none'], 'Ücreti ödeyen'),
        fee_account: oneOf(v.fee_account, ['platform', 'from_agency'], 'Ücretin aktarıldığı hesap'),
        agency_fee_rate: rate4(v.agency_fee_rate, 1, 'Ajans transfer ücreti oranı'),
        owner_choice: bool(v.owner_choice, 'Ajans sahibi ücretsiz bırakabilir'),
      };
    }
    case 'performance': {
      const v = { ...cur.performance, ...obj(value, key) };
      return {
        window_months: whole(v.window_months, 1, 12, 'Değerlendirme dönemi (ay)'),
        cadence: oneOf(v.cadence, ['month', 'quarter'], 'Komisyon güncelleme sıklığı'),
        promotion_min_periods: whole(v.promotion_min_periods, 1, 12, 'Terfi için art arda dönem'),
        demotion_min_periods: whole(v.demotion_min_periods, 1, 12, 'Düşüş için art arda dönem'),
        max_step: whole(v.max_step, 1, 10, 'Bir seferde en fazla kademe'),
        min_active_streamers: whole(v.min_active_streamers, 0, 100000, 'Asgari aktif yayıncı'),
        active_days: whole(v.active_days, 1, 365, 'Aktiflik penceresi (gün)'),
        require_verified: bool(v.require_verified, 'Doğrulanmış yayıncı şartı'),
        decline_drop: num(v.decline_drop, 0, 100, 'Performans düşüş eşiği'),
        effective: oneOf(v.effective, ['next_period', 'immediate'], 'Yürürlük'),
      };
    }
    case 'weights': {
      const v = { ...cur.weights, ...obj(value, key) };
      const out = Object.fromEntries(CRITERIA.map((k) => [k, num(v[k], 0, 100, `Ağırlık (${k})`)]));
      if (!Object.values(out).some((x) => x > 0)) bad('En az bir kriterin ağırlığı olmalı');
      return out;
    }
    case 'tiers': {
      if (!Array.isArray(value) || value.length < 1 || value.length > 10) bad('1–10 kademe olmalı');
      const keys = new Set();
      const out = value.map((t, i) => {
        obj(t, 'Kademe');
        if (typeof t.key !== 'string' || !/^[a-z_]{2,20}$/.test(t.key) || keys.has(t.key)) bad('Kademe anahtarı benzersiz olmalı (a-z, _)');
        keys.add(t.key);
        const name = typeof t.name === 'string' ? t.name.trim() : '';
        if (name.length < 2 || name.length > 40) bad('Kademe adı 2–40 karakter');
        return {
          key: t.key,
          name,
          min_score: i === 0 ? 0 : num(t.min_score, 0, 100, 'Asgari puan'),
          sub_rate: rate4(t.sub_rate, cur.pool_cap, `Alt ajans payı (${name}) havuz sınırını aşamaz`),
          min_active: whole(t.min_active ?? 0, 0, 100000, 'Asgari aktif yayıncı'),
          overtake: bool(t.overtake ?? false, 'Üst ajansı geçme şartı'),
        };
      });
      for (let i = 1; i < out.length; i++) if (out[i].sub_rate < out[i - 1].sub_rate) bad('Üst kademenin payı alttakinden düşük olamaz');
      return out;
    }
    case 'parent_min_rate':
      return rate4(value, cur.pool_cap, 'Üst ajansın asgari payı');
    case 'parent_zero': {
      const v = { ...cur.parent_zero, ...obj(value, key) };
      if (!cur.tiers.some((t) => t.key === v.tier)) bad('Kademe bulunamadı');
      return { enabled: bool(v.enabled, 'Üst ajans payını sıfırlama'), tier: v.tier };
    }
    case 'parent_sees_sub_earnings':
      return bool(value, 'Üst ajans alt ajans kazancını görür');
    case 'bd_policy': {
      const v = { ...cur.bd_policy, ...obj(value, key) };
      return { rate: rate4(v.rate, 1, 'BD oranı'), basis: oneOf(v.basis, ['base', 'pool', 'base_plus_pool'], 'BD matrahı') };
    }
    case 'suspension_policy': {
      const v = { ...cur.suspension_policy, ...obj(value, key) };
      return { reliability_below: num(v.reliability_below, 0, 100, 'Güvenilirlik eşiği'), inactive_days: whole(v.inactive_days, 1, 3650, 'Pasiflik süresi') };
    }
    case 'assistant_policy': {
      const v = { ...cur.assistant_policy, ...obj(value, key) };
      return { max: whole(v.max, 0, 20, 'Ajans asistanı sınırı') };
    }
    default:
      return bad('Bilinmeyen ayar');
  }
}

/** All settings as they were at `at` (default now): { values, ids } — ids name the rows used (rule version). */
export async function settingsAt(c, at = new Date()) {
  const r = await c.query('SELECT DISTINCT ON (key) key, value, id FROM agency_settings WHERE created_at <= $1 ORDER BY key, created_at DESC, id DESC', [at]);
  const values = structuredClone(DEFAULTS);
  const ids = {};
  for (const row of r.rows) {
    if (!(row.key in DEFAULTS)) continue;
    values[row.key] = row.value;
    ids[row.key] = Number(row.id);
  }
  return { values, ids };
}

// --- Money helpers -------------------------------------------------------------------------------------------
/** A rate (number or numeric string) in units of 1/10,000. */
export const e4 = (r) => Math.round(Number(r) * 1e4);
/** Integer 1/10,000-diamond units → numeric(20,4) string, exact. */
export const fmt4 = (n) => {
  const s = n < 0 ? '-' : '';
  const a = Math.abs(Math.round(n));
  return `${s}${Math.floor(a / 1e4)}.${String(a % 1e4).padStart(4, '0')}`;
};
export const d4 = (x) => Math.round(Number(x ?? 0) * 1e4) / 1e4;
export const usdOf = (diamonds) => Math.round((Number(diamonds) / DIAMONDS_PER_USD) * 100) / 100;

// --- Periods (Europe/Istanbul: UTC+3 all year) ---------------------------------------------------------------
const TZ_MS = 3 * 3600e3;
const pad = (n) => String(n).padStart(2, '0');
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400e3 + 1) / 7);
  return `${y}-W${pad(w)}`;
}
export function periodOf(t, kind) {
  const d = new Date(new Date(t).getTime() + TZ_MS);
  return kind === 'week' ? isoWeek(d) : `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
/** When a period ends (exclusive), as a Date. */
export function periodEnd(p) {
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]), 1) - TZ_MS);
  const w = /^(\d{4})-W(\d{2})$/.exec(p);
  if (!w) throw new HttpError(400, 'Geçersiz dönem');
  // ISO week 1 contains 4 January.
  const jan4 = new Date(Date.UTC(Number(w[1]), 0, 4));
  const monday = Date.UTC(Number(w[1]), 0, 4 - ((jan4.getUTCDay() || 7) - 1));
  return new Date(monday + Number(w[2]) * 7 * 86400e3 - TZ_MS);
}
/** Start of the next month / quarter after `t` in Istanbul time. */
export function nextCadenceStart(t, cadence) {
  const d = new Date(new Date(t).getTime() + TZ_MS);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() + 1;
  if (cadence === 'quarter') m = Math.floor((m - 1) / 3) * 3 + 3;
  if (m >= 12) {
    y += Math.floor(m / 12);
    m %= 12;
  }
  return new Date(Date.UTC(y, m, 1) - TZ_MS);
}
export function cadenceKey(t, cadence) {
  const d = new Date(new Date(t).getTime() + TZ_MS);
  return cadence === 'quarter' ? `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}` : `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
/** Monday 00:00 (Türkiye) of the calendar week `t` falls in, as a Date. */
export function weekStart(t) {
  const d = new Date(new Date(t).getTime() + TZ_MS);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back) - TZ_MS);
}
/** The next Monday 00:00 (Türkiye) after `t`. */
export const nextWeekStart = (t) => new Date(weekStart(t).getTime() + 7 * 86400e3);
export async function isClosed(c, period) {
  return (await c.query('SELECT 1 FROM agency_periods WHERE period = $1', [period])).rowCount > 0;
}

// --- Codes and audit -----------------------------------------------------------------------------------------
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newCode = () => Array.from(crypto.randomBytes(8), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');

export async function audit(c, actor, action, targetType, targetId, { before = null, after = null, reason = '', result = 'ok' } = {}) {
  await c.query('INSERT INTO agency_audit (actor_id, action, target_type, target_id, before, after, result, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
    actor ?? null,
    action,
    targetType,
    String(targetId ?? ''),
    before === null ? null : JSON.stringify(before),
    after === null ? null : JSON.stringify(after),
    result,
    String(reason ?? '').slice(0, 300),
  ]);
}

export async function notice(c, agencyId, kind, title, body = '') {
  await c.query('INSERT INTO agency_notices (agency_id, kind, title, body) VALUES ($1,$2,$3,$4)', [agencyId, kind, title, body]);
}

// --- Access --------------------------------------------------------------------------------------------------
/**
 * What `u` may do: { admin, platform: Set, agency: Map<agencyId, Set>, bd: Set<agencyId> }. Admin accounts
 * (users.role = admin) hold every platform permission. Agency owners hold every agency permission on their
 * own agency; staff hold role + extra − denied. A BD sees the agencies assigned to them and their subs.
 */
export async function accessOf(c, u) {
  const admin = u.role === 'admin';
  const platform = new Set(admin ? Object.keys(PLATFORM_PERMS) : []);
  const agency = new Map();
  const rows = await c.query(
    `SELECT s.agency_id, s.extra, s.denied, coalesce(r.permissions, '{}') AS permissions
       FROM staff_assignments s LEFT JOIN staff_roles r ON r.id = s.role_id AND r.archived_at IS NULL
      WHERE s.user_id = $1 AND s.revoked_at IS NULL`,
    [u.id],
  );
  for (const row of rows.rows) {
    const denied = new Set(row.denied);
    const perms = [...row.permissions, ...row.extra].filter((p) => !denied.has(p));
    if (row.agency_id === null) perms.filter((p) => p in PLATFORM_PERMS).forEach((p) => platform.add(p));
    else agency.set(row.agency_id, new Set(perms.filter((p) => p in AGENCY_PERMS)));
  }
  const owned = await c.query("SELECT id FROM agencies WHERE owner_id = $1 AND status IN ('draft', 'pending', 'approved', 'suspended')", [u.id]);
  for (const row of owned.rows) agency.set(row.id, new Set(Object.keys(AGENCY_PERMS)));
  const bd = new Set();
  if (platform.has('bd.assigned') || platform.has('bd.reports')) {
    const r = await c.query(
      `SELECT a.id FROM bd_assignments b JOIN agencies a ON a.id = b.agency_id OR a.parent_id = b.agency_id
        WHERE b.bd_id = $1 AND b.ended_at IS NULL`,
      [u.id],
    );
    r.rows.forEach((x) => bd.add(x.id));
  }
  return { user: u, admin, platform, agency, bd, owned: new Set(owned.rows.map((x) => x.id)) };
}

/** Agency permissions `acc` holds on `agency` (a row with id, parent_id). */
export function permsOn(acc, agency, settings) {
  const out = new Set(acc.agency.get(agency.id) ?? []);
  // A parent agency looks into its sub-agencies (never acts in them); earnings only if the setting allows.
  const p = agency.parent_id && acc.agency.get(agency.parent_id);
  if (p && p.has('subagencies.view')) {
    out.add('subagencies.view');
    if (p.has('streamers.view')) out.add('streamers.view');
    if (p.has('reports.performance')) out.add('reports.performance');
    if (p.has('subagencies.earnings') && settings.parent_sees_sub_earnings) out.add('reports.commission');
  }
  if (acc.admin || acc.platform.has('agencies.view')) VIEW_PERMS.forEach((x) => out.add(x));
  else if (acc.bd.has(agency.id) && acc.platform.has('bd.assigned')) BD_VIEW_PERMS.forEach((x) => out.add(x));
  return out;
}

/** How `acc` relates to `agency`, for the panel: owner, staff, parent, center, bd or null. */
export function viewerOf(acc, agency) {
  if (acc.owned.has(agency.id)) return 'owner';
  if (acc.agency.has(agency.id)) return 'staff';
  if (agency.parent_id && acc.agency.has(agency.parent_id)) return 'parent';
  if (acc.admin || acc.platform.has('agencies.view')) return 'center';
  if (acc.bd.has(agency.id)) return 'bd';
  return null;
}

// Refusals are written outside the caller's transaction (which the refusal rolls back), so they stay.
/** Refuses (403) unless the platform permission is held; the refusal is audited. */
export async function needPlatform(_c, acc, perm, target = '') {
  if (acc.admin || acc.platform.has(perm)) return;
  await audit(db, acc.user.id, perm, 'platform', target, { result: 'denied' });
  throw new HttpError(403, 'Bu işlem için merkez yönetim yetkisi gerekli');
}

/** Refuses (403) unless the agency permission is held on `agency`; the refusal is audited. */
export async function needAgency(_c, acc, perm, agency, settings) {
  if (permsOn(acc, agency, settings).has(perm)) return;
  await audit(db, acc.user.id, perm, 'agency', agency.id, { result: 'denied' });
  throw new HttpError(403, 'Bu ajans için yetkin yok');
}

export async function agencyRow(c, id, lock = false) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, 'Geçersiz ajans');
  const r = await c.query(`SELECT * FROM agencies WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!r.rowCount) throw new HttpError(404, 'Ajans bulunamadı');
  return r.rows[0];
}

export async function agencyByCode(c, code) {
  const s = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{6,10}$/.test(s)) throw new HttpError(400, 'Geçersiz ajans kodu');
  const r = await c.query('SELECT * FROM agencies WHERE code = $1', [s]);
  if (!r.rowCount) throw new HttpError(404, 'Bu kodla bir ajans yok');
  return r.rows[0];
}

// --- Dated lookups -------------------------------------------------------------------------------------------
/** The agency's parent at `t` (NULL = under the platform). Before its first record: the first record. */
export async function parentAt(c, agencyId, t) {
  let r = await c.query('SELECT parent_id FROM agency_parents WHERE agency_id = $1 AND valid_from <= $2 AND (valid_to IS NULL OR valid_to > $2) ORDER BY valid_from DESC, id DESC LIMIT 1', [agencyId, t]);
  if (!r.rowCount) r = await c.query('SELECT parent_id FROM agency_parents WHERE agency_id = $1 ORDER BY valid_from, id LIMIT 1', [agencyId]);
  return r.rows[0]?.parent_id ?? null;
}

/** The agency's own rate row in force at `t`. Before its first row: the first row. */
export async function rateAt(c, agencyId, t) {
  let r = await c.query('SELECT * FROM agency_rates WHERE agency_id = $1 AND effective_from <= $2 ORDER BY effective_from DESC, id DESC LIMIT 1', [agencyId, t]);
  if (!r.rowCount) r = await c.query('SELECT * FROM agency_rates WHERE agency_id = $1 ORDER BY effective_from, id LIMIT 1', [agencyId]);
  return r.rows[0] ?? null;
}

/** The parent's guaranteed minimum share under a tier: 0 if the setting turns it off at that tier or above. */
export function parentFloor(s, tierKey) {
  if (s.parent_zero.enabled) {
    const zi = s.tiers.findIndex((t) => t.key === s.parent_zero.tier);
    const ti = s.tiers.findIndex((t) => t.key === tierKey);
    if (zi >= 0 && ti >= zi) return 0;
  }
  return s.parent_min_rate;
}

/**
 * A top agency's rate (e4): the platform's top agency rate in force, unless the centre set this agency's rate
 * by hand (its latest row is 'manual'). Never above the pool cap. A sub-agency that became independent gets an
 * 'independence' row, so it follows the setting like any top agency.
 */
export const topRate = (row, s) => Math.min(row?.source === 'manual' ? e4(row.rate) : e4(s.top_rate), e4(s.pool_cap));

/**
 * Effective rates along a chain [streamer's agency, its parent, …, top] at time t. The top agency's rate is
 * capped by the pool; each lower agency's by its parent's effective rate minus the parent's floor. So the
 * total can never pass the pool cap, whatever is stored. Returns e4 integers and the rate rows used.
 */
export async function effectiveChain(c, chain, t, s) {
  const rows = [];
  for (const id of chain) rows.push(await rateAt(c, id, t));
  const n = chain.length;
  const eff = new Array(n);
  const cap = e4(s.pool_cap);
  eff[n - 1] = topRate(rows[n - 1], s);
  for (let i = n - 2; i >= 0; i--) {
    const own = rows[i] ? e4(rows[i].rate) : 0;
    const floor = rows[i] ? e4(rows[i].parent_floor) : 0;
    eff[i] = Math.max(0, Math.min(own, eff[i + 1] - floor));
  }
  return { eff, rows, cap };
}

export async function chainAt(c, agencyId, t) {
  const chain = [agencyId];
  while (chain.length < 6) {
    const p = await parentAt(c, chain.at(-1), t);
    if (!p || chain.includes(p)) break;
    chain.push(p);
  }
  return chain;
}

// --- Commission engine ---------------------------------------------------------------------------------------
/**
 * Computes the commission of one income event, once. The event's moment decides everything: the streamer's
 * agency then, the parent then, each rate in force then, the pool cap then. Writes the commission record, one
 * ledger row per agency share and the BD's separate row; marks the event done. Returns the record or null.
 */
export async function calcEvent(c, eventId) {
  const er = await c.query("SELECT * FROM income_events WHERE id = $1 AND calc_status = 'pending' FOR UPDATE SKIP LOCKED", [eventId]);
  if (!er.rowCount) return null;
  const ev = er.rows[0];
  const t = new Date(ev.occurred_at);
  const { values: s, ids } = await settingsAt(c, t);
  const done = (status) => c.query('UPDATE income_events SET calc_status = $2 WHERE id = $1', [ev.id, status]);
  const link = await c.query('SELECT agency_id, joined_at, invited_by FROM agency_streamers WHERE streamer_id = $1 AND joined_at <= $2 AND (ended_at IS NULL OR ended_at > $2) ORDER BY joined_at DESC LIMIT 1', [ev.streamer_id, t]);
  if (!link.rowCount) return (await done('no_agency'), null);
  // A type added after the settings were stored counts as its default.
  if (!(s.income_types[ev.source_type] ?? DEFAULTS.income_types[ev.source_type])) return (await done('excluded'), null);
  // No agency commission through a man's account (streamer_policy.women_only).
  if (s.streamer_policy.women_only) {
    const g = await c.query('SELECT gender FROM users WHERE id = $1', [ev.streamer_id]);
    if (g.rows[0]?.gender === 'Erkek') return (await done('excluded'), null);
  }

  const chain = await chainAt(c, link.rows[0].agency_id, t);
  const { eff, rows, cap } = await effectiveChain(c, chain, t, s);
  const base = Number(ev.diamonds);
  const n = chain.length;
  // Shares in 1/10,000 diamond: the streamer's agency gets base × its rate; each ancestor the difference
  // between its rate and the one below it. Their sum is base × the top's effective rate, never more.
  const shares = [{ agency: chain[0], kind: 'direct', rate: eff[0], amount: base * eff[0] }];
  for (let j = 1; j < n; j++) shares.push({ agency: chain[j], kind: 'difference', rate: eff[j] - eff[j - 1], amount: base * (eff[j] - eff[j - 1]) });

  // Transition commission: a former parent keeps a share of an independent agency's own streamers for a set time.
  let transition = null;
  if (n === 1) {
    const tr = await c.query(
      `SELECT * FROM agency_transitions WHERE agency_id = $1 AND starts_at <= $2 AND ends_at > $2
          AND (scope = 'all' OR $3::timestamptz <= starts_at) AND (cardinality(income_types) = 0 OR $4 = ANY(income_types))
        ORDER BY id DESC LIMIT 1`,
      [chain[0], t, link.rows[0].joined_at, ev.source_type],
    );
    if (tr.rowCount) {
      const r = Math.min(e4(tr.rows[0].rate), eff[0]);
      if (r > 0) {
        transition = { row: tr.rows[0], rate: r };
        shares[0].amount -= base * r;
        shares[0].rate -= r;
        shares.push({ agency: tr.rows[0].old_parent_id, kind: 'transition', rate: r, amount: base * r });
      }
    }
  }

  // Agency assistant: the share of the streamer's own agency (after a transition share) splits with the assistant
  // who brought the streamer, at the assistant's share in force then. Rounded toward zero in 1/10,000 diamond, so
  // the owner keeps the fraction and a refund takes back exactly what the gift gave.
  let split = null;
  if (link.rows[0].invited_by && shares[0].amount !== 0) {
    const a = await assistantAt(c, chain[0], link.rows[0].invited_by, t);
    const amount = a ? Math.trunc((shares[0].amount * a.pct) / 100) : 0;
    if (amount !== 0) split = { ...a, basis: shares[0].amount, amount, rate: Math.round((shares[0].rate * a.pct) / 100) };
  }

  const total = base * eff[n - 1];
  let period = periodOf(t, s.commission_period);
  if (await isClosed(c, period)) period = periodOf(new Date(), s.commission_period);
  const version = `cap#${ids.pool_cap ?? 0}|r#${rows.map((r) => r?.id ?? 0).join(',')}${transition ? `|t#${transition.row.id}` : ''}`;
  const parentAmount = shares.filter((x) => x.kind === 'difference').reduce((a, x) => a + x.amount, 0);
  const ins = await c.query(
    `INSERT INTO agency_commissions (income_event_id, txn, streamer_id, agency_id, parent_agency_id, top_agency_id, chain, base_diamonds, income_type,
       pool_cap, total_rate, agency_rate, parent_rate, transition_rate, agency_amount, parent_amount, transition_amount, usd, period, rule_version, occurred_at, assistant_amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::numeric / ${DIAMONDS_PER_USD}, $19, $20, $21, $22)
     ON CONFLICT (income_event_id) DO NOTHING RETURNING *`,
    [
      ev.id,
      `AKM-${ev.id}`,
      ev.streamer_id,
      chain[0],
      n > 1 ? chain[1] : null,
      chain[n - 1],
      chain,
      base,
      ev.source_type,
      fmt4(cap),
      fmt4(eff[n - 1]),
      fmt4(shares[0].rate),
      fmt4(eff[n - 1] - eff[0]),
      fmt4(transition?.rate ?? 0),
      fmt4(shares[0].amount),
      fmt4(parentAmount),
      fmt4(transition ? base * transition.rate : 0),
      fmt4(total),
      period,
      version,
      t,
      fmt4(split?.amount ?? 0),
    ],
  );
  if (!ins.rowCount) return (await done('done'), null);
  const com = ins.rows[0];
  for (const sh of shares) {
    if (sh.amount === 0) continue;
    await c.query('INSERT INTO agency_ledger (agency_id, kind, amount, rate, commission_id, period) VALUES ($1,$2,$3,$4,$5,$6)', [sh.agency, sh.kind, fmt4(sh.amount), fmt4(sh.rate), com.id, period]);
  }
  if (split) await bookAssistantShare(c, { commissionId: com.id, agencyId: chain[0], streamerId: ev.streamer_id, period, a: split });
  // BD: the agency's responsible BD then (the streamer's agency first, else the closest ancestor). A separate
  // item paid by the platform; the agency shares above are untouched.
  const bd = await c.query('SELECT bd_id, agency_id FROM bd_assignments WHERE agency_id = ANY($1) AND assigned_at <= $2 AND (ended_at IS NULL OR ended_at > $2)', [chain, t]);
  if (bd.rowCount && s.bd_policy.rate > 0) {
    const pick = bd.rows.sort((a, b) => chain.indexOf(a.agency_id) - chain.indexOf(b.agency_id))[0];
    const basis = s.bd_policy.basis === 'base' ? base * 1e4 : s.bd_policy.basis === 'pool' ? total : base * 1e4 + total;
    const amount = Math.round((basis * e4(s.bd_policy.rate)) / 1e4);
    if (amount !== 0)
      await c.query('INSERT INTO bd_ledger (bd_id, agency_id, commission_id, basis, rate, amount, period) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING', [
        pick.bd_id,
        pick.agency_id,
        com.id,
        fmt4(basis),
        fmt4(e4(s.bd_policy.rate)),
        fmt4(amount),
        period,
      ]);
  }
  await done('done');
  return com;
}

/**
 * Records a streamer income and computes its commission in the caller's transaction. The calculation runs in
 * a savepoint: if it fails the income stays 'pending' for the background job, and the gift itself goes through.
 */
export async function recordIncome(c, streamerId, type, sourceRef, diamonds, occurredAt = null) {
  // Everything inside one savepoint: a failure here never undoes the caller's work (a gift stays sent);
  // the background job picks a missing gift event or an uncalculated one up again.
  await c.query('SAVEPOINT agency_income');
  try {
    const r = await c.query(
      'INSERT INTO income_events (streamer_id, source_type, source_ref, diamonds, occurred_at) VALUES ($1,$2,$3,$4, coalesce($5::timestamptz, now())) ON CONFLICT (source_ref) DO NOTHING RETURNING id',
      [streamerId, type, sourceRef, diamonds, occurredAt],
    );
    await c.query('RELEASE SAVEPOINT agency_income');
    if (!r.rowCount) return null;
    // The event is kept even when its commission fails; calcPending retries it.
    await c.query('SAVEPOINT agency_calc');
    try {
      const com = await calcEvent(c, r.rows[0].id);
      await c.query('RELEASE SAVEPOINT agency_calc');
      return com;
    } catch (e) {
      await c.query('ROLLBACK TO SAVEPOINT agency_calc');
      console.error('agency commission deferred', r.rows[0].id, String(e?.message ?? e).slice(0, 200));
      return null;
    }
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT agency_income');
    console.error('agency income deferred', sourceRef, String(e?.message ?? e).slice(0, 200));
    return null;
  }
}

// --- Agency assistant (docs/AJANS_ASISTANI.md) ------------------------------------------------------------------
/**
 * The assistant `userId` of agency `agencyId` at time `t`, with the share then: { id, userId, name, pct }, or
 * null. Only while the assignment runs and the person is still one of the agency's own (a streamer of it or on
 * its team): an assistant who left the agency gets nothing from then on, as one the owner removed.
 */
export async function assistantAt(c, agencyId, userId, t) {
  const r = await c.query(
    `SELECT a.id, a.user_id, u.name,
            (SELECT s.streamer_pct FROM agency_assistant_shares s WHERE s.assistant_id = a.id AND s.effective_from <= $3
              ORDER BY s.effective_from DESC, s.id DESC LIMIT 1) AS pct
       FROM agency_assistants a JOIN users u ON u.id = a.user_id
      WHERE a.agency_id = $1 AND a.user_id = $2 AND a.assigned_at <= $3 AND (a.ended_at IS NULL OR a.ended_at > $3)
        AND (EXISTS (SELECT 1 FROM agency_streamers m WHERE m.streamer_id = a.user_id AND m.agency_id = a.agency_id AND m.joined_at <= $3 AND (m.ended_at IS NULL OR m.ended_at > $3))
          OR EXISTS (SELECT 1 FROM staff_assignments s WHERE s.user_id = a.user_id AND s.agency_id = a.agency_id AND s.granted_at <= $3 AND (s.revoked_at IS NULL OR s.revoked_at > $3)))
      ORDER BY a.assigned_at DESC LIMIT 1`,
    [agencyId, userId, t],
  );
  if (!r.rowCount) return null;
  return { id: Number(r.rows[0].id), userId: r.rows[0].user_id, name: r.rows[0].name, pct: Number(r.rows[0].pct ?? 0) };
}

export const ASSISTANT_REASON = 'Ajans asistanı payı';
export const ASSISTANT_BACK_REASON = 'Ajans asistanı payı geri alındı';

/**
 * Moves `amount` (1/10,000 diamond, signed) into the assistant's account and settles the wallet: whole diamonds
 * go in (locked as store-coin gift diamonds are, wallet.mjs LOCK_HOURS.store) once the exact total reaches them; a
 * negative amount takes whole diamonds back, as far as the balance goes (the rest is owed and later shares pay it
 * first). Returns the whole diamonds that moved (+ in, − out). The account row is locked first, so two splits for
 * the same assistant at once can't both count the same fraction.
 */
async function settleAssistant(c, userId, amount, ref, detail) {
  await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId]);
  const r = await c.query('SELECT coalesce(sum(amount), 0) AS exact, coalesce(sum(wallet), 0) AS wallet FROM agency_assistant_ledger WHERE user_id = $1', [userId]);
  const target = Math.floor((e4(r.rows[0].exact) + amount) / 1e4);
  const delta = target - Number(r.rows[0].wallet);
  if (delta > 0) {
    await move(c, userId, 'diamond', delta, ASSISTANT_REASON, ref, null, { channel: 'asistan', detail });
    await c.query("INSERT INTO diamond_locks (user_id, amount, channel, unlock_at, ref) VALUES ($1, $2, 'asistan', now() + make_interval(hours => $3::int), $4)", [userId, delta, LOCK_HOURS.store, ref]);
    return delta;
  }
  if (delta < 0) {
    const balance = Number((await c.query('SELECT diamonds FROM users WHERE id = $1', [userId])).rows[0].diamonds);
    const take = Math.min(-delta, balance);
    if (take > 0) await move(c, userId, 'diamond', -take, ASSISTANT_BACK_REASON, ref, null, { channel: 'asistan', detail });
    return -take;
  }
  return 0;
}

/** In calcEvent's transaction: the owner's 'assistant' row (the share out of the agency's commission) and the assistant's side. */
async function bookAssistantShare(c, { commissionId, agencyId, streamerId, period, a }) {
  const own = await c.query("INSERT INTO agency_ledger (agency_id, kind, amount, rate, commission_id, period, note) VALUES ($1, 'assistant', $2, $3, $4, $5, $6) RETURNING id", [
    agencyId,
    fmt4(-a.amount),
    fmt4(a.rate),
    commissionId,
    period,
    `Asistan payı %${a.pct} · ${a.name}`.slice(0, 200),
  ]);
  const wallet = await settleAssistant(c, a.userId, a.amount, `asistan:k${commissionId}`, { commission: Number(commissionId), agency: agencyId });
  await c.query(
    `INSERT INTO agency_assistant_ledger (assistant_id, user_id, agency_id, commission_id, agency_ledger_id, streamer_id, basis, pct, amount, wallet, period)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [a.id, a.userId, agencyId, commissionId, own.rows[0].id, streamerId, fmt4(a.basis), a.pct, fmt4(a.amount), wallet, period],
  );
}

/**
 * The centre reverses a commission (agency-admin.mjs commissions/reverse): the assistant's share of it comes back
 * the same way. `reversals` maps each reversed agency_ledger row id to its reversal row id. Once per share.
 */
export async function reverseAssistantShares(c, commissionId, period, reversals) {
  const r = await c.query(
    `SELECT l.* FROM agency_assistant_ledger l WHERE l.commission_id = $1 AND NOT EXISTS (SELECT 1 FROM agency_assistant_ledger x WHERE x.reverses = l.id) FOR UPDATE`,
    [commissionId],
  );
  for (const row of r.rows) {
    const amount = -e4(row.amount);
    const wallet = await settleAssistant(c, row.user_id, amount, `asistan:x${row.id}`, { commission: Number(commissionId), reverses: Number(row.id) });
    await c.query(
      `INSERT INTO agency_assistant_ledger (assistant_id, user_id, agency_id, commission_id, agency_ledger_id, reverses, streamer_id, basis, pct, amount, wallet, period)
       VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [row.assistant_id, row.user_id, row.agency_id, reversals.get(Number(row.agency_ledger_id)) ?? null, row.id, row.streamer_id, fmt4(-e4(row.basis)), row.pct, fmt4(amount), wallet, period],
    );
  }
  return r.rowCount;
}

// --- Ledger status -------------------------------------------------------------------------------------------
export const PAYOUT_LABEL = { pending: 'Onay bekliyor', ready: 'Ödemeye hazır', paid: 'Ödendi', rejected: 'Reddedildi', cancelled: 'İptal edildi' };
/** A ledger row's payout state: Hesaplanıyor (open period), Kazanıldı (closed), or its payout's state. */
export const rowStatus = (row) => (row.payout_status ? row.payout_status : row.closed ? 'earned' : 'calculating');
export const STATUS_LABEL = { calculating: 'Hesaplanıyor', earned: 'Kazanıldı', ...PAYOUT_LABEL };

/** Totals of an agency's account: earned (all rows), paid, in payout, available (closed, unclaimed), calculating. */
export async function balances(c, agencyId) {
  const r = await c.query(
    `SELECT coalesce(sum(l.amount), 0) AS earned,
            coalesce(sum(l.amount) FILTER (WHERE p.status = 'paid'), 0) AS paid,
            coalesce(sum(l.amount) FILTER (WHERE p.status IN ('pending', 'ready')), 0) AS in_payout,
            coalesce(sum(l.amount) FILTER (WHERE l.payout_id IS NULL AND ap.period IS NOT NULL), 0) AS available,
            coalesce(sum(l.amount) FILTER (WHERE l.payout_id IS NULL AND ap.period IS NULL), 0) AS calculating,
            coalesce(sum(l.amount) FILTER (WHERE l.kind = 'direct'), 0) AS direct,
            coalesce(sum(l.amount) FILTER (WHERE l.kind = 'difference'), 0) AS difference,
            coalesce(sum(l.amount) FILTER (WHERE l.kind = 'transition'), 0) AS transition,
            coalesce(sum(l.amount) FILTER (WHERE l.kind = 'assistant'), 0) AS assistant
       FROM agency_ledger l LEFT JOIN agency_payouts p ON p.id = l.payout_id LEFT JOIN agency_periods ap ON ap.period = l.period
      WHERE l.agency_id = $1`,
    [agencyId],
  );
  const x = r.rows[0];
  const out = Object.fromEntries(Object.entries(x).map(([k, v]) => [k, d4(v)]));
  out.pending = d4(out.earned - out.paid);
  return out;
}

/** Current own rate, the parent's share above it and an announced change, for panels. */
export async function rateView(c, agency, s) {
  const now = new Date();
  const chain = await chainAt(c, agency.id, now);
  const { eff } = await effectiveChain(c, chain, now, s);
  const next = await c.query('SELECT effective_from, rate, tier, source, reason FROM agency_rates WHERE agency_id = $1 AND effective_from > now() ORDER BY effective_from, id LIMIT 1', [agency.id]);
  return {
    rate: eff[0] / 1e4,
    parentShare: chain.length > 1 ? (eff[1] - eff[0]) / 1e4 : 0,
    total: eff[chain.length - 1] / 1e4,
    poolCap: s.pool_cap,
    upcoming: next.rowCount ? { effectiveFrom: next.rows[0].effective_from, rate: Number(next.rows[0].rate), tier: next.rows[0].tier, source: next.rows[0].source, reason: next.rows[0].reason } : null,
  };
}

/** The rate a sub-agency gets in a tier, within the pool and its parent's current rate minus the floor. */
export async function tierRate(c, parentId, tierKey, s) {
  const tier = s.tiers.find((t) => t.key === tierKey) ?? s.tiers[0];
  const floor = parentFloor(s, tier.key);
  // The parent's rate as it applies now (a sub of a sub would be capped by its own parent: not in v1).
  const parentRate = parentId ? topRate(await rateAt(c, parentId, new Date()), s) : e4(s.pool_cap);
  return { rate: Math.max(0, Math.min(e4(tier.sub_rate), parentRate - e4(floor))) / 1e4, floor, tier };
}

export const tierName = (s, key) => s.tiers.find((t) => t.key === key)?.name ?? key ?? null;
