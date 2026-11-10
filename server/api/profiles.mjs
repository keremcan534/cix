// Other people's profiles, the rest of what the profile screen and the Ana Sayfa cards show (social.mjs has the basics).
//
//   GET   /api/user (social.mjs) also carries, from here: levels, friends, giftsReceived, staff, extras, photos
//   GET   /api/discover (social.mjs): each person's levels and country, read for the whole list at once
//   GET   /api/user/showcase?id=          → { gifts, rides, entries, medals, titles }   (Vitrin)
//   PATCH /api/me/extras { height?, weight?, job?, languages?, zodiac?, tags?, relationship?, education?, slogan?,
//                          country?, genderHidden?, hideWealth?, hideCharm? }             → { extras }
//   POST  /api/me/photos        { url }   → { photos }   (Albüm: a photo I put in the storage, kind 'album')
//   POST  /api/me/photos/remove { id }    → { photos }
//
// Levels: Cömertlik from the coins a person spent (wheel.mjs wealthPoints), Yankı from the diamonds others gave them
// (wallet.mjs charmPoints), as levels only: the points would tell others what someone spends or earns. A list reads
// them for everyone in it in a few queries, and keeps them a minute (LEVELS_CACHE_MS) so Ana Sayfa's refresh stays
// cheap. "Seviyeyi Gizle" (hideWealth, hideCharm; a VIP right, VIP 1 and up by İnci or Rütbe) sends that level as
// null, while the person has VIP.
// Friends are people who follow each other. The gift wall and the "Hediye" count are the gifts of the catalog this
// person received (gift_events). Rides and entry effects are what they own in the shop now (economy.mjs). Medals
// and titles are earned by the rules in profile-rules.mjs on these same records; nothing here is made up.
//
// Extras are typed by the person, all optional, and shown on their public profile. They are kept until the person
// clears them (an empty value clears a field; no history is kept) or deletes the account. Free text (job, slogan)
// goes through the contact filter like the name and bio. The album keeps at most ALBUM_MAX photos, each until it is
// removed; a removed photo leaves the storage. "Gizli" gender (genderHidden) keeps the gender for what needs it
// (Keşfet's men-see-women rule, 1v1 matching and who pays there, the agency streamer rule) and stops it going out to
// other people (core.mjs profileOf, moments, families). Everything here goes with the account (social.mjs
// eraseAccount; the album files with media.mjs removeUserFiles). Someone who blocked me can't be read.
import { HttpError, auth, db, env, int, limit, publicText, readJson, tx, userId } from './core.mjs';
import { GIFTS, vipLevelOf } from './catalog.mjs';
import { LIVE, statusOf } from './economy.mjs';
import { topBoard } from './gifts.mjs';
import { removeFiles, verifyUpload } from './media.mjs';
import { ALBUM_MAX, CHARM_XP, COUNTRIES, EDUCATION, EXTRA_LIMITS as L, LANGUAGES, MEDAL_RULES, RELATIONSHIP, TAGS, TITLE_RULES, WEALTH_XP, ZODIACS, levelFrom } from './profile-rules.mjs';
import { roomLevel } from './rooms.mjs';
import { charmPointsOf } from './wallet.mjs';
import { wealthPointsOf } from './wheel.mjs';

const GIFT_IDS = [...GIFTS.keys()];
const STAFF = { admin: 'admin', moderator: 'moderator' };
/** How many friends $1 has: people they follow who follow them back (blocking ends both follows). */
const FRIENDS = `SELECT count(*) FROM follows a JOIN follows b ON b.follower = a.followee AND b.followee = a.follower
  JOIN users f ON f.id = a.followee AND f.deleted_at IS NULL WHERE a.follower = $1`;

// --- Levels --------------------------------------------------------------------------------------------------------
const CACHE_MS = (() => {
  const n = Number(env.LEVELS_CACHE_MS ?? 60_000);
  return Number.isSafeInteger(n) && n >= 0 ? n : 60_000;
})();
const cached = new Map();

/**
 * { wealth, charm } levels of each person in `ids`, two queries for all of them. `fresh`: read now (a profile
 * opened); otherwise a value read in the last minute is used. Only levels leave the server, never the points.
 */
export async function levelsOf(ids, { fresh = false } = {}) {
  const now = Date.now();
  const out = {};
  const need = [];
  for (const id of new Set(ids)) {
    const c = cached.get(id);
    if (!fresh && c && now - c.at < CACHE_MS) out[id] = c.levels;
    else need.push(id);
  }
  if (need.length) {
    const [wealth, charm] = await Promise.all([wealthPointsOf(db, need), charmPointsOf(db, need)]);
    for (const id of need) {
      out[id] = { wealth: levelFrom(WEALTH_XP, wealth.get(id) ?? 0), charm: levelFrom(CHARM_XP, charm.get(id) ?? 0) };
      cached.set(id, { at: now, levels: out[id] });
    }
    // The cache holds only recent people: old entries go when it grows.
    if (cached.size > 5000) for (const [id, c] of cached) if (now - c.at >= CACHE_MS) cached.delete(id);
  }
  return out;
}

