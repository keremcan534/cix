// Diamond withdrawals (para çekme): a host asks to be paid for unlocked diamonds; the owner pays outside the
// app and marks the request paid.
//
//   POST /api/wallet/withdraw            { diamonds, method, details: { holder, account }, ref } → { user, replay, withdrawal }
//   GET  /api/wallet/withdrawals                                       → { withdrawals, withdrawable, locked, rules }
//   POST /api/wallet/withdrawals/cancel  { id }                        → { user, withdrawal }   (pending only)
//   GET  /api/admin/withdrawals?status=pending|paid|rejected|cancelled|all   (admin) → { playMoney, rows }
//   POST /api/admin/withdrawals/decide   { id, approve, note }         (admin) → { withdrawal }
//
// Only unlocked diamonds can be asked for (wallet.mjs spendDiamonds), between WITHDRAW.minDiamonds and
// maxDiamonds, at most weeklyDiamonds in 7 days, one open request per person. The largest request and the
// 7-day limit are Canlı ayarlar (live-settings.mjs withdrawMax, withdrawWeekly; they can only be lowered from
// the compiled WITHDRAW), read once per request: one already inside its locked transaction completes under
// the limit it read, the next one uses the new limit. GET /api/wallet/withdrawals returns the same rules.
// The diamonds leave the balance when the request is made (one ledger row, ref = the request's ref, so a
// retry is applied once and they can't be spent twice) and come back on a cancel or a rejection (ref
// wd:<id>:return, which no client ref can be).
// Payout details stay generic: an IBAN from any country (checked with its mod-97 digits) or another account
// written out, and the holder's name; they are kept as given.
//
// Play money (wallet.mjs PLAY_MONEY, everHadPlayMoney): on a server with test top-ups or sandbox purchases, or
// on a database that ever held play coins, requests can be made, cancelled and rejected but never paid.
// Finance Control gets no event for this: its ingest has no payout type, and payouts are booked there.
import { HttpError, auth, claimRef, clientIp, db, int, move, once, readJson, selfUser, text, tx } from './core.mjs';
import { WITHDRAW, diamondValueUsd } from './catalog.mjs';
import { live } from './live-settings.mjs';
import { notify } from './push.mjs';
import { PLAY_MONEY, diamondState, everHadPlayMoney, spendDiamonds } from './wallet.mjs';

const fmt = (n) => n.toLocaleString('tr-TR');
const STATUSES = ['pending', 'paid', 'rejected', 'cancelled'];
export const STATUS_LABEL = { pending: 'Beklemede', paid: 'Ödendi', rejected: 'Reddedildi', cancelled: 'İptal edildi' };

/** An IBAN of any country: 2 letters, 2 check digits, up to 30 letters or digits, and mod 97 = 1. */
export function validIban(v) {
  const s = String(v ?? '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const digits = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}

/** Method and details from input: trimmed, inner spaces folded, kept as given. */
function payoutDetails(method, details) {
  if (method !== 'iban' && method !== 'other') throw new HttpError(400, 'Ödeme yöntemi iban veya other olmalı');
  const d = details && typeof details === 'object' ? details : {};
  const fold = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ') : v);
  const holder = text(fold(d.holder), 3, 80, 'Hesap sahibinin adı');
  const account = text(fold(d.account), 5, 120, method === 'iban' ? 'IBAN' : 'Hesap bilgisi');
  if (method === 'iban' && !validIban(account)) throw new HttpError(400, 'IBAN geçersiz; ülke kodu ve rakamları kontrol et');
  return { method, holder, account };
}

const view = (w) => ({
  id: Number(w.id),
  diamonds: Number(w.diamonds),
  usd: Number(w.usd),
  method: w.method,
  holder: w.holder,
  account: w.account,
  status: w.status,
  statusLabel: STATUS_LABEL[w.status],
  note: w.note,
  createdAt: w.created_at,
  decidedAt: w.decided_at,
});

async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}
const audit = (c, actor, action, target, detail, ip) =>
  c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1,$2,$3,$4,$5)', [actor, action, target, JSON.stringify(detail), ip]);

