// Lucky gift module (spec "LUCKY HEDİYE VE ÇARPANLI COIN KAZANMA MODÜLÜ").
// The sender pays the gift price; the server draws a multiplier from the published odds and, on a win,
// credits price × multiplier to the sender. The recipient earns diamonds for only part of the gift value
// (RULES.luckyHostShare, 20 %); the rest of the price funds the rewards. Both are recorded on the send.
//
// This file plays the Lucky server: it owns the odds, the draw, the reward reserve, limits and records.
// The client only sends (txId, gift, recipient) and shows the stored result. Each txId is processed once.
import { useSyncExternalStore } from 'react';

import { luckyHostDiamonds } from '@/data/rules';
import { today } from '@/lib/persist';

/** Odds are whole numbers out of 100,000 (0.001 % steps), so the total check is exact. */
export const ODDS_TOTAL = 100_000;
export const LUCKY_MULTS = [2, 5, 10, 20, 50, 100, 200, 500, 1000] as const;
export const LUCKY_MIN_AGE = 18;

/** mult 0 = "Ödül yok". Every package lists it, so the shown table always adds up to 100 %. */
export type LuckyTier = { mult: number; weight: number };
export type LuckyGift = { id: string; name: string; emoji: string; price: number; enabled: boolean; tiers: LuckyTier[] };
export type LuckyConfig = {
  version: number;
  gifts: LuckyGift[];
  /** Share of each send that goes into the reward reserve. */
  poolPct: number;
  /** Rewards paid per day across the platform. */
  dailyPayoutLimit: number;
  perUserDaily: number;
  perMinute: number;
  /** Wins from this multiplier up are announced in the room (if the winner allows it). */
  announceFrom: number;
  /** Default off: only the gift value scores in PK, never the reward. */
  pkCountsReward: boolean;
};
export type LuckyRecord = {
  txId: string;
  at: string;
  ts: number;
  userId: string;
  roomId: string;
  giftId: string;
  giftName: string;
  emoji: string;
  toId: string;
  price: number;
  mult: number;
  reward: number;
  /** Diamonds written to the recipient (share of the price, not the full value). */
  hostDiamonds: number;
  configVersion: number;
  /** The odds this send was drawn with (frozen; later edits never change it). */
  odds: LuckyTier[];
};
type Audit = { id: string; at: string; actor: string; action: string; target: string; note?: string };
type State = {
  config: LuckyConfig;
  pool: number;
  day: string;
  paidToday: number;
  spentTotal: number;
  paidTotal: number;
  records: LuckyRecord[];
  audit: Audit[];
  duplicates: number;
  suspicious: string[];
  /** Test tool only: the next draw returns this multiplier. Never reachable from a user screen. */
  forceNext: number | null;
};

const tiers = (w: Partial<Record<number, number>>): LuckyTier[] => {
  const list = [0, ...LUCKY_MULTS].filter((m) => m === 0 || w[m] !== undefined).map((m) => ({ mult: m, weight: w[m] ?? 0 }));
  const rest = ODDS_TOTAL - list.reduce((n, t) => n + (t.mult ? t.weight : 0), 0);
  return list.map((t) => (t.mult === 0 ? { ...t, weight: rest } : t));
};
// Defaults keep the expected return around 0.65× the price. Real odds come after the economy and legal review.
const STANDARD = tiers({ 2: 15_000, 5: 3_000, 10: 800, 20: 250, 50: 60, 100: 20, 500: 2, 1000: 1 });
/** The spec's example table (test only: every send wins at least 2×). */
export const DOC_TEST_TIERS = tiers({ 2: 40_000, 5: 25_000, 10: 18_000, 20: 10_000, 50: 4_000, 100: 2_000, 1000: 1_000 });

const DEFAULT_CONFIG: LuckyConfig = {
  version: 1,
  gifts: [
    { id: 'lk1', name: 'Şans Yoncası', emoji: '🍀', price: 20, enabled: true, tiers: STANDARD },
    { id: 'lk2', name: 'Uğur Böceği', emoji: '🐞', price: 100, enabled: true, tiers: STANDARD },
    { id: 'lk3', name: 'Altın Nal', emoji: '🧲', price: 500, enabled: true, tiers: STANDARD },
    { id: 'lk4', name: 'Kayan Yıldız', emoji: '🌠', price: 1000, enabled: true, tiers: tiers({ 2: 14_000, 5: 3_200, 10: 900, 20: 200, 50: 70, 100: 25, 200: 5 }) },
  ],
  poolPct: 70,
  dailyPayoutLimit: 20_000_000,
  perUserDaily: 500,
  perMinute: 60,
  announceFrom: 50,
  pkCountsReward: false,
};

