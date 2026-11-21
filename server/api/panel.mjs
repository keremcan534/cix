// Finance Control (the finance panel at panel.<domain>, repo similarclup-finance-control) acting on this API: its
// Uygulama pages (Hediyeler, …) call the admin routes listed in PANEL_ROUTES from its own server, never from a
// browser. Three locks, all here:
//   - the key: X-Panel-Key must equal PANEL_API_KEY (.env, made on the server by the deploy, server.yml; the panel
//     gets it through compose.yaml as FC_APP_API_KEY). No key set: the header opens nothing.
//   - the way in: only a call made on this machine straight to the API. Caddy adds X-Forwarded-For to everything it
//     forwards (and strips X-Panel-Key and X-Panel-User from outside requests), so a forwarded request with the
//     header is refused.
//   - the list: a route not in PANEL_ROUTES is refused with the key, whatever it is.
// Finance Control decides which of its users may use which page (its own roles); X-Panel-User names that person
// (base64url JSON { id, email, name, role, perms? }: perms, their app.* permissions there, set what a page whose
// rules go finer than the page does (sanctions.mjs permsOf: a moderator's sanctions or an admin's)). On this side each panel user acts as an account of their own
// (panelActorId: role admin, never a person in any list, push or ranking, can't sign in, made the first time they
// act), so every route checks and records as for an admin, and the rules that need two different people (a
// proposed sanction's approver, a payout's second person, nobody deciding their own) tell panel users apart. Every
// panel request that changes something (and every refusal) is an audit_events row 'panel.request' naming them.
import { HttpError, db, env, same } from './core.mjs';

/**
 * The Finance Control account (067_panel_actor.sql): role admin, never a person, can't sign in. Panel requests made
 * before each panel user had an account of their own name it; it still answers for a panel user whose account
 * couldn't be made.
 */
export const PANEL_ACTOR = 'fc000000-0000-4000-8000-000000000001';
/** The account panel user `id` acts as here: fixed by their id, beside PANEL_ACTOR's. */
export const panelActorId = (id) => `fc000000-0000-4000-8001-${String(id).padStart(12, '0')}`;
const KEY = String(env.PANEL_API_KEY ?? '').trim();
/** A key shorter than this is treated as none (a typo must not open the admin routes). */
const KEY_MIN = 32;
export const panelOn = () => KEY.length >= KEY_MIN;

