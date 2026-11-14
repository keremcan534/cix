// Words, numbers and local checks of the Canlı ayarlar panel (components/admin/live-settings.tsx). Pure, so the
// tests can hold them to the server's rules (server/api/live-registry.mjs): the server checks every value again
// and its dryRun preview is what the admin confirms; these only keep the panel honest before anyone taps.
// Times are Istanbul time (UTC+3 all year since 2016), whatever the phone's own time zone.
import type { CatalogCampaign, EventKey, LiveKey, LiveValue, OneOnOneKey, RewardKey, RoomKey } from '@/lib/api';
import { REMINDER_LABEL } from '@/lib/events';
import { RULES } from '@/data/rules';
import { selfExchangeRate } from '@/lib/coins-bank';
import { campaignCoins } from '@/lib/live/catalog-live';

// --- Numbers -------------------------------------------------------------------------------------------------
export const fmtNum = (n: number) => Math.round(n).toLocaleString('tr-TR');
/** A rate with two decimals: 49,80. */
export const fmtRate = (r: number) => r.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** A signed percent with one decimal: +%2,0, -%10,0 (as the server's preview). */
export const fmtPct = (x: number) => `${x >= 0 ? '+' : '-'}%${Math.abs(x).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
const cents = (r: number) => Math.round(r * 100);

// --- Istanbul time ---------------------------------------------------------------------------------------------
const IST = 3 * 3_600_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const two = (n: number) => String(n).padStart(2, '0');
const ist = (t: number) => new Date(t + IST);

/** "8 Kasım 23:59" in Istanbul time; with the year when it isn't `now`'s year. '' for a bad time. */
export function fmtIstanbul(iso: string | number | null | undefined, now = Date.now()) {
  const t = typeof iso === 'number' ? iso : iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const d = ist(t);
  const year = d.getUTCFullYear() === ist(now).getUTCFullYear() ? '' : ` ${d.getUTCFullYear()}`;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}

/** The moment `day` days after today (Istanbul), at `hour`:00 Istanbul time. */
export const istanbulAt = (now: number, day: number, hour: number) => {
  const d = ist(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + day, hour) - IST;
};
/** "Bugün", "Yarın", else "10 Kasım Salı". */
export function dayLabel(now: number, day: number) {
  if (day === 0) return 'Bugün';
  if (day === 1) return 'Yarın';
  const d = ist(istanbulAt(now, day, 12));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${WEEKDAYS[d.getUTCDay()]}`;
}
/** The Istanbul hour of `now` (0–23). */
export const istanbulHour = (now: number) => ist(now).getUTCHours();

// --- Reason ----------------------------------------------------------------------------------------------------
export const REASON_CHIPS = ['Acil durum', 'Hata inceleniyor', 'Dolandırıcılık şüphesi', 'Bakım', 'Kampanya', 'Geri dönüş'] as const;
export const REASON_MAX = 300;
export type ReasonChip = (typeof REASON_CHIPS)[number];
/** The chips in the order the sheet shows them: the caller's likely one first. Nothing is picked for the admin. */
export const reasonChips = (suggest?: ReasonChip): readonly ReasonChip[] => (suggest ? [suggest, ...REASON_CHIPS.filter((c) => c !== suggest)] : REASON_CHIPS);
/** Null when the server will take the reason (3–300 characters after trimming), else what to fix. */
export function reasonError(text: string) {
  const s = text.trim();
  if ([...s].length < 3) return 'Neden en az 3 karakter olmalı.';
  if (s.length > REASON_MAX) return `Neden en çok ${REASON_MAX} karakter olabilir.`;
  return null;
}

