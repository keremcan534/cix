// Bağlar over time (docs/BAGLAR.md, Güncelleme 7, migration 099): the nightly drop, the end of a bond nobody gifts any
// more, and what both people are told in Mesajlar › SimilarClub Sistem (system-notices.mjs, category 'bond').
//
// The drop: at Türkiye's midnight a bond whose two people sent each other no gift the day before loses
// bond_drop_pct % of its points, at least bond_drop_flat (never below 0): points_lost grows, the coins and talk points
// stay as they were. A gift either way (bonds.mjs addBondCoins: gift_day) stops it for that day; a message gives talk
// points but stops nothing; the night after the accept is free (the accept day is a gift day). bond_idle_end_days days
// with no gift end the bond (status 'ended', end_reason 'idle', nobody's; no refund, no cooldown), with a warning
// bond_idle_warn_days days before. A night the server missed isn't made up.
// The pass touches bond rows only, in batches, and never an account's row (no user lock: it can't wait on a gift, and
// a gift that holds a bond's row is skipped and worked out a minute later). It writes each row once and changes no
// foreign key column (the Nov 2026 lesson: a second write of a row re-checks its keys).
//
// The notices: written after the change is committed, never inside a gift's transaction, each with a server ref
// (`bond:<id>:<event>`, once per person). A status change is told by tellStatus (told_status: what was told last),
// right after a route's commit and else by the sweep (a store refund's void, an expiry, the nightly end); a level
// change (level: the points' level at the last write, level_said: the one told) by tellLevels, a moment after the
// gift or reply and else by the sweep. Points that drop without a level change tell nothing. A notice never rings
// the phone: the routes still send their pushes (request, accept, refuse, end) as before.
import { db } from './core.mjs';
import { builtinGift } from './custom-gifts.mjs';
import { live } from './live-settings.mjs';
import { systemNotice } from './system-notices.mjs';
import { DECAY, KINDS, LEVELS, levelsOf } from './bond-rules.mjs';

const TODAY = "(now() AT TIME ZONE 'Europe/Istanbul')::date";
/** Where a bond notice leads: my own Bağlar tab (its requests to answer too). Older APKs open it as well. */
export const BOND_LINK = '/kullanici/me?tab=iliski';
const fmt = (n) => Number(n).toLocaleString('tr-TR');

/** Bağlar's numbers now (Canlı ayarlar › Bağlar), the rules' own for anything unreadable. */
export function bondNumbers(s = live()) {
  const n = (v, d) => (Number.isSafeInteger(v) && v >= 0 ? v : d);
  return {
    levels: levelsOf(s.bondLevels) ?? LEVELS,
    dropPct: n(s.bondDropPct, DECAY.dropPct),
    dropFlat: n(s.bondDropFlat, DECAY.dropFlat),
    idleEndDays: n(s.bondIdleEndDays, DECAY.idleEndDays),
    idleWarnDays: n(s.bondIdleWarnDays, DECAY.idleWarnDays),
  };
}
/** SQL: a bond's points (`x`: the table's alias with its dot, or ''). */
export const scoreSql = (x = '') => `greatest(0, ${x}gift_coins / 100 + ${x}talk_points - ${x}points_lost)`;
/** SQL: the level of the points `expr` with the steps in parameter `param` (a bigint[]). */
export const levelSql = (expr, param) => `(SELECT count(*)::int FROM unnest(${param}::bigint[]) t WHERE t <= ${expr})`;

const giftName = (kind) => builtinGift(`bag-${kind}`)?.name ?? KINDS[kind]?.gift ?? 'Bağ hediyesi';
const label = (kind) => KINDS[kind]?.label ?? 'Bağ';

// --- Telling of a change -----------------------------------------------------------------------------------------
let soon = null;
const soonIds = new Set();
/**
 * A gift or a reply may have moved bond `id`'s level: tell it a moment later (after its transaction), best effort,
 * before any older news the sweep still has to tell (a night's drops can leave tens of thousands).
 */
export function levelsSoon(id = null) {
  if (Number.isSafeInteger(id)) soonIds.add(id);
  if (soon) return;
  soon = setTimeout(() => {
    soon = null;
    const ids = [...soonIds];
    soonIds.clear();
    void tellLevels(ids.length ? ids : null).catch((e) => console.error('bond levels', e.message));
  }, 1500);
  soon.unref?.();
}

