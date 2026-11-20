// Profil izleri's rules (docs/PROFIL_IZLERI.md), apart from profile-marks.mjs so custom-gifts.mjs, the tests and the
// app's drift test can read them without the database. Pure: no core.mjs.
//
// A Muzip gift may leave a mark on its receiver's profile photo ('leave': 💩 Kaka Şakası) or clean one ('clean': 💧
// Temizlik Suyu). Which gift does what is data on the gift rows (custom_gifts mark_role, mark_kind, mark_minutes and
// mark_hours; 101, 105), so the panel can make other pairs; the app's own two gifts start with APP_MARKS. A kind is a
// short word ('kaka', 'kirik-cam'), a row of mark_kinds (105, mark-kinds.mjs: its name, overlay picture, minutes): a
// leave gift and the gifts that clean it share it. A gift that cleans a kind must cost more than every gift that
// leaves it (the owners: "su boktan daha pahalı olmalı"), checked on every save (markPriceProblem).

/** The app's own gifts' rules (catalog.mjs GIFT_ROWS k1 Kaka, k2 Su; app/src/data/mock.ts), until the panel changes them. */
export const APP_MARKS = Object.freeze({
  k1: Object.freeze({ role: 'leave', kind: 'kaka', hours: null, minutes: null }),
  k2: Object.freeze({ role: 'clean', kind: 'kaka', hours: null, minutes: null }),
});
/**
 * The app's gifts an older app doesn't have (no name, picture or price of its own): GET /api/catalog leaves them out
 * unless the phone asks with marks=1 (profile-marks.mjs withMarks). A send of one still goes through.
 */
export const MARK_GIFTS = new Set(Object.keys(APP_MARKS));
export const MARK_ROLES = ['leave', 'clean'];
export const KIND = /^[a-z][a-z0-9-]{0,23}$/;
export const HOURS = Object.freeze({ min: 1, max: 168 });
/** A mark's time in minutes, on a gift or a kind (105): 5 minutes to 7 days. */
export const MINUTES = Object.freeze({ min: 5, max: 10_080 });
/** The Canlı ayar's default (live-registry.mjs mark_hours): how long a mark stays when its gift says nothing. */
export const MARK_HOURS = 24;

const hoursOf = (v) => (Number.isSafeInteger(Number(v)) && Number(v) >= HOURS.min && Number(v) <= HOURS.max ? Number(v) : null);
const minutesOf = (v) => (v !== null && v !== undefined && Number.isSafeInteger(Number(v)) && Number(v) >= MINUTES.min && Number(v) <= MINUTES.max ? Number(v) : null);
/**
 * Whole hours for `minutes`, rounded up (1–168): what an app before minutes (G7: marks=1, hours only) says and what
 * mark_hours keeps beside mark_minutes, so a rolled-back server keeps a mark at least that long.
 */
export const hoursFor = (minutes) => Math.min(HOURS.max, Math.max(HOURS.min, Math.ceil(minutes / 60)));

/**
 * A custom_gifts row's mark columns as stored: undefined when they say nothing (NULL role: as in the app for one of
 * the app's gifts, a plain gift for an admin's), null for 'none', else { role, kind, hours, minutes } (a leave's
 * minutes from mark_minutes, else its hours; both null: the kind's, else the Canlı ayar's; hours rounded up from it).
 */
export function storedMark(r) {
  if (!r || r.mark_role === null || r.mark_role === undefined) return undefined;
  if (!MARK_ROLES.includes(r.mark_role) || !KIND.test(r.mark_kind ?? '')) return null;
  const hours = r.mark_role === 'leave' ? hoursOf(r.mark_hours) : null;
  const minutes = r.mark_role === 'leave' ? (minutesOf(r.mark_minutes) ?? (hours ? hours * 60 : null)) : null;
  return Object.freeze({ role: r.mark_role, kind: r.mark_kind, hours: minutes ? hoursFor(minutes) : null, minutes });
}

/** One of the app's gifts' rule now: what was changed (`stored`, storedMark's), else the app's own (APP_MARKS). */
export const appMarkOf = (id, stored) => (stored === undefined ? (APP_MARKS[id] ?? null) : stored);

/**
 * `mark` in a panel save (POST /api/admin/gifts, /update): undefined (unchanged), null (a plain gift), or
 * { role: 'leave'|'clean', kind, minutes?, hours? } (a leave's time in minutes, 5–10.080, or in whole hours as
 * before, 1–168; neither: the kind's, else the Canlı ayar's). Returns the columns to store (mark_hours rounded up from
 * the minutes), or a Turkish refusal in `error`. Whether the kind exists is the save's to check (mark_kinds).
 */