// --- When a change needs the second "Emin misin?" ------------------------------------------------------------
/** The server's rule (live-registry big()): `before` is in effect now, `after` is the value to save (null = default). */
export function bigChange(key: LiveKey, before: LiveValue, after: LiveValue): boolean {
  switch (key) {
    case 'campaign':
      return !!after && typeof after === 'object' && !Array.isArray(after) && after.percent > 25;
    case 'gifts_hidden':
    case 'shop_hidden': {
      if (!Array.isArray(after)) return false;
      const was = Array.isArray(before) ? before : [];
      return after.filter((x) => !was.includes(x)).length > 5;
    }
    case 'exchange_usd_try':
      return typeof after === 'number' && typeof before === 'number' && Math.abs(cents(after) - cents(before)) * 100 > cents(before) * 3;
    case 'otp_global_per_hour':
      return typeof after === 'number' && after > 1000;
    case 'backpack_call_task':
      return typeof after === 'number' && after > BACKPACK_BIG;
    case 'casino_daily_rounds':
      return typeof after === 'number' && after > 80;
    case 'min_version':
      return after !== null;
    case 'dm_price':
    case 'call_voice_price':
    case 'call_video_price':
    case 'call_plain_voice_price':
    case 'call_plain_video_price':
    case 'match_voice_price':
    case 'match_video_price':
      // A price that more than doubles or halves.
      return typeof after === 'number' && typeof before === 'number' && (after > before * 2 || after * 2 < before);
    case 'welcome_coins':
    case 'invite_coins':
    case 'invite_daily_cap':
      // A reward or its cap that more than doubles.
      return typeof after === 'number' && typeof before === 'number' && after > before * 2;
    case 'room_bg_custom_price':
    case 'boss_seat_coins':
      // Özel süsleme's price, the Patron koltuğu's coins: when it more than doubles or halves.
      return typeof after === 'number' && typeof before === 'number' && (after > before * 2 || after * 2 < before);
    case 'room_staff_away_minutes':
      // A room without its staff closing sooner than 3 minutes (a short drop could close it).
      return typeof after === 'number' && after < 3;
    default:
      return false;
  }
}

/** Çantam (server/api/backpack.mjs): above this many gifts a day the change asks twice (live-registry bounds.big). */
export const BACKPACK_BIG = 2;

/** Oda süslemesi (server/api/live-registry.mjs): the sales that can be switched off (room_decor_off) and Özel
 *  süsleme's price and days, in card order. */
export const DECOR_LABEL: Record<string, string> = { custom: 'Özel süsleme (kendi görselini yükleme)', paid: 'Ücretli süslemeler' };
export const DECOR_NUMBER_KEYS: { key: 'room_bg_custom_price' | 'room_bg_custom_days'; unit: string }[] = [
  { key: 'room_bg_custom_price', unit: ' jeton' },
  { key: 'room_bg_custom_days', unit: ' gün' },
];

/** Etkinlik Merkezi's limits (server/api/live-registry.mjs EVENT_RULES), in card order, with each one's unit. The
 *  reminders switched off for everyone (event_reminders_off) are the card's switches. */
export const EVENT_NUMBER_KEYS: { key: Exclude<EventKey, 'event_reminders_off'>; unit: string }[] = [
  { key: 'event_min_room_level', unit: '' },
  { key: 'event_min_lead_minutes', unit: ' dakika' },
  { key: 'event_max_minutes', unit: ' dakika' },
  { key: 'event_max_capacity', unit: ' kişi' },
  { key: 'event_grace_minutes', unit: ' dakika' },
  { key: 'event_strike_limit', unit: '' },
  { key: 'event_block_days', unit: ' gün' },
];

/** Odalar (server/api/live-registry.mjs): when a room without its staff closes, the Patron koltuğu's coins and
 *  minutes, in card order. */
export const ROOM_NUMBER_KEYS: { key: RoomKey; unit: string }[] = [
  { key: 'room_staff_away_minutes', unit: ' dakika' },
  { key: 'boss_seat_coins', unit: ' jeton' },
  { key: 'boss_seat_minutes', unit: ' dakika' },
];

/** Oyun Salonu's numbers in the order the admin card shows them, with each one's unit. */
export const CASINO_NUMBER_KEYS: { key: 'casino_max_bet' | 'casino_daily_rounds'; unit: string }[] = [
  { key: 'casino_max_bet', unit: ' jeton' },
  { key: 'casino_daily_rounds', unit: '' },
];

