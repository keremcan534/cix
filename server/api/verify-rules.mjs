// Kimlik ve yüz doğrulamasının kuralları (verify.mjs; docs/YUZ_DOGRULAMA.md): the consent texts, what the provider's
// answer means, when a check goes to staff, the webhook signature and the name check of a payout's account holder.
// Pure: no database, no core.mjs, so streamer-rule.mjs can import it without a cycle and the tests can call it.
import crypto from 'node:crypto';

/** The two checks: an ID document (for taking money out) and the face against the profile photo (the blue badge). */
export const KINDS = ['id', 'face'];
/** Didit's list price per check (USD, Nov 2026: didit.me/pricing), for the monthly budget (Canlı ayarlar). */
export const PRICE_USD = { id: 0.33, face: 0.15 };
/** Days the provider keeps a decided check's images and data before verify.mjs deletes them (an appeal's time). */
export const KEEP_DAYS = 30;
/** Sessions one person may open per kind in 24 hours (each one costs). */
export const DAILY_TRIES = 3;
/** A session left open this long is reopened (the provider's link may have gone stale). */
export const OPEN_MINUTES = 60;
/** A session never finished is closed (expired) after this long. */
export const ABANDON_HOURS = 48;

/**
 * The explicit consent the person gives before a check (KVKK m.6, UK GDPR art. 9: face matching is biometric data),
 * separate from the sign-up terms, box unticked. The app shows these texts as the server sends them and sends back
 * the version it showed; another version now is a 409 consent_changed and nothing opens. A changed text gets a new
 * version. Draft: the owners' lawyer has to approve the wording (docs/YUZ_DOGRULAMA.md).
 */
export const CONSENT = {
  id: {
    version: 'id-2026-11-26',
    title: 'Kimlik doğrulaması: aydınlatma ve açık rıza',
    lines: [
      'Ne yapılır: Kimlik kartının ya da pasaportunun fotoğrafını çekersin, ardından kısa bir canlı selfie. Yüzün kimlikteki fotoğrafla karşılaştırılır.',
      'Neden: Para çekme ve ödemelerde hesabın gerçekten sana ait olduğunu, 18 yaşından büyük olduğunu ve ödeme hesabının senin adına olduğunu doğrulamak; dolandırıcılığı önlemek.',
      'Kim işler: Veri sorumlusu SIMILARCLUB LTD (Birleşik Krallık). Doğrulamayı bizim adımıza Didit yapar; verin Avrupa Birliği’nde (İrlanda) işlenir, yani Türkiye dışına aktarılır.',
      'Ne saklanır: Bizde yalnız sonuç kalır: kimlikteki ad, cinsiyet, 18 yaşından büyük olup olmadığın, kimliği veren ülke ve kimlik numarasından üretilen, geri çevrilemeyen bir iz (aynı kimliğin başka hesapta kullanılmasını önlemek için). Fotoğraflar ve yüz verisi bizde tutulmaz; sağlayıcıdaki kopya karardan 30 gün sonra silinir.',
      'İsteğe bağlı: Rıza vermezsen uygulamayı kullanmaya devam edersin. Para çekmek için Destek’ten yüz taraması olmayan başka bir doğrulama isteyebilirsin.',
      'Geri alma: Rızanı istediğin an bu ekrandan geri alırsın; sonuç ve sağlayıcıdaki kopya silinir. Haklarının tamamı Gizlilik Politikası ve KVKK Aydınlatma Metni’nde.',
    ],
    accept: 'Okudum. Kimlik ve yüz verilerimin bu amaçla işlenmesine ve yurt dışına aktarılmasına açık rıza veriyorum.',
  },
  face: {
    version: 'face-2026-11-26',
    title: 'Gerçek kişi rozeti: aydınlatma ve açık rıza',
    lines: [
      'Ne yapılır: Kısa bir canlı selfie çekersin; yüzün profil fotoğrafınla karşılaştırılır.',
      'Neden: Profil fotoğrafındaki kişinin gerçekten sen olduğunu göstermek (mavi rozet), sahte ve çalıntı profilleri önlemek.',
      'Kim işler: Veri sorumlusu SIMILARCLUB LTD (Birleşik Krallık). Doğrulamayı bizim adımıza Didit yapar; verin Avrupa Birliği’nde (İrlanda) işlenir, yani Türkiye dışına aktarılır.',
      'Ne saklanır: Bizde yalnız sonuç ve eşleşen profil fotoğrafının adresi kalır. Selfie ve yüz verisi bizde tutulmaz; sağlayıcıdaki kopya karardan 30 gün sonra silinir.',
      'Rozet profil fotoğrafını değiştirince düşer; istersen yeniden doğrularsın.',
      'İsteğe bağlı: Rıza vermezsen hiçbir şey kısıtlanmaz, yalnız rozet olmaz. Rızanı istediğin an bu ekrandan geri alırsın; rozet ve sonuç silinir.',
    ],
    accept: 'Okudum. Yüz verimin bu amaçla işlenmesine ve yurt dışına aktarılmasına açık rıza veriyorum.',
  },
};