export function markInput(v) {
  if (v === undefined) return { cols: undefined };
  if (v === null) return { cols: { mark_role: 'none', mark_kind: null, mark_hours: null, mark_minutes: null } };
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  if (!o || !MARK_ROLES.includes(o.role)) return { error: 'Profil izi "bırakır" (leave), "temizler" (clean) ya da yok (null) olmalı' };
  const kind = typeof o.kind === 'string' ? o.kind.trim().toLowerCase() : '';
  if (!KIND.test(kind)) return { error: 'İzin türü küçük harfle kısa bir kelime olmalı (ör. kaka, kirik-cam)' };
  const given = (x) => x !== undefined && x !== null;
  if (o.role === 'clean' && (given(o.hours) || given(o.minutes))) return { error: 'Temizleyen hediyenin süresi olmaz; süre izi bırakan hediyede' };
  let minutes = null;
  if (o.role === 'leave' && given(o.minutes)) {
    minutes = Number.isInteger(o.minutes) ? minutesOf(o.minutes) : null;
    if (minutes === null) return { error: `İzin süresi ${MINUTES.min}–${MINUTES.max.toLocaleString('tr-TR')} dakika arasında bir tam sayı olmalı (boş: türün ya da Canlı ayarlardaki süre)` };
    if (given(o.hours) && o.hours * 60 !== minutes) return { error: 'Süreyi ya dakika ya saat olarak verin' };
  } else if (o.role === 'leave' && given(o.hours)) {
    const hours = hoursOf(o.hours);
    if (hours === null || !Number.isInteger(o.hours)) return { error: `İzin süresi ${HOURS.min}–${HOURS.max} saat arasında bir tam sayı olmalı (boş: Canlı ayarlardaki süre)` };
    minutes = hours * 60;
  }
  return { cols: { mark_role: o.role, mark_kind: kind, mark_hours: minutes ? hoursFor(minutes) : null, mark_minutes: minutes } };
}

const fmt = (n) => n.toLocaleString('tr-TR');
/**
 * Whether saving gift `changed` keeps the rule for its kind: each gift that cleans the kind costs more than each gift
 * that leaves it. `gifts` are every gift as it will be ({ id, name, price, mark }). Null when it does (or the gift has
 * no mark: taking a mark off can't break it); else the Turkish sentence for the panel.
 */
export function markPriceProblem(gifts, changed) {
  const self = gifts.find((g) => g.id === changed);
  if (!self?.mark || !MARK_ROLES.includes(self.mark.role)) return null;
  const kind = self.mark.kind;
  const same = gifts.filter((g) => g.mark?.kind === kind);
  const leave = same.filter((g) => g.mark.role === 'leave');
  const clean = same.filter((g) => g.mark.role === 'clean');
  if (!leave.length || !clean.length) return null;
  const top = leave.reduce((a, b) => (b.price > a.price ? b : a));
  const low = clean.reduce((a, b) => (b.price < a.price ? b : a));
  if (low.price > top.price) return null;
  if (self.mark.role === 'clean') return `${self.name} izi temizlediği için onu bırakan hediyelerden pahalı olmalı: ${top.name} ${fmt(top.price)} jeton, bu ${fmt(self.price)} jeton.`;
  return `${self.name} iz bıraktığı için onu temizleyen hediyelerden ucuz olmalı: ${low.name} ${fmt(low.price)} jeton, bu ${fmt(self.price)} jeton.`;
}

/** "24 saat", "90 dakika", "1 saat 30 dakika", "7 gün": how long a mark of `minutes` stays (the app's durationText too). */
export function durationText(minutes) {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} dakika`;
  if (m % 1440 === 0 && m > 1440) return `${m / 1440} gün`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} saat ${m % 60} dakika` : `${h} saat`;
}

/**
 * The line the receiver reads (push, room, profile): "X sana 💩 attı; 24 saat kalır ya da biri 💧 gönderene kadar".
 * The sender's name stands alone (no Turkish suffix after a name anyone chose); `clean` is the cleaning gift's emoji
 * (none: no gift cleans it now, the time alone).
 */
export function markNotice(fromName, emoji, minutes, clean) {
  return `${fromName} sana ${emoji} attı; ${durationText(minutes)} kalır${clean ? ` ya da biri ${clean} gönderene kadar` : ''}`;
}

/**
 * What a leave gift does while `name`'s photo shows a mark of another kind (the owners' decision, 20 Nov 2026): nothing
 * to the mark; the gift goes as a plain gift. The sentence the sender's app shows (the send's answer `markNote`; the
 * name stands alone, as everywhere: no suffix after a name anyone chose).
 */
export const keptNote = (name, giftName) => `${name ?? 'Bu kişi'}, profilinde zaten bir iz var; ${giftName} düz hediye olarak gitti.`;

