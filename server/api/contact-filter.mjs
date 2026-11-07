// Contact filter for text other people see (owner rule: no phone numbers, IBANs or social media names and
// abbreviations in the app). A text that carries a phone number, an IBAN / bank account / card number, a
// payment app or crypto wallet, an e-mail address, a link, an @handle or a social media name is refused, never
// masked; the caller answers with a friendly message and keeps no copy of the text.
//
// The text is normalised first: NFKC (full-width, styled and circled letters and digits), invisible and
// combining characters removed, Cyrillic/Greek/small-capital look-alikes read as Latin, other scripts' digits
// read as 0-9, dot look-alikes ('。', '•', '{.}') read as dots, Turkish case and diacritics folded (İ/ı → i,
// ş → s …). Each detector then reads its own view: phone and IBAN a digit view (letters that look like digits
// inside a number read as digits, Turkish and English number words read as numbers, punctuation and joining
// words like 've' between the groups skipped), the word detectors a word view (leetspeak, spaced, dotted or
// underscored letters, repeated letters, one typo, Turkish suffixes).
// Ordinary text keeps working: prices and coin amounts, lists of amounts, gift counts, ages, years, times,
// dates, scores, room numbers and the in-app IDs (12-digit user ID, 8-digit room code, 7-digit Aile ID).
//
// Pure module (no Node or database imports) so the app can run the same rules before it sends.
//
//   checkText(text)                   → { ok: true } | { ok: false, category }
//   checkSequence(previous, current)  → same, for a number typed over several short messages
//   isNumberOnly(text)                → whether a message is only digits and number words
//   setRules(overrides), resetRules() → live settings over DEFAULT_RULES (lists and thresholds)

export const CONTACT_MESSAGE = 'Güvenliğin için telefon numarası, IBAN, e-posta, bağlantı veya sosyal medya hesabı paylaşılamaz.';

/** When a text holds several kinds of contact detail, the first one here is the one reported. */
export const CATEGORIES = ['phone', 'iban', 'payment', 'email', 'link', 'handle', 'social'];

/**
 * Lists and thresholds. Words are written as the normaliser leaves them: lowercase ASCII, ı → i, ş → s,
 * ç → c, ğ → g, ö → o, ü → u. In the context lists an entry starting with '=' must be the whole word;
 * the others match the start of a word.
 */
