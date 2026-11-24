// Şanslı hediyeler: gifts with a draw, played on the server (the app shows them: app/src/lib/lucky.ts).
//
//   GET  /api/lucky                                          → { version, gifts, announceFrom, share, counts, needLevel,
//                                                               allowed, minAge, gameCoins, mine }
//        each gift also { open, since, icon, fx }: since, the version its price and odds are as now from; icon and fx,
//        its own picture and video from the panel (lucky-art.mjs; null: none)
//   POST /api/lucky/send { giftId, to: [ids], count, times?, room?, ref, named?, price?, version? } → { send, user, replay }
//        price / version: what a newer app showed (the package's price, GET /api/lucky's version): a moved value is a
//        409 price_changed / odds_changed and nothing moves (lucky-rules.mjs checkShownLucky); an older app sends none
//   GET  /api/admin/lucky                                    → { config, version, updatedAt, stats, recent, winners,
//                                                               art, artLimits, convert, svga, storage }          (admins)
//   POST /api/admin/lucky/config { config, version }         → { config, version, updatedAt }                       (admins)
//   POST /api/admin/lucky/art, /art/remove, /fetch           → a package's icon and video (lucky-art.mjs)          (admins)
//
// A send is `count` gifts of one package to each recipient. The sender pays price × count for each (paid coins
// only, as any gift). Each recipient gets the panel's share (config.sharePct, 10 % by the owners' rule; 20 % before
// 24 Nov 2026) of that as diamonds, a gift like any other: diamond locks,
// gift_events, agency income ('lucky_gift'), PK points, bond and room XP all count the share. The rest of the
// price is a coin_spend for the finance panel ("Uygulama içi:"). Every gift is one draw (crypto.randomInt over
// ODDS_TOTAL); a win pays price × multiplier to the sender in coins, on their own channel ('ugurlu',
// wallet.mjs): spent like any coin, but what they pay for never counts for Cömertlik (wheel.mjs wealthPoints).
// Open from Cömertlik Lv.2 and 18 years, checked on every send, like Rüzgâr Gülü. A package takes no new sends
// while the rewards paid today across the platform plus its top reward would pass the daily limit.
// The odds a send was drawn with are stored on it; an admin's later edit never changes an old result. Every
// edit is audited: audit_events 'lucky.config' with the settings before and after and the panel user (and, as before,
// sanction_audit_logs action lucky_config with a summary). Adding a package (up to 20, Güncelleme 7 madde 10) or taking
// one out is a save like any other: the version grows, phones read the packages again when the sheet opens, and a
// send of a package that is gone is refused (400, code lucky_closed) before anything moves.
// A win is announced to everyone with the app open (live-line.mjs lineWin, the banner on top of every room) from the
// live setting lucky_announce_min_coins up (0: every win); with the sender's name only when the send says `named`.
import crypto from 'node:crypto';

import { recordIncome } from './agency-lib.mjs';
import { addBondCoins } from './bonds.mjs';
import { GIFT_COUNTS } from './catalog.mjs';
import { HttpError, REF, ageOf, auth, blockedBetween, clientIp, db, filesOut, limit, readJson, selfUser, tx, userId } from './core.mjs';
import { ROOM, announceGift, liveKitRoom } from './gifts.mjs';
import { DEFAULT_CONFIG, MIN_AGE, ODDS_TOTAL, SHARE_PCT, checkConfig, checkShownLucky, drawMult, maxMult, shareDiamonds, shareOf, shownOf, sinceOf, withSince } from './lucky-rules.mjs';
import { luckyArtAdmin, luckyArtOf, luckyArtRoutes, refreshLuckyArt } from './lucky-art.mjs';
import { announceRoom } from './live.mjs';
import { lineWin } from './live-line.mjs';
import { live } from './live-settings.mjs';
import { panelDetail } from './panel.mjs';
import { scorePkGift } from './pk.mjs';
import { announceBoss, bossGift } from './boss-seat.mjs';
import { fuelRocket, launchRockets } from './room-rocket.mjs';
import { audit } from './sanctions.mjs';
import { lockSendAccounts } from './send-locks.mjs';
import { addHeldRoomXp, holdRoomXp } from './room-xp-add.mjs';
import { creditCoins, giftCoins, spendCoins } from './wallet.mjs';
import { casinoNeed, wealthPoints } from './wheel.mjs';