/**
 * The level changes nobody was told of yet (`only`: just those bonds, else up to 200 by id): both people hear it, then
 * it is marked (a crash between sends nothing twice). → how many bonds were told.
 */
export async function tellLevels(only = null) {
  const r = await db.query(
    `SELECT x.id, x.a, x.b, x.kind, x.level, x.level_said, x.level_seq, ua.name AS a_name, ub.name AS b_name
       FROM bonds x JOIN users ua ON ua.id = x.a JOIN users ub ON ub.id = x.b
      WHERE x.status = 'active' AND x.level <> x.level_said ${only ? 'AND x.id = ANY($1::bigint[])' : ''} ORDER BY x.id LIMIT 200`,
    only ? [only] : [],
  );
  for (const b of r.rows) {
    const up = b.level > b.level_said;
    const ref = `bond:${b.id}:level:${b.level_seq + 1}`;
    for (const [target, partner] of [[b.a, { id: b.b, name: b.b_name }], [b.b, { id: b.a, name: b.a_name }]]) {
      await systemNotice({
        target,
        category: 'bond',
        ref,
        push: false,
        title: up ? `🔗 Bağ seviyesi yükseldi: Lv.${b.level}` : `🔗 Bağ seviyesi düştü: Lv.${b.level}`,
        body: up
          ? [`${partner.name} ile ${label(b.kind)} bağınız Lv.${b.level} oldu.`, 'Birbirinize gönderdiğiniz hediyeler ve mesajlaşma bağ puanı getirir.'].join('\n')
          : [`${partner.name} ile ${label(b.kind)} bağınız Lv.${b.level} seviyesine düştü.`, 'İkinizden hiçbirinin hediye göndermediği her gece bağ puanı düşer. Bir hediye o günün düşüşünü durdurur.'].join('\n'),
        data: { bond: Number(b.id), kind: b.kind, event: up ? 'level_up' : 'level_down', level: b.level, was: b.level_said, partner, status: 'done' },
        link: BOND_LINK,
      });
    }
    await db.query('UPDATE bonds SET level_said = $2, level_seq = level_seq + 1 WHERE id = $1 AND level_seq = $3', [b.id, b.level, b.level_seq]);
  }
  return r.rowCount;
}

