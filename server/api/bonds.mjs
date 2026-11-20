// Bağlar: two people tied as Çift, Kardeş, Ağabey, Kanka… (docs/BAGLAR.md).
//
//   GET  /api/bonds/info                         → { kinds, levels, rewards }           (public)
//   GET  /api/bonds?user=&offset=                → { hidden, bonds, total, next }       (someone's active bonds, 50 a page; mine without
//                                                                                        user; hidden: only the viewer's own bond with them;
//                                                                                        next: the offset of the next page, null at the end)
//   GET  /api/bonds/requests                     → { incoming, outgoing }               (my pending requests)
//   POST /api/bonds/request  { to, kind, ref, room?, price? } → { bond, user, replay }   (room: sent from a room's gift panel, the room sees the gift;
//                                                                                   price: the bond gift's price the phone showed)
//   POST /api/bonds/respond  { id, accept }      → { bond }
//   POST /api/bonds/withdraw { id }              → { bond }                             (the requester takes it back)
//   POST /api/bonds/end      { id }              → { bond }                             (either side, any time)
//   POST /api/bonds/privacy  { hidden }          → { hidden }
//   POST /api/bonds/among    { ids }             → { bonds: [{ a, b, kind, level }] }   (room effects: the bonds between two of them, and
//                                                                                        each one's best Lv10+ bond for the bubble; hidden
//                                                                                        ones left out)
//   POST /api/gifts/send     { giftId: 'bag-<kind>', … } (gifts.mjs)                    (a bond gift to someone I have that bond with:
//                                                                                        an ordinary gift that adds bond points)
//
// `?lv=20` on every route above that answers bonds (the app since Lv20 sends it): `score` and `nextLevelAt` are the
// bond's points and the next level's. Without it (the f9671d9 APK) they are moved so that APK's bar, drawn from its
// own ten compiled steps (0 past Lv10), shows the real progress within the level; its text still says how many points
// the next level needs (oldAppPoints).
//
// Price: the bond gift's (bag-<kind>) as Yönetim › Hediyeler set it (custom-gifts.mjs builtinGift; bond-rules.mjs KINDS
// is the app's own). A newer app sends the price it showed: another one now is a 409 price_changed and nothing moves.
// An older app sends none and shows the compiled price: while the panel's price differs it gets 409 update_required.
// Money: a request takes the bond gift's price from the requester at once (spendCoins, the lots it used kept on
// the bond). Accepted: those coins become the other person's diamonds like any gift (giftDiamonds, gift_events,
// agency income), so the finance panel sees a gift. Refused, withdrawn or unanswered for 3 days: the coins go
// back to the same lots, untouched by the panel. Ending a bond refunds nothing.
// Points: every coin the two spend on each other while bonded (the bond gift included) is 1/100 point, and each
// message that answers the other's adds 1 (at most 10 a day). A night after a day with no gift either way takes some
// back, and a bond nobody gifts for long ends by itself (bond-life.mjs); ending resets the level.
// Again (Güncelleme 7): the same bond gift to someone I already have that bond with is an ordinary paid gift through
// POST /api/gifts/send (coins → their diamonds at once, agency income, PK, rocket, room level, Koruma like any gift),
// any count, and adds bond points; without that bond it is a 409 bond_needed (the app then sends a request), and a bond
// gift of another kind than ours a 409 bond_kind: one bond per pair. Every change of a bond is told in SimilarClub
// Sistem (bond-life.mjs).
import { recordIncome } from './agency-lib.mjs';
import { HttpError, auth, blockedBetween, claimRef, db, env, int, limit, move, once, readJson, tx, userId } from './core.mjs';
import { roomPacket } from './live.mjs';
import { live } from './live-settings.mjs';
import { notify } from './push.mjs';
import { giftDiamonds, spendCoins } from './wallet.mjs';
import { builtinGift, checkShownPrice } from './custom-gifts.mjs';
import { KINDS, LEVELS, REWARDS, levelOf, oldAppPoints, rewardLevel, scoreOf } from './bond-rules.mjs';
import { bondNumbers, levelSql, levelsSoon, runBondDecay, scoreSql, tellLevels, tellStatus, warnQuietBonds } from './bond-life.mjs';

export { KINDS, LEVELS, REWARDS, levelOf, scoreOf };

