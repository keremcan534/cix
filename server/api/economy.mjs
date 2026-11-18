// Ekonomi: the server owns what people buy in Mağaza (frames, entries, rides, bubbles, special IDs, sticker packs,
// mic effects) and noble rank. One entitlements row per grant (migrations/020_economy.sql); a row is live while it
// is not revoked, has started and has not ended, checked against now() on every read, with no job. What someone
// owns is their Çantam (docs/CANTA.md): bought in Çarşı, given by the staff, or a reward (grantReward: an event they
// attended, a task, a level or VIP reached; 085 `source` and `origin`), each item with where it came from.
//
//   GET  /api/economy                                   → economy (below)
//   POST /api/shop/buy     { sku, price, days?, ref }   → { user, replay, economy }   (days: a Rütbe tier's, as shown)
//   POST /api/shop/equip   { slot, sku | null }         → { economy }
//   GET  /api/looks?ids=a,b                             → { looks: { [id]: look + { name, avatarUrl } } }   (what others
//                                                         see; at most 50; no name or photo of someone who blocked me)
//   POST /api/wallet/spend { amount, reason, ref }      → { user, replay }   (old apps: their item spends become buys)
//   GET  /api/admin/economy/user?id=                    (admin) → { user, items, rewardCoins, rewards, reviews }
//   POST /api/admin/economy/grant  { userId, sku, days?, reason, ref }   (admin) → { replay, item }
//   POST /api/admin/economy/revoke { id, reason }                        (admin) → { item }
//   GET  /api/admin/economy/reviews                     (admin) → { rows }   (refund reviews of the last 90 days)
//
// A buy is one transaction: the row, the charge and the equip land together or not at all, so a refusal never
// charges and a charge always leaves the item on the server. Reward coins ('odul') pay for the shop first; special
// IDs take only bought coins. Timed items stack: a re-buy starts where the last term ends, never more than 365 days
// ahead. A higher noble tier runs at the same time as a lower one; a lower one can't be bought over a higher one.
// Feature 'shop' (features.mjs ROUTES) stops buys and the old-app spend; reads, equip and looks stay open.
//
// Rütbe tiers sell at the name, price and days Seviye ayarları give them (levels.mjs nobleItem); frames and entry
// effects at what Yönetim › Mağaza gives them (shop-items.mjs: the app's own as changed there, and the admins' own). A
// phone that reads those sends the price and days it showed (POST /api/shop/buy `price`, `days`; 0 for good): a
// moved one is a 409 price_changed and nothing moves. One that shows the compiled rows (the old-app spend, a buy
// without `days`) gets update_required once the item differs from its compiled row, so nobody pays for other days or
// another price than shown.
import { itemNotice } from './system-notices.mjs';
import { HttpError, REF, UUID, auth, claimRef, clientIp, db, env, int, limit, once, readJson, text, tx, userId } from './core.mjs';
import { FREE_MICFX, MAX_AHEAD_DAYS, PAID_ONLY, SHOP, SHOP_PAUSED, SLOTS, labelOf } from './catalog.mjs';
import { nobleItem, vipItemNeed, vipLevelOf } from './levels.mjs';
import { allShopItems, ownShopSkus, shopItem } from './shop-items.mjs';
import { claimLevelRewards } from './level-rewards.mjs';
import { packByName, packItem, packSkus } from './emoji.mjs';
import { live } from './live-settings.mjs';
// live.mjs imports rooms.mjs, which imports this file; the functions are only used inside handlers.
import { roomPacket, roomService, voiceRoomsOf } from './live.mjs';
import { paidCoins, spendCoins } from './wallet.mjs';
import { wealthPoints } from './wheel.mjs';

const DAY = 86_400_000;
const SPEND_MAX = 10_000_000;
const fmt = (n) => n.toLocaleString('tr-TR');
const err = (status, message, code, extra = {}) => Object.assign(new HttpError(status, message), { extra: { code, ...extra } });
const daysLeft = (until, now) => Math.max(1, Math.ceil((until - now) / DAY));

/** A row that counts now (alias e). */
export const LIVE = 'e.revoked_at IS NULL AND e.starts_at <= now() AND (e.ends_at IS NULL OR e.ends_at > now())';

async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}
const audit = (c, actor, action, target, detail, ip) =>
  c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1,$2,$3,$4,$5)', [actor, action, target, JSON.stringify(detail), ip]);

// --- What a person has -----------------------------------------------------------------------------------------
/**
 * The person's unrevoked rows that have not ended, by sku, and what is live now: each live sku with the end of its
 * chain (rows back to back from the live one; a revoked middle term leaves a gap, and the chain stops there), and
 * the highest live noble tier. `now` is the database's.
 */