/** What Finance Control may call: `METHOD path`. */
export const PANEL_ROUTES = new Set([
  // Otomatik mesaj ve SimilarClub Sistem (auto-chat.mjs, system-notices.mjs): the report, a day's summaries and
  // warnings run again, and the notices sent and failed per category. The numbers and texts are Canlı ayarlar.
  'GET /api/admin/auto-chat/report',
  'POST /api/admin/auto-chat/daily',
  'POST /api/admin/auto-chat/round',
  'GET /api/admin/system-notices',
  // Hediyeler (custom-gifts.mjs: the admins' and the app's own) and its uploads (media.mjs kinds gifticon, giftvideo,
  // giftsource).
  'GET /api/admin/gifts',
  'POST /api/admin/gifts',
  'POST /api/admin/gifts/update',
  'POST /api/admin/gifts/reset',
  'POST /api/admin/gifts/delete',
  'POST /api/admin/gifts/order',
  'POST /api/admin/gifts/fetch',
  'POST /api/media/upload-url',
  // Emojiler (emoji.mjs): the emoji panel's packs and stickers, the app's and the admins' own (upload kind stickerart).
  'GET /api/admin/emoji',
  'POST /api/admin/emoji/packs',
  'POST /api/admin/emoji/packs/update',
  'POST /api/admin/emoji/packs/reset',
  'POST /api/admin/emoji/packs/delete',
  'POST /api/admin/emoji/packs/order',
  'POST /api/admin/emoji/stickers',
  'POST /api/admin/emoji/stickers/update',
  'POST /api/admin/emoji/stickers/reset',
  'POST /api/admin/emoji/stickers/delete',
  'POST /api/admin/emoji/stickers/order',
  'POST /api/admin/emoji/fetch',
  // Seviyeler (levels-admin.mjs): VIP, Rütbe, Cömertlik, Yankı and Abonelik settings, the change preview, level drops.
  'GET /api/admin/levels',
  'POST /api/admin/levels/preview',
  'POST /api/admin/levels/save',
  'POST /api/admin/levels/reset',
  'GET /api/admin/levels/drops',
  // Seviye ve görev ödülleri (level-rewards.mjs, task-rewards.mjs): an item for a level of VIP, Cömertlik or Yankı, or
  // for a task.
  'GET /api/admin/level-rewards',
  'POST /api/admin/level-rewards',
  'POST /api/admin/level-rewards/delete',
  'GET /api/admin/task-rewards',
  'POST /api/admin/task-rewards',
  'POST /api/admin/task-rewards/delete',
  // Mağaza (shop-items.mjs): frames and entry effects, the app's own and the admins' (uploads shopframe, giftvideo,
  // giftsource).
  'GET /api/admin/shop',
  'POST /api/admin/shop',
  'POST /api/admin/shop/update',
  'POST /api/admin/shop/reset',
  'POST /api/admin/shop/delete',
  'POST /api/admin/shop/order',
  'POST /api/admin/shop/frame-svga',
  // Para çekme (withdraw.mjs).
  'GET /api/admin/withdrawals',
  'POST /api/admin/withdrawals/decide',
  // Ajans ödemeleri (agency-admin.mjs) and the payout policy they follow.
  'GET /api/admin/agency/payouts',
  'POST /api/admin/agency/payouts/decide',
  'GET /api/admin/agency/settings',
  // İadeler and the wallet audit (refunds.mjs, jeton.mjs).
  'GET /api/admin/purchases',
  'POST /api/admin/purchases/refund',
  'POST /api/admin/purchases/voided-sync',
  'GET /api/admin/wallet/audit',
  // Şanslı hediyeler (lucky.mjs).
  'GET /api/admin/lucky',
  // Oda roketi (room-rocket.mjs): the levels' goals and prizes.
  'GET /api/admin/rocket',
  'POST /api/admin/rocket/config',
  'POST /api/admin/rocket/video',
  'POST /api/admin/lucky/config',
  // A Şanslı package's icon and video (lucky-art.mjs), a link fetched for them; uploads as a gift's (gifticon, giftvideo, giftsource).
  'POST /api/admin/lucky/art',
  'POST /api/admin/lucky/art/remove',
  'POST /api/admin/lucky/fetch',
  // Canlı ayarlar (live-settings.mjs).
  'GET /api/admin/live-settings',
  'POST /api/admin/live-settings',
  'GET /api/admin/live-settings/history',
  'POST /api/admin/live-settings/rollback',
  // Reports and the server's state: Oyun Salonu (casino.mjs), the warnings (alerts.mjs), the sending to this panel.
  'GET /api/admin/casino/report',
  'GET /api/admin/alerts',
  'GET /api/admin/money-check',
  'GET /api/admin/finance-sync',
  // Kullanıcılar (admin.mjs, referrals.mjs): search, ban and lifting it, room level, deleting, an invite's coins back.
  'GET /api/admin/users',
  // An account by the person's own number, for every field of the panel that takes an account (public-no.mjs).
  'GET /api/admin/lookup',
  'POST /api/admin/users/delete',
  'POST /api/admin/users/room-level',
  // Profil izleri (profile-marks.mjs): a person's marks, and taking the ones showing off (an offensive one, a complaint).
  'GET /api/admin/marks',
  'POST /api/admin/marks/clear',
  // Muzip hediyeler's İz türleri (mark-kinds.mjs): the kinds of mark, their overlay (upload kind markart), minutes, on/off.
  'GET /api/admin/mark-kinds',
  'POST /api/admin/mark-kinds',
  'POST /api/admin/mark-kinds/update',
  'POST /api/admin/mark-kinds/delete',
  // Bağ işaretleri (bond-looks.mjs): each bond kind's mark level by level (uploads shopframe, giftsource for an SVGA).
  'GET /api/admin/bond-looks',
  'POST /api/admin/bond-looks/save',
  'POST /api/admin/bond-looks/clear',
  'POST /api/admin/bond-looks/svga',
  'POST /api/admin/ban',
  'POST /api/admin/referrals/revoke',
  // Şikâyetler (admin.mjs) and a reported room's own pictures (room-decor.mjs).
  'GET /api/admin/reports',
  'POST /api/admin/reports/handle',
  'GET /api/admin/rooms/background',
  'POST /api/admin/rooms/background/remove',
  'POST /api/admin/rooms/cover/remove',
  // Destek (support.mjs).
  'GET /api/admin/support',
  'GET /api/admin/support/ticket',
  'POST /api/admin/support/reply',
  'POST /api/admin/support/status',
  // Duyurular (team.mjs; a notice's picture is a 'notice' upload).
  'GET /api/admin/team',
  'POST /api/admin/team',
  'POST /api/admin/team/remove',
  // Etkinlikler (events.mjs).
  'GET /api/admin/events',
  'POST /api/admin/events/review',
  'POST /api/admin/events/remove',
  'POST /api/admin/events/reward',
  'GET /api/admin/events/categories',
  'POST /api/admin/events/categories',
  'POST /api/admin/events/categories/remove',
  'GET /api/admin/events/report',
  // Ajans merkezi (agency-admin.mjs): the network's tree and list, applications, status, rate, tier, parent, a
  // streamer's agency, transfers and transition commission, performance runs, reports, the commission simulator.
  'GET /api/admin/agency/tree',
  // The finance panel's Ajans / BD / Yayıncı lists come from here (read only).
  'GET /api/admin/agency/finance-roster',
  'GET /api/admin/agency/overview',
  'GET /api/admin/agency/list',
  'POST /api/admin/agency/create',
  'POST /api/admin/agency/decide',
  'POST /api/admin/agency/status',
  'POST /api/admin/agency/rate',
  'POST /api/admin/agency/tier',
  'POST /api/admin/agency/parent',
  'POST /api/admin/agency/assign',
  'GET /api/admin/agency/performance',
  'POST /api/admin/agency/performance/run',
  'GET /api/admin/agency/transfers',
  'POST /api/admin/agency/transfers/decide',
  'POST /api/admin/agency/transition',
  'GET /api/admin/agency/audit',
  'POST /api/admin/agency/simulate',
  'GET /api/admin/agency/report',
  'GET /api/admin/agency/bd-report',
  // The commission ledger and the network's rules: a recalculation, a manual income, a reversal, an adjustment,
  // closing a period, a setting.
  'POST /api/admin/agency/commissions/run',
  'POST /api/admin/agency/income',
  'POST /api/admin/agency/commissions/reverse',
  'POST /api/admin/agency/adjust',
  'POST /api/admin/agency/periods/close',
  'POST /api/admin/agency/settings',
  // The agency centre's staff (roles and who holds them), BD assignment, operations score, violations and their
  // appeals, and the network's background jobs run now.
  'GET /api/admin/agency/roles',
  'POST /api/admin/agency/roles',
  'GET /api/admin/agency/staff',
  'POST /api/admin/agency/staff/set',
  'POST /api/admin/agency/staff/remove',
  'POST /api/admin/agency/bd',
  'POST /api/admin/agency/ops-score',
  'POST /api/admin/agency/violation',
  'GET /api/admin/agency/appeals',
  'POST /api/admin/agency/appeals/decide',
  'POST /api/admin/agency/jobs/run',
  // Yaptırımlar (sanctions.mjs): the sanctions screen's meta, search, a person's record, the proposals waiting for a
  // second person, applying, lifting, approving, evidence; appeals; the automatic policies, who may do what, a
  // device's risk.
  'GET /api/admin/sanctions/meta',
  'GET /api/admin/sanctions/search',
  'GET /api/admin/sanctions/user',
  'GET /api/admin/sanctions/pending',
  'POST /api/admin/sanctions',
  'POST /api/admin/sanctions/lift',
  'POST /api/admin/sanctions/approve',
  'POST /api/admin/sanctions/evidence',
  'GET /api/admin/appeals',
  'POST /api/admin/appeals/decide',
  'POST /api/admin/sanction-policies',
  'GET /api/admin/sanction-permissions',
  'POST /api/admin/sanction-permissions',
  'POST /api/admin/devices/risk',
  // A person's shop items (economy.mjs): what they own, giving an item, taking one back, the items a refund left to
  // review.
  'GET /api/admin/economy/user',
  'POST /api/admin/economy/grant',
  'POST /api/admin/economy/revoke',
  'GET /api/admin/economy/reviews',
  // Jeton Noktası (jeton.mjs): turning an account into a bank or back, selling a bank its stock.
  'POST /api/admin/jeton/bank',
  'POST /api/admin/jeton/wholesale',
  // Yönetim jeton yüklemesi: management's loads to people and taking a wrong one back (the panel's Süper yönetici).
  'GET /api/admin/jeton/loads',
  'POST /api/admin/jeton/load',
  'POST /api/admin/jeton/reverse',
]);

