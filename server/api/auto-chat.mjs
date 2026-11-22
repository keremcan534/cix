// Otomatik mesajlaşma (docs/OTOMATIK_MESAJ.md, the owners' spec V2.0): a woman streamer's 10 automatic messages a
// day from her own templates, a man's free conversation starts sent by the system in his name, a streamer's 10 quick
// replies a day, the matching that picks who gets what, and the answer figures (Mesaj Performansım, the agency's and
// the panel's reports, the late-answer warnings, the daily summary).
//
//   GET  /api/auto-chat/me                       → { tools, auto, quick, opener, receive, reply }  my rights today
//   GET  /api/auto-chat/templates                → { templates, limits, auto }         (women streamers)
//   POST /api/auto-chat/templates { no, text }   → { template, templates }             my own wording of one
//   POST /api/auto-chat/templates/reset { no }   → { template, templates }             back to the default
//   GET  /api/auto-chat/performance?period=&from=&to= → { period, stats, days, today } (streamers)
//   GET  /api/admin/auto-chat/report?period=&from=&to= (admin) → { stats, streamers, agencies, quick, auto, pairs }
//   POST /api/admin/auto-chat/daily { day }      (admin) → { day, summaries, warnings }  a day's summaries and warnings
//        again (once per person and day: what went out already stays as it is)
//   POST /api/admin/auto-chat/round              (admin) → { streamer, opener }   one matching round now (a controlled
//        start: the sweep can be off, AUTO_CHAT_SWEEP_MS=0, while staff try it)
// The choices (autoReceive, autoOpener, autoOpenerSeen, autoSend) are in PATCH /api/me/privacy (privacy.mjs).
// A quick reply is POST /api/messages { quick: n } (messages.mjs): the server takes its words from the pool.
//
// Who: the tools (templates, automatic messages, quick replies, the 5-minute reward) are for women streamers only
// (streamer-rule.mjs, the existing approval; the spec, §2). A man earns nothing from them. Rights are counted on the
// server by Turkey's day (Europe/Istanbul, new at 00.00, auto_quota), only for a message that was stored, and can't
// go past the limit when two requests come at once (one row, a conditional update).
//
// The matching (sweep, every minute): a streamer gets her turn when she is online, has rights left, her last
// automatic message is auto_gap_minutes old and she isn't busy (auto_busy_pending waiting paid messages). The queue
// orders streamers by answers in 5 minutes weighed by auto_streamer_coef, the rest chance, a new streamer counting as
// average (auto-chat-rules.mjs streamerScore), so nobody is left out. A man is a candidate when he is a man who isn't
// a streamer, takes automatic messages (autoReceive), was on in the last day, got none in auto_man_gap_minutes, is
// under his daily cap (auto_man_daily, cut by auto_quiet_cut when he rarely answers), and isn't chatting right now
// (auto_active_minutes). Candidates are scored (manScore: new accounts first, then those who answer, those online,
// a little chance). A pair never gets an automatic message when they ever wrote to each other, when either blocked
// the other, when she already sent him one, or when his "Bana kimler mesaj gönderebilir?" refuses her.
// A man's free start goes the same way the other direction: he must have it on and his app must have told him what it
// is (autoOpenerSeen); it goes to a woman who takes automatic messages and was on in the last day. It is free (no
// coins move), marked as automatic for both, and earns nobody anything (the spec's safe rule, §7.5): her answer earns
// only on his next real paid message.
import crypto from 'node:crypto';

import { HttpError, auth, clientIp, db, env, int, publicText, readJson, tx } from './core.mjs';
import { panelDetail } from './panel.mjs';
import { DEFAULT_OPENERS, DEFAULT_QUICK, DEFAULT_TEMPLATES, TEMPLATE_COUNT, linesOf, manCap, manScore, streamerScore } from './auto-chat-rules.mjs';
import { live } from './live-settings.mjs';
import { wantsMessagePush } from './one-on-one.mjs';
import { dmRefusal, privacyOf } from './privacy.mjs';
import { notify } from './push.mjs';
import { muteFor } from './sanctions.mjs';
import { streamerSql } from './streamer-rule.mjs';
import { systemNotice } from './system-notices.mjs';

export const TODAY = "(now() AT TIME ZONE 'Europe/Istanbul')::date";
/** When Turkey's today began, as a timestamptz. */
const DAY_START = `(${TODAY}::timestamp AT TIME ZONE 'Europe/Istanbul')`;
const fmt = (n) => Number(n).toLocaleString('tr-TR');
const off = (part) => live().autoChatOff.has(part);
/** Turkey's today as YYYY-MM-DD (a once-a-day notice's ref). */
const istanbulDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });

/** SQL: whether account `x` is a woman streamer (the tools are hers). */
export const womanStreamerSql = (x) => `(EXISTS (SELECT 1 FROM users w WHERE w.id = ${x} AND w.gender = 'Kadın' AND w.deleted_at IS NULL) AND ${streamerSql(x)})`;
export const isWomanStreamer = async (q, uid) => (await q.query(`SELECT ${womanStreamerSql('$1::uuid')} AS yes`, [uid])).rows[0].yes;
const toolsOnly = async (me) => {
  if (!(await isWomanStreamer(db, me.id))) throw Object.assign(new HttpError(403, 'Bu bölüm onaylı kadın yayıncılar içindir'), { extra: { code: 'not_streamer' } });
};

// --- Rights ------------------------------------------------------------------------------------------------------
/**
 * Inside the transaction that stores the message: takes one of today's `kind` rights, at most `max`. Returns how many
 * are used now, or null when none was left (nothing is written). A rollback gives it back.
 */