/** The rules in effect now: the compiled minimum, the live largest request and 7-day limit. */
const rulesNow = (s = live()) => ({ minDiamonds: WITHDRAW.minDiamonds, maxDiamonds: s.withdrawMax, weeklyDiamonds: s.withdrawWeekly });

/** Diamonds in requests open or paid in the last 7 days. */
const weekUsed = async (c, userId) =>
  Number((await c.query("SELECT coalesce(sum(diamonds), 0) AS n FROM withdrawals WHERE user_id = $1 AND status IN ('pending', 'paid') AND created_at > now() - interval '7 days'", [userId])).rows[0].n);

/** Locks the owner's account row, then the request, and returns the request (still pending or not). */
async function lockRequest(c, id, owner = null) {
  const pre = (await c.query('SELECT user_id FROM withdrawals WHERE id = $1', [id])).rows[0];
  if (!pre || (owner && pre.user_id !== owner)) throw new HttpError(404, 'Talep bulunamadı');
  await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [pre.user_id]);
  return (await c.query('SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE', [id])).rows[0];
}

/** The held diamonds go back to the account (cancel or rejection). */
const giveBack = (c, w, reason, actor) => move(c, w.user_id, 'diamond', Number(w.diamonds), reason, `wd:${w.id}:return`, null, { channel: 'cekim', actor, detail: { withdrawal: Number(w.id) } });

