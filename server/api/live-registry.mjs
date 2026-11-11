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
// Values: null always means "back to the default". A set (features_off, gifts_hidden, shop_hidden, packs_hidden, rewards_off) is kept in
// its options' order, and an empty set is stored as null. Money rules: the exchange rate moves at most ±10 % per
// save, withdrawal limits can only go down from today's values.
import { EXCHANGE, GIFTS, PACKS, SHOP, WITHDRAW, exchangeCoins } from './catalog.mjs';
import { DAILY_ROUNDS as CASINO_DAILY_ROUNDS, GAMES as CASINO_GAMES, STAKES as CASINO_STAKES } from './casino-rules.mjs';

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
    ...Object.fromEntries(Object.entries(ONE_ON_ONE).map(([k, x]) => [k, x.default])),
    // Çantam (backpack.mjs): the demo gives one Kalp as the task reward.
    backpack_call_task: 1,
    rewards_off: [],
    ...Object.fromEntries(Object.entries(REWARD_AMOUNTS).map(([k, x]) => [k, x.default])),
    // Oyun Salonu (casino.mjs): the demo's values, every game on, stakes up to 25.000, 40 top-stake rounds a day.
    casino_off: [],
    casino_max_bet: CASINO_TOP,
    casino_daily_rounds: CASINO_DAILY_ROUNDS,
    // The coin games (Oyun Salonu, Rüzgâr Gülü) are for admin accounts only until they are opened to everyone
    // (the owner's decision). CASINO_OPEN=everyone in .env opens them without a row (the tests' API runs so).
    casino_open: e.CASINO_OPEN === 'everyone' ? ['everyone'] : [],
    // Oda süslemesi (room-decor.mjs): both paid parts on, Özel süsleme 5.000 jeton for 30 days.
    room_decor_off: [],
    ...Object.fromEntries(Object.entries(DECOR_AMOUNTS).map(([k, x]) => [k, x.default])),
    // Etkinlik Merkezi (events.mjs): every room owner may apply; 30 minutes ahead at least, 3 hours, 500 places.
    ...Object.fromEntries(Object.entries(EVENT_RULES).map(([k, x]) => [k, x.default])),
  };
}
const CASINO_TOP = CASINO_STAKES.wide[CASINO_STAKES.wide.length - 1];
/**
 * 1v1 (one-on-one.mjs): the prices in coins (the earner gets as many diamonds), the free matches and the heart
 * levels that open calls. key → [field, label, default, bounds, unit, sentence].
 */
