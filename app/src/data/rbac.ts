// Central role & permission model ("Rol ve Yetki Merkezi").
// Roles, their permission sets, scopes and assignments are DATA: they can be created and changed from the
// panel without code changes. The permission catalog below is the list of ACTION TYPES the software
// supports — adding a brand-new kind of action still requires code that implements and enforces it.
import { AGENCIES } from '@/data/agency';
import { ROOMS, USERS } from '@/data/mock';

export type ScopeType = 'platform' | 'region' | 'agency' | 'room';
export type Scope = { type: ScopeType; id?: string };
export type PermissionKey =
  | 'users.view'
  | 'users.mute'
  | 'users.ban'
  | 'rooms.manage'
  | 'agencies.view'
  | 'agencies.apply'
  | 'agencies.assign'
  | 'bd.commission.view'
  | 'finance.reports.view'
  | 'roles.create'
  | 'roles.edit'
  | 'agency_apps.view_assigned'
  | 'agency_apps.view_all'
  | 'agency_apps.review'
  | 'agency_apps.documents'
  | 'agency_apps.assign'
  | 'agency_apps.decide'
  | 'agencies.manage'
  | 'agencies.commission'
  | 'agencies.coinsbank'
  | 'agencies.payout'
  | 'agencies.performance'
  | 'games.manage'
  | 'animations.manage'
  | 'pk.manage'
  | 'lucky.manage';

export const PERMISSIONS: { key: PermissionKey; label: string; group: string; critical?: boolean; minScope?: ScopeType }[] = [
  { key: 'users.view', label: 'Kullanıcıları görüntüle', group: 'Kullanıcı' },
  { key: 'users.mute', label: 'Kullanıcı susturma', group: 'Kullanıcı' },
  { key: 'users.ban', label: 'Kullanıcı banlama', group: 'Kullanıcı', critical: true },
  { key: 'rooms.manage', label: 'Oda yönetimi', group: 'Oda' },
  { key: 'agencies.view', label: 'Ajansları görüntüle', group: 'Ajans' },
  { key: 'agencies.apply', label: 'Ajans oluşturma başvurusu', group: 'Ajans' },
  { key: 'agencies.assign', label: 'Ajans atama', group: 'Ajans' },
  { key: 'bd.commission.view', label: 'BD komisyon raporunu görüntüle', group: 'Finans' },
  { key: 'finance.reports.view', label: 'Finansal raporları görüntüle', group: 'Finans', critical: true },
  { key: 'roles.create', label: 'Rol oluşturma', group: 'Yetki', critical: true, minScope: 'platform' },
  { key: 'roles.edit', label: 'Rol ve yetki değiştirme', group: 'Yetki', critical: true, minScope: 'platform' },
  { key: 'agency_apps.view_assigned', label: 'Atanmış ajans başvurularını görüntüle', group: 'Ajans başvurusu' },
  { key: 'agency_apps.view_all', label: 'Tüm ajans başvurularını görüntüle', group: 'Ajans başvurusu' },
  { key: 'agency_apps.review', label: 'Başvuru değerlendirme (not, ek bilgi, Admin onayına gönderme)', group: 'Ajans başvurusu' },
  { key: 'agency_apps.documents', label: 'Başvuru belgelerini görüntüle', group: 'Ajans başvurusu' },
  { key: 'agency_apps.assign', label: 'Başvuruyu BD’ye atama / devretme', group: 'Ajans başvurusu' },
  { key: 'agency_apps.decide', label: 'Başvuruyu kesin onaylama / reddetme / askıya alma', group: 'Ajans başvurusu', critical: true },
  { key: 'agencies.manage', label: 'Ajans hesabı yönetimi (sahip, yöneticiler, sözleşme)', group: 'Ajans başvurusu' },
  { key: 'agencies.commission', label: 'Ajans komisyon kuralı tanımlama', group: 'Ajans başvurusu', critical: true, minScope: 'platform' },
  { key: 'agencies.coinsbank', label: 'Ajans Coins Bank erişimini etkinleştirme', group: 'Ajans başvurusu', critical: true },
  { key: 'agencies.payout', label: 'Ajans ödeme yetkisi, finansal doğrulama ve ödeme onayı', group: 'Ajans başvurusu', critical: true, minScope: 'platform' },
  { key: 'agencies.performance', label: 'Atanmış ajansların performansını görüntüle', group: 'Ajans başvurusu' },
  { key: 'games.manage', label: 'Oyun kataloğu, VIP şartı, limit ve sağlayıcı ayarları', group: 'Oyun', critical: true, minScope: 'platform' },
  { key: 'animations.manage', label: 'Animasyon kataloğu, fiyat, lisans ve sağlayıcı yönetimi', group: 'İçerik', critical: true, minScope: 'platform' },
  { key: 'pk.manage', label: 'PK ayarları (Normal, Takım, odalar arası), aktif PK izleme, iade ve iptal', group: 'Oda', critical: true, minScope: 'platform' },
  { key: 'lucky.manage', label: 'Lucky hediye paketleri, olasılıklar, ödül rezervi ve kayıtlar', group: 'Oda', critical: true, minScope: 'platform' },
];
export const permLabel = (k: PermissionKey) => PERMISSIONS.find((p) => p.key === k)?.label ?? k;
export const SCOPE_LABEL: Record<ScopeType, string> = { platform: 'Platform', region: 'Bölge', agency: 'Ajans', room: 'Oda' };
const SCOPE_RANK: Record<ScopeType, number> = { room: 0, agency: 1, region: 2, platform: 3 };

