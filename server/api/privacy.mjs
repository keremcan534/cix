// Gizlilik and "Kimler ulaşabilir" (Ayarlar): what each person shows others and who may reach them, kept here and
// enforced where it applies. Also my follows both ways, with what each person shows: the app splits them into
// Takip ettiklerim, Takipçilerim and Arkadaşlar (Mesajlar › Arkadaşlarım), people who follow each other only in the last.
//
//   GET   /api/me/privacy                → { privacy }
//   PATCH /api/me/privacy { some keys }  → { privacy }
//   GET   /api/me/friends                → { friends }   people I follow and people who follow me
//
// Nobody else's follower, following or friends list is ever shown, whatever these settings say (social.mjs
// followList: mine only; only the numbers are on a profile).
//
// The keys: profilePublic, showOnline, showLastSeen, showCurrentRoom (true or false), dmFrom (everyone | following |
// mutual), callsFrom, invitesFrom and marksFrom (everyone | following | nobody), and Mesajlar's preferences voiceCalls, videoCalls,
// messagePush and pushCloseOnly (true or false, all on at first). "following" means people the owner follows.
// Where each one bites:
//   - profilePublic off: someone I don't follow sees my name, photo and username, not my age, city, bio or interests
//     (GET /api/user, Keşfet: shownToViewer).
//   - showOnline off: nobody sees me online, nor when I was last on (presenceOf: Keşfet, Arkadaşlarım, Aile).
//   - showLastSeen off: nobody sees when I was last on, and I don't see anyone's.
//   - showCurrentRoom off: the room I'm in isn't shown (Aile's "Birlikte oynuyor").
//   - dmFrom: POST /api/messages (messages.mjs, dmRefusal). Someone I wrote to may always answer me.
//   - callsFrom: POST /api/calls through pairOf (one-on-one.mjs, callRefusal). Someone I called in the last 24 hours
//     may call me back. Eşleşme is not affected: both people join its queue themselves.
//   - voiceCalls, videoCalls off: nobody can call me that way, whoever they are (callRefusals). Eşleşme is not affected.
//   - messagePush off: messages still arrive, my phone shows no notification for them (one-on-one.mjs wantsMessagePush).
//   - pushCloseOnly on: only people close to me notify: we follow each other, or there is a heart level between us.
//   - invitesFrom: inviteRefusal / mayInvite, for room and mic invites.
//   - autoReceive, autoOpener, autoOpenerSeen, autoSend: Otomatik mesaj (auto-chat.mjs). autoOpenerSeen can only be
//     turned on (the app says it showed what a conversation start in my name is).
//   - marksFrom ("Kimler profilime iz bırakabilir", profile-marks.mjs): who may send me a gift that leaves a profile
//     mark; anyone else's is refused before any coin moves. "following" (the people I follow) at first, the owners'
//     decision (20 Nov 2026), also for everyone who never chose, older apps included. profileMarks ("Profilime iz
//     bırakılmasın", the switch older apps still have) is the same setting seen as on/off: off is marksFrom nobody,
//     on again is the people I follow (the default). Either blocks new marks only: the ones I have stay till
//     their time ends or someone cleans them (the owners' decision; before 105 turning it off took them off).
//   - globalHideName on ("Adım genel duyurularda görünmesin", off at first): a global gift I send or receive is
//     announced without my id, name and photo ("Bir kullanıcı", global-gifts.mjs).
// A block either way refuses all three. The other person is never told which setting refused them beyond the
// reason the demo shows ("… yalnızca takip ettiği kişilerden mesaj alıyor").
import { HttpError, auth, db, limit, readJson } from './core.mjs';
import { MARKS_FROM, MARKS_FROM_DEFAULT, marksRuleOf } from './profile-mark-rules.mjs';

