// Earnings & bonus rules (spec "Merkezi kazanç ve bonus yönetim paneli").
// In the app these are fixed, read-only defaults. Editing them (versioned, effective only from their
// start time — past ledger rows keep the rule they were made with) is done on the separate
// Finance Control platform, not in the mobile app.

export type Rules = {
  version: number;
  diamondsPerUsd: number; // 5.000 elmas = 1 USD
  /** TL per USD used for TL values of diamonds (Coins Bank conversion); updated with the pack prices. */
  usdTry: number;
  /** Coins Bank's selling price, coins per TL (the 1.000.000-coin pack: 23.599,99 TL). */
  coinsBankRetailCoinsPerTl: number;
  /** Coins Bank margin when it buys coins from management (wholesale). */
  coinsBankWholesaleFee: number;
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
  inviteUnitsPerPurchase: number;
  inviteIncomeShare: number; // share of an invited friend's income, paid by the platform
  inviteRechargeShare: number; // share of an invited friend's recharges, paid by the platform
  // Coins Bank (finance)
  creatorDiamondsPerCoin: number; // diamonds a creator earns per coin of a received gift
  bdCommission: number; // share of the agency's eligible base, paid by the platform
  maxWithdrawDiamonds: number; // per request
  weeklyWithdrawLimitDiamonds: number;
  autoApproveUnderDiamonds: number; // smaller payouts are auto-approved, larger ones need manual review
  pendingDays: number; // days before earned diamonds become final (refund/chargeback window)
  bonusCashable: number; // 0 = bonus credits can never be withdrawn
  // Host & agency lifecycle
  hostAgencyJoinDays: number; // unaffiliated host moves to the management account after N days
  agencyHostInactiveDays: number; // inactive + no withdrawal for N days → host leaves the agency
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
  diamondsPerUsd: 5_000,
  usdTry: 49.8,
  coinsBankRetailCoinsPerTl: 1_000_000 / 23_599.99,
  coinsBankWholesaleFee: 0.02,
  coinsBankExchangeFee: 0.03,
  luckyHostShare: 0.2,
  agencyCommission: 0.4,
  roomOwnerBonus: 0.2,
  familyRates: [0.01, 0.0125, 0.015, 0.0175, 0.02, 0.0225, 0.025, 0.0275, 0.03, 0.0325, 0.035, 0.0375, 0.04, 0.045, 0.05],
  oneOnOneBonus: 0.05,
  voiceCallBonus: 0.03,
  videoCallBonus: 0.05,
  roomEventBonus: 0.02,
  bonusCapPerWeek: 500_000,
  minWithdrawDiamonds: 50_000,
  inviteUnitsPerPurchase: 1,
  inviteIncomeShare: 0.08,
  inviteRechargeShare: 0.04,
  creatorDiamondsPerCoin: 1,
  bdCommission: 0.05,
  maxWithdrawDiamonds: 5_000_000,
  weeklyWithdrawLimitDiamonds: 10_000_000,
  autoApproveUnderDiamonds: 250_000,
  pendingDays: 7,
  bonusCashable: 0,
  hostAgencyJoinDays: 3,
  agencyHostInactiveDays: 90,
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
export const usdValue = (diamonds: number) => diamonds / RULES.diamondsPerUsd;
/** Lucky gifts: diamonds the recipient earns for one send (a share of the price, rounded down). */
export const luckyHostDiamonds = (price: number, share = RULES.luckyHostShare) => Math.floor(price * share);
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