// --- Extras --------------------------------------------------------------------------------------------------------
const EMPTY = { height: null, weight: null, job: null, languages: [], zodiac: null, tags: [], relationship: null, education: null, slogan: null, country: null };
const extrasView = (x) =>
  x
    ? {
        height: x.height_cm ?? null,
        weight: x.weight_kg ?? null,
        job: x.job ?? null,
        languages: x.languages ?? [],
        zodiac: x.zodiac ?? null,
        tags: x.tags ?? [],
        relationship: x.relationship ?? null,
        education: x.education ?? null,
        slogan: x.slogan ?? null,
        country: x.country ?? null,
      }
    : { ...EMPTY };

/** Each person's country (Keşfet's filter and flag), for a list at once. */
export async function countriesOf(ids) {
  if (!ids.length) return {};
  const r = await db.query('SELECT user_id, country FROM profile_extras WHERE user_id = ANY($1::uuid[]) AND country IS NOT NULL', [ids]);
  return Object.fromEntries(r.rows.map((x) => [x.user_id, x.country]));
}

/** Who of `ids` hides which level from others now: they chose to, and they have VIP (else it shows again). */
async function hiddenOf(ids) {
  if (!ids.length) return {};
  const r = await db.query(
    `SELECT x.user_id, x.hide_wealth, x.hide_charm, u.svip_xp,
            (SELECT max(e.tier) FROM entitlements e WHERE e.user_id = x.user_id AND e.kind = 'noble' AND ${LIVE}) AS noble
       FROM profile_extras x JOIN users u ON u.id = x.user_id
      WHERE x.user_id = ANY($1::uuid[]) AND (x.hide_wealth OR x.hide_charm)`,
    [ids],
  );
  const out = {};
  for (const x of r.rows) if (vipLevelOf(x.svip_xp, x.noble === null ? null : Number(x.noble)) >= 1) out[x.user_id] = { wealth: x.hide_wealth, charm: x.hide_charm };
  return out;
}

/** The levels others may see: a hidden one is null. */
async function shownLevels(ids, opts) {
  const [levels, hidden] = await Promise.all([levelsOf(ids, opts), hiddenOf(ids)]);
  return Object.fromEntries(ids.map((id) => [id, { wealth: hidden[id]?.wealth ? null : (levels[id]?.wealth ?? 0), charm: hidden[id]?.charm ? null : (levels[id]?.charm ?? 0) }]));
}

/** What GET /api/discover adds to each card: the levels and the country. */
export async function cardsMore(ids) {
  const [levels, countries] = await Promise.all([shownLevels(ids), countriesOf(ids)]);
  return Object.fromEntries(ids.map((id) => [id, { levels: levels[id], country: countries[id] ?? null }]));
}

const photosOf = async (id) =>
  (await db.query('SELECT id, url FROM profile_photos WHERE user_id = $1 ORDER BY id DESC', [id])).rows.map((x) => ({ id: Number(x.id), url: x.url }));

/**
 * What GET /api/user adds for person `u` (a users row): read fresh, a handful of queries for one profile. `self`: my
 * own profile, which also says which of my levels others don't see now (levelsHidden).
 */
export async function profileMore(u, self = false) {
  const [levels, counts, extras, photos] = await Promise.all([
    shownLevels([u.id], { fresh: true }),
    db.query(
      `SELECT (${FRIENDS}) AS friends,
              (SELECT coalesce(sum(count), 0) FROM gift_events WHERE recipient = $1 AND gift_id = ANY($2::text[])) AS gifts`,
      [u.id, GIFT_IDS],
    ),
    db.query('SELECT * FROM profile_extras WHERE user_id = $1', [u.id]),
    photosOf(u.id),
  ]);
  return {
    levels: levels[u.id],
    friends: Number(counts.rows[0].friends),
    giftsReceived: Number(counts.rows[0].gifts),
    // Staff are shown as such (Yönetici / Moderatör), so people can tell the real team from someone posing as it.
    staff: STAFF[u.role] ?? null,
    extras: extrasView(extras.rows[0]),
    photos,
    ...(self && { levelsHidden: { wealth: levels[u.id].wealth === null, charm: levels[u.id].charm === null } }),
  };
}

