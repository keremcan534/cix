// Spam filter for Anlar (moments.mjs: posts and comments), on top of the contact filter (contact-filter.mjs, which
// already refuses contact details and the names of other apps). A text that swears ('swear'), is sexual
// ('sexual') or advertises (followers or coins for sale, "download this other app", betting sites, easy money:
// 'ad') is refused with a message that says which; reports (POST /api/report) catch the rest.
//
// The text is read the way people dodge a word list: NFKC, Turkish lowercase, ş ç ğ ö ü folded to s c g o u,
// leetspeak inside words ('s1kt1r', 'p0rn0'), letters spaced or dotted apart ('s i k', 'a.m.k') joined, and any
// letter typed many times ('siiiik') read once. 'ı' is kept: a word list entry with 'ı' matches ı or i, one with
// 'i' only i, so 'sıkıntı', 'sıkıcı' and 'sıkıştım' stay fine while 'sik' does not. Everyday words that start
// like one of these are left alone: entries match the whole word unless they end in '*' (a root, any suffix).
//
// Pure module (no Node or database imports).
//
//   checkSpam(text) → { ok: true } | { ok: false, category: 'swear' | 'sexual' | 'ad' }

export const SPAM_MESSAGES = {
  swear: 'Küfür ve hakaret içeren yazı paylaşılamaz.',
  sexual: 'Cinsel içerikli yazı paylaşılamaz.',
  ad: 'Reklam, satış ve başka uygulama tanıtımı paylaşılamaz.',
};

/** Words, written folded (s c g o u for ş ç ğ ö ü). '*' at the end: the root and any suffix. */
const WORDS = {
  swear: [
    'amk', 'amq', 'aq', 'amına*', 'amını*', 'amcık*', 'amcıg*',
    'sik', 'siktir*', 'sikerim', 'sikeyim', 'sikiyim', 'sikim', 'sikimi', 'sikik', 'sikis*', 'sikti', 'siktim', 'sikicem', 'sikecem', 'sikerler', 'sokuyum',
    'orospu*', 'orspu*', 'oç', 'piç', 'piçler', 'piçi', 'yarrak*', 'yarrag*', 'yarak*', 'yarag*', 'yarram', 'dalyarak*', 'yavsak*',
    'pezevenk*', 'pezo', 'kahpe*', 'gavat*', 'ibne*', 'pust', 'pustlar', 'pustun', 'serefsiz*', 'gotveren*', 'gotunu', 'gotune', 'gotun', 'kaltak*', 'surtuk*',
    'ananısikeyim*',
    'fuck*', 'fck', 'fucking', 'motherfucker*', 'shit', 'bitch*', 'asshole*', 'bastard*', 'pussy', 'dick', 'cunt*',
  ],
  sexual: [
    'seks', 'sex', 'sekse', 'seksten', 'seksle', 'sexs', 'sexy', 'porno*', 'porn*', 'erotik*', 'erotic*', 'nude', 'nudes', 'naked',
    'escort', 'eskort*', 'sakso*', 'anal', 'mastürbasyon*', 'masturb*', 'sevis*', 'azgın*', 'azdım', 'azdın', 'xxx', 'onlyfans*', 'fetis*',
  ],
  ad: ['freespin*', 'freebet*', 'bahisçi*'],
};

/** Phrases, on the folded words joined by one space. */
const PHRASES = {
  sexual: [
    /\b(?:goruntulu|cam|ozel|ucretli|canli) show\b/,
    /\bshow (?:yap|ver|atar|atiyorum)/,
    /\boral (?:seks|sex)\b/,
  ],
  ad: [
    /\b(?:takipci|begeni|izlenme|abone) (?:sat|satis|satilir|satiyorum|satan|paket|hile|kasma|kasiyorum|al(?:in|mak))/,
    /\b(?:ucuz|bedava|ucretsiz|indirimli|hileli) (?:jeton|elmas|takipci)/,
    /\b(?:jeton|elmas|takipci) (?:hile|hack|bug|uretici|generator)/,
    /\b(?:para|gelir|kazanc) (?:kazan(?:mak|in|dir|iyorum)?|garantili)\b/,
    /\bevden (?:para|calis|gelir|kazan)/,
    /\b(?:pasif gelir|garantili kazanc|yatirimsiz kazanc|gunluk kazanc|kolay para)\b/,
    // "Download / come to (another) app": the asking forms only, so "uygulamaya geldim" stays fine.
    /\b(?:uygulama\w*|app|apk) (?:indir|yukle)(?:in|iniz|sene|e|ebilirsin|ebilirsiniz|mek|meniz|melisin|melisiniz)?\b/,
    /\b(?:indir|yukle)(?:in|iniz|sene)? (?:su |bu )?(?:uygulama\w*|app|apk)\b/,
    /\b(?:baska|diger|yeni|su) (?:bir )?(?:uygulama|app|platform)\w* (?:gel|gec|katil|indir|yukle|bekli)\w*/,
    /\b(?:uygulama|app|platform)\w* (?:gelin|gel|gecin|gec|gecelim|katilin|katil)\b/,
    /\b(?:bahis|casino|kumar|slot|bet) (?:siteleri?|sitesi\w*|linki?|bonus\w*|kodu?)\b/,
    /\b(?:deneme|cevrimsiz|hos geldin|yatirim) bonus/,
    /\b(?:referans|davet|promosyon|indirim|kupon) kod/,
    /\b(?:linke|linkime|linkten|baglantiya) (?:tikla|gir|bak)/,
    /\b(?:bio\w*|profil\w*)(?:daki|deki|taki|teki) (?:link|numara|hesap|site)/,
  ],
};

