// Sanctions: mutes, account bans and device bans (docs/YAPTIRIM.md, migration 014). Every sanction is its own
// row with its own life; lifting one never lifts another. Times are the server's (now() in Postgres), so a
// phone's clock changes nothing. Where each one bites:
//
//   account ban   core.mjs auth() refuses every call; sign-in refuses a new session (auth.mjs); starting one
//                 ends the account's sessions, closes its room and takes it out of every voice room.
//   device ban    the same for sessions opened on that device and for sign-in / sign-up from it (any account);
//                 other accounts are not sanctioned by it and keep working on other devices.
//   text mute     DMs (messages.mjs, when the mute covers them) and room chat: the voice token for that room
//                 carries no data permission (live.mjs), and a running connection loses it at once.
//   voice mute    the voice token carries no publish permission, and a running connection loses it at once
//                 (LiveKit unpublishes the mic). Seats and room roles are untouched, so they come back as they were.
//   calls         /api/sanctions/check?action=call (calls are not on the server yet).
//
// Staff (permissions below; users.role admin holds all, moderator a default set, admin_permissions adds more):
//   GET  /api/admin/sanctions/meta                         → { reasons, types, presets, policies, perms }
//   GET  /api/admin/sanctions/search?q=                    → { users }   (id, name, phone, device id #, sanction id #)
//   GET  /api/admin/sanctions/user?id=                     → { user, sanctions, devices, appeals, audit, contactRefusals }
//   GET  /api/admin/sanctions/pending                      → { sanctions }   (waiting for approval)
//   POST /api/admin/sanctions        { user, type, reason, minutes|null, description?, note?, roomId?,
//                                      includeDm?, includeCalls?, deviceIds?, evidence?, usePolicy?, reportId? } → { sanctions }
//   POST /api/admin/sanctions/lift    { id, reason }       → { sanction }
//   POST /api/admin/sanctions/approve { id, approve, note }→ { sanction }
//   POST /api/admin/sanctions/evidence { id, kind, content } → { evidence }
//   GET  /api/admin/appeals?status=open                    → { appeals }
//   POST /api/admin/appeals/decide    { id, outcome, note, minutes? } → { appeal, sanction }
//   POST /api/admin/sanction-policies { reason, steps }    → { policies }
//   GET  /api/admin/sanction-permissions?user=             → { permissions }
//   POST /api/admin/sanction-permissions { user, permission, grant } → { permissions }
//   POST /api/admin/devices/risk      { device, status, note } → { device }
// The person:
//   GET  /api/sanctions/mine                               → { serverNow, sanctions, appeals }   (also with an appeal session)
//   POST /api/sanctions/appeal        { sanction, text }   → { appeal }                          (also with an appeal session)
//   GET  /api/sanctions/check?action=room_text|room_voice|dm|call&room= → { allowed, sanction }
//   POST /api/devices/register        { deviceInfo }       → { device }   (ties the session to its device)
//   POST /api/devices/check           { deviceInfo }       → { banned, sanction? }   (no sign-in needed)
// Agency managers: GET /api/agency/member-sanctions?user= → { sanctions } (their streamers, read only).
// Room staff: POST /api/rooms/mute, /api/rooms/unmute, GET /api/rooms/mutes (rooms.mjs, via applySanction).
// The system: autoFromReports (many reports) and contactStrike (5 contact filter refusals in an hour → a 1-hour
// text mute covering DMs, reason contact_sharing; core.mjs countRefusal).
import {
  HttpError,
  LIVE_SANCTION,
  SANCTION_LABEL,
  SANCTION_SELECT,
  UUID,
  auth,
  bannedError,
  db,
  env,
  int,
  liveBan,
  newSession,
  readJson,
  sanctionView,
  sha,
  text,
  tx,
  userId,
} from './core.mjs';
import { accessOf, permsOn, settingsAt } from './agency-lib.mjs';
import { deleteVoiceRoom, openVoiceRooms, removeFromVoice, roomService } from './live.mjs';

export const TYPES = Object.keys(SANCTION_LABEL);
const MUTES = ['mute_room_text', 'mute_room_voice', 'mute_global_text', 'mute_global_voice', 'mute_all'];
const SCOPE = (t) => (t === 'mute_room_text' || t === 'mute_room_voice' ? 'room' : t === 'account_ban' ? 'account' : t === 'device_ban' ? 'device' : 'global');
/** Preset durations in minutes for the panel (the spec's lists); any other 1 min – 10 years is "özel süre". */
export const PRESETS = {
  mute: [1, 5, 15, 30, 60, 360, 720, 1440, 4320, 10080, 43200],
  account_ban: [60, 360, 720, 1440, 4320, 10080, 21600, 43200, 129600],
  device_ban: [60, 1440, 4320, 10080, 21600, 43200, 129600],
};
const MAX_MINUTES = 5_256_000;

// --- Permissions ---------------------------------------------------------------------------------------------
export const PERMS = {
  'sanction.view': 'Yaptırım geçmişini ve cihazları görme',
  'sanction.mute': 'Genel susturma (süreli ve süresiz)',
  'sanction.ban': 'Süreli hesap banı (en çok 90 gün)',
  'sanction.ban_permanent': 'Ömür boyu hesap banı ve kaldırılması',
  'sanction.device_ban': 'Süreli cihaz banı (en çok 30 gün)',
  'sanction.device_ban_permanent': 'Ömür boyu / uzun cihaz banı ve kaldırılması',
  'sanction.lift': 'Yaptırım kaldırma',
  'sanction.approve': 'Bekleyen ağır yaptırımı onaylama',
  'sanction.appeal': 'İtiraz inceleme (doğru bulundu / ek inceleme)',
  'sanction.appeal_decide': 'İtiraz kararı (süre azaltma / kaldırma)',
  'sanction.policy': 'Ceza kademelerini düzenleme',
  'sanction.permissions': 'Yaptırım yetkisi verme',
};
/** Platform moderators: general mutes, timed bans within limits, lifting timed ones, appeal review. The rest is granted. */
const ROLE_PERMS = { moderator: ['sanction.view', 'sanction.mute', 'sanction.ban', 'sanction.device_ban', 'sanction.lift', 'sanction.appeal'], admin: Object.keys(PERMS) };
const LIMIT = { ban: 90 * 1440, device_ban: 30 * 1440 };
/** Who outranks whom: nobody acts on an equal or higher rank. */
const RANK = { user: 0, coins_bank: 0, moderator: 1, admin: 2 };
/** Off by default: with SANCTION_HEAVY_APPROVAL=1 even a permitted person's lifetime / device ban waits for a second person. */
const HEAVY_APPROVAL = env.SANCTION_HEAVY_APPROVAL === '1';
const AUTO_REPORTS = Number(env.SANCTION_AUTO_REPORTS ?? 3);
/** Contact filter: this many refusals (0 = off) inside the window mute the person's messages for a while (contactStrike). */
const AUTO_MUTE_REFUSALS = Number(env.AUTO_MUTE_REFUSALS ?? 5);
const AUTO_MUTE_MINUTES = int(Number(env.AUTO_MUTE_MINUTES ?? 60), 1, MAX_MINUTES) ?? 60;
const AUTO_MUTE_WINDOW = int(Number(env.AUTO_MUTE_WINDOW ?? 60), 1, 1440) ?? 60;
const CONTACT_REASON = 'contact_sharing';
/**
 * Reasons only the system's own rules give: staff and room staff can't pick them (not in GET meta, refused by
 * applySanction and the policy editor), so a person who reads "Otomatik: …" was muted by the rule.
 */
const SYSTEM_REASONS = [CONTACT_REASON];

export async function permsOf(u) {
  const out = new Set(ROLE_PERMS[u.role] ?? []);
  const r = await db.query('SELECT permission FROM admin_permissions WHERE user_id = $1', [u.id]);
  for (const x of r.rows) if (x.permission in PERMS) out.add(x.permission);
  return out;
}

export async function audit(q, { actor = null, role = 'system', action, sanction = null, target = null, device = null, result = 'ok', detail = {} }) {
  await q.query('INSERT INTO sanction_audit_logs (actor, actor_role, action, sanction_id, target_user, device_id, result, detail) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
    actor,
    role,
    action,
    sanction,
    target,
    device,
    result,
    JSON.stringify(detail),
  ]);
}

/** Staff with `perm`, or 403 (the refusal is audited). Returns { u, perms }. */
async function staffWith(req, perm, what = perm) {
  const u = await auth(req);
  const perms = await permsOf(u);
  if (!perms.has(perm)) {
    await audit(db, { actor: u.id, role: u.role, action: what, result: 'denied' });
    throw new HttpError(403, 'Bu işlem için yaptırım yetkin yok');
  }
  return { u, perms };
}

/** The permission a sanction of `type` for `minutes` (null = permanent) needs. */
function permFor(type, minutes) {
  if (type === 'account_ban') return minutes === null || minutes > LIMIT.ban ? 'sanction.ban_permanent' : 'sanction.ban';
  if (type === 'device_ban') return minutes === null || minutes > LIMIT.device_ban ? 'sanction.device_ban_permanent' : 'sanction.device_ban';
  return 'sanction.mute';
}
/** Lifetime bans and device bans: always wait for a person when they come from a policy or the automatic system. */
const heavy = (type, minutes) => type === 'device_ban' || (type === 'account_ban' && minutes === null);