// --- Who may leave a mark on me (Gizlilik, privacy.mjs marksFrom) ------------------------------------------------
/** "Kimler profilime iz bırakabilir": everyone, the people I follow (the default, the owners' decision), nobody. */
export const MARKS_FROM = ['everyone', 'following', 'nobody'];
export const MARKS_FROM_DEFAULT = 'following';
/**
 * Who may mark someone, from their privacy_settings columns (or a LEFT JOIN's nulls): "Profilime iz bırakılmasın"
 * (profile_marks false, the switch older apps still have) is nobody whatever marks_from says.
 */
export const marksRuleOf = (profileMarks, marksFrom) => (profileMarks === false ? 'nobody' : MARKS_FROM.includes(marksFrom) ? marksFrom : MARKS_FROM_DEFAULT);
/** Whether `rule` lets a sender the receiver follows (`followed`) or not leave a mark. */
export const marksAllow = (rule, followed) => rule === 'everyone' || (rule === 'following' && followed);

// --- A kind's overlay picture (mark-kinds.mjs, tools/mark-art-check.py) -------------------------------------------
/**
 * What an uploaded overlay must be: a still, square PNG or WebP of 256–2048 px, at most 10 MB; phones get it at most
 * 512 px and 300 KB (made smaller here when it is bigger). Over the round photo it must leave the photo seen: at
 * least 30 % of its pixels fully transparent (alpha 0), and at most 20 % of the face (the middle circle, 30 % of the
 * side from the centre) more than half opaque. Kaka İzi, drawn by the app's scripts/mark-art.py: 50 % and 14 %.
 */
export const MARK_ART = Object.freeze({ minPx: 256, maxPx: 2048, servePx: 512, serveBytes: 300 * 1024, clearMin: 0.3, faceMax: 0.2, faceRadius: 0.3 });
const pct = (x) => `%${Math.round(x * 100)}`;
// The third-person possessive ending after a whole number as it is read aloud ("%30'u", "%20'si", "%40'ı", "%14'ü"):
// the last spoken word decides (bir, iki, üç…; on, yirmi, otuz…; yüz; bin). The panel's web/mark-kinds.js has the same.
const UNIT_END = ['', 'i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u'];
const TEN_END = ['', 'u', 'si', 'u', 'ı', 'si', 'ı', 'i', 'i', 'ı'];
export function possessiveEnd(n) {
  const v = Math.abs(Math.round(n));
  if (v === 0) return 'ı';
  if (v % 10) return UNIT_END[v % 10];
  if (v % 100) return TEN_END[(v / 10) % 10];
  return v % 1000 ? 'ü' : 'i';
}
/** A share as a percentage with its possessive ending: "%30'u", "%20'si". */
const pctOf = (x) => `${pct(x)}'${possessiveEnd(Math.round(x * 100))}`;
/**
 * Why an overlay can't be used, from its header (`info`, custom-gifts.mjs imageInfo) and what the checker measured
 * (`stats`: { width, height, frames, clear, face }), as the Turkish sentence the panel shows; null when it can.
 */
export function markArtProblem(info, stats) {
  if (!info) return 'İz resmi PNG ya da WebP olmalı';
  if (info.animated || (stats && stats.frames > 1)) return 'İz resmi hareketsiz olmalı: hareketli PNG ya da WebP değil, tek kare bir resim yükleyin';
  const { width: w, height: h } = info;
  if (Math.abs(w - h) > Math.max(2, w * 0.02)) return `İz resmi kare olmalı (bu ${w} × ${h}); 512 × 512 önerilir`;
  if (w < MARK_ART.minPx || w > MARK_ART.maxPx) return `İz resmi ${MARK_ART.minPx}–${MARK_ART.maxPx} piksel olmalı (bu ${w} × ${h}); 512 × 512 önerilir`;
  if (!info.alpha) return 'İz resminde saydamlık yok: arka planı tam saydam (alfa 0) bir PNG ya da WebP yükleyin';
  if (!stats) return null;
  if (stats.clear < MARK_ART.clearMin) {
    return `İz resminin en az ${pctOf(MARK_ART.clearMin)} tam saydam (alfa 0) olmalı, bunda ${pct(stats.clear)}: fotoğraf görünmez kalır. Arka planı silinmiş, kenarlarda çizim olan bir resim yükleyin`;
  }
  if (stats.face > MARK_ART.faceMax) {
    return `İz resmi yüzü kapatıyor: ortadaki dairenin en çok ${pctOf(MARK_ART.faceMax)} dolu olabilir, bunda ${pct(stats.face)}. Çizimi kenarlara alın, ortayı boş bırakın`;
  }
  return null;
}
