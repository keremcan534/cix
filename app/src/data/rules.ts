// Earnings & bonus rules (spec "Merkezi kazanç ve bonus yönetim paneli").
// In the app these are fixed, read-only defaults. Editing them (versioned, effective only from their
// start time — past ledger rows keep the rule they were made with) is done on the separate
// Finance Control platform, not in the mobile app.

/**
 * Lucky gifts: share of the gift value the recipient earns (diamonds) and scores in PK. The owners' rule is 10 % (24 Nov
 * 2026; 20 % before); the server's panel sets it (server/api/lucky-rules.mjs sharePct), and live mode reads it with the
 * packages (luckyShare). This is the demo's and the first screen's value.
 */
export const LUCKY_RECIPIENT_SHARE = 0.1;
let luckyShareNow = LUCKY_RECIPIENT_SHARE;
/** The recipient's share now: the server's (GET /api/lucky `share`) once read, else LUCKY_RECIPIENT_SHARE. */
export const luckyShare = () => luckyShareNow;
/** Live mode: the server's share; anything not a fraction above 0 and at most 1 is ignored. */
export const setLuckyShare = (v: unknown) => {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1) luckyShareNow = v;
};

export type Rules = {
  version: number;
  diamondsPerUsd: number; // 1 USD = ? elmas (owners, 24 Nov 2026: 1.000; Canlı ayarlar › diamonds_per_usd)
  /** TL per USD used for TL values of diamonds (Coins Bank conversion); updated with the pack prices. */
  usdTry: number;
  /** What 1.000 coins are worth in TL (Canlı ayarlar › coin_value_tl; owners, 24 Nov 2026: 220 TL). */
  coinValueTl: number;
  /** Ödeme kuru: the TL a USD is paid at to hosts and agencies (Canlı ayarlar › payout_usd_try; 24 Nov 2026: 49). */
  payoutUsdTry: number;
  /** Coins per TL at the coin value (1.000 / coinValueTl): Çevir's and the Coins Bank's selling price. */
  coinsBankRetailCoinsPerTl: number;
  /** What the Coins Bank pays management for 1.000 coins (Canlı ayarlar › jeton_wholesale_tl; 24 Nov 2026: 220 TL). */
  coinsBankWholesaleTlPer1000: number;
  /** Coins Bank margin when it pays a host/agency their diamonds and turns them into coins (main account only). */
  coinsBankExchangeFee: number;
  /** Lucky gifts: share of the gift value written to the recipient as diamonds (the rest funds the rewards). */
  luckyHostShare: number;
  agencyCommission: number; // paid on top, never deducted from the streamer
  roomOwnerBonus: number; // on eligible gifts in the owner's room
  familyRates: number[]; // index 0 = LV1 … 14 = LV15
  oneOnOneBonus: number;
  voiceCallBonus: number;
  videoCallBonus: number;
  roomEventBonus: number;
  bonusCapPerWeek: number; // diamonds, per user
  minWithdrawDiamonds: number;
  exchangeMinDiamonds: number; // smallest diamond amount anyone may turn into coins (Gelir > Çevir)
  inviteUnitsPerPurchase: number;
  inviteIncomeShare: number; // share of an invited friend's income, paid by the platform
  inviteRechargeShare: number; // share of an invited friend's recharges, paid by the platform
  // Coins Bank (finance)
  creatorDiamondsPerCoin: number; // diamonds a creator earns per coin of a received gift
  bdCommission: number; // share of the agency's eligible base, paid by the platform
  maxWithdrawDiamonds: number; // per request
  weeklyWithdrawLimitDiamonds: number;
  autoApproveUnderDiamonds: number; // smaller payouts are auto-approved, larger ones need manual review
  /** Days the diamonds from a gift of store-bought coins (Google Play / App Store) stay locked: refund window. */
  pendingDays: number;
  /** Days the diamonds from a gift of coins bought at a Jeton Noktası (coins bank) stay locked. */
  jetonPendingDays: number;
  bonusCashable: number; // 0 = bonus credits can never be withdrawn
  // Host & agency lifecycle
  hostAgencyJoinDays: number; // unaffiliated host moves to the management account after N days
  agencyHostInactiveDays: number; // offline for N days → host leaves the agency (owners 24 Nov 2026: 60, fixed)
  agencyActivationHosts: number; // hosts needed to become an active agency
  agencyActivationEarners: number; // of which at least N must earn ≥ agencyActivationEarnUsd
  agencyActivationEarnUsd: number;
  agencyMonthlyNewHosts: number; // new hosts required each month
  agencyCommissionPenalty: number; // commission reduction (points) when the monthly target is missed
  agencyDemoteBelowHosts: number; // active agency falls back to candidate below this many hosts
  period: 'Haftalık';
};