const ONE = 'Birebir ve eşleşme';
const price = (max) => ({ min: 0, max, step: 10, money: true });
const ONE_ON_ONE = {
  dm_price: { field: 'dmPrice', label: 'Mesaj ücreti', default: 240, bounds: price(10_000), unit: ' jeton', help: 'Yayıncıya karşılıklı takip olmadan gönderilen her mesaj. 0: ücretsiz.', text: (a, b) => `Mesaj başı ${a} → ${b} jeton.` },
  call_voice_price: { field: 'callVoice', label: 'Sesli arama (dakika)', default: 2000, bounds: price(100_000), unit: ' jeton', help: 'Yayıncıyla sesli aramanın dakikası.', text: (a, b) => `Sesli arama dakikası ${a} → ${b} jeton. Süren aramalar başladıkları fiyatla devam eder.` },
  call_video_price: { field: 'callVideo', label: 'Görüntülü arama (dakika)', default: 3200, bounds: price(100_000), unit: ' jeton', help: 'Yayıncıyla görüntülü aramanın dakikası.', text: (a, b) => `Görüntülü arama dakikası ${a} → ${b} jeton. Süren aramalar başladıkları fiyatla devam eder.` },
  call_free: { field: 'callFree', label: 'Ücretsiz arama (24 saatte)', default: 3, bounds: { min: 0, max: 20, step: 1 }, unit: '', help: 'Kimsenin kazanmadığı aramalarda (yayıncı olmayan iki kişi ya da iki yayıncı) arayanın 24 saatte kullanabileceği ücretsiz arama. Her arama 1 hak.', text: (a, b) => `24 saatte ${a} → ${b} ücretsiz arama.` },
  call_free_seconds: { field: 'callSeconds', label: 'Ücretsiz arama süresi (saniye)', default: 58, bounds: { min: 15, max: 600, step: 1 }, unit: ' saniye', help: 'Ücretsiz bir arama en çok bu kadar sürer.', text: (a, b) => `Ücretsiz arama en çok ${a} → ${b} saniye sürer.` },
  call_plain_voice_price: { field: 'callPlainVoice', label: 'Sesli arama, hak bitince (dakika)', default: 600, bounds: price(100_000), unit: ' jeton', help: 'Kimsenin kazanmadığı sesli aramada ücretsiz hak bitince dakikası. Arayan öder.', text: (a, b) => `Hak bitince sesli arama dakikası ${a} → ${b} jeton.` },
  call_plain_video_price: { field: 'callPlainVideo', label: 'Görüntülü arama, hak bitince (dakika)', default: 750, bounds: price(100_000), unit: ' jeton', help: 'Kimsenin kazanmadığı görüntülü aramada ücretsiz hak bitince dakikası. Arayan öder.', text: (a, b) => `Hak bitince görüntülü arama dakikası ${a} → ${b} jeton.` },
  match_voice_price: { field: 'matchVoice', label: 'Sesli eşleşme (dakika)', default: 600, bounds: price(100_000), unit: ' jeton', help: 'Ücretsiz eşleşme hakkı bitince sesli eşleşmenin dakikası.', text: (a, b) => `Sesli eşleşme dakikası ${a} → ${b} jeton.` },
  match_video_price: { field: 'matchVideo', label: 'Görüntülü eşleşme (dakika)', default: 750, bounds: price(100_000), unit: ' jeton', help: 'Ücretsiz eşleşme hakkı bitince görüntülü eşleşmenin dakikası.', text: (a, b) => `Görüntülü eşleşme dakikası ${a} → ${b} jeton.` },
  match_free: { field: 'matchFree', label: 'Ücretsiz eşleşme (24 saatte)', default: 3, bounds: { min: 0, max: 20, step: 1 }, unit: '', help: 'Yayıncı olmayan herkesin 24 saatte kullanabileceği ücretsiz eşleşme.', text: (a, b) => `24 saatte ${a} → ${b} ücretsiz eşleşme.` },
  match_free_seconds: { field: 'matchSeconds', label: 'Ücretsiz eşleşme süresi (saniye)', default: 58, bounds: { min: 15, max: 600, step: 1 }, unit: ' saniye', help: 'Ücretsiz bir eşleşme en çok bu kadar sürer.', text: (a, b) => `Ücretsiz eşleşme en çok ${a} → ${b} saniye sürer.` },
  heart_voice_level: { field: 'heartVoice', label: 'Sesli arama kalp seviyesi', default: 2, bounds: { min: 0, max: 10, step: 1 }, unit: '', help: 'Yayıncıyla sesli arama bu kalp seviyesinde açılır. 0: hemen.', text: (a, b) => `Sesli arama kalp seviyesi ${a} → ${b}.` },
  heart_video_level: { field: 'heartVideo', label: 'Görüntülü arama kalp seviyesi', default: 4, bounds: { min: 0, max: 10, step: 1 }, unit: '', help: 'Yayıncıyla görüntülü arama bu kalp seviyesinde açılır. 0: hemen.', text: (a, b) => `Görüntülü arama kalp seviyesi ${a} → ${b}.` },
};
/** The 1v1 keys as registry entries; a price that more than doubles or halves needs the second confirmation. */
const oneOnOneEntries = () =>
  Object.fromEntries(
    Object.entries(ONE_ON_ONE).map(([k, x]) => [
      k,
      {
        field: x.field,
        group: ONE,
        label: x.label,
        help: x.help,
        type: 'int',
        bounds: x.bounds,
        parse: (v) => wholeOf(v, x.bounds, x.label, x.unit),
        big: (before, after) => after !== null && !!x.bounds.money && (after > before * 2 || after * 2 < before),
        impact: (before, after) => x.text(fmt(before), fmt(after)),
      },
    ]),
  );