export async function statusOf(q, uid) {
  const r = await q.query(
    `SELECT n.now, e.sku, e.kind, e.tier, e.starts_at, e.ends_at, e.source, e.origin FROM (SELECT now() AS now) n
       LEFT JOIN entitlements e ON e.user_id = $1 AND e.revoked_at IS NULL AND (e.ends_at IS NULL OR e.ends_at > n.now)
      ORDER BY e.starts_at, e.id`,
    [uid],
  );
  const now = r.rows[0].now.getTime();
  const bySku = new Map();
  for (const x of r.rows) if (x.sku) bySku.set(x.sku, [...(bySku.get(x.sku) ?? []), x]);
  const items = new Map();
  for (const [sku, rows] of bySku) {
    const at = rows.findIndex((x) => x.starts_at.getTime() <= now);
    if (at < 0) continue;
    let until = rows[at].ends_at?.getTime() ?? null;
    // Where it came from (Çantam): the last grant that makes up the term now.
    let last = rows[at];
    for (const x of rows.slice(at + 1)) {
      if (until === null || x.starts_at.getTime() > until) break;
      until = x.ends_at === null ? null : Math.max(until, x.ends_at.getTime());
      last = x;
    }
    items.set(sku, { sku, kind: rows[at].kind, tier: rows[at].tier, until, source: last.source, origin: last.origin ?? null });
  }
  const top = [...items.values()].filter((x) => x.kind === 'noble').sort((a, b) => b.tier - a.tier)[0];
  return { now, bySku, items, noble: top ? { tier: top.tier, until: top.until } : null };
}

/**
 * When a grant of `item` (for `days`) starts, or a 409: a permanent item already owned, a lower noble tier over a
 * higher live one (mode 'buy' only), an end further than 365 days ahead (not for 'migrate', which keeps every
 * term a person paid for). A timed item starts where its latest term ends, or now.
 */
function startOf(item, st, mode, days = item.days) {
  const rows = st.bySku.get(item.sku) ?? [];
  if (days === null) {
    if (rows.some((x) => x.ends_at === null)) throw err(409, 'Zaten sahipsin', 'owned');
    return st.now;
  }
  if (item.kind === 'noble' && mode === 'buy' && st.noble && st.noble.tier > item.tier) {
    throw err(409, `Daha yüksek bir rütben zaten var (${daysLeft(st.noble.until, st.now)} gün kaldı)`, 'higher_rank');
  }
  const start = Math.max(st.now, ...rows.map((x) => x.ends_at?.getTime() ?? 0));
  if (mode !== 'migrate' && start + days * DAY > st.now + MAX_AHEAD_DAYS * DAY) throw err(409, `En fazla ${MAX_AHEAD_DAYS} gün ileriye alınabilir`, 'too_far');
  return start;
}

/**
 * Writes one entitlement in the caller's transaction and returns its id. The only writer besides the revokes.
 * Locks the person first, so two grants never read the same chain end. The start is worked out again in SQL from
 * the stored ends (no rounding to milliseconds). A special ID someone else got first is 'taken': the partial
 * unique index makes the second insert wait, and DO NOTHING then skips it.
 */
export async function grantInTx(c, uid, item, { ref, source, price, mode = 'buy', actor = null, days = item.days, origin = null }) {
  await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [uid]);
  startOf(item, await statusOf(c, uid), mode, days);
  const taken = () => err(409, 'Bu numara başka birinde', 'taken');
  if (item.kind === 'specialId') {
    const other = await c.query("SELECT 1 FROM entitlements WHERE sku = $1 AND kind = 'specialId' AND revoked_at IS NULL AND user_id <> $2", [item.sku, uid]);
    if (other.rowCount) throw taken();
  }
  const r = await c.query(
    `INSERT INTO entitlements (user_id, sku, kind, tier, price, starts_at, ends_at, source, ref, actor, origin)
     SELECT $1, $2, $3, $4, $5, s, CASE WHEN $6::int IS NULL THEN NULL ELSE s + make_interval(days => $6::int) END, $7, $8, $9, $10
       FROM (SELECT CASE WHEN $6::int IS NULL THEN now()
                    ELSE greatest(now(), (SELECT max(ends_at) FROM entitlements WHERE user_id = $1 AND sku = $2 AND revoked_at IS NULL)) END AS s) x
     ON CONFLICT DO NOTHING RETURNING id`,
    [uid, item.sku, item.kind, item.tier, price, days, source, ref, actor, origin],
  );
  if (!r.rowCount) throw item.kind === 'specialId' ? taken() : err(409, 'Zaten sahipsin', 'owned');
  return Number(r.rows[0].id);
}

/** Where a reward comes from (entitlements.source; Çarşı's are buy, bridge, migrate, the staff's admin). */
export const REWARD_SOURCES = Object.freeze(['event', 'task', 'level']);
/** What a reward can give: what the shop has, as it is now (the admins' own, one off the shelf too), and sticker packs. */
const REWARD_KINDS = new Set(['frame', 'entry', 'ride', 'bubble', 'wave', 'micfx', 'sticker']);
/** The item a reward of `sku` gives, or null: never a special ID, a noble rank or a room's background. */
export function rewardItem(sku) {
  if (typeof sku !== 'string') return null;
  const pack = packItem(sku, { any: true });
  const item = pack !== undefined ? pack : (shopItem(sku) ?? SHOP.get(sku));
  return item && REWARD_KINDS.has(item.kind) ? item : null;
}

/**
 * A reward into someone's Çantam (docs/CANTA.md): `sku` for `days` (left out: the shop's term; an item sold for good
 * stays for good), at no cost, in the caller's transaction, after the term they already have. Once per `ref`
 * (server-made, with a ':'): a replay adds nothing. Nothing either when they have it for good already or the term
 * would reach past MAX_AHEAD_DAYS. `origin`: a few words for the bag (the event's title, "VIP 5"). True when given.
 */