/** The 1v1 settings in the order the admin card shows them, with each one's unit. */
export const ONE_ON_ONE_KEYS: { key: OneOnOneKey; unit: string }[] = [
  { key: 'dm_price', unit: ' jeton' },
  { key: 'call_voice_price', unit: ' jeton' },
  { key: 'call_video_price', unit: ' jeton' },
  { key: 'heart_voice_level', unit: '' },
  { key: 'heart_video_level', unit: '' },
  { key: 'call_free', unit: '' },
  { key: 'call_free_seconds', unit: ' saniye' },
  { key: 'call_plain_voice_price', unit: ' jeton' },
  { key: 'call_plain_video_price', unit: ' jeton' },
  { key: 'match_free', unit: '' },
  { key: 'match_free_seconds', unit: ' saniye' },
  { key: 'match_voice_price', unit: ' jeton' },
  { key: 'match_video_price', unit: ' jeton' },
];

/** Yeni üye ödülleri (server/api/live-registry.mjs): the switches (rewards_off) and the amounts, in card order. */
export const REWARD_LABEL: Record<string, string> = { welcome: 'Hoş geldin jetonu', invite: 'Davet ödülü', first_purchase: 'İlk alım hediyesi' };
export const REWARD_KEYS: { key: Exclude<RewardKey, 'rewards_off'>; unit: string }[] = [
  { key: 'welcome_coins', unit: ' jeton' },
  { key: 'invite_coins', unit: ' jeton' },
  { key: 'invite_daily_cap', unit: '' },
];

// --- Values as text ------------------------------------------------------------------------------------------
export const FEATURE_LABEL: Record<string, string> = {
  gifts: 'Hediye',
  purchases: 'Jeton satın alma',
  topup: 'Jeton yükleme',
  exchange: 'Elmas çevirme',
  jeton: 'Jeton Noktası',
  games: 'Oyunlar',
  dm: 'Mesajlar',
  rooms: 'Odalar',
  withdraw: 'Para çekme',
  shop: 'Mağaza',
};
/**
 * 'Para işlemlerini durdur': every money flow but purchases (paid purchases would wait, and Google refunds after 3
 * days). The server also turns Mağaza off when an older admin build sends only the first six.
 */
export const MONEY_STOP = ['gifts', 'topup', 'exchange', 'jeton', 'withdraw', 'games', 'shop'];
export const PURCHASE_WARNING = 'Ödemesi alınmış satın almalar açınca tekrar denenir; 3 günden uzun kapalı kalırsa Google parayı iade eder.';

const some = (xs: string[]) => (xs.length > 4 ? `${xs.slice(0, 4).join(', ')} ve ${xs.length - 4} tane daha` : xs.join(', '));
const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const isCampaign = (v: LiveValue): v is CatalogCampaign => !!v && typeof v === 'object' && !Array.isArray(v);

export type Names = { gift?: (id: string) => string; pack?: (id: string) => string; shop?: (sku: string) => string; game?: (id: string) => string };

/**
 * A value as the admin reads it. `stored`: a saved value from the history, where null is "Varsayılan"; otherwise
 * the value in effect (null: no notice / campaign / forced version).
 */
