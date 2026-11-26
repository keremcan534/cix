// Who is a streamer and who may take money out of the app (the owners' rules, 18 Nov 2026, docs/YAYINCI_KURALLARI.md).
//
// A streamer: an agency's owner and the owner of a family of at least `family_cashout_members` people, whatever their
// gender; a woman with an approved place in an agency; a woman held by the centre, who chose no agency in the first
// pick_days days after signing up or left one (agency-ops.mjs streamerState calls her "held").
// Taking money out (Para Çek, and selling diamonds to a Jeton Noktası): women, agency owners and those family owners.
// A man's account can't, and neither can an account that has not said its gender (a man could otherwise just not say).
// Çevir (diamonds into coins) stays open to everyone: nothing leaves the app. A Jeton Noktası account keeps selling
// coins: management gave it that role.
// When Canlı ayarlar › Kimlik doğrulama require it (verify_payout_required) and the provider is set up, taking money
// out also needs an approved ID check (verify.mjs), and so does an agency's payout (its owner's).
import { HttpError, env } from './core.mjs';
import { live } from './live-settings.mjs';
import { providerReady } from './verify-rules.mjs';

/** Whether money out needs an approved ID check now: the switch is on and the provider has its keys. */
export const idRequired = () => live().verifyPayout === 1 && providerReady(env, 'id');
/** The sentence an account without the check hears (older apps show it as it is). */
export const ID_WHY = 'Para çekmek için önce kimliğini doğrula: Ben › Kimlik Doğrulamam. Bu bölümü göremiyorsan uygulamanı güncelle.';
const ID_OK = "EXISTS (SELECT 1 FROM identity_checks i WHERE i.user_id = u.id AND i.kind = 'id' AND i.status = 'approved')";

/** streamer_policy.pick_days as last saved (agency-lib.mjs DEFAULTS: 3). */
const PICK_DAYS = `coalesce((SELECT (p.value->>'pick_days')::int FROM agency_settings p WHERE p.key = 'streamer_policy' ORDER BY p.created_at DESC, p.id DESC LIMIT 1), 3)`;

/**
 * One streamer per phone (owners, 26 Nov 2026): whether another account seen on a phone account `x` was used on
 * (device_accounts; a reinstall or a reset is the same device) already holds the phone's streamer place: it streams
 * for an agency, owns one, or is a woman account opened there before `x` (she holds it from the start, whether the
 * centre holds her yet or not). Such an `x` stays an ordinary user: no "Yayıncı ol", no agency, never held.
 */
export const deviceTakenSql = (x) =>
  `EXISTS (SELECT 1 FROM device_accounts d1 JOIN device_accounts d2 ON d2.device_id = d1.device_id AND d2.user_id <> d1.user_id
             JOIN users o ON o.id = d2.user_id AND o.deleted_at IS NULL
            WHERE d1.user_id = ${x}
              AND (EXISTS (SELECT 1 FROM agency_streamers s WHERE s.streamer_id = o.id AND s.ended_at IS NULL)
                   OR EXISTS (SELECT 1 FROM agencies a WHERE a.owner_id = o.id AND a.status = 'approved')
                   OR (o.gender = 'Kadın' AND o.created_at < (SELECT x.created_at FROM users x WHERE x.id = ${x}))))`;

/** Whether account `x` (an SQL expression) owns an approved agency. */
export const agencyOwnerSql = (x) => `EXISTS (SELECT 1 FROM agencies a WHERE a.owner_id = ${x} AND a.status = 'approved')`;

/** Whether account `x` leads an open family that is big enough (Canlı ayarlar family_cashout_members). */
export const familyOwnerSql = (x, members = live().familyCashoutMembers) =>
  `EXISTS (SELECT 1 FROM family_members o JOIN families f ON f.id = o.family_id AND f.closed_at IS NULL
            WHERE o.user_id = ${x} AND o.role = 'owner' AND (SELECT count(*) FROM family_members m WHERE m.family_id = o.family_id) >= ${Number(members)})`;

/**
 * Whether account `x` is a woman the centre holds at instant `at` (SQL; the yönetim yayıncısı): in no agency then,
 * and either never in one and past her days to pick one after signing up, or out of one: at once when it ended for
 * any reason but inactivity; after an inactivity drop (agency-activity.mjs, 60 days offline) only once she came back
 * and her days to pick one again from her return passed without joining one (owners, 24 Nov 2026).
 */