export async function grantReward(c, uid, sku, { days, source, ref, origin = null }) {
  if (!REWARD_SOURCES.includes(source)) throw new Error(`grantReward: unknown source ${source}`);
  const item = rewardItem(sku);
  if (!item) return false;
  if ((await c.query('SELECT 1 FROM entitlements WHERE user_id = $1 AND ref = $2', [uid, ref])).rowCount) return false;
  const term = item.days === null ? null : (days ?? item.days);
  try {
    await grantInTx(c, uid, item, { ref, source, price: 0, mode: 'reward', days: term, origin: origin ? String(origin).trim().slice(0, 60) || null : null });
    return true;
  } catch (e) {
    if (['owned', 'too_far'].includes(e?.extra?.code)) return false;
    throw e;
  }
}

/** What the panel may give as a reward (Seviye ödülleri, an event's reward), and how it names each kind. */
const PICKABLE = ['frame', 'entry', 'ride', 'bubble', 'wave'];
export const REWARD_KIND_NAME = Object.freeze({ frame: 'Çerçeve', entry: 'Giriş efekti', ride: 'Binek', bubble: 'Sohbet balonu', wave: 'Ses dalgası', micfx: 'Mikrofon efekti', sticker: 'Çıkartma paketi' });
/** The panel's choices for a reward: the shop's frames, entry effects, rides, bubbles and waves as they are now. */
export function rewardChoices() {
  const out = new Map();
  for (const x of allShopItems()) out.set(x.sku, x);
  for (const x of SHOP.values()) if (!out.has(x.sku)) out.set(x.sku, x);
  return [...out.values()]
    .map((x) => rewardItem(x.sku))
    .filter((x) => x && PICKABLE.includes(x.kind))
    .map((x) => ({ sku: x.sku, kind: x.kind, kindName: REWARD_KIND_NAME[x.kind], name: x.name, days: x.days ?? null }));
}
/** The panel's reward of `sku` for `days` (empty: the shop's term): the item and the days to keep, or a 400 saying what to fix. */
export function pickReward(sku, days) {
  const item = rewardItem(sku);
  if (!item || !PICKABLE.includes(item.kind)) throw new HttpError(400, 'Ödül bir çerçeve, giriş efekti, binek, sohbet balonu ya da ses dalgası olmalı');
  if (days === undefined || days === null || days === 0 || days === '') return { item, days: null };
  if (item.days === null) throw new HttpError(400, `${item.name} süresiz satılıyor; ödülü de süresizdir, gün verilmez`);
  const n = int(days, 1, MAX_AHEAD_DAYS);
  if (n === null) throw new HttpError(400, `Gün 1–${MAX_AHEAD_DAYS} arasında olmalı (boş: mağazadaki süresi)`);
  return { item, days: n };
}

/**
 * The compiled catalog row an app that doesn't read the settings shows for `item`: a Rütbe tier's, one of the app's own
 * frames' or entry effects'. Null for what only the server sells as it is now (an admin's item, a sticker pack, …).
 */
const compiledOf = (item) => (item.kind === 'noble' || shopItem(item.sku)?.builtin ? (SHOP.get(item.sku) ?? null) : null);
/** Whether a Rütbe tier is sold for another price or other days than the compiled row says. */
const movedFrom = (item, base) => !!base && (item.price !== base.price || item.days !== base.days);

/**
 * A shop buy in once()'s transaction: `shown` is the price the app showed (the server's price is charged), `days`
 * the Rütbe days it showed (a phone that reads Seviye ayarları), `compiled` the compiled row an older app showed
 * instead. The person's row is locked first, so their buys run one after the other; claimRef comes before every
 * check, so a retry of a buy that went through answers "replay", not "Zaten sahipsin" (nor a moved price).
 */
async function buyInTx(c, uid, item, ref, shown, source, { days, compiled } = {}) {
  const me = (await c.query('SELECT coins, svip_xp FROM users WHERE id = $1 FOR UPDATE', [uid])).rows[0];
  await claimRef(c, uid, 'coin', ref);
  if (movedFrom(item, compiled)) throw updateRequired();
  if (!(Number.isSafeInteger(shown) && shown >= item.price)) throw err(409, `Fiyat değişti: şimdi ${fmt(item.price)} jeton`, 'price_changed', { price: item.price, days: item.days ?? 0 });
  if (days !== undefined && days !== (item.days ?? 0)) {
    throw err(409, item.days ? `Süre değişti: şimdi ${item.days} gün` : 'Süre değişti: artık süresiz', 'price_changed', { price: item.price, days: item.days ?? 0 });
  }
  const st = await statusOf(c, uid);
  // Its own VIP level, and at least the one Seviye ayarları open `vip_store` at.
  const needVip = vipItemNeed('vip_store', item.minVip);
  if (needVip && vipLevelOf(me.svip_xp, st.noble?.tier) < needVip) throw err(403, `Bu ürün VIP ${needVip} ve üzeri için`, 'vip_required');
  startOf(item, st, 'buy');
  if (Number(me.coins) < item.price) throw err(409, 'Yetersiz jeton', 'insufficient');
  const use = PAID_ONLY.includes(item.kind) ? 'paid' : 'items';
  if (use === 'paid' && (await paidCoins(c, uid)) < item.price) throw err(409, 'Özel numara sadece satın alınan jetonla alınır', 'reward_coins_only');
  await grantInTx(c, uid, item, { ref, source, price: item.price });
  await spendCoins(c, uid, item.price, labelOf(item), ref, null, { use, detail: { sku: item.sku, kind: item.kind, days: item.days } });
  // Worn at once, as the app always did.
  if (SLOTS.includes(item.kind)) await c.query('UPDATE users SET equipped = equipped || jsonb_build_object($2::text, $3::text) WHERE id = $1', [uid, item.kind, item.sku]);
}