export const PRIVACY_DEFAULTS = Object.freeze({
  profilePublic: true,
  showOnline: true,
  showLastSeen: true,
  showCurrentRoom: true,
  dmFrom: 'everyone',
  callsFrom: 'everyone',
  invitesFrom: 'everyone',
  voiceCalls: true,
  videoCalls: true,
  messagePush: true,
  pushCloseOnly: true,
  // Otomatik mesaj (auto-chat.mjs): automatic conversation starts reach me; the system may start conversations in my
  // name (men; on from the start, the owners' decision, 18 Nov 2026); my app told me what that is (only then does one
  // go out, so an older APK that can't show it or switch it off sends nothing); my automatic messages go out (streamers).
  autoReceive: true,
  autoOpener: true,
  autoOpenerSeen: false,
  autoSend: true,
  // Profil izleri (profile-marks.mjs): who may leave a mark on my photo (profileMarks false: nobody).
  profileMarks: true,
  marksFrom: MARKS_FROM_DEFAULT,
  globalHideName: false,
});
const COLUMN = {
  profilePublic: 'profile_public',
  showOnline: 'show_online',
  showLastSeen: 'show_last_seen',
  showCurrentRoom: 'show_current_room',
  dmFrom: 'dm_from',
  callsFrom: 'calls_from',
  invitesFrom: 'invites_from',
  voiceCalls: 'voice_calls',
  videoCalls: 'video_calls',
  messagePush: 'message_push',
  pushCloseOnly: 'push_close_only',
  autoReceive: 'auto_receive',
  autoOpener: 'auto_opener',
  autoOpenerSeen: 'auto_opener_seen',
  autoSend: 'auto_send',
  profileMarks: 'profile_marks',
  marksFrom: 'marks_from',
  globalHideName: 'global_hide_name',
};
/**
 * Gizlilik is a VIP / Rütbe right (owners, 26 Nov 2026): each setting below may move off its default only with its
 * perk (levels.mjs; Seviye ayarları set the level). Without it the setting is the default whatever was saved: on
 * the way in (PATCH refuses) and when the perk is gone (VIP dropped, Rütbe ended: the next read puts it back).
 * "Kimler ulaşabilir" (dmFrom, callsFrom, invitesFrom) stays for everyone; marksFrom only its "Kimse".
 */
export const PRIVACY_PERKS = Object.freeze({
  showCurrentRoom: 'privacy_room',
  globalHideName: 'privacy_global',
  showOnline: 'privacy_online',
  showLastSeen: 'privacy_online',
  profileMarks: 'privacy_marks',
  profilePublic: 'privacy_profile',
});
const offDefault = (k, v) => (k === 'marksFrom' ? v === 'nobody' : v !== PRIVACY_DEFAULTS[k]);
const perkOf = (k) => (k === 'marksFrom' ? 'privacy_marks' : PRIVACY_PERKS[k]);
/** The privacy perks `uid` has now (a Set of keys). */
async function privacyPerksOf(q, uid) {
  // PRIVACY_PERKS=0 (the tests): every choice open, as before the rights.
  if (process.env.PRIVACY_PERKS === '0') return new Set(Object.values(PRIVACY_PERKS));
  // Imported here: tests and modules read this one's rules without the server's (economy and levels reach live.mjs).
  const [{ statusOf }, { hasPerk }] = await Promise.all([import('./economy.mjs'), import('./levels.mjs')]);
  const u = (await q.query('SELECT svip_xp FROM users WHERE id = $1', [uid])).rows[0];
  const noble = (await statusOf(q, uid)).noble?.tier ?? 0;
  return new Set([...new Set(Object.values(PRIVACY_PERKS))].filter((p) => hasPerk(p, { svipXp: u?.svip_xp ?? 0, nobleTier: noble })));
}
/** Where each privacy perk opens (VIP level, Rütbe tier; null where it isn't given), for the app's lock lines. */
const perkLevels = async () => {
  const { perkFrom } = await import('./levels.mjs');
  return Object.fromEntries([...new Set(Object.values(PRIVACY_PERKS))].map((p) => [p, { vip: perkFrom('vip', p), noble: perkFrom('noble', p) }]));
};
/** Puts back every setting `uid` no longer has the right to (once; the stored row then agrees everywhere). */
async function enforcePerks(q, uid, have) {
  const p = await privacyOf(q, uid);
  const back = {};
  for (const k of [...Object.keys(PRIVACY_PERKS), 'marksFrom']) if (offDefault(k, p[k]) && !have.has(perkOf(k))) back[k] = k === 'marksFrom' ? MARKS_FROM_DEFAULT : PRIVACY_DEFAULTS[k];
  if (!Object.keys(back).length) return p;
  if ('marksFrom' in back || 'profileMarks' in back) Object.assign(back, { marksFrom: MARKS_FROM_DEFAULT, profileMarks: true });
  const cols = Object.keys(back).map((k) => COLUMN[k]);
  await q.query(`UPDATE privacy_settings SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now() WHERE user_id = $1`, [uid, ...Object.values(back)]);
  return privacyOf(q, uid);
}
/** Every user with a setting past a right: put back (the job; a lapsed VIP or Rütbe loses its privacy). */
export async function enforcePrivacyPerks(q = db) {
  const r = await q.query(`SELECT user_id FROM privacy_settings WHERE NOT profile_public OR NOT show_online OR NOT show_last_seen OR NOT show_current_room
                             OR global_hide_name OR NOT profile_marks OR marks_from = 'nobody' LIMIT 5000`);
  for (const { user_id: uid } of r.rows) await enforcePerks(q, uid, await privacyPerksOf(q, uid)).catch(() => {});
}
let perkTimer = null;
export function startPrivacyPerks() {
  if (perkTimer) return;
  perkTimer = setInterval(() => void enforcePrivacyPerks().catch((e) => console.error('privacy perks', String(e?.message ?? e).slice(0, 200))), 10 * 60_000);
  perkTimer.unref();
}
export function stopPrivacyPerks() {
  clearInterval(perkTimer);
  perkTimer = null;
}