// Limits and days (Canlı ayarlar › Bağlar, live-registry.mjs; defaults 1 Çift, 1000 of each family kind and of Kanka
// (practically unlimited), 10 pending requests (each holds its coins), 3 days to answer, 7 days apart after an end
// someone chose, 10 talk points a day).
const FAMILY_KINDS = new Set(['kardes', 'baci', 'agabey', 'abla', 'yenge', 'enishte']);
/** How many bonds of `kind` one person may have now. */
export const maxOf = (kind, s = live()) => (kind === 'cift' ? s.bondMaxCift : kind === 'kanka' ? s.bondMaxKanka : FAMILY_KINDS.has(kind) ? s.bondMaxKin : KINDS[kind].max);
/** People asked about at once by /api/bonds/among (a room's mics and Balkon). */
const AMONG_MAX = 80;
/** The level of the chat bubble (REWARDS 'balon'): among's partner-anywhere bonds; the index 099 bonds_top_* has it. */
const BUBBLE = rewardLevel('balon');
/** A profile's bonds a page. */
const PAGE = 50;
/** A room's announcement of a bond gift has an id of its own, far from any gift_events row's (the phones drop repeats by it). */
const ROOM_EVENT_BASE = 9_000_000_000_000;
const voiceRoom = (room) => /^(?:oda-)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(typeof room === 'string' ? room : '')?.[1] ?? null;

/** The bond gift of `kind` as it is now: { id, name, price } (the panel's name and price, else the app's). */
export function bondGift(kind) {
  const g = builtinGift(`bag-${kind}`);
  return { id: `bag-${kind}`, name: g?.name ?? KINDS[kind].gift, price: g?.price ?? KINDS[kind].price };
}
const kindOfGift = (id) => {
  const m = typeof id === 'string' ? /^bag-([a-z]+)$/.exec(id) : null;
  return m && Object.hasOwn(KINDS, m[1]) ? m[1] : null;
};

/**
 * POST /api/gifts/send's bond gift (custom-gifts.mjs giftOf leaves them out): the gift as giftOf would give it, with
 * `bond` its kind; undefined for any other id. Whether the two have that bond is checkBondGift's, in the transaction.
 * Bağ Yüzüğü (Çift) is on no shelf (catalog.mjs has no bag-cift): it goes at the app's name and price, as its request
 * and its accept's gift_events row always did.
 */
export function bondGiftOf(id) {
  const kind = kindOfGift(id);
  if (!kind) return undefined;
  const g = builtinGift(id);
  const { name, price } = bondGift(kind);
  return { id, name, emoji: g?.emoji ?? '💍', price, cat: g?.cat ?? 'family', minSvip: 0, builtin: true, bond: kind };
}

/**
 * In the gift's transaction, after its accounts are locked and its ref claimed (a retry of a send that went through
 * gets its replay): the two must have an active bond of this kind. Its row is held FOR SHARE, so an end waits for the
 * gift and the gift's points go to a bond that was there.
 */
export async function checkBondGift(c, sender, recipient, kind) {
  const r = await c.query(`SELECT kind FROM bonds WHERE pair_lo = LEAST($1::uuid, $2::uuid) AND pair_hi = GREATEST($1::uuid, $2::uuid) AND status = 'active' FOR SHARE`, [sender, recipient]);
  if (!r.rowCount) throw Object.assign(new HttpError(409, `Aranızda ${KINDS[kind].label} bağı yok: bu hediye önce bağ isteği olarak gider`), { extra: { code: 'bond_needed', kind } });
  const have = r.rows[0].kind;
  if (have !== kind) throw Object.assign(new HttpError(409, `Aranızda ${KINDS[have].label} bağı var`), { extra: { code: 'bond_kind', kind: have } });
}

/** GET /api/catalog `bonds`: Bağlar's numbers as Canlı ayarlar has them (an older app reads the first four). */
export function bondCatalog(s = live()) {
  const n = bondNumbers(s);
  return {
    answerDays: s.bondAnswerDays,
    cooldownDays: s.bondCooldownDays,
    talkDaily: s.bondTalkDaily,
    max: Object.fromEntries(Object.keys(KINDS).map((k) => [k, maxOf(k, s)])),
    levels: n.levels,
    dropPct: n.dropPct,
    dropFlat: n.dropFlat,
    idleEndDays: n.idleEndDays,
    idleWarnDays: n.idleWarnDays,
  };
}