export const heldWomanAtSql = (x, at) =>
  `EXISTS (SELECT 1 FROM users w WHERE w.id = ${x} AND w.gender = 'Kadın' AND w.deleted_at IS NULL AND NOT ${deviceTakenSql('w.id')}
              AND NOT EXISTS (SELECT 1 FROM agency_streamers l WHERE l.streamer_id = w.id AND l.joined_at < ${at} AND (l.ended_at IS NULL OR l.ended_at >= ${at}))
              AND CASE WHEN EXISTS (SELECT 1 FROM agency_streamers l WHERE l.streamer_id = w.id AND l.joined_at < ${at})
                       THEN (SELECT l.end_reason IS DISTINCT FROM 'inactive' OR (l.returned_at IS NOT NULL AND l.returned_at <= ${at} - make_interval(days => ${PICK_DAYS}))
                               FROM agency_streamers l WHERE l.streamer_id = w.id AND l.joined_at < ${at} ORDER BY l.joined_at DESC LIMIT 1)
                       ELSE ${PICK_DAYS} > 0 AND w.created_at <= ${at} - make_interval(days => ${PICK_DAYS}) END)`;

/** heldWomanAtSql now. */
export const heldWomanSql = (x) => heldWomanAtSql(x, 'now()');

/** Whether account `x` (an SQL expression) is a streamer now. */
export const streamerSql = (x) =>
  `(EXISTS (SELECT 1 FROM agency_streamers s WHERE s.streamer_id = ${x} AND s.ended_at IS NULL AND s.contract = 'approved')
    OR ${agencyOwnerSql(x)} OR ${familyOwnerSql(x)} OR ${heldWomanSql(x)})`;

/**
 * What kind of streamer account `x` is, for staff (Yönetim › Kullanıcılar): 'agency' (a woman in an agency, contract
 * approved), 'management' (a woman the centre holds: the yönetim yayıncısı), 'agency_owner', 'family_owner'; null
 * when not a streamer. An agency owner who is also held counts as an owner.
 */
export const streamerKindSql = (x) =>
  `(CASE WHEN ${agencyOwnerSql(x)} THEN 'agency_owner'
         WHEN EXISTS (SELECT 1 FROM agency_streamers s WHERE s.streamer_id = ${x} AND s.ended_at IS NULL AND s.contract = 'approved') THEN 'agency'
         WHEN ${heldWomanSql(x)} THEN 'management'
         WHEN ${familyOwnerSql(x)} THEN 'family_owner' END)`;

/** Whether `uid` is a streamer now. */
export const isStreamer = async (q, uid) => (await q.query(`SELECT ${streamerSql('$1::uuid')} AS yes`, [uid])).rows[0].yes;

/**
 * Whether `uid` may take money out: { allowed, code, why } (code and why are null when allowed). `id: false` leaves
 * the ID check out (verify.mjs asks who may open one).
 */
export async function cashOutOf(q, uid, { id = true } = {}) {
  const members = live().familyCashoutMembers;
  const r = (await q.query(`SELECT u.gender, ${agencyOwnerSql('u.id')} AS agency, ${familyOwnerSql('u.id', members)} AS family, ${ID_OK} AS id_ok FROM users u WHERE u.id = $1`, [uid])).rows[0];
  if (!r) throw new HttpError(404, 'Kullanıcı bulunamadı');
  if (r.agency || r.family || r.gender === 'Kadın') {
    if (id && !r.id_ok && idRequired()) return { allowed: false, code: 'id_required', why: ID_WHY };
    return { allowed: true, code: null, why: null };
  }
  if (r.gender === 'Erkek') {
    return {
      allowed: false,
      code: 'men_no_cashout',
      why: `Erkek hesaplar para çekemez ve elmas bozduramaz; ajans sahipleri ile en az ${members} üyeli ailenin sahibi hariç. Elmaslarını Çevir ile jetona çevirebilirsin.`,
    };
  }
  return { allowed: false, code: 'gender_needed', why: 'Para çekmek için önce profilinden cinsiyetini seç.' };
}

/** Refuses (403, with the reason's code) someone who may not take money out; nothing has moved yet. */
export async function assertCashOut(q, uid) {
  const s = await cashOutOf(q, uid);
  if (!s.allowed) throw Object.assign(new HttpError(403, s.why), { extra: { code: s.code } });
}

/** Refuses (403 id_required) an agency's payout while its owner `ownerId` has no approved ID check and one is required. */
export async function assertOwnerId(q, ownerId) {
  if (!idRequired()) return;
  const ok = (await q.query(`SELECT ${ID_OK} AS ok FROM users u WHERE u.id = $1`, [ownerId])).rows[0]?.ok;
  if (!ok) throw Object.assign(new HttpError(403, 'Ajans ödemesi için önce ajans sahibinin kimliği doğrulanmalı: Ben › Kimlik Doğrulamam. Bu bölümü göremiyorsan uygulamanı güncelle.'), { extra: { code: 'id_required' } });
}