const CHOICES = { dmFrom: ['everyone', 'following', 'mutual'], callsFrom: ['everyone', 'following', 'nobody'], invitesFrom: ['everyone', 'following', 'nobody'], marksFrom: MARKS_FROM };
/** A session seen this recently is online (as Keşfet has always counted it). */
export const ONLINE_MS = 5 * 60_000;

/**
 * A privacy_settings row (or a LEFT JOIN's nulls) as the API names it, the defaults filling what is missing. Profil
 * izleri's two read as the rule that applies (marksRuleOf: profile_marks false is nobody), so a row whose two columns
 * disagree still reads as one setting.
 */
/**
 * "Bana kimler mesaj gönderebilir?" and "Beni kimler arayabilir?" are gone (owners, 27 Nov 2026): everyone may write and
 * call (blocks still hold), and every app reads "Herkes". A choice made before, or sent by an older app, is kept and
 * applies again with REACH_CHOICES=1 (the tests run with it on; reach-choices-off.test.mjs checks the default).
 */
const REACH_CHOICES = process.env.REACH_CHOICES === '1';
const fromRow = (r) => {
  const out = Object.fromEntries(Object.entries(COLUMN).map(([k, col]) => [k, r?.[col] ?? PRIVACY_DEFAULTS[k]]));
  if (!REACH_CHOICES) Object.assign(out, { dmFrom: PRIVACY_DEFAULTS.dmFrom, callsFrom: PRIVACY_DEFAULTS.callsFrom });
  out.marksFrom = marksRuleOf(r?.profile_marks ?? true, r?.marks_from);
  out.profileMarks = out.marksFrom !== 'nobody';
  return out;
};

/** The settings of each of `ids` (defaults for anyone without a row). */
export async function privacyMap(q, ids) {
  const list = [...new Set(ids)];
  const out = new Map(list.map((id) => [id, { ...PRIVACY_DEFAULTS }]));
  if (!list.length) return out;
  const r = await q.query('SELECT * FROM privacy_settings WHERE user_id = ANY($1::uuid[])', [list]);
  for (const row of r.rows) out.set(row.user_id, fromRow(row));
  return out;
}
export const privacyOf = async (q, id) => (await privacyMap(q, [id])).get(id);

/**
 * `from` trying to reach `to`: the owner's settings, their name, whether the owner follows `from` and back, and a
 * block either way. Null for a deleted or unknown owner.
 */
async function reach(q, from, to) {
  const r = await q.query(
    `SELECT u.name, p.*,
            EXISTS (SELECT 1 FROM follows WHERE follower = u.id AND followee = $1) AS owner_follows,
            EXISTS (SELECT 1 FROM follows WHERE follower = $1 AND followee = u.id) AS follows_owner,
            EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = u.id) OR (b.blocker = u.id AND b.blocked = $1)) AS blocked
       FROM users u LEFT JOIN privacy_settings p ON p.user_id = u.id
      WHERE u.id = $2 AND u.deleted_at IS NULL`,
    [from, to],
  );
  const x = r.rows[0];
  return x ? { ...x, privacy: fromRow(x) } : null;
}