export function valueText(key: LiveKey, v: LiveValue, { stored = false, names = {} as Names, now = Date.now() } = {}): string {
  if (v === null) {
    if (stored) return 'Varsayılan';
    if (key === 'notice') return 'Duyuru yok';
    if (key === 'campaign') return 'Kampanya yok';
    if (key === 'min_version') return 'Zorunlu sürüm yok';
    return 'Varsayılan';
  }
  switch (key) {
    case 'features_off':
      return Array.isArray(v) && v.length ? `Kapalı: ${v.map((f) => FEATURE_LABEL[f] ?? f).join(', ')}` : 'Hepsi açık';
    case 'notice':
      return typeof v === 'string' && v ? `“${short(v)}”` : 'Duyuru yok';
    case 'min_version':
      return typeof v === 'string' ? v : 'Zorunlu sürüm yok';
    case 'campaign':
      return isCampaign(v) ? `%${v.percent} “${short(v.label, 40)}”, ${fmtIstanbul(v.startsAt, now)} – ${fmtIstanbul(v.endsAt, now)}` : 'Kampanya yok';
    case 'gifts_hidden':
      return Array.isArray(v) && v.length ? `Gizli: ${some(v.map((id) => names.gift?.(id) ?? id))}` : 'Hepsi görünür';
    case 'packs_hidden':
      return Array.isArray(v) && v.length ? `Gizli: ${some(v.map((id) => names.pack?.(id) ?? id))}` : 'Hepsi görünür';
    case 'shop_hidden':
      return Array.isArray(v) && v.length ? `Gizli: ${some(v.map((sku) => names.shop?.(sku) ?? sku))}` : 'Hepsi görünür';
    case 'exchange_usd_try':
      return typeof v === 'number' ? `1 USD = ${fmtRate(v)} TL` : String(v);
    case 'withdraw_max_diamonds':
    case 'withdraw_weekly_diamonds':
      return typeof v === 'number' ? `${fmtNum(v)} elmas` : String(v);
    case 'otp_global_per_hour':
      return typeof v === 'number' ? (v === 0 ? 'SMS durdu' : `Saatte ${fmtNum(v)}`) : String(v);
    case 'backpack_call_task':
      return typeof v === 'number' ? (v === 0 ? 'Verilmiyor' : `Günde ${v} adet`) : String(v);
    case 'dm_price':
    case 'call_voice_price':
    case 'call_video_price':
    case 'call_plain_voice_price':
    case 'call_plain_video_price':
    case 'match_voice_price':
    case 'match_video_price':
      return typeof v === 'number' ? (v === 0 ? 'Ücretsiz' : `${fmtNum(v)} jeton`) : String(v);
    case 'call_free_seconds':
    case 'match_free_seconds':
      return typeof v === 'number' ? `${fmtNum(v)} saniye` : String(v);
    case 'heart_voice_level':
    case 'heart_video_level':
      return typeof v === 'number' ? (v === 0 ? 'Hemen' : `Kalp Lv.${v}`) : String(v);
    case 'call_free':
    case 'match_free':
      return typeof v === 'number' ? `24 saatte ${v}` : String(v);
    case 'rewards_off':
      return Array.isArray(v) && v.length ? `Kapalı: ${v.map((k) => REWARD_LABEL[k] ?? k).join(', ')}` : 'Hepsi açık';
    case 'welcome_coins':
    case 'invite_coins':
      return typeof v === 'number' ? `${fmtNum(v)} jeton` : String(v);
    case 'invite_daily_cap':
      return typeof v === 'number' ? `Günde ${fmtNum(v)} davet` : String(v);
    case 'casino_off':
      return Array.isArray(v) && v.length ? `Kapalı: ${some(v.map((id) => names.game?.(id) ?? id))}` : 'Hepsi açık';
    case 'casino_open':
      return Array.isArray(v) && v.includes('everyone') ? 'Herkese açık' : 'Yalnız yöneticiler';
    case 'casino_max_bet':
      return typeof v === 'number' ? `${fmtNum(v)} jeton` : String(v);
    case 'casino_daily_rounds':
      return typeof v === 'number' ? `En yüksek bahisle ${fmtNum(v)} tur` : String(v);
    case 'room_decor_off':
      return Array.isArray(v) && v.length ? `Kapalı: ${v.map((k) => DECOR_LABEL[k] ?? k).join(', ')}` : 'Hepsi açık';
    case 'room_bg_custom_price':
      return typeof v === 'number' ? `${fmtNum(v)} jeton` : String(v);
    case 'room_bg_custom_days':
      return typeof v === 'number' ? `${fmtNum(v)} gün` : String(v);
    case 'room_staff_away_minutes':
      return typeof v === 'number' ? `${fmtNum(v)} dakika sonra kapanır` : String(v);
    case 'boss_seat_coins':
      return typeof v === 'number' ? `Tek seferde ${fmtNum(v)} jeton` : String(v);
    case 'boss_seat_minutes':
      return typeof v === 'number' ? `${fmtNum(v)} dakika` : String(v);
    case 'event_min_room_level':
      return typeof v === 'number' ? `Oda Lv.${v} ve üstü` : String(v);
    case 'event_min_lead_minutes':
    case 'event_max_minutes':
    case 'event_grace_minutes':
      return typeof v === 'number' ? `${fmtNum(v)} dakika` : String(v);
    case 'event_max_capacity':
      return typeof v === 'number' ? `${fmtNum(v)} kişi` : String(v);
    case 'event_strike_limit':
      return typeof v === 'number' ? `30 günde ${fmtNum(v)} ihlal` : String(v);
    case 'event_block_days':
      return typeof v === 'number' ? `${fmtNum(v)} gün` : String(v);
    case 'event_reminders_off':
      return Array.isArray(v) && v.length ? `Kapalı: ${v.map((k) => REMINDER_LABEL[k as keyof typeof REMINDER_LABEL] ?? k).join(', ')}` : 'Hepsi açık';
    case 'lucky_announce_min_coins':
      return typeof v === 'number' ? (v === 0 ? 'Her kazanç' : `${fmtNum(v)} jeton ve üstü`) : String(v);
    default:
      return String(v);
  }
}

