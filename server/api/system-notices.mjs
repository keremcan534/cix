// SimilarClub Sistem (docs/OTOMATIK_MESAJ.md §Sistem sohbeti): the official, one-way chat that tells each person of
// their account's earnings, rewards and warnings. It is Similar Ekibi grown up (team.mjs, Mesajlar): the same table
// and the same read marks, so an older APK shows these notices too, as Similar Ekibi cards (kind reward, event or
// notice). Nobody can write to it: only the server's own code calls systemNotice.
//
//   GET /api/admin/system-notices?days=   (admin) → { categories, failures }   sent and failed per category
//
// A notice tells of a record that is already committed (a call's paid minutes, a reward's grant, a day's message
// holds): it is written after the money moved, never before, and its ref (once per person) means a retry or a second
// server never writes it twice. Writing it can never undo or repeat the record: a failure is only recorded
// (system_notice_failures) for the panel. Each category can be switched off (Canlı ayarlar system_notices_off).
// A woman streamer's notices carry her earnings in detail; the person who paid sees only their own amount, never what
// the other one earned.
import { HttpError, auth, db, env } from './core.mjs';
import { NOTICE_CATEGORIES, NOTICE_LABEL } from './auto-chat-rules.mjs';
import { live } from './live-settings.mjs';
import { notify } from './push.mjs';

export const SYSTEM_NAME = 'SimilarClub Sistem';
/** The Similar Ekibi kind an older APK draws each category with (its icon and label). */
const KIND = { event_reward: 'event', performance: 'notice', quota: 'notice', bond: 'notice' };
/** Categories that also ring the phone; the rest only wait in the chat. */
const PUSH = new Set(['voice_call', 'video_call', 'message_reward', 'pk', 'rocket', 'event_reward', 'bag_gift', 'bonus', 'performance']);