export const DEFAULT_RULES = {
  // Names of contact channels, by category. Matched at the start of a word, followed by nothing or a Turkish
  // suffix ('instadan', 'wp'den'), also spelled out ('i n s t a', 'w.p', 'i_n_s_t_a'), split ('insta gram'),
  // in leetspeak ('1nst4') and with repeated letters ('instaaa'). Words shorter than leetMinLength match only
  // as typed.
  words: {
    iban: ['iban'],
    payment: [
      'papara', 'ininal', 'tosla', 'paycell', 'payfix', 'paypal', 'enpara', 'westernunion',
      'binance', 'binans', 'btcturk', 'paribu', 'bybit', 'kucoin', 'usdt', 'metamask', 'trustwallet',
    ],
    email: ['gmail', 'hotmail', 'outlook', 'yandex', 'icloud', 'yahoo', 'protonmail', 'gmx', 'mailru', 'mail', 'email', 'eposta'],
    // Link shorteners and link pages, also typed without the dot ('t me ayse', 'x com ayse').
    link: ['linktree', 'tinyurl', 'shorturl', 'tme', 'wame', 'xcom'],
    social: [
      'instagram', 'insta', 'inst', 'ig',
      'whatsapp', 'whatsap', 'watsap', 'vatsap', 'vatsab', 'wp', 'wsp', 'wa',
      'telegram', 'tele', 'tg', 'tlg',
      'snapchat', 'snap', 'sc',
      'tiktok', 'tt',
      'facebook', 'face', 'feysbuk', 'feyzbuk', 'fb', 'messenger', 'mesenger', 'facetime',
      'twitter', 'twiter', 'twitir', 'tvitir', 'tweet',
      'discord', 'diskord', 'dc',
      'youtube', 'yutup', 'yutub', 'yt',
      'twitch', 'twic', 'kick', 'threads',
      'signal', 'viber', 'vayber', 'skype', 'skayp', 'line', 'wechat', 'kakaotalk', 'imo', 'bip',
      'tango', 'bigo', 'azar', 'yalla', 'hago', 'likee', 'mico', 'starmaker', 'chamet', 'tantan', 'uplive', 'poppo', 'litmatch',
      'soulchill', 'kwai', 'omegle', 'ometv',
      'tinder', 'bumble', 'badoo', 'onlyfans', 'fansly', 'of',
      'linkedin', 'pinterest', 'reddit', 'vk', 'vkontakte',
    ],
  },
  // Words that are also ordinary words or abbreviations:
  //   place — only with a place suffix ('tango'da', 'bip'e') or a channel word right after ('line id')
  //   of    — only with an account word right after ('of hesabım', 'OF linkim'); 'of ya' and 'of, sayfa
  //           açılmıyor' are a sigh
  //   gg    — unless it follows 'gg' ('gg wp')
  //   named — only with a name right after ('mailim ayse05'); 'mailime kod gelmedi' names no address
  ambiguous: {
    tele: 'place', kick: 'place', line: 'place', bip: 'place', tango: 'place', azar: 'place', yalla: 'place',
    of: 'of', wp: 'gg', mail: 'named', email: 'named', eposta: 'named',
  },
  placeTriggers: ['uygulama', 'app', 'esles', 'goruntulu', 'hesap', 'hesab', 'profil', 'ludo', 'yayin', 'kanal', 'grup', 'grub', 'kullanici', 'sunucu', '=id', '=idm', '=idim', '=idsi'],
  ofTriggers: ['link', 'hesap', 'hesab', 'abone', 'sayfam', 'sayfan', 'sayfas', 'icerik', 'uyelik', 'profil', 'kanal'],
  // A channel word does not count when the text has one of these words for its everyday meaning: 'FB kazandı
  // mı?' (Fenerbahçe), 'tangoda dans ettik', 'face kremi', 'DC filmleri', 'tele kanal değiştir'.
  ordinary: {
    fb: [
      '=gs', '=bjk', '=ts', '=mac', '=maci', '=macta', '=mactan', '=gol', '=lig', '=skor', 'derbi', 'taraftar', 'fener', 'galatasaray',
      'besiktas', 'trabzon', 'sampiyon', 'futbol', '=kazandi', '=kazanir', 'kazanacak', '=kaybetti', '=yendi', '=yenildi', 'yenilg',
      'berabere', 'transfer', 'kupa', 'stad', 'tribun', 'forma', '=puan', 'puani', 'kadro', 'futbolcu', 'basketbol', 'voleybol', '=uefa',
    ],
    tango: ['dans', 'pist', 'kurs', 'muzik', 'sarki', 'arjantin', 'orkestra', 'vals', 'salsa'],
    tele: ['izle', 'kumanda', 'degistir', 'dizi', 'film', 'reklam', 'haber', 'program', 'ekran', 'sesini', 'kapat'],
    face: ['krem', 'maske', 'cilt', 'makyaj', 'serum', 'tonik', 'temizle', 'peeling', '=id', '=yuz', 'yuzum', 'yuzun'],
    dc: ['film', 'comics', 'marvel', 'evren', 'kahraman', 'batman', 'superman', 'joker', 'cizgi', 'dizi', 'akim', 'adaptor', 'sarj', 'volt', 'motor'],
    azar: ['isit', '=yedi', '=yedim', '=yedin', 'yiyor', 'ettim', '=etti', 'ediyor', '=eder', 'anne', 'baba', 'ogretmen', 'patron'],
  },
  // Everyday words that a channel name plus a suffix would read as ('iğde' is a tree, not 'ig' + 'de'); typed
  // with an apostrophe ('ig'de', 'tantan'a') they are the channel again.
  allowWords: ['=igde', 'tantana'],
  // One typo away from these also counts (one word; a wrong, missing, extra or swapped letter; w read as v;
  // at least fuzzyMinLength letters once repeated letters are collapsed; the first letter may only go
  // missing from names of 8 letters or more: 'nstagram'); fuzzyAllow are real words that are one typo away.
  fuzzy: [
    'instagram', 'telegram', 'whatsapp', 'watsap', 'vatsap', 'facebook', 'feysbuk', 'snapchat', 'discord', 'youtube', 'messenger', 'twitter',
    'tiktok', 'vayber', 'linkedin', 'pinterest', 'onlyfans', 'threads', 'starmaker', 'kakaotalk', 'vkontakte', 'hotmail', 'outlook',
    'yandex', 'protonmail', 'binance',
  ],
  fuzzyMinLength: 6,
  fuzzyAllow: ['telgraf', 'telegraf', 'tiktik'],
  leetMinLength: 4, // shorter words ('ig', 'wp', 'tt') are not read through leetspeak: '7'te' is not 'tt'
  splitMinLength: 5, // a word split over two or three pieces ('you tube') counts from this length
  // Turkish suffixes after a channel name: plural, possessive, case, -ki, a few copulas. No verb endings, so
  // 'tosladım' (I bumped into) stays a verb. Short words take fewer, so 'iğne' is not 'ig' + 'ne'.
  suffix:
    '(?:lar|ler)?(?:imiz|umuz|iniz|unuz|lari|leri|miz|muz|niz|nuz|im|um|in|un|si|su|i|u|m|n)?' +
    '(?:ndaki|ndeki|daki|deki|taki|teki|ndan|nden|dan|den|tan|ten|nda|nde|da|de|ta|te|nin|nun|in|un|yla|yle|la|le|yi|yu|ni|nu|ya|ye|na|ne|i|u|a|e)?' +
    '(?:ki)?(?:yim|yum|yiz|yuz|dir|dur|tir|tur)?',
  shortSuffix: '(?:m|im|um)?(?:daki|deki|taki|teki|dan|den|tan|ten|da|de|ta|te|yla|yle|la|le|yi|yu|ya|ye|a|e)?',
  // Euphemisms for a channel ('yeşil uygulamadan yaz'), as regular expressions over the normalised text.
  phrases: { social: ['(?:yesil|mavi|mor|pembe|sari|siyah|turuncu)\\s*(?:uygulama|uyg(?![a-z])|app(?![a-z]))'] },
  // Phone numbers in other shapes count only with one of these words nearby, and not next to a bank word
  // ('kart numaram 5528 7900 1234 5672' is a card).
  phoneContext: ['=tel', 'telefon', 'numara', '=no', '=cep', '=gsm', '=hat', 'hatt', '=ara', 'aray', 'ulas', 'kaydet', 'whatsapp', '=wp'],
  bankContext: ['hesap', 'hesab', 'sube', 'kart', 'banka', 'troy', '=visa', 'master', 'ziraat', 'garanti', 'akbank', 'yapikredi', '=kredi', 'halkbank', 'vakifbank', 'denizbank', 'isbank', 'enpara', '=qnb', '=teb', '=ing', 'kuveyt', 'albaraka', 'iban'],
  // With one of these (or 'hesap no', 'kart numaram' …) a number of accountDigits or more is an account
  // number; with one of accountWeak (also everyday words: 'garanti', the in-app 'Jeton Bankası') one of
  // accountWeakDigits or more. Not an amount ('150000 TL', '₺150000', 'hesabımda 150000 jeton').
  accountContext: ['sube', 'ziraat', 'akbank', 'yapikredi', 'halkbank', 'vakifbank', 'denizbank', 'isbank', 'enpara', '=qnb', '=teb', '=ing', 'kuveyt', 'albaraka', 'iban', 'eft', 'havale', 'swift'],
  accountWeak: ['banka', 'garanti'],
  accountPhrase: '(?:hesap|hesab|kart)[a-z]*\\s*(?:no|numara)',
  accountDigits: 6,
  accountWeakDigits: 8,
  amountWords: ['tl', 'lira', '=try', 'jeton', 'coin', 'elmas', 'altin', 'puan', '=bin', 'milyon', 'milyar', 'dolar', 'euro', 'avro', '=usd', '=eur', 'sterlin', 'kurus', 'adet', 'tane', '=k', '=m'],
  longDigits: 16, // a number this long is a card or account number on its own
  wholeDigits: 7, // two numbers this long side by side are two numbers ('odalar 12345678 23456789'), not one
  // The in-app user ID: 12 digits of this shape. One that hides a mobile number ('105321234567' is '10' and
  // 532 123 45 67) passes only if it is a real one, from + step × k (data/profile.ts displayId).
  userId: { pattern: '10[0-7]\\d{9}', from: 100000000000, step: 7919 },
  // Words between the groups of one number ('0532 ve 123 ve 45 ve 67'), and words for a plus sign.
  numberJoiners: ['ve', 'sonra', 'tire', 'bosluk', 'nokta', 'virgul', 'cizgi', 'eksi', 'and', 'then', 'dash', 'dot', 'space'],
  numberPlus: ['arti', 'plus'],
  // Domains: an unspaced 'name.tld' with one of these; spaced ('ayse . com') or spelled ('ayse nokta com')
  // only with spacedTlds / spelledTlds. wordyTlds are also everyday words after a full stop typed without a
  // space ('geldi.al bakalım', 'bitti.gg', 'yeter.be'): they count at the end of the text, before '/', ':' or
  // an apostrophe ('ayse.in'e'), or with a link word in the text. Left out on purpose: TLDs that are everyday
  // Turkish or English words or units (it, am, is, to, so, la, im, de, az, at, no, my, ma, id, ml, li, top,
  // pro, vip …).
  tlds: [
    'com', 'net', 'org', 'info', 'biz', 'xyz', 'me', 'io', 'co', 'ly', 'gd', 'gl', 'ee', 'be', 'gg', 'link', 'page', 'store', 'shop', 'site',
    'online', 'app', 'dev', 'tv', 'cc', 'ws', 'us', 'uk', 'ru', 'su', 'fr', 'nl', 'tr', 'eu', 'ai', 'in', 'live', 'club', 'fun', 'art', 'blog',
    'tech', 'space', 'website', 'cloud', 'life', 'world', 'email', 'social', 'chat', 'tk', 'ga', 'cf', 'gq', 'ua', 'kz', 'uz', 'ge', 'gov',
    'edu', 'mobi', 'ch', 'es', 'pl', 'se', 'ro', 'bg', 'lt', 'fi', 'pt', 'cz', 'hu', 'ca', 'au', 'jp', 'cn', 'kr', 'br', 'mx', 'ir', 'iq',
    'ae', 'qa', 'kw', 'pk', 'nz', 'ie', 'cy', 'by', 'md', 'rs', 'ba', 'hr', 'al', 'mk', 'xxx', 'porn', 'sex', 'dating', 'win', 'stream',
    'video', 'media', 'news', 'network', 'digital', 'agency', 'studio', 'games', 'fans', 'tube', 'cam', 'webcam',
  ],
  wordyTlds: ['al', 'be', 'gg', 'su', 'in', 'es', 'us', 'by'],
  linkTriggers: ['adres', 'site', 'link', '=web', 'websit', '=url', 'tikla', 'domain'],
  spacedTlds: ['com', 'org', 'info', 'biz', 'xyz'],
  spelledTlds: ['com', 'kom', 'net', 'org', 'info', 'biz', 'xyz'],
  // IBAN lengths outside Turkey (TR is 26 and needs no checksum here).
  ibanLengths: {
    AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18,
    DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23,
    IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27,
    MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SD: 18, SE: 24, SI: 19, SK: 24,
    SM: 27, SV: 28, TL: 23, TN: 24, UA: 29, VG: 24, XK: 20,
  },
  numberWords: {
    sifir: 0, bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9,
    on: 10, yirmi: 20, otuz: 30, kirk: 40, elli: 50, altmis: 60, yetmis: 70, seksen: 80, doksan: 90, yuz: 100,
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  },
  // A number typed over several messages: the sender's number-only messages (each at most maxChars long) in
  // one conversation within windowSeconds, at most maxMessages of them, read as one text.
  sequence: { windowSeconds: 180, maxMessages: 16, maxChars: 24 },
};