export async function takeQuota(c, uid, kind, max) {
  if (!(max > 0)) return null;
  const r = await c.query(
    `INSERT INTO auto_quota (user_id, day, kind, used) VALUES ($1, ${TODAY}, $2, 1)
     ON CONFLICT (user_id, day, kind) DO UPDATE SET used = auto_quota.used + 1 WHERE auto_quota.used < $3
     RETURNING used`,
    [uid, kind, max],
  );
  return r.rowCount ? r.rows[0].used : null;
}

/** Today's rights used by `uid`: { auto, quick, opener }. */
export async function usedToday(q, uid) {
  const r = await q.query(`SELECT kind, used FROM auto_quota WHERE user_id = $1 AND day = ${TODAY}`, [uid]);
  const out = { auto: 0, quick: 0, opener: 0 };
  for (const x of r.rows) out[x.kind] = x.used;
  return out;
}
const right = (total, used, on) => ({ total, used: Math.min(used, total), left: Math.max(0, total - used), on });
/** When the rights come back: Turkey's next midnight. */
const resetsAt = () => {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
  const next = new Date(ist);
  next.setHours(24, 0, 0, 0);
  return new Date(now.getTime() + (next.getTime() - ist.getTime())).toISOString();
};

// --- Templates, pools --------------------------------------------------------------------------------------------
const defaultTemplates = () => {
  const lines = linesOf(live().autoTemplatesDefault);
  return Array.from({ length: TEMPLATE_COUNT }, (_, i) => lines[i] ?? DEFAULT_TEMPLATES[i]);
};
export const openerPool = () => {
  const l = linesOf(live().autoOpenerPool);
  return l.length ? l : DEFAULT_OPENERS;
};
export const quickPool = () => {
  const l = linesOf(live().autoQuickPool);
  return l.length ? l : DEFAULT_QUICK;
};

/** A streamer's 10 templates: hers where she wrote one, the default otherwise. */
export async function templatesOf(q, uid) {
  const own = new Map((await q.query('SELECT no, body, updated_at FROM auto_templates WHERE user_id = $1', [uid])).rows.map((x) => [x.no, x]));
  return defaultTemplates().map((d, i) => {
    const mine = own.get(i + 1);
    return { no: i + 1, text: mine?.body ?? d, custom: !!mine, defaultText: d, updatedAt: mine?.updated_at ?? null };
  });
}

/**
 * A quick reply from `me` to `to`: the pool's line `no` (1-based). Only a woman streamer, while quick replies are on,
 * answering someone who wrote to her in the last 7 days. The right itself is taken with the message (messages.mjs).
 */
export async function quickReplyOf(me, to, no) {
  if (off('quick')) throw Object.assign(new HttpError(403, 'Hazır cevaplar şu an kapalı'), { extra: { code: 'quick_off' } });
  await toolsOnly(me);
  const pool = quickPool();
  if (!Number.isSafeInteger(no) || no < 1 || no > pool.length) throw new HttpError(400, 'Geçersiz hazır cevap');
  // A follow's line (social.mjs) is no message they wrote.
  const wrote = await db.query("SELECT 1 FROM messages WHERE sender = $1 AND recipient = $2 AND source <> 'follow' AND created_at > now() - interval '7 days' LIMIT 1", [to, me.id]);
  if (!wrote.rowCount) throw Object.assign(new HttpError(403, 'Hazır cevap yalnız sana yazan kişiye gönderilir'), { extra: { code: 'quick_not_reply' } });
  return pool[no - 1];
}
export const QUICK_DONE = 'Günlük 10 hazır cevap hakkını kullandın. Mesajlara kendin yanıt vererek elmas kazanmaya devam edebilirsin.';
export const AUTO_DONE = 'Otomatik mesaj hakkın kalmadı. Elmas kazanmak için gelen mesajları yanıtla.';
const quickDoneText = () => QUICK_DONE.replace('10', String(live().quickDaily));

/** The quick-reply state after one was sent (and the day's last one tells SimilarClub Sistem, once a day). */
export async function quickAfter(me, used) {
  const total = live().quickDaily;
  if (used >= total) {
    void systemNotice({ target: me.id, category: 'quota', ref: `quota:quick:${istanbulDay()}`, title: '⚠️ Hazır cevap hakkın bitti', body: quickDoneText(), link: '/yayinci/mesajlar', push: false });
  }
  return { ...right(total, used, !off('quick')), done: used >= total ? quickDoneText() : null, resetsAt: resetsAt() };
}

/** I wrote to someone who sent me an automatic message: it got its answer (the matching reads how often). */
export async function noteAutoReply(me, to) {
  await db.query('UPDATE auto_sends SET replied_at = now() WHERE sender = $1 AND recipient = $2 AND replied_at IS NULL', [to, me]);
}

// --- Matching ----------------------------------------------------------------------------------------------------
const onlineSql = (x, minutes) => `EXISTS (SELECT 1 FROM sessions o WHERE o.user_id = ${x} AND o.last_seen_at > now() - make_interval(mins => ${minutes}))`;
const prefSql = (x, col) => `coalesce((SELECT p.${col} FROM privacy_settings p WHERE p.user_id = ${x}), true)`;

