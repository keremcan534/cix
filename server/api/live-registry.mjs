// Canlı ayarlar (live settings): the keys the owner may change from the admin panel without a deploy, each with
// its type, bounds, default and the rule for when a change needs a second "emin misin?", plus the small sums the
// money handlers and the app share. Pure: no database and no core.mjs, so the app's tests can import it the way
// they import catalog.mjs. The defaults are today's constants and .env values, so an empty live_settings table
// changes nothing. The table, the in-memory snapshot and the admin routes are in live-settings.mjs.
//
// Never here, by design (they change only with a deploy or elsewhere): level thresholds, perks and the Cömertlik gate
// of the coin games (Seviye ayarları, levels.mjs), casino visibility, the age limits and the 1:1 coin-to-diamond ratio, diamond lock
// hours, test and sandbox flags, TEST_DAILY, pack coins / product ids / TL prices (Play Console owns the price),
// gift prices (installed apps show the compiled price), the SMS provider and every secret.
//
// Values: null always means "back to the default". A set (features_off, gifts_hidden, shop_hidden, packs_hidden, rewards_off) is kept in
// its options' order, and an empty set is stored as null. Money rules: the exchange rate moves at most ±10 % per
// save, withdrawal limits can only go down from today's values.
import { COIN_VALUE_TL, EXCHANGE, GIFTS, PACKS, PAYOUT_USD_TRY, SHOP, WHOLESALE_TL, WITHDRAW, exchangeCoins, packsSetUp, payoutTl, tlOfCoins, wholesaleTl } from './catalog.mjs';
import { DAILY_ROUNDS as CASINO_DAILY_ROUNDS, GAMES as CASINO_GAMES, STAKES as CASINO_STAKES } from './casino-rules.mjs';
import { REMINDER_KINDS, REMINDER_LABEL } from './event-rules.mjs';
import { CHEST_MIN_CONTRIBUTION, FAMILY_CHESTS, FAMILY_TASKS, FAMILY_THEMES } from './family-rules.mjs';
import { MEDAL_RULES, TITLE_RULES } from './profile-rules.mjs';
import { HOST_BONUS_DEFAULT } from './host-bonus-rules.mjs';
import { MARK_HOURS } from './profile-mark-rules.mjs';
import { HOUSE_PCT as ROCKET_HOUSE_PCT } from './rocket-live-rules.mjs';
import { LEVELS as BOND_LEVELS, levelsOf as bondLevelsOf } from './bond-rules.mjs';
import { AUTO_CHAT, AUTO_PARTS, AUTO_PART_LABEL, AUTO_PART_OFF, AUTO_TEXTS, NOTICE_CATEGORIES, NOTICE_LABEL, linesOf } from './auto-chat-rules.mjs';
import { GLOBAL_GIFT_AMOUNTS } from './global-gift-rules.mjs';

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

/** Canlı ayarlar › Yönetim sitesi: https://…, at most 200 characters. */
const SITE_RE = /^https:\/\/[^\s/]+\.[^\s]{2,}$/;
const siteOf = (v) => {
  const s = String(v ?? '').trim();
  return s.length <= 200 && SITE_RE.test(s) ? s : '';
};