// --- Normalisation -----------------------------------------------------------------------------------------

const HOMOGLYPHS = {
  // Cyrillic
  а: 'a', в: 'b', е: 'e', ё: 'e', э: 'e', г: 'r', к: 'k', м: 'm', н: 'h', о: 'o', п: 'n', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', ь: 'b',
  ѕ: 's', і: 'i', ї: 'i', ј: 'j', ԁ: 'd', ԝ: 'w', һ: 'h', ӏ: 'l', ԛ: 'q', ү: 'y', ɡ: 'g',
  А: 'A', В: 'B', Е: 'E', Э: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X', Ѕ: 'S', І: 'I', Ј: 'J', Ԁ: 'D', Ԝ: 'W',
  // Greek
  α: 'a', β: 'b', γ: 'y', ε: 'e', ζ: 'z', η: 'n', ι: 'i', κ: 'k', μ: 'u', ν: 'v', ο: 'o', ρ: 'p', σ: 'o', ς: 's', τ: 't', υ: 'u', χ: 'x', ω: 'w',
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X',
  // small capitals
  ᴀ: 'a', ʙ: 'b', ᴄ: 'c', ᴅ: 'd', ᴇ: 'e', ꜰ: 'f', ɢ: 'g', ʜ: 'h', ɪ: 'i', ᴊ: 'j', ᴋ: 'k', ʟ: 'l', ᴍ: 'm', ɴ: 'n', ᴏ: 'o', ᴘ: 'p',
  ʀ: 'r', ꜱ: 's', ᴛ: 't', ᴜ: 'u', ᴠ: 'v', ᴡ: 'w', ʏ: 'y', ᴢ: 'z',
};
const HOMOGLYPH_RE = new RegExp(`[${Object.keys(HOMOGLYPHS).join('')}]`, 'gu');
// Zero-width and other format characters, fillers that render as blank.
const INVISIBLE = /[\p{Cf}ᅟᅠㅤﾠ⠀᠎]/gu;
const ND = /\p{Nd}/u;
const RI = '\\u{1F1E6}-\\u{1F1FF}';

/** A decimal digit of any script as 0-9: its distance from the start of its run of digits. */
function asciiDigit(c) {
  const cp = c.codePointAt(0);
  let start = cp;
  while (ND.test(String.fromCodePoint(start - 1))) start--;
  return String((cp - start) % 10);
}