/** A ref once() answered as a replay is this buy's only when an item came with it (gifts and bonds share refs). */
const boughtWith = async (uid, ref) =>
  (
    await db.query(
      `SELECT 1 FROM entitlements WHERE user_id = $1 AND ref = $2
       UNION ALL SELECT 1 FROM ledger WHERE user_id = $1 AND currency = 'coin' AND ref = $2 AND reason LIKE 'Uygulama içi:%'`,
      [uid, ref],
    )
  ).rowCount > 0;

/**
 * What may be bought now: the catalog minus the live shop_hidden set and the items no longer sold (catalog.mjs
 * SHOP_PAUSED); special IDs only once SHOP_SPECIAL_IDS=1. A sticker pack ('pack-<id>') as Yönetim › Emojiler has it
 * now (emoji.mjs packItem: its price there, the admins' own packs too); a Rütbe tier as Seviye ayarları have it.
 */
export function sellable(sku) {
  const pack = packItem(sku);
  // A frame, entry effect, chat bubble or voice wave as Yönetim › Mağaza has it (on the shelf or not there; the app's
  // paused ones count as off).
  const own = pack === undefined ? shopItem(sku) : undefined;
  const item = pack !== undefined ? pack : own !== undefined ? own : typeof sku === 'string' ? SHOP.get(sku) : undefined;
  if (!item || live().shopHidden.has(sku) || (own ? !own.enabled : SHOP_PAUSED.has(sku))) return null;
  if (item.kind === 'specialId' && env.SHOP_SPECIAL_IDS !== '1') return null;
  return nobleItem(item);
}

const wornOf = (equipped, owns) => {
  const out = {};
  for (const slot of SLOTS) {
    const sku = equipped?.[slot];
    if (typeof sku === 'string' && ((slot === 'micfx' && FREE_MICFX.includes(sku)) || owns(slot, sku))) out[slot] = sku;
  }
  return out;
};

/** The person's own view (GET /api/economy and every shop write). */
export async function economyOf(uid, q = db) {
  const st = await statusOf(q, uid);
  const u = (
    await q.query(
      `SELECT u.svip_xp, u.equipped,
              (SELECT coalesce(sum(remaining), 0) FROM coin_lots WHERE user_id = u.id AND channel = 'odul' AND remaining > 0) AS reward
         FROM users u WHERE u.id = $1`,
      [uid],
    )
  ).rows[0];
  const recent = await q.query(
    "SELECT sku, created_at FROM entitlements WHERE user_id = $1 AND source IN ('buy', 'bridge') AND created_at > now() - interval '10 minutes' ORDER BY created_at DESC, id DESC",
    [uid],
  );
  const iso = (t) => (t === null ? null : new Date(t).toISOString());
  return {
    serverNow: iso(st.now),
    shop: [...[...SHOP.keys()].filter((sku) => !sku.startsWith('pack-')), ...ownShopSkus(), ...packSkus()]
      .map(sellable)
      .filter(Boolean)
      .map(({ sku, kind, name, price, days, minVip }) => ({ sku, kind, name, price, days, minVip })),
    // source and origin: where it came from, for Çantam (an older app reads sku, kind and until only).
    items: [...st.items.values()].map((x) => ({ sku: x.sku, kind: x.kind, until: iso(x.until), source: x.source, ...(x.origin ? { origin: x.origin } : {}) })),
    equipped: wornOf(u.equipped, (slot, sku) => st.items.get(sku)?.kind === slot),
    noble: st.noble && { tier: st.noble.tier, until: iso(st.noble.until) },
    vipLevel: vipLevelOf(u.svip_xp, st.noble?.tier),
    wealthXp: await wealthPoints(q, uid),
    rewardCoins: Number(u.reward),
    recent: recent.rows.map((x) => ({ sku: x.sku, at: x.created_at.toISOString() })),
  };
}

/**
 * What others see of each person in `ids`: the worn items that are live, the highest live noble tier, the VIP level,
 * the gender that colors their speaking ring and their photo (rooms draw their mic and Balkon face with it).
 */