const SELECT = `SELECT x.*, ua.name AS a_name, ua.avatar_url AS a_avatar, ub.name AS b_name, ub.avatar_url AS b_avatar
                  FROM bonds x JOIN users ua ON ua.id = x.a JOIN users ub ON ub.id = x.b`;

const TODAY = "(now() AT TIME ZONE 'Europe/Istanbul')::date";
const QUIET = `${TODAY} - x.gift_day AS quiet`;

/** Whether the app asked for the real points (?lv=20). */
const realPoints = (url) => url?.searchParams.get('lv') === '20';

/**
 * A bond as `me` sees it: the other person is the partner. `n`: Bağlar's numbers now (bondNumbers). `viewer`: who
 * asked (another person's list: GET /api/bonds?user=); the quiet days, which tell when the two last sent each other a
 * gift (a chat's or a profile's too), only go to one of the two. `real`: the app sent ?lv=20 (else oldAppPoints).
 */
function out(b, me, { n = bondNumbers(), viewer = me, real = false } = {}) {
  const mine = b.a === me;
  const score = scoreOf(b);
  const level = levelOf(score, n.levels);
  const points = real ? { score, nextLevelAt: n.levels[level] ?? null } : oldAppPoints(score, level, n.levels);
  const quiet = b.status === 'active' && b.quiet !== null && b.quiet !== undefined && (viewer === b.a || viewer === b.b) ? Number(b.quiet) : null;
  return {
    id: Number(b.id),
    kind: b.kind,
    label: KINDS[b.kind].label,
    status: b.status,
    requester: mine,
    partner: mine ? { id: b.b, name: b.b_name, avatarUrl: b.b_avatar ?? null } : { id: b.a, name: b.a_name, avatarUrl: b.a_avatar ?? null },
    price: Number(b.held_coins),
    score: points.score,
    level,
    nextLevelAt: points.nextLevelAt,
    createdAt: b.created_at,
    expiresAt: b.expires_at,
    since: b.accepted_at,
    // Days since either sent the other a gift, and the days left before such a quiet bond ends (null: it never does).
    quietDays: quiet,
    endsInDays: quiet !== null && n.idleEndDays > 0 ? Math.max(0, n.idleEndDays + 1 - quiet) : null,
  };
}