/** The pairs among streamers/senders `a` and recipients `b` that may never get an automatic message. */
async function closedPairs(a, b) {
  if (!a.length || !b.length) return new Set();
  const r = await db.query(
    `SELECT sender AS a, recipient AS b FROM messages WHERE sender = ANY($1::uuid[]) AND recipient = ANY($2::uuid[]) AND source <> 'follow'
     UNION SELECT recipient, sender FROM messages WHERE sender = ANY($2::uuid[]) AND recipient = ANY($1::uuid[]) AND source <> 'follow'
     UNION SELECT blocker, blocked FROM blocks WHERE blocker = ANY($1::uuid[]) AND blocked = ANY($2::uuid[])
     UNION SELECT blocked, blocker FROM blocks WHERE blocker = ANY($2::uuid[]) AND blocked = ANY($1::uuid[])
     UNION SELECT sender, recipient FROM auto_sends WHERE sender = ANY($1::uuid[]) AND recipient = ANY($2::uuid[])
     UNION SELECT recipient, sender FROM auto_sends WHERE sender = ANY($2::uuid[]) AND recipient = ANY($1::uuid[])`,
    [a, b],
  );
  return new Set(r.rows.map((x) => `${x.a}:${x.b}`));
}

/** The men who may get a streamer's automatic message now, best first (manScore). */
async function candidateMen(s) {
  const r = await db.query(
    `SELECT u.id, u.created_at > now() - make_interval(days => $1) AS new_user,
            EXISTS (SELECT 1 FROM messages m WHERE m.sender = u.id AND m.source = 'manual') AS chatted,
            ${onlineSql('u.id', '$2')} AS online,
            (SELECT count(*)::int FROM auto_sends a WHERE a.recipient = u.id AND a.kind = 'streamer' AND a.created_at > now() - interval '30 days') AS received,
            (SELECT count(*)::int FROM auto_sends a WHERE a.recipient = u.id AND a.kind = 'streamer' AND a.created_at > now() - interval '30 days' AND a.replied_at IS NOT NULL) AS replied,
            (SELECT count(*)::int FROM auto_sends a WHERE a.recipient = u.id AND a.kind = 'streamer' AND a.created_at >= ${DAY_START}) AS today
       FROM users u
      WHERE u.gender = 'Erkek' AND u.deleted_at IS NULL AND ${prefSql('u.id', 'auto_receive')}
        AND ${onlineSql('u.id', '1440')}
        AND NOT EXISTS (SELECT 1 FROM auto_sends a WHERE a.recipient = u.id AND a.created_at > now() - make_interval(mins => $3))
        AND ($4 = 0 OR NOT EXISTS (SELECT 1 FROM messages m WHERE m.sender = u.id AND m.created_at > now() - make_interval(mins => $4)))
        AND NOT ${streamerSql('u.id')}
      ORDER BY ${onlineSql('u.id', '$2')} DESC, u.created_at DESC
      LIMIT 500`,
    [s.autoNewDays, s.autoOnlineMinutes, s.autoManGapMinutes, s.autoActiveMinutes],
  );
  return r.rows
    .map((m) => ({ id: m.id, newUser: m.new_user, chatted: m.chatted, online: m.online, received: m.received, replied: m.replied, today: m.today }))
    .filter((m) => m.today < manCap(m, s))
    .map((m) => ({ ...m, score: manScore(m, s) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 300);
}

/** The women streamers whose turn it may be now, in the queue's order (streamerScore). */
async function readyStreamers(s) {
  const r = await db.query(
    `SELECT u.id, u.name,
            (SELECT count(*)::int FROM message_holds h WHERE h.earner = u.id AND h.status <> 'pending' AND h.delivered_at > now() - interval '7 days') AS total,
            (SELECT count(*)::int FROM message_holds h WHERE h.earner = u.id AND h.status = 'won' AND h.delivered_at > now() - interval '7 days') AS in_time
       FROM users u
      WHERE u.gender = 'Kadın' AND u.deleted_at IS NULL AND ${prefSql('u.id', 'auto_send')}
        AND ${onlineSql('u.id', '$1')}
        AND coalesce((SELECT q.used FROM auto_quota q WHERE q.user_id = u.id AND q.day = ${TODAY} AND q.kind = 'auto'), 0) < $2
        AND NOT EXISTS (SELECT 1 FROM auto_sends a WHERE a.sender = u.id AND a.kind = 'streamer' AND a.created_at > now() - make_interval(mins => $3))
        AND (SELECT count(*) FROM message_holds h WHERE h.earner = u.id AND h.status = 'pending') < $4
        AND ${streamerSql('u.id')}`,
    [s.autoOnlineMinutes, s.autoDaily, s.autoGapMinutes, s.autoBusyPending],
  );
  return r.rows.map((x) => ({ id: x.id, name: x.name, total: x.total, inTime: x.in_time, score: streamerScore({ total: x.total, inTime: x.in_time }, s) })).sort((a, b) => b.score - a.score);
}

/** Muted for direct messages (sanctions.mjs): no automatic message in their name either. */
const muted = async (uid) => !!(await muteFor(uid, 'dm').catch(() => null));

/** The template a streamer used longest ago (never used first), so the same words don't repeat. */
async function nextTemplate(c, uid) {
  const r = await c.query("SELECT template_no AS no, max(created_at) AS at FROM auto_sends WHERE sender = $1 AND kind = 'streamer' AND created_at > now() - interval '30 days' GROUP BY 1", [uid]);
  const last = new Map(r.rows.map((x) => [x.no, Date.parse(x.at)]));
  const order = Array.from({ length: TEMPLATE_COUNT }, (_, i) => i + 1).sort((a, b) => (last.get(a) ?? 0) - (last.get(b) ?? 0) || Math.random() - 0.5);
  return order[0];
}

/**
 * Stores one automatic message (`kind` streamer or opener) with its right, in one transaction; null when the right
 * ran out or the pair closed meanwhile. The message is free and marked (messages.source), so it never pays or earns.
 */
async function sendAuto(kind, from, to) {
  if (await dmRefusal(db, from.id, to)) return null;
  const s = live();
  const row = await tx(async (c) => {
    // Both rows in id order first, as every message does (messages.mjs keyLock).
    await c.query('SELECT 1 FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR KEY SHARE', [[from.id, to]]);
    const quota = kind === 'streamer' ? await takeQuota(c, from.id, 'auto', s.autoDaily) : await takeQuota(c, from.id, 'opener', s.openerDaily);
    if (quota === null) return null;
    let no;
    let body;
    if (kind === 'streamer') {
      no = await nextTemplate(c, from.id);
      body = (await templatesOf(c, from.id))[no - 1].text;
    } else {
      const pool = openerPool();
      const used = new Set((await c.query("SELECT template_no FROM auto_sends WHERE sender = $1 AND kind = 'opener' AND created_at > now() - interval '7 days'", [from.id])).rows.map((x) => x.template_no));
      const fresh = pool.map((_, i) => i + 1).filter((i) => !used.has(i));
      const from_ = fresh.length ? fresh : pool.map((_, i) => i + 1);
      no = from_[Math.floor(Math.random() * from_.length)];
      body = pool[no - 1];
    }
    const m = await c.query(
      "INSERT INTO messages (sender, recipient, body, ref, source, template_no) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [from.id, to, body, `auto:${crypto.randomBytes(9).toString('hex')}`, kind === 'streamer' ? 'auto_streamer' : 'auto_opener', no],
    );
    await c.query('INSERT INTO auto_sends (kind, sender, recipient, message_id, template_no) VALUES ($1, $2, $3, $4, $5)', [kind, from.id, to, m.rows[0].id, no]);
    return { ...m.rows[0], quota };
  });
  if (!row) return null;
  wantsMessagePush(db, to, from.id)
    .then((yes) => yes && notify([to], { title: from.name, body: row.body, data: { type: 'message', from: from.id } }))
    .catch((e) => console.error('auto push', e.message));
  if (kind === 'streamer' && row.quota >= s.autoDaily)
    void systemNotice({ target: from.id, category: 'quota', ref: `quota:auto:${istanbulDay()}`, title: '🔔 Otomatik mesaj hakkın bitti', body: AUTO_DONE, link: '/yayinci/mesajlar', push: false });
  return row;
}

/** One round of streamers' automatic messages: each ready streamer, in the queue's order, gets the best free man. */
async function streamerRound(batch) {
  const s = live();
  if (off('streamer') || !(s.autoDaily > 0)) return 0;
  const streamers = (await readyStreamers(s)).slice(0, batch);
  if (!streamers.length) return 0;
  const men = await candidateMen(s);
  const closed = await closedPairs(
    streamers.map((x) => x.id),
    men.map((m) => m.id),
  );
  const taken = new Set();
  let sent = 0;
  for (const st of streamers) {
    if (await muted(st.id)) continue;
    const man = men.find((m) => !taken.has(m.id) && !closed.has(`${st.id}:${m.id}`));
    if (!man) continue;
    taken.add(man.id);
    if (await sendAuto('streamer', st, man.id).catch((e) => console.error('auto send', e.message))) sent++;
  }
  return sent;
}

/** One round of men's free conversation starts. */
async function openerRound(batch) {
  const s = live();
  if (off('opener') || !(s.openerDaily > 0)) return 0;
  const men = await db.query(
    `SELECT u.id, u.name FROM users u
      WHERE u.gender = 'Erkek' AND u.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM privacy_settings p WHERE p.user_id = u.id AND p.auto_opener AND p.auto_opener_seen)
        AND ${onlineSql('u.id', '$1')}
        AND coalesce((SELECT q.used FROM auto_quota q WHERE q.user_id = u.id AND q.day = ${TODAY} AND q.kind = 'opener'), 0) < $2
        AND NOT EXISTS (SELECT 1 FROM auto_sends a WHERE a.sender = u.id AND a.kind = 'opener' AND a.created_at > now() - make_interval(mins => $3))
        AND ($4 = 0 OR NOT EXISTS (SELECT 1 FROM messages m WHERE m.sender = u.id AND m.source = 'manual' AND m.created_at > now() - make_interval(mins => $4)))
        AND NOT ${streamerSql('u.id')}
      ORDER BY random() LIMIT $5`,
    [s.autoOnlineMinutes, s.openerDaily, s.autoGapMinutes, s.autoActiveMinutes, batch],
  );
  if (!men.rowCount) return 0;
  const women = await db.query(
    `SELECT u.id, ${streamerSql('u.id')} AS streamer, ${onlineSql('u.id', '$1')} AS online FROM users u
      WHERE u.gender = 'Kadın' AND u.deleted_at IS NULL AND ${prefSql('u.id', 'auto_receive')}
        AND ${onlineSql('u.id', '1440')}
        AND NOT EXISTS (SELECT 1 FROM auto_sends a WHERE a.recipient = u.id AND a.kind = 'opener' AND a.created_at > now() - make_interval(mins => $2))
        AND (SELECT count(*) FROM auto_sends a WHERE a.recipient = u.id AND a.kind = 'opener' AND a.created_at >= ${DAY_START}) < $3
      ORDER BY random() LIMIT 500`,
    [s.autoOnlineMinutes, Math.max(5, Math.floor(s.autoManGapMinutes / 4)), Math.max(1, s.autoManDaily * 2)],
  );
  // Women online first, streamers among them (they answer, and the spec's chance: "kontrollü rastgele").
  const pool = women.rows.map((w) => ({ id: w.id, score: (w.online ? 20 : 0) + (w.streamer ? 10 : 0) + Math.random() * 15 })).sort((a, b) => b.score - a.score);
  const closed = await closedPairs(
    men.rows.map((m) => m.id),
    pool.map((w) => w.id),
  );
  const taken = new Set();
  let sent = 0;
  for (const man of men.rows) {
    if (await muted(man.id)) continue;
    const w = pool.find((x) => !taken.has(x.id) && !closed.has(`${man.id}:${x.id}`));
    if (!w) continue;
    taken.add(w.id);
    if (await sendAuto('opener', man, w.id).catch((e) => console.error('opener send', e.message))) sent++;
  }
  return sent;
}

// --- Figures -----------------------------------------------------------------------------------------------------
/** SQL over message_holds `h`: the answer figures (the spec's §10.1). */
const FIGURES = `count(*)::int AS total,
  count(*) FILTER (WHERE h.replied_at IS NOT NULL)::int AS answered,
  count(*) FILTER (WHERE h.status = 'won')::int AS in_time,
  count(*) FILTER (WHERE h.replied_at IS NOT NULL AND h.status <> 'won')::int AS late,
  count(*) FILTER (WHERE h.replied_at IS NULL AND h.status IN ('expired', 'withdrawn'))::int AS unanswered,
  count(*) FILTER (WHERE h.status = 'pending')::int AS waiting,
  count(*) FILTER (WHERE h.replied_at IS NOT NULL AND h.reply_source = 'quick_reply')::int AS quick,
  count(*) FILTER (WHERE h.replied_at IS NOT NULL AND h.reply_source = 'manual')::int AS manual,
  coalesce(sum(h.coins) FILTER (WHERE h.status = 'won'), 0)::bigint AS diamonds,
  count(*) FILTER (WHERE h.status = 'expired')::int AS missed,
  coalesce(sum(h.coins) FILTER (WHERE h.status = 'expired'), 0)::bigint AS missed_diamonds,
  avg(extract(epoch FROM h.replied_at - h.delivered_at)) FILTER (WHERE h.replied_at IS NOT NULL) AS avg_seconds`;

/** A figures row as the API names it. The 5-minute rate is over every eligible message, answered or not (§10.2). */
export const figuresOf = (x) => {
  const total = Number(x?.total ?? 0);
  const inTime = Number(x?.in_time ?? 0);
  return {
    total,
    answered: Number(x?.answered ?? 0),
    inTime,
    late: Number(x?.late ?? 0),
    unanswered: Number(x?.unanswered ?? 0),
    waiting: Number(x?.waiting ?? 0),
    quick: Number(x?.quick ?? 0),
    manual: Number(x?.manual ?? 0),
    diamonds: Number(x?.diamonds ?? 0),
    missed: Number(x?.missed ?? 0),
    missedDiamonds: Number(x?.missed_diamonds ?? 0),
    avgSeconds: x?.avg_seconds === null || x?.avg_seconds === undefined ? null : Math.round(Number(x.avg_seconds)),
    inTimeRate: total ? Math.round((inTime / total) * 1000) / 10 : null,
  };
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/**
 * The period of a report, by Turkey's days: today, 7d, 30d, or custom (from, to: YYYY-MM-DD, at most 92 days).
 * Returns SQL-ready bounds { period, from, to } (to exclusive).
 */
export function periodOf(url) {
  const p = url.searchParams.get('period') ?? '7d';
  const day = (d) => `(('${d}'::date)::timestamp AT TIME ZONE 'Europe/Istanbul')`;
  if (p === 'today') return { period: p, from: DAY_START, to: 'now()', days: 1 };
  if (p === '7d' || p === '30d') {
    const n = p === '7d' ? 7 : 30;
    return { period: p, from: `(${DAY_START} - interval '${n - 1} days')`, to: 'now()', days: n };
  }
  if (p !== 'custom') throw new HttpError(400, 'Geçersiz dönem');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!DAY_RE.test(from ?? '') || !DAY_RE.test(to ?? '') || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) throw new HttpError(400, 'Tarihler YYYY-AA-GG olmalı');
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400e3) + 1;
  if (days < 1 || days > 92) throw new HttpError(400, 'Tarih aralığı 1–92 gün olmalı');
  return { period: p, from: day(from), to: `(${day(to)} + interval '1 day')`, days, range: { from, to } };
}

/** The figures of each earner in `ids` over period `p`: id → figures. */
export async function figuresFor(q, ids, p) {
  if (!ids.length) return new Map();
  const r = await q.query(`SELECT h.earner, ${FIGURES} FROM message_holds h WHERE h.earner = ANY($1::uuid[]) AND h.delivered_at >= ${p.from} AND h.delivered_at < ${p.to} GROUP BY 1`, [ids]);
  return new Map(r.rows.map((x) => [x.earner, figuresOf(x)]));
}

/** One earner's figures day by day (Turkey's days) for the chart. */
async function dailyOf(q, uid, p) {
  const r = await q.query(
    `SELECT to_char((h.delivered_at AT TIME ZONE 'Europe/Istanbul')::date, 'YYYY-MM-DD') AS day, ${FIGURES}
       FROM message_holds h WHERE h.earner = $1 AND h.delivered_at >= ${p.from} AND h.delivered_at < ${p.to} GROUP BY 1 ORDER BY 1`,
    [uid],
  );
  return r.rows.map((x) => ({ day: x.day, ...figuresOf(x) }));
}

// --- Daily work: the message summary and the late-answer warnings ------------------------------------------------
/** Claims `job` for Turkey's yesterday once (several servers or a restart run it once); the day, or null. */
async function claimDay(job) {
  // After 00.10 only: the last holds of the day have settled by then.
  const r = await db.query(
    `WITH d AS (SELECT (${TODAY} - 1) AS day WHERE (now() AT TIME ZONE 'Europe/Istanbul')::time >= time '00:10')
     INSERT INTO auto_chat_jobs (job, last_day) SELECT $1, d.day FROM d
     ON CONFLICT (job) DO UPDATE SET last_day = EXCLUDED.last_day, ran_at = now() WHERE auto_chat_jobs.last_day < EXCLUDED.last_day
     RETURNING to_char(last_day, 'YYYY-MM-DD') AS day`,
    [job],
  );
  return r.rows[0]?.day ?? null;
}

/** Yesterday's summary to every earner who had eligible messages (§16.1). */
export async function messageSummaries(day) {
  const r = await db.query(
    `SELECT h.earner, ${FIGURES} FROM message_holds h
      WHERE h.delivered_at >= ($1::date)::timestamp AT TIME ZONE 'Europe/Istanbul' AND h.delivered_at < ($1::date + 1)::timestamp AT TIME ZONE 'Europe/Istanbul'
      GROUP BY 1`,
    [day],
  );
  for (const x of r.rows) {
    const f = figuresOf(x);
    await systemNotice({
      target: x.earner,
      category: 'message_summary',
      ref: `msgsum:${day}`,
      title: '💎 Mesaj Kazanç Özeti',
      body: [
        `${new Date(`${day}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} günü gelen mesajlara verdiğin cevaplar sonucunda toplam ${fmt(f.diamonds)} elmas kazandın.`,
        `Zamanında cevaplanan mesaj: ${f.inTime}`,
        `Süresi aşılmış mesaj: ${f.late + f.unanswered}`,
        `Ortalama cevap süren: ${f.avgSeconds === null ? '—' : f.avgSeconds < 60 ? `${f.avgSeconds} sn` : `${Math.floor(f.avgSeconds / 60)} dk ${f.avgSeconds % 60} sn`}`,
        'Detaylı performansını Yayıncı Merkezi üzerinden inceleyebilirsin.',
      ].join('\n'),
      data: { day, ...f },
      link: '/yayinci/performans',
    });
  }
  return r.rowCount;
}

export const WARN_FIRST = 'Son mesajlarında yanıt sürenin uzadığını fark ettik. Mesajlara ilk 5 dakika içerisinde cevap vererek elmas kazanma fırsatlarını değerlendirebilirsin.';
export const WARN_AGAIN = 'Mesaj yanıt performansın son dönemde düşüş gösterdi. Gelen mesajlarını daha düzenli kontrol etmeni öneriyoruz. Performans detaylarını Yayıncı Merkezi üzerinden inceleyebilirsin.';

/** The late-answer warnings (§10.3): a streamer under perf_warn_rate over the last days, not warned lately. */
export async function lateWarnings(day) {
  const s = live();
  if (!(s.perfWarnRate > 0)) return 0;
  const r = await db.query(
    `SELECT h.earner, ${FIGURES},
            (SELECT max(n.created_at) FROM team_notices n WHERE n.target = h.earner AND n.category = 'performance') AS warned_at
       FROM message_holds h
      WHERE h.status <> 'pending' AND h.delivered_at > now() - make_interval(days => $1)
      GROUP BY h.earner`,
    [s.perfWarnDays],
  );
  let n = 0;
  for (const x of r.rows) {
    const f = figuresOf(x);
    if (f.total < s.perfWarnMin || f.inTimeRate === null || f.inTimeRate >= s.perfWarnRate) continue;
    const warned = x.warned_at ? Date.parse(x.warned_at) : 0;
    if (warned > Date.now() - s.perfWarnGapDays * 86400e3) continue;
    const again = warned > Date.now() - 14 * 86400e3;
    if (
      await systemNotice({
        target: x.earner,
        category: 'performance',
        ref: `perf:${day}`,
        title: again ? '⚠️ Mesaj yanıt performansın düştü' : '⚠️ Yanıt süren uzadı',
        body: `${again ? WARN_AGAIN : WARN_FIRST}\n\nSon ${s.perfWarnDays} günde 5 dakika içinde cevaplama oranın: %${fmt(f.inTimeRate)} (${f.inTime}/${f.total}).`,
        data: { day, level: again ? 2 : 1, ...f },
        link: '/yayinci/performans',
      })
    )
      n++;
  }
  return n;
}

// --- Sweep -------------------------------------------------------------------------------------------------------
let running = false;
/** One round: automatic messages and conversation starts, and once a day the summaries and warnings. */
export async function runAutoChat() {
  if (running) return null;
  running = true;
  try {
    const batch = Math.max(1, Number(env.AUTO_CHAT_BATCH) || 100);
    const streamer = await streamerRound(batch);
    const opener = await openerRound(batch);
    let summaries = 0;
    let warnings = 0;
    const day = await claimDay('daily');
    if (day) {
      summaries = await messageSummaries(day);
      warnings = await lateWarnings(day);
    }
    return { streamer, opener, summaries, warnings };
  } finally {
    running = false;
  }
}

let timer = null;
export function startAutoChat() {
  if (timer) return;
  const every = Number(env.AUTO_CHAT_SWEEP_MS);
  if (every === 0) return;
  const run = () => runAutoChat().catch((e) => console.error('auto chat', e.message));
  timer = setInterval(run, Number.isFinite(every) && every >= 100 ? every : 60_000);
  timer.unref();
}
export function stopAutoChat() {
  clearInterval(timer);
  timer = null;
}

// --- Routes ------------------------------------------------------------------------------------------------------
async function meState(me) {
  const s = live();
  const tools = await isWomanStreamer(db, me.id);
  const used = await usedToday(db, me.id);
  const p = await privacyOf(db, me.id);
  const man = me.gender === 'Erkek';
  return {
    tools,
    // Mine to see: a man's start, the rights of a woman streamer.
    auto: tools ? { ...right(s.autoDaily, used.auto, !off('streamer')), sending: p.autoSend, done: used.auto >= s.autoDaily ? AUTO_DONE : null } : null,
    quick: tools ? { ...right(s.quickDaily, used.quick, !off('quick')), replies: quickPool().map((text, i) => ({ no: i + 1, text })), done: used.quick >= s.quickDaily ? quickDoneText() : null } : null,
    opener: man ? { ...right(s.openerDaily, used.opener, !off('opener') && s.openerDaily > 0), sending: p.autoOpener, seen: p.autoOpenerSeen } : null,
    receive: p.autoReceive,
    reply: { minutes: s.replyMinutes, graceSeconds: s.replyGraceSeconds },
    resetsAt: resetsAt(),
  };
}

export const autoChatRoutes = {
  async 'GET /api/auto-chat/me'(req) {
    const me = await auth(req);
    return meState(me);
  },

  async 'GET /api/auto-chat/templates'(req) {
    const me = await auth(req);
    await toolsOnly(me);
    const s = live();
    const used = await usedToday(db, me.id);
    return { templates: await templatesOf(db, me.id), limits: { min: s.templateMinChars, max: s.templateMaxChars }, auto: { ...right(s.autoDaily, used.auto, !off('streamer')), resetsAt: resetsAt() } };
  },

  async 'POST /api/auto-chat/templates'(req) {
    const me = await auth(req);
    await toolsOnly(me);
    const b = await readJson(req);
    const no = int(b.no, 1, TEMPLATE_COUNT);
    if (!no) throw new HttpError(400, 'Geçersiz şablon');
    const s = live();
    // The contact filter and the length limits, like any message (§5.4).
    const text = await publicText(b.text, s.templateMinChars, s.templateMaxChars, 'Otomatik mesaj', me, 'auto.template', 'text');
    if (text.includes('\n')) throw new HttpError(400, 'Otomatik mesaj tek satır olmalı');
    await db.query(
      'INSERT INTO auto_templates (user_id, no, body) VALUES ($1, $2, $3) ON CONFLICT (user_id, no) DO UPDATE SET body = EXCLUDED.body, updated_at = now()',
      [me.id, no, text],
    );
    const templates = await templatesOf(db, me.id);
    return { template: templates[no - 1], templates };
  },

  async 'POST /api/auto-chat/templates/reset'(req) {
    const me = await auth(req);
    await toolsOnly(me);
    const no = int((await readJson(req)).no, 1, TEMPLATE_COUNT);
    if (!no) throw new HttpError(400, 'Geçersiz şablon');
    await db.query('DELETE FROM auto_templates WHERE user_id = $1 AND no = $2', [me.id, no]);
    const templates = await templatesOf(db, me.id);
    return { template: templates[no - 1], templates };
  },

  /** Mesaj Performansım (§11.1): my figures in the period, day by day, and today's rights. */
  async 'GET /api/auto-chat/performance'(req, url) {
    const me = await auth(req);
    await toolsOnly(me);
    const p = periodOf(url);
    const stats = (await figuresFor(db, [me.id], p)).get(me.id) ?? figuresOf(null);
    const s = live();
    const used = await usedToday(db, me.id);
    return {
      period: p.period,
      range: p.range ?? null,
      stats,
      days: await dailyOf(db, me.id, p),
      today: { auto: right(s.autoDaily, used.auto, !off('streamer')), quick: right(s.quickDaily, used.quick, !off('quick')) },
      reply: { minutes: s.replyMinutes },
    };
  },

  async 'POST /api/admin/auto-chat/round'(req) {
    const me = await auth(req);
    if (me.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
    const batch = Math.max(1, Number(env.AUTO_CHAT_BATCH) || 100);
    const out = { streamer: await streamerRound(batch), opener: await openerRound(batch) };
    await db.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, NULL, $3, $4)', [me.id, 'auto_chat.round', JSON.stringify({ ...out, ...panelDetail(me) }), clientIp(req)]);
    return out;
  },

  async 'POST /api/admin/auto-chat/daily'(req) {
    const me = await auth(req);
    if (me.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
    const b = await readJson(req);
    if (!DAY_RE.test(b.day ?? '') || Number.isNaN(Date.parse(b.day)) || Date.parse(b.day) > Date.now()) throw new HttpError(400, 'Gün YYYY-AA-GG olmalı ve bugünden ileri olmamalı');
    const summaries = await messageSummaries(b.day);
    const warnings = await lateWarnings(b.day);
    await db.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, NULL, $3, $4)', [me.id, 'auto_chat.daily', JSON.stringify({ day: b.day, summaries, warnings, ...panelDetail(me) }), clientIp(req)]);
    return { day: b.day, summaries, warnings };
  },

  /** The panel's report (§22): the platform's figures, the streamers, agencies, quick replies, automatic sends, pairs to look at. */
  async 'GET /api/admin/auto-chat/report'(req, url) {
    const me = await auth(req);
    if (me.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
    const p = periodOf(url);
    const all = await db.query(`SELECT ${FIGURES} FROM message_holds h WHERE h.delivered_at >= ${p.from} AND h.delivered_at < ${p.to}`);
    const per = await db.query(
      `SELECT h.earner, u.name, u.public_no, ${FIGURES}, (SELECT a.name FROM agency_streamers l JOIN agencies a ON a.id = l.agency_id WHERE l.streamer_id = h.earner AND l.ended_at IS NULL LIMIT 1) AS agency
         FROM message_holds h JOIN users u ON u.id = h.earner
        WHERE h.delivered_at >= ${p.from} AND h.delivered_at < ${p.to} GROUP BY h.earner, u.name, u.public_no ORDER BY count(*) DESC LIMIT 200`,
    );
    const agencies = await db.query(
      `SELECT a.id, a.name, ${FIGURES} FROM message_holds h JOIN agency_streamers l ON l.streamer_id = h.earner AND l.ended_at IS NULL JOIN agencies a ON a.id = l.agency_id
        WHERE h.delivered_at >= ${p.from} AND h.delivered_at < ${p.to} GROUP BY a.id, a.name ORDER BY count(*) DESC LIMIT 100`,
    );
    const sends = await db.query(
      `SELECT kind, count(*)::int AS sent, count(*) FILTER (WHERE replied_at IS NOT NULL)::int AS replied FROM auto_sends WHERE created_at >= ${p.from} AND created_at < ${p.to} GROUP BY 1`,
    );
    const quick = await db.query(
      `SELECT count(*)::int AS sent, count(DISTINCT sender)::int AS people FROM messages WHERE source = 'quick_reply' AND created_at >= ${p.from} AND created_at < ${p.to}`,
    );
    // Pairs to look at: the same payer and streamer earning most from each other (a loop of paid messages and answers).
    const pairs = await db.query(
      `SELECT h.payer, a.name AS payer_name, h.earner, b.name AS earner_name, count(*)::int AS messages, sum(h.coins)::bigint AS diamonds
         FROM message_holds h JOIN users a ON a.id = h.payer JOIN users b ON b.id = h.earner
        WHERE h.status = 'won' AND h.delivered_at >= ${p.from} AND h.delivered_at < ${p.to}
        GROUP BY 1, 2, 3, 4 ORDER BY sum(h.coins) DESC LIMIT 20`,
    );
    const kinds = Object.fromEntries(sends.rows.map((x) => [x.kind, { sent: x.sent, replied: x.replied }]));
    return {
      period: p.period,
      range: p.range ?? null,
      stats: figuresOf(all.rows[0]),
      streamers: per.rows.map((x) => ({ id: x.earner, name: x.name, publicNo: x.public_no === null ? null : String(x.public_no), agency: x.agency ?? null, ...figuresOf(x) })),
      agencies: agencies.rows.map((x) => ({ id: x.id, name: x.name, ...figuresOf(x) })),
      auto: { streamer: kinds.streamer ?? { sent: 0, replied: 0 }, opener: kinds.opener ?? { sent: 0, replied: 0 } },
      quick: quick.rows[0],
      pairs: pairs.rows.map((x) => ({ payer: { id: x.payer, name: x.payer_name }, earner: { id: x.earner, name: x.earner_name }, messages: x.messages, diamonds: Number(x.diamonds) })),
    };
  },
};

/** For the agency's report (agency.mjs): the figures of the agency's own streamers in the period. */
export async function agencyMessagePerformance(q, agencyId, p) {
  const r = await q.query(
    `SELECT u.id, u.name, u.public_no, u.avatar_url, ${onlineSql('u.id', '15')} AS online
       FROM agency_streamers l JOIN users u ON u.id = l.streamer_id
      WHERE l.agency_id = $1 AND l.ended_at IS NULL AND u.deleted_at IS NULL ORDER BY u.name LIMIT 500`,
    [agencyId],
  );
  const ids = r.rows.map((x) => x.id);
  const figs = await figuresFor(q, ids, p);
  const used = await q.query(`SELECT user_id, kind, used FROM auto_quota WHERE user_id = ANY($1::uuid[]) AND day = ${TODAY}`, [ids]);
  const quota = new Map();
  for (const x of used.rows) quota.set(x.user_id, { ...(quota.get(x.user_id) ?? {}), [x.kind]: x.used });
  const s = live();
  const streamers = r.rows.map((x) => ({
    id: x.id,
    name: x.name,
    publicNo: x.public_no === null ? null : String(x.public_no),
    avatarUrl: x.avatar_url ?? null,
    online: x.online,
    ...(figs.get(x.id) ?? figuresOf(null)),
    quickToday: { used: quota.get(x.id)?.quick ?? 0, total: s.quickDaily },
    autoToday: { used: quota.get(x.id)?.auto ?? 0, total: s.autoDaily },
  }));
  const all = await q.query(`SELECT ${FIGURES} FROM message_holds h WHERE h.earner = ANY($1::uuid[]) AND h.delivered_at >= ${p.from} AND h.delivered_at < ${p.to}`, [ids]);
  // The previous period of the same length, for the change.
  const prev = await q.query(
    `SELECT ${FIGURES} FROM message_holds h WHERE h.earner = ANY($1::uuid[]) AND h.delivered_at >= ${p.from} - make_interval(days => $2) AND h.delivered_at < ${p.from}`,
    [ids, p.days],
  );
  const ranked = streamers.filter((x) => x.total > 0);
  return {
    streamers,
    totals: figuresOf(all.rows[0]),
    previous: figuresOf(prev.rows[0]),
    fastest: [...ranked].filter((x) => x.avgSeconds !== null).sort((a, b) => a.avgSeconds - b.avgSeconds).slice(0, 5).map((x) => ({ id: x.id, name: x.name, avgSeconds: x.avgSeconds, inTimeRate: x.inTimeRate })),
    lowest: [...ranked].sort((a, b) => (a.inTimeRate ?? 0) - (b.inTimeRate ?? 0)).slice(0, 5).map((x) => ({ id: x.id, name: x.name, inTimeRate: x.inTimeRate, total: x.total })),
  };
}