export async function looksOf(ids, q = db) {
  if (!ids.length) return {};
  const r = await q.query(
    `SELECT u.id, u.name, u.equipped, u.svip_xp, u.gender, u.gender_hidden, u.avatar_url,
            (SELECT max(e.tier) FROM entitlements e WHERE e.user_id = u.id AND e.kind = 'noble' AND ${LIVE}) AS noble,
            (SELECT coalesce(array_agg(e.kind || ':' || e.sku), '{}') FROM entitlements e WHERE e.user_id = u.id AND e.kind = ANY($2::text[]) AND ${LIVE}) AS owned
       FROM users u WHERE u.id = ANY($1::uuid[])`,
    [ids, SLOTS],
  );
  const out = {};
  for (const x of r.rows) {
    const worn = wornOf(x.equipped, (slot, sku) => x.owned.includes(`${slot}:${sku}`));
    const noble = x.noble === null ? null : Number(x.noble);
    // The gender colors their speaking ring in rooms (pink, blue); a hidden one is none, as on the profile.
    out[x.id] = {
      ...Object.fromEntries(SLOTS.map((s) => [s, worn[s] ?? null])),
      noble,
      vipLevel: vipLevelOf(x.svip_xp, noble),
      gender: x.gender_hidden ? null : (x.gender ?? null),
      // Their name and photo: a room knows its people from the voice connection by id and name only, so someone no
      // screen has read yet (a new account) would sit on a mic without their photo.
      name: x.name,
      avatarUrl: x.avatar_url ?? null,
    };
  }
  return out;
}

/**
 * The person's look changed (a frame worn or taken off, a bought item, a new photo, a new name): every voice room
 * they are in now hears it at once, so the other phones there redraw their mic and Balkon face without anyone
 * leaving and coming back (app lib/live/looks). The packet carries the look itself (what GET /api/looks would
 * answer), so nobody has to ask; it comes from the server, so a phone can't fake anyone's look. A new name also
 * becomes their LiveKit name, which the phones show. Best effort: never fails the caller.
 */
export async function announceLook(uid, name) {
  try {
    // Not room_presence alone: without LiveKit's webhooks it is empty and nobody would hear of the change (live.mjs).
    const rooms = await voiceRoomsOf(uid);
    if (!rooms.length) return;
    const look = (await looksOf([uid]))[uid];
    if (!look) return;
    for (const room of rooms) {
      if (name) await roomService('UpdateParticipant', { room, identity: uid, name }, { roomAdmin: true, room }).catch((e) => console.error('livekit UpdateParticipant name', room, String(e).slice(0, 200)));
      await roomPacket(room, { type: 'look', user: uid, look });
    }
  } catch (e) {
    console.error('look news', uid, String(e).slice(0, 200));
  }
}

// --- Refunds and account deletion --------------------------------------------------------------------------------
/**
 * Account deletion (social.mjs DELETE /api/me, same transaction): every row is revoked, which frees a special ID.
 * The rows stay with the pseudonymised account (accounting records); users.equipped is cleared there.
 */
export const revokeAllForDelete = (c, uid) =>
  c.query("UPDATE entitlements SET revoked_at = now(), revoked_why = 'hesap silindi' WHERE user_id = $1 AND revoked_at IS NULL", [uid]);

/**
 * A store refund (jeton.mjs refundPurchase, same transaction, every account on the trail locked): marks the trail
 * lots, then finds the item spends paid from them. The refunding buyer's items go ('iade': any part paid with the
 * refunded coins takes the whole item). Anyone else on the trail (a Jeton Noktası customer who paid the bank) keeps
 * theirs; each item is written for staff review.
 */
export async function refundItems(c, { purchase, buyer, lots, held, actor, ip }) {
  await c.query('UPDATE coin_lots SET refunded_by = $1 WHERE id = ANY($2::bigint[])', [purchase, lots]);
  const spends = await c.query(
    `SELECT l.id, l.user_id, l.ref, x.tainted FROM ledger l
      CROSS JOIN LATERAL (SELECT sum((p->>'amount')::bigint) AS tainted FROM jsonb_array_elements(coalesce(l.detail->'lots', '[]'::jsonb)) p
                           WHERE (p->>'lot')::bigint = ANY($2::bigint[])) x
      WHERE l.user_id = ANY($1::uuid[]) AND l.currency = 'coin' AND l.amount < 0 AND (l.detail ? 'sku' OR l.reason LIKE 'Uygulama içi: %') AND x.tainted > 0
      ORDER BY l.id`,
    [[...held], lots],
  );
  let revokedItems = 0;
  let reviewItems = 0;
  for (const s of spends.rows) {
    const items = await c.query("SELECT id, sku, price FROM entitlements WHERE user_id = $1 AND ref IN ($2, 'migrate:' || $3::text) AND revoked_at IS NULL", [s.user_id, s.ref, s.id]);
    for (const e of items.rows) {
      if (s.user_id === buyer) {
        await c.query("UPDATE entitlements SET revoked_at = now(), revoked_why = 'iade' WHERE id = $1", [e.id]);
        revokedItems++;
      } else {
        await audit(c, actor, 'economy.refund_review', s.user_id, { purchase, user: s.user_id, entitlement: Number(e.id), sku: e.sku, price: Number(e.price), taintedCoins: Number(s.tainted) }, ip);
        reviewItems++;
      }
    }
  }
  return { revokedItems, reviewItems };
}

