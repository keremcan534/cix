import { USERS, type User } from '@/data/mock';

// --- Roles & permissions (spec §3.2–3.3) -------------------------------------
// Agency permissions are separate from room moderation permissions.
export type AgencyRole = 'owner' | 'assistant' | 'member';
export type Permission =
  | 'agency.members.read'
  | 'agency.members.manage'
  | 'agency.earnings.read'
  | 'agency.settings.manage'
  | 'room.name.edit'
  | 'room.cover.edit'
  | 'room.events.manage'
  | 'room.members.mute'
  | 'room.members.remove_from_mic'
  | 'room.admins.manage';

export const ROLE_LABEL: Record<AgencyRole, string> = { owner: 'Ajans sahibi', assistant: 'Baş asistan', member: 'Ajans yayıncısı' };

const ROLE_PERMISSIONS: Record<AgencyRole, Permission[]> = {
  owner: [
    'agency.members.read',
    'agency.members.manage',
    'agency.earnings.read',
    'agency.settings.manage',
    'room.name.edit',
    'room.cover.edit',
    'room.events.manage',
    'room.members.mute',
    'room.members.remove_from_mic',
    'room.admins.manage',
  ],
  // The head assistant manages rooms/events but never sees earnings (spec §3.1).
  assistant: ['agency.members.read', 'room.name.edit', 'room.cover.edit', 'room.events.manage', 'room.members.mute', 'room.members.remove_from_mic'],
  member: [],
};
export const can = (role: AgencyRole | null, p: Permission) => !!role && ROLE_PERMISSIONS[role].includes(p);

// --- Agency directory ---------------------------------------------------------
export type AgencyStatus = 'active' | 'review' | 'suspended' | 'closed';
export type Agency = { id: string; code: string; name: string; logo: string; hosts: number; status: AgencyStatus; owner: string; founded: string; terms: string[] };
const TERMS = ['Haftalık en az 10 saat yayın hedefi (zorunlu değil, bonus koşulu)', 'Ajans komisyonu (%40) yayıncı kazancından kesilmez, platform ayrıca öder', 'Ajanstan ayrılma talebi 7 gün içinde sonuçlanır', 'Platform desteğine her zaman doğrudan ulaşabilirsin'];
export const AGENCIES: Agency[] = [
  { id: 'a1', code: 'STAR01', name: 'Star Ajans', logo: '⭐', hosts: 48, status: 'active', owner: 'Elif', founded: '03.2025', terms: TERMS },
  { id: 'a2', code: 'MOON22', name: 'Moonlight Media', logo: '🌙', hosts: 31, status: 'active', owner: 'Mert', founded: '11.2025', terms: TERMS },
  { id: 'a3', code: 'VIBE77', name: 'Vibe Talent', logo: '💜', hosts: 19, status: 'active', owner: 'Selin', founded: '06.2026', terms: TERMS },
  { id: 'a4', code: 'OLD999', name: 'Eski Ajans', logo: '📦', hosts: 0, status: 'closed', owner: 'Kaan', founded: '01.2024', terms: TERMS },
];
export const agencyByCode = (code: string) => AGENCIES.find((a) => a.code === code.trim().toUpperCase());

// --- Agency members & performance -----------------------------------------
export type MemberStatus = 'active' | 'passive' | 'new';
export type AgencyMember = { user: User; status: MemberStatus; joined: string; hours: { d: number; w: number; m: number }; days: number; diamonds: number; goal: number };
export const AGENCY_MEMBERS: AgencyMember[] = USERS.slice(0, 10).map((u, i) => ({
  user: u,
  status: i < 6 ? 'active' : i < 8 ? 'passive' : 'new',
  joined: `${(i % 28) + 1}.0${(i % 9) + 1}.2026`,
  hours: { d: Math.max(0, 6 - (i % 7)), w: 32 - i * 2, m: 120 - i * 9 },
  days: Math.max(1, 26 - i * 2),
  diamonds: 48_000 - i * 4_300,
  goal: 40_000,
}));
export const PENDING_APPLICATIONS = [USERS[10], USERS[11]];