/** The server's impact sentence, with the diamond emoji spelled out. */
export const impactText = (s: string) => s.replace(/\s*💎/g, ' elmas').replace(/^ /, '');

// --- Çevirme kuru --------------------------------------------------------------------------------------------
export const RATE_MIN = 40;
export const RATE_MAX = 75;
/** Coins for 10.000 diamonds at `usdTry` (lib/coins-bank, the same sum as the server's exchangeCoins). */
export const coinsPer10k = (usdTry: number) => Math.floor(10_000 * selfExchangeRate({ ...RULES, usdTry }));
/** '10.000 elmas = 4.220 → 4.305 jeton (+%2,0).' */
export const rateLine = (before: number, after: number) =>
  `10.000 elmas = ${fmtNum(coinsPer10k(before))} → ${fmtNum(coinsPer10k(after))} jeton (${fmtPct(((after - before) / before) * 100)}).`;
/** What one save may set the rate to from `current`: within ±10 % and inside 40–75 (the server's window). */
export function rateWindow(current: number) {
  const b = cents(current);
  return { lo: Math.max(4000, Math.ceil((b * 9) / 10)) / 100, hi: Math.min(7500, Math.floor((b * 11) / 10)) / 100 };
}
/** "49,8" or "49.80" → 49.8; null when it isn't a number with at most two decimals. */
export function parseRate(text: string): number | null {
  const s = text.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  return cents(Number(s)) / 100;
}
/** Null when the server will take `next` (in effect after the save) from `current`, else what to fix. */
export function rateError(current: number, next: number | null) {
  if (next === null || !Number.isFinite(next)) return 'Kuru 49,80 gibi yaz.';
  if (next < RATE_MIN || next > RATE_MAX) return `Kur ${fmtRate(RATE_MIN)} ile ${fmtRate(RATE_MAX)} arasında olmalı.`;
  const b = cents(current);
  if (Math.abs(cents(next) - b) * 10 > b) {
    const w = rateWindow(current);
    return `Bir kayıtta en çok %10: ${fmtRate(w.lo)}–${fmtRate(w.hi)} arası.`;
  }
  return null;
}

// --- Whole numbers (withdraw limits, SMS) --------------------------------------------------------------------
export type IntBounds = { min: number; max: number; step: number };
/** "1.200.000" or "1200000" → 1200000; null when it isn't a whole number. */
export function parseWhole(text: string): number | null {
  const s = text.trim().replace(/[.\s]/g, '');
  return /^\d{1,9}$/.test(s) ? Number(s) : null;
}
/** Null when the server will take `v`, else its rule in the server's words. */
export function wholeError(v: number | null, { min, max, step }: IntBounds, what: string, unit = '') {
  if (v !== null && Number.isSafeInteger(v) && v >= min && v <= max && v % step === 0) return null;
  const range = `${fmtNum(min)}–${fmtNum(max)}${unit}`;
  return step > 1 ? `${what} ${range} arasında, ${fmtNum(step)}'in katı olmalı.` : `${what} ${range} arasında tam sayı olmalı.`;
}