// --- Devices ---------------------------------------------------------------------------------------------------
const INSTALL = /^[A-Za-z0-9_-]{32,128}$/;
const HW = /^[A-Za-z0-9_.:-]{8,128}$/;
const clip = (v, n) => (typeof v === 'string' ? v.replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, n) : '');

/**
 * The device signals in a request, hashed: `deviceInfo` { installId, hardwareId?, keychainId?, platform, model?,
 * os?, app? } from the app, or just the old `deviceKey` (the install id) from an older app. Null when none.
 * Raw identifiers never reach the database.
 */
export function deviceSignals(b) {
  const d = b?.deviceInfo && typeof b.deviceInfo === 'object' && !Array.isArray(b.deviceInfo) ? b.deviceInfo : {};
  const install = INSTALL.test(d.installId ?? '') ? d.installId : INSTALL.test(b?.deviceKey ?? '') ? b.deviceKey : null;
  const platform = ['android', 'ios', 'web'].includes(d.platform) ? d.platform : 'unknown';
  const hw = HW.test(d.hardwareId ?? '') ? d.hardwareId : null;
  const kc = HW.test(d.keychainId ?? '') ? d.keychainId : null;
  if (!install && !hw && !kc) return null;
  return {
    install: install && sha(`dev-install:${install}`),
    hardware: hw && sha(`dev-hw:${platform}:${hw}`),
    keychain: kc && sha(`dev-kc:${kc}`),
    platform,
    model: clip(d.model, 60),
    os: clip(d.os, 30),
    app: clip(d.app, 30),
  };
}

const RISK_ORDER = ['normal', 'shared', 'reinstalled', 'changed', 'evasion_suspect'];
const worse = (a, b) => (RISK_ORDER.indexOf(b) > RISK_ORDER.indexOf(a) ? b : a);

/**
 * Finds the device these signals belong to, or records a new one. A new install on a phone we know (same
 * hardware or keychain id) is the same device, flagged 'reinstalled'; the same install with a different
 * hardware or keychain id is flagged 'changed'. Signals matching several devices: all of them count for bans.
 * Returns { id, matched, risk }.
 */
export async function registerDevice(sig) {
  return tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext('device_registry'))");
    const r = await c.query(
      `SELECT * FROM device_registry WHERE registration_status = 'active'
         AND ((install_hash IS NOT NULL AND install_hash = $1) OR (hardware_hash IS NOT NULL AND hardware_hash = $2) OR (keychain_hash IS NOT NULL AND keychain_hash = $3))
       ORDER BY (install_hash = $1) DESC NULLS LAST, (keychain_hash = $3) DESC NULLS LAST, id`,
      [sig.install, sig.hardware, sig.keychain],
    );
    if (!r.rowCount) {
      const ins = await c.query(
        'INSERT INTO device_registry (platform, install_hash, hardware_hash, keychain_hash, model, os_version, app_version) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [sig.platform, sig.install, sig.hardware, sig.keychain, sig.model, sig.os, sig.app],
      );
      return { id: Number(ins.rows[0].id), matched: [Number(ins.rows[0].id)], risk: 'normal' };
    }
    const d = r.rows[0];
    let risk = d.risk_status;
    const notes = [];
    if (sig.install && d.install_hash !== sig.install) {
      risk = worse(risk, 'reinstalled');
      notes.push('yeni kurulum');
    }
    if ((sig.hardware && d.hardware_hash && d.hardware_hash !== sig.hardware) || (sig.keychain && d.keychain_hash && d.keychain_hash !== sig.keychain)) {
      risk = worse(risk, 'changed');
      notes.push('cihaz kimliği değişti');
    }
    if (r.rowCount > 1) {
      risk = worse(risk, 'changed');
      notes.push(`${r.rowCount} kayıtla eşleşti`);
    }
    // The install id is unique: a new install takes it over only if no other row holds it.
    const takeInstall = sig.install && d.install_hash !== sig.install && !r.rows.some((x) => x.install_hash === sig.install);
    await c.query(
      `UPDATE device_registry SET last_seen_at = now(), risk_status = $2, risk_note = CASE WHEN $3 = '' THEN risk_note ELSE left($3 || ' · ' || risk_note, 300) END,
         install_hash = CASE WHEN $4 THEN $5 ELSE install_hash END, hardware_hash = coalesce(hardware_hash, $6), keychain_hash = coalesce(keychain_hash, $7),
         model = CASE WHEN $8 = '' THEN model ELSE $8 END, os_version = CASE WHEN $9 = '' THEN os_version ELSE $9 END, app_version = CASE WHEN $10 = '' THEN app_version ELSE $10 END
       WHERE id = $1`,
      [d.id, risk, notes.join(', '), !!takeInstall, sig.install, sig.hardware, sig.keychain, sig.model, sig.os, sig.app],
    );
    if (notes.length) await audit(c, { action: 'device_risk', device: d.id, detail: { risk, notes } });
    return { id: Number(d.id), matched: r.rows.map((x) => Number(x.id)), risk };
  });
}

/**
 * Remembers that `uid` used the device. A phone used by several accounts is flagged 'shared'; one where
 * another account is banned is flagged 'evasion_suspect' for staff to look at. A flag never sanctions anyone.
 */
export async function linkDevice(dev, uid) {
  await db.query('INSERT INTO device_accounts (device_id, user_id) VALUES ($1, $2) ON CONFLICT (device_id, user_id) DO UPDATE SET last_seen_at = now()', [dev.id, uid]);
  await carryMutes(dev, uid).catch((e) => console.error('carry mutes', uid, e.message));
  const others = await db.query(
    `SELECT a.user_id, EXISTS (SELECT 1 FROM user_sanctions s WHERE s.user_id = a.user_id AND s.sanction_type = 'account_ban' AND ${LIVE_SANCTION}) AS banned
       FROM device_accounts a WHERE a.device_id = $1 AND a.user_id <> $2`,
    [dev.id, uid],
  );
  let risk = null;
  if (others.rows.some((x) => x.banned)) risk = 'evasion_suspect';
  else if (others.rowCount) risk = 'shared';
  if (!risk) return;
  const cur = await db.query('SELECT risk_status FROM device_registry WHERE id = $1', [dev.id]);
  const next = worse(cur.rows[0].risk_status, risk);
  if (next === cur.rows[0].risk_status) return;
  await db.query('UPDATE device_registry SET risk_status = $2 WHERE id = $1', [dev.id, next]);
  await audit(db, { action: 'device_risk', device: dev.id, target: uid, detail: { risk: next, accounts: others.rowCount + 1 } });
}

/**
 * Deleting an account is never refused for a mute (social.mjs DELETE /api/me), but it frees the sign-in key. So a
 * general mute still running on an account deleted on this device moves to an account made here after that
 * deletion: same type, reason, start and end, applied by the same role. Accounts that were already here keep
 * their own record; room mutes stay with their room. Once per mute: a copy `uid` already has (even one staff
 * lifted since) is not made again.
 */
async function carryMutes(dev, uid) {
  const moved = await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`carry-mutes:${uid}`]);
    const r = await c.query(
      `SELECT DISTINCT ON (s.sanction_type, s.reason_code, s.expires_at) s.*, m.include_dm, m.include_calls
         FROM user_sanctions s JOIN users old ON old.id = s.user_id JOIN users nu ON nu.id = $2
         LEFT JOIN user_mute_records m ON m.sanction_id = s.id
        WHERE s.user_id IN (SELECT user_id FROM device_accounts WHERE device_id = ANY($1::bigint[]) AND user_id <> $2)
          AND old.deleted_at IS NOT NULL AND nu.created_at >= old.deleted_at AND s.scope = 'global' AND ${LIVE_SANCTION}
          AND NOT EXISTS (SELECT 1 FROM user_sanctions x WHERE x.user_id = $2 AND x.sanction_type = s.sanction_type
                            AND x.reason_code = s.reason_code AND x.expires_at IS NOT DISTINCT FROM s.expires_at)
        ORDER BY s.sanction_type, s.reason_code, s.expires_at, s.id`,
      [dev.matched?.length ? dev.matched : [dev.id], uid],
    );
    for (const s of r.rows) {
      // Copied in SQL: the times keep Postgres' microseconds (a JS Date would cut them), so the check above matches.
      const id = (
        await c.query(
          `INSERT INTO user_sanctions (user_id, sanction_type, scope, reason_code, reason_description, internal_note, start_at, expires_at, is_permanent, status,
                                       created_by, created_role, source, report_id, policy_step)
           SELECT $1, sanction_type, 'global', reason_code, reason_description, left(rtrim($2 || internal_note), 2000), start_at, expires_at, is_permanent, 'active',
                  created_by, created_role, source, report_id, policy_step
             FROM user_sanctions WHERE id = $3 RETURNING id`,
          [uid, `Silinen hesaptan taşındı (yaptırım #${s.id}). `, s.id],
        )
      ).rows[0].id;
      await c.query('INSERT INTO user_mute_records (sanction_id, include_dm, include_calls) VALUES ($1, $2, $3)', [id, !!s.include_dm, !!s.include_calls]);
      await audit(c, { action: 'carry_over', sanction: id, target: uid, device: dev.id, detail: { from: Number(s.id), fromUser: s.user_id } });
    }
    return r.rowCount;
  });
  if (moved) await refreshVoice(uid);
}

