// Example data for the agency network panels, shown only when the server cannot be reached and always under the
// "Örnek veri — sunucu bağlantısı yok" label (lib/agency-net useNet). Amounts follow the server's formulas:
// sub = base × sub rate, parent = base × (parent rate − sub rate), pool ≤ 40%, 5000 diamonds = 1 USD.
// Nothing here is used for a calculation; the real numbers always come from the server.
import { IS_DEMO } from '@/lib/build';
import type {
  AdminAgency,
  AdminOverview,
  AdminPayout,
  AdminScore,
  AdminSettings,
  AuditRow,
  JoinRequest,
  LedgerRow,
  LedgerTotals,
  Me,
  Overview,
  Payouts,
  Performance,
  PerfRun,
  Report,
  StaffMember,
  StaffRole,
  Streamer,
  SubAgency,
  Tier,
  Transfer,
  TreeNode,
} from '@/lib/agency-net';

const DAY = 864e5;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();
const nextMonth = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1)).toISOString();
};
const period = (monthsBack = 0) => {
  const n = new Date();
  const d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - monthsBack, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const DEMO_TIERS: Tier[] = [
  { key: 'start', name: 'Başlangıç', min_score: 0, sub_rate: 0.25, min_active: 0, overtake: false },
  { key: 'growing', name: 'Gelişen', min_score: 40, sub_rate: 0.3, min_active: 3, overtake: false },
  { key: 'successful', name: 'Başarılı', min_score: 60, sub_rate: 0.35, min_active: 5, overtake: false },
  { key: 'overtook', name: 'Üst ajansı geçmiş', min_score: 60, sub_rate: 0.38, min_active: 5, overtake: true },
  { key: 'elite', name: 'Çok yüksek performans', min_score: 80, sub_rate: 0.39, min_active: 10, overtake: true },
];
const tierName = (k: string | null) => DEMO_TIERS.find((t) => t.key === k)?.name ?? null;
const POOL = 0.4;

type DemoAgency = { id: string; code: string; name: string; parentId: string | null; tier: string | null; status: SubAgency['status']; owner: string; region: string; score: number | null; overtakes: boolean; streamers: number; active: number; volume30: number };
const AG: DemoAgency[] = [
  { id: 'demo-top', code: 'MVD4K2', name: 'Mavi Dalga Ajans', parentId: null, tier: null, status: 'approved', owner: 'Sen', region: 'İstanbul', score: 66.4, overtakes: false, streamers: 14, active: 11, volume30: 1_840_000 },
  { id: 'demo-s1', code: 'KZY7P1', name: 'Kuzey Yıldızı', parentId: 'demo-top', tier: 'growing', status: 'approved', owner: 'Ece Yalın', region: 'Ankara', score: 58.2, overtakes: false, streamers: 9, active: 7, volume30: 960_000 },
  { id: 'demo-s2', code: 'EGR3M8', name: 'Ege Rüzgârı', parentId: 'demo-top', tier: 'start', status: 'approved', owner: 'Mert Kaya', region: 'İzmir', score: 36.5, overtakes: false, streamers: 4, active: 2, volume30: 210_000 },
  { id: 'demo-s3', code: 'GCI9T5', name: 'Gece Işığı', parentId: 'demo-top', tier: 'overtook', status: 'approved', owner: 'Selin Ay', region: 'Bursa', score: 71.8, overtakes: true, streamers: 12, active: 10, volume30: 1_420_000 },
  { id: 'demo-s4', code: 'LMN2B6', name: 'Liman Sesleri', parentId: 'demo-top', tier: 'start', status: 'pending', owner: 'Baran Tunç', region: 'Antalya', score: null, overtakes: false, streamers: 0, active: 0, volume30: 0 },
  { id: 'demo-t2', code: 'ALK5R3', name: 'Altın Kıyı Medya', parentId: null, tier: null, status: 'approved', owner: 'Nehir Sarı', region: 'Antalya', score: 61.0, overtakes: false, streamers: 18, active: 13, volume30: 2_260_000 },
  { id: 'demo-s5', code: 'PRL8D4', name: 'Poyraz Stüdyo', parentId: 'demo-t2', tier: 'successful', status: 'approved', owner: 'Kaan Er', region: 'Muğla', score: 63.3, overtakes: true, streamers: 8, active: 6, volume30: 780_000 },
  { id: 'demo-t3', code: 'SFK1N7', name: 'Şafak Yapım', parentId: null, tier: null, status: 'suspended', owner: 'Deniz Aksu', region: 'Adana', score: 22.0, overtakes: false, streamers: 3, active: 0, volume30: 40_000 },
];
const byId = (id: string) => AG.find((a) => a.id === id) ?? AG[0];
const rateOf = (a: DemoAgency) => (a.parentId ? (DEMO_TIERS.find((t) => t.key === a.tier)?.sub_rate ?? 0.25) : POOL);
const shareOf = (a: DemoAgency) => (a.parentId ? POOL - rateOf(a) : 0);
const children = (id: string) => AG.filter((a) => a.parentId === id);
const card = (a: DemoAgency) => ({
  id: a.id,
  code: a.code,
  name: a.name,
  level: a.parentId ? 2 : 1,
  status: a.status,
  parentId: a.parentId,
  tier: a.tier,
  tierName: tierName(a.tier),
  country: 'Türkiye',
  region: a.region,
  createdAt: ago(a.parentId ? 120 : 400),
  approvedAt: a.status === 'pending' ? null : ago(a.parentId ? 110 : 390),
});
const OWNER_PERMS = ['streamers.view', 'streamers.invite', 'streamers.approve', 'subagencies.view', 'subagencies.manage', 'subagencies.earnings', 'reports.performance', 'reports.commission', 'reports.export', 'payouts.request', 'transfers.manage', 'staff.manage'];
export const DEMO_PLATFORM = IS_DEMO ? ['agencies.view', 'agencies.approve', 'agencies.status', 'agencies.rates', 'agencies.settings', 'agencies.performance', 'agencies.payouts.approve', 'agencies.payouts.pay', 'agencies.transfers', 'agencies.audit'] : [];

export const demoMe = (): Me => ({
  membership: null,
  requests: [{ id: 901, kind: 'invite', method: 'invite', agency: { id: 'demo-t2', name: 'Altın Kıyı Medya', code: 'ALK5R3' }, note: 'Ekibimize katılmanı isteriz.', createdAt: ago(1) }],
  transfer: null,
  agencies: [{ ...card(AG[0]), viewer: 'owner', perms: OWNER_PERMS }],
  platform: DEMO_PLATFORM,
});

export function demoOverview(id: string): Overview {
  const a = byId(id);
  const sub = !!a.parentId;
  const rate = rateOf(a);
  const month = Math.round(a.volume30 * rate + children(a.id).reduce((x, c) => x + c.volume30 * shareOf(c), 0));
  const next = sub ? DEMO_TIERS[DEMO_TIERS.findIndex((t) => t.key === a.tier) + 1] : undefined;
  return {
    agency: card(a),
    owner: { id: `u-${a.id}`, name: a.owner },
    viewer: a.id === 'demo-top' ? 'owner' : 'parent',
    perms: a.id === 'demo-top' ? OWNER_PERMS : ['streamers.view', 'subagencies.view', 'reports.performance', 'reports.commission'],
    counts: { streamers: a.streamers, active: a.active, subs: children(a.id).filter((c) => c.status === 'approved').length, active_subs: children(a.id).filter((c) => c.status === 'approved').length, pending_subs: children(a.id).filter((c) => c.status === 'pending').length, sub_streamers: children(a.id).reduce((x, c) => x + c.streamers, 0), pending_requests: 2, pending_transfers: 1 },
    rate: { rate, parentShare: shareOf(a), total: POOL, poolCap: POOL, upcoming: a.id === 'demo-s1' ? { effectiveFrom: nextMonth(), rate: 0.35, tier: 'successful', source: 'engine', reason: 'Performans değerlendirmesi: puan 61, iki dönem üst üste' } : null },
    earnings: {
      today: Math.round(month / 30),
      week: Math.round(month / 4.2),
      month,
      prev_month: Math.round(month * 0.88),
      direct30: Math.round(a.volume30 * rate),
      difference30: month - Math.round(a.volume30 * rate),
      transition30: 0,
      balances: { earned: month * 3, paid: month * 2, in_payout: 0, available: Math.round(month * 0.9), calculating: Math.round(month * 0.1), direct: Math.round(a.volume30 * rate), difference: month - Math.round(a.volume30 * rate), transition: 0, pending: 0 },
      usd: { month: month / 5000, available: (month * 0.9) / 5000 },
    },
    performance:
      a.score === null
        ? null
        : {
            runId: 12,
            asOf: ago(1),
            score: a.score,
            rank: 3,
            parentScore: sub ? (byId(a.parentId!).score ?? null) : null,
            overtakes: a.overtakes,
            change: a.id === 'demo-s1' ? 'waiting' : 'same',
            streak: 1,
            flags: a.id === 'demo-top' ? ['overtaken'] : [],
            metrics: { volume: a.volume30 * 3, active: a.active, average: Math.round(a.volume30 / Math.max(1, a.active)), growth: 0.12, retention: 0.86, acquisition: 3, operations: 80, reliability: 92 },
            normalized: { volume: 72, active: 64, average: 58, growth: 61, retention: 86, acquisition: 50, operations: 80, reliability: 92 },
            qualifiedTier: a.tier,
            next: next ? { key: next.key, name: next.name, subRate: next.sub_rate, needScore: Math.max(0, next.min_score - a.score), needActive: Math.max(0, next.min_active - a.active), needOvertake: next.overtake && !a.overtakes, periodsInRow: 2 } : null,
          },
    parent: sub ? { id: a.parentId!, name: byId(a.parentId!).name, score: byId(a.parentId!).score } : null,
    request: null,
    notices:
      a.id === 'demo-top'
        ? [
            { id: 3, kind: 'overtake', title: 'Gece Işığı bu dönem puanınızı geçti', body: 'Alt ajansınızın puanı 71,8; sizin puanınız 66,4. Kalıcı olursa alt ajans oranı gelecek dönem %38 olur, fark komisyonunuz %2 kalır. Mevcut ve geçmiş kazançlarınız değişmez.', createdAt: ago(1) },
            { id: 2, kind: 'tier', title: 'Kuzey Yıldızı yükselmeye yakın', body: 'Bir dönem daha 60 puanın üzerinde kalırsa gelecek dönem Başarılı seviyesine geçer.', createdAt: ago(2) },
          ]
        : [],
    tiers: DEMO_TIERS,
    poolCap: POOL,
  };
}

const NAMES = ['Deniz Aksu', 'Ece Yalın', 'Mert Kaya', 'Selin Ay', 'Baran Tunç', 'Nehir Sarı', 'Kaan Er', 'İpek Gül', 'Arda Coşkun', 'Defne Ulu'];
export function demoStreamers(id: string, scope: 'direct' | 'sub'): Streamer[] {
  const owners = scope === 'sub' ? children(id).filter((c) => c.status === 'approved') : [byId(id)];
  return owners.flatMap((o, j) =>
    NAMES.slice(j * 3, j * 3 + (scope === 'sub' ? 3 : 7)).map((name, i) => {
      const d = Math.round((o.volume30 / Math.max(1, o.streamers)) * (1.6 - i * 0.18));
      return {
        id: `st-${o.id}-${i}`,
        name,
        username: name.toLowerCase().split(' ')[0],
        avatarUrl: null,
        agencyId: o.id,
        joinedAt: ago(20 + i * 17),
        method: (['code', 'invite', 'link', 'application'] as const)[i % 4],
        contract: null,
        verified: i % 3 !== 2,
        diamonds30: Math.max(0, d),
        usd30: Math.max(0, d) / 5000,
        week: Math.round(Math.max(0, d) * 0.26),
        month: Math.round(Math.max(0, d) * 0.82),
        onlineHours30: 30 + ((i * 13) % 60),
        active: i < 5,
        agencyName: o.name,
      };
    }),
  );
}

export function demoSubs(id: string): { subagencies: SubAgency[]; nearPromotion: string[] } {
  const list = children(id);
  return {
    subagencies: list.map((a, i) => {
      const nx = DEMO_TIERS[DEMO_TIERS.findIndex((t) => t.key === a.tier) + 1];
      return {
        ...card(a),
        owner: a.owner,
        pendingWith: a.status === 'pending' ? 'center' : null,
        streamers: a.streamers,
        active: a.active,
        volume30: a.volume30,
        earned30: Math.round(a.volume30 * rateOf(a)),
        mine30: Math.round(a.volume30 * shareOf(a)),
        gifts: { day: Math.round(a.volume30 / 30), week: Math.round(a.volume30 * 0.26), month: Math.round(a.volume30 * 0.82) },
        mine: { day: Math.round((a.volume30 / 30) * shareOf(a)), week: Math.round(a.volume30 * 0.26 * shareOf(a)), month: Math.round(a.volume30 * 0.82 * shareOf(a)) },
        rate: rateOf(a),
        parentShare: shareOf(a),
        upcoming: a.id === 'demo-s1' ? { effectiveFrom: nextMonth(), rate: 0.35, tier: 'successful', source: 'engine', reason: 'Performans değerlendirmesi' } : null,
        payoutStatus: a.status === 'approved' ? 'Ödendi' : null,
        score: a.score,
        overallRank: a.score === null ? null : i + 2,
        overtakes: a.overtakes,
        next: nx && a.score !== null ? { key: nx.key, name: nx.name, subRate: nx.sub_rate, needScore: Math.max(0, nx.min_score - a.score), needActive: Math.max(0, nx.min_active - a.active), needOvertake: nx.overtake && !a.overtakes, periodsInRow: 2 } : null,
        rank: a.score === null ? null : [...list].filter((x) => x.score !== null).sort((x, y) => (y.score ?? 0) - (x.score ?? 0)).findIndex((x) => x.id === a.id) + 1,
      };
    }),
    nearPromotion: ['demo-s1'],
  };
}

export function demoCommissions(id: string): { rows: LedgerRow[]; totals: LedgerTotals } {
  const a = byId(id);
  const rows: LedgerRow[] = [];
  let n = 5000;
  for (let i = 0; i < 14; i++) {
    const src = i % 3 === 0 && children(id).length ? children(id).filter((c) => c.status === 'approved')[i % 3] ?? a : a;
    const base = [12500, 50000, 8000, 250000, 32000, 5000, 120000][i % 7];
    const own = src.id === a.id;
    const subRate = own ? (a.parentId ? rateOf(a) : null) : rateOf(src);
    const amount = own ? base * rateOf(a) : base * shareOf(src);
    rows.push({
      id: n--,
      kind: own ? 'direct' : 'difference',
      amount,
      rate: own ? rateOf(a) : shareOf(src),
      period: period(i > 9 ? 1 : 0),
      status: i < 3 ? 'calculating' : i > 9 ? 'paid' : 'earned',
      statusLabel: i < 3 ? 'Hesaplanıyor' : i > 9 ? 'Ödendi' : 'Kazanıldı',
      createdAt: ago(i * 2.3),
      note: null,
      txn: `gift:${(9_000_000 + i * 7919).toString(36)}`,
      streamer: { id: `st-${src.id}-${i % 5}`, name: NAMES[(i + (own ? 0 : 3)) % NAMES.length] },
      sourceAgency: { id: src.id, name: src.name },
      base,
      incomeType: i % 5 === 4 ? 'lucky_gift' : 'gift',
      totalRate: POOL,
      subRate: own ? subRate : rateOf(src),
      parentRate: POOL,
      subAmount: own ? null : base * rateOf(src),
      parentAmount: own ? null : base * shareOf(src),
      transitionAmount: 0,
      poolCap: POOL,
      ruleVersion: 'v1',
      occurredAt: ago(i * 2.3),
      calculatedAt: ago(i * 2.3),
    });
  }
  const sum = (k: string) => rows.filter((r) => r.kind === k).reduce((x, r) => x + r.amount, 0);
  return { rows, totals: { direct: sum('direct'), difference: sum('difference'), transition: 0, fees: 0, adjustments: 0 } };
}

export function demoPerformance(id: string): Performance {
  const o = demoOverview(id);
  const a = byId(id);
  const subs = demoSubs(id).subagencies.filter((s) => s.score !== null);
  return {
    latest: o.performance,
    history: [5, 4, 3, 2, 1, 0].map((k, i) => ({
      runId: 7 + i,
      asOf: ago(k * 30 + 1),
      score: Math.max(10, (a.score ?? 40) - k * 3.1 + (i % 2) * 1.4),
      rank: 3 + (k % 3),
      tier: a.tier,
      tierName: tierName(a.tier),
      change: k === 0 && id === 'demo-s1' ? 'waiting' : 'same',
      overtakes: a.overtakes && k < 2,
      volume: Math.round(a.volume30 * (0.7 + i * 0.06)),
      orgVolume: Math.round((a.volume30 + children(id).reduce((x, c) => x + c.volume30, 0)) * (0.7 + i * 0.06)),
      active: Math.max(0, a.active - (k > 2 ? 2 : 0)),
    })),
    tierHistory: a.parentId
      ? [{ from: 'start', fromName: 'Başlangıç', to: a.tier ?? 'start', toName: tierName(a.tier), fromRate: 0.25, toRate: rateOf(a), effectiveFrom: ago(60), source: 'engine', reason: 'Performans değerlendirmesi #9', at: ago(62) }]
      : [],
    rateHistory: [{ rate: rateOf(a), parentFloor: a.parentId ? 0.01 : null, tier: a.tier, source: a.parentId ? 'engine' : 'default', effectiveFrom: ago(60), reason: a.parentId ? 'Performans değerlendirmesi #9' : 'Üst ajans standart oranı' }],
    subagencies: subs.map((s) => ({ id: s.id, name: s.name, score: s.score ?? 0, overallRank: s.overallRank, rank: s.rank ?? 0, overtakes: s.overtakes, tier: s.tier, tierName: s.tierName, change: s.id === 'demo-s1' ? 'waiting' : 'same', active: s.active, volume: s.volume30 })),
    weights: { volume: 20, active: 15, average: 10, growth: 15, retention: 15, acquisition: 10, operations: 5, reliability: 10 },
    tiers: DEMO_TIERS,
  };
}

export function demoReport(id: string): Report {
  const a = byId(id);
  const weeks = [7, 6, 5, 4, 3, 2, 1, 0];
  return {
    volume: weeks.map((w, i) => ({ bucket: ago(w * 7).slice(0, 10), direct: Math.round((a.volume30 / 4.3) * (0.75 + i * 0.05)), org: Math.round(((a.volume30 + children(id).reduce((x, c) => x + c.volume30, 0)) / 4.3) * (0.72 + i * 0.05)) })),
    joins: weeks.map((w, i) => ({ bucket: ago(w * 7).slice(0, 10), count: (i * 7) % 4 })),
    earnings: weeks.map((w, i) => {
      const direct = Math.round(((a.volume30 * rateOf(a)) / 4.3) * (0.75 + i * 0.05));
      const difference = Math.round((children(id).reduce((x, c) => x + c.volume30 * shareOf(c), 0) / 4.3) * (0.7 + i * 0.05));
      return { bucket: ago(w * 7).slice(0, 10), direct, difference, transition: 0, total: direct + difference };
    }),
  };
}

export const demoRequests = (): JoinRequest[] => [
  { id: 71, kind: 'join', method: 'code', status: 'pending', user: { id: 'u-71', name: 'İpek Gül', username: 'ipekgul' }, note: 'Akşamları yayın yapıyorum.', createdAt: ago(0.4), decidedAt: null },
  { id: 70, kind: 'join', method: 'link', status: 'pending', user: { id: 'u-70', name: 'Arda Coşkun', username: 'ardac' }, note: null, createdAt: ago(1.2), decidedAt: null },
  { id: 66, kind: 'invite', method: 'invite', status: 'approved', user: { id: 'u-66', name: 'Defne Ulu', username: 'defne' }, note: null, createdAt: ago(9), decidedAt: ago(8) },
];

export const DEMO_ROLES: StaffRole[] = [
  { id: 1, name: 'Yönetici', permissions: OWNER_PERMS.filter((p) => p !== 'staff.manage') },
  { id: 2, name: 'Yayıncı sorumlusu', permissions: ['streamers.view', 'streamers.invite', 'streamers.approve'] },
  { id: 3, name: 'Raporlama', permissions: ['streamers.view', 'subagencies.view', 'reports.performance', 'reports.commission', 'reports.export'] },
];
export const demoStaff = (): { staff: StaffMember[]; roles: StaffRole[]; catalog: Record<string, string> } => ({
  staff: [
    { user: { id: 'u-s1', name: 'Kaan Er' }, roleId: 2, role: 'Yayıncı sorumlusu', extra: [], denied: [], perms: DEMO_ROLES[1].permissions, since: ago(80) },
    { user: { id: 'u-s2', name: 'İpek Gül' }, roleId: 3, role: 'Raporlama', extra: [], denied: ['reports.export'], perms: DEMO_ROLES[2].permissions.filter((p) => p !== 'reports.export'), since: ago(30) },
  ],
  roles: DEMO_ROLES,
  catalog: {},
});

export const demoPayouts = (id: string): Payouts => {
  const b = demoOverview(id).earnings!.balances;
  return {
    balances: b,
    policy: { min_diamonds: 50000, currencies: ['USD', 'TRY'], two_person: true },
    payouts: [
      { id: 31, amount: 412_000, usd: 82.4, currency: 'USD', status: 'paid', statusLabel: 'Ödendi', requestedAt: ago(34), approvedAt: ago(33), paidAt: ago(32), paymentRef: 'TRX-82140', note: null },
      { id: 27, amount: 365_500, usd: 73.1, currency: 'USD', status: 'paid', statusLabel: 'Ödendi', requestedAt: ago(64), approvedAt: ago(63), paidAt: ago(62), paymentRef: 'TRX-79021', note: null },
    ],
  };
};

export const demoTransfers = (): Transfer[] => [
  {
    id: 44,
    kind: 'streamer_move',
    status: 'pending',
    streamer: { id: 'st-x', name: 'Nehir Sarı' },
    agency: null,
    from: { id: 'demo-t2', name: 'Altın Kıyı Medya' },
    to: { id: 'demo-top', name: 'Mavi Dalga Ajans' },
    needs: ['from', 'to'],
    approvals: { to: { by: 'u-me', at: ago(0.5) } },
    mode: null,
    fee: 0,
    feeRule: { base: 18_400, rate: 0.1, threshold: 50_000, fee: 0, payer: 'to_agency', account: 'platform', rule: 'Son 30 gün matrah × %10; 50.000 elmasın altı ücretsiz' },
    transition: null,
    reason: 'Yayın saatlerim bu ajansla uyumlu.',
    createdAt: ago(1),
    decidedAt: null,
    decisionNote: null,
    myParty: ['to'],
  },
];

// --- Centre ------------------------------------------------------------------------------------------------
export const demoTree = (): { nodes: TreeNode[]; poolCap: number; topRate: number } => ({
  nodes: AG.map((a) => ({
    id: a.id,
    parentId: a.parentId,
    name: a.name,
    code: a.code,
    level: a.parentId ? 2 : 1,
    status: a.status,
    owner: a.owner,
    tier: a.tier,
    tierName: tierName(a.tier),
    streamers: a.streamers,
    volume30: a.volume30,
    orgVolume30: a.volume30 + children(a.id).reduce((x, c) => x + c.volume30, 0),
    earned30: Math.round(a.volume30 * rateOf(a) + children(a.id).reduce((x, c) => x + c.volume30 * shareOf(c), 0)),
    rate: rateOf(a),
    parentShare: shareOf(a),
    upcoming: a.id === 'demo-s1' ? { effectiveFrom: nextMonth(), rate: 0.35, tier: 'successful', source: 'engine', reason: 'Performans değerlendirmesi' } : null,
    score: a.score,
    rank: a.score === null ? null : [...AG].filter((x) => x.score !== null).sort((x, y) => (y.score ?? 0) - (x.score ?? 0)).findIndex((x) => x.id === a.id) + 1,
    overtakes: a.overtakes,
    flags: a.id === 'demo-t3' ? ['review', 'low_active'] : a.id === 'demo-top' ? ['overtaken'] : [],
    bd: a.parentId ? null : 'Ozan Demir',
  })),
  poolCap: POOL,
  topRate: POOL,
});

export const demoAdminOverview = (): AdminOverview => {
  const base30 = AG.reduce((x, a) => x + a.volume30, 0);
  const commission30 = Math.round(base30 * POOL);
  return { tops: 3, subs: 5, suspended: 1, pending: 1, streamers: AG.reduce((x, a) => x + a.streamers, 0), base30, commission30, bd30: Math.round(base30 * 0.05 * 0.3), payouts_open: 287_000, payouts_open_count: 2, transfers_waiting: 2, appeals_open: 1, calc_pending: 0, usd: { base30: base30 / 5000, commission30: commission30 / 5000 }, poolCap: POOL };
};

export const demoAdminList = (): AdminAgency[] => [
  { id: 'demo-s4', code: 'LMN2B6', name: 'Liman Sesleri', level: 2, status: 'pending', pendingWith: 'center', parent: { id: 'demo-top', name: 'Mavi Dalga Ajans' }, owner: { id: 'u-demo-s4', name: 'Baran Tunç' }, country: 'Türkiye', region: 'Antalya', contact: { name: 'Baran Tunç', phone: '+90 532 000 00 00', email: null }, expectedStreamers: 8, description: 'Antalya merkezli müzik yayıncıları.', tier: 'start', tierName: 'Başlangıç', createdAt: ago(2) },
  { id: 'demo-new', code: 'YLZ6C2', name: 'Yıldız Tozu Ajans', level: 1, status: 'pending', pendingWith: 'center', parent: null, owner: { id: 'u-new', name: 'Ceren Taş' }, country: 'Türkiye', region: 'Eskişehir', contact: { name: 'Ceren Taş', phone: '+90 533 000 00 00', email: 'ceren@example.com' }, expectedStreamers: 20, description: 'Sohbet ve oyun odaları.', tier: null, tierName: null, createdAt: ago(1) },
];

export const demoAdminSettings = (): AdminSettings => {
  const values = {
    pool_cap: 0.4,
    top_rate: 0.4,
    max_levels: 2,
    subagency_policy: { enabled: true, approval: 'center', min_active_streamers: 0 },
    join_policy: { requires_approval: true },
    income_types: { gift: true, lucky_gift: true, campaign: false, bonus: false, task_reward: false, refund: true, other: false },
    commission_period: 'month',
    period_close_days: 7,
    payout_policy: { min_diamonds: 50000, currencies: ['USD', 'TRY'], two_person: true },
    transfer_policy: { decision_days: 7, require_center: false, free_below_diamonds: 50000, fee_rate: 0.1, fee_payer: 'to_agency', fee_account: 'platform', agency_fee_rate: 0.1, owner_choice: true },
    performance: { window_months: 3, cadence: 'month', promotion_min_periods: 2, demotion_min_periods: 2, max_step: 1, min_active_streamers: 3, active_days: 30, require_verified: false, decline_drop: 15, effective: 'next_period' },
    weights: { volume: 20, active: 15, average: 10, growth: 15, retention: 15, acquisition: 10, operations: 5, reliability: 10 },
    tiers: DEMO_TIERS,
    parent_min_rate: 0.01,
    parent_zero: { enabled: false, tier: 'elite' },
    parent_sees_sub_earnings: true,
    bd_policy: { rate: 0.05, basis: 'base_plus_pool' },
    suspension_policy: { reliability_below: 40, inactive_days: 90 },
  };
  return {
    values,
    defaults: values,
    criteria: ['volume', 'active', 'average', 'growth', 'retention', 'acquisition', 'operations', 'reliability'],
    incomeTypes: ['gift', 'lucky_gift', 'campaign', 'bonus', 'task_reward', 'refund', 'other'],
    history: [
      { id: 4, key: 'performance', value: values.performance, reason: 'Yükselme için iki dönem şartı', created_at: ago(40), set_by: 'Merkez' },
      { id: 3, key: 'tiers', value: values.tiers, reason: 'Seviye tablosu ilk kurulum', created_at: ago(90), set_by: 'Merkez' },
    ],
  };
};

export const demoAdminPerf = (): { runs: PerfRun[]; runId: number | null; scores: AdminScore[] } => ({
  runs: [
    { id: 12, asOf: ago(1), windowFrom: ago(91), effectiveFrom: nextMonth(), dryRun: false, cadenceKey: period(0), runBy: 'Merkez', note: 'Aylık değerlendirme' },
    { id: 11, asOf: ago(3), windowFrom: ago(93), effectiveFrom: nextMonth(), dryRun: true, cadenceKey: period(0), runBy: 'Merkez', note: 'Deneme' },
  ],
  runId: 12,
  scores: AG.filter((a) => a.score !== null).map((a, i) => ({
    agencyId: a.id,
    name: a.name,
    level: a.parentId ? 2 : 1,
    parent: a.parentId ? { id: a.parentId, name: byId(a.parentId).name } : null,
    score: a.score ?? 0,
    rank: i + 1,
    parentScore: a.parentId ? byId(a.parentId).score : null,
    overtakes: a.overtakes,
    qualified: a.tier,
    current: a.tier,
    assigned: a.tier,
    assignedName: tierName(a.tier),
    change: a.id === 'demo-s1' ? 'waiting' : 'same',
    streak: 1,
    flags: a.id === 'demo-t3' ? ['review'] : [],
    metrics: { volume: a.volume30 * 3, active: a.active },
    normalized: {},
  })),
});

export const demoAdminPayouts = (): AdminPayout[] => [
  { id: 52, agency: { id: 'demo-t2', name: 'Altın Kıyı Medya', code: 'ALK5R3', status: 'approved' }, amount: 210_000, usd: 42, currency: 'USD', status: 'pending', statusLabel: 'Onay bekliyor', requestedBy: 'Nehir Sarı', requestedAt: ago(0.6), approvedBy: null, approvedAt: null, paidAt: null, paymentRef: null, note: null },
  { id: 51, agency: { id: 'demo-s5', name: 'Poyraz Stüdyo', code: 'PRL8D4', status: 'approved' }, amount: 77_000, usd: 15.4, currency: 'TRY', status: 'ready', statusLabel: 'Ödemeye hazır', requestedBy: 'Kaan Er', requestedAt: ago(2), approvedBy: 'Merkez 1', approvedAt: ago(1), paidAt: null, paymentRef: null, note: null },
];

export const demoAdminTransfers = (): Transfer[] => [
  {
    id: 45,
    kind: 'independence',
    status: 'pending',
    streamer: null,
    agency: { id: 'demo-s3', name: 'Gece Işığı' },
    from: { id: 'demo-top', name: 'Mavi Dalga Ajans' },
    to: null,
    needs: ['center'],
    approvals: {},
    mode: null,
    fee: 0,
    feeRule: null,
    transition: null,
    reason: 'Üç dönemdir üst ajans puanının üzerindeyiz; bağımsız ilerlemek istiyoruz.',
    createdAt: ago(1),
    decidedAt: null,
    decisionNote: null,
  },
  ...demoTransfers().map((t) => ({ ...t, myParty: undefined })),
];

export const demoAudit = (): AuditRow[] => [
  { id: 991, actor: { id: 'u-admin', name: 'Merkez' }, action: 'performance.run', targetType: 'run', targetId: '12', before: null, after: { agencies: 7, changes: 0 }, result: 'ok', reason: 'Aylık değerlendirme', at: ago(1) },
  { id: 990, actor: { id: 'u-admin', name: 'Merkez' }, action: 'agency.status', targetType: 'agency', targetId: 'demo-t3', before: { status: 'approved' }, after: { status: 'suspended' }, result: 'ok', reason: '90 gündür aktif yayıncı yok', at: ago(6) },
  { id: 989, actor: { id: 'u-demo-top', name: 'Mavi Dalga Ajans' }, action: 'agency.rate', targetType: 'agency', targetId: 'demo-s1', before: null, after: null, result: 'denied', reason: 'Üst ajans alt ajans oranını değiştiremez', at: ago(8) },
];