/** People one send can go to (everyone on the mics of the biggest room, with room to spare). */
const MAX_TO = 20;
/**
 * Combo taps one request can carry (`times`, a newer app: the taps made while the last send was on its way go out
 * together, as count × times gifts each), and the most gifts one send draws in all. Older apps send none (1).
 */
const MAX_TIMES = 50;
// 777 to 20 people in one send (15.540 draws) fits (owners, 22 Nov 2026: ×777 for Şanslı, as the sample videos).
export const MAX_DRAWS = 16_000;
/** The counts a Şanslı send takes: a plain gift's, and ×777 (owners, 22 Nov 2026; the legal side is theirs). */
export const LUCKY_COUNTS = [...GIFT_COUNTS, 777];
const DAY_START = `(date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul')`;

/** The packages in force: the admins' saved ones, or the built-in ones until the first save. */
async function current(q = db) {
  const r = (await q.query('SELECT config, version, updated_at FROM lucky_config WHERE id = 1')).rows[0];
  return r ? { config: r.config, version: r.version, updatedAt: r.updated_at } : { config: DEFAULT_CONFIG, version: 1, updatedAt: null };
}

const paidToday = async (q) => Number((await q.query(`SELECT coalesce(sum(payout), 0) AS n FROM lucky_sends WHERE created_at >= ${DAY_START}`)).rows[0].n);

const sendOut = (s) => ({
  id: Number(s.id),
  ref: s.ref,
  giftId: s.gift_id,
  room: s.room ?? null,
  count: s.count,
  to: s.recipients,
  price: Number(s.unit_price),
  cost: Number(s.cost),
  shared: Number(s.shared),
  payout: Number(s.payout),
  best: s.best_mult,
  draws: s.draws,
  configVersion: s.config_version,
  odds: s.odds,
  at: s.created_at,
});

async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}

/**
 * Tells everyone with the app open about a send's win (live-line.mjs lineWin): the banner on top of every room. The
 * sender's name and photo only when they said so (`named`: Ayarlar › "Kazançlarımda adım görünsün"; an older app
 * doesn't say, and its wins go out as "Bir kullanıcı"). Nobody in a block either way with them hears of it. Best
 * effort: the send is done and paid by now, so a failure here only loses the banner.
 */
async function announceWin(me, row, gift, lkRoom, named) {
  try {
    const roomId = lkRoom?.slice(4);
    const [room, blocks] = await Promise.all([
      roomId ? db.query('SELECT title FROM rooms WHERE id = $1', [roomId]) : null,
      db.query('SELECT blocker, blocked FROM blocks WHERE blocker = $1 OR blocked = $1', [me.id]),
    ]);
    const skip = new Set([String(me.id), ...blocks.rows.map((x) => String(x.blocker === me.id ? x.blocked : x.blocker))]);
    lineWin(
      {
        id: Number(row.id),
        uid: named ? me.id : null,
        name: named ? me.name : null,
        avatar: named ? me.avatar_url : null,
        gift: gift.name,
        emoji: gift.emoji,
        mult: Number(row.best_mult),
        coins: Number(row.payout),
        wins: row.draws.filter((m) => m > 0).length,
        room: room?.rows[0]?.title ?? null,
      },
      skip,
    );
  } catch (e) {
    console.error('win announce', String(e?.message ?? e).slice(0, 200));
  }
}