const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '');

/**
 * The panel user a request acts for: null without X-Panel-Key; a 401 for a wrong key (or none configured), a 403
 * for a forwarded request or a route not on the list, a 400 without a readable X-Panel-User.
 */
export function panelOf(req, method, path) {
  const key = req.headers['x-panel-key'];
  if (key === undefined) return null;
  if (!panelOn() || typeof key !== 'string' || !same(key, KEY)) throw new HttpError(401, 'Panel anahtarı geçersiz');
  if (req.headers['x-forwarded-for'] !== undefined) throw new HttpError(403, 'Panel anahtarı yalnız sunucunun kendi içinden kullanılır');
  if (!PANEL_ROUTES.has(`${method} ${path}`)) throw new HttpError(403, 'Bu işlem finans panelinden yapılamaz');
  let who = null;
  try {
    const raw = req.headers['x-panel-user'];
    who = typeof raw === 'string' ? JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) : null;
  } catch {}
  const id = Number(who?.id);
  if (!Number.isSafeInteger(id) || id < 1 || id > 999_999_999_999 || !clean(who?.email, 200)) throw new HttpError(400, 'Panel kullanıcısı eksik');
  const perms = Array.isArray(who.perms) ? [...new Set(who.perms.filter((p) => typeof p === 'string' && /^app\.[a-z_]{1,40}$/.test(p)))].slice(0, 64) : undefined;
  return { id, email: clean(who.email, 200), name: clean(who.name, 80) || clean(who.email, 200), role: clean(who.role, 40), ...(perms && { perms }) };
}