export const REGIONS = [
  { id: 'marmara', name: 'Marmara' },
  { id: 'ege', name: 'Ege' },
  { id: 'icanadolu', name: 'İç Anadolu' },
];
// Which region an agency / room belongs to (mock); rooms belong to an agency when they are agency rooms.
export const AGENCY_REGION: Record<string, string> = { a1: 'marmara', a2: 'ege', a3: 'marmara', a4: 'icanadolu' };
export const ROOM_AGENCY: Record<string, string> = { r2: 'a1', r7: 'a3' };
const roomRegion = (roomId: string) => (ROOM_AGENCY[roomId] ? AGENCY_REGION[ROOM_AGENCY[roomId]] : 'marmara');

export const scopeName = (s: Scope) => {
  if (s.type === 'platform') return 'Tüm platform';
  if (s.type === 'region') return `Bölge: ${REGIONS.find((r) => r.id === s.id)?.name ?? s.id}`;
  if (s.type === 'agency') return `Ajans: ${AGENCIES.find((a) => a.id === s.id)?.name ?? s.id}`;
  return `Oda: ${ROOMS.find((r) => r.id === s.id)?.title ?? s.id}`;
};
/** Does an assignment scope cover the target scope? platform ⊃ region ⊃ agency ⊃ room. */
export const covers = (have: Scope, target: Scope): boolean => {
  if (have.type === 'platform') return true;
  if (SCOPE_RANK[have.type] < SCOPE_RANK[target.type]) return false;
  if (have.type === target.type) return have.id === target.id;
  if (have.type === 'region') return target.type === 'agency' ? AGENCY_REGION[target.id ?? ''] === have.id : roomRegion(target.id ?? '') === have.id;
  if (have.type === 'agency') return ROOM_AGENCY[target.id ?? ''] === have.id;
  return false;
};

export type Role = {
  id: string;
  name: string;
  permissions: PermissionKey[];
  /** Explicit denials always win over grants from other roles. */
  denies: PermissionKey[];
  scopeTypes: ScopeType[]; // role_scopes: where this role may be assigned
  priority: number; // higher wins conflicts; also bounds who may edit whom
  protected?: boolean;
  system?: boolean;
};
export type UserRole = { id: string; userId: string; roleId: string; scope: Scope; grantedBy: string; at: string };
export type AuditLog = { id: string; at: string; actor: string; action: string; target: string; before?: string; after?: string; result: 'Uygulandı' | 'Reddedildi' };
export type ModerationAction = { id: string; at: string; actor: string; action: 'Susturma' | 'Ban' | 'Ban kaldırma' | 'Uyarı'; userId: string; scope: Scope; reason: string; duration: string; result: 'Uygulandı' | 'Reddedildi'; note?: string };
export type RbacState = { roles: Role[]; userRoles: UserRole[]; audit: AuditLog[]; moderation: ModerationAction[] };