export const luckyRoutes = {
  async 'GET /api/lucky'(req) {
    const me = await auth(req);
    const [cur, points, paid, mine] = await Promise.all([
      current(),
      wealthPoints(db, me.id),
      paidToday(db),
      db.query('SELECT * FROM lucky_sends WHERE user_id = $1 ORDER BY id DESC LIMIT 20', [me.id]),
    ]);
    const { config } = cur;
    return {
      version: cur.version,
      gifts: config.gifts.filter((g) => g.enabled).map((g) => ({ ...g, since: sinceOf(g, cur.version), open: paid + g.price * maxMult(g) <= config.dailyPayoutLimit, ...luckyArtOf(g.id) })),
      announceFrom: config.announceFrom,
      share: shareOf(config),
      counts: LUCKY_COUNTS,
      needLevel: casinoNeed().level,
      allowed: points >= casinoNeed().points,
      minAge: MIN_AGE,
      gameCoins: Number(me.game_coins),
      mine: mine.rows.map(sendOut),
    };
  },

  async 'POST /api/lucky/send'(req) {
    const me = await auth(req);
    // Wide enough for a fast combo (a newer app also puts the taps made meanwhile in one request, `times`).
    limit(`lucky:${me.id}`, 600, 'Çok hızlı gönderiyorsun, biraz bekle');
    const b = await readJson(req);
    if (!REF.test(b.ref ?? '') || b.ref.length > 60) throw new HttpError(400, 'Geçersiz istek kimliği');
    if (typeof b.giftId !== 'string' || b.giftId.length > 30) throw new HttpError(400, 'Hediye bulunamadı');
    if (!LUCKY_COUNTS.includes(b.count)) throw new HttpError(400, `Adet ${LUCKY_COUNTS.join(', ')} olabilir`);
    if (!Array.isArray(b.to) || b.to.length < 1 || b.to.length > MAX_TO) throw new HttpError(400, 'Geçersiz alıcı');
    const to = b.to.map((x) => userId(x, 'alıcı'));
    if (new Set(to).size !== to.length) throw new HttpError(400, 'Geçersiz alıcı');
    if (to.includes(me.id)) throw new HttpError(400, 'Kendine Şanslı hediye gönderemezsin');
    const times = b.times === undefined || b.times === null ? 1 : b.times;
    if (!Number.isInteger(times) || times < 1 || times > MAX_TIMES || b.count * times * to.length > MAX_DRAWS) throw new HttpError(400, 'Geçersiz tekrar sayısı');
    const room = b.room === undefined || b.room === null ? null : String(b.room);
    if (room !== null && !ROOM.test(room)) throw new HttpError(400, 'Geçersiz oda');
    const { ref } = b;
    // Every gift of the send: the chosen count, as many times as the combo was tapped.
    const count = b.count * times;
    // What a newer app showed (checked once the send is known not to be a replay).
    const shown = shownOf(b);
    // The ledger's idempotency key (user, currency, ref) is shared by every wallet feature: these rows carry
    // "lucky:" (a colon no client ref can hold), so a ref used elsewhere neither breaks a send nor looks like one.
    const lref = `lucky:${ref}`;
    const seen = async () => (await db.query('SELECT * FROM lucky_sends WHERE user_id = $1 AND ref = $2', [me.id, ref])).rows[0];
    const answer = async (row, replay) => ({ send: sendOut(row), user: selfUser((await db.query('SELECT * FROM users WHERE id = $1', [me.id])).rows[0]), replay });

    const before = await seen();
    if (before) return answer(before, true);
    if (!me.birth_date || ageOf(me.birth_date) < MIN_AGE) throw new HttpError(403, `Şanslı hediyeler ${MIN_AGE} yaş ve üzeri içindir`);
    const need = casinoNeed();
    if ((await wealthPoints(db, me.id)) < need.points) throw new HttpError(403, `Şanslı hediyeler Cömertlik Lv.${need.level} ve üstü için`);
    for (const t of to) if (await blockedBetween(me.id, t)) throw new HttpError(403, 'Bu kişiye hediye gönderemezsin');

    let row;
    let levelUp = false;
    let events = [];
    let boss = [];
    let rocket = null;
    let xpOwner = null;
    let announceFrom = DEFAULT_CONFIG.announceFrom;
    let gift;
    try {
      row = await tx(async (c) => {
        // Every account this send touches (and what the sender's coin lots point at, since a lot is written twice
        // here), locked in id order so two sends at once can't deadlock (send-locks.mjs).
        if (!(await lockSendAccounts(c, [me.id, ...to], { rewrites: true }))) throw new HttpError(404, 'Alıcı bulunamadı');
        if ((await c.query('SELECT 1 FROM lucky_sends WHERE user_id = $1 AND ref = $2', [me.id, ref])).rowCount) throw Object.assign(new Error('replay'), { code: '23505' });
        const cur = await current(c);
        announceFrom = cur.config.announceFrom;
        gift = cur.config.gifts.find((g) => g.id === b.giftId);
        if (!gift || !gift.enabled) throw Object.assign(new HttpError(400, 'Bu Şanslı hediye şu an kapalı'), { extra: { code: 'lucky_closed', giftId: b.giftId } });
        checkShownLucky(gift, shown, cur.version);
        if ((await paidToday(c)) + gift.price * maxMult(gift) > cur.config.dailyPayoutLimit) throw new HttpError(409, 'Günlük ödül limiti doldu; bu hediye yarın yeniden açılır');

        const cost = gift.price * count * to.length;
        const share = shareDiamonds(gift.price, cur.config) * count;
        const label = `${gift.name}${count > 1 ? ` ×${count}` : ''} (Şanslı)`;
        const roomId = liveKitRoom(room)?.slice(4);
        events = [];
        xpOwner = null;
        for (const [i, rid] of to.entries()) {
          const gref = `${lref}-${i}`;
          const g = await c.query('INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, room, ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [
            me.id,
            rid,
            gift.id,
            count,
            gift.price,
            share,
            room,
            gref,
          ]);
          const eventId = Number(g.rows[0].id);
          events.push({ to: rid, eventId });
          // The share leaves the sender as a gift (its coin lots decide the diamonds' lock, wallet.mjs).
          await giftCoins(c, { sender: me.id, recipient: rid, total: share, label, ref: gref, giftEvent: eventId });
          await addBondCoins(c, me.id, rid, share);
          if (room) await scorePkGift(c, { room, eventId, sender: me.id, recipient: rid, coins: share });
          // Room level: each share is the owner's room XP, added once this commits (room-xp-add.mjs).
          if (roomId) xpOwner = (await holdRoomXp(c, roomId, eventId, share)) ?? xpOwner;
          // The same source ref as a plain gift, so the agency job's backfill from gift_events never counts it twice.
          await recordIncome(c, rid, 'lucky_gift', `gift:${eventId}`, share);
        }
        // Patron koltuğu (boss-seat.mjs): the whole send counts, every recipient together.
        boss = await bossGift(c, { roomId, sender: me.id, coins: cost });
        // Oda roketi (room-rocket.mjs): so does the rocket, the whole send's coins.
        rocket = await fuelRocket(c, { roomId, sender: me.id, coins: cost });
        const rest = cost - share * to.length;
        const many = to.length > 1 ? ` → ${to.length} kişi` : '';
        if (rest > 0) await spendCoins(c, me.id, rest, `Uygulama içi: Şanslı hediye ${label}${many}`, `${lref}-p`);

        const draws = Array.from({ length: count * to.length }, () => drawMult(gift.tiers, crypto.randomInt(0, ODDS_TOTAL)));
        const payout = draws.reduce((n, m) => n + m * gift.price, 0);
        if (payout) await creditCoins(c, me.id, [{ channel: 'ugurlu', amount: payout }], `Şanslı ödülü: ${label}${many}`, `${lref}-k`);
        const ins = await c.query(
          `INSERT INTO lucky_sends (user_id, ref, gift_id, room, count, recipients, unit_price, cost, shared, payout, best_mult, draws, config_version, odds)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [me.id, ref, gift.id, room, count, to, gift.price, cost, share * to.length, payout, Math.max(0, ...draws), draws, cur.version, JSON.stringify(gift.tiers)],
        );
        return ins.rows[0];
      });
    } catch (e) {
      // The same request twice at once: the second waited for the first's lock and found its row. A clash with no
      // send of this person's behind it is not a replay: refused, nothing taken.
      if (e.code !== '23505') throw e;
      const again = await seen();
      if (!again) throw new HttpError(409, 'Geçersiz istek kimliği');
      return answer(again, true);
    }
    // The room XP it held reaches the owner (before the answer, so a room read after it has the new level).
    if (xpOwner) levelUp = await addHeldRoomXp(xpOwner, events.map((x) => x.eventId));
    // Announced to the room's voice connection once paid, so no phone can fake a gift or a win.
    const lkRoom = liveKitRoom(room);
    if (lkRoom) {
      const best = Number(row.best_mult);
      const icon = luckyArtOf(gift.id).icon;
      announceGift(lkRoom, {
        type: 'lucky',
        giftId: gift.id,
        name: gift.name,
        emoji: gift.emoji,
        // The package's own icon (lucky-art.mjs; null: the app's picture or the emoji), at the address phones load it
        // (core.mjs filesOut), and its price: a newer app draws and counts a package it hasn't read yet. An older app
        // reads neither.
        icon: icon ? filesOut(icon) : null,
        price: gift.price,
        count,
        from: me.id,
        to,
        eventIds: events.map((x) => x.eventId),
        best,
        bigWin: best >= announceFrom ? best * Number(row.unit_price) : 0,
      });
      if (levelUp) announceRoom(lkRoom);
      // Patron koltuğu: a Şanslı send counts like any gift in the room.
      await announceBoss(lkRoom.slice(4), boss);
      // Oda roketi: a level this send filled launches and is paid (not awaited).
      if (rocket) void launchRockets(lkRoom.slice(4), rocket);
    }
    // Every room hears of a win, from the live setting's floor up (Canlı ayarlar › Kazanç duyurusu).
    if (Number(row.payout) > 0 && Number(row.payout) >= live().luckyAnnounceMinCoins) await announceWin(me, row, gift, lkRoom, b.named === true);
    return answer(row, false);
  },

  async 'GET /api/admin/lucky'(req) {
    await admin(req);
    const stat = (where) =>
      db.query(`SELECT count(*) AS sends, coalesce(sum(cost), 0) AS spent, coalesce(sum(payout), 0) AS paid, coalesce(sum(shared), 0) AS shared FROM lucky_sends ${where}`);
    const cur = await current();
    const [today, total, recent, winners] = await Promise.all([
      stat(`WHERE created_at >= ${DAY_START}`),
      stat(''),
      db.query('SELECT s.*, u.name, u.avatar_url FROM lucky_sends s JOIN users u ON u.id = s.user_id ORDER BY s.id DESC LIMIT 50'),
      db.query('SELECT s.*, u.name, u.avatar_url FROM lucky_sends s JOIN users u ON u.id = s.user_id WHERE s.best_mult >= $1 ORDER BY s.id DESC LIMIT 30', [cur.config.announceFrom]),
    ]);
    const num = (r) => Object.fromEntries(Object.entries(r.rows[0]).map(([k, v]) => [k, Number(v)]));
    const withName = (s) => ({ ...sendOut(s), sender: { id: s.user_id, name: s.name, avatarUrl: s.avatar_url ?? null } });
    return {
      // sharePct as in force (a configuration saved before it existed has none: 10 %).
      config: { ...cur.config, sharePct: cur.config.sharePct ?? SHARE_PCT },
      version: cur.version,
      updatedAt: cur.updatedAt,
      stats: { today: num(today), total: num(total) },
      recent: recent.rows.map(withName),
      winners: winners.rows.map(withName),
      // Each package's icon and video (lucky-art.mjs), and what an upload may be.
      ...(await luckyArtAdmin(cur.config.gifts.map((g) => g.id))),
    };
  },

  async 'POST /api/admin/lucky/config'(req) {
    const u = await admin(req);
    const b = await readJson(req);
    const out = await tx(async (c) => {
      // One save at a time; a save made on an older copy of the settings is refused instead of undoing the other.
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['lucky_config']);
      const cur = await current(c);
      if (b.version !== cur.version) throw new HttpError(409, 'Ayarlar bu arada değişti; yenileyip tekrar dene');
      // An older panel sends no sharePct: the share in force stays.
      const checked = checkConfig(b.config, cur.config.sharePct ?? SHARE_PCT);
      const version = cur.version + 1;
      const config = { ...checked, gifts: withSince(checked.gifts, cur.config, cur.version, version) };
      const r = await c.query(
        `INSERT INTO lucky_config (id, config, version, updated_by, updated_at) VALUES (1, $1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, version = EXCLUDED.version, updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING updated_at`,
        [JSON.stringify(config), version, u.id],
      );
      const summary = config.gifts.map((g) => ({ id: g.id, price: g.price, enabled: g.enabled, top: maxMult(g) }));
      await audit(c, { actor: u.id, role: u.role, action: 'lucky_config', detail: { version, gifts: summary, dailyPayoutLimit: config.dailyPayoutLimit, announceFrom: config.announceFrom, sharePct: config.sharePct } });
      await c.query("INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, 'lucky.config', NULL, $2, $3)", [
        u.id,
        JSON.stringify({ before: { version: cur.version, ...cur.config }, after: { version, ...config }, ...panelDetail(u) }),
        clientIp(req),
      ]);
      return { config, version, updatedAt: r.rows[0].updated_at };
    });
    // The packages on sale decide which videos the catalog lists (lucky-art.mjs).
    await refreshLuckyArt().catch((e) => console.error('lucky art refresh', String(e?.message ?? e).slice(0, 200)));
    return out;
  },

  ...luckyArtRoutes,
};