const actors = new Map();
/**
 * The panel user's own account as auth() hands it to a route. Made (or renamed) only when it isn't known yet or
 * their name changed in the panel: like PANEL_ACTOR, deleted_at keeps it out of every list, ranking and push.
 */
export async function panelUser(panel) {
  const id = panelActorId(panel.id);
  // Names show in pushes and lists (live settings: "… değişti: <name>"): who in the panel did it.
  const name = `Finance Control · ${panel.name}`.slice(0, 80);
  let row = actors.get(id);
  if (!row || row.name !== name) {
    row = (
      await db.query(
        `INSERT INTO users (id, name, role, deleted_at) VALUES ($1, $2, 'admin', now())
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = 'admin', deleted_at = coalesce(users.deleted_at, now()) RETURNING *`,
        [id, name],
      )
    ).rows[0];
    actors.set(id, row);
  }
  return { ...row, role: 'admin', name, session_scope: 'full', panel };
}

/** What an audit row says about a panel action (custom-gifts.mjs adds it to its own rows). */
export const panelDetail = (u) => (u?.panel ? { panelUser: u.panel } : {});

/**
 * Every panel request that changes something, and every refusal: one audit_events row with the panel user, written
 * before the answer goes out (so the panel's next read finds it). Never fails the request.
 */
export async function auditPanel(panel, method, path, status) {
  if (!panel || (method === 'GET' && status < 400)) return;
  try {
    // The panel user's own account once it exists (a request refused before it was made names the shared one).
    await db.query("INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, 'panel.request', NULL, $2, 'finance-control')", [
      actors.has(panelActorId(panel.id)) ? panelActorId(panel.id) : PANEL_ACTOR,
      JSON.stringify({ method, path, status, panelUser: panel }),
    ]);
  } catch (e) {
    console.error('panel audit failed', String(e?.message ?? e).slice(0, 200));
  }
}
