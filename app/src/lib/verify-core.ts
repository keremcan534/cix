// Kimlik ve yüz doğrulaması (server/api/verify.mjs, docs/YUZ_DOGRULAMA.md): the server's answer read defensively (a
// malformed one is no state, a check of another shape is none, never a crash) and what the screen says about it.
// Pure: tests/verify-core.test.ts.

export type VerifyKind = 'id' | 'face';
export type VerifyStatus = 'pending' | 'approved' | 'review' | 'declined' | 'expired';
export type VerifyCheck = { id: number; kind: VerifyKind; status: VerifyStatus; at: string | null; decidedAt: string | null; reasons: string[]; url: string | null };
/** The explicit consent's text as the server sends it; the screen shows it and sends back its version. */
export type VerifyConsent = { version: string; title: string; lines: string[]; accept: string };
export type VerifyState = {
  on: Record<VerifyKind, boolean>;
  id: VerifyCheck | null;
  face: VerifyCheck | null;
  /** The blue badge: my face matched this very profile photo. */
  verified: boolean;
  /** An approved ID check: money out is open when it is required. */
  idVerified: boolean;
  /** Canlı ayarlar require the ID check for money out now. */
  payoutNeedsId: boolean;
  consent: Record<VerifyKind, VerifyConsent | null>;
};

export const VERIFY_KINDS: VerifyKind[] = ['id', 'face'];
const STATUSES: VerifyStatus[] = ['pending', 'approved', 'review', 'declined', 'expired'];
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** Only the provider's page over https opens (never another scheme an answer might carry). */
export const verifyUrl = (v: unknown): string | null => {
  const s = str(v);
  return s && /^https:\/\/[^\s]+$/.test(s) && s.length <= 1000 ? s : null;
};

export function parseCheck(v: unknown): VerifyCheck | null {
  const o = obj(v);
  if (!o) return null;
  const kind = o.kind === 'id' || o.kind === 'face' ? o.kind : null;
  const status = STATUSES.includes(o.status as VerifyStatus) ? (o.status as VerifyStatus) : null;
  const id = typeof o.id === 'number' && Number.isSafeInteger(o.id) ? o.id : null;
  if (!kind || !status || id === null) return null;
  return {
    id,
    kind,
    status,
    at: str(o.at),
    decidedAt: str(o.decidedAt),
    reasons: Array.isArray(o.reasons) ? o.reasons.filter((x): x is string => typeof x === 'string') : [],
    url: status === 'pending' ? verifyUrl(o.url) : null,
  };
}

export function parseConsent(v: unknown): VerifyConsent | null {
  const o = obj(v);
  if (!o) return null;
  const version = str(o.version);
  const title = str(o.title);
  const accept = str(o.accept);
  const lines = Array.isArray(o.lines) ? o.lines.filter((x): x is string => typeof x === 'string' && !!x) : [];
  return version && title && accept && lines.length ? { version, title, lines, accept } : null;
}

/** GET /api/verify; null when it isn't one (an older server has no such call: 404, also null upstream). */
export function parseVerifyState(v: unknown): VerifyState | null {
  const o = obj(v);
  if (!o) return null;
  const on = obj(o.on);
  const consent = obj(o.consent);
  return {
    on: { id: on?.id === true, face: on?.face === true },
    id: parseCheck(o.id),
    face: parseCheck(o.face),
    verified: o.verified === true,
    idVerified: o.idVerified === true,
    payoutNeedsId: o.payoutNeedsId === true,
    consent: { id: parseConsent(consent?.id), face: parseConsent(consent?.face) },
  };
}

/** The card's title and what it is for. */
export const KIND_TEXT: Record<VerifyKind, { title: string; why: string; done: string }> = {
  id: {
    title: 'Kimlik doğrulaması',
    why: 'Para çekmek ve ajans ödemesi almak için. Kimlik kartının ya da pasaportunun fotoğrafını ve kısa bir canlı selfie çekersin.',
    done: 'Kimliğin doğrulandı. Para çekebilirsin.',
  },
  face: {
    title: 'Gerçek kişi rozeti',
    why: 'İsteğe bağlı. Kısa bir canlı selfie çekersin; yüzün profil fotoğrafınla eşleşirse profilinde mavi rozet görünür.',
    done: 'Profil fotoğrafın doğrulandı; mavi rozetin açık. Fotoğrafını değiştirirsen rozet düşer.',
  },
};

/** What the card says about my latest check of `kind` (null: none yet). */
export function statusText(kind: VerifyKind, c: VerifyCheck | null, verifiedNow: boolean): string | null {
  if (verifiedNow) return KIND_TEXT[kind].done;
  if (!c) return null;
  switch (c.status) {
    case 'pending':
      return 'Doğrulama yarım kaldı. Devam etmek için tekrar aç; bitirdiysen sonuç birkaç dakika içinde burada görünür.';
    case 'review':
      if (c.reasons.includes('provider_review')) return 'Doğrulaman inceleniyor. Sonuç genelde bir gün içinde burada görünür.';
      return 'Doğrulaman ekibimizde inceleniyor (bazı bilgiler hesabınla uyuşmadı ya da okunamadı). Sonuç burada görünür; sorun olursa Destek’e yaz.';
    case 'declined':
      if (c.reasons.includes('staff_reset')) return 'Doğrulaman yönetim tarafından sıfırlandı. Yeniden doğrulayabilirsin.';
      return 'Doğrulama tamamlanamadı. Aydınlık bir yerde, kimliğin ve yüzün net görünecek şekilde tekrar dene.';
    case 'expired':
      return 'Önceki doğrulama yarıda kaldı. Yeniden başlatabilirsin.';
    case 'approved':
      // An approved face check for an older photo: the badge dropped with the new one.
      return kind === 'face' ? 'Profil fotoğrafını değiştirdin; rozet için yeni fotoğrafla tekrar doğrula.' : KIND_TEXT.id.done;
  }
}

/** Whether the card offers to (re)start: not while it waits for staff, not once it is done. */
export const canStart = (kind: VerifyKind, s: VerifyState) =>
  s.on[kind] && !(kind === 'id' ? s.idVerified : s.verified) && s[kind]?.status !== 'review';
/** Whether there is anything to withdraw consent for (a check of that kind exists). */
export const canWithdraw = (kind: VerifyKind, s: VerifyState) => !!s[kind];