/** Why `from` may not write to `to` now (their "Bana kimler mesaj gönderebilir?"), or null when they may. */
export async function dmRefusal(q, from, to) {
  const x = await reach(q, from, to);
  if (!x) return 'Kullanıcı bulunamadı';
  if (x.blocked) return 'Bu kişiye mesaj gönderemezsin';
  const rule = x.privacy.dmFrom;
  if (rule === 'everyone' || (x.owner_follows && (rule === 'following' || x.follows_owner))) return null;
  // An answer: someone the owner wrote to may always write back.
  const wrote = await q.query(
    "SELECT 1 FROM messages WHERE LEAST(sender, recipient) = LEAST($1::uuid, $2::uuid) AND GREATEST(sender, recipient) = GREATEST($1::uuid, $2::uuid) AND sender = $2 AND source <> 'follow' LIMIT 1",
    [from, to],
  );
  if (wrote.rowCount) return null;
  return rule === 'following' ? `${x.name} yalnızca takip ettiği kişilerden mesaj alıyor.` : `${x.name} yalnızca karşılıklı takipleştiği kişilerden mesaj alıyor.`;
}

/** Why `from` may not call `to` now, whichever the call (their "Beni kimler arayabilir?"), or null when they may. */
async function whoRefusal(q, x, from, to) {
  const rule = x.privacy.callsFrom;
  if (rule === 'everyone') return null;
  if (rule === 'nobody') return `${x.name} şu an arama kabul etmiyor.`;
  if (x.owner_follows) return null;
  // Calling back: the owner called `from` in the last 24 hours.
  const back = await q.query("SELECT 1 FROM calls WHERE caller = $1 AND callee = $2 AND kind = 'call' AND created_at > now() - interval '24 hours' LIMIT 1", [to, from]);
  if (back.rowCount) return null;
  return `${x.name} yalnızca takip ettiği kişilerden arama alıyor.`;
}

/** Why `from` may not call `to` now: { voice, video }, each a reason or null when that call is open. */
export async function callRefusals(q, from, to) {
  const x = await reach(q, from, to);
  if (!x) return { voice: 'Kullanıcı bulunamadı', video: 'Kullanıcı bulunamadı' };
  if (x.blocked) return { voice: 'Bu kişiyi arayamazsın', video: 'Bu kişiyi arayamazsın' };
  const who = await whoRefusal(q, x, from, to);
  return {
    voice: who ?? (x.privacy.voiceCalls ? null : `${x.name} şu an sesli arama kabul etmiyor.`),
    video: who ?? (x.privacy.videoCalls ? null : `${x.name} şu an görüntülü arama kabul etmiyor.`),
  };
}

/**
 * Why `from` may not invite `to` to a room or a mic now (their "Beni odalara kimler davet edebilir?"), or null when
 * they may. For the invite routes: refuse with this text (403).
 */
export async function inviteRefusal(q, from, to) {
  const x = await reach(q, from, to);
  if (!x) return 'Kullanıcı bulunamadı';
  if (x.blocked) return 'Bu kişiyi davet edemezsin';
  const rule = x.privacy.invitesFrom;
  if (rule === 'everyone' || (rule === 'following' && x.owner_follows)) return null;
  return rule === 'nobody' ? `${x.name} oda daveti almıyor.` : `${x.name} yalnızca takip ettiği kişilerden oda daveti alıyor.`;
}
/** True when `from` may invite `to` (inviteRefusal says why not). */
export const mayInvite = async (q, from, to) => !(await inviteRefusal(q, from, to));

/**
 * What `viewer` may see of each of `ids` being on: online (a session seen in the last 5 minutes, unless they hide it)
 * and, when they aren't, since when (lastSeenAt: only if they show it and so does the viewer).
 */