/** A choice from `list`, or null for an empty one; anything else is a 400 naming `label`. */
const oneOf = (v, list, label) => {
  if (v === null || v === '') return null;
  if (typeof v !== 'string' || !list.includes(v)) throw new HttpError(400, `Geçersiz ${label}`);
  return v;
};
/** Up to `max` different choices from `list`. */
const someOf = (v, list, max, label) => {
  if (v === null) return [];
  if (!Array.isArray(v) || v.length > max || v.some((x) => !list.includes(x))) throw new HttpError(400, `${label}: en fazla ${max}, listeden`);
  return [...new Set(v)];
};
/** A whole number from `min` to `max`, or null for none (0, null). */
const range = (v, min, max, label) => {
  if (v === null || v === 0) return null;
  const n = int(v, min, max);
  if (n === null) throw new HttpError(400, `${label} ${min}–${max} arasında olmalı`);
  return n;
};

/** The person who may read `id`'s profile parts: refused when either side blocked the other. */
async function readable(me, id) {
  const r = await db.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!r.rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
  // Like GET /api/user: someone who blocked me doesn't exist for me.
  if (id !== me.id && (await db.query('SELECT 1 FROM blocks WHERE blocker = $1 AND blocked = $2', [id, me.id])).rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
  return r.rows[0];
}

// --- Vitrin ----------------------------------------------------------------------------------------------------------
/** This week's top receivers (Haftanın Yıldızı), read again at most once a minute (LEVELS_CACHE_MS). */
let weekTop = { at: 0, rows: [] };
async function weekStars() {
  if (Date.now() - weekTop.at >= CACHE_MS) weekTop = { at: Date.now(), rows: await topBoard('charm', 'week', MEDAL_RULES.weekTop) };
  return weekTop.rows;
}

/** Medals and titles of person `u` (a users row) by the rules of profile-rules.mjs, from server records only. */
async function honoursOf(u, friends) {
  const [week, given] = await Promise.all([
    weekStars(),
    db.query('SELECT count(DISTINCT recipient) AS n FROM gift_events WHERE sender = $1', [u.id]),
  ]);
  // A Yankı level its owner hides earns nothing that would show it.
  const charm = (await shownLevels([u.id], { fresh: true }))[u.id].charm ?? 0;
  const days = (Date.now() - new Date(u.created_at).getTime()) / 86_400_000;
  const medals = [
    week.some((x) => x.user.id === u.id) && 'md1',
    Number(given.rows[0].n) >= MEDAL_RULES.generousPeople && 'md4',
    friends >= MEDAL_RULES.friends && 'md6',
  ].filter(Boolean);
  const titles = [
    roomLevel(Number(u.room_xp ?? 0)) >= TITLE_RULES.roomLevel && 't2',
    days <= TITLE_RULES.risingDays && charm >= TITLE_RULES.risingCharm && 't5',
  ].filter(Boolean);
  return { medals, titles };
}

export const profileRoutes = {
  /**
   * Vitrin: the gifts of the catalog this person received, by gift (most first); the rides and entry effects they
   * own now (sku, the shop's); their medals and titles (honoursOf).
   */
  async 'GET /api/user/showcase'(req, url) {
    const me = await auth(req);
    const u = await readable(me, userId(url.searchParams.get('id')));
    const [gifts, owned, friends] = await Promise.all([
      db.query('SELECT gift_id, sum(count)::int AS n FROM gift_events WHERE recipient = $1 AND gift_id = ANY($2::text[]) GROUP BY gift_id ORDER BY n DESC, gift_id', [u.id, GIFT_IDS]),
      db.query(
        `SELECT DISTINCT e.kind, e.sku FROM entitlements e
          WHERE e.user_id = $1 AND e.kind IN ('ride', 'entry') AND e.revoked_at IS NULL AND e.starts_at <= now() AND (e.ends_at IS NULL OR e.ends_at > now())
          ORDER BY e.kind, e.sku`,
        [u.id],
      ),
      db.query(`SELECT (${FRIENDS}) AS n`, [u.id]),
    ]);
    return {
      gifts: gifts.rows.map((x) => ({ id: x.gift_id, count: x.n })),
      rides: owned.rows.filter((x) => x.kind === 'ride').map((x) => x.sku),
      entries: owned.rows.filter((x) => x.kind === 'entry').map((x) => x.sku),
      ...(await honoursOf(u, Number(friends.rows[0].n))),
    };
  },

  /** My extras: only the fields sent change; an empty one (null, '', 0, []) clears it. Answers them all. */
  async 'PATCH /api/me/extras'(req) {
    const u = await auth(req);
    const b = await readJson(req);
    const set = {};
    if (b.height !== undefined) set.height_cm = range(b.height, L.heightMin, L.heightMax, 'Boy');
    if (b.weight !== undefined) set.weight_kg = range(b.weight, L.weightMin, L.weightMax, 'Kilo');
    // Free text others read: the contact filter, like the name and bio (counted as a refusal at its place).
    if (b.job !== undefined) set.job = b.job === null ? null : (await publicText(b.job, 0, L.job, 'Meslek', u, 'profile.job', 'job')) || null;
    if (b.slogan !== undefined) set.slogan = b.slogan === null ? null : (await publicText(b.slogan, 0, L.slogan, 'Arkadaşlık sloganı', u, 'profile.slogan', 'slogan')) || null;
    if (b.languages !== undefined) set.languages = someOf(b.languages, LANGUAGES, L.languages, 'Diller');
    if (b.tags !== undefined) set.tags = someOf(b.tags, TAGS, L.tags, 'Kişilik etiketleri');
    if (b.zodiac !== undefined) set.zodiac = oneOf(b.zodiac, ZODIACS, 'burç');
    if (b.relationship !== undefined) set.relationship = oneOf(b.relationship, RELATIONSHIP, 'ilişki durumu');
    if (b.education !== undefined) set.education = oneOf(b.education, EDUCATION, 'eğitim');
    if (b.country !== undefined) set.country = oneOf(b.country, COUNTRIES, 'ülke');
    if (b.genderHidden !== undefined && typeof b.genderHidden !== 'boolean') throw new HttpError(400, 'Geçersiz cinsiyet görünürlüğü');
    for (const [k, col] of [['hideWealth', 'hide_wealth'], ['hideCharm', 'hide_charm']]) {
      if (b[k] === undefined) continue;
      if (typeof b[k] !== 'boolean') throw new HttpError(400, 'Geçersiz seviye görünürlüğü');
      // Hiding is a VIP right (as Profil ziyaretçileri: VIP 1 and up); showing again is always allowed.
      if (b[k] && vipLevelOf(u.svip_xp, (await statusOf(db, u.id)).noble?.tier) < 1) throw new HttpError(403, 'Seviyeleri gizlemek VIP ayrıcalığıdır');
      set[col] = b[k];
    }
    const keys = Object.keys(set);
    await tx(async (c) => {
      if (keys.length) {
        await c.query(
          `INSERT INTO profile_extras (user_id, ${keys.join(', ')}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})
           ON CONFLICT (user_id) DO UPDATE SET ${keys.map((k) => `${k} = EXCLUDED.${k}`).join(', ')}, updated_at = now()`,
          [u.id, ...keys.map((k) => set[k])],
        );
      }
      if (b.genderHidden !== undefined) await c.query('UPDATE users SET gender_hidden = $2 WHERE id = $1', [u.id, b.genderHidden]);
    });
    const r = await db.query('SELECT x.*, u.gender_hidden FROM users u LEFT JOIN profile_extras x ON x.user_id = u.id WHERE u.id = $1', [u.id]);
    const x = r.rows[0];
    return { extras: { ...extrasView(x.user_id ? x : null), genderHidden: x.gender_hidden, hideWealth: !!x.hide_wealth, hideCharm: !!x.hide_charm } };
  },

  /** Albüm: adds a photo I uploaded (kind 'album'), within its type and size; at most ALBUM_MAX. Newest first. */
  async 'POST /api/me/photos'(req) {
    const u = await auth(req);
    limit(`album:${u.id}`, 20, 'Çok hızlı ekliyorsun, biraz bekle');
    const b = await readJson(req);
    const base = (env.S3_PUBLIC_URL ?? '').replace(/\/$/, '');
    const mine = `${base}/album/${u.id}/`;
    if (!base || typeof b.url !== 'string' || b.url.length > 500 || !b.url.startsWith(mine) || !/^[A-Za-z0-9._-]+$/.test(b.url.slice(mine.length))) throw new HttpError(400, 'Geçersiz fotoğraf');
    await verifyUpload(b.url, 'album');
    await tx(async (c) => {
      // One add at a time per person, so two at once can't pass the limit together.
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [u.id]);
      const n = Number((await c.query('SELECT count(*) AS n FROM profile_photos WHERE user_id = $1', [u.id])).rows[0].n);
      if (n >= ALBUM_MAX) throw new HttpError(409, `Albümde en fazla ${ALBUM_MAX} fotoğraf olur; önce birini kaldır`);
      await c.query('INSERT INTO profile_photos (user_id, url) VALUES ($1, $2) ON CONFLICT (user_id, url) DO NOTHING', [u.id, b.url]);
    });
    return { photos: await photosOf(u.id) };
  },

  /** Takes a photo out of my album; its file leaves the storage. */
  async 'POST /api/me/photos/remove'(req) {
    const u = await auth(req);
    const b = await readJson(req);
    const id = int(b.id, 1, Number.MAX_SAFE_INTEGER);
    if (!id) throw new HttpError(400, 'Geçersiz fotoğraf');
    const r = await db.query('DELETE FROM profile_photos WHERE id = $1 AND user_id = $2 RETURNING url', [id, u.id]);
    if (r.rowCount) removeFiles([r.rows[0].url], u.id);
    return { photos: await photosOf(u.id) };
  },
};
