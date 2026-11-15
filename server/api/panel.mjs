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
// (base64url JSON { id, email, name, role }). On this side they act as the Finance Control account (PANEL_ACTOR,
// role admin, 067): every route checks and records as for an admin, the account's name carries the panel user's, and
// every panel request that changes something (and every refusal) is an audit_events row 'panel.request' naming them.
import { HttpError, db, env, same } from './core.mjs';

/** The account the panel acts as (067_panel_actor.sql): role admin, never a person, can't sign in. */
export const PANEL_ACTOR = 'fc000000-0000-4000-8000-000000000001';
const KEY = String(env.PANEL_API_KEY ?? '').trim();
/** A key shorter than this is treated as none (a typo must not open the admin routes). */
const KEY_MIN = 32;
export const panelOn = () => KEY.length >= KEY_MIN;

/** What Finance Control may call: `METHOD path`. */
export const PANEL_ROUTES = new Set([
  // Hediyeler (custom-gifts.mjs) and its uploads (media.mjs kinds gifticon, giftvideo, giftsource).
  'GET /api/admin/gifts',
  'POST /api/admin/gifts',
  'POST /api/admin/gifts/update',
  'POST /api/admin/gifts/delete',
  'POST /api/admin/gifts/order',
  'POST /api/admin/gifts/fetch',
  'POST /api/media/upload-url',
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
  'POST /api/admin/lucky/config',
  // Canlı ayarlar (live-settings.mjs).
  'GET /api/admin/live-settings',
  'POST /api/admin/live-settings',
  'GET /api/admin/live-settings/history',
  'POST /api/admin/live-settings/rollback',
  // Reports and the server's state: Oyun Salonu (casino.mjs), the warnings (alerts.mjs), the sending to this panel.
  'GET /api/admin/casino/report',
  'GET /api/admin/alerts',
  'GET /api/admin/finance-sync',
  // Kullanıcılar (admin.mjs, referrals.mjs): search, ban and lifting it, room level, deleting, an invite's coins back.
  'GET /api/admin/users',
  'POST /api/admin/users/delete',
  'POST /api/admin/users/room-level',
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
  'GET /api/admin/events/categories',
  'POST /api/admin/events/categories',
  'POST /api/admin/events/categories/remove',
  'GET /api/admin/events/report',
  // Ajans merkezi (agency-admin.mjs): the network's tree and list, applications, status, rate, tier, parent, a
  // streamer's agency, transfers and transition commission, performance runs, reports, the commission simulator.
  'GET /api/admin/agency/tree',
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
  // closing a period, a setting. Staff roles and permissions, BD assignment, operations score, violations,
  // appeals and the background jobs stay in the app.
  'POST /api/admin/agency/commissions/run',
  'POST /api/admin/agency/income',
  'POST /api/admin/agency/commissions/reverse',
  'POST /api/admin/agency/adjust',
  'POST /api/admin/agency/periods/close',
  'POST /api/admin/agency/settings',
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
  if (!Number.isSafeInteger(id) || id < 1 || !clean(who?.email, 200)) throw new HttpError(400, 'Panel kullanıcısı eksik');
  return { id, email: clean(who.email, 200), name: clean(who.name, 80) || clean(who.email, 200), role: clean(who.role, 40) };
}

let actor = null;
/** The Finance Control account as auth() hands it to a route, named for the panel user acting now. */
export async function panelUser(panel) {
  actor ??= (await db.query('SELECT * FROM users WHERE id = $1', [PANEL_ACTOR])).rows[0] ?? null;
  if (!actor) throw new HttpError(503, 'Finans paneli hesabı hazır değil');
  // Names show in pushes and lists (live settings: "… değişti: <name>"): who in the panel did it.
  return { ...actor, role: 'admin', name: `Finance Control · ${panel.name}`.slice(0, 80), session_scope: 'full', panel };
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
    await db.query("INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, 'panel.request', NULL, $2, 'finance-control')", [
      PANEL_ACTOR,
      JSON.stringify({ method, path, status, panelUser: panel }),
    ]);
  } catch (e) {
    console.error('panel audit failed', String(e?.message ?? e).slice(0, 200));
  }
}