// --- Enforcement -----------------------------------------------------------------------------------------------
/** What each action is stopped by. */
const STOPS = {
  room_text: (s, room) => s.sanction_type === 'mute_all' || s.sanction_type === 'mute_global_text' || (s.sanction_type === 'mute_room_text' && s.room_id === room),
  room_voice: (s, room) => s.sanction_type === 'mute_all' || s.sanction_type === 'mute_global_voice' || (s.sanction_type === 'mute_room_voice' && s.room_id === room),
  dm: (s) => s.sanction_type === 'mute_all' || (s.sanction_type === 'mute_global_text' && s.include_dm),
  call: (s) => s.sanction_type === 'mute_all' || (s.sanction_type === 'mute_global_voice' && s.include_calls),
  // Anlar posts and comments (moments.mjs): public text outside rooms.
  post: (s) => s.sanction_type === 'mute_all' || s.sanction_type === 'mute_global_text',
};
export const ACTIONS = Object.keys(STOPS);

export async function liveMutes(uid) {
  const r = await db.query(`${SANCTION_SELECT} WHERE s.user_id = $1 AND s.sanction_type = ANY($2::text[]) AND ${LIVE_SANCTION} ORDER BY s.expires_at DESC NULLS FIRST`, [uid, MUTES]);
  return r.rows;
}
/** The mute that stops `action` (in `room`, a room uuid), or null. */
export async function muteFor(uid, action, room = null) {
  return (await liveMutes(uid)).find((s) => STOPS[action](s, room)) ?? null;
}

const ACTION_TEXT = { room_text: 'Bu odada mesaj gönderemezsin', room_voice: 'Mikrofonu şu an kullanamazsın', dm: 'Şu an özel mesaj gönderemezsin', call: 'Şu an sesli görüşme yapamazsın', post: 'Şu an paylaşım ya da yorum yapamazsın' };
/** 403 with the mute when `action` is stopped. */
export async function assertMay(u, action, room = null) {
  const s = await muteFor(u.id, action, room);
  if (s) throw Object.assign(new HttpError(403, ACTION_TEXT[action]), { extra: { code: 'muted', sanction: sanctionView(s), serverNow: new Date().toISOString() } });
}

/** The room uuid of a LiveKit room name (oda-<uuid>), or null. */
const roomUuid = (name) => /^oda-([0-9a-f-]{36})$/.exec(name)?.[1] ?? null;

/**
 * What the voice token for `room` may do for this person: no mic while voice muted, no chat while text muted, and
 * in a room whose mics are for its members (room-rules.mjs micPermission) no mic for anyone but its staff and members.
 */
export async function voiceGrant(uid, roomName) {
  const room = roomUuid(roomName);
  const mutes = await liveMutes(uid);
  const mic = room && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(room) ? await micAllowed(room, uid) : true;
  return { canPublish: mic && !mutes.some((s) => STOPS.room_voice(s, room)), canPublishData: !mutes.some((s) => STOPS.room_text(s, room)) };
}
async function micAllowed(roomId, uid) {
  const r = await db.query(
    `SELECT r.owner, r.rules->>'micPermission' AS perm,
            EXISTS (SELECT 1 FROM room_admins a WHERE a.room_id = r.id AND a.user_id::text = $2) AS admin,
            EXISTS (SELECT 1 FROM room_members m WHERE m.room_id = r.id AND m.user_id::text = $2 AND m.status = 'member') AS member
       FROM rooms r WHERE r.id = $1`,
    [roomId, uid],
  );
  const x = r.rows[0];
  return !x || x.perm !== 'members' || x.owner === uid || x.admin || x.member;
}

/**
 * Applies the person's current permissions to every voice room they are in now (a mute started, was lifted or
 * ran out). LiveKit replaces the whole permission, so every field is sent; the mic seat (an attribute) stays.
 * The rooms are the ones LiveKit has open now as well as room_presence: when LiveKit's webhooks don't reach
 * us, room_presence is empty and a mute would otherwise only bite at the next token. A room the person isn't
 * in answers 404, which changes nothing.
 */
export async function refreshVoice(uid) {
  const r = await db.query('SELECT room FROM room_presence WHERE identity = $1', [uid]);
  const rooms = new Set([...r.rows.map((x) => x.room), ...(await openVoiceRooms()).filter((n) => roomUuid(n))]);
  for (const room of rooms) {
    const g = await voiceGrant(uid, room);
    await roomService(
      'UpdateParticipant',
      { room, identity: uid, permission: { canSubscribe: true, canPublish: g.canPublish, canPublishData: g.canPublishData, canPublishSources: ['MICROPHONE', 'CAMERA'], canUpdateMetadata: true } },
      { roomAdmin: true, room },
    ).catch((e) => console.error('livekit UpdateParticipant', room, String(e).slice(0, 200)));
  }
}

/** Every minute: voice permissions of people whose mute just ran out come back without anyone asking. */
let lastSweep = new Date();
async function sweep() {
  const now = new Date();
  const r = await db.query(
    `SELECT DISTINCT user_id FROM user_sanctions WHERE sanction_type = ANY($1::text[]) AND status = 'active' AND expires_at > $2 AND expires_at <= $3`,
    [MUTES, lastSweep, now],
  );
  lastSweep = now;
  for (const x of r.rows) await refreshVoice(x.user_id);
}
let sweepTimer = null;
export const startSanctionSweep = () => {
  sweepTimer ??= setInterval(() => sweep().catch((e) => console.error('sanction sweep', e.message)), Number(env.SANCTION_SWEEP_MS ?? 60_000));
  sweepTimer.unref();
};
export const stopSanctionSweep = () => (clearInterval(sweepTimer), (sweepTimer = null));

/** What starting a sanction does right away. */
async function takeEffect(s) {
  if (s.sanction_type === 'account_ban') {
    const n = await db.query('DELETE FROM sessions WHERE user_id = $1', [s.user_id]);
    await db.query('UPDATE account_bans SET sessions_ended = $2 WHERE sanction_id = $1', [s.id, n.rowCount]);
    const rooms = await db.query('UPDATE rooms SET closed_at = now() WHERE owner = $1 AND closed_at IS NULL RETURNING id', [s.user_id]);
    for (const x of rooms.rows) await deleteVoiceRoom(`oda-${x.id}`);
    const calls = await db.query('SELECT room FROM room_presence WHERE identity = $1', [s.user_id]);
    for (const x of calls.rows) await removeFromVoice(x.room, s.user_id);
  } else if (s.sanction_type === 'device_ban') {
    // Sessions opened on that device (any account), and the account's own sessions from before devices were
    // recorded (they could be on it). Those people leave their voice rooms.
    const n = await db.query('DELETE FROM sessions WHERE device_id = $1 OR (user_id = $2 AND device_id IS NULL) RETURNING user_id', [s.device_registry_id, s.user_id]);
    await db.query('UPDATE device_bans SET sessions_ended = $2 WHERE sanction_id = $1', [s.id, n.rowCount]);
    for (const uid of new Set(n.rows.map((x) => x.user_id))) {
      const calls = await db.query('SELECT room FROM room_presence WHERE identity = $1', [uid]);
      for (const x of calls.rows) await removeFromVoice(x.room, uid);
    }
  } else {
    await refreshVoice(s.user_id);
  }
}

const sanctionRow = async (q, id) => (await q.query(`${SANCTION_SELECT} WHERE s.id = $1`, [id])).rows[0] ?? null;
const live = (s) => s.status === 'active' && new Date(s.start_at) <= new Date() && (!s.expires_at || new Date(s.expires_at) > new Date());

/**
 * Writes one sanction (one per device for a device ban) and starts it unless it waits for approval. Every
 * check about who may do it is the caller's; this only refuses what is never allowed.
 *   input: { user, type, reason, minutes (null = permanent), description?, note?, roomId?, includeDm?,
 *            includeCalls?, deviceIds?, evidence?, source, reportId?, policyStep?, pending?,
 *            guard? (async (c) => boolean, run first inside the transaction: false writes nothing and returns []),
 *            effectLater? (true: answers once the sanction is written; starting it (voice rooms) goes on after) }
 *   actor: { id (null = system), role }
 */
