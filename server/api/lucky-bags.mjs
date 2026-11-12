// Şanslı çanta: a bag of coins or of gifts dropped in a room. While it falls, whoever taps it joins; when its time
// is up the server deals its shares among them at random and pays them all out.
//
//   GET  /api/lucky-bags?room=                 → { bags, rules, serverNow }   the room's bags still open
//   GET  /api/lucky-bags/one?id=               → { bag, grabs }                who won how much (after the draw)
//   POST /api/lucky-bags       { room, kind, amount?, giftId?, count?, packets, delay, followersOnly, ref }
//                                              → { bag, user, replay }
//   POST /api/lucky-bags/grab  { id }          → { joined, bag }               I'm in the draw (again: no change)
//
// The sender pays the whole bag when it is dropped; the coins are kept aside in the bag lot by lot, so where they
// came from (and the lock that follows from it) travels with them, and a store refund still finds them. The
// shares are drawn then, on the server. A bag can wait 0, 2 or 5 minutes before it opens and falls windowSeconds
// after that; everyone who taps it then joins (once). At its end (drawBags, every couple of seconds) the shares
// are dealt among those who joined at random (lucky-bag-rules.mjs deal): with more people than shares not everyone
// wins, with fewer some win more than one share, and the whole bag is always paid out. Nobody joined: it all goes
// back to the sender. A coin bag gives coins (channel 'canta', the store lock). A gift bag gives the gifts
// themselves: each winner's shares are a gift from the sender to them (gift_events, diamonds, agency income),
// exactly as if sent by hand. Winners hear of it (notify: push and live line), the room by its 'bag' packet.
// Putting coins in a bag never counts
// for Cömertlik (wheel.mjs wealthPoints: "çantası"); reward coins ('odul') can't go in a bag (spendCoins 'paid').
import { recordIncome } from './agency-lib.mjs';
import { GIFTS, svipLevel } from './catalog.mjs';
import { HttpError, auth, blockedBetween, claimRef, db, env, int, limit, once, readJson, tx } from './core.mjs';
import { announceGift, liveKitRoom, ROOM } from './gifts.mjs';
import { live } from './live-settings.mjs';
import { BAG_RULES, deal, split, takeParts } from './lucky-bag-rules.mjs';
import { notify } from './push.mjs';
import { presenceTracked, roomService } from './live.mjs';
import { creditCoins, giftDiamonds, spendCoins } from './wallet.mjs';

const fmt = (n) => n.toLocaleString('tr-TR');

const bagView = (b, me, mine = null) => ({
  id: Number(b.id),
  room: b.room,
  kind: b.kind,
  giftId: b.gift_id,
  unitPrice: Number(b.unit_price),
  units: Number(b.units),
  coins: Number(b.units) * Number(b.unit_price),
  packets: Number(b.packets),
  left: b.shares.length,
  followersOnly: b.followers_only,
  opensAt: new Date(b.opens_at).toISOString(),
  closesAt: new Date(b.closes_at).toISOString(),
  status: b.status,
  from: { id: b.sender, name: b.sender_name ?? '', avatarUrl: b.sender_avatar ?? null },
  mine: b.sender === me,
  // What I won from it (units), or null (not drawn yet, or nothing for me).
  got: mine === null || mine === undefined ? null : Number(mine),
  // The draw: how many joined, whether I did, and when it is (the bag's end).
  entrants: Number(b.entrants ?? 0),
  joined: !!b.joined,
  drawAt: new Date(b.closes_at).toISOString(),
});

const SELECT = `SELECT b.*, u.name AS sender_name, u.avatar_url AS sender_avatar FROM lucky_bags b JOIN users u ON u.id = b.sender`;
/** The draw's counts for a bag row `b` and me ($2). */
const DRAW_COLS = `(SELECT count(*) FROM lucky_bag_entries e WHERE e.bag_id = b.id)::int AS entrants,
  EXISTS (SELECT 1 FROM lucky_bag_entries e WHERE e.bag_id = b.id AND e.user_id = $2) AS joined`;

async function grabsOf(c, id) {
  const r = await c.query('SELECT g.user_id, g.units, g.coins, u.name, u.avatar_url FROM lucky_bag_grabs g JOIN users u ON u.id = g.user_id WHERE g.bag_id = $1 ORDER BY g.units DESC, g.created_at', [id]);
  return r.rows.map((x) => ({ user: { id: x.user_id, name: x.name, avatarUrl: x.avatar_url ?? null }, units: Number(x.units), coins: Number(x.coins) }));
}

