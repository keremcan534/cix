// Yeni üye ödülleri: Arkadaşını Getir (a personal invite code and a reward for both people), a new account's welcome
// coins, and which coin packs still carry the first-purchase gift for me. Amounts and switches are live settings
// (live-registry.mjs "Yeni üye ödülleri", defaults as in the demo). Welcome and invite coins are reward coins ('odul',
// wallet.mjs: the shop only), so they can never be gifted or turn into diamonds.
//
//   GET  /api/rewards                                 → { welcome, firstBonus, invite }
//   GET  /api/invite                                  → { code, on, coins, dailyCap, enterDays, stats, mine }
//   POST /api/invite/redeem   { code }                → { mine }            (within ENTER_DAYS of sign-up)
//   POST /api/admin/referrals/revoke { invitee, reason } (admin) → { coins }   a fake account's invite coins back
//
// Invites:
//  - My code (SIMI-XXXXXX) is made the first time I open Davet and stays mine.
//  - An account enters one code, within ENTER_DAYS (7) of its sign-up: an older account's, not its own, not of
//    someone either of them blocked (that reads as "not found"). The same code again is a replay.
//  - The reward: when the invitee enters a room (live.mjs, LiveKit's signed participant_joined), or at once when they
//    have been in one before entering the code, both get invite_coins, and the inviter is told. Once per invitee
//    account (referrals.invitee_id, and the invitee's ledger ref after the inviter deleted their account).
//  - No reward when the invitee's phone was ever used by another account, deleted ones included (device_accounts; the
//    same hardware or keychain id counts as the same phone), or when no phone is known for the invitee. No reward
//    between people who blocked each other. Both are checked again when it would be paid.
//  - At most invite_daily_cap paid invites per inviter per day (Turkey's day); over it, the invite waits and is paid at
//    the invitee's next room entry on a day under the cap. An inviter with a running account ban isn't paid (it waits).
//    While the invite reward is switched off no code is taken and nothing is paid; waiting invites keep waiting.
//  - Staff take a fake account's invite coins back from both people (what is still unspent).
// Welcome coins: on a new account's first sign-in by phone, e-mail or Google (auth.mjs signedIn), once (ledger ref
// 'welcome:gift'), never for a phone another account used (the same device rule). Development sign-in gets none.
//
// The ledger refs here have a ':' that client refs (core.mjs REF) can't, so no request can take them first. Like the
// other reward coins (tasks, check-in), these credits are not sent to the finance panel (finance-sync.mjs).
// Kept: my code and who entered whose code with the reward's state, while both accounts exist; both go with either
// account (social.mjs eraseAccount). The coins paid stay in the ledger as accounting records, without names.
import crypto from 'node:crypto';

import { HttpError, UUID, auth, blockedBetween, clientIp, db, limit, liveBan, move, readJson, text, tx, userId } from './core.mjs';
import { PACKS } from './catalog.mjs';
import { live } from './live-settings.mjs';
import { notify } from './push.mjs';
import { creditCoins } from './wallet.mjs';

/** How long after sign-up a code may be entered. */
export const ENTER_DAYS = 7;
const DAY = 86_400_000;
const WELCOME_REF = 'welcome:gift';
const ref = (role, invitee) => `invite:${role}:${invitee}`;
const TR_DAY = "(date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul')";
// 32 symbols (no 0, O, 1, I), so a random byte maps to one without bias.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PREFIX = 'SIMI-';

/** "simi-ab2 c3d", "AB2C3D" → "SIMI-AB2C3D"; null when it can't be a code. */
export function codeOf(v) {
  if (typeof v !== 'string' || v.length > 40) return null;
  const s = v.toUpperCase().replace(/[\s-]/g, '').replace(/^SIMI/, '');
  return s.length === 6 && [...s].every((ch) => ALPHABET.includes(ch)) ? PREFIX + s : null;
}
const newCode = () => PREFIX + [...crypto.randomBytes(6)].map((b) => ALPHABET[b % 32]).join('');

/**
 * Whether `uid`'s phone is theirs alone: 'ok', 'shared' (another account, deleted or not, used the same phone) or
 * 'none' (no phone known: a sign-in without device signals).
 */
