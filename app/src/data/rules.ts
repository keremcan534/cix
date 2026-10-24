// Earnings & bonus rules (spec "Merkezi kazanç ve bonus yönetim paneli").
// All values are defaults that the (demo) admin panel can change; changes are versioned
// and only apply from their effective time — past ledger rows keep the rule they were made with.

export type Rules = {
  version: number;
  diamondsPerUsd: number; // 5.000 elmas = 1 USD
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
  period: 'Haftalık';
};

export const DEFAULT_RULES: Rules = {
  version: 1,
  diamondsPerUsd: 5_000,
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
  period: 'Haftalık',
};

// Module-level mirror so plain helpers (usd(), etc.) see the current rules without hooks.
// The store keeps React state in sync and is the only writer.
export const RULES: Rules = { ...DEFAULT_RULES, familyRates: [...DEFAULT_RULES.familyRates] };

export const pct = (r: number) => `%${(r * 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
export const usdValue = (diamonds: number) => diamonds / RULES.diamondsPerUsd;
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