export const DEFAULT_RULES: Rules = {
  version: 1,
  diamondsPerUsd: 1_000,
  usdTry: 50.62,
  coinValueTl: 220,
  payoutUsdTry: 49,
  coinsBankRetailCoinsPerTl: 1_000 / 220,
  coinsBankWholesaleTlPer1000: 220,
  coinsBankExchangeFee: 0.03,
  luckyHostShare: LUCKY_RECIPIENT_SHARE,
  agencyCommission: 0.4,
  // Oda sahibi bonusu: 0 (owners, 25 Nov 2026; the server pays none: Canlı ayarlar › Odalar › room_owner_bonus_pct).
  roomOwnerBonus: 0,
  familyRates: [0.01, 0.0125, 0.015, 0.0175, 0.02, 0.0225, 0.025, 0.0275, 0.03, 0.0325, 0.035, 0.0375, 0.04, 0.045, 0.05],
  oneOnOneBonus: 0.05,
  voiceCallBonus: 0.03,
  videoCallBonus: 0.05,
  roomEventBonus: 0.02,
  bonusCapPerWeek: 500_000,
  minWithdrawDiamonds: 10_000,
  exchangeMinDiamonds: 100,
  inviteUnitsPerPurchase: 1,
  inviteIncomeShare: 0.08,
  inviteRechargeShare: 0.04,
  creatorDiamondsPerCoin: 1,
  bdCommission: 0.05,
  maxWithdrawDiamonds: 1_000_000,
  weeklyWithdrawLimitDiamonds: 10_000_000,
  autoApproveUnderDiamonds: 250_000,
  pendingDays: 7,
  jetonPendingDays: 1,
  bonusCashable: 0,
  hostAgencyJoinDays: 3,
  agencyHostInactiveDays: 60,
  agencyActivationHosts: 20,
  agencyActivationEarners: 10,
  agencyActivationEarnUsd: 10,
  agencyMonthlyNewHosts: 5,
  agencyCommissionPenalty: 0.05,
  agencyDemoteBelowHosts: 15,
  period: 'Haftalık',
};

// Module-level copy so plain helpers (usd(), etc.) see the rules without hooks; the store exposes
// the same object as `rules`. Nothing in the app writes to it.
export const RULES: Rules = { ...DEFAULT_RULES, familyRates: [...DEFAULT_RULES.familyRates] };

export const pct = (r: number) => `%${(r * 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
// The possessive ending of a whole percent as it is read ("yüzde on" → "%10’u", "yüzde yirmi" → "%20’si").
const ONES = ['', 'i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u'];
const TENS = ['', 'u', 'si', 'u', 'ı', 'si', 'ı', 'i', 'i', 'ı'];
/** "%10’u", "%20’si", "%15’i": a percent with its possessive ending (whole percents; others "’i"). */
export const pctOf = (r: number) => {
  const n = Math.round(r * 100);
  const end = Math.abs(r * 100 - n) > 1e-9 ? 'i' : n === 100 ? 'ü' : n === 0 ? 'ı' : n % 10 ? ONES[n % 10] : TENS[(n / 10) % 10];
  return `${pct(r)}’${end}`;
};
export const usdValue = (diamonds: number) => diamonds / RULES.diamondsPerUsd;
/** Lucky gifts: diamonds the recipient earns (and PK points it scores) for one send: the share of the price, rounded down. */
export const luckyHostDiamonds = (price: number, share = luckyShare()) => Math.floor(price * share);
export const usd = (diamonds: number) => `$${usdValue(diamonds).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Streamer keeps 100% of earned diamonds; agency commission is a separate platform liability. */
export const settlement = (streamerDiamonds: number, agency: boolean) => {
  const commission = agency ? Math.round(streamerDiamonds * RULES.agencyCommission) : 0;
  return { streamer: streamerDiamonds, commission, platformTotal: streamerDiamonds + commission };
};

// --- Family levels LV1–LV15 --------------------------------------------------
export const FAMILY_XP = [0, 1_000, 3_000, 6_000, 10_000, 16_000, 24_000, 35_000, 50_000, 70_000, 95_000, 130_000, 175_000, 230_000, 300_000];
export const familyLevel = (xp: number) => {
  let lvl = 1;
  FAMILY_XP.forEach((t, i) => xp >= t && (lvl = i + 1));
  return lvl;
};
export const FAMILY_PERKS = [
  { from: 1, to: 3, text: 'Aile sohbeti, temel aile rozeti, aktif üye listesi' },
  { from: 4, to: 6, text: 'Gelişmiş aile profili, haftalık hedefler, ek aile görselleri' },
  { from: 7, to: 9, text: 'Özel aile temaları, gelişmiş istatistikler, etkinlik araçları' },
  { from: 10, to: 12, text: 'Daha yüksek üye kapasitesi, gelişmiş aile sıralaması, özel rozetler' },
  { from: 13, to: 15, text: 'Seçkin aile görselleri, gelişmiş raporlar, en yüksek bonus oranları' },
];
export const familyCapacity = (level: number) => 50 + (level - 1) * 25;
/** Weekly family bonus = eligible family earnings × level rate; distributed by contribution. */
export const familyBonus = (eligible: number, level: number) => Math.round(eligible * RULES.familyRates[level - 1]);

/** Agency lifecycle: candidate until activation targets are met; monthly target misses reduce commission. */
export const agencyStatus = (s: { hosts: number; earners: number; newThisMonth: number; wasActive?: boolean }) => {
  const activated = s.hosts >= RULES.agencyActivationHosts && s.earners >= RULES.agencyActivationEarners;
  const active = s.wasActive ? s.hosts >= RULES.agencyDemoteBelowHosts : activated;
  const missedMonthly = s.newThisMonth < RULES.agencyMonthlyNewHosts;
  const rate = Math.max(0, RULES.agencyCommission - (active && missedMonthly ? RULES.agencyCommissionPenalty : 0));
  return { status: active ? ('Aktif ajans' as const) : ('Aday ajans' as const), activated, missedMonthly, rate };
};
