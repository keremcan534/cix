// Agency application system – prototype "server" (demo only, no backend).
// Applications, BD/Admin reviews, status history, agency accounts, agreements, commission rules,
// the agency Coins Bank ledger and payout requests live in this module-level store
// (useSyncExternalStore), next to the app store. Every mutation below is the stand-in for a
// server endpoint: it re-checks the actor's permission with the central RBAC model (never trusting
// the UI), validates the transition, appends to history/audit and returns an error string or null.
// Nothing is deleted: statuses move forward, commission rules get new versions, ledger mistakes are
// fixed with reversal rows.
import { useSyncExternalStore } from 'react';

import { AGENCIES } from '@/data/agency';
import { USERS } from '@/data/mock';
import { REGIONS, resolve, type PermissionKey, type RbacState, type Scope } from '@/data/rbac';
import { RULES } from '@/data/rules';

// --- Types (one per suggested table) ----------------------------------------------

export type AppStatus =
  | 'Taslak'
  | 'Başvuru Alındı'
  | 'Ön İncelemede'
  | 'BD Değerlendirmesinde'
  | 'Ek Bilgi Bekleniyor'
  | 'Admin Onayı Bekleniyor'
  | 'Onaylandı'
  | 'Reddedildi'
  | 'Askıya Alındı'
  | 'Başvuru İptal Edildi';
export const APP_STATUSES: AppStatus[] = [
  'Taslak',
  'Başvuru Alındı',
  'Ön İncelemede',
  'BD Değerlendirmesinde',
  'Ek Bilgi Bekleniyor',
  'Admin Onayı Bekleniyor',
  'Onaylandı',
  'Reddedildi',
  'Askıya Alındı',
  'Başvuru İptal Edildi',
];
export const CLOSED: AppStatus[] = ['Onaylandı', 'Reddedildi', 'Başvuru İptal Edildi'];
export const STATUS_TONE: Record<AppStatus, 'neutral' | 'info' | 'warn' | 'good' | 'bad'> = {
  Taslak: 'neutral',
  'Başvuru Alındı': 'info',
  'Ön İncelemede': 'info',
  'BD Değerlendirmesinde': 'info',
  'Ek Bilgi Bekleniyor': 'warn',
  'Admin Onayı Bekleniyor': 'warn',
  Onaylandı: 'good',
  Reddedildi: 'bad',
  'Askıya Alındı': 'bad',
  'Başvuru İptal Edildi': 'neutral',
};
/** Main path shown as a progress line to the applicant. */
export const MAIN_PATH: AppStatus[] = ['Başvuru Alındı', 'Ön İncelemede', 'BD Değerlendirmesinde', 'Admin Onayı Bekleniyor', 'Onaylandı'];

export type Experience = 'first' | 'running' | 'other_platform' | 'representative';
export const EXPERIENCE_LABEL: Record<Experience, string> = {
  first: 'İlk kez ajans kuracağım.',
  running: 'Hâlihazırda bir ajans yönetiyorum.',
  other_platform: 'Başka bir platformda ajans yönettim.',
  representative: 'Mevcut bir ajansın temsilcisiyim.',
};

/** agency_applications (form part). No tax number: not required to apply or register (spec §8). */
export type ApplicationForm = {
  agencyName: string;
  fullName: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  experience: Experience | null;
  platforms: string;
  company: string;
  links: string;
  estimatedHosts: string;
  recruitPlan: string;
  growthGoals: string;
  notes: string;
  consent: boolean;
};
export const EMPTY_FORM: ApplicationForm = {
  agencyName: '',
  fullName: '',
  email: '',
  phone: '',
  country: 'Türkiye',
  city: '',
  experience: null,
  platforms: '',
  company: '',
  links: '',
  estimatedHosts: '',
  recruitPlan: '',
  growthGoals: '',
  notes: '',
  consent: false,
};
export const COUNTRIES = ['Türkiye', 'Azerbaycan', 'Almanya', 'Kuzey Kıbrıs', 'Diğer'];

export type DocKind = 'Kimlik' | 'İşletme belgesi' | 'Deneyim kanıtı' | 'Diğer';
/** agency_application_documents */
export type AppDocument = { id: string; name: string; kind: DocKind; at: string; size: string; uri?: string };
/** agency_application_status_history */
export type StatusChange = { id: string; at: string; from: AppStatus | null; to: AppStatus; actor: string; note?: string };
/** agency_application_reviews */
export type Review = { id: string; at: string; actor: string; kind: 'Değerlendirme notu' | 'Ek bilgi talebi' | 'Başvuru sahibi yanıtı' | 'Admin’e gönderildi' | 'Karar'; text: string; scores?: { experience: number; capacity: number } };
export type InfoRequest = { id: string; at: string; by: string; question: string; answer?: string; answeredAt?: string };
/** agency_assignments */
export type Assignment = { id: string; at: string; appId: string; bdId: string; by: string; note?: string; kind: 'Atama' | 'Devir' };

export type Application = {
  id: string;
  number: string;
  applicantId: string;
  form: ApplicationForm;
  emailVerified: boolean;
  phoneVerified: boolean;
  docs: AppDocument[];
  status: AppStatus;
  /** Where to go back to after "Ek Bilgi Bekleniyor" is answered or a suspension is lifted. */
  resumeTo?: AppStatus;
  assignedBd?: string;
  createdTs: number;
  submittedTs?: number;
  decidedAt?: string;
  decisionReason?: string;
  agencyId?: string;
  history: StatusChange[];
  reviews: Review[];
  infoRequests: InfoRequest[];
};

export type StaffRole = 'Sahip' | 'Yönetici' | 'Asistan';
/** agency_users */
export type AgencyUser = { userId: string; role: StaffRole; at: string; by: string };
/** agency_agreements (append-only; the last one is current) */
export type Agreement = { version: number; status: 'İmza bekliyor' | 'İmzalandı'; start: string; end: string; preparedBy: string; preparedAt: string; signedAt?: string };
/** agency_commission_rules (versioned; a new version closes the previous one) */
export type CommissionRule = { version: number; rate: number; basis: string; from: string; to?: string; by: string; at: string; reason: string };
export const COMMISSION_BASES = ['Bağlı yayıncıların geçerli elmas kazancı', 'Bağlı yayıncıların iade sonrası hediye geliri'];
/** agency_earnings_ledger */
export type LedgerRow = { id: string; ref: string; at: string; period: string; hostId: string; base: number; rate: number; ruleVersion: number; amount: number; status: 'Bekleyen' | 'Kesinleşti' | 'Ters kayıt'; reverses?: string; note?: string };
/** agency_payout_accounts */
export type PayoutAccount = { holder: string; iban: string; status: 'Doğrulanmadı' | 'Doğrulandı'; verifiedBy?: string; verifiedAt?: string };
/** agency_payout_requests */
export type PayoutRequest = { id: string; ref: string; at: string; amount: number; status: 'İncelemede' | 'Ödendi' | 'Reddedildi'; by: string; decidedBy?: string; decidedAt?: string; reason?: string };

/** agencies */
export type AgencyAccount = {
  id: string;
  code: string;
  name: string;
  appId: string;
  ownerId: string;
  users: AgencyUser[];
  bdId?: string;
  country: string;
  city: string;
  appliedAt: string;
  approvedAt: string;
  status: 'Kurulum' | 'Aktif' | 'Askıda';
  agreements: Agreement[];
  rules: CommissionRule[];
  hosts: { userId: string; at: string }[];
  coinsBank: { enabled: boolean; at?: string; by?: string };
  payoutAccount?: PayoutAccount;
  payoutEnabled: boolean;
  ledger: LedgerRow[];
  payouts: PayoutRequest[];
};

/** audit_logs */
export type Audit = { id: string; at: string; actor: string; action: string; target: string; detail: string; result: 'Uygulandı' | 'Reddedildi' };

export type AgencyAppsState = { apps: Application[]; agencies: AgencyAccount[]; assignments: Assignment[]; audit: Audit[] };

