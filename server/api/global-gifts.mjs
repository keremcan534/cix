// Global hediye (Güncelleme 7, item 12; docs/HEDIYE_YONETIMI.md "Global hediye"): a gift the admins marked global in
// Yönetim › Hediyeler (custom_gifts.global, 102) is told, once its send is paid, to everyone with the app open in the
// sender's country: a banner on top of the room they are in and a line in its chat ("Kaan → Artemis'e 🚀 Roket
// gönderdi"). Its video plays only in the room it was sent in, as any gift's: no phone elsewhere fetches it.
//
// Which gift may be global: one of at least Canlı ayarlar › Global hediye › "en düşük fiyat" (global_gift_min_price,
// 300.000 coins); never a bond gift (bonds.mjs: a request that may be refused, or bond points between two who have
// the bond), Koruma Kartı (guards.mjs), a gift that leaves or cleans a profile mark (profile-marks.mjs: Kaka would
// shame its receiver in every room) nor a Şanslı package (lucky.mjs: a game of chance is never promoted; its packages
// aren't Hediyeler's gifts and its sends never come here). A save that would break this is refused (globalSave;
// custom-gifts.mjs checkMarkPrices for the marks); a gift left under a minimum raised later stays marked but isn't
// global (globalNow): no banner, no `global` in the catalog.
//
// Who hears it: the live lines opened with ?global=1 (live-line.mjs lineGlobal; an older app's line never asks, since
// it would take an unknown event for "read everything again") whose owner's profile country (profile_extras.country,
// none counts as TR) is the sender's, and who isn't in a block either way with the sender or the receiver. Each of
// the two may choose in Gizlilik "Adım genel duyurularda görünmesin" (privacy.mjs globalHideName): then no id, name or
// photo goes out for them (the phones write "Bir kullanıcı"). Only a paid send (POST /api/gifts/send) in an open
// server room is announced, never a replay of one; a send from a one-to-one chat, a profile, the family chat or Anlar
// is a gift between two people and stays between them (only the room's gift sheet shows the Global badge and shelf;
// the review of Güncelleme 7). Çantam's free gifts aren't announced (backpack.mjs).
//
// Which room it names: the room only when anyone could see that the two are in it. Not a room for its members only
// (room_type 'private') or one with a password, not a resting room, and not when the sender or the receiver turned
// off "Bulunduğum odayı göster" (presence-room.mjs shownRoomOf's rules, less those that depend on who looks) or hid
// their name (a room's title, "Kaan'ın odası", would name them). Then `room` is null: the banner names no room.
//
// Pacing: at most one announcement every global_gift_gap_seconds (10 s). While one waits, the same sender's sends of
// the same gift to the same person add to it (×N). At most PENDING_MAX wait; one that waited STALE_MS is dropped. The
// queue and the lines live in this process's memory (one API process): several processes would need a shared channel
// (Postgres LISTEN/NOTIFY or Redis) and one queue (docs/DENETIM.md).
//
// The event: { type: 'global_gift', id (the first send's gift_events id), from { id, name, avatar }, to { id, name },
//   gift { id, name, emoji, icon }, count, room { id, title, locked: false } | null (a room it may not name, above) }.
//   `locked` stays for the phones that read it: a room that would be locked is never named any more.
import { BOND_GIFTS } from './catalog.mjs';
import { HttpError, db, filesOut } from './core.mjs';
import { GUARD_CARD } from './guard-rules.mjs';
import { globalListeners, lineGlobal } from './live-line.mjs';
import { live } from './live-settings.mjs';

const PENDING_MAX = 20;
const STALE_MS = 3 * 60_000;
const fmt = (n) => Number(n).toLocaleString('tr-TR');

/**
 * Why `gift` ({ id, price, mark? }) can't be global now (Turkish, for the panel), or null when it can. A gift that
 * leaves or cleans a profile mark (profile-marks.mjs: Kaka, Su) never is: a save that would make one is refused
 * (custom-gifts.mjs checkMarkPrices), and this keeps it unannounced whatever the rows say.
 */
export function globalRefusal({ id = null, price, mark = null }, s = live()) {
  if (id && BOND_GIFTS.has(id)) return 'Bağ hediyesi global olamaz: bağ isteği ya da bağ puanı olarak gider';
  if (id === GUARD_CARD) return 'Koruma Kartı global olamaz';
  if (mark?.role === 'leave' || mark?.role === 'clean') return 'Profil izi bırakan ya da temizleyen hediye global olamaz';
  const min = s.globalGiftMinPrice;
  if (!(Number(price) >= min)) return `Global hediye en az ${fmt(min)} jeton olmalı (bu ${fmt(price)} jeton)`;
  return null;
}
/** Whether a gift as custom-gifts.mjs reads it ({ id, price, global }) is global now. */
export const globalNow = (g, s = live()) => g?.global === true && !globalRefusal(g, s);
/** The minimum the panel shows next to the box. */
export const globalMinPrice = () => live().globalGiftMinPrice;