const ALL = PERMISSIONS.map((p) => p.key);
export const INITIAL_RBAC: RbacState = {
  roles: [
    { id: 'super', name: 'Super Admin', permissions: ALL, denies: [], scopeTypes: ['platform'], priority: 100, protected: true, system: true },
    { id: 'admin', name: 'Admin', permissions: ALL.filter((k) => k !== 'roles.edit'), denies: [], scopeTypes: ['platform', 'region'], priority: 80, system: true },
    { id: 'mod', name: 'Moderatör', permissions: ['users.view', 'users.mute', 'users.ban', 'rooms.manage'], denies: ['finance.reports.view'], scopeTypes: ['region', 'agency', 'room'], priority: 50, system: true },
    // BD: final approval, commission rates, payouts and bans stay off by default (spec: agency applications §4).
    {
      id: 'bd',
      name: 'BD',
      permissions: ['agencies.view', 'agencies.apply', 'agencies.assign', 'bd.commission.view', 'agency_apps.view_assigned', 'agency_apps.review', 'agency_apps.documents', 'agencies.performance'],
      denies: [],
      scopeTypes: ['region', 'platform'],
      priority: 40,
      system: true,
    },
  ],
  userRoles: [
    { id: 'ur1', userId: 'me', roleId: 'super', scope: { type: 'platform' }, grantedBy: 'Sistem', at: '01.10.2026' },
    { id: 'ur2', userId: 'u2', roleId: 'mod', scope: { type: 'region', id: 'marmara' }, grantedBy: 'Demo', at: '12.10.2026' },
    { id: 'ur3', userId: 'u2', roleId: 'bd', scope: { type: 'region', id: 'ege' }, grantedBy: 'Demo', at: '15.10.2026' },
    { id: 'ur4', userId: 'u5', roleId: 'bd', scope: { type: 'region', id: 'marmara' }, grantedBy: 'Demo', at: '18.10.2026' },
    { id: 'ur5', userId: 'u9', roleId: 'mod', scope: { type: 'room', id: 'r1' }, grantedBy: 'Demo', at: '20.10.2026' },
    { id: 'ur6', userId: 'u3', roleId: 'admin', scope: { type: 'platform' }, grantedBy: 'Demo', at: '01.10.2026' },
  ],
  audit: [],
  moderation: [],
};

export const userName = (id: string) => (id === 'me' ? 'Sen' : (USERS.find((u) => u.id === id)?.name ?? id));

export type Decision = { allowed: boolean; reason: string; via?: string };
/**
 * Resolution order (explicit priority rule):
 * 1. Explicit deny on any of the user's roles whose scope covers the target → DENY (deny beats allow).
 * 2. Critical permission with a minimum scope (e.g. commission rates, roles) → only grants held at that scope count.
 * 3. Otherwise ALLOW if any assigned role grants it at a covering scope; the highest-priority such role is reported.
 * 4. No matching grant → DENY (default deny).
 */
