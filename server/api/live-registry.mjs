// Canlı ayarlar (live settings): the keys the owner may change from the admin panel without a deploy, each with
// its type, bounds, default and the rule for when a change needs a second "emin misin?", plus the small sums the
// money handlers and the app share. Pure: no database and no core.mjs, so the app's tests can import it the way
// they import catalog.mjs. The defaults are today's constants and .env values, so an empty live_settings table
// changes nothing. The table, the in-memory snapshot and the admin routes are in live-settings.mjs.
//
// Never here, by design (they change only with a deploy): the Cömertlik Lv.2 gate (wheel.mjs NEED_LEVEL /
// NEED_POINTS, casino visibility), the age limits, diamondsPerUsd and the 1:1 coin-to-diamond ratio, diamond lock
// hours, test and sandbox flags, TEST_DAILY, pack coins / product ids / TL prices (Play Console owns the price),
// gift prices (installed apps show the compiled price), the SMS provider and every secret.
//
// Values: null always means "back to the default". A set (features_off, gifts_hidden, shop_hidden, packs_hidden) is kept in
// its options' order, and an empty set is stored as null. Money rules: the exchange rate moves at most ±10 % per
// save, withdrawal limits can only go down from today's values.
import { EXCHANGE, GIFTS, PACKS, SHOP, WITHDRAW, exchangeCoins } from './catalog.mjs';