/** Why a check went to staff (identity_checks.reasons), as the panel shows it. */
export const REASON_LABEL = {
  under_18: 'Kimliğe göre 18 yaşından küçük',
  no_age: 'Kimlikte doğum tarihi okunamadı',
  no_name: 'Kimlikte ad okunamadı',
  sex_mismatch: 'Kimlikteki cinsiyet hesaptakiyle uyuşmuyor',
  no_sex: 'Kimlikte cinsiyet okunamadı',
  duplicate_document: 'Aynı kimlik başka bir hesapta kullanılmış',
  duplicate_face: 'Aynı yüz başka bir doğrulamada görülmüş',
  provider_review: 'Sağlayıcı inceliyor',
  staff_reset: 'Yönetim sıfırladı',
};
export const STATUS_LABEL = { pending: 'Bekliyor', approved: 'Onaylandı', review: 'İncelemede', declined: 'Reddedildi', expired: 'Yarım kaldı' };

/** Whether the provider is set up for `kind` (.env): without its keys that check is off and nothing requires it. */
export function providerReady(e, kind = 'id') {
  if (!e.DIDIT_API_KEY || !e.DIDIT_WEBHOOK_SECRET) return false;
  return kind === 'face' ? !!e.DIDIT_FACE_WORKFLOW : !!e.DIDIT_KYC_WORKFLOW;
}

/** Our status for the provider's session status (Didit: Approved, Declined, In Review, Expired, Abandoned, …). */
export function stateOf(providerStatus) {
  const s = String(providerStatus ?? '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();
  if (s === 'approved') return 'approved';
  if (s === 'declined') return 'declined';
  if (s === 'in review') return 'review';
  if (s === 'expired' || s === 'abandoned' || s === 'kyc expired') return 'expired';
  // Not Started, In Progress, Resubmitted, Awaiting User, and anything new: still open.
  return 'pending';
}

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const first = (...xs) => {
  for (const x of xs) {
    const v = Array.isArray(x) ? x[0] : x;
    if (v && typeof v === 'object') return v;
  }
  return null;
};
/** Age in whole years of a YYYY-MM-DD birth date on `now`, or null. */
export function ageOn(birth, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birth ?? ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let a = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) a -= 1;
  return a >= 0 && a < 150 ? a : null;
}
/** Every warning's code in a decision (the decision's own list and each feature's). */
function warningsOf(d, ...features) {
  const out = [];
  for (const w of [d?.warnings, ...features.map((f) => f?.warnings)]) {
    if (!Array.isArray(w)) continue;
    for (const x of w) {
      const code = str(x?.risk) ?? str(x?.code) ?? str(x?.type) ?? str(x);
      if (code) out.push(code.toUpperCase());
    }
  }
  return out;
}

/**
 * What a provider's decision says, read defensively (a field missing or of another shape is null, never a throw):
 * { status, name, sex: 'F' | 'M' | null, adult: boolean | null, country, docNo, duplicateFace }. Didit's arrays
 * (id_verifications[], face_matches[]) and the older single objects are both read.
 */
