// Bağlar: two people tied as Çift, Kardeş, Ağabey, Kanka… (docs/BAGLAR.md).
//
//   GET  /api/bonds/info                         → { kinds, levels, rewards }           (public)
//   GET  /api/bonds?user=                        → { hidden, bonds }                    (someone's active bonds; mine without user)
//   GET  /api/bonds/requests                     → { incoming, outgoing }               (my pending requests)
//   POST /api/bonds/request  { to, kind, ref }   → { bond, user, replay }
//   POST /api/bonds/respond  { id, accept }      → { bond }
//   POST /api/bonds/withdraw { id }              → { bond }                             (the requester takes it back)
//   POST /api/bonds/end      { id }              → { bond }                             (either side, any time)
//   POST /api/bonds/privacy  { hidden }          → { hidden }
//
// Money: a request takes the bond gift's price from the requester at once (spendCoins, the lots it used kept on
// the bond). Accepted: those coins become the other person's diamonds like any gift (giftDiamonds, gift_events,
// agency income), so the finance panel sees a gift. Refused, withdrawn or unanswered for 3 days: the coins go
// back to the same lots, untouched by the panel. Ending a bond refunds nothing.
// Points: every coin the two spend on each other while bonded (the bond gift included) is 1/100 point, and each
// message that answers the other's adds 1 (at most 10 a day). Points never drop; ending resets the level.
import { recordIncome } from './agency-lib.mjs';
import { HttpError, auth, blockedBetween, claimRef, db, env, int, limit, move, once, readJson, tx, userId } from './core.mjs';
import { notify } from './push.mjs';
import { giftDiamonds, spendCoins } from './wallet.mjs';
import { KINDS, LEVELS, REWARDS, levelOf } from './bond-rules.mjs';

export { KINDS, LEVELS, REWARDS, levelOf };

const TALK_DAILY = 10;
const PENDING_MAX = 10;
const COOLDOWN_DAYS = 7;

export const scoreOf = (b) => Math.floor(Number(b.gift_coins) / 100) + Number(b.talk_points);

const SELECT = `SELECT x.*, ua.name AS a_name, ua.avatar_url AS a_avatar, ub.name AS b_name, ub.avatar_url AS b_avatar
                  FROM bonds x JOIN users ua ON ua.id = x.a JOIN users ub ON ub.id = x.b`;

/** A bond as `me` sees it: the other person is the partner. */
function out(b, me) {
  const mine = b.a === me;
  const score = scoreOf(b);
  const level = levelOf(score);
  return {
    id: Number(b.id),
    kind: b.kind,
    label: KINDS[b.kind].label,
    status: b.status,
    requester: mine,
    partner: mine ? { id: b.b, name: b.b_name, avatarUrl: b.b_avatar ?? null } : { id: b.a, name: b.a_name, avatarUrl: b.a_avatar ?? null },
    price: Number(b.held_coins),
    score,
    level,
    nextLevelAt: LEVELS[level] ?? null,
    createdAt: b.created_at,
    expiresAt: b.expires_at,
    since: b.accepted_at,
  };
}