/** Every feature that can be switched off (features.mjs ROUTES). `games` is mostly in the app; Rüzgâr Gülü is on the server. */
export const FEATURES = ['gifts', 'purchases', 'topup', 'exchange', 'jeton', 'games', 'dm', 'rooms', 'withdraw', 'shop'];
export const FEATURE_LABEL = {
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
 * The app's emergency stop (live-settings-format.ts MONEY_STOP) as admin builds before the shop moved to the
 * server save it: when all six are off, Mağaza is off too, so the stop covers it from the day it ships.
 */
export const MONEY_STOP = ['gifts', 'topup', 'exchange', 'jeton', 'withdraw', 'games'];
/** What a switched-off feature's calls answer (503), old apps included. */
export const OFF_MESSAGE = 'Bu özellik geçici olarak kapalı';

/** A value the registry refuses, with the Turkish reason; live-settings.mjs answers it as a 400. */
export class LiveError extends Error {}
const bad = (msg) => {
  throw new LiveError(msg);
};

// --- .env: the config the app had before live settings (features.mjs) -----------------------------------------
/** "a, B,,c" → ['a', 'b', 'c']. */
export const listOf = (s) =>
  String(s ?? '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
const VERSION_RE = /^\d+(\.\d+){0,2}$/;

/** The app config from `e` (the environment): APP_MIN_VERSION, APP_UPDATE_URL, APP_NOTICE, FEATURES_OFF. Bad values are left out. */
export function configOf(e = process.env) {
  const min = String(e.APP_MIN_VERSION ?? '').trim();
  const url = String(e.APP_UPDATE_URL ?? '').trim();
  return {
    minVersion: VERSION_RE.test(min) ? min : null,
    updateUrl: /^https:\/\/\S+$/.test(url) ? url : null,
    notice: String(e.APP_NOTICE ?? '').trim().slice(0, 300) || null,
    featuresOff: [...new Set(listOf(e.FEATURES_OFF).filter((f) => FEATURES.includes(f)))],
  };
}

/** OTP_GLOBAL_PER_HOUR as features.mjs reads it: empty or invalid = 300, 0 = no SMS at all. */
const perHourOf = (v) => {
  const t = String(v ?? '').trim();
  const n = t === '' ? 300 : Number(t);
  return Number.isSafeInteger(n) && n >= 0 ? n : 300;
};

/** What each key means when it is null (or has no row): today's constants and the .env values of `e`. */
export function defaultsOf(e = process.env) {
  const cfg = configOf(e);
  return {
    features_off: [],
    notice: cfg.notice,
    min_version: cfg.minVersion,
    campaign: null,
    gifts_hidden: [],
    shop_hidden: [],
    packs_hidden: [],
    exchange_usd_try: EXCHANGE.usdTry,
    withdraw_max_diamonds: WITHDRAW.maxDiamonds,
    withdraw_weekly_diamonds: WITHDRAW.weeklyDiamonds,
    otp_global_per_hour: perHourOf(e.OTP_GLOBAL_PER_HOUR),
  };
}
const freezeDeep = (o) => (o && typeof o === 'object' ? Object.freeze(Object.values(o).forEach(freezeDeep) ?? o) : o);
export const DEFAULTS = freezeDeep(defaultsOf());

// --- Small pure sums -------------------------------------------------------------------------------------------
/** "1.2.3" → [1, 2, 3]; missing parts are 0, a "v" or a suffix ("-beta") is ignored (as the app reads it). Null when it isn't one. */
export function parseVersion(v) {
  const m = typeof v === 'string' && v.length <= 40 ? /^\s*v?(\d{1,9})(?:\.(\d{1,9}))?(?:\.(\d{1,9}))?(?:[-+].*)?\s*$/.exec(v) : null;
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}
/** -1 when a is older than b, 0 when equal, 1 when newer. Something that isn't a version counts as 0.0.0. */
export function compareVersion(a, b) {
  const x = parseVersion(a) ?? [0, 0, 0];
  const y = parseVersion(b) ?? [0, 0, 0];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

const ms = (t) => (t instanceof Date ? t.getTime() : typeof t === 'string' ? Date.parse(t) : Number(t));
/** Campaign coins for a pack of `coins` bought at `at`: floor(coins × percent / 100) while startsAt ≤ at < endsAt, else 0. */
export function campaignBonus(coins, campaign, at = Date.now()) {
  if (!campaign || !Number.isSafeInteger(coins) || coins <= 0) return 0;
  const t = ms(at);
  return t >= Date.parse(campaign.startsAt) && t < Date.parse(campaign.endsAt) ? Math.floor((coins * campaign.percent) / 100) : 0;
}

const IST_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });
/** The finance panel's campaign_ref: 'kampanya_YYYYMMDD_<percent>', the date of startsAt in Istanbul. */
export function campaignRef(campaign) {
  const p = Object.fromEntries(IST_DAY.formatToParts(new Date(campaign.startsAt)).map((x) => [x.type, x.value]));
  return `kampanya_${p.year}${p.month}${p.day}_${campaign.percent}`;
}

const cents = (r) => Math.round(r * 100);
/** True when the live rate gives at least what the client showed (rates in TL with 2 decimals). */
export const exchangeOk = (liveRate, clientRate) => Number.isFinite(clientRate) && Number.isFinite(liveRate) && cents(liveRate) >= cents(clientRate);

// --- Turkish text --------------------------------------------------------------------------------------------
const fmt = (n) => n.toLocaleString('tr-TR');
const rateText = (r) => r.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctText = (x) => `${x >= 0 ? '+' : '-'}%${Math.abs(x).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
const when = (iso) => new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const some = (xs) => (xs.length > 6 ? `${xs.slice(0, 6).join(', ')} ve ${xs.length - 6} tane daha` : xs.join(', '));
const giftName = (id) => GIFTS.get(id)?.name ?? id;
const shopName = (sku) => SHOP.get(sku)?.name ?? sku;
const packName = (id) => `${fmt(PACKS.find((p) => p.id === id)?.coins ?? 0)} jeton`;
const added = (before, after) => after.filter((x) => !before.includes(x));

/** The sentence each newly switched-off feature adds to the preview. */
const OFF_EFFECT = {
  gifts: 'Yeni hediye gönderimi durur.',
  purchases: 'Jeton satın alma durur. Ödemesi alınmış satın almalar açınca tekrar denenir; 3 günden uzun kapalı kalırsa Google parayı iade eder.',
  topup: 'Test jeton yüklemesi durur.',
  exchange: "Elmas çevirme ve Jeton Noktası'na bozdurma durur.",
  jeton: 'Jeton Noktası aktarımları ve toptan satış durur.',
  games: 'Rüzgâr Gülü ve oyunlar durur.',
  dm: 'Yeni özel mesaj gönderilemez.',
  rooms: 'Yeni oda açılamaz, odalara girilemez.',
  withdraw: 'Yeni para çekme talebi alınmaz; bekleyen talepler sürer.',
  shop: 'Mağazadan alım durur (eski uygulamalar dahil); alınmış ürünler kalır ve giyilebilir.',
};

// --- Checks ----------------------------------------------------------------------------------------------------
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex
const CONTROL_ALL = /[\u0000-\u001f\u007f]/;

function setOf(v, { options, max }, what) {
  if (!Array.isArray(v)) bad(`${what} bir liste olmalı`);
  if (v.length > max) bad(`${what}: en çok ${max} seçilebilir`);
  for (const x of v) if (typeof x !== 'string' || !options.includes(x)) bad(`${what}: bilinmeyen seçim ${JSON.stringify(x)?.slice(0, 30)}`);
  if (new Set(v).size !== v.length) bad(`${what}: aynı seçim iki kez var`);
  return v.length ? options.filter((o) => v.includes(o)) : null;
}

function wholeOf(v, { min, max, step }, what, unit = '') {
  if (Number.isSafeInteger(v) && v >= min && v <= max && v % step === 0) return v;
  const range = `${fmt(min)}–${fmt(max)}${unit}`;
  return bad(step > 1 ? `${what} ${range} arasında, ${fmt(step)}'in katı olmalı` : `${what} ${range} arasında tam sayı olmalı`);
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const timeOf = (v, what) => {
  const t = typeof v === 'string' && ISO.test(v) ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : bad(`${what} geçerli bir zaman olmalı`);
};
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Every key: `field` (the snapshot's name for it), `group` (the panel's card), `label`, `help`, `type`, `bounds`
 * (sent to the panel as they are), `default`, `parse(value, ctx)` → the cleaned value or a LiveError, `big(before,
 * after)` → true when the change needs a second confirmation, `change(before, after, ctx)` (save-time rules that
 * depend on the current value or the admin's app), `impact(before, after, ctx)` → the preview sentence.
 * `before` is the value in effect now. `after` is the new value (null = default) for big, and the value that will
 * be in effect for change and impact (ctx.raw: the value to be saved, null = default).
 */
export const REGISTRY = {
  features_off: {
    field: 'featuresOff',
    group: 'Acil durum',
    label: 'Kapalı özellikler',
    help: 'Kapatılan özellik sunucuda hemen durur; eski uygulamalar da etkilenir. Sunucu ayarında (.env) kapalı olan burada açılamaz.',
    type: 'set',
    bounds: { options: FEATURES, labels: FEATURE_LABEL, max: FEATURES.length },
    parse(v) {
      const off = setOf(v, REGISTRY.features_off.bounds, 'Kapalı özellikler');
      return off && MONEY_STOP.every((f) => off.includes(f)) && !off.includes('shop') ? FEATURES.filter((f) => off.includes(f) || f === 'shop') : off;
    },
    big: () => false,
    impact(before, after, ctx) {
      const off = added(before, after);
      const on = added(after, before);
      // Switched off in .env and not in the saved list: the admin may think they turned it on.
      const kept = (ctx.env?.featuresOff ?? []).filter((f) => !(ctx.raw ?? []).includes(f));
      const out = [];
      if (off.length) out.push(...off.map((f) => OFF_EFFECT[f]), `Eski uygulamalar "${OFF_MESSAGE}" mesajı görür.`);
      if (on.length) out.push(`Yeniden açılır: ${on.map((f) => FEATURE_LABEL[f]).join(', ')}.`);
      if (kept.length) out.push(`Sunucu ayarında kapalı kalır: ${kept.map((f) => FEATURE_LABEL[f]).join(', ')}.`);
      if (MONEY_STOP.every((f) => after.includes(f))) out.push('Para özelliklerinin hepsi kapalıyken Mağaza da kapalı kalır; açmak için önce birini aç.');
      return out.join(' ') || 'Görünür bir etkisi yok.';
    },
  },
  notice: {
    field: 'notice',
    group: 'Acil durum',
    label: 'Duyuru',
    help: 'Uygulamanın üstünde görünen kısa duyuru, en çok 300 karakter. Boş metin duyuruyu kaldırır; varsayılan sunucu ayarındaki duyurudur.',
    type: 'text',
    bounds: { max: 300 },
    parse(v) {
      if (typeof v !== 'string') bad('Duyuru metin olmalı');
      const s = v.trim();
      if (s.length > 300) bad('Duyuru en çok 300 karakter olabilir');
      if (CONTROL.test(s)) bad('Duyuruda satır sonu dışında özel karakter olamaz');
      return s;
    },
    big: () => false,
    impact(before, after, ctx) {
      if (after) return `Uygulamada şu duyuru görünür: "${after}"`;
      return ctx.raw === '' && ctx.env?.notice ? 'Duyuru kalkar; sunucu ayarındaki duyuru da gösterilmez.' : 'Duyuru kalkar.';
    },
  },
  campaign: {
    field: 'campaign',
    group: 'Kampanya',
    label: 'Kampanya',
    help: 'Her paket alımına yüzde olarak ek jeton. Kampanya jetonu ayrı tutulur; satın alma iade edilirse geri alınır. Mağaza deneme alımlarına (Play test, TestFlight) verilmez; test sunucusundaki test mağazası alımları alır.',
    type: 'campaign',
    bounds: { percent: { min: 5, max: 50, step: 5 }, bigPercent: 25, startsFromMinutes: -5, startsToDays: 30, durationHours: { min: 1, max: 14 * 24 }, label: { min: 3, max: 40 } },
    /** `stored`: a value saved earlier (or one a rollback brings back): its start is not compared with now. */
    parse(v, { now = Date.now(), stored = false } = {}) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) bad('Kampanya bilgisi eksik');
      const percent = wholeOf(v.percent, REGISTRY.campaign.bounds.percent, 'Kampanya yüzdesi');
      const starts = timeOf(v.startsAt, 'Kampanya başlangıcı');
      const ends = timeOf(v.endsAt, 'Kampanya bitişi');
      if (!stored && (starts < now - 5 * MINUTE || starts > now + 30 * DAY)) bad('Kampanya şimdi ile 30 gün sonrası arasında başlamalı');
      if (ends < starts + HOUR || ends > starts + 14 * DAY) bad('Kampanya en az 1 saat, en çok 14 gün sürebilir');
      const label = typeof v.label === 'string' ? v.label.trim() : '';
      if (label.length < 3 || label.length > 40 || CONTROL_ALL.test(label)) bad('Kampanya adı 3–40 karakter olmalı');
      return { percent, startsAt: new Date(starts).toISOString(), endsAt: new Date(ends).toISOString(), label };
    },
    big: (before, after) => !!after && after.percent > REGISTRY.campaign.bounds.bigPercent,
    impact(before, after, ctx) {
      if (!after) return before ? 'Kampanya biter. Önceden verilen kampanya jetonları geri alınmaz.' : 'Kampanya yok.';
      const ended = Date.parse(after.endsAt) <= (ctx.now ?? Date.now());
      return [
        `%${after.percent} kampanya "${after.label}": 100.000 jetonluk paket alan +${fmt(campaignBonus(100_000, after, after.startsAt))} kampanya jetonu alır.`,
        `${when(after.startsAt)} – ${when(after.endsAt)} (İstanbul saati).`,
        ended ? 'Bitiş zamanı geçmiş; kimse kampanya jetonu almaz.' : 'Eski uygulamalar kampanyayı göstermez; duyuru da yaz.',
      ].join(' ');
    },
  },
  gifts_hidden: {
    field: 'giftsHidden',
    group: 'Hediyeler ve paketler',
    label: 'Gizli hediyeler',
    help: 'Gizlenen hediye listeden çıkar ve sunucu onu reddeder. Fiyatlar değişmez.',
    type: 'set',
    bounds: { options: [...GIFTS.keys()], max: GIFTS.size, bigAdded: 5 },
    parse: (v) => setOf(v, REGISTRY.gifts_hidden.bounds, 'Gizli hediyeler'),
    big: (before, after) => !!after && added(before, after).length > REGISTRY.gifts_hidden.bounds.bigAdded,
    impact(before, after) {
      const hide = added(before, after);
      const show = added(after, before);
      const out = [];
      if (hide.length) out.push(`Gizlenir: ${some(hide.map(giftName))}. Eski uygulamalarda görünmeye devam eder; gönderince "Bu hediye artık yok" uyarısı çıkar, jeton düşmez.`);
      if (show.length) out.push(`Yeniden görünür: ${some(show.map(giftName))}.`);
      return out.join(' ') || 'Görünür bir etkisi yok.';
    },
  },
  shop_hidden: {
    field: 'shopHidden',
    group: 'Hediyeler ve paketler',
    label: 'Mağazada gizli ürünler',
    help: 'Gizlenen ürün mağazadan çıkar ve satın alınamaz. Alan kişide kalır, süresi bitene kadar kullanır. Fiyatlar değişmez.',
    type: 'set',
    bounds: { options: [...SHOP.keys()], labels: Object.fromEntries([...SHOP.values()].map((x) => [x.sku, x.name])), max: SHOP.size, bigAdded: 5 },
    parse: (v) => setOf(v, REGISTRY.shop_hidden.bounds, 'Mağazada gizli ürünler'),
    big: (before, after) => !!after && added(before, after).length > REGISTRY.shop_hidden.bounds.bigAdded,
    impact(before, after) {
      const hide = added(before, after);
      const show = added(after, before);
      const out = [];
      if (hide.length) out.push(`Mağazada gizlenir: ${some(hide.map(shopName))}. Alanlarda kalır; eski uygulamalarda görünse de satın alınamaz, jeton düşmez.`);
      if (show.length) out.push(`Mağazada yeniden satılır: ${some(show.map(shopName))}.`);
      return out.join(' ') || 'Görünür bir etkisi yok.';
    },
  },
  packs_hidden: {
    field: 'packsHidden',
    group: 'Hediyeler ve paketler',
    label: 'Gizli paketler',
    help: 'Gizlenen jeton paketi mağazada görünmez. En az bir paket açık kalmalı; satışı durdurmak için Jeton satın almayı kapat.',
    type: 'set',
    bounds: { options: PACKS.map((p) => p.id), labels: Object.fromEntries(PACKS.map((p) => [p.id, packName(p.id)])), max: PACKS.length - 1 },
    parse(v) {
      if (Array.isArray(v) && v.length >= PACKS.length) bad('En az bir paket mağazada kalmalı; satışı durdurmak için Jeton satın almayı kapat');
      return setOf(v, REGISTRY.packs_hidden.bounds, 'Gizli paketler');
    },
    big: () => false,
    impact(before, after) {
      const hide = added(before, after);
      const show = added(after, before);
      const out = [];
      if (hide.length) out.push(`Mağazada gizlenir: ${hide.map(packName).join(', ')}. Ödemesi alınmış satın almalar yine yüklenir.`);
      if (show.length) out.push(`Mağazada yeniden görünür: ${show.map(packName).join(', ')}.`);
      return out.join(' ') || 'Görünür bir etkisi yok.';
    },
  },
  exchange_usd_try: {
    field: 'usdTry',
    group: 'Çevirme kuru',
    label: 'Çevirme kuru',
    help: 'Elmas çevirmede 1 USD kaç TL sayılır. 40,00–75,00 arası; bir kayıtta en çok %10 değişir.',
    type: 'number',
    bounds: { min: 40, max: 75, decimals: 2, maxStepPct: 10, bigStepPct: 3 },
    parse(v) {
      if (typeof v !== 'number' || !Number.isFinite(v)) bad('Kur bir sayı olmalı');
      if (Math.abs(cents(v) - v * 100) > 1e-6) bad('Kur en çok 2 ondalık basamaklı olabilir');
      const r = cents(v) / 100;
      if (r < 40 || r > 75) bad('Kur 40,00 ile 75,00 arasında olmalı');
      return r;
    },
    change(before, after) {
      const b = cents(before);
      if (Math.abs(cents(after) - b) * 10 <= b) return;
      const lo = Math.max(4000, Math.ceil((b * 9) / 10)) / 100;
      const hi = Math.min(7500, Math.floor((b * 11) / 10)) / 100;
      bad(`Kur bir kayıtta en çok %10 değişebilir: şimdi ${rateText(before)}, yeni değer ${rateText(lo)}–${rateText(hi)} arasında olmalı`);
    },
    big: (before, after) => after !== null && Math.abs(cents(after) - cents(before)) * 100 > cents(before) * REGISTRY.exchange_usd_try.bounds.bigStepPct,
    impact(before, after) {
      const out = [`10.000 💎 = ${fmt(exchangeCoins(10_000, before))} → ${fmt(exchangeCoins(10_000, after))} jeton (${pctText(((after - before) / before) * 100)}).`];
      if (cents(after) < cents(EXCHANGE.usdTry)) out.push(`Kur ${rateText(EXCHANGE.usdTry)} altında: eski uygulamalar çevirmede "uygulamayı güncelle" uyarısı alır.`);
      return out.join(' ');
    },
  },
  withdraw_max_diamonds: {
    field: 'withdrawMax',
    group: 'Para çekme sınırları',
    label: 'Tek talep en çok',
    help: 'Bir para çekme talebinde istenebilecek en çok elmas. Yalnız bugünkü değerden aşağı çekilebilir.',
    type: 'int',
    bounds: { min: WITHDRAW.minDiamonds, max: WITHDRAW.maxDiamonds, step: 10_000 },
    parse: (v) => wholeOf(v, REGISTRY.withdraw_max_diamonds.bounds, 'Tek talep sınırı', ' elmas'),
    big: () => false,
    impact(before, after, ctx) {
      const weekly = ctx.next?.withdraw_weekly_diamonds;
      return `Tek talepte en çok ${fmt(before)} → ${fmt(after)} 💎 istenebilir. Bekleyen talepler etkilenmez.${weekly < after ? ` Haftalık sınır daha düşük olduğu için tek talepte en çok ${fmt(weekly)} 💎 istenebilir.` : ''}`;
    },
  },
  withdraw_weekly_diamonds: {
    field: 'withdrawWeekly',
    group: 'Para çekme sınırları',
    label: 'Haftalık en çok',
    help: '7 günde istenebilecek en çok elmas. Yalnız bugünkü değerden aşağı çekilebilir.',
    type: 'int',
    bounds: { min: WITHDRAW.minDiamonds, max: WITHDRAW.weeklyDiamonds, step: 10_000 },
    parse: (v) => wholeOf(v, REGISTRY.withdraw_weekly_diamonds.bounds, 'Haftalık sınır', ' elmas'),
    big: () => false,
    impact(before, after, ctx) {
      const max = ctx.next?.withdraw_max_diamonds;
      return `7 günde en çok ${fmt(before)} → ${fmt(after)} 💎 istenebilir. Bekleyen talepler etkilenmez.${after < max ? ' Tek talep sınırından düşük olduğu için tek talepte de en çok bu kadar istenebilir.' : ''}`;
    },
  },
  otp_global_per_hour: {
    field: 'otpPerHour',
    group: 'SMS',
    label: 'Saatlik SMS kodu sınırı',
    help: 'Bütün numaralara bir saatte gönderilecek en çok giriş kodu. 0: SMS ile giriş durur, Google ile giriş açık kalır.',
    type: 'int',
    bounds: { min: 0, max: 2000, step: 1, big: 1000 },
    parse: (v) => wholeOf(v, REGISTRY.otp_global_per_hour.bounds, 'Saatlik SMS sınırı'),
    big: (before, after) => after !== null && after > REGISTRY.otp_global_per_hour.bounds.big,
    impact: (before, after) => (after === 0 ? 'SMS ile giriş kodu gönderimi durur; Google ile giriş açık kalır.' : `Saatte en çok ${fmt(before)} → ${fmt(after)} SMS kodu gönderilir (bütün numaralar).`),
  },
  min_version: {
    field: 'minVersion',
    group: 'Zorunlu sürüm',
    label: 'Zorunlu sürüm',
    help: 'Bu sürümden eski uygulamalar güncellemeden açılmaz. Kendi uygulamandan yeni bir sürüm seçilemez.',
    type: 'version',
    bounds: { pattern: VERSION_RE.source, maxLength: 20 },
    parse(v) {
      const s = typeof v === 'string' ? v.trim() : '';
      if (s.length > 20 || !VERSION_RE.test(s)) bad('Sürüm 1.2.3 biçiminde olmalı');
      return s;
    },
    change(before, after, { appVersion, raw } = {}) {
      // Back to the default: .env's version, which the admin can't pick here.
      if (raw === null || after === null) return;
      if (!parseVersion(appVersion)) bad('Uygulama sürümün gelmedi; zorunlu sürümü uygulamadan kaydet');
      if (compareVersion(after, appVersion) > 0) bad(`Kendi uygulamandan (${appVersion.trim().slice(0, 20)}) yeni bir sürümü zorunlu yapamazsın`);
    },
    big: (before, after) => after !== null,
    impact(before, after, ctx) {
      if (!after) return 'Zorunlu güncelleme kalkar.';
      return ctx.raw === null ? `Sunucu ayarındaki zorunlu sürüm (${after}) geçerli olur.` : `${after} sürümünden eski uygulamalar "Güncelleme gerekli" ekranında kalır.`;
    },
  },
};
for (const k of Object.keys(REGISTRY)) REGISTRY[k].default = DEFAULTS[k];
freezeDeep(REGISTRY);