export function readDecision(d, now = new Date()) {
  const o = d && typeof d === 'object' ? d : {};
  const idv = first(o.id_verifications, o.id_verification);
  const live = first(o.liveness_checks, o.liveness);
  const fm = first(o.face_matches, o.face_match);
  const out = { status: str(o.status), name: null, sex: null, adult: null, country: null, docNo: null, duplicateFace: false };
  if (idv) {
    out.name = str(idv.full_name) ?? ([str(idv.first_name), str(idv.last_name)].filter(Boolean).join(' ') || null);
    const g = (str(idv.gender) ?? str(idv.sex) ?? '').toUpperCase();
    out.sex = ['F', 'FEMALE', 'K', 'KADIN'].includes(g) ? 'F' : ['M', 'MALE', 'E', 'ERKEK'].includes(g) ? 'M' : null;
    const age = Number.isInteger(idv.age) ? idv.age : ageOn(idv.date_of_birth, now);
    out.adult = age === null ? null : age >= 18;
    out.country = (str(idv.issuing_state) ?? str(idv.issuing_country) ?? str(idv.nationality))?.toUpperCase().slice(0, 3) ?? null;
    out.docNo = str(idv.document_number)?.replace(/[\s-]+/g, '').toUpperCase() ?? null;
  }
  const codes = warningsOf(o, idv, live, fm);
  const linked = o.linked_records ?? o.duplicates;
  const anyLinked = linked && typeof linked === 'object' && Object.values(linked).some((v) => (Array.isArray(v) ? v.length > 0 : !!v));
  out.duplicateFace = anyLinked || codes.some((c) => /DUPLICAT|POSSIBLE_MATCH|SAME_FACE|FACE_SEARCH/.test(c));
  return out;
}

/** The account's gender as the document's sex letter (null when not said). */
const sexOfGender = (g) => (g === 'Kadın' ? 'F' : g === 'Erkek' ? 'M' : null);

/**
 * Why an ID check the provider approved still goes to staff (empty: approved). `gender` is the account's;
 * `duplicateDoc`: the same document is on another account's check.
 */
export function idReasons(r, gender, duplicateDoc) {
  const reasons = [];
  if (r.adult === false) reasons.push('under_18');
  if (r.adult === null) reasons.push('no_age');
  if (!r.name) reasons.push('no_name');
  const want = sexOfGender(gender);
  if (want && r.sex && r.sex !== want) reasons.push('sex_mismatch');
  // A woman's account takes money out because it is a woman's (streamer-rule.mjs): the document must say so.
  if (want === 'F' && !r.sex) reasons.push('no_sex');
  if (duplicateDoc) reasons.push('duplicate_document');
  if (r.duplicateFace) reasons.push('duplicate_face');
  return reasons;
}

/** The document's mark for the duplicate check: an HMAC of country + number (never the number itself), or null. */
export const docHash = (key, country, docNo) => (key && docNo ? crypto.createHmac('sha256', key).update(`${country ?? ''}:${docNo}`).digest('hex') : null);

const TR_FOLD = { ç: 'c', ğ: 'g', ı: 'i', i̇: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
/** A name's words, lower case and without Turkish letters or marks: "ŞEYMA  Nur-Öztürk" → ['seyma', 'nur', 'ozturk']. */
export function nameWords(s) {
  return String(s ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/i̇/g, 'i')
    .replace(/[çğıöşüâîû]/g, (ch) => TR_FOLD[ch] ?? ch)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/)
    .filter((w) => w.length > 0);
}
/**
 * Whether a payout's account holder is the person on the document: the holder names at least two words and every
 * one is on the document, or the document's first and last names are both in the holder. null without a document.
 */
export function holderMatches(holder, docName) {
  const doc = nameWords(docName);
  if (!doc.length) return null;
  const h = nameWords(holder);
  const docSet = new Set(doc);
  if (h.length >= 2 && h.every((w) => docSet.has(w))) return true;
  const hSet = new Set(h);
  return doc.length >= 2 && hSet.has(doc[0]) && hSet.has(doc.at(-1));
}

/** JSON with every object's keys sorted, compact, Unicode kept: what Didit's X-Signature-V2 signs. */
export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/**
 * Whether a webhook is Didit's: X-Timestamp within 5 minutes, and X-Signature (HMAC-SHA256 of the raw body, hex)
 * or X-Signature-V2 (of the sorted-key JSON) made with the destination's secret. Compared in constant time.
 */
export function signatureOk(raw, headers, secret, nowMs = Date.now()) {
  if (!secret) return false;
  const ts = Number(headers?.['x-timestamp']);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > 300) return false;
  const mac = (s) => crypto.createHmac('sha256', secret).update(s, 'utf8').digest('hex');
  const eq = (a, b) => {
    const x = Buffer.from(String(a ?? '').trim().toLowerCase(), 'utf8');
    const y = Buffer.from(b, 'utf8');
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  };
  if (headers['x-signature'] && eq(headers['x-signature'], mac(raw))) return true;
  if (headers['x-signature-v2']) {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return false;
    }
    if (eq(headers['x-signature-v2'], mac(canonicalJson(body)))) return true;
  }
  return false;
}