// --- Helpers ----------------------------------------------------------------------

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
export const stamp = (ts: number) => {
  const d = new Date(ts);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const day = (ts: number) => stamp(ts).slice(0, 10);
let seq = 0;
const id = (p: string) => `${p}-${Date.now().toString(36).toUpperCase().slice(-4)}${(++seq).toString(36).toUpperCase().padStart(2, '0')}`;
const fmt = (n: number) => n.toLocaleString('tr-TR');
export const personName = (uid: string) => (uid === 'me' ? 'Sen (Demo)' : uid === 'system' ? 'Sistem' : uid === 'team' ? 'SimilarClub ekibi' : (USERS.find((u) => u.id === uid)?.name ?? uid));
const normPhone = (p: string) => p.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
const normEmail = (e: string) => e.trim().toLowerCase();
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
export const validPhone = (p: string) => normPhone(p).length >= 10;

const REGION_CITIES: Record<string, string[]> = {
  marmara: ['İstanbul', 'Bursa', 'Kocaeli', 'Sakarya', 'Tekirdağ', 'Edirne', 'Balıkesir', 'Çanakkale', 'Yalova'],
  ege: ['İzmir', 'Aydın', 'Muğla', 'Denizli', 'Manisa', 'Uşak'],
  icanadolu: ['Ankara', 'Konya', 'Eskişehir', 'Kayseri', 'Sivas'],
};
/** Region an application belongs to (for scoped permissions); null = outside the defined regions. */
export const regionOf = (country: string, city: string) =>
  country === 'Türkiye' ? (Object.keys(REGION_CITIES).find((r) => REGION_CITIES[r].some((c) => c.toLocaleLowerCase('tr') === city.trim().toLocaleLowerCase('tr'))) ?? null) : null;
export const regionName = (country: string, city: string) => {
  const r = regionOf(country, city);
  return r ? (REGIONS.find((x) => x.id === r)?.name ?? r) : 'Bölge dışı (yalnız platform yetkisi)';
};
const scopeOf = (a: Pick<Application, 'form'>): Scope => {
  const r = regionOf(a.form.country, a.form.city);
  return r ? { type: 'region', id: r } : { type: 'platform' };
};
export const hostCapacity = (a: Application) => Number(a.form.estimatedHosts) || 0;
export const CAPACITY_BANDS = [
  { key: 'all', label: 'Tüm kapasiteler', min: 0, max: Infinity },
  { key: 's', label: '1–20 yayıncı', min: 1, max: 20 },
  { key: 'm', label: '21–50', min: 21, max: 50 },
  { key: 'l', label: '50+', min: 51, max: Infinity },
] as const;

// --- Seed data (demo) -------------------------------------------------------------

const DAY = 86_400_000;
const T0 = Date.now();
const form = (f: Partial<ApplicationForm>): ApplicationForm => ({ ...EMPTY_FORM, consent: true, ...f });
const hist = (entries: [number, AppStatus | null, AppStatus, string, string?][]): StatusChange[] =>
  entries.map(([ago, from, to, actor, note], i) => ({ id: `H-seed-${i}-${to}`, at: stamp(T0 - ago * DAY), from, to, actor, note }));

const SEED_APPS: Application[] = [
  {
    id: 'app1',
    number: 'SC-AJ-2026-000118',
    applicantId: 'u6',
    form: form({ agencyName: 'Bursa Sesleri', fullName: 'Burak Yılmaz', email: 'burak@bursasesleri.com', phone: '0532 111 22 33', city: 'Bursa', experience: 'other_platform', platforms: 'Yalla, Bigo Live', links: 'instagram.com/bursasesleri', estimatedHosts: '35', recruitPlan: 'Üniversite kulüpleri ve mevcut yayıncı ağım.', growthGoals: '6 ayda 60 aktif yayıncı.' }),
    emailVerified: true,
    phoneVerified: true,
    docs: [{ id: 'd1', name: 'bigo-ajans-paneli.png', kind: 'Deneyim kanıtı', at: stamp(T0 - 2 * DAY), size: '412 KB' }],
    status: 'Başvuru Alındı',
    createdTs: T0 - 2 * DAY,
    submittedTs: T0 - 2 * DAY,
    history: hist([[2, null, 'Başvuru Alındı', 'u6']]),
    reviews: [],
    infoRequests: [],
  },
  {
    id: 'app2',
    number: 'SC-AJ-2026-000112',
    applicantId: 'u4',
    form: form({ agencyName: 'Ege Yıldızları', fullName: 'Can Demir', email: 'can.demir@mail.com', phone: '0544 222 33 44', city: 'İzmir', experience: 'first', estimatedHosts: '12', recruitPlan: 'Müzisyen arkadaşlarım ve yerel etkinlikler.', growthGoals: 'İlk 3 ayda 20 yayıncı.' }),
    emailVerified: true,
    phoneVerified: true,
    docs: [],
    status: 'BD Değerlendirmesinde',
    assignedBd: 'u2',
    createdTs: T0 - 6 * DAY,
    submittedTs: T0 - 6 * DAY,
    history: hist([
      [6, null, 'Başvuru Alındı', 'u4'],
      [5, 'Başvuru Alındı', 'Ön İncelemede', 'u3'],
      [5, 'Ön İncelemede', 'BD Değerlendirmesinde', 'u3', 'BD atandı: Mert'],
    ]),
    reviews: [],
    infoRequests: [],
  },
  {
    id: 'app3',
    number: 'SC-AJ-2026-000109',
    applicantId: 'u10',
    form: form({ agencyName: 'Anadolu Ses Ajansı', fullName: 'Kaan Aydın', email: 'kaan@anadoluses.com', phone: '0505 333 44 55', city: 'Eskişehir', experience: 'running', platforms: 'Timo, StarMaker', company: 'Anadolu Medya Ltd.', estimatedHosts: '80', recruitPlan: 'Mevcut 80 yayıncının yarısını taşımayı planlıyorum.', growthGoals: 'Yıl sonunda bölgenin en büyük ajansı.' }),
    emailVerified: true,
    phoneVerified: true,
    docs: [
      { id: 'd2', name: 'faaliyet-belgesi.pdf', kind: 'İşletme belgesi', at: stamp(T0 - 9 * DAY), size: '1,2 MB' },
      { id: 'd3', name: 'timo-yayinci-listesi.png', kind: 'Deneyim kanıtı', at: stamp(T0 - 9 * DAY), size: '688 KB' },
    ],
    status: 'Admin Onayı Bekleniyor',
    assignedBd: 'u3',
    createdTs: T0 - 9 * DAY,
    submittedTs: T0 - 9 * DAY,
    history: hist([
      [9, null, 'Başvuru Alındı', 'u10'],
      [8, 'Başvuru Alındı', 'Ön İncelemede', 'u3'],
      [8, 'Ön İncelemede', 'BD Değerlendirmesinde', 'u3', 'BD atandı: Zeynep (geçici)'],
      [3, 'BD Değerlendirmesinde', 'Admin Onayı Bekleniyor', 'u3', 'Güçlü aday, belgeler tamam.'],
    ]),
    reviews: [{ id: 'r1', at: stamp(T0 - 3 * DAY), actor: 'u3', kind: 'Değerlendirme notu', text: 'Timo’da 2 yıllık ajans geçmişi doğrulandı. Yayıncı kapasitesi gerçekçi.', scores: { experience: 5, capacity: 4 } }],
    infoRequests: [],
  },
  {
    id: 'app4',
    number: 'SC-AJ-2026-000104',
    applicantId: 'u7',
    form: form({ agencyName: 'Boğaz Talent', fullName: 'Ayşe Kara', email: 'ayse.kara@mail.com', phone: '0533 444 55 66', city: 'İstanbul', experience: 'representative', company: 'Boğaz Talent (temsilci)', estimatedHosts: '25', recruitPlan: '', growthGoals: '' }),
    emailVerified: true,
    phoneVerified: true,
    docs: [],
    status: 'Ek Bilgi Bekleniyor',
    resumeTo: 'BD Değerlendirmesinde',
    assignedBd: 'u5',
    createdTs: T0 - 12 * DAY,
    submittedTs: T0 - 12 * DAY,
    history: hist([
      [12, null, 'Başvuru Alındı', 'u7'],
      [11, 'Başvuru Alındı', 'Ön İncelemede', 'u3'],
      [11, 'Ön İncelemede', 'BD Değerlendirmesinde', 'u3', 'BD atandı: Selin'],
      [4, 'BD Değerlendirmesinde', 'Ek Bilgi Bekleniyor', 'u5', 'Temsil yetkisi soruldu'],
    ]),
    reviews: [{ id: 'r2', at: stamp(T0 - 4 * DAY), actor: 'u5', kind: 'Ek bilgi talebi', text: 'Temsil ettiğiniz ajansın yetki belgesini ve yayıncı bulma planınızı paylaşır mısınız?' }],
    infoRequests: [{ id: 'q1', at: stamp(T0 - 4 * DAY), by: 'u5', question: 'Temsil ettiğiniz ajansın yetki belgesini ve yayıncı bulma planınızı paylaşır mısınız?' }],
  },
  {
    id: 'app5',
    number: 'SC-AJ-2026-000097',
    applicantId: 'u12',
    form: form({ agencyName: 'Hızlı Kazanç Ajansı', fullName: 'Onur Şahin', email: 'onur@mail.com', phone: '0507 555 66 77', city: 'Konya', experience: 'first', estimatedHosts: '500', recruitPlan: 'Reklam.', growthGoals: '' }),
    emailVerified: true,
    phoneVerified: false,
    docs: [],
    status: 'Reddedildi',
    createdTs: T0 - 20 * DAY,
    submittedTs: T0 - 20 * DAY,
    decidedAt: stamp(T0 - 15 * DAY),
    decisionReason: 'Yayıncı kapasitesi kanıtlanamadı ve telefon doğrulanmadı.',
    history: hist([
      [20, null, 'Başvuru Alındı', 'u12'],
      [19, 'Başvuru Alındı', 'Ön İncelemede', 'u3'],
      [15, 'Ön İncelemede', 'Reddedildi', 'u3', 'Yayıncı kapasitesi kanıtlanamadı ve telefon doğrulanmadı.'],
    ]),
    reviews: [],
    infoRequests: [],
  },
  {
    id: 'app6',
    number: 'SC-AJ-2026-000081',
    applicantId: 'u11',
    form: form({ agencyName: 'Melodi Ajans', fullName: 'Melis Koç', email: 'melis@melodiajans.com', phone: '0536 666 77 88', city: 'İstanbul', experience: 'running', platforms: 'Yalla', estimatedHosts: '40', recruitPlan: 'Dans ve müzik toplulukları.', growthGoals: '100 yayıncı.' }),
    emailVerified: true,
    phoneVerified: true,
    docs: [{ id: 'd4', name: 'yalla-sozlesme.pdf', kind: 'Deneyim kanıtı', at: stamp(T0 - 30 * DAY), size: '940 KB' }],
    status: 'Onaylandı',
    assignedBd: 'u5',
    createdTs: T0 - 30 * DAY,
    submittedTs: T0 - 30 * DAY,
    decidedAt: stamp(T0 - 21 * DAY),
    agencyId: 'AGY-100081',
    history: hist([
      [30, null, 'Başvuru Alındı', 'u11'],
      [29, 'Başvuru Alındı', 'Ön İncelemede', 'u3'],
      [29, 'Ön İncelemede', 'BD Değerlendirmesinde', 'u3', 'BD atandı: Selin'],
      [24, 'BD Değerlendirmesinde', 'Admin Onayı Bekleniyor', 'u5', 'Önerilir.'],
      [21, 'Admin Onayı Bekleniyor', 'Onaylandı', 'u3', 'Ajans hesabı oluşturuldu: AGY-100081'],
    ]),
    reviews: [{ id: 'r3', at: stamp(T0 - 24 * DAY), actor: 'u5', kind: 'Değerlendirme notu', text: 'Yalla’daki ajans paneli görüldü, 40 yayıncı gerçek.', scores: { experience: 4, capacity: 4 } }],
    infoRequests: [],
  },
];

const ledgerFor = (agencyId: string, hosts: string[], rate: number, ruleVersion: number, settled: boolean): LedgerRow[] =>
  hosts.flatMap((h, i) =>
    [0, 1].map((w) => {
      const base = 60_000 + ((i * 37_000 + w * 21_000) % 90_000);
      return {
        id: `${agencyId}-L${i}${w}`,
        ref: `AEL-${agencyId.slice(-4)}${i}${w}`,
        at: stamp(T0 - (w + 1) * 7 * DAY),
        period: `Eki 2026 / H${3 + w}`,
        hostId: h,
        base,
        rate,
        ruleVersion,
        amount: Math.round(base * rate),
        status: settled && w === 1 ? ('Kesinleşti' as const) : ('Bekleyen' as const),
      };
    }),
  );

const SEED_AGENCIES: AgencyAccount[] = [
  {
    id: 'AGY-100081',
    code: 'MELO81',
    name: 'Melodi Ajans',
    appId: 'app6',
    ownerId: 'u11',
    users: [
      { userId: 'u11', role: 'Sahip', at: stamp(T0 - 21 * DAY), by: 'u3' },
      { userId: 'u9', role: 'Yönetici', at: stamp(T0 - 20 * DAY), by: 'u3' },
    ],
    bdId: 'u5',
    country: 'Türkiye',
    city: 'İstanbul',
    appliedAt: stamp(T0 - 30 * DAY),
    approvedAt: stamp(T0 - 21 * DAY),
    status: 'Aktif',
    agreements: [{ version: 1, status: 'İmzalandı', start: day(T0 - 20 * DAY), end: day(T0 + 345 * DAY), preparedBy: 'u3', preparedAt: stamp(T0 - 21 * DAY), signedAt: stamp(T0 - 20 * DAY) }],
    rules: [{ version: 1, rate: 0.4, basis: COMMISSION_BASES[0], from: day(T0 - 20 * DAY), by: 'u3', at: stamp(T0 - 21 * DAY), reason: 'Standart ajans komisyonu' }],
    hosts: ['u1', 'u7', 'u9'].map((userId, i) => ({ userId, at: stamp(T0 - (19 - i) * DAY) })),
    coinsBank: { enabled: true, at: stamp(T0 - 20 * DAY), by: 'u3' },
    payoutAccount: { holder: 'Melis Koç', iban: 'TR12 0006 4000 0011 2345 6789 01', status: 'Doğrulandı', verifiedBy: 'u3', verifiedAt: stamp(T0 - 18 * DAY) },
    payoutEnabled: true,
    ledger: ledgerFor('AGY-100081', ['u1', 'u7', 'u9'], 0.4, 1, true),
    payouts: [{ id: 'P-seed1', ref: 'APR-81A1', at: stamp(T0 - 6 * DAY), amount: 50_000, status: 'Ödendi', by: 'u11', decidedBy: 'u3', decidedAt: stamp(T0 - 5 * DAY) }],
  },
];

const SEED_ASSIGNMENTS: Assignment[] = [
  { id: 'AS-1', at: stamp(T0 - 5 * DAY), appId: 'app2', bdId: 'u2', by: 'u3', kind: 'Atama' },
  { id: 'AS-2', at: stamp(T0 - 8 * DAY), appId: 'app3', bdId: 'u3', by: 'u3', kind: 'Atama' },
  { id: 'AS-3', at: stamp(T0 - 11 * DAY), appId: 'app4', bdId: 'u5', by: 'u3', kind: 'Atama' },
  { id: 'AS-4', at: stamp(T0 - 29 * DAY), appId: 'app6', bdId: 'u5', by: 'u3', kind: 'Atama' },
];

// --- Store ------------------------------------------------------------------------

let state: AgencyAppsState = { apps: SEED_APPS, agencies: SEED_AGENCIES, assignments: SEED_ASSIGNMENTS, audit: [] };
const listeners = new Set<() => void>();
const set = (next: AgencyAppsState) => {
  state = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => state;
export const useAgencyApps = () => useSyncExternalStore(subscribe, snapshot, snapshot);

const log = (actor: string, action: string, target: string, detail: string, result: Audit['result'] = 'Uygulandı') => {
  state = { ...state, audit: [{ id: id('AUD'), at: stamp(Date.now()), actor, action, target, detail, result }, ...state.audit] };
};
const patchApp = (appId: string, fn: (a: Application) => Application) => set({ ...state, apps: state.apps.map((a) => (a.id === appId ? fn(a) : a)) });
const patchAgency = (agencyId: string, fn: (a: AgencyAccount) => AgencyAccount) => set({ ...state, agencies: state.agencies.map((a) => (a.id === agencyId ? fn(a) : a)) });
const move = (a: Application, to: AppStatus, actor: string, note?: string): Application => ({
  ...a,
  status: to,
  history: [...a.history, { id: id('H'), at: stamp(Date.now()), from: a.status, to, actor, note }],
});
const getApp = (appId: string) => state.apps.find((a) => a.id === appId);
const getAgency = (agencyId: string) => state.agencies.find((a) => a.id === agencyId);

// --- Authorization (server-side stand-in) ----------------------------------------

export type Ctx = { rbac: RbacState; actor: string };
const allowed = (ctx: Ctx, perm: PermissionKey, target: Scope) => resolve(ctx.rbac, ctx.actor, perm, target).allowed;
/** Checks a permission; a refusal is written to the audit log just like a successful action. */
const guard = (ctx: Ctx, perm: PermissionKey, target: Scope, action: string, targetLabel: string): string | null => {
  const d = resolve(ctx.rbac, ctx.actor, perm, target);
  if (d.allowed) return null;
  log(ctx.actor, action, targetLabel, d.reason, 'Reddedildi');
  set({ ...state });
  return d.reason;
};
const refuse = (ctx: Ctx | string, action: string, target: string, reason: string) => {
  log(typeof ctx === 'string' ? ctx : ctx.actor, action, target, reason, 'Reddedildi');
  set({ ...state });
  return reason;
};

/** A staff member sees every application with "view all" in its scope, or the ones assigned to them. */
export const canSeeApp = (ctx: Ctx, a: Application) =>
  a.status !== 'Taslak' && (allowed(ctx, 'agency_apps.view_all', scopeOf(a)) || (a.assignedBd === ctx.actor && allowed(ctx, 'agency_apps.view_assigned', scopeOf(a))));
export const canDo = (ctx: Ctx, perm: PermissionKey, a: Pick<Application, 'form'>) => allowed(ctx, perm, scopeOf(a));
export const canSeeDocs = (ctx: Ctx, a: Application) => canSeeApp(ctx, a) && canDo(ctx, 'agency_apps.documents', a);
const agencyScope = (ag: AgencyAccount): Scope => scopeOf({ form: { ...EMPTY_FORM, country: ag.country, city: ag.city } });
export const canManageAgency = (ctx: Ctx, ag: AgencyAccount) => allowed(ctx, 'agencies.manage', agencyScope(ag));
export const isAgencyOwner = (actor: string, ag: AgencyAccount) => ag.ownerId === actor;
/** Staff eligible to be assigned an application: holds view-assigned + review over its region. */
export const eligibleBds = (rbac: RbacState, a: Application) =>
  [...new Set(rbac.userRoles.map((u) => u.userId))].filter((uid) => allowed({ rbac, actor: uid }, 'agency_apps.view_assigned', scopeOf(a)) && allowed({ rbac, actor: uid }, 'agency_apps.review', scopeOf(a)));

// --- Applicant actions ------------------------------------------------------------

export const myApplications = (actor: string) => state.apps.filter((a) => a.applicantId === actor);
/** What the applicant sees of the history: staff appear as "SimilarClub ekibi"; only notes meant for them are shown. */
const PUBLIC_NOTES: AppStatus[] = ['Ek Bilgi Bekleniyor', 'Reddedildi', 'Askıya Alındı'];
const APPLICANT_STEPS: AppStatus[] = ['Taslak', 'Başvuru Alındı', 'Başvuru İptal Edildi'];
// Decided by the kind of step, not only by who did it: the same person can be applicant and staff.
const byApplicant = (a: Application, h: StatusChange) => h.actor === a.applicantId && (APPLICANT_STEPS.includes(h.to) || h.from === 'Ek Bilgi Bekleniyor');
export const publicHistory = (a: Application): StatusChange[] =>
  a.history
    .filter((h) => h.from !== h.to)
    .map((h) =>
      byApplicant(a, h)
        ? h
        : { ...h, actor: 'team', note: PUBLIC_NOTES.includes(h.to) ? h.note : h.to === 'Onaylandı' ? `Ajans hesabın oluşturuldu${a.agencyId ? `: ${a.agencyId}` : ''}` : undefined },
    );
const own = (actor: string, appId: string, action: string) => {
  const a = getApp(appId);
  if (!a) return { err: 'Başvuru bulunamadı.' };
  // Applicants can only touch their own application.
  if (a.applicantId !== actor) return { err: refuse(actor, action, a.number, 'Başkasına ait başvuruya erişim engellendi.') };
  return { a };
};

/** Required fields only; everything else is optional. Returns the first problem or null. */
export function validateForm(f: ApplicationForm, emailVerified: boolean, phoneVerified: boolean): string | null {
  if (f.agencyName.trim().length < 3) return 'Ajans adı en az 3 karakter olmalı.';
  if (f.fullName.trim().split(/\s+/).length < 2) return 'Adını ve soyadını yaz.';
  if (!validEmail(f.email)) return 'Geçerli bir e-posta adresi yaz.';
  if (!emailVerified) return 'E-posta adresini doğrula.';
  if (!validPhone(f.phone)) return 'Geçerli bir telefon numarası yaz.';
  if (!phoneVerified) return 'Telefon numaranı doğrula.';
  if (!f.country) return 'Faaliyet ülkesini seç.';
  if (f.city.trim().length < 2) return 'Şehir veya faaliyet bölgesini yaz.';
  if (!f.experience) return 'Ajans deneyimini seç.';
  if (!(Number(f.estimatedHosts) > 0)) return 'Tahmini yayıncı sayısını yaz.';
  if (!f.consent) return 'Gizlilik bildirimini ve veri işleme onayını kabul et.';
  return null;
}

/** Duplicate application / agency check (open applications, existing agencies, same contact details). */
export function duplicateOf(f: ApplicationForm, selfId?: string): string | null {
  const name = f.agencyName.trim().toLocaleLowerCase('tr');
  const open = state.apps.filter((a) => a.id !== selfId && a.status !== 'Taslak' && a.status !== 'Reddedildi' && a.status !== 'Başvuru İptal Edildi');
  const sameContact = open.find((a) => normEmail(a.form.email) === normEmail(f.email) || normPhone(a.form.phone) === normPhone(f.phone));
  if (sameContact) return `Bu e-posta veya telefonla açık bir başvuru var (${sameContact.number}).`;
  if ([...AGENCIES.map((a) => a.name), ...state.agencies.map((a) => a.name), ...open.map((a) => a.form.agencyName)].some((n) => n.toLocaleLowerCase('tr') === name))
    return 'Bu adla kayıtlı bir ajans veya açık bir başvuru var. Farklı bir ajans adı seç.';
  return null;
}

/** Creates or updates the applicant's draft. Returns the application id. */
export function saveDraft(actor: string, f: ApplicationForm, emailVerified: boolean, phoneVerified: boolean, docs: AppDocument[], draftId?: string): string {
  if (draftId) {
    const { a, err } = own(actor, draftId, 'Taslak kaydı');
    if (err || !a || a.status !== 'Taslak') return draftId;
    patchApp(draftId, (x) => ({ ...x, form: f, emailVerified, phoneVerified, docs }));
    return draftId;
  }
  const appId = id('APP');
  const app: Application = { id: appId, number: '—', applicantId: actor, form: f, emailVerified, phoneVerified, docs, status: 'Taslak', createdTs: Date.now(), history: [{ id: id('H'), at: stamp(Date.now()), from: null, to: 'Taslak', actor }], reviews: [], infoRequests: [] };
  set({ ...state, apps: [app, ...state.apps] });
  return appId;
}

export function submitApplication(actor: string, draftId: string): string | null {
  const { a, err } = own(actor, draftId, 'Başvuru gönderme');
  if (err || !a) return err ?? 'Başvuru bulunamadı.';
  if (a.status !== 'Taslak') return 'Bu başvuru zaten gönderilmiş.';
  const invalid = validateForm(a.form, a.emailVerified, a.phoneVerified);
  if (invalid) return invalid;
  const dup = duplicateOf(a.form, a.id);
  if (dup) return refuse(actor, 'Başvuru gönderme', a.form.agencyName, `Mükerrer kontrolü: ${dup}`);
  if (state.apps.some((x) => x.applicantId === actor && x.id !== a.id && !CLOSED.includes(x.status) && x.status !== 'Taslak')) return 'Zaten devam eden bir ajans başvurun var.';
  const number = `SC-AJ-${new Date().getFullYear()}-${pad(120 + state.apps.filter((x) => x.number !== '—').length, 6)}`;
  patchApp(a.id, (x) => ({ ...move({ ...x, number, submittedTs: Date.now() }, 'Başvuru Alındı', actor) }));
  log(actor, 'Başvuru gönderildi', number, `${a.form.agencyName} · ${a.form.city}, ${a.form.country}`);
  set({ ...state });
  return null;
}

export function answerInfoRequest(actor: string, appId: string, reqId: string, answer: string, docs: AppDocument[]): string | null {
  const { a, err } = own(actor, appId, 'Ek bilgi yanıtı');
  if (err || !a) return err ?? 'Başvuru bulunamadı.';
  if (a.status !== 'Ek Bilgi Bekleniyor') return 'Şu an senden ek bilgi beklenmiyor.';
  if (answer.trim().length < 5) return 'Yanıtın en az 5 karakter olmalı.';
  const back = a.resumeTo ?? 'BD Değerlendirmesinde';
  patchApp(appId, (x) =>
    move(
      {
        ...x,
        resumeTo: undefined,
        docs: [...x.docs, ...docs],
        infoRequests: x.infoRequests.map((q) => (q.id === reqId ? { ...q, answer: answer.trim(), answeredAt: stamp(Date.now()) } : q)),
        reviews: [...x.reviews, { id: id('R'), at: stamp(Date.now()), actor, kind: 'Başvuru sahibi yanıtı', text: answer.trim() + (docs.length ? ` (+${docs.length} belge)` : '') }],
      },
      back,
      actor,
      'Ek bilgi gönderildi',
    ),
  );
  log(actor, 'Ek bilgi yanıtlandı', a.number, `${docs.length} belge eklendi`);
  set({ ...state });
  return null;
}

export function cancelApplication(actor: string, appId: string): string | null {
  const { a, err } = own(actor, appId, 'Başvuru iptali');
  if (err || !a) return err ?? 'Başvuru bulunamadı.';
  if (CLOSED.includes(a.status)) return 'Sonuçlanmış başvuru iptal edilemez.';
  patchApp(appId, (x) => move(x, 'Başvuru İptal Edildi', actor, 'Başvuru sahibi iptal etti'));
  log(actor, 'Başvuru iptal edildi', a.number, 'Başvuru sahibi tarafından');
  set({ ...state });
  return null;
}

// --- BD / Admin actions -----------------------------------------------------------

const staffGet = (ctx: Ctx, appId: string, action: string) => {
  const a = getApp(appId);
  if (!a) return { err: 'Başvuru bulunamadı.' };
  if (!canSeeApp(ctx, a)) return { err: refuse(ctx, action, a.number, 'Bu başvuru sana atanmamış veya kapsamın dışında.') };
  return { a };
};

export function startPreReview(ctx: Ctx, appId: string): string | null {
  const { a, err } = staffGet(ctx, appId, 'Ön incelemeye alma');
  if (err || !a) return err ?? null;
  const denied = guard(ctx, 'agency_apps.assign', scopeOf(a), 'Ön incelemeye alma', a.number);
  if (denied) return denied;
  if (a.status !== 'Başvuru Alındı') return 'Yalnız yeni gelen başvurular ön incelemeye alınır.';
  patchApp(appId, (x) => move(x, 'Ön İncelemede', ctx.actor));
  log(ctx.actor, 'Ön incelemeye alındı', a.number, '');
  set({ ...state });
  return null;
}

export function assignBd(ctx: Ctx, appId: string, bdId: string, note: string): string | null {
  const { a, err } = staffGet(ctx, appId, 'BD atama');
  if (err || !a) return err ?? null;
  const denied = guard(ctx, 'agency_apps.assign', scopeOf(a), 'BD atama', a.number);
  if (denied) return denied;
  if (CLOSED.includes(a.status)) return 'Sonuçlanmış başvuruya atama yapılamaz.';
  if (!eligibleBds(ctx.rbac, a).includes(bdId)) return refuse(ctx, 'BD atama', a.number, `${personName(bdId)} bu başvurunun bölgesinde (${regionName(a.form.country, a.form.city)}) değerlendirme yetkisine sahip değil.`);
  if (a.assignedBd === bdId) return 'Başvuru zaten bu kişiye atanmış.';
  const kind: Assignment['kind'] = a.assignedBd ? 'Devir' : 'Atama';
  const label = `${kind === 'Devir' ? `Devredildi: ${personName(a.assignedBd!)} → ` : 'BD atandı: '}${personName(bdId)}${note.trim() ? ` · ${note.trim()}` : ''}`;
  patchApp(appId, (x) => {
    const withBd = { ...x, assignedBd: bdId };
    if (x.status === 'Başvuru Alındı' || x.status === 'Ön İncelemede') return move(withBd, 'BD Değerlendirmesinde', ctx.actor, label);
    // Status unchanged on a hand-over; the change still goes into the history.
    return { ...withBd, history: [...x.history, { id: id('H'), at: stamp(Date.now()), from: x.status, to: x.status, actor: ctx.actor, note: label }] };
  });
  state = { ...state, assignments: [{ id: id('AS'), at: stamp(Date.now()), appId, bdId, by: ctx.actor, note: note.trim() || undefined, kind }, ...state.assignments] };
  log(ctx.actor, kind === 'Devir' ? 'Başvuru devredildi' : 'BD atandı', a.number, label);
  set({ ...state });
  return null;
}

export function addReviewNote(ctx: Ctx, appId: string, text: string, scores?: { experience: number; capacity: number }): string | null {
  const { a, err } = staffGet(ctx, appId, 'Değerlendirme notu');
  if (err || !a) return err ?? null;
  const denied = guard(ctx, 'agency_apps.review', scopeOf(a), 'Değerlendirme notu', a.number);
  if (denied) return denied;
  if (text.trim().length < 3) return 'Not en az 3 karakter olmalı.';
  patchApp(appId, (x) => ({ ...x, reviews: [...x.reviews, { id: id('R'), at: stamp(Date.now()), actor: ctx.actor, kind: 'Değerlendirme notu', text: text.trim(), scores }] }));
  log(ctx.actor, 'Dahili not eklendi', a.number, scores ? `Deneyim ${scores.experience}/5 · Kapasite ${scores.capacity}/5` : '');
  set({ ...state });
  return null;
}

export function requestInfo(ctx: Ctx, appId: string, question: string): string | null {
  const { a, err } = staffGet(ctx, appId, 'Ek bilgi talebi');
  if (err || !a) return err ?? null;
  const denied = guard(ctx, 'agency_apps.review', scopeOf(a), 'Ek bilgi talebi', a.number);
  if (denied) return denied;
  if (!['Ön İncelemede', 'BD Değerlendirmesinde', 'Admin Onayı Bekleniyor'].includes(a.status)) return 'Bu aşamada ek bilgi istenemez.';
  if (question.trim().length < 5) return 'Sorunu yaz (en az 5 karakter).';
  patchApp(appId, (x) =>
    move(
      {
        ...x,
        resumeTo: x.status,
        infoRequests: [...x.infoRequests, { id: id('Q'), at: stamp(Date.now()), by: ctx.actor, question: question.trim() }],
        reviews: [...x.reviews, { id: id('R'), at: stamp(Date.now()), actor: ctx.actor, kind: 'Ek bilgi talebi', text: question.trim() }],
      },
      'Ek Bilgi Bekleniyor',
      ctx.actor,
      question.trim(),
    ),
  );
  log(ctx.actor, 'Ek bilgi istendi', a.number, question.trim());
  set({ ...state });
  return null;
}

export function sendToAdmin(ctx: Ctx, appId: string, summary: string): string | null {
  const { a, err } = staffGet(ctx, appId, 'Admin onayına gönderme');
  if (err || !a) return err ?? null;
  const denied = guard(ctx, 'agency_apps.review', scopeOf(a), 'Admin onayına gönderme', a.number);
  if (denied) return denied;
  if (a.status !== 'BD Değerlendirmesinde') return 'Yalnız BD değerlendirmesindeki başvurular Admin onayına gönderilir.';
  if (summary.trim().length < 5) return 'Admin için kısa bir değerlendirme özeti yaz.';
  patchApp(appId, (x) => move({ ...x, reviews: [...x.reviews, { id: id('R'), at: stamp(Date.now()), actor: ctx.actor, kind: 'Admin’e gönderildi', text: summary.trim() }] }, 'Admin Onayı Bekleniyor', ctx.actor, summary.trim()));
  log(ctx.actor, 'Admin onayına gönderildi', a.number, summary.trim());
  set({ ...state });
  return null;
}

/** Final approval: only from "Admin Onayı Bekleniyor"; creates the agency account (setup stage, no payouts). */
export function approveApplication(ctx: Ctx, appId: string, note: string): { err: string | null; agencyId?: string } {
  const { a, err } = staffGet(ctx, appId, 'Başvuru onayı');
  if (err || !a) return { err: err ?? null };
  const denied = guard(ctx, 'agency_apps.decide', scopeOf(a), 'Başvuru onayı', a.number);
  if (denied) return { err: denied };
  if (a.status !== 'Admin Onayı Bekleniyor') return { err: 'Başvuru önce BD değerlendirmesinden geçip Admin onayına gelmeli.' };
  const dup = duplicateOf(a.form, a.id);
  if (dup) return { err: refuse(ctx, 'Başvuru onayı', a.number, `Mükerrer kontrolü: ${dup}`) };
  const agencyId = `AGY-${String(100000 + Math.floor(Math.random() * 900000))}`;
  const code = (a.form.agencyName.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').slice(0, 4).toLocaleUpperCase('tr') || 'AJNS').padEnd(4, 'X') + agencyId.slice(-2);
  const t = stamp(Date.now());
  const agency: AgencyAccount = {
    id: agencyId,
    code,
    name: a.form.agencyName.trim(),
    appId: a.id,
    ownerId: a.applicantId,
    users: [{ userId: a.applicantId, role: 'Sahip', at: t, by: ctx.actor }],
    bdId: a.assignedBd,
    country: a.form.country,
    city: a.form.city,
    appliedAt: a.submittedTs ? stamp(a.submittedTs) : t,
    approvedAt: t,
    status: 'Kurulum',
    agreements: [],
    rules: [],
    hosts: [],
    coinsBank: { enabled: false },
    payoutEnabled: false,
    ledger: [],
    payouts: [],
  };
  patchApp(appId, (x) => ({ ...move(x, 'Onaylandı', ctx.actor, `${note.trim() ? `${note.trim()} · ` : ''}Ajans hesabı oluşturuldu: ${agencyId}`), decidedAt: t, agencyId }));
  state = { ...state, agencies: [agency, ...state.agencies] };
  log(ctx.actor, 'Başvuru onaylandı', a.number, `Ajans hesabı ${agencyId} (${agency.name}) oluşturuldu · ödeme yetkisi kapalı`);
  set({ ...state });
  return { err: null, agencyId };
}

export function rejectApplication(ctx: Ctx, appId: string, reason: string): string | null {
  const { a, err } = staffGet(ctx, appId, 'Başvuru reddi');
  if (err || !a) return err ?? null;
  const denied = guard(ctx, 'agency_apps.decide', scopeOf(a), 'Başvuru reddi', a.number);
  if (denied) return denied;
  if (CLOSED.includes(a.status)) return 'Başvuru zaten sonuçlanmış.';
  if (reason.trim().length < 5) return 'Ret gerekçesini yaz (başvuru sahibine gösterilir).';
  patchApp(appId, (x) => ({ ...move(x, 'Reddedildi', ctx.actor, reason.trim()), decidedAt: stamp(Date.now()), decisionReason: reason.trim() }));
  log(ctx.actor, 'Başvuru reddedildi', a.number, reason.trim());
  set({ ...state });
  return null;
}

export function suspendApplication(ctx: Ctx, appId: string, reason: string): string | null {
  const { a, err } = staffGet(ctx, appId, 'Başvuru askıya alma');
  if (err || !a) return err ?? null;
  const denied = guard(ctx, 'agency_apps.decide', scopeOf(a), 'Başvuru askıya alma', a.number);
  if (denied) return denied;
  if (CLOSED.includes(a.status) || a.status === 'Askıya Alındı') return 'Bu başvuru askıya alınamaz.';
  if (reason.trim().length < 5) return 'Askıya alma gerekçesini yaz.';
  patchApp(appId, (x) => ({ ...move({ ...x, resumeTo: x.status }, 'Askıya Alındı', ctx.actor, reason.trim()), decisionReason: reason.trim() }));
  log(ctx.actor, 'Başvuru askıya alındı', a.number, reason.trim());
  set({ ...state });
  return null;
}

export function resumeApplication(ctx: Ctx, appId: string): string | null {
  const { a, err } = staffGet(ctx, appId, 'Askıyı kaldırma');
  if (err || !a) return err ?? null;
  const denied = guard(ctx, 'agency_apps.decide', scopeOf(a), 'Askıyı kaldırma', a.number);
  if (denied) return denied;
  if (a.status !== 'Askıya Alındı') return 'Başvuru askıda değil.';
  const back = a.resumeTo ?? 'Ön İncelemede';
  patchApp(appId, (x) => ({ ...move({ ...x, resumeTo: undefined }, back, ctx.actor, 'Askı kaldırıldı'), decisionReason: undefined }));
  log(ctx.actor, 'Askı kaldırıldı', a.number, `→ ${back}`);
  set({ ...state });
  return null;
}

/** Viewing documents is itself logged (who saw which applicant's files). */
export function logDocumentView(ctx: Ctx, appId: string, docName: string) {
  const a = getApp(appId);
  if (!a) return;
  if (!canSeeDocs(ctx, a)) {
    refuse(ctx, 'Belge görüntüleme', a.number, 'Belge görüntüleme yetkisi yok.');
    return;
  }
  log(ctx.actor, 'Belge görüntülendi', a.number, docName);
  set({ ...state });
}

// --- Agency account ----------------------------------------------------------------

const agencyGuard = (ctx: Ctx, agencyId: string, perm: PermissionKey, action: string) => {
  const ag = getAgency(agencyId);
  if (!ag) return { err: 'Ajans bulunamadı.' };
  const denied = guard(ctx, perm, agencyScope(ag), action, `${ag.name} (${ag.id})`);
  return denied ? { err: denied } : { ag };
};
const currentAgreement = (ag: AgencyAccount) => ag.agreements[ag.agreements.length - 1];
export const currentRule = (ag: AgencyAccount) => ag.rules[ag.rules.length - 1];
const refreshStatus = (ag: AgencyAccount): AgencyAccount =>
  ag.status === 'Askıda' ? ag : { ...ag, status: currentAgreement(ag)?.status === 'İmzalandı' && currentRule(ag) ? 'Aktif' : 'Kurulum' };

export function setStaff(ctx: Ctx, agencyId: string, userId: string, role: StaffRole | null): string | null {
  const { ag, err } = agencyGuard(ctx, agencyId, 'agencies.manage', 'Ajans yetkilisi düzenleme');
  if (err || !ag) return err ?? null;
  if (userId === ag.ownerId && role !== 'Sahip') return 'Sahibi kaldırmak için önce başka birini sahip yap.';
  const t = stamp(Date.now());
  patchAgency(agencyId, (x) => {
    if (role === 'Sahip') {
      // One owner: the previous owner stays as an agency manager.
      const users = x.users.map((u) => (u.role === 'Sahip' ? { ...u, role: 'Yönetici' as const } : u)).filter((u) => u.userId !== userId);
      return { ...x, ownerId: userId, users: [{ userId, role: 'Sahip', at: t, by: ctx.actor }, ...users] };
    }
    const users = x.users.filter((u) => u.userId !== userId);
    return { ...x, users: role ? [...users, { userId, role, at: t, by: ctx.actor }] : users };
  });
  log(ctx.actor, role ? `Ajans yetkilisi: ${role}` : 'Ajans yetkilisi kaldırıldı', `${ag.name} (${ag.id})`, personName(userId));
  set({ ...state });
  return null;
}

export function prepareAgreement(ctx: Ctx, agencyId: string, months: number): string | null {
  const { ag, err } = agencyGuard(ctx, agencyId, 'agencies.manage', 'Sözleşme hazırlama');
  if (err || !ag) return err ?? null;
  if (currentAgreement(ag)?.status === 'İmza bekliyor') return 'İmza bekleyen bir sözleşme zaten var.';
  const now = Date.now();
  const version = ag.agreements.length + 1;
  patchAgency(agencyId, (x) => ({ ...x, agreements: [...x.agreements, { version, status: 'İmza bekliyor', start: day(now), end: day(now + months * 30 * DAY), preparedBy: ctx.actor, preparedAt: stamp(now) }] }));
  log(ctx.actor, 'Sözleşme hazırlandı', `${ag.name} (${ag.id})`, `v${version} · ${months} ay`);
  set({ ...state });
  return null;
}

/** Only the agency owner signs (the admin panel's demo button signs on the owner's behalf). */
export function signAgreement(actor: string, agencyId: string): string | null {
  const ag = getAgency(agencyId);
  if (!ag) return 'Ajans bulunamadı.';
  if (actor !== ag.ownerId) return refuse(actor, 'Sözleşme imzası', `${ag.name} (${ag.id})`, 'Sözleşmeyi yalnız ajans sahibi imzalayabilir.');
  const cur = currentAgreement(ag);
  if (!cur || cur.status !== 'İmza bekliyor') return 'İmza bekleyen sözleşme yok.';
  patchAgency(agencyId, (x) => refreshStatus({ ...x, agreements: x.agreements.map((g) => (g.version === cur.version ? { ...g, status: 'İmzalandı', signedAt: stamp(Date.now()) } : g)) }));
  log(actor, 'Sözleşme imzalandı', `${ag.name} (${ag.id})`, `v${cur.version}`);
  set({ ...state });
  return null;
}

export function setCommissionRule(ctx: Ctx, agencyId: string, rate: number, basis: string, from: string, reason: string): string | null {
  const { ag, err } = agencyGuard(ctx, agencyId, 'agencies.commission', 'Komisyon kuralı');
  if (err || !ag) return err ?? null;
  if (!(rate > 0 && rate <= 0.6)) return 'Komisyon oranı %1 ile %60 arasında olmalı.';
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(from)) return 'Geçerlilik başlangıcını GG.AA.YYYY biçiminde yaz.';
  if (reason.trim().length < 3) return 'Kritik işlem: gerekçe yaz.';
  const prev = currentRule(ag);
  const version = (prev?.version ?? 0) + 1;
  patchAgency(agencyId, (x) =>
    refreshStatus({
      ...x,
      // Old versions are closed, never edited: earnings already booked keep the rule they were made with.
      rules: [...x.rules.map((r) => (r.version === prev?.version ? { ...r, to: from } : r)), { version, rate, basis, from, by: ctx.actor, at: stamp(Date.now()), reason: reason.trim() }],
    }),
  );
  log(ctx.actor, 'Komisyon kuralı tanımlandı', `${ag.name} (${ag.id})`, `v${version} · %${Math.round(rate * 100)} · ${basis} · ${from}'den itibaren · ${reason.trim()}`);
  set({ ...state });
  return null;
}

export function enableCoinsBank(ctx: Ctx, agencyId: string): string | null {
  const { ag, err } = agencyGuard(ctx, agencyId, 'agencies.coinsbank', 'Coins Bank etkinleştirme');
  if (err || !ag) return err ?? null;
  if (ag.coinsBank.enabled) return 'Coins Bank zaten etkin.';
  if (currentAgreement(ag)?.status !== 'İmzalandı') return 'Önce sözleşme imzalanmalı.';
  const rule = currentRule(ag);
  if (!rule) return 'Önce komisyon kuralı tanımlanmalı.';
  // Demo: link a few hosts so the module has numbers to show.
  const hosts = ag.hosts.length ? ag.hosts.map((h) => h.userId) : ['u4', 'u6', 'u8'];
  patchAgency(agencyId, (x) => ({
    ...x,
    coinsBank: { enabled: true, at: stamp(Date.now()), by: ctx.actor },
    hosts: x.hosts.length ? x.hosts : hosts.map((userId) => ({ userId, at: stamp(Date.now()) })),
    ledger: x.ledger.length ? x.ledger : ledgerFor(x.id, hosts, rule.rate, rule.version, false),
  }));
  log(ctx.actor, 'Coins Bank etkinleştirildi', `${ag.name} (${ag.id})`, 'Hak edişler görünür; para çekme ayrı yetkiyle açılır');
  set({ ...state });
  return null;
}

export function setPayoutAccount(actor: string, agencyId: string, holder: string, iban: string): string | null {
  const ag = getAgency(agencyId);
  if (!ag) return 'Ajans bulunamadı.';
  if (actor !== ag.ownerId) return refuse(actor, 'Ödeme hesabı', `${ag.name} (${ag.id})`, 'Ödeme hesabını yalnız ajans sahibi ekler.');
  const clean = iban.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^TR\d{24}$/.test(clean)) return 'Geçerli bir TR IBAN yaz (TR + 24 hane).';
  if (holder.trim().length < 3) return 'Hesap sahibinin adını yaz.';
  // Changing the account always resets verification and closes payouts until re-verified.
  patchAgency(agencyId, (x) => ({ ...x, payoutAccount: { holder: holder.trim(), iban: clean.replace(/(.{4})/g, '$1 ').trim(), status: 'Doğrulanmadı' }, payoutEnabled: false }));
  log(actor, 'Ödeme hesabı eklendi', `${ag.name} (${ag.id})`, 'Doğrulama bekliyor · ödeme yetkisi kapatıldı');
  set({ ...state });
  return null;
}

export function verifyPayoutAccount(ctx: Ctx, agencyId: string): string | null {
  const { ag, err } = agencyGuard(ctx, agencyId, 'agencies.payout', 'Finansal doğrulama');
  if (err || !ag) return err ?? null;
  if (!ag.payoutAccount) return 'Ajans sahibi henüz ödeme hesabı eklemedi.';
  if (ag.payoutAccount.status === 'Doğrulandı') return 'Hesap zaten doğrulandı.';
  patchAgency(agencyId, (x) => ({ ...x, payoutAccount: { ...x.payoutAccount!, status: 'Doğrulandı', verifiedBy: ctx.actor, verifiedAt: stamp(Date.now()) } }));
  log(ctx.actor, 'Finansal doğrulama tamamlandı', `${ag.name} (${ag.id})`, ag.payoutAccount.iban.slice(0, 4) + ' •••• ' + ag.payoutAccount.iban.slice(-4));
  set({ ...state });
  return null;
}

/** The checklist that must be complete before withdrawals can be switched on. */
export const payoutChecklist = (ag: AgencyAccount) => [
  { label: 'Ajans hesabı oluşturuldu', done: true },
  { label: 'Sözleşme imzalandı', done: currentAgreement(ag)?.status === 'İmzalandı' },
  { label: 'Komisyon kuralı tanımlandı', done: !!currentRule(ag) },
  { label: 'Coins Bank etkinleştirildi', done: ag.coinsBank.enabled },
  { label: 'Ödeme hesabı doğrulandı (finansal doğrulama)', done: ag.payoutAccount?.status === 'Doğrulandı' },
];

export function setPayoutEnabled(ctx: Ctx, agencyId: string, on: boolean, reason: string): string | null {
  const { ag, err } = agencyGuard(ctx, agencyId, 'agencies.payout', on ? 'Ödeme yetkisi açma' : 'Ödeme yetkisi kapatma');
  if (err || !ag) return err ?? null;
  if (reason.trim().length < 3) return 'Kritik işlem: gerekçe yaz.';
  if (on) {
    const missing = payoutChecklist(ag).filter((c) => !c.done);
    if (missing.length) return refuse(ctx, 'Ödeme yetkisi açma', `${ag.name} (${ag.id})`, `Eksik adımlar: ${missing.map((m) => m.label).join(', ')}`);
  }
  patchAgency(agencyId, (x) => ({ ...x, payoutEnabled: on }));
  log(ctx.actor, on ? 'Ödeme yetkisi açıldı' : 'Ödeme yetkisi kapatıldı', `${ag.name} (${ag.id})`, reason.trim());
  set({ ...state });
  return null;
}

export function bankNumbers(ag: AgencyAccount) {
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const total = sum(ag.ledger.map((r) => r.amount));
  const pending = sum(ag.ledger.filter((r) => r.status === 'Bekleyen').map((r) => r.amount));
  const settled = sum(ag.ledger.filter((r) => r.status !== 'Bekleyen').map((r) => r.amount));
  const inPayout = sum(ag.payouts.filter((p) => p.status === 'İncelemede').map((p) => p.amount));
  const paid = sum(ag.payouts.filter((p) => p.status === 'Ödendi').map((p) => p.amount));
  const rejected = sum(ag.payouts.filter((p) => p.status === 'Reddedildi').map((p) => p.amount));
  const withdrawable = Math.max(0, settled - inPayout - paid);
  return { total, pending, settled, inPayout, paid, rejected, withdrawable };
}

/** Demo stand-in for the nightly job that settles earnings after the refund window. */
export function settlePending(agencyId: string) {
  const ag = getAgency(agencyId);
  if (!ag) return;
  const n = ag.ledger.filter((r) => r.status === 'Bekleyen').length;
  if (!n) return;
  patchAgency(agencyId, (x) => ({ ...x, ledger: x.ledger.map((r) => (r.status === 'Bekleyen' ? { ...r, status: 'Kesinleşti' } : r)) }));
  log('system', 'Hak edişler kesinleşti', `${ag.name} (${ag.id})`, `${n} kayıt · ${RULES.pendingDays} günlük iade süresi doldu`);
  set({ ...state });
}

export function reverseLedgerRow(ctx: Ctx, agencyId: string, rowId: string, reason: string): string | null {
  const { ag, err } = agencyGuard(ctx, agencyId, 'agencies.payout', 'Hak ediş düzeltmesi');
  if (err || !ag) return err ?? null;
  const row = ag.ledger.find((r) => r.id === rowId);
  if (!row || row.status === 'Ters kayıt') return 'Düzeltilecek kayıt bulunamadı.';
  if (ag.ledger.some((r) => r.reverses === rowId)) return 'Bu kayıt zaten ters kayıtla düzeltilmiş.';
  if (reason.trim().length < 3) return 'Düzeltme gerekçesini yaz.';
  patchAgency(agencyId, (x) => ({
    ...x,
    ledger: [...x.ledger, { ...row, id: id('L'), ref: `${row.ref}-TR`, at: stamp(Date.now()), amount: -row.amount, status: 'Ters kayıt', reverses: row.id, note: reason.trim() }],
  }));
  log(ctx.actor, 'Ters kayıt', `${ag.name} (${ag.id})`, `${row.ref} · -${fmt(row.amount)} 💎 · ${reason.trim()}`);
  set({ ...state });
  return null;
}

/** Owner-only: an agency owner can only request money from (and see) their own agency's ledger. */
export function requestAgencyPayout(actor: string, agencyId: string, amount: number): string | null {
  const ag = getAgency(agencyId);
  if (!ag) return 'Ajans bulunamadı.';
  if (actor !== ag.ownerId) return refuse(actor, 'Ajans para çekme', `${ag.name} (${ag.id})`, 'Yalnız ajans sahibi kendi ajansı için talep oluşturabilir.');
  if (!ag.payoutEnabled) return 'Ödeme yetkin henüz açılmadı. Sözleşme ve finansal doğrulama tamamlanınca açılır.';
  if (!(amount >= RULES.minWithdrawDiamonds)) return `En az ${fmt(RULES.minWithdrawDiamonds)} 💎 çekebilirsin.`;
  if (amount > bankNumbers(ag).withdrawable) return 'Çekilebilir bakiyen yetersiz.';
  patchAgency(agencyId, (x) => ({ ...x, payouts: [{ id: id('P'), ref: id('APR'), at: stamp(Date.now()), amount, status: 'İncelemede', by: actor }, ...x.payouts] }));
  log(actor, 'Para çekme talebi', `${ag.name} (${ag.id})`, `${fmt(amount)} 💎 · tutar bloke edildi`);
  set({ ...state });
  return null;
}

export function decideAgencyPayout(ctx: Ctx, agencyId: string, payoutId: string, approve: boolean, reason: string): string | null {
  const { ag, err } = agencyGuard(ctx, agencyId, 'agencies.payout', 'Ödeme onayı');
  if (err || !ag) return err ?? null;
  const p = ag.payouts.find((x) => x.id === payoutId);
  if (!p || p.status !== 'İncelemede') return 'İncelemede bir talep bulunamadı.';
  // Separation of duties: whoever set the commission rule in force can't approve payouts on it.
  if (approve && currentRule(ag)?.by === ctx.actor) return refuse(ctx, 'Ödeme onayı', `${ag.name} (${ag.id})`, 'Görevler ayrılığı: geçerli komisyon kuralını tanımlayan kişi ödemeyi onaylayamaz. Başka bir yetkiliyle devam et.');
  if (!approve && reason.trim().length < 3) return 'Ret gerekçesini yaz.';
  patchAgency(agencyId, (x) => ({ ...x, payouts: x.payouts.map((y) => (y.id === payoutId ? { ...y, status: approve ? 'Ödendi' : 'Reddedildi', decidedBy: ctx.actor, decidedAt: stamp(Date.now()), reason: reason.trim() || undefined } : y)) }));
  log(ctx.actor, approve ? 'Ödeme onaylandı' : 'Ödeme reddedildi', `${ag.name} (${ag.id})`, `${p.ref} · ${fmt(p.amount)} 💎${approve ? '' : ` · blokaj çözüldü · ${reason.trim()}`}`);
  set({ ...state });
  return null;
}

/** BD performance view: agencies brought in by this BD. */
export const agenciesOfBd = (bdId: string) => state.agencies.filter((a) => a.bdId === bdId);
export const agencyById = (agencyId: string) => getAgency(agencyId);
export const agenciesOwnedBy = (actor: string) => state.agencies.filter((a) => a.ownerId === actor);

// --- Demo viewer ----------------------------------------------------------------------
// Which staff member (or agency owner) the panels act as. Every action still passes this id to the
// functions above, which check it against the RBAC model like a server would.
let viewer = 'me';
const viewerListeners = new Set<() => void>();
export const setViewer = (v: string) => {
  viewer = v;
  viewerListeners.forEach((l) => l());
};
const subscribeViewer = (l: () => void) => {
  viewerListeners.add(l);
  return () => {
    viewerListeners.delete(l);
  };
};
export const useViewer = () => useSyncExternalStore(subscribeViewer, () => viewer, () => viewer);