/** Çantam (backpack.mjs): the gift the call task puts in the backpack, as the demo's "Görev ödülü" (Kalp). */
export const BACKPACK_TASK_GIFT = 'g2';

/**
 * Yeni üye ödülleri (referrals.mjs, purchases.mjs): the welcome coins, the invite reward for both people and its daily
 * cap per inviter, and a switch for each reward (the first-purchase gift's amounts are the packs', catalog.mjs). The
 * defaults are the demo's. Welcome and invite coins are reward coins ('odul', the shop only), so they never become
 * diamonds.
 */
const REWARDS = 'Yeni üye ödülleri';
export const REWARD_SWITCHES = ['welcome', 'invite', 'first_purchase'];
export const REWARD_LABEL = { welcome: 'Hoş geldin jetonu', invite: 'Davet ödülü', first_purchase: 'İlk alım hediyesi' };
const REWARD_OFF_EFFECT = {
  welcome: 'Yeni hesaplar hoş geldin jetonu almaz.',
  invite: 'Yeni davet kodu girilemez ve davet ödülü ödenmez; bekleyen davetler açılınca ilk oda girişinde ödenir.',
  first_purchase: 'Paketlerde "Hoş geldin paketi" görünmez; ilk alımlar hediyesiz yüklenir.',
};
const REWARD_AMOUNTS = {
  welcome_coins: { field: 'welcomeCoins', label: 'Hoş geldin jetonu', default: 100, bounds: { min: 10, max: 1_000, step: 10 }, unit: ' jeton', help: 'Yeni hesaba bir kez verilen ödül jetonu (yalnız mağazada harcanır). Daha önce başka hesap açılmış telefona verilmez.', text: (a, b) => `Yeni hesaba ${a} → ${b} hoş geldin jetonu.` },
  invite_coins: { field: 'inviteCoins', label: 'Davet ödülü (kişi başı)', default: 200, bounds: { min: 10, max: 2_000, step: 10 }, unit: ' jeton', help: 'Davet edilen ilk odasına girince ikisine de verilen ödül jetonu (yalnız mağazada harcanır).', text: (a, b) => `Davet ödülü kişi başı ${a} → ${b} jeton.` },
  invite_daily_cap: { field: 'inviteDailyCap', label: 'Günlük davet ödülü sınırı', default: 10, bounds: { min: 1, max: 100, step: 1 }, unit: '', help: 'Bir kişinin bir günde (Türkiye saati) en çok kaç davetten ödül alacağı. Fazlası ertesi günkü ilk oda girişinde ödenir.', text: (a, b) => `Bir kişi günde en çok ${a} → ${b} davetten ödül alır.` },
};
/** The reward keys as registry entries; an amount or a cap that more than doubles needs the second confirmation. */
const rewardEntries = () => {
  const switches = { options: REWARD_SWITCHES, labels: REWARD_LABEL, max: REWARD_SWITCHES.length };
  return {
    rewards_off: {
      field: 'rewardsOff',
      group: REWARDS,
      label: 'Kapalı ödüller',
      help: 'Kapatılan ödül sunucuda hemen durur; verilmiş jetonlar geri alınmaz.',
      type: 'set',
      bounds: switches,
      parse: (v) => setOf(v, switches, 'Kapalı ödüller'),
      big: () => false,
      impact(before, after) {
        const off = added(before, after);
        const on = added(after, before);
        const out = off.map((k) => REWARD_OFF_EFFECT[k]);
        if (on.length) out.push(`Yeniden açılır: ${on.map((k) => REWARD_LABEL[k]).join(', ')}.`);
        return out.join(' ') || 'Görünür bir etkisi yok.';
      },
    },
    ...Object.fromEntries(
      Object.entries(REWARD_AMOUNTS).map(([k, x]) => [
        k,
        {
          field: x.field,
          group: REWARDS,
          label: x.label,
          help: x.help,
          type: 'int',
          bounds: x.bounds,
          parse: (v) => wholeOf(v, x.bounds, x.label, x.unit),
          big: (before, after) => after !== null && after > before * 2,
          impact: (before, after) => x.text(fmt(before), fmt(after)),
        },
      ]),
    ),
  };
};

