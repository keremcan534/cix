// A server room's rules (rooms.rules, jsonb), set in Oda ayarları and Moderasyon and read by every phone in the room
// (rooms.mjs out → app lib/live roomOf). Unknown or broken values fall back to the defaults, so an old row or a
// bad write never breaks a room. In step with the app (data/catalog ROOM_LIMITS, MIC_PERMISSION_MIN_LEVEL,
// BOSS_SEAT_MIN_LEVEL, BOSS_SEAT_MIN_COINS; store MyRoom); app tests/server-catalog.test.ts fails when they drift.
//
//   micPermission  'everyone' | 'members'   who may take a mic (members: the room's members and staff; Lv.4)
//   bossSeat       boolean                  Patron koltuğu: the room's top gifter of the last 24 hours sits on it (Lv.3)
//   joinMode       'open' | 'apply' | 'closed'   how someone becomes a room member
//   manageMembers  'owner' | 'admins'       who answers and removes members
//   manageFunctions 'owner' | 'admins'      who uses the room's tools (yavaş mod, kelime filtresi, oyunlar)
//   autoRemoveDays 0 | 7 | 14 | 30          a member who didn't come in that long is dropped (0: never; staff never)
//   limit          number | null            most people in the room at once (null: the level's most)
//   profileVisible boolean                  the room shows on the owner's profile
//   videoPrivacy   boolean                  phones block screenshots and screen recording in the room
//   bot            boolean                  each phone shows the room's welcome and rules on entry
//   slowMode       boolean                  one chat line per 10 seconds for everyone but staff
//   words          string[]                 the room's own forbidden words (chat lines with them are dropped)
import { HttpError } from './core.mjs';

/** Members (and the people limit) a room of each level may have: app data/catalog ROOM_LIMITS[].members. */
export const ROOM_MEMBER_CAPS = [50, 100, 200, 300, 500, 600, 800, 1_200, 1_350, 1_500, 1_750, 2_000, 2_500, 3_000, 5_000];
export const memberCap = (level) => ROOM_MEMBER_CAPS[Math.min(Math.max(Number(level) || 1, 1), ROOM_MEMBER_CAPS.length) - 1];
/** The people limits Oda ayarları offers (app components/room/owner "Katılımcı limiti"). */
export const LIMIT_OPTIONS = [50, 100, 200, 300, 500, 1_200, 2_000, 5_000];
export const MIC_PERMISSION_MIN_LEVEL = 4;
export const BOSS_SEAT_MIN_LEVEL = 3;
export const BOSS_SEAT_MIN_COINS = 1_000;
/** Seconds between two chat lines of one person while slow mode is on. */
export const SLOW_MODE_SECONDS = 10;
const MAX_WORDS = 30;

export const RULE_DEFAULTS = Object.freeze({
  micPermission: 'everyone',
  bossSeat: false,
  joinMode: 'open',
  manageMembers: 'admins',
  manageFunctions: 'admins',
  autoRemoveDays: 0,
  limit: null,
  profileVisible: true,
  videoPrivacy: false,
  bot: false,
  slowMode: false,
  words: Object.freeze([]),
});

const ONE_OF = {
  micPermission: ['everyone', 'members'],
  joinMode: ['open', 'apply', 'closed'],
  manageMembers: ['owner', 'admins'],
  manageFunctions: ['owner', 'admins'],
  autoRemoveDays: [0, 7, 14, 30],
};
const BOOLS = ['bossSeat', 'profileVisible', 'videoPrivacy', 'bot', 'slowMode'];
/** Rules the room's staff may change (when the owner lets admins run the room's tools); the rest are the owner's. */
const STAFF_RULES = ['slowMode', 'words'];

/** A forbidden word as kept and compared: trimmed, lower case (Turkish), single spaces. */
export const normWord = (w) => String(w).trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
const wordOk = (w) => w.length >= 2 && w.length <= 20 && /^[\p{L}\p{N} ]+$/u.test(w);

/** The room's rules as stored, every field filled in (a broken stored value reads as its default). */
export function rulesOf(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = { ...RULE_DEFAULTS, words: [] };
  for (const [k, list] of Object.entries(ONE_OF)) if (list.includes(r[k])) out[k] = r[k];
  for (const k of BOOLS) if (typeof r[k] === 'boolean') out[k] = r[k];
  if (Number.isInteger(r.limit) && LIMIT_OPTIONS.includes(r.limit)) out.limit = r.limit;
  if (Array.isArray(r.words)) out.words = [...new Set(r.words.filter((w) => typeof w === 'string').map(normWord).filter(wordOk))].slice(0, MAX_WORDS);
  return out;
}

/**
 * Checks a change to the rules from someone of rank `rank` (3 owner, 2 Süper Yönetici, 1 Yönetici) in a room of
 * `level` with the rules `now`; returns the rules after it. Refused (nothing changes) when a value is wrong, the
 * room's level is too low for it or the person may not change that rule.
 */
export function applyRules(now, patch, { rank, level }) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new HttpError(400, 'Geçersiz oda ayarı');
  const keys = Object.keys(patch);
  if (!keys.length) throw new HttpError(400, 'Değişiklik yok');
  const next = { ...now, words: [...now.words] };
  for (const k of keys) {
    const v = patch[k];
    const staffRule = STAFF_RULES.includes(k);
    if (staffRule ? rank < 1 || (now.manageFunctions === 'owner' && rank < 3) : rank < 3) {
      throw new HttpError(403, staffRule ? 'Bu ayarı oda sahibi veya yetkili yöneticiler değiştirir' : 'Bu ayarı yalnızca oda sahibi değiştirir');
    }
    if (ONE_OF[k]) {
      if (!ONE_OF[k].includes(v)) throw new HttpError(400, 'Geçersiz oda ayarı');
      if (k === 'micPermission' && v === 'members' && level < MIC_PERMISSION_MIN_LEVEL) throw new HttpError(403, `Mikrofon izni Lv.${MIC_PERMISSION_MIN_LEVEL} odada açılır`);
      next[k] = v;
    } else if (BOOLS.includes(k)) {
      if (typeof v !== 'boolean') throw new HttpError(400, 'Geçersiz oda ayarı');
      if (k === 'bossSeat' && v && level < BOSS_SEAT_MIN_LEVEL) throw new HttpError(403, `Patron koltuğu Lv.${BOSS_SEAT_MIN_LEVEL} odada açılır`);
      next[k] = v;
    } else if (k === 'limit') {
      if (v !== null && !LIMIT_OPTIONS.includes(v)) throw new HttpError(400, 'Geçersiz katılımcı limiti');
      if (v !== null && v > memberCap(level)) throw new HttpError(403, `Lv.${level} oda en fazla ${memberCap(level).toLocaleString('tr-TR')} kişi alabilir`);
      next.limit = v;
    } else if (k === 'words') {
      if (!Array.isArray(v) || v.length > MAX_WORDS || !v.every((w) => typeof w === 'string')) throw new HttpError(400, `En fazla ${MAX_WORDS} yasaklı kelime eklenebilir`);
      const words = v.map(normWord);
      if (!words.every(wordOk)) throw new HttpError(400, 'Yasaklı kelime 2–20 harf ya da rakam olmalı');
      next.words = [...new Set(words)];
    } else {
      throw new HttpError(400, 'Bilinmeyen oda ayarı');
    }
  }
  return next;
}
