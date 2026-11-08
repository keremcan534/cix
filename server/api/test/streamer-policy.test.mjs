// Streamer rules (agency-lib.mjs streamer_policy, agency-ops.mjs streamerState) against a real Postgres: only
// women's accounts are streamers and earn commission; a code or link joins at once in the first days after
// sign-up, later only by a transfer the centre approves; no leaving without a transfer; a second account on the
// same device goes to the first account's agency. Also Gelir's sources (GET /api/wallet/income).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ AGENCY_JOBS: '0' });
const { call, signUp } = h;

async function account(name, gender = 'Kadın') {
  const s = await signUp(name);
  if (gender) await h.sql.query('UPDATE users SET gender = $2 WHERE id = $1', [s.user.id, gender]);
  return { id: s.user.id, name, session: s.session, get: (p) => call('GET', p, null, s.session), post: (p, b) => call('POST', p, b, s.session) };
}
const ok = ([st, j], msg = '') => {
  assert.equal(st, 200, `${msg} ${j?.error ?? ''}`);
  return j;
};
const refused = ([st, j], code, msg = '') => {
  assert.equal(st, code, `${msg}: beklenen ${code}, gelen ${st} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
};
const ref = () => `t${rnd(8)}`;
const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;
const codeOf = async (a) => (await q('SELECT code FROM agencies WHERE id = $1', [a.id]))[0].code;
const sameDevice = async (...who) => {
  const [d] = await q("INSERT INTO device_registry (platform, install_hash) VALUES ('android', $1) RETURNING id", [`i${rnd(8)}`]);
  for (const w of who) await q('INSERT INTO device_accounts (device_id, user_id) VALUES ($1, $2)', [d.id, w.id]);
};

let admin, X, Y;
describe('Yayıncı kuralları', () => {
  test('hazırlık: iki ajans', async () => {
    admin = await account('Merkez', null);
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    const [ox, oy] = await Promise.all([account('X Sahip', null), account('Y Sahip', null)]);
    X = ok(await admin.post('/api/admin/agency/create', { name: 'Ege Ajans', owner: ox.id })).agency;
    Y = ok(await admin.post('/api/admin/agency/create', { name: 'Marmara Ajans', owner: oy.id })).agency;
    X.owner = ox;
    Y.owner = oy;
  });

  test('yalnız kadın hesaplar yayıncı olur; cinsiyet bir kez seçilir', async () => {
    const none = await account('Seçmemiş', null);
    assert.match(refused(await none.post('/api/agency/join', { code: await codeOf(X) }), 403).error, /cinsiyetini seç/);
    const man = await account('Erkek Hesap', 'Erkek');
    assert.match(refused(await man.post('/api/agency/join', { code: await codeOf(X) }), 403).error, /yalnız kadın/);
    refused(await X.owner.post('/api/agency/invite', { id: X.id, user: man.id }), 409, 'erkek davet edilemez');
    assert.equal(ok(await man.get('/api/agency/me')).streamer.eligible, false);
    // Invite search does not offer men.
    const found = ok(await X.owner.get(`/api/agency/invite/search?id=${X.id}&q=${encodeURIComponent('Erkek Hesap')}`)).users;
    assert.deepEqual(found, []);
    // Set once: the same value again is fine, another one is refused.
    ok(await call('PATCH', '/api/me', { gender: 'Erkek' }, man.session));
    refused(await call('PATCH', '/api/me', { gender: 'Kadın' }, man.session), 409, 'cinsiyet değişmez');
    ok(await call('PATCH', '/api/me', { gender: 'Kadın' }, none.session));
    assert.equal(ok(await none.post('/api/agency/join', { code: await codeOf(X) })).membership.agency.id, X.id);
  });

  test('kodla doğrudan katılınır; transfersiz ayrılınamaz', async () => {
    const w = await account('Yeni Yayıncı');
    const me = ok(await w.get('/api/agency/me')).streamer;
    assert.equal(me.held, false);
    assert.equal(me.pickDays, 3);
    assert.ok(new Date(me.pickUntil) > new Date());
    const j = ok(await w.post('/api/agency/join', { code: await codeOf(X), method: 'link' }));
    assert.equal(j.membership.agency.id, X.id);
    assert.equal(j.sameDevice, false);
    assert.match(refused(await w.post('/api/agency/transfer', { reason: 'Ayrılmak istiyorum', ref: ref() }), 409).error, /transfer talebi/);
    // A move is still possible: it is a transfer request.
    const t = ok(await w.post('/api/agency/transfer', { toCode: await codeOf(Y), reason: 'Marmaraya geçiyorum', ref: ref() })).transfer;
    assert.deepEqual(t.needs, ['from', 'to']);
  });

  test('3 gün içinde ajans seçmeyen merkezde kalır; yalnız merkezin onayladığı transferle geçer', async () => {
    const late = await account('Geç Kalan');
    await q("UPDATE users SET created_at = now() - interval '4 days' WHERE id = $1", [late.id]);
    assert.equal(ok(await late.get('/api/agency/me')).streamer.held, true);
    assert.match(refused(await late.post('/api/agency/join', { code: await codeOf(X) }), 409).error, /transfer talebi/);
    refused(await late.post('/api/agency/join', { code: await codeOf(X), method: 'application' }), 409, 'başvuru da olmaz');
    refused(await X.owner.post('/api/agency/invite', { id: X.id, user: late.id }), 409, 'davet de olmaz');
    refused(await late.post('/api/agency/transfer', { reason: 'Ayrılmak', ref: ref() }), 400, 'hedefsiz');
    const t = ok(await late.post('/api/agency/transfer', { toCode: await codeOf(X), reason: 'Ege ajansına katılmak istiyorum', ref: ref() })).transfer;
    assert.deepEqual(t.needs, ['to', 'center']);
    assert.equal(t.from, null);
    assert.equal(ok(await X.owner.post('/api/agency/transfers/approve', { id: X.id, transferId: t.id, approve: true })).transfer.status, 'pending', 'merkez de onaylamalı');
    assert.equal(ok(await admin.post('/api/admin/agency/transfers/decide', { transferId: t.id, approve: true, note: 'Uygun' })).transfer.status, 'completed');
    const m = ok(await late.get('/api/agency/me')).membership;
    assert.equal(m.agency.id, X.id);
    assert.equal(m.method, 'transfer');
    // Someone who was in an agency before is held too (not only after the first days).
    const fresh = await account('Eski Üye');
    await q("INSERT INTO agency_streamers (streamer_id, agency_id, method, joined_at, ended_at, end_reason) VALUES ($1, $2, 'code', now() - interval '1 day', now(), 'admin')", [fresh.id, Y.id]);
    assert.equal(ok(await fresh.get('/api/agency/me')).streamer.held, true);
  });

  test('aynı cihazdaki ikinci hesap ilk hesabın ajansına bağlanır; işlem önceki çift kaydı da taşır', async () => {
    const [first, second, third] = await Promise.all([account('İlk Hesap'), account('İkinci Hesap'), account('Üçüncü Hesap')]);
    await sameDevice(first, second, third);
    ok(await first.post('/api/agency/join', { code: await codeOf(X) }));
    const j = ok(await second.post('/api/agency/join', { code: await codeOf(Y) }));
    assert.equal(j.membership.agency.id, X.id);
    assert.equal(j.sameDevice, true);
    assert.equal((await q("SELECT count(*)::int AS n FROM agency_audit WHERE action = 'streamer.multi_account' AND target_id = $1", [second.id]))[0].n, 1);
    // A link from before the rule (or around it): the job moves it to the first agency.
    await q("INSERT INTO agency_streamers (streamer_id, agency_id, method) VALUES ($1, $2, 'code')", [third.id, Y.id]);
    const r = ok(await admin.post('/api/admin/agency/jobs/run', {}));
    assert.ok(r.multiAccount >= 1, JSON.stringify(r));
    const links = await q('SELECT agency_id, end_reason, method FROM agency_streamers WHERE streamer_id = $1 ORDER BY joined_at, id', [third.id]);
    assert.deepEqual(
      links.map((l) => [l.agency_id, l.end_reason, l.method]),
      [
        [Y.id, 'multi_account', 'code'],
        [X.id, null, 'transfer'],
      ],
    );
  });

  test('erkek hesap üzerinden ajans komisyonu olmaz; eski kayıtlı erkek hesap ajanstan çıkar', async () => {
    const man = await account('Eski Erkek Yayıncı', 'Erkek');
    await q("INSERT INTO agency_streamers (streamer_id, agency_id, method) VALUES ($1, $2, 'admin')", [man.id, Y.id]);
    const inc = ok(await admin.post('/api/admin/agency/income', { streamer: man.id, type: 'gift', diamonds: 10000, ref: ref() }));
    const [ev] = await q("SELECT calc_status FROM income_events WHERE streamer_id = $1", [man.id]);
    assert.equal(ev.calc_status, 'excluded', JSON.stringify(inc));
    assert.equal((await q('SELECT count(*)::int AS n FROM agency_commissions WHERE streamer_id = $1', [man.id]))[0].n, 0);
    const r = ok(await admin.post('/api/admin/agency/jobs/run', {}));
    assert.ok(r.policyGender >= 1);
    const [l] = await q('SELECT ended_at, end_reason FROM agency_streamers WHERE streamer_id = $1', [man.id]);
    assert.ok(l.ended_at);
    assert.equal(l.end_reason, 'policy_gender');
  });

  test('Gelir kaynakları: oda, Anlar, profil hediyeleri ayrı; arama ve mesaj ücreti 0 (birebir yoksa)', async () => {
    const [giver, host] = await Promise.all([account('Veren', null), account('Alan')]);
    await q("INSERT INTO coin_lots (user_id, channel, amount, remaining, lock_hours, ref) VALUES ($1, 'google', 100000, 100000, 0, $2)", [giver.id, ref()]);
    await q('UPDATE users SET coins = coins + 100000 WHERE id = $1', [giver.id]);
    const gift = (await call('GET', '/api/catalog'))[1].gifts.find((g) => g.price >= 10 && !g.minSvip);
    ok(await giver.post('/api/gifts/send', { to: host.id, giftId: gift.id, count: 1, room: 'oda1', ref: ref() }), 'oda');
    ok(await giver.post('/api/gifts/send', { to: host.id, giftId: gift.id, count: 1, place: 'moment', ref: ref() }), 'anlar');
    ok(await giver.post('/api/gifts/send', { to: host.id, giftId: gift.id, count: 1, place: 'profile', ref: ref() }), 'profil');
    ok(await giver.post('/api/gifts/send', { to: host.id, giftId: gift.id, count: 1, place: 'nereye', ref: ref() }), 'bilinmeyen yer');
    const inc = ok(await host.get('/api/wallet/income?period=day'));
    const by = Object.fromEntries(inc.sources.map((s) => [s.key, s]));
    assert.equal(by.room.diamonds, gift.price);
    assert.equal(by.moment.diamonds, gift.price);
    assert.equal(by.profile.diamonds, gift.price);
    assert.equal(by.other.diamonds, gift.price);
    assert.equal(by.chat.diamonds, 0);
    assert.equal(by.voice_call.diamonds, 0);
    assert.equal(by.message_fee.diamonds, 0);
    assert.equal(inc.total, gift.price * 4);
    refused(await host.get('/api/wallet/income?period=year'), 400);
  });
});