// --- Kampanya ------------------------------------------------------------------------------------------------
export const CAMPAIGN_DAYS = [1, 3, 7, 14];
export const CAMPAIGN_PERCENT = { min: 5, max: 50, step: 5, big: 25 };
export type CampaignDraft = { percent: number; label: string; start: 'now' | { day: number; hour: number }; days: number };
/** '100.000 jetonluk paket alan +20.000 kampanya jetonu alır.' */
export const campaignExample = (percent: number) => `100.000 jetonluk paket alan +${fmtNum(campaignCoins(100_000, percent))} kampanya jetonu alır.`;
/** The campaign to save from the draft, its start taken at `now` for 'Şimdi'. */
export function campaignOf(d: CampaignDraft, now = Date.now()): CatalogCampaign {
  const start = d.start === 'now' ? Math.floor(now / 60_000) * 60_000 : istanbulAt(now, d.start.day, d.start.hour);
  return { percent: d.percent, startsAt: new Date(start).toISOString(), endsAt: new Date(start + d.days * DAY).toISOString(), label: d.label.trim() };
}
/** Null when the server will take the campaign at `now`, else what to fix (live-registry campaign.parse). */
export function campaignError(c: CatalogCampaign, now = Date.now()) {
  const { min, max, step } = CAMPAIGN_PERCENT;
  if (!Number.isInteger(c.percent) || c.percent < min || c.percent > max || c.percent % step) return `Yüzde ${min}–${max} arasında, ${step}'in katı olmalı.`;
  const s = Date.parse(c.startsAt);
  const e = Date.parse(c.endsAt);
  if (!(s >= now - 5 * 60_000 && s <= now + 30 * DAY)) return 'Kampanya şimdi ile 30 gün sonrası arasında başlamalı.';
  if (!(e >= s + HOUR && e <= s + 14 * DAY)) return 'Kampanya en az 1 saat, en çok 14 gün sürebilir.';
  const n = c.label.trim().length;
  if (n < 3 || n > 40) return 'Kampanya adı 3–40 karakter olmalı.';
  return null;
}
/** "Bitiş: 8 Kasım 23:59" for a running campaign; "Başlangıç: 10 Kasım 20:00 · Bitiş: …" for a later one (Istanbul). */
export function campaignWhen(c: CatalogCampaign, now = Date.now()) {
  const end = `Bitiş: ${fmtIstanbul(c.endsAt, now)}`;
  return Date.parse(c.startsAt) > now ? `Başlangıç: ${fmtIstanbul(c.startsAt, now)} · ${end}` : end;
}

// --- Zorunlu sürüm -------------------------------------------------------------------------------------------
const VERSION = /^\d+(\.\d+){0,2}$/;
const parts = (v: string) => {
  const m = /^\s*v?(\d{1,9})(?:\.(\d{1,9}))?(?:\.(\d{1,9}))?(?:[-+].*)?\s*$/.exec(v);
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
};
/** -1, 0 or 1 (the server's compareVersion); something that isn't a version counts as 0.0.0. */
export function compareVersion(a: string, b: string) {
  const x = parts(a) ?? [0, 0, 0];
  const y = parts(b) ?? [0, 0, 0];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}
/** Null when the server will take `v` from an admin on `appVersion`, else what to fix. */
export function versionError(v: string, appVersion: string) {
  const s = v.trim();
  if (s.length > 20 || !VERSION.test(s)) return 'Sürüm 1.2.3 biçiminde olmalı.';
  if (compareVersion(s, appVersion) > 0) return `Kendi uygulamandan (${appVersion}) yeni bir sürümü zorunlu yapamazsın.`;
  return null;
}