export const AGENCY_EVENTS = [
  { id: 'e1', title: 'Hafta sonu PK turnuvası', when: 'Cmt 21:00', reward: 'İlk 3: 50.000 💎 bonus havuzu', joined: 12 },
  { id: 'e2', title: 'Aylık 100 saat yayın hedefi', when: '31 Ekim\'e kadar', reward: 'Hedefi tutturana 5.000 💎', joined: 27 },
];

// --- Referral network (spec addendum §19–26) ----------------------------------
// Unlimited depth: children are generated lazily per node, like a paginated tree API.
export type NetNode = { id: string; userId: string; level: number; joined: string; active: boolean; childCount: number };
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export const networkChildren = (parentId: string, level: number): NetNode[] => {
  const h = hash(parentId);
  const count = level > 25 ? 0 : level === 1 ? 4 : h % 4; // depth is unlimited in principle; mock data thins out
  return Array.from({ length: count }, (_, i) => {
    const id = `${parentId}.${i}`;
    const hh = hash(id);
    return {
      id,
      userId: USERS[hh % USERS.length].id,
      level,
      joined: `${(hh % 27) + 1}.${(hh % 9) + 1}.2026`,
      active: hh % 5 !== 0,
      childCount: level >= 25 ? 0 : hash(id) % 4,
    };
  });
};

export type CommissionStatus = 'Oluşturuldu' | 'Doğrulamada' | 'Beklemede' | 'Onaylandı' | 'Ödenebilir' | 'Ödendi' | 'Reddedildi' | 'Geri alındı';
export type CommissionRow = { id: string; source: 'Üye kazanımı' | 'Platform faaliyeti' | 'Düzeltme'; ref: string; level: number; rule: string; period: string; amount: number; status: CommissionStatus };
// Example rates from the spec — simulation only, not a commercial decision.
export const SAMPLE_RATES = [
  { level: 'Faaliyeti yapan üye', rate: 0.6 },
  { level: '1. üst seviye', rate: 0.2 },
  { level: '2. üst seviye', rate: 0.1 },
  { level: '3. üst seviye', rate: 0.05 },
  { level: 'Platform payı', rate: 0.05 },
];
export const COMMISSIONS: CommissionRow[] = [
  { id: 'c1', source: 'Platform faaliyeti', ref: 'GFT-••81', level: 1, rule: 'v1.2', period: 'Eki 2026 / H4', amount: 240, status: 'Beklemede' },
  { id: 'c2', source: 'Üye kazanımı', ref: 'USR-••12', level: 1, rule: 'v1.0', period: 'Eki 2026 / H4', amount: 100, status: 'Doğrulamada' },
  { id: 'c3', source: 'Platform faaliyeti', ref: 'GFT-••07', level: 2, rule: 'v1.2', period: 'Eki 2026 / H3', amount: 85, status: 'Onaylandı' },
  { id: 'c4', source: 'Platform faaliyeti', ref: 'GFT-••55', level: 3, rule: 'v1.2', period: 'Eki 2026 / H3', amount: 42, status: 'Ödenebilir' },
  { id: 'c5', source: 'Üye kazanımı', ref: 'USR-••90', level: 1, rule: 'v1.0', period: 'Eki 2026 / H2', amount: 100, status: 'Ödendi' },
  { id: 'c6', source: 'Düzeltme', ref: 'GFT-••07', level: 2, rule: 'v1.2', period: 'Eki 2026 / H3', amount: -20, status: 'Geri alındı' },
  { id: 'c7', source: 'Üye kazanımı', ref: 'USR-••33', level: 1, rule: 'v1.0', period: 'Eki 2026 / H2', amount: 100, status: 'Reddedildi' },
];