/** The text as plain Latin letters and ASCII digits, case kept. */
function toLatin(text) {
  let s = String(text ?? '');
  s = s.replace(/[’‘`´ʼ′ʹ]/g, "'");
  // ⒜ … ⒵ would become "(a)" under NFKC and split the word.
  s = s.replace(/[⒜-⒵]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x249c + 97));
  // A circled a in front of a plain name is an at sign ('ⓐayse05'); among circled letters it is a letter.
  s = s.replace(/(?<![Ⓐ-ⓩ])[ⓐⒶ](?=[\p{L}\p{N}_])/gu, '@');
  s = s.normalize('NFKC');
  // Two regional indicators on their own are a flag ('🇹🇷'); one alone or three and more are letters
  // ('🇮 🇳 🇸 🇹 🇦', '🇮🇳🇸🇹🇦').
  s = s.replace(new RegExp(`(?<![${RI}])[${RI}]{2}(?![${RI}])`, 'gu'), ' ');
  s = s.replace(/[\u{1F1E6}-\u{1F1FF}\u{1F170}-\u{1F189}\u{1F150}-\u{1F169}]/gu, (c) => {
    const cp = c.codePointAt(0);
    return String.fromCharCode(97 + cp - (cp >= 0x1f1e6 ? 0x1f1e6 : cp >= 0x1f170 ? 0x1f170 : 0x1f150));
  });
  s = s.replace(/(?![0-9])\p{Nd}/gu, asciiDigit);
  s = s.replace(INVISIBLE, '');
  s = s.normalize('NFD').replace(/\p{M}/gu, '');
  // Cyrillic Ze next to a digit is a 3 ('05З2').
  s = s.replace(/(?<=\d)[Зз]|[Зз](?=\d)/g, '3');
  s = s.replace(HOMOGLYPH_RE, (c) => HOMOGLYPHS[c]);
  // Dots: bracketed ('[.]', '{.}'), look-alikes ('。', '•', '·'), and dot emoji between two letters or digits.
  s = s.replace(/[[({<]\s*\.\s*[\])}>]/g, '.').replace(/[。‧·∙⋅・ꞏ•]/g, '.');
  return s.replace(/(?<=[\p{L}\p{N}]\s?)(?:[🔸🔹🔶🔷⚫⚪🔴🔵🟠🟡🟢🟣🟤●○◦⦁⚬])(?=\s?[\p{L}\p{N}])/gu, '.');
}

/** Lowercase normalised text (what the word lists are written in). */
export function normalizeText(text) {
  return toLatin(text).toLowerCase().replace(/ı/g, 'i');
}

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' };

/** Words of the text with the separators before them; `apos` when an apostrophe joined the word ('ig'de'). */
function wordsOf(lower) {
  const s = lower
    .replace(/(?<=[a-z])\$|\$(?=[a-z])/g, 's')
    .replace(/(?<![a-z0-9])[!|](?=[a-z])/g, 'i')
    .replace(/(?<=[a-z])@(?=[a-z])/g, 'a');
  const out = [];
  let end = 0;
  for (const m of s.matchAll(/[a-z0-9]+(?:'+[a-z0-9]+)*/g)) {
    const t = m[0].replace(/'/g, '');
    const letters = /[a-z]/.test(t);
    const leet = letters ? t.replace(/[013457]/g, (d) => LEET[d]) : t;
    out.push({ t, leet, skel: leet.replace(/l/g, 'i'), letters, single: /^[a-z]$/.test(t), sep: s.slice(end, m.index), apos: t.length !== m[0].length });
    end = m.index + m[0].length;
  }
  return out;
}

// Letters that look like digits, read as digits inside a number ('0S32', '1Z3', '05Э2').
const LOOKALIKE = { o: '0', i: '1', l: '1', z: '2', e: '3', a: '4', s: '5', t: '7', b: '8', g: '9', q: '9' };

/**
 * The lowercase text with letters read as digits where they sit in a number: o/l/i touching digits ('O532
 * l23', '0 5 3 2 l 2'), and one or two look-alike letters between digits ('0S32') in a word that is nearly
 * all digits (not a hex address like '0x742d35cc…'). Same length.
 */
function digitView(lower) {
  return lower
    .replace(/[a-z0-9]+/g, (chunk) => {
      const few = chunk.replace(/[^a-z]/g, '').length <= 2;
      return chunk.replace(/[a-z]+/g, (w, at, s) => {
        const before = /\d/.test(s[at - 1] ?? '');
        const after = /\d/.test(s[at + w.length] ?? '');
        if (w.length <= 3 && !/[^oli]/.test(w) && (before || after)) return w.replace(/o/g, '0').replace(/[li]/g, '1');
        if (few && before && after && !/[^oilzeastbgq]/.test(w)) return w.replace(/./g, (c) => LOOKALIKE[c]);
        return w;
      });
    })
    .replace(/(?<=\d[ \t.-]{1,3})[oli](?=[ \t.-]{1,3}\d)/g, (c) => (c === 'o' ? '0' : '1'));
}

// --- Compiled rules ----------------------------------------------------------------------------------------

let active = DEFAULT_RULES;
const cache = new WeakMap();

/** Live settings: overrides replace whole top-level entries of DEFAULT_RULES. */
export function setRules(overrides = {}) {
  active = { ...DEFAULT_RULES, ...overrides };
}
export function resetRules() {
  active = DEFAULT_RULES;
}
export const getRules = () => active;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 'papara' → p+a+p+a+r+a+ ; a doubled letter must stay doubled ('likee' is not 'like'). */
const runs = (w) => w.match(/(.)\1*/g).map((r) => (r.length === 1 ? `${esc(r)}+` : `${esc(r[0])}{${r.length},}`)).join('');
const collapse = (s) => s.replace(/(.)\1+/g, '$1');
/** w and v sound alike in Turkish spellings ('vatsap', 'votsap', 'wtsap'). */
const fold = (s) => s.replace(/w/g, 'v');
const WORD_CATEGORIES = ['iban', 'payment', 'email', 'link', 'social'];
// Longest Turkish suffix kept while letters typed one at a time are put together.
const SUFFIX_ROOM = 8;

function wordTest(list) {
  const exact = list.filter((w) => w.startsWith('=')).map((w) => esc(w.slice(1)));
  const prefix = list.filter((w) => !w.startsWith('=')).map(esc);
  const parts = [];
  if (exact.length) parts.push(`^(?:${exact.join('|')})$`);
  if (prefix.length) parts.push(`^(?:${prefix.join('|')})`);
  return parts.length ? new RegExp(parts.join('|')) : /$^/;
}

function compile(R) {
  let C = cache.get(R);
  if (C) return C;
  const fuzzy = new Set(R.fuzzy);
  const words = [];
  for (const category of WORD_CATEGORIES) {
    for (const w of R.words[category] ?? []) {
      const short = w.length < R.leetMinLength;
      const suffix = short ? R.shortSuffix : R.suffix;
      const kc = collapse(w);
      words.push({
        w,
        category,
        short,
        mode: R.ambiguous[w] ?? null,
        split: w.length >= R.splitMinLength,
        re: new RegExp(`^(${runs(w)})(${suffix})$`),
        reSkel: short ? null : new RegExp(`^(${runs(w.replace(/l/g, 'i'))})(${suffix})$`),
        flat: kc,
        flatSkel: short ? null : collapse(w.replace(/l/g, 'i')),
        fuzzy: fuzzy.has(w) && kc.length >= R.fuzzyMinLength ? fold(kc) : null,
        suffixRe: new RegExp(`^(?:${suffix})$`),
      });
    }
  }
  // Keywords by the first letter a candidate can start with (as typed, or with l read as i); for typos by the
  // first letter with w read as v, and by the second letter for long names ('nstagram').
  const byFirst = new Map();
  const fuzzyByFirst = new Map();
  const index = (map, ch, kw) => {
    if (!map.has(ch)) map.set(ch, new Set());
    map.get(ch).add(kw);
  };
  for (const kw of words) {
    index(byFirst, kw.w[0], kw);
    if (kw.reSkel) index(byFirst, kw.w[0] === 'l' ? 'i' : kw.w[0], kw);
    if (kw.fuzzy) {
      index(fuzzyByFirst, kw.fuzzy[0], kw);
      if (kw.fuzzy.length >= 8) index(fuzzyByFirst, kw.fuzzy[1], kw);
    }
  }
  const tldsOf = (list) => list.map(esc).join('|');
  const strongTlds = R.tlds.filter((t) => !R.wordyTlds.includes(t));
  C = {
    R,
    words,
    byFirst,
    fuzzyByFirst,
    placeTriggers: wordTest(R.placeTriggers),
    ofTriggers: wordTest(R.ofTriggers),
    ordinary: new Map(Object.entries(R.ordinary).map(([w, list]) => [w, wordTest(list)])),
    allowWords: wordTest(R.allowWords),
    phrases: Object.entries(R.phrases).flatMap(([category, list]) => list.map((p) => ({ category, re: new RegExp(`(?<![a-z0-9])(?:${p})`) }))),
    phoneContext: wordTest(R.phoneContext),
    bankContext: wordTest(R.bankContext),
    accountContext: wordTest(R.accountContext),
    accountWeak: wordTest(R.accountWeak),
    accountPhrase: new RegExp(`(?<![a-z0-9])${R.accountPhrase}`),
    amountWords: wordTest(R.amountWords),
    userId: new RegExp(`^(?:${R.userId.pattern})$`),
    numberWords: new Map(Object.entries(R.numberWords)),
    numberJoiners: new Set(R.numberJoiners),
    numberPlus: new Set(R.numberPlus),
    linkTriggers: wordTest(R.linkTriggers),
    // One character of the name is enough: the rest of it does not change the answer, and the regex stays linear.
    domain: new RegExp(`[a-z0-9-]\\.(?:${tldsOf(strongTlds)})(?![a-z0-9])`),
    wordyDomain: new RegExp(`[a-z0-9-]\\.(?:${tldsOf(R.wordyTlds)})(?:\\s*$|(?=['/:]))`),
    wordyAnywhere: new RegExp(`[a-z0-9-]\\.(?:${tldsOf(R.wordyTlds)})(?![a-z0-9])`),
    slashDomain: new RegExp(`[a-z0-9]\\s*\\.\\s*(?:${tldsOf(R.tlds)})\\s*\\/`),
    spacedDomain: new RegExp(`[a-z0-9]\\s*\\.\\s*(?:${tldsOf(R.spacedTlds)})(?![a-z0-9])`),
    spelledDomain: new RegExp(`(?<![a-z0-9])(?:nokta(?:si)?|dot)[\\s)\\]}>]*(?:${tldsOf(R.spelledTlds)})(?![a-z0-9])`),
    emailSpaced: new RegExp(`[a-z0-9._%+-]\\s*@\\s*[a-z0-9-]+\\s*[.,]\\s*(?:${tldsOf(R.spelledTlds)})(?![a-z0-9])`),
  };
  cache.set(R, C);
  return C;
}

// --- Word detectors ----------------------------------------------------------------------------------------

/** At most one letter wrong, missing or extra, or two neighbours swapped ('instagarm'). */
function closeTo(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** A word that reads like a user name: letters with digits ('ayse05'), or dotted or underscored ('ayse.kaya'). */
const nameLike = (t, next) => (t.letters && /\d/.test(t.t)) || (next !== undefined && /^[._]$/.test(next.sep) && next.letters);

/** Does this hit of a channel word count? */
function counts(C, hit, tokens) {
  const ordinary = C.ordinary.get(hit.kw.w);
  if (ordinary && tokens.some((t, k) => (k < hit.start || k > hit.end) && ordinary.test(t.t))) return false;
  if (!hit.kw.mode) return true;
  const after = tokens.slice(hit.end + 1, hit.end + 4);
  switch (hit.kw.mode) {
    case 'place':
      return /^(?:y?[ae]|n?[dt][ae](?:n|ki)?)/.test(hit.suffix) || after.some((t) => C.placeTriggers.test(t.t));
    case 'of':
      if (/^(?:[dt]a(?:n|ki)?)$/.test(hit.suffix)) return true;
      return !/[,!?.…]/.test(after[0]?.sep ?? '') && after.slice(0, 2).some((t) => C.ofTriggers.test(t.t));
    case 'gg':
      return !(hit.start > 0 && tokens[hit.start - 1].t === 'gg');
    case 'named':
      return after.slice(0, 2).some((t, k) => nameLike(t, after[k + 1]));
    default:
      return true;
  }
}

const joinable = (sep) => sep.length <= 4 && !/[,:;!?@#]/.test(sep);
const splittable = (sep) => /^[\s.-]{1,3}$/.test(sep);
/** Could a keyword still match these letters, or these letters followed by more? */
const prefixOf = (acc, flat) => flat !== null && (flat.startsWith(acc) || (acc.startsWith(flat) && acc.length <= flat.length + SUFFIX_ROOM));

/** Categories of the channel names in the text. */
function wordHits(C, tokens) {
  const found = new Set();
  const R = C.R;
  const typoAllowed = (t) => R.fuzzyAllow.some((w) => t.startsWith(w));
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok.letters) continue;
    if (!tok.apos && C.allowWords.test(tok.t)) continue;
    const near = new Set([...(C.byFirst.get(tok.t[0]) ?? []), ...(C.byFirst.get(tok.leet[0]) ?? []), ...(C.byFirst.get(tok.skel[0]) ?? [])]);
    const cands = [{ plain: tok.t, leet: tok.leet, skel: tok.skel, end: i, kind: 'one' }];
    if (tok.single) {
      // Letters typed one at a time ('i n s t a', 'w.p', 'i_n_s_t_a'), while some keyword can still match.
      // Joined by underscores only from three letters: 'T_T' and 'o_O' are faces.
      let alive = [...near];
      let acc = tok.t;
      let under = false;
      for (let j = i + 1; j < tokens.length && j - i < 24 && joinable(tokens[j].sep); j++) {
        acc += tokens[j].t;
        under ||= tokens[j].sep.includes('_');
        const flat = collapse(acc);
        const flatSkel = collapse(acc.replace(/l/g, 'i'));
        alive = alive.filter((kw) => !found.has(kw.category) && (prefixOf(flat, kw.flat) || prefixOf(flatSkel, kw.flatSkel)));
        if (!alive.length) break;
        if (!under || acc.length >= 3) cands.push({ plain: acc, leet: acc, skel: acc.replace(/l/g, 'i'), end: j, kind: 'letters' });
        if (!tokens[j].single) break;
      }
    }
    for (let j = i + 1; j < tokens.length && j <= i + 2 && tokens[j].letters && splittable(tokens[j].sep); j++) {
      const parts = tokens.slice(i, j + 1);
      cands.push({
        plain: parts.map((p) => p.t).join(''),
        leet: parts.map((p) => p.leet).join(''),
        skel: parts.map((p) => p.skel).join(''),
        head: parts.slice(0, -1).map((p) => p.t).join(''),
        end: j,
        kind: 'split',
      });
    }
    for (const c of cands) {
      for (const kw of near) {
        if (found.has(kw.category)) continue;
        if (c.kind === 'split' && (!kw.split || kw.re.test(c.head))) continue;
        let m = kw.re.exec(c.plain);
        if (!m && !kw.short) m = kw.re.exec(c.leet) ?? kw.reSkel.exec(c.skel);
        if (m && counts(C, { kw, start: i, end: c.end, suffix: m[2] }, tokens)) found.add(kw.category);
      }
    }
    // One typo away, one word only.
    if (typoAllowed(tok.t)) continue;
    const views = [...new Set([fold(collapse(tok.t)), fold(collapse(tok.leet))])];
    const typoNear = new Set(views.flatMap((v) => [...(C.fuzzyByFirst.get(v[0]) ?? [])]));
    for (const kw of typoNear) {
      const target = kw.fuzzy;
      if (!target || found.has(kw.category)) continue;
      for (const v of views) {
        if (v[0] !== target[0] && !(target.length >= 8 && v[0] === target[1])) continue;
        let suffix = null;
        for (let p = target.length - 1; p <= target.length + 1 && suffix === null; p++) {
          if (p > v.length) break;
          if (closeTo(v.slice(0, p), target) && kw.suffixRe.test(v.slice(p))) suffix = v.slice(p);
        }
        if (suffix !== null && counts(C, { kw, start: i, end: i, suffix }, tokens)) {
          found.add(kw.category);
          break;
        }
      }
    }
  }
  return found;
}

// --- Numbers -----------------------------------------------------------------------------------------------

/** A word made only of number words ('yirmi', 'beşyüzotuziki') as their values, else null. */
function numberWordsOf(C, w) {
  const direct = C.numberWords.get(w);
  if (direct !== undefined) return [direct];
  if (w.length < 5 || w.length > 80) return null;
  // Split into number words (first fit with memo; the words share no awkward prefixes).
  const memo = new Map();
  const go = (at) => {
    if (at === w.length) return [];
    if (memo.has(at)) return memo.get(at);
    let out = null;
    for (const [word, v] of C.numberWords) {
      if (w.startsWith(word, at)) {
        const rest = go(at + word.length);
        if (rest) {
          out = [v, ...rest];
          break;
        }
      }
    }
    memo.set(at, out);
    return out;
  };
  return go(0);
}

const UNITS = [
  /(?<![\d.])(?:0?[1-9]|[12]\d|3[01])\.(?:0?[1-9]|1[0-2])\.(?:\d{4}|\d{2})(?![.,]?\d)/g, // 05.11.2026
  /(?<![\d/])(?:0?[1-9]|[12]\d|3[01])\/(?:0?[1-9]|1[0-2])\/(?:\d{4}|\d{2})(?!\/?\d)/g, // 05/11/2026, 1/1/2027
  /(?<![\d-])(?:19|20)\d{2}-(?:0?[1-9]|1[0-2])-(?:0?[1-9]|[12]\d|3[01])(?!-?\d)/g, // 2026-11-05
  /(?<![\d-])(?:0?[1-9]|[12]\d|3[01])-(?:0?[1-9]|1[0-2])-(?:19|20)\d{2}(?!-?\d)/g, // 05-11-2026
  /(?<![\d.,])\d{1,3}(?:\.\d{3})+(?:,\d+)?(?![.,]?\d)/g, // 1.000.000, 1.299,90
  /(?<![\d.,])\d+,\d+(?![.,]?\d)/g, // 1,5  99,99
  // Short ones only when no other number is next to them: '0532 123 12.34' stays a phone number.
  /(?<!\d[\s.:()/-]{0,3})(?:[01]?\d|2[0-3])[.:][0-5]\d(?![\s.:,()/-]*\d)/g, // 21.30, 21:30
  /(?<!\d[\s.()/-]{0,3})(?:0?[1-9]|[12]\d|3[01])\.(?:0?[1-9]|1[0-2])(?![\s.,()/-]*\d)/g, // 14.02
];
// A private-use character (U+E000) stands in for each character of an amount, date, time or IBAN, so the
// text keeps its length and the positions found in it stay right.
const UNIT = '\uE000';
// A list of times, each later than the one before ('18:00 / 21:00 / 23:00', '14.00-16.30'), with no other
// number next to it.
const TIME = '(?:[01]?\\d|2[0-3])[:.][0-5]\\d';
const TIME_LIST = new RegExp(`(?<!\\d[\\s.:()/-]{0,3})${TIME}(?:[\\s/,;|-]{1,5}${TIME})+(?![\\s.:,()/-]*\\d)`, 'g');
const minutes = (m) => [...m.matchAll(/(\d+)[:.](\d+)/g)].map((x) => Number(x[1]) * 60 + Number(x[2]));
const timeList = (m) => minutes(m).every((v, k, all) => k === 0 || v > all[k - 1]);

/**
 * Runs of numbers: groups of digits as typed, joined by spaces, punctuation, emoji, joining words ('ve',
 * 'sonra', 'tire') and the like, and broken by other words, by '=' and by amounts, dates and times. Number words
 * become numbers ('beş yüz otuz iki' → 532). A run followed by an amount word or next to a currency sign is
 * an amount ('150000 TL'). Two long numbers side by side are two runs.
 */
function numberRuns(C, view) {
  let s = view.replace(TIME_LIST, (m) => (timeList(m) ? UNIT.repeat(m.length) : m));
  for (const re of UNITS) s = s.replace(re, (m) => UNIT.repeat(m.length));
  const out = [];
  let run = [];
  let plus = false;
  let amount = false;
  const close = (after = '') => {
    if (run.length) {
      const groups = groupsOf(run);
      if (groups.length) out.push(Object.assign(groups, { amount: amount || C.amountWords.test(after) }));
    }
    run = [];
    plus = false;
    amount = false;
  };
  for (const m of s.matchAll(/(\d+)|([a-z]+)|(\s+)|([^])/gu)) {
    if (m[1]) {
      const last = run[run.length - 1];
      if (last?.d !== undefined && last.d.length >= C.R.wholeDigits && m[1].length >= C.R.wholeDigits) {
        const was = amount;
        close();
        amount = was;
      }
      run.push({ d: m[1], plus });
      plus = false;
    } else if (m[2]) {
      const w = m[2];
      const values = numberWordsOf(C, w);
      if (values) {
        for (const v of values) {
          run.push({ w: v, plus });
          plus = false;
        }
      } else if (C.numberPlus.has(w) && !run.length) plus = true; // 'artı doksan …'
      else if (!run.length || !(C.numberJoiners.has(w) || C.numberPlus.has(w))) close(w);
    } else if (m[4]) {
      const ch = m[4];
      if (ch === ',') run.push({ comma: true });
      else if (ch === '+') {
        // A plus sign starts a number ('+49 151 …'); between two numbers it joins them.
        if (/^\s?\d/.test(s.slice(m.index + 1, m.index + 3)) && !/\d\s?$/.test(s.slice(Math.max(0, m.index - 2), m.index))) plus = true;
      } else if (/[₺$€£]/.test(ch)) amount = true;
      else if (ch === '=' || /\p{L}/u.test(ch)) close(); // '500 + 500 = 1000' is a sum
    }
  }
  close();
  return out;
}

/** Items of one run as digit groups; number words are read hundreds, tens, units ('yüz yirmi üç' → 123). */
function groupsOf(items) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (cur) out.push({ d: String(cur.h + cur.t + cur.u), word: true, plus: cur.plus });
    cur = null;
  };
  for (const x of items) {
    if (x.comma) {
      flush();
      continue;
    }
    if (x.d !== undefined) {
      // 'yüz 23', '5 yüz 32': digits right after yüz fill the chunk
      if (cur && cur.hasH && !cur.hasT && !cur.hasU && x.d.length <= 2 && !x.plus) {
        cur.t = Number(x.d);
        cur.hasT = cur.hasU = true;
        flush();
      } else {
        flush();
        out.push({ d: x.d, plus: x.plus });
      }
      continue;
    }
    const v = x.w;
    if (v === 0) {
      flush();
      out.push({ d: '0', word: true, plus: x.plus });
    } else if (v === 100) {
      const prev = out[out.length - 1];
      if (cur && cur.hasU) {
        // The unit before yüz is its multiplier: 'beş yüz' → 500, and 'doksan beş yüz otuz iki' → 90 532
        // (a number is read out in pieces: 'doksan, beş yüz otuz iki').
        const hundreds = cur.u * 100;
        if (cur.hasH || cur.hasT) {
          cur.u = 0;
          cur.hasU = false;
          flush();
          cur = { h: hundreds, t: 0, u: 0, hasH: true };
        } else {
          cur.h = hundreds;
          cur.u = 0;
          cur.hasU = false;
          cur.hasH = true;
        }
      } else if (!cur && prev && !prev.word && !prev.plus && /^[1-9]$/.test(prev.d)) {
        out.pop();
        cur = { h: Number(prev.d) * 100, t: 0, u: 0, hasH: true };
      } else {
        flush();
        cur = { h: 100, t: 0, u: 0, hasH: true, plus: x.plus };
      }
    } else if (v >= 10) {
      if (!cur || cur.hasT || cur.hasU) {
        flush();
        cur = { h: 0, t: 0, u: 0, plus: x.plus };
      }
      cur.t = v;
      cur.hasT = true;
    } else {
      if (!cur || cur.hasU) {
        flush();
        cur = { h: 0, t: 0, u: 0, plus: x.plus };
      }
      cur.u = v;
      cur.hasU = true;
    }
  }
  flush();
  return out;
}

/** A round amount: up to three digits and then zeros (50, 250, 1000, 150000). */
const roundAmount = (d) => /^[1-9]\d{0,2}0+$/.test(d);

/**
 * Round amounts (or single digits) going up or down ('50 100 250 500 1000 jeton', '5, 10, 20, 50, 100'): a
 * list, not one number.
 */
function amountList(groups) {
  if (groups.length < 2 || !groups.every((g) => /^[1-9]$/.test(g.d) || roundAmount(g.d))) return false;
  const v = groups.map((g) => Number(g.d));
  return v.every((x, k) => k === 0 || x > v[k - 1]) || v.every((x, k) => k === 0 || x < v[k - 1]);
}

/** Counting (1 2 3, 10 9 8, 5 10 15), one number repeated (99 99 99) or a list of amounts: not a phone or account number. */
function patterned(groups) {
  if (groups.length < 2) return false;
  if (groups.every((g) => g.d === groups[0].d) || amountList(groups)) return true;
  if (groups.length < 3) return false;
  const v = groups.map((g) => Number(g.d));
  const step = v[1] - v[0];
  return step !== 0 && v.every((x, k) => k === 0 || x - v[k - 1] === step);
}

/** A Turkish mobile number (05xx xxx xx xx) with a digit or two put around it ('1 05321234567'), or backwards. */
function hiddenMobile(s) {
  const mobile = (x) => /^5[0-5]\d{8}$/.test(x) && new Set(x).size >= 4;
  if (s.length === 11 && s.endsWith('0') && mobile([...s.slice(0, 10)].reverse().join(''))) return true; // 76543212350
  if (s.length === 12 || s.length === 13) {
    for (let k = 0; k + 11 <= s.length; k++) if (s[k] === '0' && mobile(s.slice(k + 1, k + 11))) return true;
  }
  return false;
}

/** The in-app user ID ('ID'm 104827319456'); one that hides a mobile number only if it is a real one. */
function isUserId(C, s) {
  if (!C.userId.test(s)) return false;
  const { from, step } = C.R.userId;
  return !hiddenMobile(s) || (Number(s) - from) % step === 0;
}

function phoneIn(C, runs, ctx) {
  for (const g of runs) {
    for (let i = 0; i < g.length; i++) {
      let s = '';
      for (let j = i; j < g.length; j++) {
        s += g[j].d;
        if (s.length > 16) break;
        if (s.length < 8) continue;
        const phone =
          /^5\d{9}$/.test(s) || // 532 123 45 67
          /^0[1-9]\d{8,10}$/.test(s) || // 0532 123 45 67, 0212 …, 07911 123456
          /^90[2-58]\d{9}$/.test(s) || // 90 532 …
          /^00[1-9]\d{7,13}$/.test(s) || // 0090 …, 0049 …
          (g[i].plus && /^[1-9]\d{7,14}$/.test(s)) || // +49 151 …
          (ctx.phone && !ctx.bank && /^[1-9]\d{9,12}$/.test(s)) || // 415-555-0132 numaram
          hiddenMobile(s); // 105321234567, 76543212350
        if (!phone) continue;
        if (i === j && !g[i].plus && isUserId(C, s)) continue;
        if (/^[1-9]\d?0{6,}$/.test(s)) continue; // round amount
        if (patterned(g.slice(i, j + 1))) continue;
        return true;
      }
    }
  }
  return false;
}

/** Card and bank account numbers: very long numbers, and account-length ones next to a bank word. */
function accountIn(C, runs, strong, weak) {
  const R = C.R;
  for (const g of runs) {
    const s = g.map((x) => x.d).join('');
    if (g.length === 1 && (isUserId(C, s) || roundAmount(s))) continue;
    if (s.length >= R.longDigits && !patterned(g)) return true;
    if (g.amount || amountList(g)) continue;
    if ((strong && s.length >= R.accountDigits) || (weak && s.length >= R.accountWeakDigits)) return true;
  }
  return false;
}

/** IBANs: TR + 24 digits; other countries by length and checksum. Spans in the text. */
function ibanSpans(R, lower, dview) {
  const spans = [];
  const sep = /[\s\p{P}\p{S}]/u;
  for (const m of dview.matchAll(/(?<![a-z0-9])tr[\s\p{P}\p{S}]*(?=\d)/gu)) {
    let k = m.index + m[0].length;
    let digits = 0;
    let end = k;
    while (k < dview.length && digits < 24) {
      if (/\d/.test(dview[k])) {
        digits++;
        end = k + 1;
      } else if (!sep.test(dview[k])) break;
      k++;
    }
    if (digits === 24) spans.push([m.index, end]);
  }
  for (const m of lower.matchAll(/(?<![a-z0-9])([a-z]{2})(\d{2})/g)) {
    const cc = m[1].toUpperCase();
    const len = R.ibanLengths[cc];
    if (!len) continue;
    let k = m.index + 4;
    let bban = '';
    let end = k;
    while (k < lower.length && bban.length < len - 4) {
      if (/[a-z0-9]/.test(lower[k])) {
        bban += lower[k];
        end = k + 1;
      } else if (!sep.test(lower[k]) || sep.test(lower[k - 1])) break;
      k++;
    }
    if (bban.length !== len - 4) continue;
    let r = 0;
    for (const ch of bban + m[1] + m[2]) for (const d of /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 87)) r = (r * 10 + Number(d)) % 97;
    if (r === 1) spans.push([m.index, end]);
  }
  return spans;
}

// --- Other detectors ---------------------------------------------------------------------------------------

function paymentIn(cased, lower) {
  if (/(?<![a-z0-9])(?:trc|erc|bep)[\s-]?20(?!\d)/.test(lower)) return true;
  if (/(?<![0-9a-z])0x[0-9a-f]{40}(?![0-9a-z])/i.test(cased)) return true; // Ethereum and the like
  if (/(?<![0-9a-z])(?:bc1|ltc1|tb1)[ac-hj-np-z02-9]{20,90}(?![0-9a-z])/i.test(cased)) return true; // bech32
  for (const m of cased.matchAll(/(?<![\p{L}\p{N}])[1-9A-HJ-NP-Za-km-z]{25,44}(?![\p{L}\p{N}])/gu)) {
    if (/\d/.test(m[0]) && /[A-Z]/.test(m[0]) && /[a-z]/.test(m[0])) return true; // base58 (Bitcoin, Tron, Solana …)
  }
  return false;
}

function emailIn(C, lower) {
  return (
    /[a-z0-9._%+-]@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/.test(lower) ||
    /(?<![a-z0-9._%+-])[a-z0-9._%+-]{3,}@[a-z0-9-]{3,}/.test(lower) || // ayse05@ornek, no TLD
    C.emailSpaced.test(lower) ||
    /[a-z0-9]\s*[[({]\s*(?:at|et)\s*[\])}]\s*[a-z0-9]/.test(lower) || // ayse (at) sirket
    /[a-z0-9]\s+et\s+isareti\s+[a-z0-9]/.test(lower)
  );
}

function linkIn(C, lower, tokens) {
  const tight = lower.replace(/\s+/g, '');
  if (/(?<!h)(?:h+t+p+s?|hxxps?|ftp):\/\//.test(tight)) return true;
  // Also read with letters typed one at a time put back together: 'w w w . o r n e k . c o m'.
  const squeezed = lower.replace(/(?<![a-z0-9])[a-z0-9](?:(?:\s+|\s*\.\s*)[a-z0-9](?![a-z0-9])){2,}/g, (m) => m.replace(/\s+/g, ''));
  const linkWord = tokens.some((t) => C.linkTriggers.test(t.t));
  return [...new Set([lower, squeezed])].some(
    (v) =>
      /(?<![a-z0-9])www(?![a-z0-9])/.test(v) ||
      C.domain.test(v) ||
      C.wordyDomain.test(v) ||
      (linkWord && C.wordyAnywhere.test(v)) ||
      C.slashDomain.test(v) ||
      C.spacedDomain.test(v) ||
      C.spelledDomain.test(v),
  );
}

// The app has no @mentions, so any @name is a handle; '@_@' is a face.
function handleIn(lower) {
  if (/(?<![a-z0-9._%+-])@\s*[a-z0-9_.]*[a-z]/.test(lower)) return true; // @ayse, @  ayse
  if (/(?<![a-z0-9])[[({]\s*(?:at|et)\s*[\])}]\s*[a-z0-9_.]*[a-z]/.test(lower)) return true; // (at)ayse05
  if (/(?<![a-z])(?:kuyruklu\s*a|et\s*isareti)\s+[a-z0-9_.]*[a-z]/.test(lower)) return true; // kuyruklu a ayse05
  for (const m of lower.matchAll(/(?<![a-z0-9._%+-])([a-z0-9_.]{3,})\s?@(?![a-z0-9_.])/g)) if (/[a-z]/.test(m[1])) return true; // ayse05@
  return false;
}

// --- Entry points ------------------------------------------------------------------------------------------

const OK = Object.freeze({ ok: true });
const refused = (category) => ({ ok: false, category });

/** Whether `text` may be shown to other people; if not, the kind of contact detail it carries. */
export function checkText(text, rules = active) {
  const C = compile(rules);
  const cased = toLatin(text);
  const lower = cased.toLowerCase().replace(/ı/g, 'i');
  if (!/[a-z0-9@]/.test(lower)) return OK;
  const tokens = wordsOf(lower);
  const has = (re) => tokens.some((t) => re.test(t.t));
  const dview = digitView(lower);
  const spans = ibanSpans(C.R, lower, dview);
  let masked = dview;
  for (const [a, b] of spans) masked = masked.slice(0, a) + UNIT.repeat(b - a) + masked.slice(b);
  const runs = numberRuns(C, masked);
  if (phoneIn(C, runs, { phone: has(C.phoneContext), bank: has(C.bankContext) })) return refused('phone');
  if (spans.length || accountIn(C, runs, has(C.accountContext) || C.accountPhrase.test(lower), has(C.accountWeak))) return refused('iban');
  const words = wordHits(C, tokens);
  for (const p of C.phrases) if (p.re.test(lower)) words.add(p.category);
  if (words.has('iban')) return refused('iban');
  if (words.has('payment') || paymentIn(cased, lower)) return refused('payment');
  if (words.has('email') || emailIn(C, lower)) return refused('email');
  if (words.has('link') || linkIn(C, lower, tokens)) return refused('link');
  if (handleIn(lower)) return refused('handle');
  if (words.has('social')) return refused('social');
  return OK;
}

/** A short message of digits, number words and punctuation only ('0532', 'yüz yirmi üç', 'TR33 0006 1005', '45 ve'). */
export function isNumberOnly(text, rules = active) {
  const C = compile(rules);
  const raw = String(text ?? '').trim();
  if (!raw || raw.length > C.R.sequence.maxChars) return false;
  const v = digitView(normalizeText(raw)).trim().replace(/^[a-z]{2}(?=\d{2}(?:[^a-z0-9]|$))/, '');
  let any = false;
  for (const m of v.matchAll(/[a-z]+|\d+|\S/gu)) {
    const x = m[0];
    if (/^\d/.test(x)) any = true;
    else if (/^[a-z]/.test(x)) {
      if (numberWordsOf(C, x)) any = true;
      else if (!C.numberJoiners.has(x) && !C.numberPlus.has(x)) return false;
    } else if (!/[\p{P}\p{S}]/u.test(x)) return false;
  }
  return any;
}

/**
 * A number typed over several messages ('0532', '123', '45', '67'). `previous` are the sender's earlier
 * messages in the same conversation within the window, oldest first; only the trailing run of number-only
 * messages is read together with `current`. Messages with words in them are checked on their own.
 */
export function checkSequence(previous, current, rules = active) {
  const C = compile(rules);
  if (!isNumberOnly(current, rules)) return OK;
  const streak = [];
  for (let k = previous.length - 1; k >= 0 && streak.length < C.R.sequence.maxMessages - 1; k--) {
    if (!isNumberOnly(previous[k], rules)) break;
    streak.unshift(previous[k]);
  }
  if (!streak.length) return OK;
  return checkText([...streak, current].join(' '), rules);
}
