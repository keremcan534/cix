// Gizlilik and "Kimler ulaşabilir" (Ayarlar): what each person shows others and who may reach them, kept here and
// enforced where it applies. Also Mesajlar › Arkadaşlarım: my follows both ways, with what each person shows.
//
//   GET   /api/me/privacy                → { privacy }
//   PATCH /api/me/privacy { some keys }  → { privacy }
//   GET   /api/me/friends                → { friends }   people I follow and people who follow me
//
// The keys: profilePublic, showOnline, showLastSeen, showCurrentRoom (true or false), dmFrom (everyone | following |
// mutual), callsFrom and invitesFrom (everyone | following | nobody). "following" means people the owner follows.
// Where each one bites:
//   - profilePublic off: someone I don't follow sees my name, photo and username, not my age, city, bio or interests
//     (GET /api/user, Keşfet: shownToViewer), and can't open my follower and following lists (listsHidden).
//   - showOnline off: nobody sees me online, nor when I was last on (presenceOf: Keşfet, Arkadaşlarım, Aile).
//   - showLastSeen off: nobody sees when I was last on, and I don't see anyone's.
//   - showCurrentRoom off: the room I'm in isn't shown (Aile's "Birlikte oynuyor").
//   - dmFrom: POST /api/messages (messages.mjs, dmRefusal). Someone I wrote to may always answer me.
//   - callsFrom: POST /api/calls through pairOf (one-on-one.mjs, callRefusal). Someone I called in the last 24 hours
//     may call me back. Eşleşme is not affected: both people join its queue themselves.
//   - invitesFrom: inviteRefusal / mayInvite, for room and mic invites.
// A block either way refuses all three. The other person is never told which setting refused them beyond the
// reason the demo shows ("… yalnızca takip ettiği kişilerden mesaj alıyor").
import { HttpError, auth, db, limit, readJson } from './core.mjs';

export const PRIVACY_DEFAULTS = Object.freeze({
  profilePublic: true,
  showOnline: true,
  showLastSeen: true,
  showCurrentRoom: true,
  dmFrom: 'everyone',
  callsFrom: 'everyone',
  invitesFrom: 'everyone',
});
const COLUMN = {
  profilePublic: 'profile_public',
  showOnline: 'show_online',
  showLastSeen: 'show_last_seen',
  showCurrentRoom: 'show_current_room',
  dmFrom: 'dm_from',
  callsFrom: 'calls_from',
  invitesFrom: 'invites_from',
};
const CHOICES = { dmFrom: ['everyone', 'following', 'mutual'], callsFrom: ['everyone', 'following', 'nobody'], invitesFrom: ['everyone', 'following', 'nobody'] };
/** A session seen this recently is online (as Keşfet has always counted it). */
export const ONLINE_MS = 5 * 60_000;

/** A privacy_settings row (or a LEFT JOIN's nulls) as the API names it, the defaults filling what is missing. */
const fromRow = (r) => Object.fromEntries(Object.entries(COLUMN).map(([k, col]) => [k, r?.[col] ?? PRIVACY_DEFAULTS[k]]));

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
    'SELECT 1 FROM messages WHERE LEAST(sender, recipient) = LEAST($1::uuid, $2::uuid) AND GREATEST(sender, recipient) = GREATEST($1::uuid, $2::uuid) AND sender = $2 LIMIT 1',
    [from, to],
  );
  if (wrote.rowCount) return null;
  return rule === 'following' ? `${x.name} yalnızca takip ettiği kişilerden mesaj alıyor.` : `${x.name} yalnızca karşılıklı takipleştiği kişilerden mesaj alıyor.`;
}

/** Why `from` may not call `to` now (their "Beni kimler arayabilir?"), or null when they may. */
export async function callRefusal(q, from, to) {
  const x = await reach(q, from, to);
  if (!x) return 'Kullanıcı bulunamadı';
  if (x.blocked) return 'Bu kişiyi arayamazsın';
  const rule = x.privacy.callsFrom;
  if (rule === 'everyone') return null;
  if (rule === 'nobody') return `${x.name} şu an arama kabul etmiyor.`;
  if (x.owner_follows) return null;
  // Calling back: the owner called `from` in the last 24 hours.
  const back = await q.query("SELECT 1 FROM calls WHERE caller = $1 AND callee = $2 AND kind = 'call' AND created_at > now() - interval '24 hours' LIMIT 1", [to, from]);
  if (back.rowCount) return null;
  return `${x.name} yalnızca takip ettiği kişilerden arama alıyor.`;
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
async function hiddenFrom(q, viewer, ids) {
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

/** True when `owner`'s follower and following lists are closed to `viewer` (profilePublic off, not followed). */
export const listsHidden = async (q, viewer, owner) => (await hiddenFrom(q, viewer, [owner])).has(owner);

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
    set[COLUMN[k]] = v;
  }
  if (!Object.keys(set).length) throw new HttpError(400, 'Değişecek ayar yok');
  return set;
}
const ALL_DEFAULT = Object.entries(COLUMN)
  .map(([k, col]) => `${col} = ${typeof PRIVACY_DEFAULTS[k] === 'boolean' ? PRIVACY_DEFAULTS[k] : `'${PRIVACY_DEFAULTS[k]}'`}`)
  .join(' AND ');

export const privacyRoutes = {
  async 'GET /api/me/privacy'(req) {
    const me = await auth(req);
    return { privacy: await privacyOf(db, me.id) };
  },

  /** Changes some of my settings; the answer is all of them as they are now. */
  async 'PATCH /api/me/privacy'(req) {
    const me = await auth(req);
    limit(`privacy:${me.id}`, 30, 'Çok sık değiştiriyorsun, biraz bekle');
    const set = patchOf(await readJson(req));
    const cols = Object.keys(set);
    await db.query(
      `INSERT INTO privacy_settings (user_id, ${cols.join(', ')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})
       ON CONFLICT (user_id) DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, updated_at = now()`,
      [me.id, ...cols.map((c) => set[c])],
    );
    // Back to every default: nothing to keep.
    await db.query(`DELETE FROM privacy_settings WHERE user_id = $1 AND ${ALL_DEFAULT}`, [me.id]);
    return { privacy: await privacyOf(db, me.id) };
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