const fmt = (n) => Number(n).toLocaleString('tr-TR');
/** "4 dk 05 sn", "45 sn", "1 sa 02 dk". */
export function durationText(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h} sa ${String(m).padStart(2, '0')} dk`;
  if (m) return `${m} dk ${String(r).padStart(2, '0')} sn`;
  return `${r} sn`;
}
const clock = (t) => new Date(t).toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
const dayText = (t) => new Date(t).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric' });

async function failed(category, target, ref, e) {
  console.error('system notice', category, ref, e?.message ?? e);
  await db.query('INSERT INTO system_notice_failures (category, target, ref, error) VALUES ($1, $2, $3, $4)', [category, target ?? null, ref ?? null, String(e?.message ?? e).slice(0, 500)]).catch(() => {});
}

/**
 * One person's notice, once per `ref` (after the record it tells of is committed). Resolves true when it was
 * written now, false when it was already there, switched off or failed; never throws.
 */
export async function systemNotice({ target, category, title, body, data = {}, ref, link = null, push = PUSH.has(category) }) {
  try {
    if (!NOTICE_CATEGORIES.includes(category)) throw new Error(`unknown category ${category}`);
    if (!target || !ref) throw new Error('target and ref are needed');
    if (live().systemNoticesOff.has(category)) return false;
    const r = await db.query(
      `INSERT INTO team_notices (kind, title, body, link, target, category, ref, data)
       SELECT $1, $2, $3, $4, u.id, $5, $6, $7 FROM users u WHERE u.id = $8 AND u.deleted_at IS NULL
       ON CONFLICT (target, ref) WHERE ref IS NOT NULL DO NOTHING RETURNING id`,
      [KIND[category] ?? 'reward', String(title).slice(0, 80), String(body ?? '').slice(0, 1000), link, category, String(ref).slice(0, 120), JSON.stringify(data), target],
    );
    if (r.rowCount && push) notify([target], { title: SYSTEM_NAME, body: String(title).slice(0, 80), data: { type: 'team', category } });
    return r.rowCount > 0;
  } catch (e) {
    await failed(category, target, ref, e);
    return false;
  }
}

/** The same notice to several people (each with their own ref, `refOf(id)`). */
export async function systemNotices(ids, make) {
  for (const id of ids) await systemNotice({ target: id, ...make(id) });
}

// --- Rewards -----------------------------------------------------------------------------------------------------
/** How a reward's kind is named (economy.mjs REWARD_KIND_NAME, with the shop's other kinds). */
const ITEM_KIND = { frame: 'Profil çerçevesi', entry: 'VIP giriş efekti', ride: 'Binek', bubble: 'Sohbet balonu', wave: 'Ses dalgası', micfx: 'Mikrofon efekti', sticker: 'Emoji ve çıkartma paketi', noble: 'Rütbe', special_id: 'Özel kimlik', seat: 'Koltuk rengi' };
export const itemKindName = (kind) => ITEM_KIND[kind] ?? 'Dijital ödül';
/** "30 gün (son gün 18 Aralık 2026)" or "Süresiz". */
export const termText = (days) => (days ? `${days} gün (son gün ${dayText(Date.now() + days * 86400e3)})` : 'Süresiz');

/**
 * An item that reached someone's Çantam (an event's reward, a level's, the staff's gift, a rocket's): its name, kind
 * and term, and where to find it. `streamer`: a woman streamer's fuller text (the spec's §19.4).
 */
export function itemNotice({ target, category = 'bag_gift', ref, item, days, origin, why, streamer = false, push }) {
  const kind = itemKindName(item.kind);
  return systemNotice({
    target,
    category,
    ref,
    push,
    title: category === 'event_reward' ? (streamer ? '🏆 Etkinlik Başarın ve Ödülün' : '🎁 Tebrikler! Etkinlik Ödülü Kazandın') : '🎁 Çantana yeni bir ödül geldi',
    body: [
      why ?? `${origin ? `${origin} kapsamında ` : ''}${item.name} kazandın!`,
      'Ödülün Çantam bölümüne eklendi.',
      `Ödül türü: ${kind}`,
      `Kullanım süresi: ${termText(days)}`,
      'Çantam bölümünden ödülünü görüntüleyebilir ve kullanmaya başlayabilirsin.',
    ].join('\n'),
    data: { sku: item.sku, name: item.name, kind: item.kind, kindName: kind, days: days ?? null, origin: origin ?? null, status: 'done' },
    link: '/canta',
  });
}

/** A bonus (coins or a bag gift) someone got: `what` says it ("25 ödül jetonu"), `origin` from where. */
export const bonusNotice = ({ target, ref, origin, what, detail = [], data = {}, link = '/cuzdan', push }) =>
  systemNotice({
    target,
    category: 'bonus',
    ref,
    push,
    title: '🎁 Bonus Kazandın',
    body: ['Tebrikler!', `${origin} kapsamında ${what} hesabına eklendi.`, ...detail, 'Detaylarını ilgili bölümden inceleyebilirsin.'].join('\n'),
    data: { origin, what, status: 'done', ...data },
    link,
  });

// --- Calls -------------------------------------------------------------------------------------------------------
const MODE = { voice: { word: 'sesli', title: 'Sesli', icon: '📞' }, video: { word: 'görüntülü', title: 'Görüntülü', icon: '📹' } };

/**
 * The notices of the calls that ended with paid minutes: to whoever earned, the diamonds (paid_events: what the
 * ledger holds, money-check.mjs `paid`); to whoever paid, their amount only. A call with no paid minute, or whose
 * minutes nobody earned, tells only what really happened. Sent first, then marked (notice_at), so a crash in between
 * sends nothing twice (the refs) and loses nothing.
 */
export async function sweepCallNotices() {
  const r = await db.query(
    `SELECT k.id, k.kind, k.mode, k.caller, k.callee, k.payer, k.earner, k.started_at, k.ended_at, k.minutes, k.price,
            a.name AS caller_name, b.name AS callee_name,
            (SELECT coalesce(sum(p.coins), 0) FROM paid_events p WHERE p.call_id = k.id) AS paid,
            (SELECT coalesce(sum(p.coins), 0) FROM paid_events p WHERE p.call_id = k.id AND p.earner IS NOT NULL) AS earned
       FROM calls k JOIN users a ON a.id = k.caller JOIN users b ON b.id = k.callee
      WHERE k.notice_at IS NULL AND k.status = 'ended' ORDER BY k.ended_at LIMIT 100`,
  );
  for (const k of r.rows) {
    const m = MODE[k.mode] ?? MODE.voice;
    const seconds = k.started_at && k.ended_at ? (Date.parse(k.ended_at) - Date.parse(k.started_at)) / 1000 : 0;
    const nameOf = (uid) => (uid === k.caller ? k.callee_name : k.caller_name);
    const what = k.kind === 'match' ? 'Hemen Tanış görüşmesi' : `${m.word} görüşme`;
    const base = { callId: Number(k.id), kind: k.kind, mode: k.mode, date: dayText(k.started_at ?? k.ended_at), startedAt: k.started_at, endedAt: k.ended_at, seconds: Math.round(seconds), minutes: k.minutes, price: k.price, ref: `call:${k.id}` };
    const earned = Number(k.earned);
    const paid = Number(k.paid);
    if (k.earner && earned > 0) {
      await systemNotice({
        target: k.earner,
        category: k.mode === 'video' ? 'video_call' : 'voice_call',
        ref: `call:${k.id}:earn`,
        title: `${m.icon} ${m.title} Arama Kazancı`,
        body: [
          `${nameOf(k.earner)} ile gerçekleştirdiğin ${what} tamamlandı.`,
          `Görüşme süresi: ${durationText(seconds)} (${clock(k.started_at)}–${clock(k.ended_at)})`,
          `Ücretlendirilen süre: ${k.minutes} dakika`,
          `Kazandığın elmas: 💎 ${fmt(earned)}`,
          k.mode === 'video' ? 'Görüntülü görüşme kazancın elmas bakiyene yansıtıldı.' : 'Kazancın hesabına başarıyla aktarıldı.',
          `İşlem no: call:${k.id}`,
        ].join('\n'),
        data: { ...base, other: { id: k.earner === k.caller ? k.callee : k.caller, name: nameOf(k.earner) }, diamonds: earned, bonus: 0, total: earned, status: 'done' },
        link: '/gelir',
      });
    }
    if (k.payer && paid > 0) {
      await systemNotice({
        target: k.payer,
        category: 'call_paid',
        ref: `call:${k.id}:paid`,
        title: `${m.icon} ${m.title} Görüşme Tamamlandı`,
        body: [
          `${nameOf(k.payer)} ile ${what === 'Hemen Tanış görüşmesi' ? 'Hemen Tanış görüşmen' : `${m.word} görüşmen`} tamamlandı.`,
          `Görüşme süresi: ${durationText(seconds)}`,
          `İşlem tutarı: ${fmt(paid)} jeton (${k.minutes} dakika)`,
          'Görüşme detaylarını işlem geçmişinden inceleyebilirsin.',
        ].join('\n'),
        data: { ...base, other: { id: k.payer === k.caller ? k.callee : k.caller, name: nameOf(k.payer) }, coins: paid, status: 'done' },
        link: '/cuzdan',
      });
    }
    await db.query('UPDATE calls SET notice_at = now() WHERE id = $1', [k.id]);
  }
  return r.rowCount;
}

// --- PK ----------------------------------------------------------------------------------------------------------
/**
 * The result of each Oda içi PK whose time is up (pk.mjs), to everyone who competed: their place or their team's,
 * and their points. PK points move no money and the server gives no PK reward, so no reward or diamonds are claimed
 * (the spec, §17.2). A cancelled PK tells nothing. Sent first, then marked, like the calls.
 */
export async function sweepPkNotices() {
  const r = await db.query(
    `SELECT p.id, p.mode, p.status, p.participants, p.red, p.blue, p.end_at, r.title AS room_title,
            coalesce((SELECT json_object_agg(g.recipient, g.points) FROM (SELECT recipient, sum(points)::bigint AS points FROM room_pk_gifts WHERE pk_id = p.id GROUP BY 1) g), '{}') AS points
       FROM room_pks p JOIN rooms r ON r.id = p.room_id
      WHERE p.notice_at IS NULL AND p.end_at <= now() - interval '5 seconds' ORDER BY p.end_at LIMIT 50`,
  );
  for (const p of r.rows) {
    if (p.status !== 'cancelled') {
      const pts = (u) => Number(p.points[u] ?? 0);
      const name = `“${p.room_title}” odasında ${p.mode === 'team' ? 'Takım PK' : 'PK'}`;
      if (p.mode === 'team') {
        const red = p.red.reduce((n, u) => n + pts(u), 0);
        const blue = p.blue.reduce((n, u) => n + pts(u), 0);
        for (const u of [...p.red, ...p.blue]) {
          const isRed = p.red.includes(u);
          const a = isRed ? red : blue;
          const b = isRed ? blue : red;
          const result = a > b ? 'Takımın kazandı 🎉' : a < b ? 'Takımın kaybetti' : 'Berabere';
          await systemNotice({
            target: u,
            category: 'pk',
            ref: `pk:${p.id}`,
            title: '🏆 PK Sonucu',
            body: [`Katıldığın PK karşılaşması tamamlandı.`, `Karşılaşma: ${name}`, `Sonuç: ${result} (${isRed ? 'Kırmızı' : 'Mavi'} ${fmt(a)} – ${fmt(b)})`, `Senin puanın: ${fmt(pts(u))}`].join('\n'),
            data: { pk: Number(p.id), mode: p.mode, team: isRed ? 'red' : 'blue', result: a > b ? 'win' : a < b ? 'lose' : 'draw', points: pts(u), score: [a, b], reward: null },
          });
        }
      } else {
        const order = [...p.participants].sort((x, y) => pts(y) - pts(x));
        for (const u of p.participants) {
          const place = order.filter((x) => pts(x) > pts(u)).length + 1;
          const top = pts(order[0]);
          const result = pts(u) === top && top > 0 ? (order.filter((x) => pts(x) === top).length > 1 ? 'Berabere birinci' : 'Birinci oldun 🎉') : `${place}. oldun`;
          await systemNotice({
            target: u,
            category: 'pk',
            ref: `pk:${p.id}`,
            title: '🏆 PK Sonucu',
            body: [`Katıldığın PK karşılaşması tamamlandı.`, `Karşılaşma: ${name}`, `Sonuç: ${result} (${p.participants.length} kişi)`, `Senin puanın: ${fmt(pts(u))}`].join('\n'),
            data: { pk: Number(p.id), mode: p.mode, place, of: p.participants.length, points: pts(u), reward: null },
          });
        }
      }
    }
    await db.query('UPDATE room_pks SET notice_at = now() WHERE id = $1', [p.id]);
  }
  return r.rowCount;
}

// --- Admin -------------------------------------------------------------------------------------------------------
export const systemNoticeRoutes = {
  /** Per category: how many went out and how many failed in the last `days` (1-90), and the latest failures. */
  async 'GET /api/admin/system-notices'(req, url) {
    const me = await auth(req);
    if (me.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') ?? 7) || 7));
    const sent = await db.query("SELECT category, count(*)::int AS n, count(DISTINCT target)::int AS people FROM team_notices WHERE category IS NOT NULL AND created_at > now() - make_interval(days => $1) GROUP BY 1", [days]);
    const bad = await db.query('SELECT category, count(*)::int AS n FROM system_notice_failures WHERE created_at > now() - make_interval(days => $1) GROUP BY 1', [days]);
    const last = await db.query('SELECT id, category, target, ref, error, created_at FROM system_notice_failures ORDER BY id DESC LIMIT 50');
    const off = live().systemNoticesOff;
    const by = (rows) => new Map(rows.map((x) => [x.category, x]));
    const s = by(sent.rows);
    const f = by(bad.rows);
    return {
      days,
      categories: NOTICE_CATEGORIES.map((c) => ({ category: c, label: NOTICE_LABEL[c], on: !off.has(c), sent: s.get(c)?.n ?? 0, people: s.get(c)?.people ?? 0, failed: f.get(c)?.n ?? 0 })),
      failures: last.rows.map((x) => ({ id: Number(x.id), category: x.category, target: x.target, ref: x.ref, error: x.error, at: x.created_at })),
    };
  },
};

let timer = null;
export function startCallNoticeSweep() {
  if (timer) return;
  const run = async () => {
    await sweepCallNotices().catch((e) => console.error('call notice sweep', e.message));
    await sweepPkNotices().catch((e) => console.error('pk notice sweep', e.message));
  };
  const every = Number(env.CALL_NOTICE_SWEEP_MS);
  timer = setInterval(run, Number.isFinite(every) && every >= 100 ? every : 10_000);
  timer.unref();
}
export function stopCallNoticeSweep() {
  clearInterval(timer);
  timer = null;
}