export async function applySanction(actor, input) {
  const { type, minutes } = input;
  const reason = (await db.query('SELECT * FROM sanction_reasons WHERE code = $1 AND active', [input.reason])).rows[0];
  if (!reason) throw new HttpError(400, 'Geçersiz ihlal kategorisi');
  if (SYSTEM_REASONS.includes(reason.code) && !(actor.id === null && input.source === 'auto')) throw new HttpError(400, 'Bu kategoriyi yalnızca otomatik sistem kullanır');
  const target = (await db.query('SELECT id, role FROM users WHERE id = $1 AND deleted_at IS NULL', [input.user])).rows[0];
  if (!target) throw new HttpError(404, 'Kullanıcı bulunamadı');
  if (type === 'device_ban' && !input.deviceIds?.length) throw new HttpError(400, 'Engellenecek cihazı seç');
  const devices = type === 'device_ban' ? input.deviceIds : [null];
  if (type === 'device_ban') {
    const known = await db.query('SELECT device_id FROM device_accounts WHERE user_id = $1 AND device_id = ANY($2::bigint[])', [target.id, devices]);
    if (known.rowCount !== new Set(devices).size) throw new HttpError(400, 'Seçilen cihaz bu kullanıcının kayıtlı cihazı değil');
  }
  const out = [];
  await tx(async (c) => {
    if (input.guard && !(await input.guard(c))) return;
    for (const dev of devices) {
      const s = (
        await c.query(
          `INSERT INTO user_sanctions (user_id, sanction_type, scope, room_id, reason_code, reason_description, internal_note, expires_at, is_permanent, status,
                                       created_by, created_role, source, report_id, policy_step)
           VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $8::int IS NULL THEN NULL ELSE now() + make_interval(mins => $8::int) END, $8::int IS NULL, $9, $10, $11, $12, $13, $14) RETURNING *`,
          [
            target.id,
            type,
            SCOPE(type),
            SCOPE(type) === 'room' ? input.roomId : null,
            reason.code,
            input.description || reason.public_text,
            input.note ?? '',
            minutes,
            input.pending ? 'pending' : 'active',
            actor.id,
            actor.role,
            input.source ?? 'manual',
            input.reportId ?? null,
            input.policyStep ?? null,
          ],
        )
      ).rows[0];
      if (MUTES.includes(type)) await c.query('INSERT INTO user_mute_records (sanction_id, include_dm, include_calls) VALUES ($1,$2,$3)', [s.id, type === 'mute_all' || !!input.includeDm, type === 'mute_all' || !!input.includeCalls]);
      if (type === 'account_ban') await c.query('INSERT INTO account_bans (sanction_id) VALUES ($1)', [s.id]);
      if (type === 'device_ban') await c.query('INSERT INTO device_bans (sanction_id, device_registry_id, related_user_id) VALUES ($1,$2,$3)', [s.id, dev, target.id]);
      for (const e of input.evidence ?? []) await c.query('INSERT INTO moderation_evidence (sanction_id, kind, content, added_by) VALUES ($1,$2,$3,$4)', [s.id, e.kind, e.content, actor.id]);
      await audit(c, {
        actor: actor.id,
        role: actor.role,
        action: input.pending ? 'propose' : 'apply',
        sanction: s.id,
        target: target.id,
        device: dev,
        detail: { type, minutes, reason: reason.code, room: input.roomId ?? null, source: input.source ?? 'manual', step: input.policyStep ?? null },
      });
      out.push(Number(s.id));
    }
  });
  const rows = [];
  for (const id of out) {
    const s = await sanctionRow(db, id);
    if (s.status === 'active') {
      if (input.effectLater) takeEffect(s).catch((e) => console.error('sanction take effect', s.id, e.message));
      else await takeEffect(s);
    }
    rows.push(s);
  }
  return rows;
}

/** Ends a sanction now. Only this one: any other running sanction stays. */
export async function liftSanction(actor, s, why) {
  const r = await db.query("UPDATE user_sanctions SET status = 'lifted', revoked_by = $2, revoked_at = now(), revocation_reason = $3 WHERE id = $1 AND status IN ('active', 'pending') RETURNING id", [
    s.id,
    actor.id,
    why,
  ]);
  if (!r.rowCount) throw new HttpError(409, 'Bu yaptırım zaten kaldırılmış');
  await audit(db, { actor: actor.id, role: actor.role, action: 'lift', sanction: s.id, target: s.user_id, device: s.device_registry_id, detail: { reason: why, wasLive: live(s) } });
  if (MUTES.includes(s.sanction_type)) await refreshVoice(s.user_id);
  return sanctionRow(db, s.id);
}

/** The policy step for the next violation of `reason`: earlier sanctioned ones inside the window count (not those lifted on appeal). */
export async function policyStep(uid, reason) {
  const steps = (await db.query('SELECT * FROM sanction_policies WHERE reason_code = $1 ORDER BY step', [reason])).rows;
  if (!steps.length) return null;
  const windowDays = steps[0].window_days;
  const n = Number(
    (
      await db.query(
        `SELECT count(*) AS n FROM user_sanctions s WHERE s.user_id = $1 AND s.reason_code = $2 AND s.status IN ('active', 'lifted') AND s.created_at > now() - make_interval(days => $3::int)
           AND NOT EXISTS (SELECT 1 FROM sanction_appeals a WHERE a.sanction_id = s.id AND a.status = 'lifted')`,
        [uid, reason, windowDays],
      )
    ).rows[0].n,
  );
  return { ...(steps[Math.min(n, steps.length - 1)] ?? steps.at(-1)), violations: n };
}

/**
 * Reports: once SANCTION_AUTO_REPORTS different people (default 3) report the same account inside a day, the
 * category's policy step is applied by the system, at most once a day per account. A step marked auto that is a
 * mute starts at once; anything else (bans, steps that need approval) waits for a person. Never fails the report.
 */
const REPORT_REASON = { 'Taciz / hakaret': 'harassment', 'Uygunsuz içerik': 'inappropriate', 'Uygunsuz görüntü': 'inappropriate', Dolandırıcılık: 'fraud', 'Sahte profil': 'fake_account' };
export async function autoFromReports(target, reasonText) {
  if (!UUID.test(target) || !(AUTO_REPORTS > 0)) return null;
  const n = Number(
    (await db.query("SELECT count(DISTINCT reporter) AS n FROM reports WHERE target_type = 'user' AND target_id = $1 AND created_at > now() - interval '1 day'", [target])).rows[0].n,
  );
  if (n < AUTO_REPORTS) return null;
  // The contact filter's own automatic mutes (contactStrike) don't count here.
  const recent = await db.query("SELECT 1 FROM user_sanctions WHERE user_id = $1 AND source = 'auto' AND reason_code <> $2 AND created_at > now() - interval '1 day'", [
    target,
    CONTACT_REASON,
  ]);
  if (recent.rowCount) return null;
  const u = (await db.query('SELECT role FROM users WHERE id = $1 AND deleted_at IS NULL', [target])).rows[0];
  if (!u || RANK[u.role] > 0) return null;
  const reason = REPORT_REASON[reasonText] ?? 'other';
  const step = await policyStep(target, reason);
  if (!step) return null;
  const pending = !(step.auto && !step.requires_approval && MUTES.includes(step.sanction_type) && !heavy(step.sanction_type, step.minutes));
  // Room mutes need a room; an automatic step uses the global form instead.
  const type = step.sanction_type === 'mute_room_text' ? 'mute_global_text' : step.sanction_type === 'mute_room_voice' ? 'mute_global_voice' : step.sanction_type;
  // A device ban can't be proposed without a device: the system proposes the account ban instead.
  const finalType = type === 'device_ban' ? 'account_ban' : type;
  return applySanction(
    { id: null, role: 'system' },
    { user: target, type: finalType, reason, minutes: step.minutes, source: 'auto', policyStep: step.step, pending, note: `${n} farklı kişi 24 saat içinde şikâyet etti` },
  );
}

/**
 * Refusals the per-minute write cap left out of contact_refusals (core.mjs countRefusal), per person: their times
 * (ms), newest last, only the newest AUTO_MUTE_REFUSALS inside the window (no more are ever needed). In memory,
 * like the cap itself.
 */
const unwritten = new Map();
setInterval(() => {
  const old = Date.now() - AUTO_MUTE_WINDOW * 60_000;
  for (const [uid, times] of unwritten) if (times.at(-1) <= old) unwritten.delete(uid);
}, 3_600_000).unref();

/**
 * Contact filter (core.mjs countRefusal, right after a refusal is counted, the app's own included): once
 * AUTO_MUTE_REFUSALS refusals (default 5, 0 = off) fall inside AUTO_MUTE_WINDOW minutes (default 60), the system
 * mutes the person's messages, DMs and room chat, for AUTO_MUTE_MINUTES (default 60). Only refusals made after the
 * last mute that kept the person from writing (this rule's or staff's, DMs and room chat) ended or was lifted
 * count: those made while it ran never do, so when it is over the count starts again from zero, with the same
 * warnings. Nothing is added while such a mute runs; staff are never muted.
 * `skipped`: this refusal was not written (the per-minute cap); it still counts, and so do the earlier ones the
 * cap left out (`unwritten`). Answers what the person is told: { strikesLeft, muteMinutes } with one or two tries
 * left, { muted, until, muteMinutes, sanction, serverNow } when this refusal started the mute, else {}.
 */