export function resolve(state: RbacState, userId: string, perm: PermissionKey, target: Scope): Decision {
  const def = PERMISSIONS.find((p) => p.key === perm)!;
  const mine = state.userRoles
    .filter((ur) => ur.userId === userId)
    .map((ur) => ({ ur, role: state.roles.find((r) => r.id === ur.roleId) }))
    .filter((x): x is { ur: UserRole; role: Role } => !!x.role)
    .sort((a, b) => b.role.priority - a.role.priority);
  const covering = mine.filter((x) => covers(x.ur.scope, target));
  const deny = covering.find((x) => x.role.denies.includes(perm));
  if (deny) return { allowed: false, reason: `"${deny.role.name}" rolünde açık yasak var (yasak, izinden önce gelir).`, via: deny.role.name };
  const grants = covering.filter((x) => x.role.permissions.includes(perm));
  if (def.minScope) {
    const ok = grants.find((x) => SCOPE_RANK[x.ur.scope.type] >= SCOPE_RANK[def.minScope!]);
    if (!ok)
      return grants.length
        ? { allowed: false, reason: `Kritik işlem: yalnızca ${SCOPE_LABEL[def.minScope]} kapsamındaki yetki geçerlidir; "${grants[0].role.name}" bu kapsamda değil.` }
        : { allowed: false, reason: 'Bu işlemi veren bir rol ataması yok (varsayılan: reddet).' };
    return { allowed: true, reason: `"${ok.role.name}" (${scopeName(ok.ur.scope)}) ile izinli · kritik işlem, gerekçe ve denetim kaydı zorunlu.`, via: ok.role.name };
  }
  if (grants.length) return { allowed: true, reason: `"${grants[0].role.name}" (${scopeName(grants[0].ur.scope)}) ile izinli${def.critical ? ' · kritik işlem, gerekçe zorunlu' : ''}.`, via: grants[0].role.name };
  if (mine.some((x) => x.role.permissions.includes(perm))) return { allowed: false, reason: 'Yetki var ama atanmış kapsam bu hedefi kapsamıyor.' };
  return { allowed: false, reason: 'Bu işlemi veren bir rol ataması yok (varsayılan: reddet).' };
}

/** Highest role priority a user holds anywhere (bounds which roles they may edit or grant). */
export const maxPriority = (state: RbacState, userId: string) =>
  Math.max(0, ...state.userRoles.filter((u) => u.userId === userId).map((u) => state.roles.find((r) => r.id === u.roleId)?.priority ?? 0));

/** Plain-text technical spec for a role (the "Seçimi teknik şartnameye dönüştür" button). */
export function roleSpec(role: Role) {
  const lines = [
    `ROL: ${role.name} (id: ${role.id})`,
    `Öncelik: ${role.priority}${role.protected ? ' · korumalı (değiştirilemez/silinemez)' : ''}`,
    `Atanabilir kapsamlar (role_scopes): ${role.scopeTypes.map((s) => SCOPE_LABEL[s]).join(', ')}`,
    `İzinler (${role.permissions.length}):`,
    ...role.permissions.map((k) => {
      const p = PERMISSIONS.find((x) => x.key === k)!;
      return `  - ${k} · ${p.label}${p.critical ? ' · KRİTİK' : ''}${p.minScope ? ` · en az ${SCOPE_LABEL[p.minScope]} kapsamı` : ''}`;
    }),
    `Açık yasaklar: ${role.denies.length ? role.denies.join(', ') : 'yok'}`,
    '',
    'Kurallar:',
    '  1. Yasak her zaman izinden önce gelir.',
    '  2. Kritik işlemler gerekçe ister, permission_audit_logs / moderation_actions tablosuna yazılır.',
    '  3. Kullanıcı kendi rolünü değiştiremez; kendinden yüksek öncelikli rolü düzenleyemez veya atayamaz.',
    '  4. Sahip olmadığı izni başkasına veremez (yetki yükseltme yok).',
    '  5. Tüm kontroller sunucuda yapılır; istemci yalnızca görüntüler.',
  ];
  return lines.join('\n');
}

/** Staff badge on profiles. It comes only from role assignments made by authorised staff; users cannot set or edit it. */
export function staffBadgeOf(state: RbacState, userId: string): 'Yönetici' | 'Moderatör' | null {
  const ids = state.userRoles.filter((ur) => ur.userId === userId).map((ur) => ur.roleId);
  if (ids.includes('super') || ids.includes('admin')) return 'Yönetici';
  if (ids.includes('mod')) return 'Moderatör';
  return null;
}