export async function presenceOf(q, viewer, ids) {
  const list = [...new Set(ids)];
  const out = new Map();
  if (!list.length) return out;
  const r = await q.query(
    `SELECT u.id, (SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS seen,
            coalesce(p.show_online, true) AS show_online, coalesce(p.show_last_seen, true) AS show_last_seen,
            coalesce((SELECT v.show_last_seen FROM privacy_settings v WHERE v.user_id = $2), true) AS viewer_last_seen
       FROM users u LEFT JOIN privacy_settings p ON p.user_id = u.id
      WHERE u.id = ANY($1::uuid[])`,
    [list, viewer],
  );
  const fresh = Date.now() - ONLINE_MS;
  for (const x of r.rows) {
    const online = x.show_online && !!x.seen && new Date(x.seen).getTime() > fresh;
    out.set(x.id, { online, lastSeenAt: !online && x.seen && x.show_online && x.show_last_seen && x.viewer_last_seen ? x.seen : null });
  }
  return out;
}

/** Ids among `ids` whose profile isn't public and who don't follow `viewer`: their details stay hidden from them. */
export async function hiddenFrom(q, viewer, ids) {
  const list = [...new Set(ids)].filter((id) => id !== viewer);
  if (!list.length) return new Set();
  const r = await q.query(
    `SELECT p.user_id FROM privacy_settings p
      WHERE p.user_id = ANY($1::uuid[]) AND NOT p.profile_public
        AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower = p.user_id AND f.followee = $2)`,
    [list, viewer],
  );
  return new Set(r.rows.map((x) => x.user_id));
}

/**
 * People (profileOf shapes, with `online` where a list has it) as `viewer` may see them: a profile that isn't public
 * keeps its name, photo, username and gender, and says `private: true`; someone who hides being online is offline.
 */
export async function shownToViewer(q, viewer, people) {
  const ids = people.map((p) => p.id);
  const hidden = await hiddenFrom(q, viewer, ids);
  const seen = people.some((p) => 'online' in p) ? await presenceOf(q, viewer, ids) : null;
  return people.map((p) => {
    const out = hidden.has(p.id) ? { ...p, age: null, city: null, bio: '', interests: [], private: true } : { ...p };
    if (seen && 'online' in p) out.online = p.online && !!seen.get(p.id)?.online;
    return out;
  });
}

/** The body of PATCH /api/me/privacy as columns, refusing unknown keys and values. */
function patchOf(b) {
  const set = {};
  for (const [k, v] of Object.entries(b)) {
    // Own keys only: 'toString' or '__proto__' are not settings.
    if (!Object.hasOwn(COLUMN, k)) throw new HttpError(400, 'Geçersiz ayar');
    if (Object.hasOwn(CHOICES, k) ? !CHOICES[k].includes(v) : typeof v !== 'boolean') throw new HttpError(400, 'Geçersiz ayar değeri');
    // Shown once is shown: the app can't take it back.
    if (k === 'autoOpenerSeen' && v !== true) throw new HttpError(400, 'Geçersiz ayar değeri');
    set[COLUMN[k]] = v;
  }
  if (!Object.keys(set).length) throw new HttpError(400, 'Değişecek ayar yok');
  // Profil izleri: marksFrom and the older switch are one setting (nobody = off).
  if ('marks_from' in set && 'profile_marks' in set && (set.marks_from === 'nobody') !== (set.profile_marks === false)) {
    throw new HttpError(400, 'Profil izi ayarları birbirini tutmuyor: "Kimse" seçiliyse "Profilime iz bırakılmasın" da açık olmalı');
  }
  if ('marks_from' in set) set.profile_marks = set.marks_from !== 'nobody';
  return set;
}
const ALL_DEFAULT = Object.entries(COLUMN)
  .map(([k, col]) => `${col} = ${typeof PRIVACY_DEFAULTS[k] === 'boolean' ? PRIVACY_DEFAULTS[k] : `'${PRIVACY_DEFAULTS[k]}'`}`)
  .join(' AND ');