function announceBag(room, packet) {
  const data = Buffer.from(JSON.stringify({ type: 'bag', ...packet })).toString('base64');
  roomService('SendData', { room, data, kind: 'RELIABLE' }, { roomAdmin: true, room }).catch((e) => console.error('livekit SendData bag', room, String(e).slice(0, 200)));
}

/** A bag that nobody joined: all of it goes back to the sender (lock held). */
async function giveBack(c, b) {
  const back = b.parts.reduce((sum, p) => sum + p.amount, 0);
  if (back > 0) {
    await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [b.sender]);
    const portions = b.parts.map((p) => ({ channel: p.channel, amount: p.amount, lockHours: p.lockHours, sourceLot: p.lot }));
    await creditCoins(c, b.sender, portions, 'Şanslı çanta: açılmayan payların iadesi', `bag:${b.id}:back`, null, { detail: { bag: Number(b.id) } });
  }
  await c.query("UPDATE lucky_bags SET status = 'returned', shares = '{}', parts = '[]', returned = $2 WHERE id = $1", [b.id, back]);
}

/** Bags whose time is up: their shares dealt among those who joined and paid, or back to the sender. */
export async function drawBags() {
  const due = await db.query("SELECT id FROM lucky_bags WHERE status = 'open' AND closes_at <= now() ORDER BY id LIMIT 100");
  for (const { id } of due.rows) {
    const out = await tx(async (c) => {
      const b = (await c.query(`${SELECT} WHERE b.id = $1 AND b.status = 'open' FOR UPDATE OF b`, [id])).rows[0];
      if (!b) return null;
      const entrants = (await c.query('SELECT user_id FROM lucky_bag_entries WHERE bag_id = $1 ORDER BY created_at', [id])).rows.map((r) => r.user_id);
      const winners = deal(b.shares, entrants);
      if (!winners.length) {
        await giveBack(c, b);
        return { b, paid: [] };
      }
      // Every winner's row and the sender's (a gift's diamonds), in id order as gifts.mjs.
      await c.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[b.sender, ...winners.map(([w]) => w)]]);
      const label = b.kind === 'gift' ? (GIFTS.get(b.gift_id)?.name ?? 'Hediye') : null;
      let parts = b.parts;
      const paid = [];
      for (const [k, [who, units]] of winners.entries()) {
        const coins = units * Number(b.unit_price);
        const [taken, kept] = takeParts(parts, coins);
        parts = kept;
        let event = null;
        if (b.kind === 'coins') {
          const portions = taken.map((p) => ({ channel: 'canta', amount: p.amount, lockHours: p.lockHours, sourceLot: p.lot, sourceUser: b.sender }));
          await creditCoins(c, who, portions, `Şanslı çanta: ${b.sender_name}`, `bag:${id}`, b.sender, { detail: { bag: Number(id) } });
        } else {
          const ref = `bag:${id}:${k}`;
          const g = await c.query('INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, room, ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [
            b.sender,
            who,
            b.gift_id,
            units,
            b.unit_price,
            coins,
            b.room,
            ref,
          ]);
          event = Number(g.rows[0].id);
          await giftDiamonds(c, { sender: b.sender, recipient: who, parts: taken, total: coins, label: `${label} ×${units}`, ref, giftEvent: event, reason: `Şanslı çanta: ${label} ×${units}` });
          await recordIncome(c, who, 'gift', `gift:${event}`, coins);
        }
        await c.query('INSERT INTO lucky_bag_grabs (bag_id, user_id, units, coins, gift_event) VALUES ($1,$2,$3,$4,$5)', [id, who, units, coins, event]);
        paid.push({ who, units, coins, event });
      }
      await c.query("UPDATE lucky_bags SET status = 'done', shares = '{}', parts = $2 WHERE id = $1", [id, JSON.stringify(parts)]);
      return { b, paid, label };
    }).catch((e) => {
      console.error('lucky bag draw', id, e.message);
      return null;
    });
    if (!out) continue;
    const { b, paid, label } = out;
    // The room reads the bag again (its winners); each winner hears what they got, even outside the room.
    announceBag(b.room, { id: Number(id), from: b.sender, drawn: true });
    for (const p of paid) {
      const what = b.kind === 'coins' ? `${fmt(p.coins)} jeton` : `${label} ×${p.units}`;
      notify([p.who], { title: 'Şanslı çanta', body: `${b.sender_name} kişisinin çantasından ${what} kazandın`, data: { type: 'bag', bag: Number(id) } });
    }
    // Gift winnings show on stage like any gift in the room (the first few: a big draw doesn't flood it).
    for (const p of paid.filter((x) => x.event).slice(0, 10)) announceGift(b.room, { giftId: b.gift_id, count: p.units, from: b.sender, to: p.who, eventId: p.event });
  }
}

