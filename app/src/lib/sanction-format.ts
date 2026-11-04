// Words, numbers and rules of the Yaptırımlar screens (components/admin/sanction*): durations in dk / saat / gün
// / ay / yıl, which types and lengths a staff member may give (the server's permissions and limits,
// server/api/sanctions.mjs permFor / LIMIT), a sanction's state, policy grouping and the apply form's checks.
// Pure functions and types only, so the tests can import it; the server checks everything again.

// --- Shapes the server sends (GET /api/admin/sanctions/*) -----------------------------------------------------
export type SanctionType = 'mute_room_text' | 'mute_room_voice' | 'mute_global_text' | 'mute_global_voice' | 'mute_all' | 'account_ban' | 'device_ban';
export type SanctionStatus = 'pending' | 'active' | 'rejected' | 'lifted';
export type PresetGroup = 'mute' | 'account_ban' | 'device_ban';
export type DeviceRisk = 'normal' | 'shared' | 'reinstalled' | 'changed' | 'evasion_suspect';
export type AppealStatus = 'open' | 'needs_review' | 'upheld' | 'reduced' | 'lifted';
export type AppealOutcome = 'upheld' | 'reduced' | 'lifted' | 'needs_review';

export type SanctionReason = { code: string; title: string; publicText: string };
export type SanctionPolicy = { reason: string; step: number; type: SanctionType; minutes: number | null; windowDays: number; auto: boolean; requiresApproval: boolean };
export type SanctionMeta = {
  reasons: SanctionReason[];
  types: { type: SanctionType; label: string }[];
  presets: Record<PresetGroup, number[]>;
  limits: { ban: number; device_ban: number };
  policies: SanctionPolicy[];
  perms: string[];
  allPerms: Record<string, string>;
};

export type StaffSanction = {
  id: number;
  type: SanctionType;
  label: string;
  restricts: string[];
  roomId: string | null;
  reasonCode: string;
  reason: string;
  reasonText: string;
  startAt: string;
  endAt: string | null;
  permanent: boolean;
  appliedBy: string;
  status: SanctionStatus;
  userId: string;
  live: boolean;
  note: string;
  source: 'manual' | 'report' | 'policy' | 'auto' | string;
  policyStep: number | null;
  reportId: number | null;
  room: { id: string; title: string | null } | null;
  deviceId: number | null;
  includeDm: boolean;
  includeCalls: boolean;
  createdBy: { id: string | null; name: string | null; role: string };
  createdAt: string;
  approvedBy: { id: string; name: string | null } | null;
  revokedBy: { id: string; name: string | null } | null;
  revokedAt: string | null;
  revocationReason: string | null;
  appealStatus: AppealStatus | null;
  evidence: { id: number; kind: string; content: string; by: string | null; at: string }[];
};

export type SanctionDevice = {
  id: number;
  platform: string;
  model: string;
  os: string;
  app: string;
  verification: string;
  risk: DeviceRisk;
  riskNote: string;
  firstSeenAt: string;
  lastSeenAt: string;
  accounts: number;
  banned: boolean;
};