/**
 * `global` in a gift save (POST /api/admin/gifts and /update): the value to store (true, or null: not global), or
 * undefined when the body leaves it. A save that leaves the gift global with something that bears on it (ticked now,
 * a new price) is checked: 400 with the reason. `was`: the gift's flag before the save.
 */
export function globalSave(b, { id = null, price, was = false }) {
  if (b.global !== undefined && typeof b.global !== 'boolean') throw new HttpError(400, 'Global seçimi geçersiz');
  const on = b.global ?? was === true;
  if (on && (b.global !== undefined || b.price !== undefined)) {
    const why = globalRefusal({ id, price });
    if (why) throw new HttpError(400, why);
  }
  return b.global === undefined ? undefined : b.global || null;
}

const clip = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : null);
let pending = [];
let lastAt = 0;
let timer = null;
let busy = false;

/**
 * A paid send of a global gift (gifts.mjs, after its transaction and never on a replay): `sender` and `to` user ids,
 * `gift` as giftOf gives it (with its icon), `roomId` the server room it was sent in (null: a chat or a profile, never
 * announced). Queued for the next free moment (pacing). Best effort and never throws: the send is done and paid by now.
 */
export async function announceGlobalGift({ sender, to, gift, count, eventId, roomId = null }) {
  if (!roomId) return;
  try {
    // As Postgres writes them, so the merge key and the lookups below match.
    sender = String(sender).toLowerCase();
    to = String(to).toLowerCase();
    const [people, room] = await Promise.all([
      db.query(
        `SELECT u.id, u.name, u.avatar_url, coalesce(p.global_hide_name, false) AS hide, coalesce(p.show_current_room, true) AS shows_room,
                coalesce(x.country, 'TR') AS country
           FROM users u LEFT JOIN privacy_settings p ON p.user_id = u.id LEFT JOIN profile_extras x ON x.user_id = u.id
          WHERE u.id = ANY($1::uuid[])`,
        [[sender, to]],
      ),
      db.query(
        "SELECT id, title, password_hash IS NULL AND room_type <> 'private' AND paused_at IS NULL AS open FROM rooms WHERE id = $1 AND closed_at IS NULL",
        [roomId],
      ),
    ]);
    const a = people.rows.find((x) => x.id === sender);
    const b = people.rows.find((x) => x.id === to);
    const r = room.rows[0];
    if (!a || !b || !r) return;
    const named = r.open === true && a.shows_room && b.shows_room && !a.hide && !b.hide;
    queue({
      key: `${sender}:${to}:${gift.id}`,
      at: Date.now(),
      sender,
      to,
      country: a.country,
      event: {
        type: 'global_gift',
        id: eventId,
        from: a.hide ? { id: null, name: null, avatar: null } : { id: a.id, name: clip(a.name, 60), avatar: clip(a.avatar_url, 500) },
        to: b.hide ? { id: null, name: null } : { id: b.id, name: clip(b.name, 60) },
        gift: { id: gift.id, name: clip(gift.name, 40), emoji: clip(gift.emoji, 16), icon: clip(gift.icon, 600) },
        count,
        room: named ? { id: r.id, title: clip(r.title, 80), locked: false } : null,
      },
    });
  } catch (e) {
    console.error('global gift', String(e?.message ?? e).slice(0, 200));
  }
}

/** One more announcement: added to a waiting one of the same sender, receiver and gift, else in line. */
function queue(item) {
  const same = pending.find((p) => p.key === item.key);
  if (same) same.event.count += item.event.count;
  else if (pending.length >= PENDING_MAX) console.warn('global gift: too many waiting, one dropped');
  else pending.push(item);
  pump();
}

/** Sends the first waiting announcement once the gap since the last one has passed. */
function pump() {
  if (busy || timer) return;
  pending = pending.filter((p) => Date.now() - p.at < STALE_MS);
  if (!pending.length) return;
  const wait = lastAt + live().globalGiftGapSeconds * 1000 - Date.now();
  if (wait > 0) {
    timer = setTimeout(() => {
      timer = null;
      pump();
    }, wait);
    timer.unref();
    return;
  }
  const item = pending.shift();
  busy = true;
  lastAt = Date.now();
  deliver(item)
    .catch((e) => console.error('global gift', String(e?.message ?? e).slice(0, 200)))
    .finally(() => {
      busy = false;
      pump();
    });
}

/** To the lines that asked for global gifts whose owner is of the sender's country and in no block with either. */
async function deliver(item) {
  const ids = globalListeners();
  if (!ids.length) return;
  const r = await db.query(
    `SELECT x.id FROM unnest($1::uuid[]) AS x(id) LEFT JOIN profile_extras p ON p.user_id = x.id
      WHERE coalesce(p.country, 'TR') = $2
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = x.id AND b.blocked = ANY($3::uuid[])) OR (b.blocked = x.id AND b.blocker = ANY($3::uuid[])))`,
    [ids, item.country, [item.sender, item.to]],
  );
  // The photo and the icon at the address phones load them (core.mjs filesOut), like every HTTP answer.
  lineGlobal(
    r.rows.map((x) => x.id),
    filesOut(JSON.stringify(item.event)),
  );
}