export async function contactStrike(uid, skipped = false) {
  if (!(AUTO_MUTE_REFUSALS > 0)) return {};
  const now = Date.now();
  const kept = (unwritten.get(uid) ?? []).filter((t) => t > now - AUTO_MUTE_WINDOW * 60_000);
  const times = skipped ? [...kept, now].slice(-AUTO_MUTE_REFUSALS) : kept;
  if (times.length) unwritten.set(uid, times);
  else unwritten.delete(uid);
  const r = (
    await db.query(
      `WITH stops AS (
         -- When each mute that stopped both DMs and room chat stopped doing so: its end, or when it was lifted
         -- (one still running ends in the future). One lifted while it waited for approval never ran.
         SELECT CASE WHEN s.status = 'lifted' THEN least(s.revoked_at, coalesce(s.expires_at, 'infinity')) ELSE coalesce(s.expires_at, 'infinity') END AS ended
           FROM user_sanctions s LEFT JOIN user_mute_records m ON m.sanction_id = s.id
          WHERE s.user_id = $1 AND s.status IN ('active', 'lifted') AND s.start_at <= now()
            AND (s.sanction_type = 'mute_all' OR (s.sanction_type = 'mute_global_text' AND m.include_dm))
            AND (s.status = 'active' OR s.approved_at IS NOT NULL
                 OR NOT EXISTS (SELECT 1 FROM sanction_audit_logs l WHERE l.sanction_id = s.id AND l.action = 'propose'))
       ), cut AS (
         SELECT greatest(now() - make_interval(mins => $3), coalesce((SELECT max(ended) FROM stops), '-infinity')) AS t
       )
       SELECT u.role,
              (SELECT max(id) FROM user_sanctions WHERE user_id = $1 AND reason_code = $2 AND source = 'auto') AS last_id,
              (SELECT count(*) FROM contact_refusals f WHERE f.user_id = $1 AND f.created_at > (SELECT t FROM cut))
                + (SELECT count(*) FROM unnest($4::timestamptz[]) x WHERE x > (SELECT t FROM cut)) AS n
         FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [uid, CONTACT_REASON, AUTO_MUTE_WINDOW, times.map((t) => new Date(t).toISOString())],
    )
  ).rows[0];
  if (!r || RANK[r.role] > 0) return {};
  const n = Number(r.n);
  const left = AUTO_MUTE_REFUSALS - n;
  if (left > 2) return {};
  // Already unable to write (this rule's mute or a moderator's): nothing to add, nothing to warn about.
  if ((await liveMutes(uid)).some((s) => STOPS.dm(s) && STOPS.room_text(s, null))) return {};
  if (left > 0) return { strikesLeft: left, muteMinutes: AUTO_MUTE_MINUTES };
  const [s] = await applySanction(
    { id: null, role: 'system' },
    {
      user: uid,
      type: 'mute_global_text',
      includeDm: true,
      reason: CONTACT_REASON,
      minutes: AUTO_MUTE_MINUTES,
      source: 'auto',
      // The answer (muted, until) doesn't wait for LiveKit: the open voice connections lose chat right after.
      effectLater: true,
      note: `${AUTO_MUTE_WINDOW === 60 ? '1 saatte' : `${AUTO_MUTE_WINDOW} dakikada`} ${n} kez iletişim bilgisi yazmaya çalıştı`,
      // Refusals at the same moment make one mute: the lock waits for the other's transaction, whose mute is newer than `last_id`.
      guard: async (c) => {
        await c.query("SELECT pg_advisory_xact_lock(hashtext('contact-auto-mute'), hashtext($1))", [uid]);
        const since = await c.query("SELECT 1 FROM user_sanctions WHERE user_id = $1 AND reason_code = $2 AND source = 'auto' AND id > $3", [uid, CONTACT_REASON, r.last_id ?? 0]);
        return !since.rowCount;
      },
    },
  );
  return s ? { muted: true, until: s.expires_at, muteMinutes: AUTO_MUTE_MINUTES, sanction: sanctionView(s), serverNow: new Date().toISOString() } : {};
}

// --- Input -----------------------------------------------------------------------------------------------------
function minutesOf(v) {
  if (v === null) return null;
  const n = int(v, 1, MAX_MINUTES);
  if (n === null) throw new HttpError(400, 'Süre 1 dakika ile 10 yıl arası olmalı (ya da süresiz)');
  return n;
}
function evidenceOf(v) {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 10) throw new HttpError(400, 'En çok 10 kanıt eklenebilir');
  return v.map((e) => {
    if (!e || !['note', 'link', 'report', 'message'].includes(e.kind)) throw new HttpError(400, 'Geçersiz kanıt türü');
    return { kind: e.kind, content: text(e.content, 1, 2000, 'Kanıt') };
  });
}
const idOf = (v, what = 'yaptırım') => {
  const n = int(typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v, 1, Number.MAX_SAFE_INTEGER);
  if (!n) throw new HttpError(400, `Geçersiz ${what}`);
  return n;
};

/** Staff view of a sanction: everything, notes and evidence included. */
async function staffView(s) {
  const ev = await db.query('SELECT e.*, u.name AS by_name FROM moderation_evidence e LEFT JOIN users u ON u.id = e.added_by WHERE e.sanction_id = $1 ORDER BY e.id', [s.id]);
  const names = await db.query('SELECT id, name FROM users WHERE id = ANY($1::uuid[])', [[s.created_by, s.revoked_by, s.approved_by].filter(Boolean)]);
  const name = (id) => names.rows.find((x) => x.id === id)?.name ?? null;
  const room = s.room_id ? (await db.query('SELECT title FROM rooms WHERE id = $1', [s.room_id])).rows[0] : null;
  const appeal = (await db.query('SELECT status FROM sanction_appeals WHERE sanction_id = $1 ORDER BY id DESC LIMIT 1', [s.id])).rows[0];
  return {
    ...sanctionView(s),
    userId: s.user_id,
    live: live(s),
    note: s.internal_note,
    source: s.source,
    policyStep: s.policy_step,
    reportId: s.report_id ? Number(s.report_id) : null,
    room: s.room_id ? { id: s.room_id, title: room?.title ?? null } : null,
    deviceId: s.device_registry_id ? Number(s.device_registry_id) : null,
    includeDm: !!s.include_dm,
    includeCalls: !!s.include_calls,
    createdBy: s.created_by ? { id: s.created_by, name: name(s.created_by), role: s.created_role } : { id: null, name: 'Otomatik sistem', role: 'system' },
    createdAt: s.created_at,
    approvedBy: s.approved_by ? { id: s.approved_by, name: name(s.approved_by) } : null,
    revokedBy: s.revoked_by ? { id: s.revoked_by, name: name(s.revoked_by) } : null,
    revokedAt: s.revoked_at,
    revocationReason: s.revocation_reason,
    appealStatus: appeal?.status ?? null,
    evidence: ev.rows.map((e) => ({ id: Number(e.id), kind: e.kind, content: e.content, by: e.by_name, at: e.created_at })),
  };
}
const deviceView = (d) => ({
  id: Number(d.id),
  platform: d.platform,
  model: d.model,
  os: d.os_version,
  app: d.app_version,
  verification: d.device_verification_status,
  risk: d.risk_status,
  riskNote: d.risk_note,
  firstSeenAt: d.first_seen_at,
  lastSeenAt: d.last_seen_at,
  accounts: Number(d.accounts ?? 1),
  banned: !!d.banned,
});
const appealView = (a) => ({
  id: Number(a.id),
  sanctionId: Number(a.sanction_id),
  userId: a.user_id,
  userName: a.user_name ?? null,
  text: a.body,
  status: a.status,
  reviewedBy: a.reviewer_name ?? null,
  note: a.decision_note,
  decidedAt: a.decided_at,
  createdAt: a.created_at,
});

async function staffTarget(me, uid) {
  const t = (await db.query('SELECT id, role FROM users WHERE id = $1 AND deleted_at IS NULL', [uid])).rows[0];
  if (!t) throw new HttpError(404, 'Kullanıcı bulunamadı');
  if ((RANK[t.role] ?? 0) >= (RANK[me.role] ?? 0)) {
    await audit(db, { actor: me.id, role: me.role, action: 'apply', target: uid, result: 'denied', detail: { why: 'rank' } });
    throw new HttpError(403, 'Kendi yetki seviyende veya üstündeki birine yaptırım uygulayamazsın');
  }
  return t;
}

/**
 * How often the contact filter refused this person's text (contact-filter.mjs, kept 180 days): counts by kind
 * and by place, for staff to judge. The texts themselves were never stored. Not a sanction by itself.
 */
async function contactRefusals(uid) {
  const r = await db.query(
    `SELECT category, place, count(*)::int AS n, count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS recent, max(created_at) AS last_at
       FROM contact_refusals WHERE user_id = $1 GROUP BY category, place`,
    [uid],
  );
  const out = { total: 0, last7Days: 0, byCategory: {}, byPlace: {}, lastAt: null };
  for (const x of r.rows) {
    out.total += x.n;
    out.last7Days += x.recent;
    out.byCategory[x.category] = (out.byCategory[x.category] ?? 0) + x.n;
    out.byPlace[x.place] = (out.byPlace[x.place] ?? 0) + x.n;
    if (!out.lastAt || x.last_at > out.lastAt) out.lastAt = x.last_at;
  }
  return out;
}

/** The rank a sanction was given with (room staff and the system: 0). */
const ISSUER_RANK = { moderator: 1, admin: 2 };
const LIFT_REFUSED = {
  self: 'Kendi yaptırımını kaldıramazsın',
  rank: 'Kendi yetki seviyende veya üstündeki birinin yaptırımını kaldıramazsın',
  issuer: 'Bu yaptırımı senden üst yetkili biri verdi; yalnızca o seviyede biri kaldırabilir',
};

/**
 * Whether `me` may lift `s`, with the rules of applying one (staffTarget): never one's own; a staff member's
 * only from a higher rank (an admin may lift another admin's); never one given by a higher rank than `me` (the
 * rank it was given with, or the giver's role now if higher). A refusal is audited and answers 403.
 */
export async function mayLift(me, s) {
  const mine = RANK[me.role] ?? 0;
  const roles = await db.query('SELECT id, role FROM users WHERE id = ANY($1::uuid[])', [[s.user_id, s.created_by].filter(Boolean)]);
  const roleOf = (id) => roles.rows.find((x) => x.id === id)?.role;
  const issuer = Math.max(ISSUER_RANK[s.created_role] ?? 0, s.created_by ? (RANK[roleOf(s.created_by)] ?? 0) : 0);
  let why = null;
  if (s.user_id === me.id) why = 'self';
  else if (me.role !== 'admin' && (RANK[roleOf(s.user_id)] ?? 0) >= mine) why = 'rank';
  else if (issuer > mine) why = 'issuer';
  if (!why) return;
  await audit(db, { actor: me.id, role: me.role, action: 'lift', sanction: s.id, target: s.user_id, result: 'denied', detail: { why } });
  throw new HttpError(403, LIFT_REFUSED[why]);
}

export const sanctionRoutes = {
  // --- Staff --------------------------------------------------------------------------------------------------
  async 'GET /api/admin/sanctions/meta'(req) {
    const { perms } = await staffWith(req, 'sanction.view');
    // Not the system's own reasons (SYSTEM_REASONS): nobody can pick those.
    const reasons = await db.query('SELECT code, title, public_text FROM sanction_reasons WHERE active AND code <> ALL($1::text[]) ORDER BY sort', [SYSTEM_REASONS]);
    const pol = await db.query('SELECT * FROM sanction_policies ORDER BY reason_code, step');
    return {
      reasons: reasons.rows.map((r) => ({ code: r.code, title: r.title, publicText: r.public_text })),
      types: TYPES.map((t) => ({ type: t, label: SANCTION_LABEL[t] })),
      presets: PRESETS,
      limits: LIMIT,
      policies: pol.rows.map((p) => ({ reason: p.reason_code, step: p.step, type: p.sanction_type, minutes: p.minutes, windowDays: p.window_days, auto: p.auto, requiresApproval: p.requires_approval })),
      perms: [...perms],
      allPerms: PERMS,
    };
  },

  async 'GET /api/admin/sanctions/search'(req, url) {
    await staffWith(req, 'sanction.view');
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
    if (!q) return { users: [] };
    let ids = [];
    if (UUID.test(q)) ids = [q];
    else if (/^#?S?\d{1,15}$/i.test(q)) {
      // A number: a sanction id or a device id (both shown with # in the panel).
      const n = Number(q.replace(/^#?S?/i, ''));
      const r = await db.query('SELECT user_id FROM user_sanctions WHERE id = $1 UNION SELECT user_id FROM device_accounts WHERE device_id = $1', [n]);
      ids = r.rows.map((x) => x.user_id);
    }
    const digits = q.replace(/\D/g, '');
    const r = await db.query(
      `SELECT u.id, u.name, u.phone, u.role, u.deleted_at,
              (SELECT count(*) FROM user_sanctions s WHERE s.user_id = u.id AND ${LIVE_SANCTION}) AS live,
              (SELECT count(*) FROM user_sanctions s WHERE s.user_id = u.id) AS total
         FROM users u
        WHERE u.id = ANY($1::uuid[]) OR u.name ILIKE $2 OR u.username ILIKE $2 OR ($3 <> '' AND length($3) >= 6 AND u.phone LIKE '%' || $3 || '%')
           OR EXISTS (SELECT 1 FROM auth_identities i WHERE i.user_id = u.id AND i.email ILIKE $2)
        ORDER BY live DESC, u.created_at DESC LIMIT 30`,
      [ids, `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`, digits],
    );
    return {
      users: r.rows.map((x) => ({ id: x.id, name: x.name, phone: x.phone, role: x.role, deleted: !!x.deleted_at, liveSanctions: Number(x.live), totalSanctions: Number(x.total) })),
    };
  },

  async 'GET /api/admin/sanctions/user'(req, url) {
    await staffWith(req, 'sanction.view');
    const uid = userId(url.searchParams.get('id'));
    const u = (await db.query('SELECT id, name, phone, role, created_at, deleted_at FROM users WHERE id = $1', [uid])).rows[0];
    if (!u) throw new HttpError(404, 'Kullanıcı bulunamadı');
    const s = await db.query(`${SANCTION_SELECT} WHERE s.user_id = $1 ORDER BY s.id DESC`, [uid]);
    const devices = await db.query(
      `SELECT d.*, a.last_seen_at AS used_at, (SELECT count(*) FROM device_accounts x WHERE x.device_id = d.id) AS accounts,
              EXISTS (SELECT 1 FROM device_bans b JOIN user_sanctions s ON s.id = b.sanction_id WHERE b.device_registry_id = d.id AND ${LIVE_SANCTION}) AS banned
         FROM device_accounts a JOIN device_registry d ON d.id = a.device_id WHERE a.user_id = $1 ORDER BY a.last_seen_at DESC`,
      [uid],
    );
    // Device bans on this person's devices that were given over someone else: shown, so staff see a shared phone.
    const onDevices = await db.query(
      `${SANCTION_SELECT} WHERE s.sanction_type = 'device_ban' AND s.user_id <> $1 AND d.device_registry_id IN (SELECT device_id FROM device_accounts WHERE user_id = $1) ORDER BY s.id DESC`,
      [uid],
    );
    const appeals = await db.query(
      'SELECT a.*, r.name AS reviewer_name FROM sanction_appeals a LEFT JOIN users r ON r.id = a.reviewed_by WHERE a.user_id = $1 ORDER BY a.id DESC',
      [uid],
    );
    const log = await db.query('SELECT l.*, u.name AS actor_name FROM sanction_audit_logs l LEFT JOIN users u ON u.id = l.actor WHERE l.target_user = $1 ORDER BY l.id DESC LIMIT 200', [uid]);
    return {
      user: { id: u.id, name: u.name, phone: u.phone, role: u.role, createdAt: u.created_at, deleted: !!u.deleted_at },
      contactRefusals: await contactRefusals(uid),
      sanctions: await Promise.all(s.rows.map(staffView)),
      deviceSanctions: await Promise.all(onDevices.rows.map(staffView)),
      devices: devices.rows.map(deviceView),
      appeals: appeals.rows.map(appealView),
      audit: log.rows.map((l) => ({ id: Number(l.id), actor: l.actor_name ?? (l.actor ? l.actor : 'Sistem'), role: l.actor_role, action: l.action, sanctionId: l.sanction_id ? Number(l.sanction_id) : null, result: l.result, detail: l.detail, at: l.created_at })),
    };
  },

  async 'GET /api/admin/sanctions/pending'(req) {
    await staffWith(req, 'sanction.view');
    const r = await db.query(`${SANCTION_SELECT} WHERE s.status = 'pending' ORDER BY s.id LIMIT 200`);
    return { sanctions: await Promise.all(r.rows.map(staffView)) };
  },

  async 'POST /api/admin/sanctions'(req) {
    const me = await auth(req);
    const perms = await permsOf(me);
    const b = await readJson(req, 40_000);
    if (!TYPES.includes(b.type)) throw new HttpError(400, 'Geçersiz yaptırım türü');
    const target = await staffTarget(me, userId(b.user));
    let minutes = b.usePolicy ? undefined : minutesOf(b.minutes);
    let type = b.type;
    let step = null;
    if (b.usePolicy) {
      step = await policyStep(target.id, b.reason);
      if (!step) throw new HttpError(400, 'Bu kategori için ceza kademesi tanımlı değil');
      type = step.sanction_type;
      minutes = step.minutes;
      if (SCOPE(type) === 'room' && !b.roomId) type = type === 'mute_room_text' ? 'mute_global_text' : 'mute_global_voice';
    }
    const need = permFor(type, minutes);
    const pending = (!!step && (step.requires_approval || heavy(type, minutes))) || (HEAVY_APPROVAL && heavy(type, minutes));
    // A step that waits for approval may be proposed with the timed permission; whoever approves needs the full one.
    const base = type === 'account_ban' ? 'sanction.ban' : type === 'device_ban' ? 'sanction.device_ban' : need;
    if (!perms.has(need) && !(pending && perms.has(base))) {
      await audit(db, { actor: me.id, role: me.role, action: 'apply', target: target.id, result: 'denied', detail: { type, minutes, need } });
      throw new HttpError(403, `Bu yaptırım için yetkin yok (${PERMS[need]})`);
    }
    if (SCOPE(type) === 'room') {
      if (typeof b.roomId !== 'string' || !UUID.test(b.roomId)) throw new HttpError(400, 'Oda seç');
      if (!(await db.query('SELECT 1 FROM rooms WHERE id = $1', [b.roomId])).rowCount) throw new HttpError(404, 'Oda bulunamadı');
    }
    const description = b.description === undefined || b.description === '' ? '' : text(b.description, 3, 300, 'Gerekçe');
    const note = b.note === undefined ? '' : text(b.note, 0, 2000, 'İç not');
    if (!description && !note) throw new HttpError(400, 'Gerekçe zorunlu: kullanıcıya gösterilecek gerekçe veya iç not yaz');
    const deviceIds = type === 'device_ban' ? (Array.isArray(b.deviceIds) ? b.deviceIds.map((x) => idOf(x, 'cihaz')) : []) : [];
    const rows = await applySanction(
      { id: me.id, role: me.role === 'admin' ? 'admin' : 'moderator' },
      {
        user: target.id,
        type,
        reason: b.reason,
        minutes,
        description,
        note,
        roomId: b.roomId,
        includeDm: b.includeDm === true,
        includeCalls: b.includeCalls === true,
        deviceIds,
        evidence: evidenceOf(b.evidence),
        source: b.reportId ? 'report' : step ? 'policy' : 'manual',
        reportId: b.reportId ? idOf(b.reportId, 'şikâyet') : null,
        policyStep: step?.step ?? null,
        pending,
      },
    );
    return { sanctions: await Promise.all(rows.map(staffView)) };
  },

  async 'POST /api/admin/sanctions/lift'(req) {
    const { u: me, perms } = await staffWith(req, 'sanction.lift');
    const b = await readJson(req);
    const s = await sanctionRow(db, idOf(b.id));
    if (!s) throw new HttpError(404, 'Yaptırım bulunamadı');
    const why = text(b.reason, 3, 300, 'Kaldırma gerekçesi');
    await mayLift(me, s);
    // A lifetime ban comes off only with the lifetime permission.
    if (s.is_permanent && (s.sanction_type === 'account_ban' || s.sanction_type === 'device_ban')) {
      const need = s.sanction_type === 'account_ban' ? 'sanction.ban_permanent' : 'sanction.device_ban_permanent';
      if (!perms.has(need)) {
        await audit(db, { actor: me.id, role: me.role, action: 'lift', sanction: s.id, target: s.user_id, result: 'denied' });
        throw new HttpError(403, 'Ömür boyu banı yalnızca yetkili platform yöneticisi kaldırabilir');
      }
    }
    return { sanction: await staffView(await liftSanction({ id: me.id, role: me.role }, s, why)) };
  },

  async 'POST /api/admin/sanctions/approve'(req) {
    const { u: me, perms } = await staffWith(req, 'sanction.approve');
    const b = await readJson(req);
    const s = await sanctionRow(db, idOf(b.id));
    if (!s || s.status !== 'pending') throw new HttpError(404, 'Onay bekleyen yaptırım bulunamadı');
    if (s.created_by === me.id) throw new HttpError(403, 'Kendi önerdiğin yaptırımı başka bir yetkili onaylamalı');
    const minutes = s.expires_at ? Math.round((new Date(s.expires_at) - new Date(s.start_at)) / 60_000) : null;
    if (!perms.has(permFor(s.sanction_type, minutes))) throw new HttpError(403, 'Bu yaptırımı onaylama yetkin yok');
    const note = text(b.note, 3, 300, 'Onay notu');
    if (b.approve !== true) {
      await db.query("UPDATE user_sanctions SET status = 'rejected', approved_by = $2, approved_at = now() WHERE id = $1", [s.id, me.id]);
      await audit(db, { actor: me.id, role: me.role, action: 'reject', sanction: s.id, target: s.user_id, detail: { note } });
      return { sanction: await staffView(await sanctionRow(db, s.id)) };
    }
    // The time starts when it is approved, not when it was proposed.
    await db.query(
      `UPDATE user_sanctions SET status = 'active', approved_by = $2, approved_at = now(), start_at = now(),
         expires_at = CASE WHEN $3::int IS NULL THEN NULL ELSE now() + make_interval(mins => $3::int) END WHERE id = $1`,
      [s.id, me.id, minutes],
    );
    await audit(db, { actor: me.id, role: me.role, action: 'approve', sanction: s.id, target: s.user_id, detail: { note } });
    const row = await sanctionRow(db, s.id);
    await takeEffect(row);
    return { sanction: await staffView(row) };
  },

  async 'POST /api/admin/sanctions/evidence'(req) {
    const { u: me } = await staffWith(req, 'sanction.view');
    const b = await readJson(req, 10_000);
    const s = await sanctionRow(db, idOf(b.id));
    if (!s) throw new HttpError(404, 'Yaptırım bulunamadı');
    const [e] = evidenceOf([{ kind: b.kind, content: b.content }]);
    const r = await db.query('INSERT INTO moderation_evidence (sanction_id, kind, content, added_by) VALUES ($1,$2,$3,$4) RETURNING *', [s.id, e.kind, e.content, me.id]);
    await audit(db, { actor: me.id, role: me.role, action: 'evidence', sanction: s.id, target: s.user_id, detail: { kind: e.kind } });
    return { evidence: { id: Number(r.rows[0].id), kind: e.kind, content: e.content } };
  },

  async 'GET /api/admin/appeals'(req, url) {
    await staffWith(req, 'sanction.appeal');
    const st = url.searchParams.get('status') ?? 'open';
    const statuses = st === 'open' ? ['open', 'needs_review'] : st === 'decided' ? ['upheld', 'reduced', 'lifted'] : null;
    if (!statuses) throw new HttpError(400, 'Geçersiz durum');
    const r = await db.query(
      `SELECT a.*, u.name AS user_name, r.name AS reviewer_name FROM sanction_appeals a JOIN users u ON u.id = a.user_id LEFT JOIN users r ON r.id = a.reviewed_by
        WHERE a.status = ANY($1::text[]) ORDER BY a.id ${st === 'open' ? 'ASC' : 'DESC'} LIMIT 200`,
      [statuses],
    );
    const out = [];
    for (const a of r.rows) out.push({ ...appealView(a), sanction: await staffView(await sanctionRow(db, a.sanction_id)) });
    return { appeals: out };
  },

  async 'POST /api/admin/appeals/decide'(req) {
    const { u: me, perms } = await staffWith(req, 'sanction.appeal');
    const b = await readJson(req);
    const a = (await db.query("SELECT * FROM sanction_appeals WHERE id = $1 AND status IN ('open', 'needs_review')", [idOf(b.id, 'itiraz')])).rows[0];
    if (!a) throw new HttpError(404, 'Açık itiraz bulunamadı');
    if (!['upheld', 'reduced', 'lifted', 'needs_review'].includes(b.outcome)) throw new HttpError(400, 'Karar: upheld, reduced, lifted veya needs_review');
    const note = text(b.note, 3, 500, 'Karar gerekçesi');
    const s = await sanctionRow(db, a.sanction_id);
    if (b.outcome === 'reduced' || b.outcome === 'lifted') {
      if (!perms.has('sanction.appeal_decide')) {
        await audit(db, { actor: me.id, role: me.role, action: `appeal_${b.outcome}`, sanction: s.id, target: s.user_id, result: 'denied' });
        throw new HttpError(403, 'Süre azaltma veya kaldırma için itiraz karar yetkisi gerekli');
      }
      if (s.is_permanent && (s.sanction_type === 'account_ban' || s.sanction_type === 'device_ban') && !perms.has(s.sanction_type === 'account_ban' ? 'sanction.ban_permanent' : 'sanction.device_ban_permanent'))
        throw new HttpError(403, 'Ömür boyu banı yalnızca yetkili platform yöneticisi kaldırabilir');
    }
    if (b.outcome === 'reduced') {
      // The new total length, counted from when it started; it must end sooner than now set.
      const total = minutesOf(b.minutes);
      if (total === null) throw new HttpError(400, 'Yeni süreyi dakika olarak yaz');
      const end = new Date(new Date(s.start_at).getTime() + total * 60_000);
      if (!s.is_permanent && end >= new Date(s.expires_at)) throw new HttpError(400, 'Yeni süre şimdikinden kısa olmalı');
      if (s.status !== 'active') throw new HttpError(409, 'Bu yaptırım artık sürmüyor');
      await db.query('UPDATE user_sanctions SET expires_at = $2, is_permanent = false WHERE id = $1', [s.id, end]);
      await audit(db, { actor: me.id, role: me.role, action: 'appeal_reduced', sanction: s.id, target: s.user_id, detail: { before: s.expires_at, after: end, appeal: Number(a.id) } });
      if (MUTES.includes(s.sanction_type)) await refreshVoice(s.user_id);
    } else if (b.outcome === 'lifted') {
      if (s.status === 'active' || s.status === 'pending') await liftSanction({ id: me.id, role: me.role }, s, `İtiraz kabul edildi: ${note}`);
    } else {
      await audit(db, { actor: me.id, role: me.role, action: `appeal_${b.outcome}`, sanction: s.id, target: s.user_id, detail: { appeal: Number(a.id) } });
    }
    const done = b.outcome !== 'needs_review';
    const r = await db.query(
      `UPDATE sanction_appeals SET status = $2, reviewed_by = $3, decision_note = $4, decided_at = CASE WHEN $5 THEN now() ELSE decided_at END WHERE id = $1 RETURNING *`,
      [a.id, b.outcome, me.id, note, done],
    );
    return { appeal: appealView(r.rows[0]), sanction: await staffView(await sanctionRow(db, s.id)) };
  },

  async 'POST /api/admin/sanction-policies'(req) {
    const { u: me } = await staffWith(req, 'sanction.policy');
    const b = await readJson(req, 20_000);
    if (!(await db.query('SELECT 1 FROM sanction_reasons WHERE code = $1', [b.reason])).rowCount) throw new HttpError(400, 'Geçersiz ihlal kategorisi');
    if (SYSTEM_REASONS.includes(b.reason)) throw new HttpError(400, 'Bu kategoriyi yalnızca otomatik sistem kullanır');
    if (!Array.isArray(b.steps) || b.steps.length > 10) throw new HttpError(400, 'En çok 10 kademe');
    const windowDays = b.steps.length ? int(b.windowDays ?? 90, 1, 3650) : 90;
    if (!windowDays) throw new HttpError(400, 'Değerlendirme süresi 1–3650 gün');
    const steps = b.steps.map((x, i) => {
      if (!TYPES.includes(x?.type)) throw new HttpError(400, `Kademe ${i + 1}: geçersiz tür`);
      const m = minutesOf(x.minutes);
      // A lifetime ban or a device ban never starts by itself.
      const approval = x.requiresApproval === true || heavy(x.type, m);
      return { type: x.type, minutes: m, auto: x.auto === true && !approval && MUTES.includes(x.type), approval };
    });
    const before = (await db.query('SELECT * FROM sanction_policies WHERE reason_code = $1 ORDER BY step', [b.reason])).rows;
    await tx(async (c) => {
      await c.query('DELETE FROM sanction_policies WHERE reason_code = $1', [b.reason]);
      for (const [i, x] of steps.entries())
        await c.query('INSERT INTO sanction_policies (reason_code, step, sanction_type, minutes, window_days, auto, requires_approval, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
          b.reason,
          i + 1,
          x.type,
          x.minutes,
          windowDays,
          x.auto,
          x.approval,
          me.id,
        ]);
      await audit(c, { actor: me.id, role: me.role, action: 'policy', detail: { reason: b.reason, before: before.map((p) => [p.sanction_type, p.minutes]), after: steps.map((p) => [p.type, p.minutes]) } });
    });
    const pol = await db.query('SELECT * FROM sanction_policies WHERE reason_code = $1 ORDER BY step', [b.reason]);
    return { policies: pol.rows.map((p) => ({ reason: p.reason_code, step: p.step, type: p.sanction_type, minutes: p.minutes, windowDays: p.window_days, auto: p.auto, requiresApproval: p.requires_approval })) };
  },

  async 'GET /api/admin/sanction-permissions'(req, url) {
    await staffWith(req, 'sanction.permissions');
    const uid = userId(url.searchParams.get('user'));
    const u = (await db.query('SELECT id, role FROM users WHERE id = $1', [uid])).rows[0];
    if (!u) throw new HttpError(404, 'Kullanıcı bulunamadı');
    return { role: u.role, permissions: [...(await permsOf(u))], granted: (await db.query('SELECT permission FROM admin_permissions WHERE user_id = $1', [uid])).rows.map((x) => x.permission) };
  },

  async 'POST /api/admin/sanction-permissions'(req) {
    const { u: me } = await staffWith(req, 'sanction.permissions');
    const b = await readJson(req);
    const uid = userId(b.user);
    if (!(b.permission in PERMS)) throw new HttpError(400, 'Geçersiz yetki');
    if (uid === me.id) throw new HttpError(400, 'Kendi yetkini değiştiremezsin');
    if (b.grant === true) await db.query('INSERT INTO admin_permissions (user_id, permission, granted_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [uid, b.permission, me.id]);
    else await db.query('DELETE FROM admin_permissions WHERE user_id = $1 AND permission = $2', [uid, b.permission]);
    await audit(db, { actor: me.id, role: me.role, action: b.grant === true ? 'grant' : 'revoke', target: uid, detail: { permission: b.permission } });
    const u = (await db.query('SELECT id, role FROM users WHERE id = $1', [uid])).rows[0];
    return { permissions: [...(await permsOf(u))] };
  },

  /** Staff review of a device flag: a shared family phone is marked 'shared' (or back to normal) after a look. */
  async 'POST /api/admin/devices/risk'(req) {
    const { u: me } = await staffWith(req, 'sanction.device_ban', 'device_risk');
    const b = await readJson(req);
    if (!RISK_ORDER.includes(b.status)) throw new HttpError(400, 'Geçersiz durum');
    const note = text(b.note, 3, 300, 'Not');
    const r = await db.query("UPDATE device_registry SET risk_status = $2, risk_note = left($3 || ' · ' || risk_note, 300) WHERE id = $1 RETURNING *", [idOf(b.device, 'cihaz'), b.status, `İnceleme: ${note}`]);
    if (!r.rowCount) throw new HttpError(404, 'Cihaz bulunamadı');
    await audit(db, { actor: me.id, role: me.role, action: 'device_review', device: r.rows[0].id, detail: { status: b.status, note } });
    return { device: deviceView(r.rows[0]) };
  },

  // --- Agency managers: their streamers' history, read only -------------------------------------------------
  async 'GET /api/agency/member-sanctions'(req, url) {
    const me = await auth(req);
    const uid = userId(url.searchParams.get('user'));
    const m = (await db.query('SELECT a.* FROM agency_streamers s JOIN agencies a ON a.id = s.agency_id WHERE s.streamer_id = $1 AND s.ended_at IS NULL', [uid])).rows[0];
    const acc = await accessOf(db, me);
    if (!m || !permsOn(acc, m, await settingsAt(db)).has('streamers.view')) throw new HttpError(403, 'Bu kullanıcı senin ajansında değil');
    const r = await db.query(`${SANCTION_SELECT} WHERE s.user_id = $1 AND s.status IN ('active', 'lifted') ORDER BY s.id DESC LIMIT 100`, [uid]);
    return { sanctions: r.rows.map((s) => ({ ...sanctionView(s), live: live(s), revokedAt: s.revoked_at })) };
  },

  // --- The person -----------------------------------------------------------------------------------------------
  async 'GET /api/sanctions/mine'(req) {
    const me = await auth(req, { appeal: true });
    const r = await db.query(`${SANCTION_SELECT} WHERE s.user_id = $1 AND ${LIVE_SANCTION} ORDER BY s.id DESC`, [me.id]);
    const rows = r.rows;
    // A device ban given over another account on a phone this person uses shows too (they may appeal it).
    if (me.ban && me.ban.user_id !== me.id && !rows.some((x) => x.id === me.ban.id)) rows.push(me.ban);
    const appeals = await db.query('SELECT * FROM sanction_appeals WHERE user_id = $1 ORDER BY id DESC LIMIT 50', [me.id]);
    return {
      serverNow: new Date().toISOString(),
      sanctions: rows.map((s) => ({ ...sanctionView(s), appeal: appeals.rows.find((a) => a.sanction_id === s.id)?.status ?? null })),
      appeals: appeals.rows.map((a) => ({ id: Number(a.id), sanctionId: Number(a.sanction_id), status: a.status, note: a.status === 'open' ? null : a.decision_note, createdAt: a.created_at, decidedAt: a.decided_at })),
    };
  },

  /** An appeal on a sanction that is on (lifetime bans included). Also with the appeal session a banned person gets. */
  async 'POST /api/sanctions/appeal'(req) {
    const me = await auth(req, { appeal: true });
    const b = await readJson(req);
    const s = await sanctionRow(db, idOf(b.sanction));
    const body = text(b.text, 10, 1000, 'İtiraz açıklaması');
    let mine = s && s.user_id === me.id;
    if (s && !mine && s.sanction_type === 'device_ban')
      mine = (await db.query('SELECT 1 FROM device_accounts WHERE device_id = $1 AND user_id = $2', [s.device_registry_id, me.id])).rowCount > 0;
    if (!s || !mine) throw new HttpError(404, 'Yaptırım bulunamadı');
    if (!live(s)) throw new HttpError(409, 'Bu yaptırım artık sürmüyor');
    try {
      const r = await db.query('INSERT INTO sanction_appeals (sanction_id, user_id, body) VALUES ($1,$2,$3) RETURNING *', [s.id, me.id, body]);
      await audit(db, { actor: me.id, role: 'user', action: 'appeal', sanction: s.id, target: me.id, detail: { appeal: Number(r.rows[0].id) } });
      return { appeal: { id: Number(r.rows[0].id), sanctionId: Number(s.id), status: 'open', createdAt: r.rows[0].created_at } };
    } catch (e) {
      if (e.code === '23505') throw new HttpError(409, 'Bu yaptırım için açık bir itirazın var');
      throw e;
    }
  },

  async 'GET /api/sanctions/check'(req, url) {
    const me = await auth(req);
    const action = url.searchParams.get('action') ?? '';
    if (!ACTIONS.includes(action)) throw new HttpError(400, 'Geçersiz işlem');
    const room = url.searchParams.get('room');
    const s = await muteFor(me.id, action, room && UUID.test(room) ? room : null);
    return { allowed: !s, sanction: s ? sanctionView(s) : null, serverNow: new Date().toISOString() };
  },

  /** The app tells which device this session is on (every start). A banned device ends the session here. */
  async 'POST /api/devices/register'(req) {
    const me = await auth(req);
    const sig = deviceSignals(await readJson(req));
    if (!sig) throw new HttpError(400, 'Geçersiz cihaz bilgisi');
    const dev = await registerDevice(sig);
    const ban = await liveBan(db, me.id, dev.matched);
    if (ban) {
      await db.query('DELETE FROM sessions WHERE token_hash = $1', [me.session_hash]);
      await audit(db, { actor: me.id, role: 'user', action: 'device_blocked', target: me.id, device: dev.id, result: 'blocked', sanction: ban.id });
      await linkDevice(dev, me.id);
      throw bannedError(ban, { appealSession: await newSession(me.id, me.device ?? '', { deviceId: dev.id, scope: 'appeal' }) });
    }
    await db.query('UPDATE sessions SET device_id = $2 WHERE token_hash = $1', [me.session_hash, dev.id]);
    await linkDevice(dev, me.id);
    return { device: { registered: true } };
  },

  /** Before sign-in: is this device shut out? Says nothing about how the device was recognised. */
  async 'POST /api/devices/check'(req) {
    const sig = deviceSignals(await readJson(req));
    if (!sig) throw new HttpError(400, 'Geçersiz cihaz bilgisi');
    const dev = await registerDevice(sig);
    const ban = await liveBan(db, null, dev.matched);
    return ban ? { banned: true, sanction: sanctionView(ban), serverNow: new Date().toISOString() } : { banned: false };
  },
};
