// Şanslı hediyeler: gifts with a draw, played on the server (the app shows them: app/src/lib/lucky.ts).
//
//   GET  /api/lucky                                          → { version, gifts, announceFrom, share, counts, needLevel,
//                                                               allowed, minAge, gameCoins, mine }
//   POST /api/lucky/send { giftId, to: [ids], count, room?, ref, named? } → { send, user, replay }
//   GET  /api/admin/lucky                                    → { config, version, updatedAt, stats, recent, winners } (admins)
//   POST /api/admin/lucky/config { config, version }         → { config, version, updatedAt }                       (admins)
//
// A send is `count` gifts of one package to each recipient. The sender pays price × count for each (paid coins
// only, as any gift). Each recipient gets SHARE (20 %) of that as diamonds, a gift like any other: diamond locks,
// gift_events, agency income ('lucky_gift'), PK points, bond and room XP all count the share. The rest of the
// price is a coin_spend for the finance panel ("Uygulama içi:"). Every gift is one draw (crypto.randomInt over
// ODDS_TOTAL); a win pays price × multiplier to the sender in coins, on their own channel ('ugurlu',
// wallet.mjs): spent like any coin, but what they pay for never counts for Cömertlik (wheel.mjs wealthPoints).
// Open from Cömertlik Lv.2 and 18 years, checked on every send, like Rüzgâr Gülü. A package takes no new sends
// while the rewards paid today across the platform plus its top reward would pass the daily limit.
// The odds a send was drawn with are stored on it; an admin's later edit never changes an old result. Every
// edit is audited (sanction_audit_logs, action lucky_config).
// A win is announced to everyone with the app open (live-line.mjs lineWin, the banner on top of every room) from the
// live setting lucky_announce_min_coins up (0: every win); with the sender's name only when the send says `named`.
import crypto from 'node:crypto';

import { recordIncome } from './agency-lib.mjs';
import { addBondCoins } from './bonds.mjs';
import { GIFT_COUNTS } from './catalog.mjs';
import { HttpError, REF, ageOf, auth, blockedBetween, db, limit, readJson, selfUser, tx, userId } from './core.mjs';
import { ROOM, announceGift, liveKitRoom } from './gifts.mjs';
import { DEFAULT_CONFIG, MIN_AGE, ODDS_TOTAL, SHARE, checkConfig, drawMult, maxMult } from './lucky-rules.mjs';
import { announceRoom } from './live.mjs';
import { lineWin } from './live-line.mjs';
import { live } from './live-settings.mjs';
import { scorePkGift } from './pk.mjs';
import { roomLevel } from './rooms.mjs';
import { announceBoss, bossGift } from './boss-seat.mjs';
import { audit } from './sanctions.mjs';
import { creditCoins, giftCoins, spendCoins } from './wallet.mjs';
import { NEED_LEVEL, NEED_POINTS, wealthPoints } from './wheel.mjs';