let timer = null;
export function startBagSweep() {
  if (timer) return;
  // BAG_SWEEP_MS: tests sweep faster.
  const every = Number(env.BAG_SWEEP_MS);
  // Every 2 s: the draw comes right after a bag stops falling.
  timer = setInterval(() => void drawBags().catch((e) => console.error('lucky bag sweep', e.message)), Number.isFinite(every) && every >= 100 ? every : 2_000);
  timer.unref();
}
export function stopBagSweep() {
  clearInterval(timer);
  timer = null;
}

export const luckyBagRoutes = {
  async 'GET /api/lucky-bags'(req, url) {
    const u = await auth(req);
    const room = liveKitRoom(url.searchParams.get('room'));
    if (!room) throw new HttpError(400, 'Geçersiz oda');
    const r = await db.query(
      `${SELECT.replace('SELECT b.*', `SELECT b.*, g.units AS my_units, ${DRAW_COLS}`)} LEFT JOIN lucky_bag_grabs g ON g.bag_id = b.id AND g.user_id = $2
        WHERE b.room = $1 AND b.status = 'open' AND b.closes_at > now() ORDER BY b.opens_at, b.id LIMIT 20`,
      [room, u.id],
    );
    return { bags: r.rows.map((b) => bagView(b, u.id, b.my_units)), rules: BAG_RULES, serverNow: new Date().toISOString() };
  },

  async 'GET /api/lucky-bags/one'(req, url) {
    const u = await auth(req);
    const id = int(Number(url.searchParams.get('id')), 1, Number.MAX_SAFE_INTEGER);
    if (!id) throw new HttpError(400, 'Geçersiz çanta');
    const b = (await db.query(`${SELECT.replace('SELECT b.*', `SELECT b.*, ${DRAW_COLS}`)} WHERE b.id = $1`, [id, u.id])).rows[0];
    if (!b) throw new HttpError(404, 'Çanta bulunamadı');
    const grabs = await grabsOf(db, id);
    return { bag: bagView(b, u.id, grabs.find((g) => g.user.id === u.id)?.units ?? null), grabs, serverNow: new Date().toISOString() };
  },

  async 'POST /api/lucky-bags'(req) {
    const u = await auth(req);
    const b = await readJson(req);
    const raw = b.room === undefined || b.room === null ? '' : String(b.room);
    const room = ROOM.test(raw) ? liveKitRoom(raw) : null;
    if (!room) throw new HttpError(400, 'Şanslı çanta yalnızca bir odada atılır');
    const kind = b.kind === 'gift' ? 'gift' : b.kind === 'coins' ? 'coins' : null;
    if (!kind) throw new HttpError(400, 'Jeton ya da hediye çantası seç');
    const packets = int(b.packets, 1, 1000);
    const delay = int(b.delay ?? 0, 0, 3600);
    if (delay === null || !BAG_RULES.delays.includes(delay)) throw new HttpError(400, 'Açılma zamanı geçersiz');
    let units;
    let unitPrice = 1;
    let gift = null;
    if (kind === 'coins') {
      units = int(b.amount, 1, 10_000_000);
      if (!units || !BAG_RULES.coins.includes(units)) throw new HttpError(400, `Çantaya ${BAG_RULES.coins.map(fmt).join(', ')} jeton konabilir`);
      if (!packets || !BAG_RULES.coinPackets.includes(packets)) throw new HttpError(400, `Pay sayısı ${BAG_RULES.coinPackets.join(', ')} olabilir`);
    } else {
      gift = GIFTS.get(b.giftId);
      if (!gift || live().giftsHidden.has(gift.id)) throw new HttpError(400, 'Bu hediye artık yok');
      if (gift.minSvip && svipLevel(Number(u.svip_xp)) < gift.minSvip) throw new HttpError(403, `${gift.name} VIP ${gift.minSvip} ve üstü için`);
      units = int(b.count, 1, 10_000);
      if (!units || !BAG_RULES.giftCounts.includes(units)) throw new HttpError(400, `Hediye adedi ${BAG_RULES.giftCounts.join(', ')} olabilir`);
      if (!packets || !BAG_RULES.giftPackets.includes(packets)) throw new HttpError(400, `Pay sayısı ${BAG_RULES.giftPackets.join(', ')} olabilir`);
      unitPrice = gift.price;
    }
    if (packets > units) throw new HttpError(400, 'Pay sayısı çantadakinden fazla olamaz');
    // The room must be an open server room.
    const open = await db.query('SELECT 1 FROM rooms WHERE id = $1 AND closed_at IS NULL', [room.slice(4)]);
    if (!open.rowCount) throw new HttpError(404, 'Oda kapalı');
    limit(`bag:${u.id}`, 10, 'Çok sık çanta atıyorsun, biraz bekle');
    const total = units * unitPrice;
    const what = kind === 'coins' ? `${fmt(units)} jeton` : `${gift.name} ×${units}`;
    let bag = null;
    const out = await once(u.id, 'coin', b.ref, async (c) => {
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [u.id]);
      await claimRef(c, u.id, 'coin', b.ref);
      // "çantası" keeps it out of Cömertlik (wheel.mjs wealthPoints).
      const parts = await spendCoins(c, u.id, total, `${kind === 'coins' ? 'Jeton çantası' : 'Hediye çantası'}: ${what}`, b.ref, null, { detail: { luckyBag: kind } });
      const shares = split(units, packets);
      const r = await c.query(
        `INSERT INTO lucky_bags (room, sender, kind, gift_id, unit_price, units, packets, shares, parts, followers_only, opens_at, closes_at, ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() + make_interval(secs => $11), now() + make_interval(secs => $11 + $12), $13) RETURNING *`,
        [room, u.id, kind, gift?.id ?? null, unitPrice, units, packets, shares, JSON.stringify(parts), b.followersOnly === true, delay, BAG_RULES.windowSeconds, b.ref],
      );
      bag = r.rows[0];
    });
    if (out.replay) {
      bag = (await db.query('SELECT * FROM lucky_bags WHERE sender = $1 AND ref = $2', [u.id, b.ref])).rows[0];
      if (!bag) throw new HttpError(409, 'Geçersiz istek kimliği');
    } else announceBag(room, { id: Number(bag.id), from: u.id });
    return { ...out, bag: bagView({ ...bag, sender_name: u.name, sender_avatar: u.avatar_url }, u.id) };
  },

  async 'POST /api/lucky-bags/grab'(req) {
    const u = await auth(req);
    const b = await readJson(req);
    const id = int(b.id, 1, Number.MAX_SAFE_INTEGER);
    if (!id) throw new HttpError(400, 'Geçersiz çanta');
    limit(`bag-grab:${u.id}`, 30);
    const peek = (await db.query(`${SELECT} WHERE b.id = $1`, [id])).rows[0];
    if (!peek) throw new HttpError(404, 'Çanta bulunamadı');
    if (peek.sender === u.id) throw new HttpError(400, 'Kendi çantanı açamazsın');
    if (await blockedBetween(u.id, peek.sender)) throw new HttpError(403, 'Bu çantayı açamazsın');
    const early = () => Object.assign(new HttpError(409, 'Çanta henüz açılmadı'), { extra: { code: 'early' } });
    if (Date.parse(peek.opens_at) > Date.now()) throw early();
    // Only someone in the room, when the voice server tells us who is (live.mjs presenceTracked).
    if (presenceTracked() && !(await db.query('SELECT 1 FROM room_presence WHERE room = $1 AND identity = $2', [peek.room, u.id])).rowCount) throw new HttpError(403, 'Çantayı açmak için odada olmalısın');
    if (peek.followers_only && !(await db.query('SELECT 1 FROM follows WHERE follower = $1 AND followee = $2', [u.id, peek.sender])).rowCount) {
      throw Object.assign(new HttpError(403, `Bu çantayı yalnızca ${peek.sender_name} kişisini takip edenler açabilir`), { extra: { code: 'followers' } });
    }
    // I join the draw: once, while the bag falls. A tap again changes nothing.
    await tx(async (c) => {
      const bag = (await c.query('SELECT status, opens_at, closes_at FROM lucky_bags WHERE id = $1 FOR SHARE', [id])).rows[0];
      if (Date.parse(bag.opens_at) > Date.now()) throw early();
      if (bag.status !== 'open' || Date.parse(bag.closes_at) <= Date.now()) throw Object.assign(new HttpError(409, 'Süre doldu, çekiliş yapıldı'), { extra: { code: 'empty' } });
      await c.query('INSERT INTO lucky_bag_entries (bag_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, u.id]);
    });
    const bag = (await db.query(`${SELECT.replace('SELECT b.*', `SELECT b.*, ${DRAW_COLS}`)} WHERE b.id = $1`, [id, u.id])).rows[0];
    return { joined: true, bag: bagView(bag, u.id) };
  },
};