let state: State = { config: DEFAULT_CONFIG, pool: 50_000_000, day: today(), paidToday: 0, spentTotal: 0, paidTotal: 0, records: [], audit: [], duplicates: 0, suspicious: [], forceNext: null };
const listeners = new Set<() => void>();
const emit = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
export const getLucky = () => state;
export function useLucky() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

const rid = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const clock = () => `${new Date().toLocaleDateString('tr-TR')} ${new Date().toTimeString().slice(0, 8)}`;
const log = (actor: string, action: string, target: string, note?: string) => emit({ audit: [{ id: rid(), at: clock(), actor, action, target, note }, ...state.audit].slice(0, 300) });
export const newLuckyTxId = () => `LK-${Date.now().toString(36)}-${rid()}`;
const fmt = (n: number) => n.toLocaleString('tr-TR');

/** "%0,001" style; odds are shown exactly as configured. */
export const oddsLabel = (weight: number) => `%${(weight / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 3 })}`;
export const oddsSum = (t: LuckyTier[]) => t.reduce((n, x) => n + x.weight, 0);
export const maxMult = (g: LuckyGift) => Math.max(0, ...g.tiers.filter((t) => t.weight > 0).map((t) => t.mult));
export const luckyGift = (id: string) => state.config.gifts.find((g) => g.id === id);

export function validate(g: Pick<LuckyGift, 'price' | 'tiers'>): string | null {
  if (!(g.price > 0)) return 'Fiyat 0’dan büyük olmalı.';
  if (g.tiers.some((t) => t.weight < 0 || !Number.isInteger(t.weight))) return 'Olasılıklar negatif olamaz.';
  if (g.tiers.some((t) => t.mult !== 0 && !(LUCKY_MULTS as readonly number[]).includes(t.mult))) return 'Tanımsız çarpan var.';
  const sum = oddsSum(g.tiers);
  if (sum !== ODDS_TOTAL) return `Olasılıkların toplamı ${oddsLabel(sum)}; %100 olmalı.`;
  return null;
}

/** Rewards paid today (read-only, safe to call while rendering). */
const paidToday = () => (state.day === today() ? state.paidToday : 0);

/** Why a package can't take new sends right now (null = it can). Checked before any coin moves. */
export function unavailable(g: LuckyGift): string | null {
  if (!g.enabled) return 'Bu Lucky hediye şu an kapalı.';
  const bad = validate(g);
  if (bad) return `Bu Lucky hediye yapılandırması geçersiz: ${bad}`;
  const top = g.price * maxMult(g);
  if (state.pool < top) return 'Ödül rezervi bu hediyenin en yüksek ödülünü karşılayamıyor; gönderime geçici olarak kapalı.';
  if (paidToday() + top > state.config.dailyPayoutLimit) return 'Günlük ödül limiti doldu; bu hediye yarın yeniden açılır.';
  return null;
}

export type SendResult = { ok: true; record: LuckyRecord; replay: boolean } | { ok: false; reason: string };
export type Wallet = { spend: (n: number, reason: string) => boolean; credit: (n: number, reason: string) => void };

function draw(t: LuckyTier[]): number {
  if (state.forceNext !== null && t.some((x) => x.mult === state.forceNext && x.weight > 0)) {
    const m = state.forceNext;
    emit({ forceNext: null });
    return m;
  }
  let r = Math.floor(Math.random() * ODDS_TOTAL);
  for (const x of t) {
    if (r < x.weight) return x.mult;
    r -= x.weight;
  }
  return 0;
}

/**
 * One Lucky send. Order: replay check → package and limits → charge → draw → credit → record.
 * The same txId always returns the first result and never charges or pays twice.
 */