export const withdrawRoutes = {
  async 'POST /api/wallet/withdraw'(req) {
    const u = await auth(req);
    const rules = rulesNow();
    const b = await readJson(req);
    const range = `Tek seferde en az ${fmt(rules.minDiamonds)}, en çok ${fmt(rules.maxDiamonds)} elmas çekilebilir`;
    const n = int(b.diamonds, WITHDRAW.minDiamonds, WITHDRAW.maxDiamonds);
    if (!n) throw new HttpError(400, range);
    const { method, holder, account } = payoutDetails(b.method, b.details);
    const usd = diamondValueUsd(n);
    const ip = clientIp(req);
    const out = await once(u.id, 'diamond', b.ref, async (c) => {
      // A second copy of the same request waits on the row, then finds the ref (a replay).
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [u.id]);
      await claimRef(c, u.id, 'diamond', b.ref);
      // The live limits after the ref check, so a retry of a request made before a lower limit still replays.
      if (n > rules.maxDiamonds) throw new HttpError(400, range);
      if (n > rules.weeklyDiamonds) throw new HttpError(400, `7 günde en çok ${fmt(rules.weeklyDiamonds)} elmas çekilebilir`);
      if ((await c.query("SELECT 1 FROM withdrawals WHERE user_id = $1 AND status = 'pending'", [u.id])).rowCount) {
        throw new HttpError(409, 'Bekleyen bir çekim talebin var; sonuçlanınca yenisini açabilirsin');
      }
      const used = await weekUsed(c, u.id);
      if (used + n > rules.weeklyDiamonds) throw new HttpError(409, `7 günde en çok ${fmt(rules.weeklyDiamonds)} elmas çekilebilir; kalan ${fmt(Math.max(0, rules.weeklyDiamonds - used))} elmas`);
      const w = await c.query(
        'INSERT INTO withdrawals (user_id, diamonds, usd, method, holder, account, play, ref, ip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
        [u.id, n, usd, method, holder, account, PLAY_MONEY, b.ref, ip],
      );
      await spendDiamonds(c, u.id, n, 'Para çekme talebi', b.ref, null, { channel: 'cekim', detail: { withdrawal: Number(w.rows[0].id), usd } });
    });
    const w = (await db.query('SELECT * FROM withdrawals WHERE user_id = $1 AND ref = $2', [u.id, b.ref])).rows[0];
    return { ...out, withdrawal: w ? view(w) : null };
  },

  async 'GET /api/wallet/withdrawals'(req) {
    const u = await auth(req);
    const r = await db.query('SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY id DESC LIMIT 50', [u.id]);
    const s = await diamondState(db, u.id);
    return {
      withdrawals: r.rows.map(view),
      withdrawable: s.withdrawable,
      locked: s.locked,
      rules: { ...rulesNow(), weekUsed: await weekUsed(db, u.id) },
    };
  },

  async 'POST /api/wallet/withdrawals/cancel'(req) {
    const u = await auth(req);
    const id = int((await readJson(req)).id, 1, Number.MAX_SAFE_INTEGER);
    if (!id) throw new HttpError(400, 'Geçersiz talep');
    return tx(async (c) => {
      const w = await lockRequest(c, id, u.id);
      if (w.status !== 'pending') throw new HttpError(409, 'Bu talep artık iptal edilemez');
      const done = (await c.query("UPDATE withdrawals SET status = 'cancelled', decided_by = $2, decided_at = now() WHERE id = $1 RETURNING *", [id, u.id])).rows[0];
      await giveBack(c, w, 'Para çekme talebi iptal edildi', null);
      const me = (await c.query('SELECT * FROM users WHERE id = $1', [u.id])).rows[0];
      return { user: selfUser(me), withdrawal: view(done) };
    });
  },

  async 'GET /api/admin/withdrawals'(req, url) {
    await admin(req);
    const status = url.searchParams.get('status') || 'pending';
    if (status !== 'all' && !STATUSES.includes(status)) throw new HttpError(400, 'Geçersiz durum');
    const r = await db.query(
      `SELECT w.*, u.name, u.phone FROM withdrawals w JOIN users u ON u.id = w.user_id
        WHERE ($1 = 'all' OR w.status = $1) ORDER BY w.id ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`,
      [status],
    );
    const playMoney = PLAY_MONEY || (await everHadPlayMoney(db));
    return {
      playMoney,
      rows: r.rows.map((w) => ({ ...view(w), user: { id: w.user_id, name: w.name, phone: w.phone ?? null }, play: w.play, payable: w.status === 'pending' && !w.play && !playMoney, decidedBy: w.decided_by })),
    };
  },

  /** approve = the owner paid it outside the app; a rejection gives the diamonds back. Nobody decides their own. */
  async 'POST /api/admin/withdrawals/decide'(req) {
    const a = await admin(req);
    const b = await readJson(req);
    const id = int(b.id, 1, Number.MAX_SAFE_INTEGER);
    if (!id) throw new HttpError(400, 'Geçersiz talep');
    if (typeof b.approve !== 'boolean') throw new HttpError(400, 'approve true veya false olmalı');
    const note = b.note === undefined || b.note === null || b.note === '' ? '' : text(b.note, 1, 300, 'Not');
    if (!b.approve && !note) throw new HttpError(400, 'Ret nedeni gerekli');
    const ip = clientIp(req);
    const w = await tx(async (c) => {
      const w = await lockRequest(c, id);
      if (w.user_id === a.id) throw new HttpError(403, 'Kendi çekim talebine karar veremezsin');
      if (w.status !== 'pending') throw new HttpError(409, 'Bu talep zaten sonuçlandı');
      if (b.approve && (PLAY_MONEY || w.play || (await everHadPlayMoney(c)))) {
        throw new HttpError(409, 'Bu sunucuda test jetonu var; çekim ödenemez, yalnızca reddedilebilir');
      }
      const status = b.approve ? 'paid' : 'rejected';
      const done = (await c.query('UPDATE withdrawals SET status = $2, note = $3, decided_by = $4, decided_at = now() WHERE id = $1 RETURNING *', [id, status, note, a.id])).rows[0];
      if (!b.approve) await giveBack(c, w, 'Para çekme talebi reddedildi', a.id);
      await audit(c, a.id, b.approve ? 'withdrawal.paid' : 'withdrawal.reject', w.user_id, { withdrawal: id, diamonds: Number(w.diamonds), usd: Number(w.usd), note }, ip);
      return done;
    });
    notify([w.user_id], {
      title: b.approve ? 'Ödemen yapıldı' : 'Çekim talebin reddedildi',
      body: b.approve ? `${fmt(Number(w.diamonds))} elmaslık çekim talebin ödendi` : `${fmt(Number(w.diamonds))} elmas hesabına geri döndü${note ? `: ${note}` : ''}`,
      data: { type: 'withdrawal', id },
    });
    return { withdrawal: view(w) };
  },
};