const known = (key) => typeof key === 'string' && Object.hasOwn(REGISTRY, key);

/**
 * The cleaned value of `key` (null = the default), or a LiveError with the Turkish reason. ctx.now: the time to
 * check a campaign's start against; ctx.stored: a value saved earlier (its start is not compared with now).
 */
export function validate(key, value, ctx = {}) {
  if (!known(key)) bad(`Bilinmeyen ayar: ${String(key).slice(0, 48)}`);
  if (value === null) return null;
  if (value === undefined) bad(`${REGISTRY[key].label}: değer gerekli (varsayılana dönmek için null)`);
  return REGISTRY[key].parse(value, ctx);
}

/**
 * Save-time rules on top of validate(): the rate's ±10 % step (also when going back to the default), a forced
 * version no newer than the admin's app. `before` is in effect now, `after` will be; ctx.raw is the value to be
 * saved (null = default; when left out, `after`).
 */
export function checkChange(key, before, after, ctx = {}) {
  REGISTRY[key].change?.(before, after, { raw: after, ...ctx });
}

/** True when changing `key` from `before` (in effect now) to `after` (null = default) needs a second confirmation. */
export const isBig = (key, before, after) => REGISTRY[key].big(before, after);

/** The preview sentence for `key` going from `before` to `after` (both in effect). ctx: { env: configOf(), next: effectiveOf(after snapshot), raw, now }. */
export const impactOf = (key, before, after, ctx = {}) => REGISTRY[key].impact(before, after, ctx);