/** People one send can go to (everyone on the mics of the biggest room, with room to spare). */
const MAX_TO = 20;
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
      gifts: config.gifts.filter((g) => g.enabled).map((g) => ({ ...g, open: paid + g.price * maxMult(g) <= config.dailyPayoutLimit })),
      announceFrom: config.announceFrom,
      share: SHARE,
      counts: GIFT_COUNTS,
      needLevel: NEED_LEVEL,
      allowed: points >= NEED_POINTS,
      minAge: MIN_AGE,
      gameCoins: Number(me.game_coins),
      mine: mine.rows.map(sendOut),
    };
  },

  async 'POST /api/lucky/send'(req) {
    const me = await auth(req);
    limit(`lucky:${me.id}`, 60, 'Çok hızlı gönderiyorsun, biraz bekle');
    const b = await readJson(req);
    if (!REF.test(b.ref ?? '') || b.ref.length > 60) throw new HttpError(400, 'Geçersiz istek kimliği');
    if (typeof b.giftId !== 'string' || b.giftId.length > 30) throw new HttpError(400, 'Hediye bulunamadı');
    if (!GIFT_COUNTS.includes(b.count)) throw new HttpError(400, `Adet ${GIFT_COUNTS.join(', ')} olabilir`);
    if (!Array.isArray(b.to) || b.to.length < 1 || b.to.length > MAX_TO) throw new HttpError(400, 'Geçersiz alıcı');
    const to = b.to.map((x) => userId(x, 'alıcı'));
    if (new Set(to).size !== to.length) throw new HttpError(400, 'Geçersiz alıcı');
    if (to.includes(me.id)) throw new HttpError(400, 'Kendine Şanslı hediye gönderemezsin');
    const room = b.room === undefined || b.room === null ? null : String(b.room);
    if (room !== null && !ROOM.test(room)) throw new HttpError(400, 'Geçersiz oda');
    const { ref, count } = b;
    // The ledger's idempotency key (user, currency, ref) is shared by every wallet feature: these rows carry
    // "lucky:" (a colon no client ref can hold), so a ref used elsewhere neither breaks a send nor looks like one.
    const lref = `lucky:${ref}`;
    const seen = async () => (await db.query('SELECT * FROM lucky_sends WHERE user_id = $1 AND ref = $2', [me.id, ref])).rows[0];
    const answer = async (row, replay) => ({ send: sendOut(row), user: selfUser((await db.query('SELECT * FROM users WHERE id = $1', [me.id])).rows[0]), replay });

    const before = await seen();
    if (before) return answer(before, true);
    if (!me.birth_date || ageOf(me.birth_date) < MIN_AGE) throw new HttpError(403, `Şanslı hediyeler ${MIN_AGE} yaş ve üzeri içindir`);
    if ((await wealthPoints(db, me.id)) < NEED_POINTS) throw new HttpError(403, `Şanslı hediyeler Cömertlik Lv.${NEED_LEVEL} ve üstü için`);
    for (const t of to) if (await blockedBetween(me.id, t)) throw new HttpError(403, 'Bu kişiye hediye gönderemezsin');

    let row;
    let levelUp = false;
    let events = [];
    let boss = [];
    let announceFrom = DEFAULT_CONFIG.announceFrom;
    let gift;
    try {
      row = await tx(async (c) => {
        // Every account this send touches, locked in id order so two people gifting each other can't deadlock.
        const ids = [me.id, ...to];
        const locked = await c.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE', [ids]);
        if (locked.rowCount < ids.length) throw new HttpError(404, 'Alıcı bulunamadı');
        if ((await c.query('SELECT 1 FROM lucky_sends WHERE user_id = $1 AND ref = $2', [me.id, ref])).rowCount) throw Object.assign(new Error('replay'), { code: '23505' });
        const cur = await current(c);
        announceFrom = cur.config.announceFrom;
        gift = cur.config.gifts.find((g) => g.id === b.giftId);
        if (!gift || !gift.enabled) throw new HttpError(400, 'Bu Şanslı hediye şu an kapalı');
        if ((await paidToday(c)) + gift.price * maxMult(gift) > cur.config.dailyPayoutLimit) throw new HttpError(409, 'Günlük ödül limiti doldu; bu hediye yarın yeniden açılır');

        const cost = gift.price * count * to.length;
        const share = Math.floor(gift.price * SHARE) * count;
        const label = `${gift.name}${count > 1 ? ` ×${count}` : ''} (Şanslı)`;
        const roomId = liveKitRoom(room)?.slice(4);
        events = [];
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
          if (roomId) {
            const x = await c.query('UPDATE users SET room_xp = room_xp + $2 WHERE id = (SELECT owner FROM rooms WHERE id = $1 AND closed_at IS NULL) RETURNING room_xp', [roomId, share]);
            if (x.rowCount && roomLevel(Number(x.rows[0].room_xp)) > roomLevel(Number(x.rows[0].room_xp) - share)) levelUp = true;
          }
          // The same source ref as a plain gift, so the agency job's backfill from gift_events never counts it twice.
          await recordIncome(c, rid, 'lucky_gift', `gift:${eventId}`, share);
        }
        // Patron koltuğu (boss-seat.mjs): the whole send counts, every recipient together.
        boss = await bossGift(c, { roomId, sender: me.id, coins: cost });
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
    // Announced to the room's voice connection once paid, so no phone can fake a gift or a win.
    const lkRoom = liveKitRoom(room);
    if (lkRoom) {
      const best = Number(row.best_mult);
      announceGift(lkRoom, {
        type: 'lucky',
        giftId: gift.id,
        name: gift.name,
        emoji: gift.emoji,
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
      db.query('SELECT s.*, u.name FROM lucky_sends s JOIN users u ON u.id = s.user_id ORDER BY s.id DESC LIMIT 50'),
      db.query('SELECT s.*, u.name FROM lucky_sends s JOIN users u ON u.id = s.user_id WHERE s.best_mult >= $1 ORDER BY s.id DESC LIMIT 30', [cur.config.announceFrom]),
    ]);
    const num = (r) => Object.fromEntries(Object.entries(r.rows[0]).map(([k, v]) => [k, Number(v)]));
    const withName = (s) => ({ ...sendOut(s), sender: { id: s.user_id, name: s.name } });
    return {
      config: cur.config,
      version: cur.version,
      updatedAt: cur.updatedAt,
      stats: { today: num(today), total: num(total) },
      recent: recent.rows.map(withName),
      winners: winners.rows.map(withName),
    };
  },

  async 'POST /api/admin/lucky/config'(req) {
    const u = await admin(req);
    const b = await readJson(req);
    const config = checkConfig(b.config);
    return tx(async (c) => {
      // One save at a time; a save made on an older copy of the settings is refused instead of undoing the other.
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['lucky_config']);
      const cur = await current(c);
      if (b.version !== cur.version) throw new HttpError(409, 'Ayarlar bu arada değişti; yenileyip tekrar dene');
      const version = cur.version + 1;
      const r = await c.query(
        `INSERT INTO lucky_config (id, config, version, updated_by, updated_at) VALUES (1, $1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, version = EXCLUDED.version, updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING updated_at`,
        [JSON.stringify(config), version, u.id],
      );
      const summary = config.gifts.map((g) => ({ id: g.id, price: g.price, enabled: g.enabled, top: maxMult(g) }));
      await audit(c, { actor: u.id, role: u.role, action: 'lucky_config', detail: { version, gifts: summary, dailyPayoutLimit: config.dailyPayoutLimit, announceFrom: config.announceFrom } });
      return { config, version, updatedAt: r.rows[0].updated_at };
    });
  },
};