async function bondRow(c, id, lock = false) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Geçersiz bağ');
  const r = await c.query(`SELECT * FROM bonds WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!r.rowCount) throw new HttpError(404, 'Bağ bulunamadı');
  return r.rows[0];
}
const view = async (id, me) => out((await db.query(`${SELECT} WHERE x.id = $1`, [id])).rows[0], me);

/** Active bonds of `kind` someone has, plus (for the requester) their own pending requests of it. */
async function countKind(c, user, kind, withPending) {
  const r = await c.query(
    `SELECT count(*) AS n FROM bonds WHERE kind = $2 AND ((status = 'active' AND (a = $1 OR b = $1)) OR ($3 AND status = 'pending' AND a = $1))`,
    [user, kind, withPending],
  );
  return Number(r.rows[0].n);
}

/** Puts a pending bond's coins back on the requester's lots. The requester's row and the bond must be locked. */
async function refund(c, bond, status, reason) {
  const lots = Array.isArray(bond.held_lots) ? bond.held_lots : [];
  for (const p of lots) if (p.lot) await c.query('UPDATE coin_lots SET remaining = LEAST(amount, remaining + $2) WHERE id = $1', [p.lot, p.amount]);
  // No channel: the coins come back, none are created, so the finance panel has nothing to record.
  await move(c, bond.a, 'coin', Number(bond.held_coins), reason, `bond-${bond.id}-iade`, bond.b, { detail: { bond: Number(bond.id), lots } });
  await c.query('UPDATE bonds SET status = $2, ended_at = now() WHERE id = $1', [bond.id, status]);
}

/** Locks the two accounts in id order (no deadlock when both act at once), then the bond. */
async function lockPair(c, bondId) {
  const peek = await bondRow(c, bondId);
  await c.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[peek.a, peek.b]]);
  return bondRow(c, bondId, true);
}

/** Inside a gift's transaction: coins spent on a bonded partner raise the bond. */
export async function addBondCoins(c, sender, recipient, total) {
  await c.query(`UPDATE bonds SET gift_coins = gift_coins + $3 WHERE pair_lo = LEAST($1::uuid, $2::uuid) AND pair_hi = GREATEST($1::uuid, $2::uuid) AND status = 'active'`, [
    sender,
    recipient,
    total,
  ]);
}

/** After a direct message: an answer to the other's last message is 1 point (10 a day, Turkey's calendar). */
export async function bondTalk(sender, recipient, messageId) {
  const bond = await db.query(`SELECT id FROM bonds WHERE pair_lo = LEAST($1::uuid, $2::uuid) AND pair_hi = GREATEST($1::uuid, $2::uuid) AND status = 'active'`, [sender, recipient]);
  if (!bond.rowCount) return;
  const prev = await db.query(
    `SELECT sender FROM messages WHERE LEAST(sender, recipient) = LEAST($1::uuid, $2::uuid) AND GREATEST(sender, recipient) = GREATEST($1::uuid, $2::uuid) AND id < $3 ORDER BY id DESC LIMIT 1`,
    [sender, recipient, messageId],
  );
  if (prev.rows[0]?.sender !== recipient) return;
  await db.query(
    `UPDATE bonds SET talk_points = talk_points + 1,
            talk_today = CASE WHEN talk_day = (now() AT TIME ZONE 'Europe/Istanbul')::date THEN talk_today + 1 ELSE 1 END,
            talk_day = (now() AT TIME ZONE 'Europe/Istanbul')::date
      WHERE id = $1 AND (talk_day IS DISTINCT FROM (now() AT TIME ZONE 'Europe/Istanbul')::date OR talk_today < $2)`,
    [bond.rows[0].id, TALK_DAILY],
  );
}

/**
 * Requests nobody answered in 3 days (or whose recipient deleted the account) go back to the requester; bonds
 * with a deleted account end. Returns how many changed.
 */
export async function sweepBonds() {
  const due = await db.query(
    `SELECT x.id FROM bonds x JOIN users ub ON ub.id = x.b
      WHERE x.status = 'pending' AND (x.expires_at <= now() OR ub.deleted_at IS NOT NULL) ORDER BY x.id LIMIT 200`,
  );
  let n = 0;
  for (const { id } of due.rows) {
    await tx(async (c) => {
      const b = await lockPair(c, Number(id));
      if (b.status !== 'pending') return;
      await refund(c, b, 'expired', `Bağ isteği iadesi: ${KINDS[b.kind].label} (cevap gelmedi)`);
      n++;
    });
  }
  const gone = await db.query(
    `UPDATE bonds x SET status = 'ended', ended_at = now() FROM users u
      WHERE x.status = 'active' AND u.id IN (x.a, x.b) AND u.deleted_at IS NOT NULL RETURNING x.id`,
  );
  return n + gone.rowCount;
}

let timer = null;
export function startBondSweep() {
  if (timer) return;
  const run = () => sweepBonds().catch((e) => console.error('bond sweep', e.message));
  const every = Number(env.BOND_SWEEP_MS);
  timer = setInterval(run, Number.isFinite(every) && every >= 100 ? every : 10 * 60_000);
  timer.unref();
  run();
}
export function stopBondSweep() {
  clearInterval(timer);
  timer = null;
}

export const bondRoutes = {
  async 'GET /api/bonds/info'() {
    return { kinds: Object.entries(KINDS).map(([id, k]) => ({ id, ...k })), levels: LEVELS, rewards: REWARDS };
  },

  async 'GET /api/bonds'(req, url) {
    const me = await auth(req);
    const who = url.searchParams.get('user') ? userId(url.searchParams.get('user')) : me.id;
    if (who !== me.id) {
      const u = await db.query('SELECT bonds_hidden FROM users WHERE id = $1 AND deleted_at IS NULL', [who]);
      if (!u.rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
      if (u.rows[0].bonds_hidden) return { hidden: true, bonds: [] };
    }
    const r = await db.query(
      `${SELECT} WHERE x.status = 'active' AND (x.a = $1 OR x.b = $1) AND ua.deleted_at IS NULL AND ub.deleted_at IS NULL
        ORDER BY (x.kind = 'cift') DESC, x.gift_coins DESC, x.accepted_at LIMIT 50`,
      [who],
    );
    return { hidden: who === me.id ? !!me.bonds_hidden : false, bonds: r.rows.map((b) => out(b, who)) };
  },

  async 'GET /api/bonds/requests'(req) {
    const me = await auth(req);
    const r = await db.query(`${SELECT} WHERE x.status = 'pending' AND (x.a = $1 OR x.b = $1) AND x.expires_at > now() ORDER BY x.id DESC LIMIT 50`, [me.id]);
    const rows = r.rows.map((b) => out(b, me.id));
    return { incoming: rows.filter((b) => !b.requester), outgoing: rows.filter((b) => b.requester) };
  },

  async 'POST /api/bonds/request'(req) {
    const me = await auth(req);
    limit(`bondreq:${me.id}`, 10, 'Çok fazla istek, biraz bekle');
    const b = await readJson(req);
    const kind = typeof b.kind === 'string' && Object.hasOwn(KINDS, b.kind) ? b.kind : null;
    if (!kind) throw new HttpError(400, 'Geçersiz bağ türü');
    const k = KINDS[kind];
    const to = userId(b.to, 'kişi');
    if (to === me.id) throw new HttpError(400, 'Kendinle bağ kuramazsın');
    if (await blockedBetween(me.id, to)) throw new HttpError(403, 'Bu kişiyle bağ kuramazsın');
    const res = await once(me.id, 'coin', b.ref, async (c) => {
      const locked = await c.query('SELECT id, name FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE', [[me.id, to]]);
      if (locked.rowCount < 2) throw new HttpError(404, 'Kullanıcı bulunamadı');
      await claimRef(c, me.id, 'coin', b.ref);
      const open = await c.query(`SELECT status FROM bonds WHERE pair_lo = LEAST($1::uuid, $2::uuid) AND pair_hi = GREATEST($1::uuid, $2::uuid) AND status IN ('pending', 'active')`, [me.id, to]);
      if (open.rowCount) throw new HttpError(409, open.rows[0].status === 'active' ? 'Bu kişiyle zaten bir bağın var' : 'Bu kişiyle bekleyen bir bağ isteği var');
      const recent = await c.query(
        `SELECT 1 FROM bonds WHERE pair_lo = LEAST($1::uuid, $2::uuid) AND pair_hi = GREATEST($1::uuid, $2::uuid) AND status = 'ended' AND ended_at > now() - make_interval(days => $3)`,
        [me.id, to, COOLDOWN_DAYS],
      );
      if (recent.rowCount) throw new HttpError(409, `Bu kişiyle bağın yakın zamanda bitti; ${COOLDOWN_DAYS} gün sonra yeniden kurabilirsin`);
      const pending = await c.query(`SELECT count(*) AS n FROM bonds WHERE a = $1 AND status = 'pending'`, [me.id]);
      if (Number(pending.rows[0].n) >= PENDING_MAX) throw new HttpError(409, `Aynı anda en fazla ${PENDING_MAX} bekleyen isteğin olabilir`);
      if ((await countKind(c, me.id, kind, true)) >= k.max) throw new HttpError(409, k.max === 1 ? `Zaten bir ${k.label} bağın var` : `En fazla ${k.max} ${k.label} bağın olabilir`);
      if ((await countKind(c, to, kind, false)) >= k.max) throw new HttpError(409, `Bu kişinin ${k.label} bağları dolu`);
      const parts = await spendCoins(c, me.id, k.price, `Bağ isteği: ${k.label} (${k.gift})`, b.ref, to, { detail: { bondKind: kind } });
      await c.query(
        `INSERT INTO bonds (a, b, pair_lo, pair_hi, kind, held_coins, held_lots, ref) VALUES ($1, $2, LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), $3, $4, $5, $6)`,
        [me.id, to, kind, k.price, JSON.stringify(parts), b.ref],
      );
    });
    const row = await db.query('SELECT id FROM bonds WHERE a = $1 AND ref = $2', [me.id, b.ref]);
    // A copy of the same request raced another request to the same person: nothing was taken.
    if (!row.rowCount) throw new HttpError(409, 'Bu kişiyle bekleyen bir bağ isteği var');
    const bond = await view(Number(row.rows[0].id), me.id);
    if (!res.replay) notify([to], { title: 'Bağ isteği', body: `${me.name} seninle ${k.label} bağı kurmak istiyor`, data: { type: 'bond', id: bond.id } });
    return { ...res, bond };
  },

  async 'POST /api/bonds/respond'(req) {
    const me = await auth(req);
    const body = await readJson(req);
    const id = int(body.id, 1, Number.MAX_SAFE_INTEGER);
    if (id === null) throw new HttpError(400, 'Geçersiz bağ');
    const accept = body.accept === true;
    const result = await tx(async (c) => {
      const b = await lockPair(c, id);
      if (b.b !== me.id) throw new HttpError(403, 'Bu istek sana gelmedi');
      if (b.status !== 'pending') throw new HttpError(409, 'Bu istek artık geçerli değil');
      const k = KINDS[b.kind];
      if (b.expires_at <= new Date()) {
        await refund(c, b, 'expired', `Bağ isteği iadesi: ${k.label} (cevap gelmedi)`);
        return 'expired';
      }
      if (!accept) {
        await refund(c, b, 'refused', `Bağ isteği iadesi: ${k.label} (kabul edilmedi)`);
        return 'refused';
      }
      if (await blockedBetween(b.a, b.b)) throw new HttpError(403, 'Bu kişiyle bağ kuramazsın');
      const alive = await c.query('SELECT count(*) AS n FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL', [[b.a, b.b]]);
      if (Number(alive.rows[0].n) < 2) throw new HttpError(404, 'Kullanıcı bulunamadı');
      // Room may have filled since the request: mine, or theirs from another bond accepted meanwhile.
      if ((await countKind(c, me.id, b.kind, false)) >= k.max) throw new HttpError(409, `${k.label} bağların dolu; önce birini bitir`);
      if ((await countKind(c, b.a, b.kind, false)) >= k.max) throw new HttpError(409, `İsteği gönderenin ${k.label} bağları dolu`);
      const total = Number(b.held_coins);
      const ref = `bond-${b.id}`;
      const g = await c.query(`INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, room, ref) VALUES ($1, $2, $3, 1, $4, $4, NULL, $5) RETURNING id`, [
        b.a,
        b.b,
        `bag-${b.kind}`,
        total,
        ref,
      ]);
      const giftEvent = Number(g.rows[0].id);
      await giftDiamonds(c, { sender: b.a, recipient: b.b, parts: b.held_lots, total, label: `${k.gift} (${k.label} bağı)`, ref, giftEvent });
      await recordIncome(c, b.b, 'gift', `gift:${giftEvent}`, total);
      await c.query(`UPDATE bonds SET status = 'active', accepted_at = now(), gift_coins = held_coins WHERE id = $1`, [b.id]);
      return 'active';
    });
    const bond = await view(id, me.id);
    if (result === 'expired') throw new HttpError(410, 'İsteğin süresi doldu, jeton gönderene döndü');
    notify([bond.partner.id], {
      title: result === 'active' ? 'Bağ kuruldu' : 'Bağ isteği',
      body: result === 'active' ? `${me.name} ${bond.label} bağı isteğini kabul etti` : `${me.name} ${bond.label} bağı isteğini kabul etmedi; jetonun geri döndü`,
      data: { type: 'bond', id },
    });
    return { bond };
  },

  async 'POST /api/bonds/withdraw'(req) {
    const me = await auth(req);
    const id = int((await readJson(req)).id, 1, Number.MAX_SAFE_INTEGER);
    if (id === null) throw new HttpError(400, 'Geçersiz bağ');
    await tx(async (c) => {
      const b = await lockPair(c, id);
      if (b.a !== me.id) throw new HttpError(403, 'Bu isteği sen göndermedin');
      if (b.status !== 'pending') throw new HttpError(409, 'Bu istek artık geçerli değil');
      await refund(c, b, 'withdrawn', `Bağ isteği iadesi: ${KINDS[b.kind].label} (geri alındı)`);
    });
    return { bond: await view(id, me.id) };
  },

  async 'POST /api/bonds/end'(req) {
    const me = await auth(req);
    const id = int((await readJson(req)).id, 1, Number.MAX_SAFE_INTEGER);
    if (id === null) throw new HttpError(400, 'Geçersiz bağ');
    const r = await db.query(`UPDATE bonds SET status = 'ended', ended_at = now(), ended_by = $2 WHERE id = $1 AND status = 'active' AND (a = $2 OR b = $2) RETURNING id`, [id, me.id]);
    if (!r.rowCount) {
      const b = await bondRow(db, id);
      if (b.a !== me.id && b.b !== me.id) throw new HttpError(403, 'Bu bağ senin değil');
      throw new HttpError(409, 'Bu bağ zaten bitmiş');
    }
    const bond = await view(id, me.id);
    notify([bond.partner.id], { title: 'Bağ bitti', body: `${me.name} ${bond.label} bağını bitirdi`, data: { type: 'bond', id } });
    return { bond };
  },

  async 'POST /api/bonds/privacy'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    if (typeof b.hidden !== 'boolean') throw new HttpError(400, 'Geçersiz ayar');
    await db.query('UPDATE users SET bonds_hidden = $2 WHERE id = $1', [me.id, b.hidden]);
    return { hidden: b.hidden };
  },
};