/** The notices of one bond's new status (`b`: its row with the two names, and `back`, the coins its refund returned). */
function statusNotices(b) {
  const A = { id: b.a, name: b.a_name };
  const B = { id: b.b, name: b.b_name };
  const k = label(b.kind);
  const gift = giftName(b.kind);
  const held = Number(b.held_coins);
  const back = Number(b.back ?? 0);
  const base = { bond: Number(b.id), kind: b.kind, status: 'done' };
  const one = (target, partner, event, title, lines) => ({ target, ref: `bond:${b.id}:${event}`, title, body: lines.join('\n'), data: { ...base, event, partner } });
  switch (b.status) {
    case 'pending': {
      const days = Math.max(1, Math.ceil((new Date(b.expires_at).getTime() - Date.now()) / 86_400_000));
      return [
        one(b.b, A, 'request', '🔗 Bağ isteği', [
          `${A.name} seninle ${k} bağı kurmak istiyor.`,
          `Bağ hediyesi: ${gift} (${fmt(held)} jeton). Kabul edersen hediye sana elmas olarak geçer.`,
          `${days} gün içinde yanıtlamazsan istek düşer ve jeton gönderene döner.`,
        ]),
      ];
    }
    case 'active':
      return [
        one(b.a, B, 'accept', '🔗 Bağ kuruldu', [`${B.name} ${k} bağı isteğini kabul etti.`, `${gift} ona geçti. Birbirinize gönderdiğiniz her hediye bağ puanı getirir.`]),
        one(b.b, A, 'accept', '🔗 Bağ kuruldu', [`${A.name} ile ${k} bağınız kuruldu.`, `${gift} hesabına 💎 ${fmt(held)} elmas olarak geçti.`]),
      ];
    case 'refused':
      return [one(b.a, B, 'refuse', 'Bağ isteği kabul edilmedi', [`${B.name} ${k} bağı isteğini kabul etmedi.`, `${fmt(back || held)} jetonun hesabına iade edildi.`])];
    case 'expired':
      return [one(b.a, B, 'expire', 'Bağ isteğinin süresi doldu', [`${B.name} ${k} bağı isteğine zamanında yanıt vermedi.`, `${fmt(back || held)} jetonun hesabına iade edildi.`])];
    case 'withdrawn':
      if (b.end_reason === 'refund')
        return [
          one(b.a, B, 'refund', 'Bağ isteği iptal edildi', [
            `Bir jeton satın alman iade edildiği için ${B.name} kişisine gönderdiğin ${k} bağı isteği iptal edildi.`,
            back > 0 ? `İade edilen satın almadan gelmeyen ${fmt(back)} jetonun hesabına döndü.` : 'İsteğin jetonları iade edilen satın almayla birlikte geri alındı.',
          ]),
        ];
      return [one(b.b, A, 'withdraw', 'Bağ isteği geri çekildi', [`${A.name} sana gönderdiği ${k} bağı isteğini geri çekti.`])];
    case 'ended': {
      if (b.end_reason === 'idle') {
        const lines = (p) => [`${p.name} ile ${k} bağınız, ${fmt(b.quiet ?? 0)} gün boyunca ikinizden hiç hediye gitmediği için kendiliğinden bitti.`, 'Jeton iadesi yok. İsterseniz hemen yeniden bağ kurabilirsiniz.'];
        return [one(b.a, B, 'idle-end', 'Bağ bitti', lines(B)), one(b.b, A, 'idle-end', 'Bağ bitti', lines(A))];
      }
      // A block ends the bond without a word to either (the blocked person is never told; the blocker chose it).
      if (b.end_reason === 'block') return [];
      if (b.end_reason === 'gone') {
        const out = [];
        if (!b.a_gone) out.push(one(b.a, B, 'end', 'Bağ bitti', [`${B.name} hesabını kapattığı için ${k} bağınız bitti.`]));
        if (!b.b_gone) out.push(one(b.b, A, 'end', 'Bağ bitti', [`${A.name} hesabını kapattığı için ${k} bağınız bitti.`]));
        return out;
      }
      const by = b.ended_by === b.a ? A : B;
      const other = by === A ? B : A;
      return [one(other.id, by, 'end', 'Bağ bitti', [`${by.name} ${k} bağınızı bitirdi.`, 'Bağ seviyesi ve ödülleri sıfırlandı; jeton iadesi yok.'])];
    }
    default:
      return [];
  }
}

/**
 * The status changes nobody was told of yet (`id`: only that bond, right after its route's commit): each one's
 * notices, then the mark. Never throws; → how many bonds were told.
 */
export async function tellStatus(id = null) {
  try {
    const r = await db.query(
      `SELECT x.*, ua.name AS a_name, ub.name AS b_name, ua.deleted_at IS NOT NULL AS a_gone, ub.deleted_at IS NOT NULL AS b_gone,
              (SELECT l.amount FROM ledger l WHERE l.user_id = x.a AND l.currency = 'coin' AND l.ref = 'bond:' || x.id || ':iade') AS back,
              ${TODAY} - x.gift_day AS quiet
         FROM bonds x JOIN users ua ON ua.id = x.a JOIN users ub ON ub.id = x.b
        WHERE x.told_status IS DISTINCT FROM x.status ${id === null ? '' : 'AND x.id = $1'} ORDER BY x.id LIMIT 200`,
      id === null ? [] : [id],
    );
    for (const b of r.rows) {
      for (const n of statusNotices(b)) await systemNotice({ ...n, category: 'bond', push: false, link: BOND_LINK });
      await db.query('UPDATE bonds SET told_status = $2 WHERE id = $1 AND told_status IS NOT DISTINCT FROM $3', [b.id, b.status, b.told_status]);
    }
    return r.rowCount;
  } catch (e) {
    console.error('bond notices', e.message);
    return 0;
  }
}

// --- The nightly drop and the quiet end --------------------------------------------------------------------------
const BATCH = 500;
/**
 * Once per Türkiye day for each active bond: a quiet day before costs points, too many quiet days end it. → how many
 * bonds lost points and how many ended.
 */