export async function phoneOf(q, uid) {
  const r = await q.query(
    `WITH mine AS (SELECT device_id FROM device_accounts WHERE user_id = $1),
          same AS (SELECT o.id FROM device_registry d JOIN device_registry o
                     ON o.id = d.id OR (d.hardware_hash IS NOT NULL AND o.hardware_hash = d.hardware_hash)
                     OR (d.keychain_hash IS NOT NULL AND o.keychain_hash = d.keychain_hash)
                    WHERE d.id IN (SELECT device_id FROM mine))
     SELECT (SELECT count(*) FROM mine)::int AS devices,
            EXISTS (SELECT 1 FROM device_accounts a WHERE a.device_id IN (SELECT id FROM same) AND a.user_id <> $1) AS shared`,
    [uid],
  );
  const x = r.rows[0];
  return x.devices === 0 ? 'none' : x.shared ? 'shared' : 'ok';
}

// --- Welcome coins ---------------------------------------------------------------------------------------------
/**
 * A new account's welcome coins, once, when the switch is on and its phone had no other account. Returns the
 * account row after the credit, or null when nothing was given. Never throws: a sign-in must not fail for a gift.
 */
export async function welcomeNewAccount(uid) {
  const s = live();
  if (s.rewardsOff.has('welcome')) return null;
  try {
    return await tx(async (c) => {
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [uid]);
      if ((await phoneOf(c, uid)) !== 'ok') return null;
      if ((await c.query("SELECT 1 FROM ledger WHERE user_id = $1 AND currency = 'coin' AND ref = $2", [uid, WELCOME_REF])).rowCount) return null;
      await creditCoins(c, uid, [{ channel: 'odul', amount: s.welcomeCoins }], 'Hoş geldin hediyesi', WELCOME_REF, null, { detail: { reward: 'welcome' } });
      return (await c.query('SELECT * FROM users WHERE id = $1', [uid])).rows[0];
    });
  } catch (e) {
    console.error('welcome coins', uid, String(e?.message ?? e).slice(0, 200));
    return null;
  }
}

// --- Invites ---------------------------------------------------------------------------------------------------
/** My code, made the first time it is asked for (a clash with someone else's code tries another). */
async function myCode(uid) {
  for (let i = 0; i < 5; i++) {
    const had = (await db.query('SELECT code FROM referral_codes WHERE user_id = $1', [uid])).rows[0];
    if (had) return had.code;
    try {
      await db.query('INSERT INTO referral_codes (user_id, code) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING', [uid, newCode()]);
    } catch (e) {
      if (e.code !== '23505') throw e;
    }
  }
  throw new HttpError(503, 'Davet kodu şu an oluşturulamadı, biraz sonra tekrar dene');
}

const enterUntil = (me) => new Date(new Date(me.created_at).getTime() + ENTER_DAYS * DAY);

/** The invite I entered (who, its state) and whether I may still enter one. Someone blocked either way has no name. */
async function mineOf(q, me) {
  const r = (await q.query('SELECT f.*, u.name FROM referrals f JOIN users u ON u.id = f.inviter_id WHERE f.invitee_id = $1', [me.id])).rows[0];
  const until = enterUntil(me);
  const hidden = r ? await blockedBetween(me.id, r.inviter_id, q) : false;
  return {
    by: r && !hidden ? { id: r.inviter_id, name: r.name } : null,
    status: r?.status ?? null,
    reason: r?.reason ?? null,
    coins: r ? Number(r.coins) : 0,
    canEnter: !r && Date.now() < until.getTime() && !live().rewardsOff.has('invite'),
    enterUntil: until.toISOString(),
  };
}

/**
 * Is a waiting invite of `inviteeId` payable now? 'paid', 'refused', 'waiting', or null when there is none. A paid
 * invite tells the inviter (push and the open app's live line).
 */
