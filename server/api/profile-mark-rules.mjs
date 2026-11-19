// Profil izleri's rules (docs/PROFIL_IZLERI.md), apart from profile-marks.mjs so custom-gifts.mjs, the tests and the
// app's drift test can read them without the database. Pure: no core.mjs.
//
// A gift may leave a mark on its receiver's profile photo ('leave': 💩 Kaka) or clean one ('clean': 💧 Su). Which gift
// does what is data on the gift rows (custom_gifts mark_role, mark_kind, mark_hours; 101_profile_marks.sql), so the
// panel can make other pairs; the app's own two gifts start with APP_MARKS. A kind is a short word ('kaka'): a leave
// gift and the gifts that clean it share it. A gift that cleans a kind must cost more than every gift that leaves it
// (the owners: "su boktan daha pahalı olmalı"), checked on every save (markPriceProblem).

/** The app's own gifts' rules (catalog.mjs GIFT_ROWS k1 Kaka, k2 Su; app/src/data/mock.ts), until the panel changes them. */
export const APP_MARKS = Object.freeze({
  k1: Object.freeze({ role: 'leave', kind: 'kaka', hours: null }),
  k2: Object.freeze({ role: 'clean', kind: 'kaka', hours: null }),
});
/**
 * The app's gifts an older app doesn't have (no name, picture or price of its own): GET /api/catalog leaves them out
 * unless the phone asks with marks=1 (profile-marks.mjs withMarks). A send of one still goes through.
 */
export const MARK_GIFTS = new Set(Object.keys(APP_MARKS));
export const MARK_ROLES = ['leave', 'clean'];
export const KIND = /^[a-z][a-z0-9-]{0,23}$/;
export const HOURS = Object.freeze({ min: 1, max: 168 });
/** The Canlı ayar's default (live-registry.mjs mark_hours): how long a mark stays when its gift says nothing. */
export const MARK_HOURS = 24;

const hoursOf = (v) => (Number.isSafeInteger(Number(v)) && Number(v) >= HOURS.min && Number(v) <= HOURS.max ? Number(v) : null);

/**
 * A custom_gifts row's mark columns as stored: undefined when they say nothing (NULL role: as in the app for one of
 * the app's gifts, a plain gift for an admin's), null for 'none', else { role, kind, hours } (hours null: the Canlı
 * ayar's).
 */
export function storedMark(r) {
  if (!r || r.mark_role === null || r.mark_role === undefined) return undefined;
  if (!MARK_ROLES.includes(r.mark_role) || !KIND.test(r.mark_kind ?? '')) return null;
  return Object.freeze({ role: r.mark_role, kind: r.mark_kind, hours: r.mark_role === 'leave' ? hoursOf(r.mark_hours) : null });
}

/** One of the app's gifts' rule now: what was changed (`stored`, storedMark's), else the app's own (APP_MARKS). */
export const appMarkOf = (id, stored) => (stored === undefined ? (APP_MARKS[id] ?? null) : stored);

/**
 * `mark` in a panel save (POST /api/admin/gifts, /update): undefined (unchanged), null (a plain gift), or
 * { role: 'leave'|'clean', kind, hours? }. Returns the columns to store, or a Turkish refusal in `error`.
 */
export function markInput(v) {
  if (v === undefined) return { cols: undefined };
  if (v === null) return { cols: { mark_role: 'none', mark_kind: null, mark_hours: null } };
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  if (!o || !MARK_ROLES.includes(o.role)) return { error: 'Profil izi "bırakır" (leave), "temizler" (clean) ya da yok (null) olmalı' };
  const kind = typeof o.kind === 'string' ? o.kind.trim().toLowerCase() : '';
  if (!KIND.test(kind)) return { error: 'İzin türü küçük harfle kısa bir kelime olmalı (ör. kaka)' };
  if (o.role === 'clean' && o.hours !== undefined && o.hours !== null) return { error: 'Temizleyen hediyenin süresi olmaz; süre izi bırakan hediyede' };
  let hours = null;
  if (o.role === 'leave' && o.hours !== undefined && o.hours !== null) {
    hours = hoursOf(o.hours);
    if (hours === null || !Number.isInteger(o.hours)) return { error: `İzin süresi ${HOURS.min}–${HOURS.max} saat arasında bir tam sayı olmalı (boş: Canlı ayarlardaki süre)` };
  }
  return { cols: { mark_role: o.role, mark_kind: kind, mark_hours: hours } };
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

/**
 * The line the receiver reads (push, room, profile): "X sana 💩 attı; 24 saat kalır ya da biri 💧 gönderene kadar".
 * The sender's name stands alone (no Turkish suffix after a name anyone chose); `clean` is the cleaning gift's emoji
 * (none: no gift cleans it now, the time alone).
 */
export function markNotice(fromName, emoji, hours, clean) {
  return `${fromName} sana ${emoji} attı; ${hours} saat kalır${clean ? ` ya da biri ${clean} gönderene kadar` : ''}`;
}