async function bondRow(c, id, lock = false) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Geçersiz bağ');
  const r = await c.query(`SELECT * FROM bonds WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!r.rowCount) throw new HttpError(404, 'Bağ bulunamadı');
  return r.rows[0];
}
const view = async (id, me, real = false) => out((await db.query(`${SELECT.replace('SELECT x.*', `SELECT x.*, ${QUIET}`)} WHERE x.id = $1`, [id])).rows[0], me, { real });

/** Active bonds of `kind` someone has, plus (for the requester) their own pending requests of it. */
async function countKind(c, user, kind, withPending) {
  const r = await c.query(
    `SELECT count(*) AS n FROM bonds WHERE kind = $2 AND ((status = 'active' AND (a = $1 OR b = $1)) OR ($3 AND status = 'pending' AND a = $1))`,
    [user, kind, withPending],
  );
  return Number(r.rows[0].n);
}

/**
 * Puts a pending bond's coins back on the requester's lots (`lots`: all it holds, or the part a store refund left)
 * and ends it. The requester's row and the bond must be locked.
 */
async function refund(c, bond, status, reason, lots = Array.isArray(bond.held_lots) ? bond.held_lots : [], why = null) {
  for (const p of lots) if (p.lot) await c.query('UPDATE coin_lots SET remaining = LEAST(amount, remaining + $2) WHERE id = $1', [p.lot, p.amount]);
  const coins = lots.reduce((n, p) => n + Number(p.amount), 0);
  // No channel: the coins come back, none are created, so the finance panel has nothing to record. The bond's own
  // refs have a ':', which no request's ref may (core.mjs REF): nobody can take them first and block the bond
  // (they were `bond-{id}`, `bond-{id}-in` and `bond-{id}-iade`).
  if (coins > 0) await move(c, bond.a, 'coin', coins, reason, `bond:${bond.id}:iade`, bond.b, { detail: { bond: Number(bond.id), lots } });
  await c.query('UPDATE bonds SET status = $2, ended_at = now(), end_reason = $3 WHERE id = $1', [bond.id, status, why]);
}

/**
 * A store refund (jeton.mjs refundPurchase) of coins that pending bonds hold: each such bond ends as withdrawn,
 * its coins from the refunded lots (`lotIds`) go with the purchase, and the rest goes back to the requester. So
 * the refunded coins neither come back later nor become the other person's diamonds. The requesters' rows are
 * locked (they own the lots). Returns the coins that went with the purchase.
 */
export async function voidRefundedBonds(c, lotIds) {
  if (!lotIds.length) return 0;
  const refunded = new Set(lotIds.map(Number));
  const r = await c.query(
    `SELECT * FROM bonds WHERE status = 'pending'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(held_lots) p WHERE (p->>'lot')::bigint = ANY($1::bigint[]))
      ORDER BY id FOR UPDATE`,
    [[...refunded]],
  );
  let gone = 0;
  for (const bond of r.rows) {
    const parts = Array.isArray(bond.held_lots) ? bond.held_lots : [];
    const keep = parts.filter((p) => !(p.lot && refunded.has(Number(p.lot))));
    gone += Number(bond.held_coins) - keep.reduce((n, p) => n + Number(p.amount), 0);
    // Told by the bond sweep (bond-life.mjs tellStatus) once this refund's transaction is committed.
    await refund(c, bond, 'withdrawn', `Bağ isteği iadesi: ${KINDS[bond.kind]?.label ?? 'Bağ'} (satın alma iade edildi)`, keep, 'refund');
  }
  return gone;
}

/**
 * Inside POST /api/block's transaction (social.mjs), after its blocks row: the two's active bond ends (end_reason
 * 'block', ended_by the blocker), told to nobody (a block is never told, and the blocker's own notice would name the
 * other) and with no wait before a new bond once they unblock each other. A pending request stays: it can't be
 * accepted while they block, and goes back to its sender when its days run out. ended_by's key check needs the
 * blocker's row, which the blocks row's own check holds already: nothing more is waited for. → the bond's id or null.
 */
export async function endBondOnBlock(c, blocker, blocked) {
  const r = await c.query(
    `UPDATE bonds SET status = 'ended', ended_at = now(), ended_by = $1, end_reason = 'block', told_status = 'ended'
      WHERE pair_lo = LEAST($1::uuid, $2::uuid) AND pair_hi = GREATEST($1::uuid, $2::uuid) AND status = 'active' RETURNING id`,
    [blocker, blocked],
  );
  return r.rows[0] ? Number(r.rows[0].id) : null;
}

/** Locks the two accounts in id order (no deadlock when both act at once), then the bond. */
async function lockPair(c, bondId) {
  const peek = await bondRow(c, bondId);
  await c.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[peek.a, peek.b]]);
  return bondRow(c, bondId, true);
}

/**
 * Inside a gift's transaction: coins spent on a bonded partner raise the bond, and today is a gift day (no drop
 * tonight). The bond's row is written once. A level it reaches is told a moment later, after the commit (bond-life.mjs).
 */
export async function addBondCoins(c, sender, recipient, total) {
  const r = await c.query(
    `UPDATE bonds SET gift_coins = gift_coins + $3, gift_day = ${TODAY},
            level = ${levelSql('greatest(0, (gift_coins + $3) / 100 + talk_points - points_lost)', '$4')}
      WHERE pair_lo = LEAST($1::uuid, $2::uuid) AND pair_hi = GREATEST($1::uuid, $2::uuid) AND status = 'active'
      RETURNING id, level <> level_said AS news`,
    [sender, recipient, total, bondNumbers().levels],
  );
  if (r.rows[0]?.news) levelsSoon(Number(r.rows[0].id));
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
  const daily = live().bondTalkDaily;
  if (!(daily > 0)) return;
  // Talk points never stop the nightly drop (gift_day stays).
  const r = await db.query(
    `UPDATE bonds SET talk_points = talk_points + 1,
            talk_today = CASE WHEN talk_day = (now() AT TIME ZONE 'Europe/Istanbul')::date THEN talk_today + 1 ELSE 1 END,
            talk_day = (now() AT TIME ZONE 'Europe/Istanbul')::date,
            level = ${levelSql('greatest(0, gift_coins / 100 + talk_points + 1 - points_lost)', '$3')}
      WHERE id = $1 AND status = 'active' AND (talk_day IS DISTINCT FROM (now() AT TIME ZONE 'Europe/Istanbul')::date OR talk_today < $2)
      RETURNING level <> level_said AS news`,
    [bond.rows[0].id, daily, bondNumbers().levels],
  );
  if (r.rows[0]?.news) levelsSoon(Number(bond.rows[0].id));
}

/**
 * Requests nobody answered in time (Canlı ayarlar bond_answer_days, fixed on each when sent) (or whose recipient
 * deleted the account) go back to the requester; bonds with a deleted account end; then the nightly drop and the quiet
 * end (once a Türkiye day), the warnings before it, and the notices nobody got yet (bond-life.mjs). Returns how many
 * requests and bonds ended here.
 */
let sweeping = false;
export async function sweepBonds() {
  if (sweeping) return 0;
  sweeping = true;
  try {
    const n = await expireBonds();
    await runBondDecay();
    // Each in pages until none is left: a night's drops and ends can leave tens of thousands to tell, and a page
    // per sweep (5 minutes) would tell the last of them hours later.
    while ((await warnQuietBonds()) >= 500);
    while ((await tellStatus()) >= 200);
    while ((await tellLevels()) >= 200);
    return n;
  } finally {
    sweeping = false;
  }
}
async function expireBonds() {
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
    `UPDATE bonds x SET status = 'ended', ended_at = now(), end_reason = 'gone' FROM users u
      WHERE x.status = 'active' AND u.id IN (x.a, x.b) AND u.deleted_at IS NOT NULL RETURNING x.id`,
  );
  return n + gone.rowCount;
}

let timer = null;
export function startBondSweep() {
  if (timer) return;
  const run = () => sweepBonds().catch((e) => console.error('bond sweep', e.message));
  const every = Number(env.BOND_SWEEP_MS);
  // Every 5 minutes by default: the nightly drop is worked out soon after Türkiye's midnight (a gift sent before it
  // counts as the day before's, as Koruma's), and a store refund's void is told within minutes.
  timer = setInterval(run, Number.isFinite(every) && every >= 100 ? every : 5 * 60_000);
  timer.unref();
  run();
}
export function stopBondSweep() {
  clearInterval(timer);
  timer = null;
}

export const bondRoutes = {
  async 'GET /api/bonds/info'() {
    return { kinds: Object.entries(KINDS).map(([id, k]) => ({ id, ...k, gift: bondGift(id).name, price: bondGift(id).price, max: maxOf(id) })), levels: bondNumbers().levels, rewards: REWARDS };
  },

  async 'GET /api/bonds'(req, url) {
    const me = await auth(req);
    const who = url.searchParams.get('user') ? userId(url.searchParams.get('user')) : me.id;
    let hidden = who === me.id ? !!me.bonds_hidden : false;
    if (who !== me.id) {
      const u = await db.query('SELECT bonds_hidden FROM users WHERE id = $1 AND deleted_at IS NULL', [who]);
      if (!u.rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
      hidden = !!u.rows[0].bonds_hidden;
    }
    // Hidden from others: a viewer still sees their own bond with this person (and so no "Bağ kur"), nothing else.
    const onlyMine = who !== me.id && hidden;
    // 50 a page (bonds are practically unlimited now): Çift first, then the most points. An older app reads the first.
    const offset = int(Number(url.searchParams.get('offset') ?? 0), 0, 1_000_000) ?? 0;
    const r = await db.query(
      `${SELECT.replace('SELECT x.*', `SELECT x.*, ${QUIET}, count(*) OVER () AS total`)}
        WHERE x.status = 'active' AND (x.a = $1 OR x.b = $1) AND ua.deleted_at IS NULL AND ub.deleted_at IS NULL
          AND (NOT $2 OR $3 IN (x.a, x.b))
        ORDER BY (x.kind = 'cift') DESC, ${scoreSql('x.')} DESC, x.accepted_at, x.id LIMIT ${PAGE} OFFSET $4`,
      [who, onlyMine, me.id, offset],
    );
    const n = bondNumbers();
    const total = Number(r.rows[0]?.total ?? 0);
    const real = realPoints(url);
    return { hidden, bonds: r.rows.map((b) => out(b, who, { n, viewer: me.id, real })), total, next: offset + r.rowCount < total ? offset + r.rowCount : null };
  },

  async 'GET /api/bonds/requests'(req, url) {
    const me = await auth(req);
    const r = await db.query(`${SELECT} WHERE x.status = 'pending' AND (x.a = $1 OR x.b = $1) AND x.expires_at > now() ORDER BY x.id DESC LIMIT 50`, [me.id]);
    const rows = r.rows.map((b) => out(b, me.id, { real: realPoints(url) }));
    return { incoming: rows.filter((b) => !b.requester), outgoing: rows.filter((b) => b.requester) };
  },

  async 'POST /api/bonds/request'(req, url) {
    const me = await auth(req);
    limit(`bondreq:${me.id}`, 10, 'Çok fazla istek, biraz bekle');
    const b = await readJson(req);
    const kind = typeof b.kind === 'string' && Object.hasOwn(KINDS, b.kind) ? b.kind : null;
    if (!kind) throw new HttpError(400, 'Geçersiz bağ türü');
    const k = KINDS[kind];
    const to = userId(b.to, 'kişi');
    if (to === me.id) throw new HttpError(400, 'Kendinle bağ kuramazsın');
    const shown = b.price ?? null;
    if (shown !== null && !(Number.isSafeInteger(shown) && shown > 0)) throw new HttpError(400, 'Geçersiz fiyat');
    let gift = bondGift(kind);
    if (await blockedBetween(me.id, to)) throw new HttpError(403, 'Bu kişiyle bağ kuramazsın');
    const res = await once(me.id, 'coin', b.ref, async (c) => {
      const locked = await c.query('SELECT id, name FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE', [[me.id, to]]);
      if (locked.rowCount < 2) throw new HttpError(404, 'Kullanıcı bulunamadı');
      await claimRef(c, me.id, 'coin', b.ref);
      // After the ref claim: a retry of a request that went through gets its replay even if the price moved since.
      gift = bondGift(kind);
      checkShownPrice(gift, shown);
      const set = live();
      const open = await c.query(`SELECT status, kind FROM bonds WHERE pair_lo = LEAST($1::uuid, $2::uuid) AND pair_hi = GREATEST($1::uuid, $2::uuid) AND status IN ('pending', 'active')`, [me.id, to]);
      if (open.rows[0]?.status === 'pending') throw new HttpError(409, 'Bu kişiyle bekleyen bir bağ isteği var');
      if (open.rowCount) {
        // One bond per pair. The same kind again is a gift now (POST /api/gifts/send); an older app (it sends no price)
        // can't send it so, and is told to update.
        const have = open.rows[0].kind;
        const again = have === kind && shown === null ? '. Bağ hediyesini yeniden göndermek için uygulamayı güncelle' : '';
        throw Object.assign(new HttpError(409, `Aranızda ${KINDS[have].label} bağı var${again}`), { extra: { code: 'bond_active', kind: have } });
      }
      // A bond that ended by itself (no gift for days) or with a block (unblocked since) leaves no wait; one that a
      // person ended does.
      const recent = await c.query(
        `SELECT 1 FROM bonds WHERE pair_lo = LEAST($1::uuid, $2::uuid) AND pair_hi = GREATEST($1::uuid, $2::uuid) AND status = 'ended'
            AND coalesce(end_reason, '') NOT IN ('idle', 'block') AND ended_at > now() - make_interval(days => $3::int)`,
        [me.id, to, set.bondCooldownDays],
      );
      if (recent.rowCount) throw new HttpError(409, `Bu kişiyle bağın yakın zamanda bitti; ${set.bondCooldownDays} gün sonra yeniden kurabilirsin`);
      const pending = await c.query(`SELECT count(*) AS n FROM bonds WHERE a = $1 AND status = 'pending'`, [me.id]);
      if (Number(pending.rows[0].n) >= set.bondPendingMax) throw new HttpError(409, `Aynı anda en fazla ${set.bondPendingMax} bekleyen isteğin olabilir`);
      const max = maxOf(kind, set);
      if ((await countKind(c, me.id, kind, true)) >= max) throw new HttpError(409, max === 1 ? `Zaten bir ${k.label} bağın var` : `En fazla ${max} ${k.label} bağın olabilir`);
      if ((await countKind(c, to, kind, false)) >= max) throw new HttpError(409, `Bu kişinin ${k.label} bağları dolu`);
      const parts = await spendCoins(c, me.id, gift.price, `Bağ isteği: ${k.label} (${gift.name})`, b.ref, to, { detail: { bondKind: kind } });
      await c.query(
        `INSERT INTO bonds (a, b, pair_lo, pair_hi, kind, held_coins, held_lots, ref, expires_at)
         VALUES ($1, $2, LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), $3, $4, $5, $6, now() + make_interval(days => $7::int))`,
        [me.id, to, kind, gift.price, JSON.stringify(parts), b.ref, set.bondAnswerDays],
      );
    });
    const row = await db.query('SELECT id FROM bonds WHERE a = $1 AND ref = $2', [me.id, b.ref]);
    // A copy of the same request raced another request to the same person: nothing was taken.
    if (!row.rowCount) throw new HttpError(409, 'Bu kişiyle bekleyen bir bağ isteği var');
    const bond = await view(Number(row.rows[0].id), me.id, realPoints(url));
    if (!res.replay) notify([to], { title: 'Bağ isteği', body: `${me.name} seninle ${k.label} bağı kurmak istiyor`, data: { type: 'bond', id: bond.id } });
    if (!res.replay) await tellStatus(bond.id);
    // From a room's Aile ve Dost shelf: the room sees the gift go, best effort.
    const room = res.replay ? null : voiceRoom(b.room);
    if (room) void roomPacket(`oda-${room}`, { type: 'gift', giftId: `bag-${kind}`, count: 1, from: me.id, to, eventId: ROOM_EVENT_BASE + bond.id }).catch(() => {});
    return { ...res, bond };
  },

  async 'POST /api/bonds/respond'(req, url) {
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
      // On this transaction's own connection: it holds both accounts' locks (see blockedBetween).
      if (await blockedBetween(b.a, b.b, c)) throw new HttpError(403, 'Bu kişiyle bağ kuramazsın');
      const alive = await c.query('SELECT count(*) AS n FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL', [[b.a, b.b]]);
      if (Number(alive.rows[0].n) < 2) throw new HttpError(404, 'Kullanıcı bulunamadı');
      // Room may have filled since the request: mine, or theirs from another bond accepted meanwhile.
      const max = maxOf(b.kind);
      if ((await countKind(c, me.id, b.kind, false)) >= max) throw new HttpError(409, `${k.label} bağların dolu; önce birini bitir`);
      if ((await countKind(c, b.a, b.kind, false)) >= max) throw new HttpError(409, `İsteği gönderenin ${k.label} bağları dolu`);
      const total = Number(b.held_coins);
      const ref = `bond:${b.id}`;
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
      // The accept day is a gift day (no drop tonight); the level it starts at is no news.
      const level = levelOf(Math.floor(total / 100), bondNumbers().levels);
      await c.query(`UPDATE bonds SET status = 'active', accepted_at = now(), gift_coins = held_coins, gift_day = ${TODAY}, level = $2, level_said = $2 WHERE id = $1`, [b.id, level]);
      return 'active';
    });
    await tellStatus(id);
    const bond = await view(id, me.id, realPoints(url));
    if (result === 'expired') throw new HttpError(410, 'İsteğin süresi doldu, jeton gönderene döndü');
    notify([bond.partner.id], {
      title: result === 'active' ? 'Bağ kuruldu' : 'Bağ isteği',
      body: result === 'active' ? `${me.name} ${bond.label} bağı isteğini kabul etti` : `${me.name} ${bond.label} bağı isteğini kabul etmedi; jetonun geri döndü`,
      data: { type: 'bond', id },
    });
    return { bond };
  },

  async 'POST /api/bonds/withdraw'(req, url) {
    const me = await auth(req);
    const id = int((await readJson(req)).id, 1, Number.MAX_SAFE_INTEGER);
    if (id === null) throw new HttpError(400, 'Geçersiz bağ');
    await tx(async (c) => {
      const b = await lockPair(c, id);
      if (b.a !== me.id) throw new HttpError(403, 'Bu isteği sen göndermedin');
      if (b.status !== 'pending') throw new HttpError(409, 'Bu istek artık geçerli değil');
      await refund(c, b, 'withdrawn', `Bağ isteği iadesi: ${KINDS[b.kind].label} (geri alındı)`);
    });
    await tellStatus(id);
    return { bond: await view(id, me.id, realPoints(url)) };
  },

  async 'POST /api/bonds/end'(req, url) {
    const me = await auth(req);
    const id = int((await readJson(req)).id, 1, Number.MAX_SAFE_INTEGER);
    if (id === null) throw new HttpError(400, 'Geçersiz bağ');
    // The two accounts first, then the bond, as a gift between them locks them (lockPair): ended_by is a key to
    // users, so writing it checks my row, which a gift between us holds while it waits for this bond's row.
    await tx(async (c) => {
      const b = await lockPair(c, id);
      if (b.a !== me.id && b.b !== me.id) throw new HttpError(403, 'Bu bağ senin değil');
      if (b.status !== 'active') throw new HttpError(409, 'Bu bağ zaten bitmiş');
      await c.query(`UPDATE bonds SET status = 'ended', ended_at = now(), ended_by = $2 WHERE id = $1`, [id, me.id]);
    });
    await tellStatus(id);
    const bond = await view(id, me.id, realPoints(url));
    notify([bond.partner.id], { title: 'Bağ bitti', body: `${me.name} ${bond.label} bağını bitirdi`, data: { type: 'bond', id } });
    return { bond };
  },

  // Room effects: the mic mark and the joint entrance need both people in the room, so every active bond between two
  // of them; the chat bubble (Lv10) has the partner anywhere, so each one's best such bond (Çift first, then the
  // highest), looked up per person (its Lv10+ bonds only, bonds_top_a / _b). Nothing is cut off, however many bonds
  // each has. A bond either side hid is left out, unless I am in it.
  async 'POST /api/bonds/among'(req) {
    const me = await auth(req);
    limit(`bondamong:${me.id}`, 60);
    const body = await readJson(req);
    if (!Array.isArray(body.ids)) throw new HttpError(400, 'Geçersiz liste');
    const ids = [...new Set(body.ids)].slice(0, AMONG_MAX).map((x) => userId(x, 'kişi'));
    if (!ids.length) return { bonds: [] };
    const SEEN = `ua.deleted_at IS NULL AND ub.deleted_at IS NULL AND ((NOT ua.bonds_hidden AND NOT ub.bonds_hidden) OR $2 IN (x.a, x.b))`;
    const pairs = await db.query(
      `SELECT x.id, x.a, x.b, x.kind, x.gift_coins, x.talk_points, x.points_lost
         FROM bonds x JOIN users ua ON ua.id = x.a JOIN users ub ON ub.id = x.b
        WHERE x.status = 'active' AND x.a = ANY($1::uuid[]) AND x.b = ANY($1::uuid[]) AND ${SEEN}`,
      [ids, me.id],
    );
    // The stored level (kept with every write, bond-life.mjs) finds the candidates; the points decide below.
    const ACTIVE_TOP = `status = 'active' AND level >= ${BUBBLE}`;
    const top = await db.query(
      `SELECT t.* FROM unnest($1::uuid[]) p(id)
        CROSS JOIN LATERAL (
          SELECT x.id, x.a, x.b, x.kind, x.gift_coins, x.talk_points, x.points_lost
            FROM (SELECT * FROM bonds WHERE a = p.id AND ${ACTIVE_TOP} UNION ALL SELECT * FROM bonds WHERE b = p.id AND ${ACTIVE_TOP}) x
            JOIN users ua ON ua.id = x.a JOIN users ub ON ub.id = x.b
           WHERE ${SEEN}
           ORDER BY (x.kind = 'cift') DESC, x.level DESC, x.id LIMIT 1) t`,
      [ids, me.id],
    );
    const levels = bondNumbers().levels;
    const seen = new Set();
    const bonds = [];
    for (const b of [...pairs.rows, ...top.rows]) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      bonds.push({ a: b.a, b: b.b, kind: b.kind, level: levelOf(scoreOf(b), levels) });
    }
    return { bonds };
  },

  async 'POST /api/bonds/privacy'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    if (typeof b.hidden !== 'boolean') throw new HttpError(400, 'Geçersiz ayar');
    await db.query('UPDATE users SET bonds_hidden = $2 WHERE id = $1', [me.id, b.hidden]);
    return { hidden: b.hidden };
  },
};