export function sendLucky(
  req: { txId: string; userId: string; userAge: number; roomId: string; giftId: string; toId: string; toName: string },
  wallet: Wallet,
): SendResult {
  const prev = state.records.find((r) => r.txId === req.txId);
  if (prev) {
    emit({ duplicates: state.duplicates + 1 });
    log('Sistem', 'Tekrarlanan istek', req.txId, 'İlk sonuç döndü; ücret ve ödül tekrar işlenmedi');
    return { ok: true, record: prev, replay: true };
  }
  const g = luckyGift(req.giftId);
  if (!g) return { ok: false, reason: 'Hediye bulunamadı.' };
  if (req.userAge < LUCKY_MIN_AGE) return { ok: false, reason: `Lucky hediyeler ${LUCKY_MIN_AGE} yaş ve üzeri içindir.` };
  if (req.toId === req.userId) return { ok: false, reason: 'Kendine Lucky hediye gönderemezsin.' };
  const closed = unavailable(g);
  if (closed) return { ok: false, reason: closed };
  const mine = state.records.filter((r) => r.userId === req.userId);
  if (mine.filter((r) => r.at.startsWith(new Date().toLocaleDateString('tr-TR'))).length >= state.config.perUserDaily)
    return { ok: false, reason: `Günlük Lucky gönderim sınırına ulaştın (${state.config.perUserDaily}).` };
  if (mine.filter((r) => Date.now() - r.ts < 60_000).length >= state.config.perMinute) {
    emit({ suspicious: [`${clock()} · ${req.userId} · 1 dakikada ${state.config.perMinute}+ Lucky gönderimi denedi`, ...state.suspicious].slice(0, 100) });
    return { ok: false, reason: 'Çok hızlı gönderim. Bir dakika sonra tekrar dene.' };
  }
  if (state.day !== today()) emit({ day: today(), paidToday: 0 });
  if (!wallet.spend(g.price, `Lucky hediye: ${g.name} → ${req.toName}`)) return { ok: false, reason: 'Yetersiz bakiye.' };

  const odds = g.tiers.map((t) => ({ ...t }));
  const mult = draw(odds);
  const reward = g.price * mult;
  if (reward > 0) wallet.credit(reward, `Lucky ödülü: ${g.name} ×${fmt(mult)}`);
  const record: LuckyRecord = {
    txId: req.txId,
    at: clock(),
    ts: Date.now(),
    userId: req.userId,
    roomId: req.roomId,
    giftId: g.id,
    giftName: g.name,
    emoji: g.emoji,
    toId: req.toId,
    price: g.price,
    mult,
    reward,
    hostDiamonds: luckyHostDiamonds(g.price),
    configVersion: state.config.version,
    odds,
  };
  emit({
    records: [record, ...state.records].slice(0, 500),
    pool: state.pool + Math.floor((g.price * state.config.poolPct) / 100) - reward,
    paidToday: state.paidToday + reward,
    spentTotal: state.spentTotal + g.price,
    paidTotal: state.paidTotal + reward,
  });
  if (mult >= 100) log('Sistem', `Yüksek çarpan ×${fmt(mult)}`, req.userId, `${g.name} · ödül ${fmt(reward)} jeton · ${req.txId}`);
  return { ok: true, record, replay: false };
}

// --- Admin ------------------------------------------------------------------------------------------
const ADMIN = 'Sen (yönetici)';
export function updateConfig(patch: Partial<Omit<LuckyConfig, 'version' | 'gifts'>>, actor = ADMIN) {
  emit({ config: { ...state.config, ...patch, version: state.config.version + 1 } });
  log(actor, 'Ayar değişti', `v${state.config.version}`, Object.keys(patch).join(', '));
}
/** Saves a package. Refuses an enabled package whose odds don't add up to 100 %. */
export function saveGift(next: LuckyGift, actor = ADMIN): string | null {
  const bad = validate(next);
  if (bad && next.enabled) return bad;
  const exists = state.config.gifts.some((g) => g.id === next.id);
  const gifts = exists ? state.config.gifts.map((g) => (g.id === next.id ? next : g)) : [...state.config.gifts, next];
  emit({ config: { ...state.config, gifts, version: state.config.version + 1 } });
  log(actor, exists ? 'Paket güncellendi' : 'Paket eklendi', `${next.emoji} ${next.name}`, `v${state.config.version} · ${next.enabled ? 'açık' : 'kapalı'} · ${fmt(next.price)} jeton · en yüksek ×${maxMult(next)}`);
  return null;
}
export function newGiftDraft(): LuckyGift {
  return { id: `lk${Date.now().toString(36)}`, name: 'Yeni Lucky', emoji: '🎁', price: 50, enabled: false, tiers: STANDARD.map((t) => ({ ...t })) };
}
export function topUpPool(n: number, actor = ADMIN) {
  emit({ pool: state.pool + n });
  log(actor, n >= 0 ? 'Rezerve ekleme' : 'Rezervden düşme', `${fmt(n)} jeton`, `yeni rezerv ${fmt(state.pool)}`);
}
export function setForceNext(mult: number | null, actor = ADMIN) {
  emit({ forceNext: mult });
  log(actor, 'Test: sonraki sonuç', mult === null ? 'kaldırıldı' : `×${mult}`);
}
export const STANDARD_TIERS = STANDARD;