export async function runBondDecay() {
  const k = bondNumbers();
  let dropped = 0;
  let ended = 0;
  // Batches walk forward by id (keyset): each starts after the last one's highest id, so none reads again the rows
  // the batches before it worked out (a filter alone made the night's cost grow with the square of the bonds). A row
  // a gift held (skipped) is worked out by the next sweep, which starts from the beginning.
  let last = 0;
  for (;;) {
    const r = await db.query(
      `WITH due AS (
         SELECT id, ${scoreSql()} AS s, ${TODAY} - gift_day AS quiet
           FROM bonds WHERE status = 'active' AND (decayed_on IS NULL OR decayed_on < ${TODAY}) AND id > $5::bigint
          ORDER BY id LIMIT ${BATCH} FOR UPDATE SKIP LOCKED),
       calc AS (
         SELECT id, s, coalesce($3::int > 0 AND quiet > $3::int, false) AS idle,
                CASE WHEN quiet >= 2 THEN least(s, greatest($2::bigint, floor(s * $1::numeric / 100)::bigint)) ELSE 0 END AS cut
           FROM due)
       UPDATE bonds x SET decayed_on = ${TODAY},
              points_lost = x.points_lost + CASE WHEN c.idle THEN 0 ELSE c.cut END,
              level = CASE WHEN c.idle THEN x.level ELSE ${levelSql('c.s - c.cut', '$4')} END,
              status = CASE WHEN c.idle THEN 'ended' ELSE x.status END,
              ended_at = CASE WHEN c.idle THEN now() ELSE x.ended_at END,
              end_reason = CASE WHEN c.idle THEN 'idle' ELSE x.end_reason END
         FROM calc c WHERE x.id = c.id
       RETURNING x.id, c.idle, c.cut`,
      [k.dropPct, k.dropFlat, k.idleEndDays, k.levels, last],
    );
    for (const x of r.rows) {
      if (x.idle) ended++;
      else if (Number(x.cut) > 0) dropped++;
      last = Math.max(last, Number(x.id));
    }
    if (r.rowCount < BATCH) break;
  }
  if (dropped || ended) console.log(`bond drop: ${dropped}, ended: ${ended}`);
  return { dropped, ended };
}

/** Quiet bonds that end within bond_idle_warn_days days: both people are warned once per quiet stretch. */
export async function warnQuietBonds() {
  const { idleEndDays: end, idleWarnDays: warn } = bondNumbers();
  if (!(end > 0 && warn > 0)) return 0;
  const r = await db.query(
    `SELECT x.id, x.a, x.b, x.kind, x.gift_day::text AS day, ${TODAY} - x.gift_day AS quiet, ua.name AS a_name, ub.name AS b_name
       FROM bonds x JOIN users ua ON ua.id = x.a JOIN users ub ON ub.id = x.b
      WHERE x.status = 'active' AND x.gift_day < ${TODAY} - ($1::int - $2::int) AND x.gift_day >= ${TODAY} - $1::int
        AND x.idle_warned IS DISTINCT FROM x.gift_day
      ORDER BY x.id LIMIT 500`,
    [end, warn],
  );
  for (const b of r.rows) {
    const left = Math.max(1, end + 1 - Number(b.quiet));
    for (const [target, partner] of [[b.a, { id: b.b, name: b.b_name }], [b.b, { id: b.a, name: b.a_name }]]) {
      await systemNotice({
        target,
        category: 'bond',
        ref: `bond:${b.id}:idle-warn:${b.day}`,
        push: false,
        title: '⚠️ Bağın bitmek üzere',
        body: [
          `${partner.name} ile ${label(b.kind)} bağınızda ${fmt(b.quiet)} gündür ikinizden hiç hediye gitmedi.`,
          `${left} gün içinde biriniz diğerine herhangi bir hediye göndermezse bağ kendiliğinden biter.`,
        ].join('\n'),
        data: { bond: Number(b.id), kind: b.kind, event: 'idle_warn', daysLeft: left, partner, status: 'done' },
        link: BOND_LINK,
      });
    }
    await db.query('UPDATE bonds SET idle_warned = gift_day WHERE id = $1 AND gift_day = $2::date', [b.id, b.day]);
  }
  return r.rowCount;
}