// --- Old apps --------------------------------------------------------------------------------------------------
const PREFIX = [
  ['Mağaza: ', ['frame', 'entry', 'ride', 'bubble', 'specialId', 'wave']],
  ['Çıkartma paketi: ', ['sticker']],
  ['Mikrofon efekti: ', ['micfx']],
  ['Rütbe: ', ['noble']],
];
/** Rütbe names before the rename (app versions up to preview-89 still send them in the spend reason). */
const OLD_NOBLE = { Gemici: 'noble-1', Dümenci: 'noble-2', Lostromo: 'noble-3', Amiral: 'noble-4', 'Kaptan-ı Derya': 'noble-5' };
/** Shop item names before the rename away from sea names (older apps still send them in the spend reason). */
const OLD_SHOP = { 'Ses Dalgası': 'fr-neon', 'Melek Kalp · Mercan': 'fr-wing-coral' };
/** The catalog row an old app's spend reason names ("Mağaza: Ses Halkası", "Rütbe: Yüzbaşı (30 gün)"), or null. */
export function itemOfReason(reason) {
  for (const [p, kinds] of PREFIX) {
    if (!reason.startsWith(p)) continue;
    const name = reason.slice(p.length).replace(/\s*\(\d+ gün\)$/, '').trim();
    // A sticker pack by its name now (Yönetim › Emojiler) or the app's name for it: what this server sells it at.
    if (kinds.includes('sticker')) return packByName(name);
    const renamed = kinds.includes('noble') ? OLD_NOBLE : OLD_SHOP;
    const old = Object.hasOwn(renamed, name) ? SHOP.get(renamed[name]) : null;
    return (old && kinds.includes(old.kind) ? old : null) ?? [...SHOP.values()].find((x) => kinds.includes(x.kind) && x.name === name) ?? null;
  }
  return null;
}
const updateRequired = () => err(409, 'Bu işlem için uygulamayı güncelle', 'update_required');

// --- Admin -----------------------------------------------------------------------------------------------------
const stateOf = (e, now) => (e.revoked_at ? 'revoked' : e.starts_at > now ? 'upcoming' : e.ends_at && e.ends_at <= now ? 'ended' : 'live');
const itemOf = (e, now) => ({
  id: Number(e.id),
  userId: e.user_id,
  sku: e.sku,
  kind: e.kind,
  name: shopItem(e.sku)?.name ?? nobleItem(SHOP.get(e.sku))?.name ?? packItem(e.sku, { any: true })?.name ?? e.sku,
  tier: e.tier,
  price: Number(e.price),
  startsAt: e.starts_at,
  endsAt: e.ends_at,
  source: e.source,
  origin: e.origin ?? null,
  ref: e.ref,
  actor: e.actor,
  revokedAt: e.revoked_at,
  revokedWhy: e.revoked_why,
  createdAt: e.created_at,
  state: stateOf(e, now),
});
const dbNow = async (q) => (await q.query('SELECT now() AS now')).rows[0].now;