// --- Snapshot --------------------------------------------------------------------------------------------------
const readOnlySet = (xs) => {
  const s = new Set(xs);
  const no = () => {
    throw new TypeError('the live settings snapshot is read-only');
  };
  Object.defineProperties(s, { add: { value: no }, delete: { value: no }, clear: { value: no } });
  return Object.freeze(s);
};

/**
 * The settings in effect, frozen, from `rows` ({ key, value }, newest per key; a later row for the same key wins)
 * over the defaults of `e`. A value the registry no longer accepts (e.g. bounds tightened by a later deploy) and
 * unknown keys are ignored; the first are listed in `invalid`. FEATURES_OFF is always added to the live list,
 * and the live notice and minimum version replace .env's ('' = no notice, null = .env's).
 *   { v, featuresOff: Set, notice, minVersion, giftsHidden: Set, shopHidden: Set, packsHidden: Set, campaign, usdTry, withdrawMax,
 *     withdrawWeekly, otpPerHour, invalid }
 */
export function snapshotOf(rows = [], e = process.env, { v = 0 } = {}) {
  const d = defaultsOf(e);
  const envOff = configOf(e).featuresOff;
  const raw = {};
  const invalid = new Set();
  for (const r of rows ?? []) {
    if (!r || !known(r.key)) continue;
    try {
      raw[r.key] = validate(r.key, r.value, { stored: true });
      invalid.delete(r.key);
    } catch {
      delete raw[r.key];
      invalid.add(r.key);
    }
  }
  const val = (k) => raw[k] ?? d[k];
  const notice = val('notice');
  const campaign = val('campaign');
  return Object.freeze({
    v,
    featuresOff: readOnlySet([...envOff, ...val('features_off').filter((f) => !envOff.includes(f))]),
    notice: notice === '' ? null : notice,
    minVersion: val('min_version'),
    giftsHidden: readOnlySet(val('gifts_hidden')),
    shopHidden: readOnlySet(val('shop_hidden')),
    packsHidden: readOnlySet(val('packs_hidden')),
    campaign: campaign && Object.freeze({ ...campaign }),
    usdTry: val('exchange_usd_try'),
    withdrawMax: val('withdraw_max_diamonds'),
    withdrawWeekly: val('withdraw_weekly_diamonds'),
    otpPerHour: val('otp_global_per_hour'),
    invalid: Object.freeze([...invalid]),
  });
}

/** Each key's value in effect in snapshot `s`, as JSON (sets as lists): what the panel and the preview show. */
export function effectiveOf(s) {
  const out = {};
  for (const [k, r] of Object.entries(REGISTRY)) {
    const x = s[r.field];
    out[k] = x instanceof Set ? [...x] : x;
  }
  return out;
}