/**
 * Oda süslemesi (room-decor.mjs): a switch for each paid part of a room's background, and the price and length of
 * Özel süsleme (the owner's own picture). The paid backgrounds' own prices are the catalog's (catalog.mjs ROOM_BGS).
 */
const DECOR = 'Oda süslemesi';
export const DECOR_SWITCHES = ['custom', 'paid'];
export const DECOR_LABEL = { custom: 'Özel süsleme (kendi görselini yükleme)', paid: 'Ücretli süslemeler' };
const DECOR_OFF_EFFECT = {
  custom: 'Yeni özel süsleme satın alınamaz; süresi devam edenler kalır ve görselini değiştirebilir.',
  paid: 'Ücretli süsleme satın alınamaz; alınmış olanlar süresi bitene kadar kullanılır.',
};
const DECOR_AMOUNTS = {
  room_bg_custom_price: { field: 'roomBgCustomPrice', label: 'Özel süsleme ücreti', default: 5_000, bounds: { min: 100, max: 100_000, step: 100, money: true }, unit: ' jeton', help: 'Oda sahibinin kendi görselini odasının arka planı yapmak için ödediği jeton. Yalnız yeni alımlarda geçerli olur.', text: (a, b) => `Özel süsleme ${a} → ${b} jeton.` },
  room_bg_custom_days: { field: 'roomBgCustomDays', label: 'Özel süsleme süresi (gün)', default: 30, bounds: { min: 1, max: 90, step: 1 }, unit: ' gün', help: 'Ödenen özel süslemenin kaç gün odada kalacağı. Süren süslemelerin bitiş günü değişmez.', text: (a, b) => `Yeni alınan özel süsleme ${a} → ${b} gün kalır.` },
};
// Etkinlik Merkezi (events.mjs): who may apply, how long and how big an event may be, the start's grace and the
// limit for events left unstarted. key → [field, label, default, bounds, unit, sentence].
const EVENTS = 'Etkinlikler';
const EVENT_RULES = {
  event_min_room_level: { field: 'eventMinRoomLevel', label: 'Başvuru için oda seviyesi', default: 1, bounds: { min: 1, max: 15, step: 1 }, unit: '', help: 'Bu seviyedeki ve üstündeki odaların sahipleri etkinlik başvurusu yapabilir. 1: her oda sahibi.', text: (a, b) => `Etkinlik başvurusu Lv.${a} → Lv.${b} odadan itibaren.` },
  event_min_lead_minutes: { field: 'eventMinLead', label: 'En erken başlangıç (dakika sonra)', default: 30, bounds: { min: 0, max: 4320, step: 5 }, unit: ' dakika', help: 'Başvurudan en az bu kadar sonrası için etkinlik planlanabilir; incelemeye zaman kalsın.', text: (a, b) => `Etkinlik en erken ${a} → ${b} dakika sonrası için planlanır.` },
  event_max_minutes: { field: 'eventMaxMinutes', label: 'En uzun etkinlik (dakika)', default: 180, bounds: { min: 30, max: 720, step: 15 }, unit: ' dakika', help: 'Bir etkinlik en çok bu kadar sürer; süresi dolunca kendiliğinden biter.', text: (a, b) => `Bir etkinlik en çok ${a} → ${b} dakika sürer.` },
  event_max_capacity: { field: 'eventMaxCapacity', label: 'En fazla katılımcı', default: 500, bounds: { min: 10, max: 10_000, step: 10 }, unit: ' kişi', help: 'Bir etkinliğe en çok bu kadar yer ayrılabilir.', text: (a, b) => `Bir etkinliğe en çok ${a} → ${b} kişi yer ayırtabilir.` },
  event_grace_minutes: { field: 'eventGrace', label: 'Başlatma toleransı (dakika)', default: 15, bounds: { min: 5, max: 120, step: 5 }, unit: ' dakika', help: 'Başlangıç saatinden sonra bu süre içinde başlatılmayan etkinlik sona erer ve düzenleyene ihlal yazılır.', text: (a, b) => `Başlangıçtan ${a} → ${b} dakika sonra başlatılmayan etkinlik sona erer.` },
  event_strike_limit: { field: 'eventStrikeLimit', label: 'İhlal sınırı (30 günde)', default: 3, bounds: { min: 1, max: 10, step: 1 }, unit: '', help: '30 gün içinde bu kadar etkinliği zamanında başlatmayan oda sahibi bir süre yeni başvuru yapamaz.', text: (a, b) => `30 günde ${a} → ${b} ihlalde başvuru durur.` },
  event_block_days: { field: 'eventBlockDays', label: 'Başvuru kısıtı (gün)', default: 14, bounds: { min: 1, max: 90, step: 1 }, unit: ' gün', help: 'İhlal sınırına ulaşan oda sahibi son ihlalden sonra bu kadar gün başvuru yapamaz.', text: (a, b) => `İhlal sınırında başvuru ${a} → ${b} gün durur.` },
};
const eventEntries = () =>
  Object.fromEntries(
    Object.entries(EVENT_RULES).map(([k, x]) => [
      k,
      {
        field: x.field,
        group: EVENTS,
        label: x.label,
        help: x.help,
        type: 'int',
        bounds: x.bounds,
        parse: (v) => wholeOf(v, x.bounds, x.label, x.unit),
        big: () => false,
        impact: (before, after) => x.text(fmt(before), fmt(after)),
      },
    ]),
  );