/** What each key means when it is null (or has no row): today's constants and the .env values of `e`. */
export function defaultsOf(e = process.env) {
  const cfg = configOf(e);
  return {
    features_off: [],
    notice: cfg.notice,
    min_version: cfg.minVersion,
    // The deploy writes ADMIN_SITE (server.yml) once the finance panel it put up has all of Yönetim's pages.
    admin_site: siteOf(e.ADMIN_SITE),
    campaign: null,
    gifts_hidden: [],
    shop_hidden: [],
    packs_hidden: [],
    pack_setup: null,
    exchange_usd_try: EXCHANGE.usdTry,
    coin_value_tl: COIN_VALUE_TL,
    jeton_wholesale_tl: WHOLESALE_TL,
    payout_usd_try: PAYOUT_USD_TRY,
    diamonds_per_usd: EXCHANGE.diamondsPerUsd,
    host_weekly_bonus: HOST_BONUS_DEFAULT,
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
    // Canlı Yörünge (rocket-live.mjs) keeps the house rule of every coin game until the owner moves it.
    rocket_house_pct: ROCKET_HOUSE_PCT,
    // Oda süslemesi (room-decor.mjs): both paid parts on, Özel süsleme 5.000 jeton for 30 days.
    room_decor_off: [],
    ...Object.fromEntries(Object.entries(DECOR_AMOUNTS).map(([k, x]) => [k, x.default])),
    // Odalar: a room without its staff closes after 5 minutes (room-autoclose.mjs); Patron koltuğu 25.000 jeton, 10
    // dakika (boss-seat.mjs). The owner's numbers (Güncelleme 4).
    ...Object.fromEntries(Object.entries(ROOM_AMOUNTS).map(([k, x]) => [k, x.default])),
    // Bağlar's level steps (bond-rules.mjs LEVELS), as the panel writes them.
    bond_levels: BOND_LEVELS.join(', '),
    // Aile's game (FAMILY_AMOUNTS): family-rules.mjs's numbers.
    ...Object.fromEntries(Object.entries(FAMILY_AMOUNTS).map(([k, x]) => [k, x.default])),
    // Oda seviyeleri and Vitrin (ROOM_LEVEL_AMOUNTS, BADGE_AMOUNTS): room-rules.mjs's and profile-rules.mjs's numbers.
    ...Object.fromEntries(Object.entries(ROOM_LEVEL_AMOUNTS).map(([k, x]) => [k, x.default])),
    ...Object.fromEntries(Object.entries(BADGE_AMOUNTS).map(([k, x]) => [k, x.default])),
    // Etkinlik Merkezi (events.mjs): every room owner may apply; 30 minutes ahead at least, 3 hours, 500 places.
    ...Object.fromEntries(Object.entries(EVENT_RULES).map(([k, x]) => [k, x.default])),
    // Every reminder on: 1 hour and 15 minutes before, and at the start.
    event_reminders_off: [],
    // Every Şanslı win is announced in every room (the owner's wish, Güncelleme 5).
    lucky_announce_min_coins: 0,
    // Global hediye (global-gifts.mjs): from 300.000 coins, one announcement every 10 seconds (the owners, Güncelleme 7).
    ...Object.fromEntries(Object.entries(GLOBAL_GIFT_AMOUNTS).map(([k, x]) => [k, x.default])),
    // Şanslı çanta's choices as lucky-bag-rules.mjs had them (BAG_LISTS), the way the panel writes them.
    ...Object.fromEntries(Object.entries(BAG_LISTS).map(([k, x]) => [k, x.default.join(', ')])),
    lucky_bag_seconds: 30,
    // Otomatik mesaj (auto-chat-rules.mjs): the spec's numbers and texts, every part on, every SimilarClub Sistem notice on.
    auto_chat_off: [],
    ...Object.fromEntries(Object.entries(AUTO_CHAT).map(([k, x]) => [k, x.default])),
    ...Object.fromEntries(Object.entries(AUTO_TEXTS).map(([k, x]) => [k, x.default])),
    system_notices_off: [],
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
  heart_video_level: { field: 'heartVideo', label: 'Görüntülü arama kalp seviyesi', default: 3, bounds: { min: 0, max: 10, step: 1 }, unit: '', help: 'Yayıncıyla görüntülü arama bu kalp seviyesinde açılır. Seviye 3: 5.000 puan, 5.000 jetonluk bir hediye açar. 0: hemen.', text: (a, b) => `Görüntülü arama kalp seviyesi ${a} → ${b}.` },
  // The heart's warmth (one-on-one.mjs heartPoints): chatting fills it a little, and it cools when the two go quiet.
  heart_msg_points: { field: 'heartMsg', label: 'Mesajın kalp puanı', default: 2, bounds: { min: 0, max: 100, step: 1 }, unit: ' puan', help: 'İki kişi arasındaki her mesaj kalbe bu kadar puan ekler (hediye ve ücretli dakika harcanan jeton kadar ekler). 0: mesaj kalbi doldurmaz.', text: (a, b) => `Mesaj başı kalp puanı ${a} → ${b}.` },
  heart_msg_daily: { field: 'heartMsgDaily', label: 'Mesajla günlük kalp puanı', default: 60, bounds: { min: 0, max: 5000, step: 10 }, unit: ' puan', help: 'İki kişinin bir günde mesajla kazanabileceği en çok kalp puanı: güven yavaş yavaş artar.', text: (a, b) => `Mesajla günlük kalp puanı ${a} → ${b}.` },
  heart_grace_days: { field: 'heartGrace', label: 'Kalbin tam kaldığı süre', default: 7, bounds: { min: 0, max: 365, step: 1 }, unit: ' gün', help: 'Bir hediyenin, dakikanın ya da mesajın puanı bu kadar gün tam sayılır, sonra azalmaya başlar. Konuşmaya devam edenin kalbi düşmez.', text: (a, b) => `Kalp puanı ${a} → ${b} gün tam sayılır.` },
  heart_half_days: { field: 'heartHalf', label: 'Kalbin yarıya inme süresi', default: 14, bounds: { min: 1, max: 365, step: 1 }, unit: ' gün', help: 'Tam sayılma süresi geçen puan bu kadar günde yarıya iner: sessiz kalan ikilinin kalbi yavaş yavaş düşer, aramalar yeniden kapanabilir.', text: (a, b) => `Kalp puanı ${a} → ${b} günde yarıya iner.` },
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
/** The limits as registry entries, and the reminders switched off for everyone (event-rules.mjs REMINDER_KINDS). */
const eventEntries = () => {
  const reminders = { options: REMINDER_KINDS, labels: REMINDER_LABEL, max: REMINDER_KINDS.length };
  const names = (ks) => ks.map((k) => REMINDER_LABEL[k].toLocaleLowerCase('tr-TR')).join(', ');
  return {
    ...Object.fromEntries(
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
    ),
    event_reminders_off: {
      field: 'eventRemindersOff',
      group: EVENTS,
      label: 'Kapalı hatırlatmalar',
      help: 'Yer ayırtanlara etkinlikten 1 saat ve 15 dakika önce, bir de başlarken bildirim gider. Kapatılan hatırlatma kimseye gönderilmez; kişiler kendi hatırlatmalarını ayrıca kapatabilir.',
      type: 'set',
      bounds: reminders,
      parse: (v) => setOf(v, reminders, 'Kapalı hatırlatmalar'),
      big: () => false,
      impact(before, after) {
        const off = added(before, after);
        const on = added(after, before);
        const out = [];
        if (off.length) out.push(`Gönderilmeyecek hatırlatma: ${names(off)}.`);
        if (on.length) out.push(`Yeniden gönderilecek: ${names(on)}.`);
        return out.join(' ') || 'Görünür bir etkisi yok.';
      },
    },
  };
};
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

/**
 * Odalar: how long a room may be without its owner and every admin before it closes (room-autoclose.mjs), and the
 * Patron koltuğu's numbers (boss-seat.mjs): the coins one send needs to sit on the empty seat, and the minutes a
 * sitting lasts and each further gift of the holder adds.
 */
const ROOMS = 'Odalar';
const ROOM_AMOUNTS = {
  room_staff_away_minutes: { field: 'roomStaffAwayMinutes', label: 'Yetkilisiz oda kapanır (dakika)', default: 5, bounds: { min: 1, max: 60, step: 1, big: 3 }, unit: ' dakika', help: 'Odada oda sahibi ya da yöneticisi bu kadar dakika yoksa herkes sesli odadan çıkarılır ve oda, yetkilisi gelene kadar kapalı kalır. Kısa bir bağlantı kopması odayı kapatmasın diye çok kısa tutma.', text: (a, b) => `Yetkilisiz kalan oda ${a} → ${b} dakika sonra kapanır.` },
  boss_seat_coins: { field: 'bossSeatCoins', label: 'Patron koltuğu: tek seferde en az', default: 25_000, bounds: { min: 1_000, max: 1_000_000, step: 1_000, money: true }, unit: ' jeton', help: 'Patron koltuğu boşken odada tek seferde bu kadar jetonluk hediye gönderen koltuğa oturur. Koltuktaki kişi etkilenmez.', text: (a, b) => `Boş koltuğa oturmak için tek seferde ${a} → ${b} jeton.` },
  // Oda sahibi bonusu (owners, 25 Nov 2026: "şu anda %0"): the share of the gifts in a room its owner would get. The
  // server has never paid one (a gift's diamonds are the recipient's; rooms.mjs, room-owner.mjs), so it is 0 and can't
  // be raised until that payment is written: a bonus the app showed and nobody paid would mislead the owners' users.
  room_owner_bonus_pct: { field: 'roomOwnerBonusPct', label: 'Oda sahibi bonusu', default: 0, bounds: { min: 0, max: 0, step: 1 }, unit: ' %', help: 'Odada gönderilen hediyelerden oda sahibine verilecek pay. Şu an %0: sunucu oda sahibine pay ödemiyor. 0’dan büyük yapılabilmesi için önce ödemenin yazılması gerekir (yazılımcıdan isteyin). Değişiklik kimseye bildirim göndermez.', text: (a, b) => `Oda sahibi bonusu %${a} → %${b}.` },
  boss_seat_minutes: { field: 'bossSeatMinutes', label: 'Patron koltuğu süresi (dakika)', default: 10, bounds: { min: 1, max: 60, step: 1 }, unit: ' dakika', help: 'Koltuğa oturan bu kadar dakika oturur; koltuktayken gönderdiği her hediye süreyi bir o kadar uzatır. Süren oturuşun bitişi değişmez.', text: (a, b) => `Patron koltuğunda oturma ve uzatma ${a} → ${b} dakika.` },
  // DJ modu (dj-live.mjs): a room's DJ or its owner sends a mixer's sound live from the mic, with no voice processing,
  // at this quality; how many at once in one room (each is a full music stream to every listener). 0: DJ modu off.
  dj_live_kbps: { field: 'djLiveKbps', label: 'DJ modu: yayın kalitesi', default: 96, bounds: { min: 0, max: 192, step: 8 }, unit: ' kbps', help: 'Odanın DJ’i ya da sahibi mikseri telefona bağlayıp müziği mikrofondan canlı verirken kullanılan ses kalitesi. Konuşma yaklaşık 32 kbps’tir; her DJ yayını odadaki her dinleyiciye bu kadar veri gönderir (ses sunucusunun trafiği). 0: DJ modu kapalı, kimse açamaz; açık olanlar kapanır.', text: (a, b) => (b === '0' ? `DJ modu kapatıldı (${a} kbps idi).` : a === '0' ? `DJ modu ${b} kbps ile açıldı.` : `DJ modu kalitesi ${a} → ${b} kbps.`) },
  dj_live_per_room: { field: 'djLivePerRoom', label: 'DJ modu: bir odada aynı anda', default: 1, bounds: { min: 1, max: 4, step: 1 }, unit: ' DJ', help: 'Bir odada aynı anda en çok bu kadar kişi DJ modunda canlı yayın yapabilir. Biri kapatınca sıradaki açabilir.', text: (a, b) => `Bir odada aynı anda DJ modu ${a} → ${b} kişi.` },
  // Aile (streamer-rule.mjs, families.mjs): the owners' numbers, 18 Nov.
  family_cashout_members: { group: 'Aile', field: 'familyCashoutMembers', label: 'Aile sahibinin çekim hakkı: en az üye', default: 10, bounds: { min: 0, max: 500, step: 1 }, unit: ' üye', help: 'Erkek hesaplar para çekemez; ajans sahipleri ile en az bu kadar üyeli ailenin sahibi hariç. Bu aile sahipleri yayıncı da sayılır. Aile kurmak ucuz olduğu için düşük tutma.', text: (a, b) => `Aile sahibinin çekim hakkı için gereken üye ${a} → ${b}.` },
  family_rejoin_days: { group: 'Aile', field: 'familyRejoinDays', label: 'Aileden ayrılan yayıncının bekleme süresi', default: 90, bounds: { min: 0, max: 365, step: 1 }, unit: ' gün', help: 'Kendi isteğiyle aileden ayrılan yayıncı bu kadar gün başka bir aileye katılamaz ve aile kuramaz. Ayrıldığı aileye dönebilir. Aileden çıkarılan kişi beklemez.', text: (a, b) => `Aileden ayrılan yayıncının bekleme süresi ${a} → ${b} gün.` },
  // Özel albüm (private-album.mjs, owners 24 Nov 2026): one price for every streamer's album; its coins become the
  // streamer's diamonds as a gift's do. 0 closes it.
  private_album_price: { group: 'Özel albüm', field: 'privateAlbumPrice', label: 'Özel albüm fiyatı', default: 500, bounds: { min: 0, max: 100_000, step: 10, money: true }, unit: ' jeton', help: 'Ajanstaki onaylı bir yayıncının özel albümünü açmanın fiyatı. Jeton hediye gibi yayıncıya elmas olarak geçer, ajans komisyonu hediye gibi işler. Açan kişi albümü (sonradan eklenenler dahil) hep görür. 0: özel albüm kapalı; kimse açamaz, yayıncılar fotoğraf ekleyemez (önceden açanlar görmeye devam eder).', text: (a, b) => (b === '0' ? `Özel albüm kapatıldı (${a} jetondu).` : a === '0' ? `Özel albüm ${b} jetonla açıldı.` : `Özel albüm fiyatı ${a} → ${b} jeton.`) },
  // VIP yükseltme koruma dönemi (vip-month.mjs, owners 24 Nov 2026): an account that kept its VIP level but didn't move
  // up may put the month's evaluation off by `vip_extend_days` for `vip_extend_price` coins, in the last
  // `vip_extend_offer_days` days. Price 0: not offered (until the owners set it).
  vip_extend_price: { group: 'VIP', field: 'vipExtendPrice', label: 'VIP yükseltme koruma dönemi fiyatı', default: 0, bounds: { min: 0, max: 10_000_000, step: 100, money: true }, unit: ' jeton', help: 'Seviyesini koruyup yükseltemeyen VIP üye, ay sonuna yaklaşınca bu fiyatla değerlendirme tarihini aşağıdaki gün kadar erteler (ayda bir kez). 0: teklif edilmez.', text: (a, b) => (b === '0' ? `VIP koruma dönemi kapatıldı (${a} jetondu).` : `VIP koruma dönemi fiyatı ${a} → ${b} jeton.`) },
  vip_extend_days: { group: 'VIP', field: 'vipExtendDays', label: 'VIP yükseltme koruma dönemi süresi', default: 7, bounds: { min: 1, max: 31, step: 1 }, unit: ' gün', help: 'Satın alınınca VIP değerlendirmesi bu kadar gün ertelenir.', text: (a, b) => `VIP koruma dönemi ${a} → ${b} gün.` },
  vip_extend_offer_days: { group: 'VIP', field: 'vipExtendOfferDays', label: 'VIP koruma dönemi: kaç gün kala teklif edilir', default: 3, bounds: { min: 1, max: 15, step: 1 }, unit: ' gün', help: 'Değerlendirmeye bu kadar gün kala, seviyesini koruyup yükseltemeyen VIP üyeye koruma dönemi teklif edilir.', text: (a, b) => `VIP koruma dönemi teklifi ${a} → ${b} gün kala.` },
  // Bağlar (bonds.mjs, docs/BAGLAR.md): how many bonds of a kind one person may have, the requests and their days.
  bond_max_cift: { group: 'Bağlar', field: 'bondMaxCift', label: 'Çift bağı: kişi başına en fazla', default: 1, bounds: { min: 1, max: 5, step: 1 }, unit: ' bağ', help: 'Bir kişinin aynı anda kaç Çift bağı olabilir. Kurulmuş bağlar sınır düşse de sürer; yalnız yenisi kurulamaz.', text: (a, b) => `Kişi başına Çift bağı ${a} → ${b}.` },
  bond_max_kin: { group: 'Bağlar', field: 'bondMaxKin', label: 'Aile bağları: türü başına en fazla', default: 1000, bounds: { min: 1, max: 1000, step: 1 }, unit: ' bağ', help: 'Kardeş, Bacı, Ağabey, Abla, Yenge ve Enişte bağlarının her birinden bir kişinin aynı anda kaç tane olabilir. 1000: pratikte sınırsız (sahiplerin kararı, Güncelleme 7). Kurulmuş bağlar sürer.', text: (a, b) => `Kardeş, Bacı, Ağabey, Abla, Yenge, Enişte: türü başına ${a} → ${b} bağ.` },
  bond_max_kanka: { group: 'Bağlar', field: 'bondMaxKanka', label: 'Kanka bağı: kişi başına en fazla', default: 1000, bounds: { min: 1, max: 1000, step: 1 }, unit: ' bağ', help: 'Bir kişinin aynı anda kaç Kanka bağı olabilir. 1000: pratikte sınırsız. Kurulmuş bağlar sürer.', text: (a, b) => `Kişi başına Kanka bağı ${a} → ${b}.` },
  bond_pending_max: { group: 'Bağlar', field: 'bondPendingMax', label: 'Bekleyen istek: en fazla', default: 10, bounds: { min: 1, max: 50, step: 1 }, unit: ' istek', help: 'Bir kişinin cevap bekleyen bağ isteği en çok bu kadar olabilir (her istek jetonunu bekletir).', text: (a, b) => `Aynı anda bekleyen bağ isteği ${a} → ${b}.` },
  bond_answer_days: { group: 'Bağlar', field: 'bondAnswerDays', label: 'İsteğe cevap süresi (gün)', default: 3, bounds: { min: 1, max: 14, step: 1 }, unit: ' gün', help: 'Bu süre içinde cevaplanmayan bağ isteğinin jetonu gönderene döner. Bekleyen isteklerin süresi değişmez.', text: (a, b) => `Yeni bağ isteklerine cevap süresi ${a} → ${b} gün.` },
  bond_cooldown_days: { group: 'Bağlar', field: 'bondCooldownDays', label: 'Bağ bitince bekleme (gün)', default: 7, bounds: { min: 0, max: 90, step: 1 }, unit: ' gün', help: 'Bağı biten iki kişi bu kadar gün yeniden bağ kuramaz. 0: hemen kurabilir.', text: (a, b) => `Bağ bitince yeniden kurmak için ${a} → ${b} gün beklenir.` },
  bond_talk_daily: { group: 'Bağlar', field: 'bondTalkDaily', label: 'Sohbetten günlük bağ puanı: en fazla', default: 10, bounds: { min: 0, max: 100, step: 1 }, unit: ' puan', help: 'Bağlı iki kişinin birbirine cevap verdiği her mesaj 1 bağ puanı getirir, günde en çok bu kadar. 0: sohbet puan getirmez.', text: (a, b) => `Sohbetten günde en çok ${a} → ${b} bağ puanı.` },
  // The nightly drop and the end of a bond with no gift (bond-life.mjs, bond-rules.mjs DECAY; the owners' numbers).
  bond_drop_pct: { group: 'Bağlar', field: 'bondDropPct', label: 'Hediyesiz gece düşen puan (%)', default: 10, bounds: { min: 0, max: 50, step: 1 }, unit: ' %', help: 'İki taraftan biri o gün hediye göndermediyse bağın puanından gece bu kadar yüzde düşer (en az aşağıdaki kadar). Kabulden sonraki ilk gece düşmez. Mesajlaşma puan getirir ama düşüşü durdurmaz. 0: yüzde düşmez.', text: (a, b) => `Hediyesiz gece düşen bağ puanı %${a} → %${b}.` },
  bond_drop_flat: { group: 'Bağlar', field: 'bondDropFlat', label: 'Hediyesiz gece en az düşen puan', default: 10, bounds: { min: 0, max: 100_000, step: 1 }, unit: ' puan', help: 'Hediyesiz bir gecede bağdan en az bu kadar puan düşer (puan 0’ın altına inmez). 0: yalnız yüzde düşer.', text: (a, b) => `Hediyesiz gece en az ${a} → ${b} bağ puanı düşer.` },
  bond_idle_end_days: { group: 'Bağlar', field: 'bondIdleEndDays', label: 'Hediyesiz kalan bağ biter (gün)', default: 30, bounds: { min: 0, max: 365, step: 1 }, unit: ' gün', help: 'Bu kadar gün iki taraftan hiç hediye gitmezse bağ kendiliğinden biter: jeton iadesi yok, yeniden kurmak için bekleme yok. 0: hiç bitmez.', text: (a, b) => `Hediyesiz bağ ${a} → ${b} gün sonra biter.` },
  bond_idle_warn_days: { group: 'Bağlar', field: 'bondIdleWarnDays', label: 'Bitmeden önce uyarı (gün)', default: 3, bounds: { min: 0, max: 30, step: 1 }, unit: ' gün', help: 'Hediyesiz bağ bitmeden bu kadar gün önce iki tarafa SimilarClub Sistem’den bir kez uyarı gider. 0: uyarı yok.', text: (a, b) => `Bağ bitmeden ${a} → ${b} gün önce uyarı.` },
  // Koruma (guards.mjs, docs/KORUMA.md): the midnight drop, the list's length and the profile's threshold.
  guard_drop_from: { group: 'Koruma', field: 'guardDropFrom', label: 'Yüzde düşüş: bu puandan itibaren', default: 5000, bounds: { min: 0, max: 10_000_000, step: 100 }, unit: ' puan', help: 'Önceki gün hediye göndermeyen koruyucunun puanı gece düşer: bu puan ve üstündeyse yüzdeyle, altındaysa sabit miktarla.', text: (a, b) => `Gece yüzdeyle düşüş ${a} → ${b} puandan itibaren.` },
  guard_drop_pct: { group: 'Koruma', field: 'guardDropPct', label: 'Yüzde düşüş (%)', default: 10, bounds: { min: 0, max: 50, step: 1 }, unit: ' %', help: 'Hediye göndermeyen koruyucunun puanından gece düşen yüzde. 0: düşmez.', text: (a, b) => `Gece düşen yüzde %${a} → %${b}.` },
  guard_drop_flat: { group: 'Koruma', field: 'guardDropFlat', label: 'Sabit düşüş', default: 1000, bounds: { min: 0, max: 1_000_000, step: 10 }, unit: ' puan', help: 'Yüzde düşüş eşiğinin altındaki koruyucunun puanından gece düşen miktar. 0: düşmez.', text: (a, b) => `Eşiğin altında gece ${a} → ${b} puan düşer.` },
  guard_list_max: { group: 'Koruma', field: 'guardListMax', label: 'Koruma listesi: en fazla kişi', default: 50, bounds: { min: 10, max: 200, step: 1 }, unit: ' kişi', help: 'Benim Koruma listelerinde en çok bu kadar kişi görünür.', text: (a, b) => `Koruma listesinde ${a} → ${b} kişi.` },
  guard_threshold_per_level: { group: 'Koruma', field: 'guardThresholdPerLevel', label: 'Eşik: Yankı seviyesi başına en fazla', default: 50_000, bounds: { min: 0, max: 10_000_000, step: 1000 }, unit: ' puan', help: 'Kişinin koyabileceği en yüksek eşik: bu sayı × (Yankı seviyesi + 1). Konmuş eşikler değişmez.', text: (a, b) => `Yankı seviyesi başına eşik ${a} → ${b} puan.` },
  guard_threshold_days: { group: 'Koruma', field: 'guardThresholdDays', label: 'Eşik değiştirme aralığı (gün)', default: 7, bounds: { min: 1, max: 30, step: 1 }, unit: ' gün', help: 'Kişi eşiğini en çok bu kadar günde bir değiştirebilir.', text: (a, b) => `Eşik ${a} → ${b} günde bir değişir.` },
  // Profil izleri (profile-marks.mjs, docs/PROFIL_IZLERI.md): how long a mark stays with no cleaning gift; 0 turns it off.
  mark_hours: { group: 'Profil izleri', field: 'markHours', label: 'Profil izi süresi (saat)', default: MARK_HOURS, bounds: { min: 0, max: 168, step: 1 }, unit: ' saat', help: 'Kaka gibi iz bırakan bir hediyenin izi alıcının profil fotoğrafında bu kadar saat kalır (izi temizleyen hediye gelirse daha önce gider). Hediyenin kendi süresi varsa o geçer. Konmuş izlerin bitişi değişmez. 0: profil izleri kapalı; bu hediyeler düz hediye olur ve hiçbir iz görünmez.', text: (a, b) => (b === '0' ? 'Profil izleri kapanır: hediyeler düz hediye olur, izler görünmez.' : `Yeni izler ${a} → ${b} saat kalır.`) },
};
/**
 * Aile's game (family-more.mjs, family-rules.mjs): each daily task's points (and the room task's minutes, the coin
 * tasks' coins per step), each weekly chest's goal and reward coins (ödül jetonu, spent in Çarşı), the least a member
 * must give to open one, and the family level each theme opens at. Built from family-rules.mjs, so the defaults stay
 * today's. A change counts from the next read: today's progress is counted again with it.
 */
const FAMILY_TASK_NAME = {
  'k-chat': 'Aile sohbetine mesaj',
  'k-room': 'Aile odasında kalma',
  'k-newbie': 'Yeni üyeye hediye',
  'k-checkin': 'Aile yoklaması',
  'k-roomgift': 'Aile odasında hediye',
  'k-cp': 'Çift hediyesi',
  'k-chatgift': 'Aile sohbetinde hediye',
};
const FAMILY_THEME_NAME = { gece: 'Gece Moru', ates: 'Kızıl Ay', orman: 'Zümrüt Orman', okyanus: 'Gece Mavisi', altin: 'Altın Saray', galaksi: 'Galaksi' };
const keyOfTask = (id) => id.slice(2).replace('-', '_');
const FAMILY_AMOUNTS = {
  ...Object.fromEntries(
    FAMILY_TASKS.flatMap((t) => {
      const name = FAMILY_TASK_NAME[t.id] ?? t.id;
      const k = keyOfTask(t.id);
      const out = [[`family_task_${k}_power`, { group: 'Aile görevleri', field: `familyTask_${k}_power`, task: t.id, part: 'power', label: `${name}: puan`, default: t.power, bounds: { min: 0, max: 100, step: 1 }, unit: ' puan', help: t.kind === 'count' ? `“${name}” görevi bitince verilen puan. 0: puan vermez.` : `“${name}” görevinde her adımda verilen puan. 0: puan vermez.`, text: (a, b) => `${name}: ${a} → ${b} puan.` }]];
      if (t.kind === 'rate') out.push([`family_task_${k}_per`, { group: 'Aile görevleri', field: `familyTask_${k}_per`, task: t.id, part: 'per', label: `${name}: kaç jetonda bir`, default: t.per, bounds: { min: 10, max: 1_000_000, step: 10 }, unit: ' jeton', help: `“${name}” görevinde her bu kadar jeton bir adım sayılır.`, text: (a, b) => `${name}: her ${a} → ${b} jetonda bir puan.` }]);
      else if (t.goal > 1) out.push([`family_task_${k}_goal`, { group: 'Aile görevleri', field: `familyTask_${k}_goal`, task: t.id, part: 'goal', label: `${name}: hedef (dakika)`, default: t.goal, bounds: { min: 1, max: 600, step: 1 }, unit: ' dakika', help: `“${name}” görevi bu kadar dakikada biter.`, text: (a, b) => `${name}: ${a} → ${b} dakika.` }]);
      return out;
    }),
  ),
  ...Object.fromEntries(
    FAMILY_CHESTS.flatMap((c) => [
      [`family_chest_${c.id}_need`, { group: 'Aile sandıkları', field: `familyChest_${c.id}_need`, chest: c.id, part: 'need', label: `${c.name}: haftalık hedef`, default: c.need, bounds: { min: 1_000, max: 100_000_000, step: 1_000 }, unit: ' güç', help: `Ailenin haftalık gücü bu kadar olunca ${c.name} açılır.`, text: (a, b) => `${c.name} ${a} → ${b} güçte açılır.` }],
      [`family_chest_${c.id}_coins`, { group: 'Aile sandıkları', field: `familyChest_${c.id}_coins`, chest: c.id, part: 'coins', label: `${c.name}: ödül jetonu`, default: c.coins, bounds: { min: 1, max: 1_000, step: 1, money: true }, unit: ' ödül jetonu', help: `${c.name}'nı açan her üyeye verilen ödül jetonu (Çarşı'da harcanır, çekilemez). Haftada bir kez.`, text: (a, b) => `${c.name}: üye başına ${a} → ${b} ödül jetonu.` }],
    ]),
  ),
  family_chest_min_contribution: { group: 'Aile sandıkları', field: 'familyChestMin', label: 'Sandık için en az katkı', default: CHEST_MIN_CONTRIBUTION, bounds: { min: 0, max: 1_000_000, step: 1 }, unit: '', help: 'Bir üyenin sandık açabilmesi için o hafta aileye verdiği en az katkı (hediye jetonu + görev puanı). 0: katkısız da açar.', text: (a, b) => `Sandık için en az katkı ${a} → ${b}.` },
  ...Object.fromEntries(
    FAMILY_THEMES.map((t) => [`family_theme_${t.id}_level`, { group: 'Aile', field: `familyTheme_${t.id}`, theme: t.id, label: `${FAMILY_THEME_NAME[t.id] ?? t.id} teması: aile seviyesi`, default: t.minLevel, bounds: { min: 1, max: 15, step: 1 }, unit: '', help: `${FAMILY_THEME_NAME[t.id] ?? t.id} teması bu aile seviyesinden itibaren seçilir. Seçilmiş tema kalır.`, text: (a, b) => `${FAMILY_THEME_NAME[t.id] ?? t.id} teması Lv.${a} → Lv.${b} ailede açılır.` }]),
  ),
};
/** Aile's tasks, chests and themes as Canlı ayarlar has them (snapshot `s`), in family-rules.mjs's shapes. */
export function familyRulesOf(s) {
  const v = (field, d) => (Number.isSafeInteger(s?.[field]) ? s[field] : d);
  return {
    tasks: FAMILY_TASKS.map((t) => {
      const k = keyOfTask(t.id);
      return { ...t, power: v(`familyTask_${k}_power`, t.power), per: t.kind === 'rate' ? v(`familyTask_${k}_per`, t.per) : t.per, goal: t.kind === 'count' ? v(`familyTask_${k}_goal`, t.goal) : t.goal };
    }),
    chests: FAMILY_CHESTS.map((c) => ({ ...c, need: v(`familyChest_${c.id}_need`, c.need), coins: v(`familyChest_${c.id}_coins`, c.coins) })),
    chestMin: v('familyChestMin', CHEST_MIN_CONTRIBUTION),
    themes: FAMILY_THEMES.map((t) => ({ ...t, minLevel: v(`familyTheme_${t.id}`, t.minLevel) })),
  };
}

/**
 * Oda seviyeleri (room-rules.mjs, rooms.mjs): the level Mikrofon izni and Patron koltuğu open at, the room's own
 * forbidden words, and how many people a room of each level may hold. One busy 200-person room fills one core
 * (docs/YUK_TESTI.md): the caps stay within today's largest (5.000).
 */
const ROOM_CAPS_DEFAULT = [50, 100, 200, 300, 500, 600, 800, 1_200, 1_350, 1_500, 1_750, 2_000, 2_500, 3_000, 5_000];
const LEVELS_GROUP = 'Oda seviyeleri';
const ROOM_LEVEL_AMOUNTS = {
  room_mic_min_level: { group: LEVELS_GROUP, field: 'roomMicMinLevel', label: 'Mikrofon izni: oda seviyesi', default: 4, bounds: { min: 1, max: 15, step: 1 }, unit: '', help: 'Oda sahibi "Mikrofonu yalnız üyeler alsın" ayarını bu oda seviyesinden itibaren açabilir. Açılmış ayar kalır.', text: (a, b) => `Mikrofon izni Lv.${a} → Lv.${b} odada açılır.` },
  room_boss_min_level: { group: LEVELS_GROUP, field: 'roomBossMinLevel', label: 'Patron koltuğu: oda seviyesi', default: 3, bounds: { min: 1, max: 15, step: 1 }, unit: '', help: 'Patron koltuğu bu oda seviyesinden itibaren açılır ve çalışır.', text: (a, b) => `Patron koltuğu Lv.${a} → Lv.${b} odada açılır.` },
  room_words_max: { group: LEVELS_GROUP, field: 'roomWordsMax', label: 'Odanın yasaklı kelimeleri: en fazla', default: 30, bounds: { min: 5, max: 100, step: 1 }, unit: ' kelime', help: 'Bir odanın kendi yasaklı kelime listesine eklenebilecek en çok kelime.', text: (a, b) => `Oda başına yasaklı kelime ${a} → ${b}.` },
  ...Object.fromEntries(
    ROOM_CAPS_DEFAULT.map((n, i) => [
      `room_cap_lv${i + 1}`,
      { group: LEVELS_GROUP, field: `roomCapLv${i + 1}`, label: `Lv.${i + 1} oda: en fazla kişi`, default: n, bounds: { min: 10, max: 5_000, step: 10 }, unit: ' kişi', help: `Lv.${i + 1} bir odaya aynı anda girebilecek ve üye olabilecek en çok kişi. Tek sunucu yoğun bir 200 kişilik odayı taşır; yüksek sayılar sunucuyu büyütmeyi gerektirir.`, text: (a, b) => `Lv.${i + 1} oda ${a} → ${b} kişi alır.` },
    ]),
  ),
};
/** The rooms' numbers as Canlı ayarlar has them (snapshot `s`). */
export function roomNumbersOf(s) {
  const v = (field, d) => (Number.isSafeInteger(s?.[field]) ? s[field] : d);
  return {
    micMinLevel: v('roomMicMinLevel', 4),
    bossMinLevel: v('roomBossMinLevel', 3),
    wordsMax: v('roomWordsMax', 30),
    caps: ROOM_CAPS_DEFAULT.map((n, i) => v(`roomCapLv${i + 1}`, n)),
  };
}
// Ajans statüsü (aday / aktif ajans, the monthly penalty, the inactive days) left Canlı ayarlar on 24 Nov 2026: the
// weekly levels replaced the first two (agency-levels.mjs) and the owners fixed the inactive days at 60
// (agency-activity.mjs). A stored value of those keys is ignored.

/** Vitrin (profiles.mjs): what earns a medal or a title. Earned ones come and go with the rule. */
const BADGES = 'Profil rozetleri';
const BADGE_AMOUNTS = {
  medal_week_top: { group: BADGES, field: 'medalWeekTop', label: 'Haftanın Yıldızı: haftanın ilk kaçı', default: MEDAL_RULES.weekTop, bounds: { min: 1, max: 50, step: 1 }, unit: ' kişi', help: 'Bu haftanın Yankı sıralamasında ilk bu kadar kişi Haftanın Yıldızı madalyası alır.', text: (a, b) => `Haftanın Yıldızı: ilk ${a} → ${b} kişi.` },
  medal_generous_people: { group: BADGES, field: 'medalGenerousPeople', label: 'Cömert Kalp: farklı kişiye hediye', default: MEDAL_RULES.generousPeople, bounds: { min: 1, max: 1_000, step: 1 }, unit: ' kişi', help: 'Bu kadar farklı kişiye hediye gönderen Cömert Kalp madalyası alır.', text: (a, b) => `Cömert Kalp: ${a} → ${b} farklı kişi.` },
  medal_friends: { group: BADGES, field: 'medalFriends', label: 'Sosyal Kelebek: arkadaş sayısı', default: MEDAL_RULES.friends, bounds: { min: 1, max: 10_000, step: 1 }, unit: ' arkadaş', help: 'Karşılıklı takipleştiği bu kadar kişisi olan Sosyal Kelebek madalyası alır.', text: (a, b) => `Sosyal Kelebek: ${a} → ${b} arkadaş.` },
  title_room_level: { group: BADGES, field: 'titleRoomLevel', label: 'Oda Efsanesi: oda seviyesi', default: TITLE_RULES.roomLevel, bounds: { min: 1, max: 15, step: 1 }, unit: '', help: 'Odası bu seviyeye ulaşan Oda Efsanesi unvanını alır.', text: (a, b) => `Oda Efsanesi: Lv.${a} → Lv.${b} oda.` },
  title_rising_charm: { group: BADGES, field: 'titleRisingCharm', label: 'Yükselen Yıldız: Yankı seviyesi', default: TITLE_RULES.risingCharm, bounds: { min: 1, max: 50, step: 1 }, unit: '', help: 'Katıldıktan sonraki günlerde bu Yankı seviyesine ulaşan Yükselen Yıldız unvanını alır.', text: (a, b) => `Yükselen Yıldız: Yankı Lv.${a} → Lv.${b}.` },
  title_rising_days: { group: BADGES, field: 'titleRisingDays', label: 'Yükselen Yıldız: katıldıktan sonra gün', default: TITLE_RULES.risingDays, bounds: { min: 1, max: 365, step: 1 }, unit: ' gün', help: 'Yükselen Yıldız unvanı katıldıktan sonra bu kadar gün içinde kazanılır.', text: (a, b) => `Yükselen Yıldız: ilk ${a} → ${b} gün.` },
};

/** The room keys as registry entries (`text` gets both values written out, "1.000", so a 0 is '0'); a coin amount that more than doubles or halves, or a close sooner than 3 minutes, asks twice. */
const roomEntries = (table = ROOM_AMOUNTS) =>
  Object.fromEntries(
    Object.entries(table).map(([k, x]) => [
      k,
      {
        field: x.field,
        group: x.group ?? ROOMS,
        label: x.label,
        help: x.help,
        type: 'int',
        bounds: x.bounds,
        parse: (v) => wholeOf(v, x.bounds, x.label, x.unit),
        big: (before, after) => after !== null && ((!!x.bounds.money && (after > before * 2 || after * 2 < before)) || (x.bounds.big !== undefined && after < x.bounds.big)),
        impact: (before, after) => x.text(fmt(before), fmt(after)),
      },
    ]),
  );

/**
 * Kazanç duyurusu (lucky.mjs, live-line.mjs lineWin): from how many coins a Şanslı win is announced to everyone with
 * the app open (the banner on top of every room). 0: every win; a floor keeps a busy evening's small wins from
 * crowding the banner.
 */
const WINS = 'Kazanç duyurusu';
const winEntries = () => {
  const bounds = { min: 0, max: 10_000_000, step: 10 };
  return {
    lucky_announce_min_coins: {
      field: 'luckyAnnounceMinCoins',
      group: WINS,
      label: 'Şanslı kazancı: en az',
      help: 'Şanslı hediyeden en az bu kadar jeton kazanılınca bütün odalarda üstte bir bantla herkese duyurulur (adını gizleyen "Bir kullanıcı" olarak görünür). 0: her kazanç duyurulur.',
      type: 'int',
      bounds,
      parse: (v) => wholeOf(v, bounds, 'Şanslı kazancı duyurusu', ' jeton'),
      big: () => false,
      impact: (before, after) =>
        after === 0 ? 'Şanslı hediyede her kazanç bütün odalarda duyurulur.' : `Şanslı hediyede ${fmt(after)} jeton ve üstü kazançlar bütün odalarda duyurulur (şu an: ${before === 0 ? 'her kazanç' : `${fmt(before)} jeton ve üstü`}).`,
    },
  };
};

/**
 * Şanslı çanta (lucky-bags.mjs, lucky-bag-rules.mjs BAG_RULES): the choices a bag offers, as a list the panel writes
 * as "1000, 5000, 10000". Every phone reads them from the server (GET /api/lucky-bags), older apps too. The coins stay
 * within today's largest (50.000): bags are given away by chance, a bigger one is the owners' decision.
 */
const BAGS = 'Şanslı çanta';
const BAG_LISTS = {
  lucky_bag_coins: { field: 'luckyBagCoins', label: 'Jeton çantası: jeton seçenekleri', default: [1_000, 5_000, 10_000, 50_000], bounds: { min: 100, max: 50_000, step: 100, items: 6 }, unit: ' jeton', help: 'Jeton çantasına konabilecek miktarlar, virgülle: 1000, 5000, 10000, 50000. En çok 6 seçenek, her biri 100 ile 50.000 arasında ve 100’ün katı.' },
  lucky_bag_coin_packets: { field: 'luckyBagCoinPackets', label: 'Jeton çantası: pay seçenekleri', default: [5, 10, 20, 30], bounds: { min: 1, max: 100, step: 1, items: 6 }, unit: ' pay', help: 'Jeton çantasının kaç paya bölüneceği, virgülle: 5, 10, 20, 30. En küçük jeton seçeneğinden fazla olamaz.' },
  lucky_bag_gift_counts: { field: 'luckyBagGiftCounts', label: 'Hediye çantası: adet seçenekleri', default: [10, 30, 99], bounds: { min: 1, max: 999, step: 1, items: 6 }, unit: ' adet', help: 'Hediye çantasına konabilecek hediye adetleri, virgülle: 10, 30, 99.' },
  lucky_bag_gift_packets: { field: 'luckyBagGiftPackets', label: 'Hediye çantası: pay seçenekleri', default: [5, 10, 15], bounds: { min: 1, max: 100, step: 1, items: 6 }, unit: ' pay', help: 'Hediye çantasının kaç paya bölüneceği, virgülle: 5, 10, 15. En küçük adet seçeneğinden fazla olamaz.' },
  lucky_bag_delays: { field: 'luckyBagDelays', label: 'Açılma zamanı seçenekleri (saniye)', default: [0, 120, 300], bounds: { min: 0, max: 3_600, step: 1, items: 6 }, unit: ' saniye', help: 'Çantanın atıldıktan kaç saniye sonra açılacağı, virgülle: 0, 120, 300. 0: hemen.' },
};
/** "1000, 5.000 ,10000" (or a list of numbers) → [1000, 5000, 10000], sorted, each checked; refuses anything else. */
function intListOf(v, { min, max, step, items }, what, unit) {
  const parts = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter(Boolean).map((x) => (/^\d{1,3}(\.\d{3})*$|^\d+$/.test(x) ? Number(x.replaceAll('.', '')) : NaN)) : null;
  if (!parts || !parts.length) bad(`${what}: en az bir sayı yaz, virgülle ayır`);
  if (parts.length > items) bad(`${what}: en çok ${items} seçenek olabilir`);
  const out = [...new Set(parts.map((x) => wholeOf(x, { min, max, step }, what, unit)))].sort((a, b) => a - b);
  return out;
}
const listText = (xs) => xs.map(fmt).join(', ');
const bagEntries = () =>
  Object.fromEntries(
    Object.entries(BAG_LISTS).map(([k, x]) => [
      k,
      {
        field: x.field,
        group: BAGS,
        label: x.label,
        help: x.help,
        type: 'text',
        bounds: { max: 80 },
        parse: (v) => listText(intListOf(v, x.bounds, x.label, x.unit)).replaceAll('.', ''),
        big: () => false,
        impact: (before, after) => `${x.label}: ${listText(bagList(before))} → ${listText(bagList(after))}.`,
      },
    ]),
  );
/** A stored list setting ("1000, 5000") as numbers; the default list for anything unreadable. */
export const bagList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',').map((x) => Number(x.trim())).filter((n) => Number.isSafeInteger(n)));

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
/** TL per 1.000 coins: 1,00–5.000,00 with at most two decimals. */
function tlPer1000Of(v, what) {
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(`${what} bir sayı olmalı`);
  if (Math.abs(cents(v) - v * 100) > 1e-6) bad(`${what} en çok 2 ondalık basamaklı olabilir`);
  const r = cents(v) / 100;
  if (r < 1 || r > 5000) bad(`${what} 1,00 ile 5.000,00 TL arasında olmalı`);
  return r;
}
/** A TL-per-1.000 setting moves at most 50 % in one save (a slipped digit is a tenfold price). */
function stepCheck(before, after, what) {
  const b = cents(before);
  if (Math.abs(cents(after) - b) * 2 <= b) return;
  bad(`${what} bir kayıtta en çok %50 değişebilir: şimdi ${rateText(before)} TL, yeni değer ${rateText(Math.ceil(b / 2) / 100)}–${rateText(Math.floor((b * 3) / 2) / 100)} TL arasında olmalı`);
}
const pctText = (x) => `${x >= 0 ? '+' : '-'}%${Math.abs(x).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
const when = (iso) => new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const some = (xs) => (xs.length > 6 ? `${xs.slice(0, 6).join(', ')} ve ${xs.length - 6} tane daha` : xs.join(', '));
const giftName = (id) => GIFTS.get(id)?.name ?? id;
const shopName = (sku) => SHOP.get(sku)?.name ?? sku;
const packName = (id) => `${fmt(PACKS.find((p) => p.id === id)?.coins ?? 0)} jeton`;
/**
 * A stored pack setup against today's packs: entries of packs no longer sold are dropped, a pack it doesn't name joins
 * with no extra coins and its compiled first-purchase gift, and the places run 1… in the stored order (new packs by
 * size after the others), so a setup saved before the packs changed still reads.
 */
function storedPackSetup(v) {
  const kept = PACKS.map((p, i) => ({ id: p.id, i, x: v[p.id] && typeof v[p.id] === 'object' ? v[p.id] : null }));
  const rank = (e) => (e.x && Number.isFinite(Number(e.x.order)) ? Number(e.x.order) : 1_000 + e.i);
  kept.sort((a, b) => rank(a) - rank(b) || a.i - b.i);
  return Object.fromEntries(kept.map((e, k) => [e.id, { extra: e.x?.extra ?? 0, first: e.x ? (e.x.first ?? null) : null, order: k + 1 }]));
}
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

/**
 * Otomatik mesaj (auto-chat.mjs, message-holds.mjs, system-notices.mjs): the switches, the numbers, the texts (one
 * message per line) and SimilarClub Sistem's categories. A change of the reply window more than doubles or halves asks
 * twice: it decides who gets a paid message's coins.
 */
const AUTO = 'Otomatik mesaj';
const NOTICES = 'SimilarClub Sistem';
const autoEntries = () => {
  const parts = { options: AUTO_PARTS, labels: AUTO_PART_LABEL, max: AUTO_PARTS.length };
  const cats = { options: NOTICE_CATEGORIES, labels: NOTICE_LABEL, max: NOTICE_CATEGORIES.length };
  return {
    auto_chat_off: {
      field: 'autoChatOff',
      group: AUTO,
      label: 'Kapalı bölümler',
      help: 'Kapatılan bölüm sunucuda hemen durur. Gönderilmiş mesajlar kalır; cevap bekleyen ücretli mesajların süresi işler.',
      type: 'set',
      bounds: parts,
      parse: (v) => setOf(v, parts, 'Kapalı bölümler'),
      big: () => false,
      impact(before, after) {
        const out = added(before, after).map((k) => AUTO_PART_OFF[k]);
        const on = added(after, before);
        if (on.length) out.push(`Yeniden açılır: ${on.map((k) => AUTO_PART_LABEL[k]).join(', ')}.`);
        return out.join(' ') || 'Görünür bir etkisi yok.';
      },
    },
    ...Object.fromEntries(
      Object.entries(AUTO_CHAT).map(([k, x]) => [
        k,
        {
          field: x.field,
          group: AUTO,
          label: x.label,
          help: x.help,
          type: 'int',
          bounds: x.bounds,
          parse: (v) => wholeOf(v, x.bounds, x.label, x.unit),
          big: (before, after) => after !== null && !!x.bounds.money && (after === 0 || before === 0 || after > before * 2 || after * 2 < before),
          impact: (before, after) => x.text(fmt(before), fmt(after)),
        },
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(AUTO_TEXTS).map(([k, x]) => [
        k,
        {
          field: x.field,
          group: AUTO,
          label: x.label,
          help: x.help,
          type: 'text',
          bounds: { max: 4000 },
          parse(v) {
            if (typeof v !== 'string') bad(`${x.label} metin olmalı`);
            if (v.length > 4000) bad(`${x.label} en çok 4.000 karakter olabilir`);
            if (CONTROL.test(v)) bad(`${x.label}: satır sonu dışında özel karakter olamaz`);
            const lines = linesOf(v, 1000);
            if (!lines.length) bad(`${x.label}: en az bir satır gerekli`);
            if (lines.length > x.lines) bad(`${x.label}: en çok ${x.lines} satır olabilir`);
            if (lines.some((l) => l.length > 300)) bad(`${x.label}: bir satır en çok 300 karakter olabilir`);
            return lines.join('\n');
          },
          big: () => false,
          impact: (before, after) => `${linesOf(after).length} satır: “${linesOf(after)[0] ?? ''}”${linesOf(after).length > 1 ? ' …' : ''}`,
        },
      ]),
    ),
    system_notices_off: {
      field: 'systemNoticesOff',
      group: NOTICES,
      label: 'Kapalı bildirimler',
      help: 'SimilarClub Sistem sohbetine (eski uygulamada Similar Ekibi) gitmeyecek bildirim türleri. Para ve ödül işlemleri bildirimden bağımsız yapılır.',
      type: 'set',
      bounds: cats,
      parse: (v) => setOf(v, cats, 'Kapalı bildirimler'),
      big: () => false,
      impact(before, after) {
        const off = added(before, after);
        const on = added(after, before);
        const out = [];
        if (off.length) out.push(`Gitmez: ${off.map((k) => NOTICE_LABEL[k]).join(', ')}.`);
        if (on.length) out.push(`Yeniden gider: ${on.map((k) => NOTICE_LABEL[k]).join(', ')}.`);
        return out.join(' ') || 'Görünür bir etkisi yok.';
      },
    },
  };
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
        `%${after.percent} kampanya "${after.label}": 50.000 jetonluk paket alan +${fmt(campaignBonus(50_000, after, after.startsAt))} kampanya jetonu alır.`,
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
    parse(v, ctx = {}) {
      // A stored list from before the packs changed (24 Nov 2026) may name a retired pack: it is no longer sold anyway.
      if (ctx.stored && Array.isArray(v)) v = v.filter((id) => PACKS.some((p) => p.id === id));
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
  pack_setup: {
    field: 'packSetup',
    group: 'Hediyeler ve paketler',
    label: 'Jeton paketleri',
    help: 'Her paketin ek jetonu (her alımda paketin üstüne), ilk alım hediyesi ve listedeki sırası. Paketin kendi jetonu ve fiyatı Google Play ürününe bağlıdır, buradan değişmez. Ek jeton ve hediye ayrı tutulur; satın alma iade edilirse geri alınır. Eski uygulamalar ek jetonu göstermez ama verilir.',
    type: 'packs',
    bounds: { packs: PACKS.map((p) => ({ id: p.id, coins: p.coins, firstBonus: p.firstBonus, tl: p.tl, label: packName(p.id) })), maxShare: 1, bigShare: 0.5 },
    parse(v, ctx = {}) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) bad('Paket ayarı eksik');
      // A setup saved before the packs changed (24 Nov 2026): the retired packs drop out, the new ones take the next
      // places with no extra coins, and the order closes up, so the panel's extra coins and gifts are kept.
      if (ctx.stored) v = storedPackSetup(v);
      const out = {};
      const orders = new Set();
      for (const [id, x] of Object.entries(v)) {
        const p = PACKS.find((q) => q.id === id);
        if (!p) bad(`Bilinmeyen paket: ${String(id).slice(0, 20)}`);
        if (!x || typeof x !== 'object' || Array.isArray(x)) bad(`${packName(id)}: ayar eksik`);
        const extra = wholeOf(x.extra ?? 0, { min: 0, max: p.coins, step: 1 }, `${packName(id)} ek jetonu`);
        const first = x.first === null || x.first === undefined ? null : wholeOf(x.first, { min: 0, max: p.coins, step: 1 }, `${packName(id)} ilk alım hediyesi`);
        const order = wholeOf(x.order, { min: 1, max: PACKS.length, step: 1 }, `${packName(id)} sırası`);
        if (orders.has(order)) bad(`İki paket aynı sırada olamaz (${order})`);
        orders.add(order);
        out[id] = { extra, first, order };
      }
      if (Object.keys(out).length !== PACKS.length) bad('Her paketin ayarı gönderilmeli');
      return out;
    },
    big: (before, after) => !!after && Object.entries(after).some(([id, x]) => x.extra > PACKS.find((p) => p.id === id).coins * REGISTRY.pack_setup.bounds.bigShare),
    impact(before, after) {
      if (!after) return 'Paketler uygulamanın kendi değerlerine döner: ek jeton yok, ilk alım hediyeleri ve sıra varsayılan.';
      const lines = packsSetUp(after).map((p) => `${packName(p.id)}${p.extra ? ` +${fmt(p.extra)} ek` : ''}${p.firstBonus ? ` (ilk alımda +${fmt(p.firstBonus)})` : ''}`);
      return `Sıra: ${lines.join(', ')}. Ödemesi alınmış ama henüz yüklenmemiş satın almalar yüklenirken yeni ek jetonu alır.`;
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
  coin_value_tl: {
    field: 'coinValueTl',
    group: 'Jeton değeri',
    label: '1.000 jeton = ? TL',
    help: 'Jetonun TL değeri: paketlerin liste fiyatı (1.000 jeton bu kadar TL), Çevir (elmas → jeton) ve Jeton Noktası bozdurma hesapları buradan. Kullanıcının ödediği fiyatı Google Play belirler: Play Console’daki paket fiyatlarını aynı gün bu değere göre güncelle. 1,00–5.000,00 TL; bir kayıtta en çok %50 değişir.',
    type: 'number',
    bounds: { min: 1, max: 5000, decimals: 2, maxStepPct: 50, bigStepPct: 5 },
    parse: (v) => tlPer1000Of(v, 'Jeton değeri'),
    change: (before, after) => stepCheck(before, after, 'Jeton değeri'),
    big: (before, after) => after !== null && Math.abs(cents(after) - cents(before)) * 100 > cents(before) * REGISTRY.coin_value_tl.bounds.bigStepPct,
    impact(before, after, ctx) {
      const usdTry = ctx.next?.usdTry ?? EXCHANGE.usdTry;
      return [
        `1.000 jeton ${rateText(before)} → ${rateText(after)} TL (${pctText(((after - before) / before) * 100)}); 50.000 jetonluk paket ${rateText(tlOfCoins(50_000, before))} → ${rateText(tlOfCoins(50_000, after))} TL.`,
        `Çevir: 10.000 💎 = ${fmt(exchangeCoins(10_000, usdTry, before))} → ${fmt(exchangeCoins(10_000, usdTry, after))} jeton.`,
        'Play Console’daki paket fiyatlarını da güncelle. Eski uygulamalar Çevir’de "uygulamayı güncelle" uyarısı alır.',
      ].join(' ');
    },
  },
  jeton_wholesale_tl: {
    field: 'wholesaleTl',
    group: 'Jeton Noktası',
    label: 'Toptan: 1.000 jeton = ? TL',
    help: 'Jeton Noktası’nın yönetimden jeton alırken ödediği fiyat; Yönetim jeton yükleme ve jeton üretimi bu orandan başlar (o işlemde elle değiştirilebilir). Yapılmış satışlar değişmez. 1,00–5.000,00 TL; bir kayıtta en çok %50 değişir.',
    type: 'number',
    bounds: { min: 1, max: 5000, decimals: 2, maxStepPct: 50, bigStepPct: 5 },
    parse: (v) => tlPer1000Of(v, 'Toptan fiyat'),
    change: (before, after) => stepCheck(before, after, 'Toptan fiyat'),
    big: (before, after) => after !== null && Math.abs(cents(after) - cents(before)) * 100 > cents(before) * REGISTRY.jeton_wholesale_tl.bounds.bigStepPct,
    impact: (before, after) =>
      `1.000 jeton toptan ${rateText(before)} → ${rateText(after)} TL (${pctText(((after - before) / before) * 100)}); 100.000 jeton ${rateText(wholesaleTl(100_000, before))} → ${rateText(wholesaleTl(100_000, after))} TL. Yapılmış satışlar değişmez.`,
  },
  host_weekly_bonus: {
    field: 'hostBonus',
    group: 'Ödemeler',
    label: 'Yayıncı haftalık bonusu',
    help: 'Ajansa bağlı yayıncı, haftada (Pazartesi 00:00 – Pazar 23:59:59, Türkiye saati) kazandığı elmasa göre ulaştığı baremin bonusunu alır; bir sonraki baremi tamamlayamayan bulunduğu baremin bonusunu alır. Her Pazartesi 00:00’da biten hafta için elmas olarak yüklenir, SimilarClub Sistem’den bildirilir; ajansa komisyon doğurmaz. Kapatılırsa o hafta ödenmez. Barem: "şu kadar elmastan itibaren, şu kadar bonus"; en üst baremin üstü en üst baremin bonusunu alır.',
    type: 'tiers',
    bounds: { maxTiers: 30, max: 1_000_000_000 },
    parse(v) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) bad('Bonus ayarı eksik');
      if (typeof v.on !== 'boolean') bad('Bonus: açık / kapalı seçimi geçersiz');
      if (!Array.isArray(v.tiers) || v.tiers.length < 1 || v.tiers.length > 30) bad('Bonus: 1–30 barem olmalı');
      let last = 0;
      let lastBonus = 0;
      const tiers = v.tiers.map((t, i) => {
        const from = t && Number.isSafeInteger(t.from) && t.from >= 1 && t.from <= 1_000_000_000 ? t.from : null;
        const bonus = t && Number.isSafeInteger(t.bonus) && t.bonus >= 0 && t.bonus <= 1_000_000_000 ? t.bonus : null;
        if (from === null || bonus === null) bad(`Bonus ${i + 1}. barem: elmas ve bonus tam sayı olmalı (1 elmastan itibaren)`);
        if (from <= last) bad(`Bonus baremleri küçükten büyüğe ve her biri bir öncekinden büyük olmalı (${i + 1}. barem)`);
        if (bonus < lastBonus) bad(`Bonus ${i + 1}. barem: bonus bir öncekinden az olamaz`);
        last = from;
        lastBonus = bonus;
        return Object.freeze({ from, bonus });
      });
      return Object.freeze({ on: v.on, tiers: Object.freeze(tiers) });
    },
    big: (before, after) => !!after && (after.on !== before.on || JSON.stringify(after.tiers) !== JSON.stringify(before.tiers)),
    impact(before, after) {
      if (!after.on) return 'Yayıncı haftalık bonusu kapanır: kapalıyken biten haftalar için bonus ödenmez.';
      const t = after.tiers;
      return `${t.length} barem: ${fmt(t[0].from)} elmastan ${fmt(t[0].bonus)} bonus … ${fmt(t.at(-1).from)} elmas ve üstü ${fmt(t.at(-1).bonus)} bonus. Değişiklik bir sonraki hafta kapanışında (Pazartesi 00:00) ödenen bonuslarda geçerli; ödenmiş bonuslar değişmez.`;
    },
  },
  diamonds_per_usd: {
    field: 'diamondsPerUsd',
    group: 'Ödemeler',
    label: 'Elmas değeri: 1 USD = ? elmas',
    help: 'Yayıncının elmasının değeri: para çekmede, ajans komisyonunun USD karşılığında, Jeton Noktası bozdurmasında ve Çevir\'de (elmas → jeton) kullanılır. Açık talepler oluşturuldukları andaki USD ile kalır. 100–100.000; bir kayıtta en çok %25 değişir.',
    type: 'int',
    bounds: { min: 100, max: 100_000, step: 1, maxStepPct: 25, bigStepPct: 5 },
    parse: (v) => wholeOf(v, REGISTRY.diamonds_per_usd.bounds, 'Elmas değeri', ' elmas'),
    change(before, after) {
      if (Math.abs(after - before) * 4 <= before) return;
      bad(`Elmas değeri bir kayıtta en çok %25 değişebilir: şimdi 1 USD = ${fmt(before)} elmas, yeni değer ${fmt(Math.ceil((before * 3) / 4))}–${fmt(Math.floor((before * 5) / 4))} arasında olmalı`);
    },
    big: (before, after) => after !== null && Math.abs(after - before) * 100 > before * REGISTRY.diamonds_per_usd.bounds.bigStepPct,
    impact: (before, after, ctx) => {
      const rate = ctx.next?.payoutUsdTry ?? PAYOUT_USD_TRY;
      const usd = (per) => Math.floor((1_000_000 / per) * 100) / 100;
      return `1.000.000 💎 = ${rateText(usd(before))} → ${rateText(usd(after))} USD (ödeme kuruyla ${rateText(payoutTl(usd(before), rate))} → ${rateText(payoutTl(usd(after), rate))} TL). Açık talepler kendi USD'leriyle kalır; eski uygulamalar USD tahminlerini eski değerle gösterir.`;
    },
  },
  payout_usd_try: {
    field: 'payoutUsdTry',
    group: 'Ödemeler',
    label: 'Ödeme kuru: 1 USD = ? TL',
    help: 'Yayıncılara ve ajanslara ödeme yaparken baz alınan kur: para çekme ve ajans ödemelerinde gönderilecek TL, Jeton Noktası bozdurmasında yayıncıya ödenecek TL bu kurla hesaplanır. Ödendi işaretlenen ödemeye o anki kur yazılır; sonradan değişmez. 30,00–100,00; bir kayıtta en çok %10 değişir.',
    type: 'number',
    bounds: { min: 30, max: 100, decimals: 2, maxStepPct: 10, bigStepPct: 3 },
    parse(v) {
      if (typeof v !== 'number' || !Number.isFinite(v)) bad('Ödeme kuru bir sayı olmalı');
      if (Math.abs(cents(v) - v * 100) > 1e-6) bad('Ödeme kuru en çok 2 ondalık basamaklı olabilir');
      const r = cents(v) / 100;
      if (r < 30 || r > 100) bad('Ödeme kuru 30,00 ile 100,00 arasında olmalı');
      return r;
    },
    change(before, after) {
      const b = cents(before);
      if (Math.abs(cents(after) - b) * 10 <= b) return;
      bad(`Ödeme kuru bir kayıtta en çok %10 değişebilir: şimdi ${rateText(before)}, yeni değer ${rateText(Math.ceil((b * 9) / 10) / 100)}–${rateText(Math.floor((b * 11) / 10) / 100)} arasında olmalı`);
    },
    big: (before, after) => after !== null && Math.abs(cents(after) - cents(before)) * 100 > cents(before) * REGISTRY.payout_usd_try.bounds.bigStepPct,
    impact: (before, after) =>
      `1 USD ${rateText(before)} → ${rateText(after)} TL (${pctText(((after - before) / before) * 100)}): 1.000 USD'lik ödeme ${rateText(payoutTl(1000, before))} → ${rateText(payoutTl(1000, after))} TL. Ödenmiş ödemeler değişmez.`,
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
    help: 'Bir haftada (Pazartesi 00:00 – Pazar 23:59:59, Türkiye saati) istenebilecek en çok elmas; her Pazartesi 00:00\'da yenilenir. Yalnız bugünkü değerden aşağı çekilebilir.',
    type: 'int',
    bounds: { min: WITHDRAW.minDiamonds, max: WITHDRAW.weeklyDiamonds, step: 10_000 },
    parse: (v) => wholeOf(v, REGISTRY.withdraw_weekly_diamonds.bounds, 'Haftalık sınır', ' elmas'),
    big: () => false,
    impact(before, after, ctx) {
      const max = ctx.next?.withdraw_max_diamonds;
      return `Haftada en çok ${fmt(before)} → ${fmt(after)} 💎 istenebilir. Bekleyen talepler etkilenmez.${after < max ? ' Tek talep sınırından düşük olduğu için tek talepte de en çok bu kadar istenebilir.' : ''}`;
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
    label: 'Günlük sınır (en yüksek bahisle tur, 0 = sınırsız)',
    help: 'Bir kişinin bir oyunda bir günde oynayabileceği jeton: oyunun en yüksek bahsiyle bu kadar tur. 0 (varsayılan): sınır yok. 40 ile Yörünge’de günde 1.000.000 jeton.',
    type: 'int',
    bounds: { min: 0, max: 200, step: 1, big: 80 },
    parse: (v) => wholeOf(v, REGISTRY.casino_daily_rounds.bounds, 'Günlük sınır'),
    big: (before, after) => after !== null && after > REGISTRY.casino_daily_rounds.bounds.big,
    impact: (before, after) => {
      const rounds = (n) => (n ? `en çok ${fmt(n)} tur (en yüksek bahisle; Yörünge’de ${fmt(n * CASINO_TOP)} jeton)` : 'sınırsız');
      return `Bir oyunda günde ${rounds(before)} → ${rounds(after)}.`;
    },
  },
  // Canlı Yörünge (rocket-live.mjs): unlike the other games' odds, its share can move, because the app shows no paytable
  // for it: the crash points of a round are drawn with the share the round opened with, and the "?" page reads it.
  rocket_house_pct: {
    field: 'rocketHousePct',
    group: 'Oyun Salonu',
    label: 'Canlı Yörünge: kasa payı (%)',
    help: 'Canlı Yörünge’de oynanan jetonun kasada kalan yüzdesi; gerisi kazananlara döner. 60 ile her 100 jetonun ortalama 40’ı geri döner ve roket turların yaklaşık %60’ında kalkmadan patlar. Düştükçe roket daha sık kalkar ve daha yükseğe çıkar. Yeni değer bir sonraki turdan başlar. Diğer oyunların payı %60’tır, bu ayar onları değiştirmez.',
    type: 'int',
    bounds: { min: 3, max: 90, step: 1 },
    parse: (v) => wholeOf(v, REGISTRY.rocket_house_pct.bounds, 'Canlı Yörünge kasa payı', ' (%)'),
    // Giving the players more back is confirmed twice.
    big: (before, after) => after !== null && after < before,
    impact: (before, after) =>
      before === after
        ? 'Görünür bir etkisi yok.'
        : `Canlı Yörünge’de kasa payı %${before} → %${after}: oyunculara ortalama %${100 - before} → %${100 - after} döner; roket her 100 turun yaklaşık ${before} → ${after} turunda kalkmadan patlar. Bir sonraki turdan başlar.`,
  },
  ...decorEntries(),
  ...roomEntries(),
  // Bağlar's level steps (bond-rules.mjs LEVELS), written as the panel shows them: "0, 10, 30, …".
  bond_levels: {
    field: 'bondLevels',
    group: 'Bağlar',
    label: 'Seviye basamakları (puan)',
    help: 'Lv1 … Lv20 için gereken bağ puanı, virgülle ve küçükten büyüğe: 20 sayı, ilki 0. Her 100 jeton 1 puan. Değişince herkesin seviyesi yeni basamaklarla hesaplanır; seviyesi değişene ilk hediyede bildirim gider.',
    type: 'text',
    bounds: { max: 300 },
    parse(v) {
      const xs = bondLevelsOf(v);
      if (!xs) bad('Seviye basamakları: 20 tam sayı yaz, virgülle; ilki 0 ve her biri öncekinden büyük olmalı');
      return xs.join(', ');
    },
    big: () => true,
    impact: (before, after) => `Lv2 ${fmt(bondLevelsOf(before)?.[1] ?? 0)} → ${fmt(bondLevelsOf(after)?.[1] ?? 0)}, Lv10 ${fmt(bondLevelsOf(before)?.[9] ?? 0)} → ${fmt(bondLevelsOf(after)?.[9] ?? 0)}, Lv20 ${fmt(bondLevelsOf(before)?.[19] ?? 0)} → ${fmt(bondLevelsOf(after)?.[19] ?? 0)} puan.`,
  },
  ...roomEntries(FAMILY_AMOUNTS),
  ...roomEntries(ROOM_LEVEL_AMOUNTS),
  ...roomEntries(BADGE_AMOUNTS),
  ...eventEntries(),
  ...winEntries(),
  ...roomEntries(GLOBAL_GIFT_AMOUNTS),
  ...bagEntries(),
  lucky_bag_seconds: {
    field: 'luckyBagSeconds',
    group: BAGS,
    label: 'Çantanın açık kaldığı süre (saniye)',
    help: 'Çanta açılınca bu kadar saniye düşer; o sırada dokunan herkes katılır ve çekiliş bitince yapılır. Atılmış çantalar kendi süresiyle biter.',
    type: 'int',
    bounds: { min: 10, max: 300, step: 5 },
    parse: (v) => wholeOf(v, { min: 10, max: 300, step: 5 }, 'Çantanın açık kaldığı süre', ' saniye'),
    big: () => false,
    impact: (before, after) => `Yeni çantalar açılınca ${fmt(before)} → ${fmt(after)} saniye açık kalır.`,
  },
  ...autoEntries(),
  admin_site: {
    field: 'adminSite',
    group: 'Yönetim',
    label: 'Yönetim sitesi',
    help: 'Doluyken (https://…) uygulamadaki Yönetim ekranı açılmaz, personel bu adresteki siteye gider; herkesin sitede hesabı olmalı. Varsayılanı kurulum yazar: Yönetim sayfaları olan finans panelinin adresi. Boş kaydedilirse Yönetim ekranı uygulamada yeniden açılır. Eski uygulamalarda ekran açık kalır.',
    type: 'text',
    bounds: { max: 200 },
    parse(v) {
      if (typeof v !== 'string') bad('Yönetim sitesi adresi metin olmalı');
      const s = v.trim();
      if (s && !SITE_RE.test(s)) bad('Yönetim sitesi https:// ile başlayan bir adres olmalı');
      if (s.length > 200) bad('Yönetim sitesi adresi en çok 200 karakter olabilir');
      return s;
    },
    // Closing the in-app screen asks twice, also by going back to a default that is a site; opening it again doesn't.
    big(before, after) {
      const to = after === null ? REGISTRY.admin_site.default : after;
      return !!to && !before;
    },
    impact(before, after) {
      if (after) return `Uygulamadaki Yönetim ekranı açılmaz, personel ${after} adresine gider. Eski uygulamalarda ekran açık kalır.`;
      return 'Yönetim ekranı uygulamada yeniden açılır.';
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
 *   { v, featuresOff: Set, notice, minVersion, adminSite, giftsHidden: Set, shopHidden: Set, packsHidden: Set, campaign, usdTry, withdrawMax,
 *     withdrawWeekly, otpPerHour, dmPrice, callVoice, callVideo, callFree, callSeconds, callPlainVoice, callPlainVideo,
 *     matchVoice, matchVideo, matchFree, matchSeconds, heartVoice,
 *     heartVideo, heartMsg, heartMsgDaily, heartGrace, heartHalf, backpackCallTask, rewardsOff: Set, welcomeCoins, inviteCoins, inviteDailyCap, casinoOff: Set, casinoOpen: Set, casinoMaxBet,
 *     casinoDailyRounds, rocketHousePct, roomDecorOff: Set, roomBgCustomPrice, roomBgCustomDays, roomStaffAwayMinutes, bossSeatCoins,
 *     bossSeatMinutes, eventMinRoomLevel, eventMinLead, eventMaxMinutes, eventMaxCapacity, eventGrace, eventStrikeLimit,
 *     eventBlockDays, eventRemindersOff: Set, luckyAnnounceMinCoins, globalGiftMinPrice, globalGiftGapSeconds, invalid }
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
    adminSite: val('admin_site') || null,
    giftsHidden: readOnlySet(val('gifts_hidden')),
    shopHidden: readOnlySet(val('shop_hidden')),
    packsHidden: readOnlySet(val('packs_hidden')),
    packSetup: val('pack_setup') && Object.freeze({ ...val('pack_setup') }),
    campaign: campaign && Object.freeze({ ...campaign }),
    usdTry: val('exchange_usd_try'),
    coinValueTl: val('coin_value_tl'),
    wholesaleTl: val('jeton_wholesale_tl'),
    payoutUsdTry: val('payout_usd_try'),
    diamondsPerUsd: val('diamonds_per_usd'),
    hostBonus: val('host_weekly_bonus'),
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
    rocketHousePct: val('rocket_house_pct'),
    roomDecorOff: readOnlySet(val('room_decor_off')),
    ...Object.fromEntries(Object.entries(DECOR_AMOUNTS).map(([k, x]) => [x.field, val(k)])),
    ...Object.fromEntries(Object.entries(ROOM_AMOUNTS).map(([k, x]) => [x.field, val(k)])),
    // As written ("0, 10, 30"); bonds.mjs reads it with bond-rules.mjs levelsOf.
    bondLevels: val('bond_levels'),
    ...Object.fromEntries(Object.entries(FAMILY_AMOUNTS).map(([k, x]) => [x.field, val(k)])),
    ...Object.fromEntries(Object.entries(ROOM_LEVEL_AMOUNTS).map(([k, x]) => [x.field, val(k)])),
    ...Object.fromEntries(Object.entries(BADGE_AMOUNTS).map(([k, x]) => [x.field, val(k)])),
    ...Object.fromEntries(Object.entries(EVENT_RULES).map(([k, x]) => [x.field, val(k)])),
    eventRemindersOff: readOnlySet(val('event_reminders_off')),
    luckyAnnounceMinCoins: val('lucky_announce_min_coins'),
    ...Object.fromEntries(Object.entries(GLOBAL_GIFT_AMOUNTS).map(([k, x]) => [x.field, val(k)])),
    // As written ("1000, 5000"), so the panel shows it so; lucky-bags.mjs reads it with bagList.
    ...Object.fromEntries(Object.entries(BAG_LISTS).map(([k, x]) => [x.field, val(k)])),
    luckyBagSeconds: val('lucky_bag_seconds'),
    autoChatOff: readOnlySet(val('auto_chat_off')),
    ...Object.fromEntries(Object.entries(AUTO_CHAT).map(([k, x]) => [x.field, val(k)])),
    ...Object.fromEntries(Object.entries(AUTO_TEXTS).map(([k, x]) => [x.field, val(k)])),
    systemNoticesOff: readOnlySet(val('system_notices_off')),
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