export const economyRoutes = {
  async 'GET /api/economy'(req) {
    const u = await auth(req);
    const now = await economyOf(u.id);
    // Seviye ödülleri: a level reached since the last read puts its items in Çantam first (level-rewards.mjs). A
    // failure there never keeps someone from their own items: the next read tries again.
    try {
      if (await claimLevelRewards(u.id, now.vipLevel)) return economyOf(u.id);
    } catch (e) {
      console.error('level rewards failed', String(e?.message ?? e).slice(0, 200));
    }
    return now;
  },

  async 'POST /api/shop/buy'(req) {
    const u = await auth(req);
    limit(`buy:${u.id}`, 30);
    const b = await readJson(req);
    const item = sellable(b.sku);
    if (!item) throw new HttpError(400, 'Bu ürün artık satışta değil');
    // The days the phone showed (0: for good), or none sent: it showed the compiled row (a Rütbe tier, one of the
    // app's own frames or entry effects), which must still be what is sold.
    const base = compiledOf(item);
    const shownDays = b.days === undefined ? undefined : Number.isSafeInteger(b.days) && b.days >= 0 ? b.days : -1;
    const how = shownDays !== undefined ? { days: shownDays } : base ? { compiled: base } : {};
    const r = await once(u.id, 'coin', b.ref, (c) => buyInTx(c, u.id, item, b.ref, b.price, 'buy', how));
    if (r.replay && !(await boughtWith(u.id, b.ref))) throw new HttpError(409, 'Geçersiz istek kimliği');
    // A bought item is worn at once (and a noble rank or VIP can change the frame): the room the buyer is in sees it.
    if (!r.replay) void announceLook(u.id);
    return { ...r, economy: await economyOf(u.id) };
  },

  async 'POST /api/shop/equip'(req) {
    const u = await auth(req);
    limit(`equip:${u.id}`, 30);
    const { slot, sku } = await readJson(req);
    if (!SLOTS.includes(slot)) throw new HttpError(400, 'Geçersiz yuva');
    if (sku === null) {
      await db.query('UPDATE users SET equipped = equipped - $2::text WHERE id = $1', [u.id, slot]);
    } else {
      const free = slot === 'micfx' && FREE_MICFX.includes(sku);
      const owns = typeof sku === 'string' && (free || (await db.query(`SELECT 1 FROM entitlements e WHERE e.user_id = $1 AND e.kind = $2 AND e.sku = $3 AND ${LIVE}`, [u.id, slot, sku])).rowCount);
      if (!owns) throw new HttpError(403, 'Bu ürün sende yok ya da süresi doldu');
      await db.query('UPDATE users SET equipped = equipped || jsonb_build_object($2::text, $3::text) WHERE id = $1', [u.id, slot, sku]);
    }
    // Worn or taken off in the middle of a room: the others there see it now, not after leaving and coming back.
    void announceLook(u.id);
    return { economy: await economyOf(u.id) };
  },

  async 'GET /api/looks'(req, url) {
    const me = await auth(req);
    const ids = [...new Set(String(url.searchParams.get('ids') ?? '').split(',').map((x) => x.trim()).filter(Boolean))];
    if (ids.length > 50 || !ids.every((x) => UUID.test(x))) throw new HttpError(400, 'En çok 50 geçerli kullanıcı kimliği');
    const looks = await looksOf(ids);
    // Someone who blocked me: their look stays (it is on their mic anyway), their name and photo don't come, as
    // GET /api/user doesn't show them.
    const hidden = await db.query('SELECT b.blocker FROM blocks b WHERE b.blocker = ANY($1::uuid[]) AND b.blocked = $2', [ids, me.id]);
    for (const x of hidden.rows) {
      if (!looks[x.blocker]) continue;
      delete looks[x.blocker].name;
      delete looks[x.blocker].avatarUrl;
    }
    return { looks };
  },

  /**
   * Old apps (before the shop moved to the server) spend coins with a free-text reason and keep the item on the
   * phone. Their four item reasons now buy on the server at the server's price, so updating the app later keeps
   * the item. Anything else (a lower amount, an unknown name, profile gifts, games, VIP) is refused with nothing
   * charged. Special IDs wait for the step-2 backfill (SHOP_SPECIAL_IDS). The answer keeps the old shape.
   */
  async 'POST /api/wallet/spend'(req) {
    const u = await auth(req);
    const { amount, reason, ref } = await readJson(req);
    const n = int(amount, 1, SPEND_MAX);
    if (!n) throw new HttpError(400, 'Geçersiz miktar');
    const why = typeof reason === 'string' ? reason.trim().slice(0, 80) : '';
    if (!why) throw new HttpError(400, 'Harcama nedeni gerekli');
    // The compiled row the app showed: the amount is checked against it here (it never moves), against what the
    // server sells it at now (a Rütbe tier as Seviye ayarları have it) after the ref claim.
    const base = itemOfReason(why);
    if (!base || n < base.price || (base.kind === 'specialId' && env.SHOP_SPECIAL_IDS !== '1')) throw updateRequired();
    // What the server sells it as now: a Rütbe tier by Seviye ayarları, a frame, entry effect, bubble or wave by
    // Yönetim › Mağaza.
    const own = shopItem(base.sku);
    if (live().shopHidden.has(base.sku) || (own ? !own.enabled : SHOP_PAUSED.has(base.sku))) throw new HttpError(409, 'Bu ürün artık satışta değil');
    const item = own ?? nobleItem(base);
    const r = await once(u.id, 'coin', ref, (c) => buyInTx(c, u.id, item, ref, n, 'bridge', { compiled: compiledOf(base) }));
    if (r.replay && !(await boughtWith(u.id, ref))) throw new HttpError(409, 'Geçersiz istek kimliği');
    if (!r.replay) void announceLook(u.id);
    return r;
  },

  async 'GET /api/admin/economy/user'(req, url) {
    await admin(req);
    const id = userId(url.searchParams.get('id'));
    const p = (await db.query('SELECT id, name, deleted_at FROM users WHERE id = $1', [id])).rows[0];
    if (!p) throw new HttpError(404, 'Kullanıcı bulunamadı');
    const now = await dbNow(db);
    const items = await db.query('SELECT * FROM entitlements WHERE user_id = $1 ORDER BY id DESC LIMIT 500', [id]);
    const reward = await db.query("SELECT coalesce(sum(remaining), 0) AS n FROM coin_lots WHERE user_id = $1 AND channel = 'odul' AND remaining > 0", [id]);
    const rewards = await db.query("SELECT id, amount, reason, ref, detail, created_at FROM ledger WHERE user_id = $1 AND currency = 'coin' AND channel = 'odul' ORDER BY id DESC LIMIT 200", [id]);
    const reviews = await db.query(
      `SELECT a.id, a.detail, a.created_at, e.revoked_at FROM audit_events a LEFT JOIN entitlements e ON e.id = (a.detail->>'entitlement')::bigint
        WHERE a.action = 'economy.refund_review' AND a.target = $1 ORDER BY a.id DESC LIMIT 100`,
      [id],
    );
    return {
      user: { id: p.id, name: p.name, deleted: !!p.deleted_at },
      items: items.rows.map((e) => itemOf(e, now)),
      rewardCoins: Number(reward.rows[0].n),
      rewards: rewards.rows.map((x) => ({ id: Number(x.id), amount: Number(x.amount), reason: x.reason, ref: x.ref, detail: x.detail, createdAt: x.created_at })),
      reviews: reviews.rows.filter((x) => !x.revoked_at).map((x) => ({ id: Number(x.id), ...x.detail, createdAt: x.created_at })),
      // What a staff grant may give (POST /api/admin/economy/grant): the shop's items and the sticker packs, with
      // their own length (days null: for good), for editors outside the app (the finance panel).
      grantable: [
        ...[...SHOP.values()].map((s) => shopItem(s.sku) ?? nobleItem(s)).map((s) => ({ sku: s.sku, kind: s.kind, name: s.name, days: s.days })),
        ...ownShopSkus().map(shopItem).map((s) => ({ sku: s.sku, kind: s.kind, name: s.name, days: s.days })),
        ...packSkus().map((sku) => packItem(sku, { any: true })).filter(Boolean).map((s) => ({ sku: s.sku, kind: s.kind, name: s.name, days: s.days })),
      ],
    };
  },

  /** A staff grant (support, a lost purchase, a prize): price 0, the staff member and reason in the audit row. */
  async 'POST /api/admin/economy/grant'(req) {
    const a = await admin(req);
    const b = await readJson(req);
    const id = userId(b.userId);
    // A sticker pack as Yönetim › Emojiler has it (the admins' own too, a free one too); anything else from the shop.
    const pack = packItem(b.sku, { any: true });
    const item = pack !== undefined ? pack : typeof b.sku === 'string' ? (shopItem(b.sku) ?? nobleItem(SHOP.get(b.sku))) : undefined;
    if (!item) throw new HttpError(400, 'Bilinmeyen ürün');
    let days = item.days;
    if (b.days !== undefined && b.days !== null) {
      if (item.days === null) throw new HttpError(400, 'Bu ürün süresiz; gün verilmez');
      days = int(b.days, 1, MAX_AHEAD_DAYS);
      if (!days) throw new HttpError(400, `Gün 1–${MAX_AHEAD_DAYS} arasında olmalı`);
    }
    const reason = text(b.reason, 3, 300, 'Neden');
    if (!REF.test(b.ref ?? '')) throw new HttpError(400, 'Geçersiz istek kimliği');
    const ref = `admin:${b.ref}`;
    const out = await tx(async (c) => {
      const p = (await c.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id])).rows[0];
      if (!p) throw new HttpError(404, 'Kullanıcı bulunamadı');
      const now = await dbNow(c);
      const seen = (await c.query('SELECT * FROM entitlements WHERE user_id = $1 AND ref = $2', [id, ref])).rows[0];
      if (seen) return { replay: true, item: itemOf(seen, now) };
      const eid = await grantInTx(c, id, item, { ref, source: 'admin', price: 0, mode: 'admin', actor: a.id, days });
      await audit(c, a.id, 'economy.grant', id, { entitlement: eid, sku: item.sku, days, reason }, clientIp(req));
      return { replay: false, item: itemOf((await c.query('SELECT * FROM entitlements WHERE id = $1', [eid])).rows[0], now) };
    });
    if (!out.replay) {
      void announceLook(id);
      // SimilarClub Sistem: the gift is in their Çantam (the staff's reason stays in the audit, not in the notice).
      void itemNotice({ target: id, ref, item, days, origin: 'SimilarClub yönetimi', why: `SimilarClub yönetiminden sana ${item.name} hediye edildi!` });
    }
    return out;
  },

  /** Takes an item back (support): revoked_why 'destek'; the staff member's reason goes to the audit row. */
  async 'POST /api/admin/economy/revoke'(req) {
    const a = await admin(req);
    const b = await readJson(req);
    const id = int(b.id, 1, Number.MAX_SAFE_INTEGER);
    if (!id) throw new HttpError(400, 'Geçersiz kayıt');
    const reason = text(b.reason, 3, 300, 'Neden');
    const out = await tx(async (c) => {
      const e = (await c.query('SELECT * FROM entitlements WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!e) throw new HttpError(404, 'Kayıt bulunamadı');
      if (e.revoked_at) throw new HttpError(409, 'Bu ürün zaten geri alınmış');
      const r = (await c.query("UPDATE entitlements SET revoked_at = now(), revoked_why = 'destek' WHERE id = $1 RETURNING *", [id])).rows[0];
      await audit(c, a.id, 'economy.revoke', e.user_id, { entitlement: id, sku: e.sku, reason }, clientIp(req));
      return { item: itemOf(r, await dbNow(c)) };
    });
    // A worn item taken back leaves the person's look in the room they are in.
    void announceLook(out.item.userId);
    return out;
  },

  async 'GET /api/admin/economy/reviews'(req) {
    await admin(req);
    const now = await dbNow(db);
    const r = await db.query(
      `SELECT a.id, a.target, a.detail, a.created_at, u.name FROM audit_events a JOIN users u ON u.id = a.target
        WHERE a.action = 'economy.refund_review' AND a.created_at > now() - interval '90 days' ORDER BY a.id DESC LIMIT 300`,
    );
    const ids = r.rows.map((x) => Number(x.detail.entitlement)).filter(Number.isSafeInteger);
    const items = new Map((await db.query('SELECT * FROM entitlements WHERE id = ANY($1::bigint[])', [ids])).rows.map((e) => [Number(e.id), e]));
    return {
      rows: r.rows.map((x) => {
        const e = items.get(Number(x.detail.entitlement));
        return {
          id: Number(x.id),
          user: { id: x.target, name: x.name },
          purchase: x.detail.purchase,
          taintedCoins: x.detail.taintedCoins,
          createdAt: x.created_at,
          item: e ? itemOf(e, now) : null,
        };
      }),
    };
  },
};