export async function settleReferral(inviteeId) {
  const s = live();
  if (s.rewardsOff.has('invite')) return 'waiting';
  let paid = null;
  const out = await tx(async (c) => {
    const f = (await c.query("SELECT * FROM referrals WHERE invitee_id = $1 AND status = 'pending' FOR UPDATE", [inviteeId])).rows[0];
    if (!f) return null;
    // Both accounts, in id order: two payouts to one inviter wait for each other, so the daily cap holds.
    const people = (await c.query('SELECT id, deleted_at FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[f.inviter_id, f.invitee_id]])).rows;
    if (people.length < 2 || people.some((p) => p.deleted_at)) return 'waiting';
    const refuse = async (reason) => {
      await c.query("UPDATE referrals SET status = 'refused', reason = $2, settled_at = now() WHERE invitee_id = $1", [f.invitee_id, reason]);
      return 'refused';
    };
    if (await blockedBetween(f.inviter_id, f.invitee_id, c)) return refuse('blocked');
    if ((await phoneOf(c, f.invitee_id)) !== 'ok') return refuse('device');
    if (await liveBan(c, f.inviter_id)) return 'waiting';
    // Paid today (a revoked invite keeps the time it was paid).
    const today = await c.query(`SELECT count(*)::int AS n FROM referrals WHERE inviter_id = $1 AND status IN ('paid', 'revoked') AND settled_at >= ${TR_DAY}`, [f.inviter_id]);
    if (today.rows[0].n >= s.inviteDailyCap) return 'waiting';
    const coins = s.inviteCoins;
    await creditCoins(c, f.inviter_id, [{ channel: 'odul', amount: coins }], 'Davet ödülü: arkadaşın katıldı', ref('inviter', f.invitee_id), null, { detail: { reward: 'invite', role: 'inviter' } });
    await creditCoins(c, f.invitee_id, [{ channel: 'odul', amount: coins }], 'Davet ödülü: davetle katıldın', ref('invitee', f.invitee_id), null, { detail: { reward: 'invite', role: 'invitee' } });
    await c.query("UPDATE referrals SET status = 'paid', coins = $2, settled_at = now() WHERE invitee_id = $1", [f.invitee_id, coins]);
    paid = { inviter: f.inviter_id, coins };
    return 'paid';
  });
  if (paid) notify([paid.inviter], { title: 'Davet ödülü', body: `Davet ettiğin arkadaşın ilk odasına girdi: ${paid.coins.toLocaleString('tr-TR')} jeton hesabına eklendi.`, data: { type: 'invite' } });
  return out;
}

/**
 * LiveKit says `identity` joined voice room `room` (live.mjs, after the room let them stay): a waiting invite of
 * theirs is paid now. Only server rooms (oda-<id>) count. Never throws: presence must be recorded whatever happens.
 */
export async function roomEntered(identity, room) {
  if (!UUID.test(identity) || !/^oda-[0-9a-f-]{36}$/.test(room)) return;
  try {
    const waiting = await db.query("SELECT 1 FROM referrals WHERE invitee_id = $1 AND status = 'pending'", [identity]);
    if (waiting.rowCount) await settleReferral(identity);
  } catch (e) {
    console.error('referral payout', identity, String(e?.message ?? e).slice(0, 200));
  }
}

/** Has `uid` been in a server room (now, or before)? */
const beenInRoom = async (uid) =>
  (
    await db.query(
      `SELECT EXISTS (SELECT 1 FROM room_presence WHERE identity = $1 AND room LIKE 'oda-%')
           OR EXISTS (SELECT 1 FROM presence_log WHERE user_id = $2 AND room LIKE 'oda-%') AS been`,
      [uid, uid],
    )
  ).rows[0].been;

const notFound = () => new HttpError(404, 'Bu davet kodu bulunamadı');

/** What my invites brought: how many entered my code, how many were paid or still wait, and the coins I got from invites. */
async function statsOf(uid) {
  const r = await db.query(
    `SELECT count(*)::int AS invited, count(*) FILTER (WHERE status = 'paid')::int AS rewarded, count(*) FILTER (WHERE status = 'pending')::int AS waiting
       FROM referrals WHERE inviter_id = $1`,
    [uid],
  );
  const e = await db.query("SELECT coalesce(sum(amount), 0) AS n FROM ledger WHERE user_id = $1 AND currency = 'coin' AND detail->>'reward' = 'invite'", [uid]);
  return { ...r.rows[0], earned: Math.max(0, Number(e.rows[0].n)) };
}

/** The data copy (my-data.mjs): my code, the invite I entered, and the people who entered mine (blocks left out). */
export async function referralDataOf(c, uid) {
  const code = (await c.query('SELECT code, created_at FROM referral_codes WHERE user_id = $1', [uid])).rows[0] ?? null;
  const row = (x, who) => ({ person: who, status: x.status, reason: x.reason ?? null, coins: Number(x.coins), at: x.created_at, settledAt: x.settled_at });
  const NOT_BLOCKED = (col) => `NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = ${col}) OR (b.blocker = ${col} AND b.blocked = $1))`;
  const by = (await c.query(`SELECT f.*, u.name, ${NOT_BLOCKED('f.inviter_id')} AS shown FROM referrals f JOIN users u ON u.id = f.inviter_id WHERE f.invitee_id = $1`, [uid])).rows[0];
  const invited = await c.query(
    `SELECT f.*, u.name FROM referrals f JOIN users u ON u.id = f.invitee_id WHERE f.inviter_id = $1 AND ${NOT_BLOCKED('f.invitee_id')} ORDER BY f.created_at`,
    [uid],
  );
  return {
    code: code && { code: code.code, at: code.created_at },
    invitedBy: by ? row(by, by.shown ? { id: by.inviter_id, name: by.name } : null) : null,
    invited: invited.rows.map((x) => row(x, { id: x.invitee_id, name: x.name })),
  };
}

async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}

export const referralRoutes = {
  /**
   * What the new-member rewards are for me: the welcome coins I got (0: none), the packs whose first-purchase gift I
   * would still get (purchases.mjs: once per pack, a refunded purchase counts; none while switched off; hidden packs
   * left out), and the invite programme's switch and amount.
   */
  async 'GET /api/rewards'(req) {
    const me = await auth(req);
    const s = live();
    const got = await db.query("SELECT amount FROM ledger WHERE user_id = $1 AND currency = 'coin' AND ref = $2", [me.id, WELCOME_REF]);
    const bought = new Set((await db.query('SELECT DISTINCT product_id FROM purchases WHERE user_id = $1', [me.id])).rows.map((x) => x.product_id));
    const firstOn = !s.rewardsOff.has('first_purchase');
    return {
      welcome: { coins: got.rowCount ? Number(got.rows[0].amount) : 0, on: !s.rewardsOff.has('welcome'), amount: s.welcomeCoins },
      firstBonus: {
        on: firstOn,
        packs: firstOn ? PACKS.filter((p) => p.firstBonus > 0 && !bought.has(p.productId) && !s.packsHidden.has(p.id)).map((p) => ({ productId: p.productId, bonus: p.firstBonus })) : [],
      },
      invite: { on: !s.rewardsOff.has('invite'), coins: s.inviteCoins, canEnter: (await mineOf(db, me)).canEnter },
    };
  },

  async 'GET /api/invite'(req) {
    const me = await auth(req);
    const s = live();
    return {
      code: await myCode(me.id),
      on: !s.rewardsOff.has('invite'),
      coins: s.inviteCoins,
      dailyCap: s.inviteDailyCap,
      enterDays: ENTER_DAYS,
      stats: await statsOf(me.id),
      mine: await mineOf(db, me),
    };
  },

  async 'POST /api/invite/redeem'(req) {
    const me = await auth(req);
    limit(`invite-redeem:${me.id}`, 10, 'Çok fazla deneme, biraz bekle');
    const code = codeOf((await readJson(req)).code);
    if (!code) throw new HttpError(400, 'Davet kodu SIMI-AB23CD gibi olmalı');
    const owner = (await db.query('SELECT r.user_id, u.created_at, u.deleted_at FROM referral_codes r JOIN users u ON u.id = r.user_id WHERE r.code = $1', [code])).rows[0];
    const prev = (await db.query('SELECT inviter_id FROM referrals WHERE invitee_id = $1', [me.id])).rows[0];
    // Once per account, also after the inviter deleted theirs (their rows go, the ledger keeps my reward).
    const paidBefore = (await db.query("SELECT 1 FROM ledger WHERE user_id = $1 AND currency = 'coin' AND ref = $2", [me.id, ref('invitee', me.id)])).rowCount > 0;
    if (prev || paidBefore) {
      if (prev && owner && prev.inviter_id === owner.user_id) return { mine: await mineOf(db, me) };
      throw Object.assign(new HttpError(409, 'Bir davet kodu zaten girdin'), { extra: { code: 'already' } });
    }
    if (live().rewardsOff.has('invite')) throw Object.assign(new HttpError(409, 'Davet ödülleri şu an kapalı'), { extra: { code: 'invite_off' } });
    if (Date.now() >= enterUntil(me).getTime()) throw Object.assign(new HttpError(409, `Davet kodu kayıttan sonraki ${ENTER_DAYS} gün içinde girilir`), { extra: { code: 'too_late' } });
    if (!owner || owner.deleted_at) throw notFound();
    if (owner.user_id === me.id) throw new HttpError(400, 'Kendi davet kodunu giremezsin');
    if (await blockedBetween(me.id, owner.user_id)) throw notFound();
    // Two new accounts can't invite each other: the code must be an older account's.
    if (new Date(owner.created_at) >= new Date(me.created_at)) throw Object.assign(new HttpError(409, 'Davet kodu senden önce katılmış birinin olmalı'), { extra: { code: 'newer' } });
    if ((await phoneOf(db, me.id)) !== 'ok')
      throw Object.assign(new HttpError(409, 'Bu telefonda başka bir hesap da açılmış; davet ödülü telefondaki ilk hesaba verilir'), { extra: { code: 'device' } });
    const ins = await db.query('INSERT INTO referrals (invitee_id, inviter_id) VALUES ($1, $2) ON CONFLICT (invitee_id) DO NOTHING', [me.id, owner.user_id]);
    if (!ins.rowCount) {
      // The same request twice at once: the first one's row.
      const now = (await db.query('SELECT inviter_id FROM referrals WHERE invitee_id = $1', [me.id])).rows[0];
      if (now?.inviter_id !== owner.user_id) throw Object.assign(new HttpError(409, 'Bir davet kodu zaten girdin'), { extra: { code: 'already' } });
    }
    // Already been in a room: paid now rather than at the next entry (if that fails, the next entry pays).
    if (await beenInRoom(me.id)) await settleReferral(me.id).catch((e) => console.error('referral payout', me.id, String(e?.message ?? e).slice(0, 200)));
    return { mine: await mineOf(db, me) };
  },

  /**
   * A fake account's invite (Sahte hesapla kazanılan jetonlar geri alınır): the invite coins both people still have
   * are taken back, and the invite is marked revoked. Coins already spent in the shop can't come back.
   */
  async 'POST /api/admin/referrals/revoke'(req) {
    const a = await admin(req);
    const b = await readJson(req);
    const invitee = userId(b.invitee, 'davet edilen');
    const reason = text(b.reason, 3, 200, 'Neden');
    return tx(async (c) => {
      const f = (await c.query('SELECT * FROM referrals WHERE invitee_id = $1 FOR UPDATE', [invitee])).rows[0];
      if (!f || f.status !== 'paid') throw new HttpError(409, 'Bu davet için ödenmiş jeton yok');
      await c.query('SELECT 1 FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[f.inviter_id, f.invitee_id]]);
      const back = {};
      for (const [role, uid] of [['inviter', f.inviter_id], ['invitee', f.invitee_id]]) {
        const lots = (await c.query("SELECT id, remaining FROM coin_lots WHERE user_id = $1 AND ref = $2 AND channel = 'odul' AND remaining > 0", [uid, ref(role, invitee)])).rows;
        const left = lots.reduce((n, l) => n + Number(l.remaining), 0);
        const balance = Number((await c.query('SELECT coins FROM users WHERE id = $1', [uid])).rows[0].coins);
        const take = Math.min(left, balance);
        if (lots.length) await c.query('UPDATE coin_lots SET remaining = 0 WHERE id = ANY($1::bigint[])', [lots.map((l) => l.id)]);
        if (take > 0) await move(c, uid, 'coin', -take, 'Davet ödülü geri alındı', ref(`revoke-${role}`, invitee), null, { channel: 'odul', actor: a.id, detail: { reward: 'invite', role, revoked: true } });
        back[role] = take;
      }
      await c.query("UPDATE referrals SET status = 'revoked', reason = 'staff' WHERE invitee_id = $1", [invitee]);
      await c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, $3, $4, $5)', [
        a.id,
        'referral.revoke',
        invitee,
        JSON.stringify({ inviter: f.inviter_id, coins: back, reason }),
        clientIp(req),
      ]);
      return { coins: back };
    });
  },
};