export const privacyRoutes = {
  async 'GET /api/me/privacy'(req) {
    const me = await auth(req);
    const have = await privacyPerksOf(db, me.id);
    // perks: the privacy rights I have; perkLevels: where each opens (a newer app shows only what I have).
    return { privacy: await enforcePerks(db, me.id, have), perks: [...have], perkLevels: await perkLevels() };
  },

  /** Changes some of my settings; the answer is all of them as they are now. */
  async 'PATCH /api/me/privacy'(req) {
    const me = await auth(req);
    limit(`privacy:${me.id}`, 30, 'Çok sık değiştiriyorsun, biraz bekle');
    const body = await readJson(req);
    const set = patchOf(body);
    // A setting past my rights is refused (an older app still shows every switch).
    const have = await privacyPerksOf(db, me.id);
    for (const k of [...Object.keys(PRIVACY_PERKS), 'marksFrom']) {
      if (!(k in (body ?? {})) || !offDefault(k, body[k]) || have.has(perkOf(k))) continue;
      const at = (await perkLevels())[perkOf(k)];
      const where = [at.vip !== null && `VIP ${at.vip}`, at.noble !== null && 'Rütbe'].filter(Boolean).join(' ya da ');
      throw Object.assign(new HttpError(403, `Bu gizlilik ayarı ${where || 'VIP'} ayrıcalığıdır.`), { extra: { code: 'privacy_perk', perk: perkOf(k) } });
    }
    const cols = Object.keys(set);
    // Profil izleri: who may mark me is in my look (marksFrom, noMarks), which the rooms I'm in hear when it changes.
    const marksWere = 'profile_marks' in set ? (await privacyOf(db, me.id)).marksFrom : null;
    // "Profilime iz bırakılmasın" from an app that has only the switch: off is nobody; on is the default (the people
    // I follow) after nobody, and leaves everyone or following as they are.
    const marksOnly = 'profile_marks' in set && !('marks_from' in set);
    const ins = marksOnly ? [...cols, 'marks_from'] : cols;
    const upd = cols.map((c) => `${c} = EXCLUDED.${c}`);
    if (marksOnly) upd.push(set.profile_marks ? `marks_from = CASE WHEN privacy_settings.marks_from = 'nobody' THEN '${MARKS_FROM_DEFAULT}' ELSE privacy_settings.marks_from END` : "marks_from = 'nobody'");
    await db.query(
      `INSERT INTO privacy_settings (user_id, ${ins.join(', ')}) VALUES ($1, ${ins.map((_, i) => `$${i + 2}`).join(', ')})
       ON CONFLICT (user_id) DO UPDATE SET ${upd.join(', ')}, updated_at = now()`,
      [me.id, ...cols.map((c) => set[c]), ...(marksOnly ? [set.profile_marks ? MARKS_FROM_DEFAULT : 'nobody'] : [])],
    );
    // Back to every default: nothing to keep.
    await db.query(`DELETE FROM privacy_settings WHERE user_id = $1 AND ${ALL_DEFAULT}`, [me.id]);
    // Profil izleri: the choice blocks new marks only; the ones I have stay (the owners' decision, 20 Nov 2026).
    const privacy = await enforcePerks(db, me.id, have);
    // Imported when needed (profile-marks.mjs reaches this module through its own imports).
    if (marksWere !== null && privacy.marksFrom !== marksWere) void import('./profile-marks.mjs').then((m) => m.announceMarks(me.id)).catch(() => {});
    return { privacy };
  },

  /**
   * Arkadaşlarım: everyone I follow or who follows me (deleted accounts and blocks either way left out), people who
   * follow each other first, then who is online, with what each shows of being on (presenceOf). At most 1000.
   */
  async 'GET /api/me/friends'(req) {
    const me = await auth(req);
    const r = await db.query(
      `SELECT u.id, u.name, u.avatar_url, bool_or(f.follower = $1) AS i_follow, bool_or(f.followee = $1) AS follows_me, max(f.created_at) AS since
         FROM follows f JOIN users u ON u.id = CASE WHEN f.follower = $1 THEN f.followee ELSE f.follower END
        WHERE (f.follower = $1 OR f.followee = $1) AND u.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = u.id) OR (b.blocker = u.id AND b.blocked = $1))
        GROUP BY u.id, u.name, u.avatar_url
        ORDER BY since DESC LIMIT 1000`,
      [me.id],
    );
    const seen = await presenceOf(db, me.id, r.rows.map((x) => x.id));
    const friends = r.rows
      .map((x) => ({ id: x.id, name: x.name, avatarUrl: x.avatar_url ?? null, iFollow: x.i_follow, followsMe: x.follows_me, ...seen.get(x.id) }))
      .sort((a, b) => Number(b.iFollow && b.followsMe) - Number(a.iFollow && a.followsMe) || Number(b.online) - Number(a.online));
    return { friends };
  },
};