const FOLD = { ş: 's', ç: 'c', ğ: 'g', ö: 'o', ü: 'u', â: 'a', î: 'i', û: 'u' };
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };

/** Folded lowercase words, spaced or dotted letters joined, leetspeak read inside words. */
function wordsOf(text) {
  const s = String(text ?? '')
    .normalize('NFKC')
    .replace(/[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿]/g, '')
    .toLocaleLowerCase('tr')
    .replace(/[şçğöüâîû]/g, (c) => FOLD[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const raw = [];
  for (const m of s.matchAll(/[\p{L}\p{N}@$!]+/gu)) {
    let t = m[0];
    // Leetspeak only in a word that has letters: digits touching a letter ('s1k', 'p0rn0', '4mk'), @ $ ! between
    // two ('s!k'). A number ('2024', '18') or a word ending in '!' stays as it is.
    if (/\p{L}/u.test(t)) {
      t = t.replace(/(?<=[\p{L}\p{N}])[@$!](?=[\p{L}\p{N}])/gu, (c) => LEET[c]);
      t = t.replace(/[013457]+/g, (x, at, w) => (/\p{L}/u.test(w[at - 1] ?? '') || /\p{L}/u.test(w[at + x.length] ?? '') ? [...x].map((c) => LEET[c]).join('') : x));
    }
    t = t.replace(/[@$!]/g, '');
    if (t) raw.push(t);
  }
  // 's i k t i r', 'a.m.k': three or more one-letter words in a row are one word.
  const out = [];
  for (let i = 0; i < raw.length; ) {
    let j = i;
    while (j < raw.length && /^\p{L}$/u.test(raw[j])) j++;
    if (j - i >= 3) {
      out.push(raw.slice(i, j).join(''));
      i = j;
    } else {
      out.push(raw[i]);
      i++;
    }
  }
  return { words: out, adult: /(?:^|[^\p{N}])(?:\+\s?18|18\s?\+)(?!\p{N})/u.test(s) };
}

const esc = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 'sik' → s+i+k+ (any letter typed many times), ı → [ıi]+ ; a root ('orospu*') may go on. */
function entryRe(entry) {
  const root = entry.endsWith('*');
  const w = root ? entry.slice(0, -1) : entry;
  const body = [...w.replace(/[şçğöüâîû]/g, (c) => FOLD[c])].map((c) => (c === 'ı' ? '[ıi]+' : `${esc(c)}+`)).join('');
  return new RegExp(`^${body}${root ? '' : '$'}`, 'u');
}

const COMPILED = Object.fromEntries(Object.entries(WORDS).map(([k, list]) => [k, list.map(entryRe)]));
const ORDER = ['swear', 'sexual', 'ad'];

/** Whether `text` may go in Anlar; if not, which kind of text it is. */
export function checkSpam(text) {
  const { words, adult } = wordsOf(text);
  if (adult) return { ok: false, category: 'sexual' };
  if (!words.length) return { ok: true };
  for (const k of ORDER) if (words.some((w) => COMPILED[k].some((re) => re.test(w)))) return { ok: false, category: k };
  // Phrases read the words with ı as i, so 'satılır' and 'satilir' are the same.
  const flat = words.join(' ').replace(/ı/g, 'i');
  for (const k of ORDER) if ((PHRASES[k] ?? []).some((re) => re.test(flat))) return { ok: false, category: k };
  return { ok: true };
}