export type SanctionAppeal = {
  id: number;
  sanctionId: number;
  userId: string;
  userName: string | null;
  text: string;
  status: AppealStatus;
  reviewedBy: string | null;
  note: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export type SanctionAudit = { id: number; actor: string; role: string; action: string; sanctionId: number | null; result: string; detail: unknown; at: string };

// --- Durations -----------------------------------------------------------------------------------------------
export const MAX_MINUTES = 5_256_000;
export const UNITS: { key: string; label: string; minutes: number }[] = [
  { key: 'dk', label: 'dk', minutes: 1 },
  { key: 'saat', label: 'saat', minutes: 60 },
  { key: 'gun', label: 'gün', minutes: 1440 },
  { key: 'ay', label: 'ay', minutes: 43_200 },
  { key: 'yil', label: 'yıl', minutes: 525_600 },
];

/** "5 dk", "6 saat", "3 gün", "1 ay", "1 yıl", "1 saat 30 dk" (at most two parts; an ay is 30 gün); null is "Süresiz". */
export function fmtMinutes(m: number | null): string {
  if (m === null) return 'Süresiz';
  if (!Number.isFinite(m) || m < 1) return '0 dk';
  const parts: string[] = [];
  let rest = Math.round(m);
  for (const u of [...UNITS].reverse()) {
    if (parts.length === 2) break;
    if (rest >= u.minutes) {
      const q = Math.floor(rest / u.minutes);
      parts.push(`${q} ${u.label}`);
      rest -= q * u.minutes;
      if (!rest) break;
    }
  }
  return parts.join(' ');
}

/** Bans read "Ömür boyu" when they never end; mutes "Süresiz". */
export const fmtLength = (type: SanctionType, m: number | null) => (m === null ? (isBan(type) ? 'Ömür boyu' : 'Süresiz') : fmtMinutes(m));
export const isBan = (t: SanctionType) => t === 'account_ban' || t === 'device_ban';
export const isMute = (t: SanctionType) => !isBan(t);
export const isRoomType = (t: SanctionType) => t === 'mute_room_text' || t === 'mute_room_voice';
export const presetGroup = (t: SanctionType): PresetGroup => (t === 'account_ban' ? 'account_ban' : t === 'device_ban' ? 'device_ban' : 'mute');

/** A custom amount in a unit as minutes, or null when it isn't a whole number from 1 minute to 10 years. */
export function minutesFrom(amount: string, unitKey: string): number | null {
  const u = UNITS.find((x) => x.key === unitKey);
  const t = amount.trim().replace(',', '.');
  if (!u || !/^\d+(\.\d+)?$/.test(t)) return null;
  const m = Math.round(Number(t) * u.minutes);
  return m >= 1 && m <= MAX_MINUTES ? m : null;
}

/** How long a sanction was given for, from its start and end (null = permanent). */
export const lengthOf = (s: Pick<StaffSanction, 'startAt' | 'endAt' | 'permanent'>) =>
  s.permanent || !s.endAt ? null : Math.max(1, Math.round((new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 60_000));

// --- Permissions ---------------------------------------------------------------------------------------------
/** The permission a sanction of `type` for `minutes` (null = permanent) needs; the same rule as the server. */
export function permFor(type: SanctionType, minutes: number | null, limits: SanctionMeta['limits']): string {
  if (type === 'account_ban') return minutes === null || minutes > limits.ban ? 'sanction.ban_permanent' : 'sanction.ban';
  if (type === 'device_ban') return minutes === null || minutes > limits.device_ban ? 'sanction.device_ban_permanent' : 'sanction.device_ban';
  return 'sanction.mute';
}

export const has = (perms: string[], p: string) => perms.includes(p);

/** Whether the staff member may give `type` at all (some length of it). */
export function typeAllowed(type: SanctionType, perms: string[]) {
  if (type === 'account_ban') return has(perms, 'sanction.ban') || has(perms, 'sanction.ban_permanent');
  if (type === 'device_ban') return has(perms, 'sanction.device_ban') || has(perms, 'sanction.device_ban_permanent');
  return has(perms, 'sanction.mute');
}

export const mayGive = (type: SanctionType, minutes: number | null, meta: Pick<SanctionMeta, 'perms' | 'limits'>) => has(meta.perms, permFor(type, minutes, meta.limits));

/** The longest timed length allowed (the timed permission's limit, or 10 years with the lifetime one). */
export function maxMinutesFor(type: SanctionType, meta: Pick<SanctionMeta, 'perms' | 'limits'>) {
  if (type === 'account_ban') return has(meta.perms, 'sanction.ban_permanent') ? MAX_MINUTES : has(meta.perms, 'sanction.ban') ? meta.limits.ban : 0;
  if (type === 'device_ban') return has(meta.perms, 'sanction.device_ban_permanent') ? MAX_MINUTES : has(meta.perms, 'sanction.device_ban') ? meta.limits.device_ban : 0;
  return has(meta.perms, 'sanction.mute') ? MAX_MINUTES : 0;
}

export type DurationOption = { minutes: number | null; label: string };
/** The preset lengths for `type` this staff member may give, then Süresiz / Ömür boyu when allowed. */
export function durationOptions(type: SanctionType, meta: Pick<SanctionMeta, 'perms' | 'limits' | 'presets'>): DurationOption[] {
  const list: DurationOption[] = (meta.presets[presetGroup(type)] ?? []).filter((m) => mayGive(type, m, meta)).map((m) => ({ minutes: m, label: fmtMinutes(m) }));
  if (mayGive(type, null, meta)) list.push({ minutes: null, label: isBan(type) ? 'Ömür boyu' : 'Süresiz' });
  return list;
}

/** Why a custom length can't be given, or null. */
export function customError(type: SanctionType, minutes: number | null, meta: Pick<SanctionMeta, 'perms' | 'limits'>): string | null {
  if (minutes === null) return 'Süre 1 dakika ile 10 yıl arası bir tam sayı olmalı';
  if (mayGive(type, minutes, meta)) return null;
  const max = maxMinutesFor(type, meta);
  return max ? `Yetkinle en çok ${fmtMinutes(max)} verebilirsin` : 'Bu tür için yetkin yok';
}

/** Appeal outcomes: upheld / needs_review with sanction.appeal, reduced / lifted only with sanction.appeal_decide. */
export function appealOutcomes(perms: string[]): AppealOutcome[] {
  const out: AppealOutcome[] = [];
  if (has(perms, 'sanction.appeal')) out.push('upheld');
  if (has(perms, 'sanction.appeal_decide')) out.push('reduced', 'lifted');
  if (has(perms, 'sanction.appeal')) out.push('needs_review');
  return out;
}

/** May this person lift `s`? A lifetime ban needs the lifetime permission too. */
export function mayLift(s: Pick<StaffSanction, 'type' | 'permanent' | 'status'>, perms: string[]) {
  if (s.status !== 'active' && s.status !== 'pending') return false;
  if (!has(perms, 'sanction.lift')) return false;
  if (s.permanent && s.type === 'account_ban') return has(perms, 'sanction.ban_permanent');
  if (s.permanent && s.type === 'device_ban') return has(perms, 'sanction.device_ban_permanent');
  return true;
}

// --- State and labels ----------------------------------------------------------------------------------------
export type SanctionState = 'active' | 'expired' | 'lifted' | 'pending' | 'rejected';
export type Tone = 'action' | 'money' | 'success' | 'danger' | 'neutral';

/** Active by the server's clock (`live`), else run out; the others are the row's status. */
export const stateOf = (s: Pick<StaffSanction, 'status' | 'live'>): SanctionState => (s.status === 'active' ? (s.live ? 'active' : 'expired') : s.status);
export const STATE_LABEL: Record<SanctionState, [string, Tone]> = {
  active: ['Sürüyor', 'danger'],
  expired: ['Süresi doldu', 'neutral'],
  lifted: ['Kaldırıldı', 'success'],
  pending: ['Onay bekliyor', 'money'],
  rejected: ['Reddedildi', 'neutral'],
};

/** Running ones (lifetime first, then the one ending last), waiting ones, then the rest newest first. */
export function splitSanctions<T extends Pick<StaffSanction, 'id' | 'status' | 'live' | 'endAt'>>(list: T[]) {
  const end = (s: T) => (s.endAt ? new Date(s.endAt).getTime() : Infinity);
  return {
    live: list.filter((s) => stateOf(s) === 'active').sort((a, b) => end(b) - end(a) || b.id - a.id),
    pending: list.filter((s) => s.status === 'pending').sort((a, b) => a.id - b.id),
    history: list.filter((s) => stateOf(s) !== 'active' && s.status !== 'pending').sort((a, b) => b.id - a.id),
  };
}

export const RISK_LABEL: Record<DeviceRisk, [string, Tone]> = {
  normal: ['Normal', 'success'],
  shared: ['Ortak kullanım', 'action'],
  reinstalled: ['Yeniden kurulum', 'money'],
  changed: ['Kimliği değişti', 'money'],
  evasion_suspect: ['Ban aşma şüphesi', 'danger'],
};
export const RISKS = Object.keys(RISK_LABEL) as DeviceRisk[];

export const DEVICE_PLATFORM: Record<string, string> = { android: 'Android', ios: 'iOS', web: 'Web', unknown: 'Bilinmeyen platform' };

export const ROLE_LABEL: Record<string, string> = {
  user: 'Kullanıcı',
  coins_bank: 'Jeton bankası',
  moderator: 'Moderatör',
  admin: 'Yönetici',
  system: 'Otomatik sistem',
  room_admin: 'Oda yöneticisi',
  room_owner: 'Oda sahibi',
};
export const roleLabel = (r: string | null | undefined) => (r ? (ROLE_LABEL[r] ?? r) : '');

export const SOURCE_LABEL: Record<string, string> = { manual: 'Elle', report: 'Şikâyetten', policy: 'Ceza kademesinden', auto: 'Otomatik (şikâyet sayısı)', room: 'Oda yönetiminden' };

export const AUDIT_ACTION: Record<string, string> = {
  apply: 'Yaptırım uygulandı',
  propose: 'Onaya gönderildi',
  lift: 'Yaptırım kaldırıldı',
  approve: 'Onaylandı',
  reject: 'Onay reddedildi',
  evidence: 'Kanıt eklendi',
  appeal: 'İtiraz edildi',
  appeal_upheld: 'İtiraz: yaptırım yerinde',
  appeal_reduced: 'İtiraz: süre azaltıldı',
  appeal_lifted: 'İtiraz: kaldırıldı',
  appeal_needs_review: 'İtiraz: ek incelemeye',
  policy: 'Ceza kademesi değişti',
  grant: 'Yetki verildi',
  revoke: 'Yetki alındı',
  device_risk: 'Cihaz riski işaretlendi',
  device_review: 'Cihaz incelendi',
  device_blocked: 'Banlı cihazdan giriş engellendi',
  sign_in: 'Giriş denemesi',
  room_kick: 'Odadan çıkarıldı',
  room_unkick: 'Oda engeli kaldırıldı',
};
export const auditAction = (a: string) => AUDIT_ACTION[a] ?? a;
export const AUDIT_RESULT: Record<string, [string, Tone]> = { ok: ['Tamam', 'success'], denied: ['Yetki yok', 'danger'], blocked: ['Engellendi', 'money'] };

export const APPEAL_LABEL: Record<AppealStatus, [string, Tone]> = {
  open: ['Açık', 'money'],
  needs_review: ['Ek inceleme', 'action'],
  upheld: ['Yaptırım yerinde', 'neutral'],
  reduced: ['Süre azaltıldı', 'success'],
  lifted: ['Kaldırıldı', 'success'],
};
export const OUTCOME_LABEL: Record<AppealOutcome, string> = { upheld: 'Yaptırım yerinde', reduced: 'Süreyi azalt', lifted: 'Kaldır', needs_review: 'Ek incelemeye al' };

/** "Gerekçe yazı ve DM'ler" style coverage line for a mute. */
export function coverage(s: Pick<StaffSanction, 'type' | 'includeDm' | 'includeCalls'>) {
  if (s.type === 'mute_all') return 'Oda yazısı, mikrofon, DM ve aramalar';
  if (s.type === 'mute_global_text') return s.includeDm ? 'Oda yazıları ve DM’ler' : 'Oda yazıları (DM’ler serbest)';
  if (s.type === 'mute_global_voice') return s.includeCalls ? 'Mikrofon ve aramalar' : 'Mikrofon (aramalar serbest)';
  return '';
}

// --- Policies ------------------------------------------------------------------------------------------------
export type PolicyGroup = { reason: SanctionReason; windowDays: number; steps: SanctionPolicy[] };
/** Every category in the panel's order, with its steps in order (none yet: an empty list, 90 days). */
export function groupPolicies(policies: SanctionPolicy[], reasons: SanctionReason[]): PolicyGroup[] {
  return reasons.map((reason) => {
    const steps = policies.filter((p) => p.reason === reason.code).sort((a, b) => a.step - b.step);
    return { reason, windowDays: steps[0]?.windowDays ?? 90, steps };
  });
}

/** Lifetime bans and device bans never start by themselves (the server forces approval on them). */
export const heavyStep = (type: SanctionType, minutes: number | null) => type === 'device_ban' || (type === 'account_ban' && minutes === null);

export type PolicyStepDraft = { type: SanctionType; minutes: number | null; auto: boolean; requiresApproval: boolean };
/** A step as the server will store it: approval forced on heavy ones, automatic only for mutes without approval. */
export function normalizeStep(x: PolicyStepDraft): PolicyStepDraft {
  const requiresApproval = x.requiresApproval || heavyStep(x.type, x.minutes);
  return { ...x, requiresApproval, auto: x.auto && !requiresApproval && isMute(x.type) };
}
export function policyError(steps: PolicyStepDraft[], windowDays: string): string | null {
  if (steps.length > 10) return 'En çok 10 kademe olabilir';
  const w = Number(windowDays);
  if (steps.length && !(Number.isInteger(w) && w >= 1 && w <= 3650)) return 'Değerlendirme süresi 1–3650 gün olmalı';
  const bad = steps.findIndex((s) => s.minutes !== null && !(Number.isInteger(s.minutes) && s.minutes >= 1 && s.minutes <= MAX_MINUTES));
  return bad >= 0 ? `Kademe ${bad + 1}: süre geçersiz` : null;
}

// --- Apply form ----------------------------------------------------------------------------------------------
export type ApplyForm = {
  usePolicy: boolean;
  type: SanctionType;
  reason: string;
  /** undefined: no length chosen yet; null: permanent. */
  minutes: number | null | undefined;
  description: string;
  note: string;
  roomId: string;
  includeDm: boolean;
  includeCalls: boolean;
  deviceIds: number[];
  evidence: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Each non-empty line of the evidence box is one item; web addresses are links, the rest notes (at most 10). */
export function evidenceItems(text: string): { kind: 'link' | 'note'; content: string }[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((content) => ({ kind: /^https?:\/\/\S+$/i.test(content) ? 'link' : 'note', content: content.slice(0, 2000) }));
}

/** The first thing that stops the form from being sent, in the words the staff member reads; null when ready. */
export function applyError(f: ApplyForm, meta: Pick<SanctionMeta, 'perms' | 'limits' | 'policies'>): string | null {
  if (!f.reason) return 'İhlal kategorisini seç';
  if (f.usePolicy) {
    if (!meta.policies.some((p) => p.reason === f.reason)) return 'Bu kategori için ceza kademesi tanımlı değil';
  } else {
    if (!typeAllowed(f.type, meta.perms)) return 'Bu yaptırım türü için yetkin yok';
    if (f.minutes === undefined) return 'Süreyi seç';
    const e = f.minutes === null ? (mayGive(f.type, null, meta) ? null : 'Süresiz yaptırım için yetkin yok') : customError(f.type, f.minutes, meta);
    if (e) return e;
    if (isRoomType(f.type) && !UUID.test(f.roomId.trim())) return 'Oda kimliğini yaz (odanın paylaşım bağlantısındaki uzun kimlik)';
    if (f.type === 'device_ban' && !f.deviceIds.length) return 'Engellenecek en az bir cihaz seç';
  }
  const d = f.description.trim();
  if (d && (d.length < 3 || d.length > 300)) return 'Gerekçe 3–300 karakter olmalı';
  if (f.note.trim().length > 2000) return 'İç not en çok 2000 karakter';
  if (!d && !f.note.trim()) return 'Kullanıcıya gösterilecek gerekçe veya iç not yaz';
  return null;
}

/** The POST /api/admin/sanctions body for a valid form. */
export function applyBody(user: string, f: ApplyForm, reportId?: number) {
  const evidence = evidenceItems(f.evidence);
  return {
    user,
    type: f.type,
    reason: f.reason,
    ...(f.usePolicy ? { usePolicy: true } : { minutes: f.minutes ?? null }),
    description: f.description.trim(),
    note: f.note.trim(),
    ...(isRoomType(f.type) && f.roomId.trim() ? { roomId: f.roomId.trim().toLowerCase() } : {}),
    ...(f.type === 'mute_global_text' && f.includeDm ? { includeDm: true } : {}),
    ...(f.type === 'mute_global_voice' && f.includeCalls ? { includeCalls: true } : {}),
    ...(f.type === 'device_ban' ? { deviceIds: f.deviceIds } : {}),
    ...(evidence.length ? { evidence } : {}),
    ...(reportId ? { reportId } : {}),
  };
}

export type ApplyBody = ReturnType<typeof applyBody>;

/** Bans (and a policy step, which may be one) are asked once more before they are sent. */
export const needsConfirm = (f: Pick<ApplyForm, 'type' | 'usePolicy'>) => f.usePolicy || isBan(f.type);

/** What happened, for the toast: started, or waiting for a second person. */
export function applyResult(rows: Pick<StaffSanction, 'status' | 'label'>[]) {
  if (!rows.length) return 'Yaptırım kaydedildi';
  const pending = rows.every((r) => r.status === 'pending');
  const what = rows.length > 1 ? `${rows.length} ${rows[0].label.toLocaleLowerCase('tr-TR')}` : rows[0].label;
  return pending ? `${what} onaya gönderildi` : `${what} uygulandı`;
}