/** The decoration keys as registry entries; a price that more than doubles or halves needs the second confirmation. */
const decorEntries = () => {
  const switches = { options: DECOR_SWITCHES, labels: DECOR_LABEL, max: DECOR_SWITCHES.length };
  return {
    room_decor_off: {
      field: 'roomDecorOff',
      group: DECOR,
      label: 'Kapalı süsleme satışları',
      help: 'Kapatılan satış sunucuda hemen durur; alınmış süslemeler süresi bitene kadar kalır. Ücretsiz süslemeler ve oda kapağı etkilenmez.',
      type: 'set',
      bounds: switches,
      parse: (v) => setOf(v, switches, 'Kapalı süsleme satışları'),
      big: () => false,
      impact(before, after) {
        const off = added(before, after);
        const on = added(after, before);
        const out = off.map((k) => DECOR_OFF_EFFECT[k]);
        if (on.length) out.push(`Yeniden açılır: ${on.map((k) => DECOR_LABEL[k]).join(', ')}.`);
        return out.join(' ') || 'Görünür bir etkisi yok.';
      },
    },
    ...Object.fromEntries(
      Object.entries(DECOR_AMOUNTS).map(([k, x]) => [
        k,
        {
          field: x.field,
          group: DECOR,
          label: x.label,
          help: x.help,
          type: 'int',
          bounds: x.bounds,
          parse: (v) => wholeOf(v, x.bounds, x.label, x.unit),
          big: (before, after) => after !== null && !!x.bounds.money && (after > before * 2 || after * 2 < before),
          impact: (before, after) => x.text(fmt(before), fmt(after)),
        },
      ]),
    ),
  };
};

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
  ...oneOnOneEntries(),
  backpack_call_task: {
    field: 'backpackCallTask',
    group: 'Çantam',
    label: `Görev ödülü: çantaya ${giftName(BACKPACK_TASK_GIFT)}`,
    help: `Günlük "1 görüntülü arama yap" görevini tamamlayana ödül jetonuyla birlikte çantasına verilen ${giftName(BACKPACK_TASK_GIFT)} (${fmt(GIFTS.get(BACKPACK_TASK_GIFT).price)} jeton değerinde). Çantadan gönderen jeton harcamaz; alanın elması 7 gün kilitli kalır, ajans komisyonu ödenmez. 0: verilmez, çantadakiler yine gönderilebilir.`,
    type: 'int',
    bounds: { min: 0, max: 5, step: 1, big: 2 },
    parse: (v) => wholeOf(v, REGISTRY.backpack_call_task.bounds, 'Çantaya verilen hediye', ' adet'),
    big: (before, after) => after !== null && after > REGISTRY.backpack_call_task.bounds.big,
    impact: (before, after) =>
      after === 0 ? 'Görev ödülüyle çantaya hediye verilmez. Çantada olanlar gönderilebilir.' : `Görev ödülüyle çantaya günde ${fmt(before)} → ${fmt(after)} ${giftName(BACKPACK_TASK_GIFT)} verilir.`,
  },
  ...rewardEntries(),
  // Oyun Salonu (casino.mjs). The odds are not here: the installed app shows them (casino-rules.mjs).
  casino_off: {
    field: 'casinoOff',
    group: 'Oyun Salonu',
    label: 'Kapalı oyunlar',
    help: 'Kapatılan oyun Oyun Salonu’ndan çıkar ve sunucu yeni turunu reddeder; oyun bakiyesi ve geçmiş kalır. Rüzgâr Gülü dahil bütün oyunları durdurmak için Acil durum’da Oyunlar’ı kapat.',
    type: 'set',
    bounds: { options: CASINO_GAMES.map((g) => g.id), labels: Object.fromEntries(CASINO_GAMES.map((g) => [g.id, g.name])), max: CASINO_GAMES.length },
    parse: (v) => setOf(v, REGISTRY.casino_off.bounds, 'Kapalı oyunlar'),
    big: () => false,
    impact(before, after) {
      const name = (id) => CASINO_GAMES.find((g) => g.id === id)?.name ?? id;
      const off = added(before, after);
      const on = added(after, before);
      const out = [];
      if (off.length) out.push(`Kapanır: ${some(off.map(name))}. Yeni tur oynanamaz; oyun bakiyesi ve geçmiş kalır.`);
      if (on.length) out.push(`Yeniden açılır: ${some(on.map(name))}.`);
      return out.join(' ') || 'Görünür bir etkisi yok.';
    },
  },
  casino_open: {
    field: 'casinoOpen',
    group: 'Oyun Salonu',
    label: 'Jetonlu oyunlar herkese açık',
    help: 'Kapalıyken Oyun Salonu ve Rüzgâr Gülü yalnızca yönetici hesaplarına görünür ve yalnızca onlar oynayabilir; diğer herkeste gizlidir ve sunucu turu reddeder. Açınca Cömertlik Lv.2 ve üstü herkes görür.',
    type: 'set',
    bounds: { options: ['everyone'], labels: { everyone: 'Herkese açık' }, max: 1 },
    parse: (v) => setOf(v, REGISTRY.casino_open.bounds, 'Jetonlu oyunlar'),
    // Opening the coin games to every member is confirmed twice.
    big: (before, after) => (after ?? []).includes('everyone') && !before.includes('everyone'),
    impact: (before, after) =>
      after.includes('everyone') === before.includes('everyone')
        ? 'Görünür bir etkisi yok.'
        : after.includes('everyone')
          ? 'Oyun Salonu ve Rüzgâr Gülü, Cömertlik Lv.2 ve üstü herkese açılır.'
          : 'Oyun Salonu ve Rüzgâr Gülü yalnızca yönetici hesaplarına görünür; diğer herkeste gizlenir ve yeni tur reddedilir. Oyun bakiyeleri ve geçmiş kalır.',
  },
  casino_max_bet: {
    field: 'casinoMaxBet',
    group: 'Oyun Salonu',
    label: 'En yüksek bahis',
    help: 'Bir turda en çok bu kadar jeton oynanır; her oyunun bahis basamakları bunun üstünde kesilir (en az 250). Bahis tahtasında bir seçeneğe konan en çok jeton da budur.',
    type: 'int',
    bounds: { min: 250, max: CASINO_TOP, step: 250 },
    parse: (v) => wholeOf(v, REGISTRY.casino_max_bet.bounds, 'En yüksek bahis', ' jeton'),
    big: () => false,
    impact: (before, after) => `Bir turda en çok ${fmt(before)} → ${fmt(after)} jeton oynanır.`,
  },
  casino_daily_rounds: {
    field: 'casinoDailyRounds',
    group: 'Oyun Salonu',
    label: 'Günlük sınır (en yüksek bahisle tur)',
    help: 'Bir kişinin bir oyunda bir günde oynayabileceği jeton: oyunun en yüksek bahsiyle bu kadar tur. 40 ile Yörünge’de günde 1.000.000 jeton.',
    type: 'int',
    bounds: { min: 1, max: 200, step: 1, big: 80 },
    parse: (v) => wholeOf(v, REGISTRY.casino_daily_rounds.bounds, 'Günlük sınır'),
    big: (before, after) => after !== null && after > REGISTRY.casino_daily_rounds.bounds.big,
    impact: (before, after) => `Bir oyunda günde en çok ${fmt(before)} → ${fmt(after)} tur (en yüksek bahisle); Yörünge’de ${fmt(before * CASINO_TOP)} → ${fmt(after * CASINO_TOP)} jeton.`,
  },
  ...decorEntries(),
  ...eventEntries(),
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
 *     withdrawWeekly, otpPerHour, dmPrice, callVoice, callVideo, callFree, callSeconds, callPlainVoice, callPlainVideo,
 *     matchVoice, matchVideo, matchFree, matchSeconds, heartVoice,
 *     heartVideo, backpackCallTask, rewardsOff: Set, welcomeCoins, inviteCoins, inviteDailyCap, casinoOff: Set, casinoOpen: Set, casinoMaxBet,
 *     casinoDailyRounds, roomDecorOff: Set, roomBgCustomPrice, roomBgCustomDays, eventMinRoomLevel, eventMinLead, eventMaxMinutes,
 *     eventMaxCapacity, eventGrace, eventStrikeLimit, eventBlockDays, invalid }
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
    ...Object.fromEntries(Object.entries(ONE_ON_ONE).map(([k, x]) => [x.field, val(k)])),
    backpackCallTask: val('backpack_call_task'),
    rewardsOff: readOnlySet(val('rewards_off')),
    ...Object.fromEntries(Object.entries(REWARD_AMOUNTS).map(([k, x]) => [x.field, val(k)])),
    casinoOff: readOnlySet(val('casino_off')),
    casinoOpen: readOnlySet(val('casino_open')),
    casinoMaxBet: val('casino_max_bet'),
    casinoDailyRounds: val('casino_daily_rounds'),
    roomDecorOff: readOnlySet(val('room_decor_off')),
    ...Object.fromEntries(Object.entries(DECOR_AMOUNTS).map(([k, x]) => [x.field, val(k)])),
    ...Object.fromEntries(Object.entries(EVENT_RULES).map(([k, x]) => [x.field, val(k)])),
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
