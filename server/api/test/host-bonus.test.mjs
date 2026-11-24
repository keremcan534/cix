// Yayıncı haftalık bonusu (host-bonus.mjs) against a real Postgres: an agency's streamer or a yönetim yayıncısı who
// reached a tier in the week gets the tier's bonus in diamonds when the week closes, once, with a SimilarClub Sistem
// notice; a streamer still in her first days with no agency, and a man in no agency, get nothing; the bonus pays no agency commission and is not counted as earnings; a week closed while the
// bonus was off is skipped and staff may pay it; staff may take a bonus back.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';
import { HOST_BONUS_TIERS, addDays, weekStartOf } from '../host-bonus-rules.mjs';

const h = startApi({ AGENCY_JOBS: '0', HOST_BONUS_JOBS: '0', HOST_BONUS_TEST_CLOCK: '1' });
const { call, signUp } = h;
const ok = ([st, j], msg = '') => {
  assert.equal(st, 200, `${msg} ${j?.error ?? ''}`);
  return j;
};
const refused = ([st, j], code, msg = '') => {
  assert.equal(st, code, `${msg}: beklenen ${code}, gelen ${st} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
};
const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;

async function account(name) {
  const s = await signUp(name);
  await q("UPDATE users SET gender = 'Kadın' WHERE id = $1", [s.user.id]);
  return { id: s.user.id, session: s.session, get: (p) => call('GET', p, null, s.session), post: (p, b) => call('POST', p, b, s.session) };
}
const diamonds = async (who) => Number((await q('SELECT diamonds FROM users WHERE id = $1', [who.id]))[0].diamonds);

let admin;
async function setLive(changes) {
  const view = ok(await admin.get('/api/admin/live-settings'));
  return call('POST', '/api/admin/live-settings', { changes, reason: 'Haftalık bonus testi', baseV: view.v, confirm: true }, admin.session);
}
const week = weekStartOf();
const close = (days = 7) => admin.post('/api/admin/host-bonus/run', { at: new Date(Date.now() + days * 86_400_000).toISOString() });

describe('Yayıncı haftalık bonusu', () => {
  let owner, agencyId, s1, s2, loner, held, man, gifter;
  // `count` Taç (500 💎 each), sent in the allowed counts.
  const gift = async (to, count) => {
    for (const n of [50, 10, 5, 1]) for (; count >= n; count -= n) ok(await gifter.post('/api/gifts/send', { to: to.id, giftId: 'g5', count: n, ref: `t${rnd(8)}` }), 'hediye');
  };

  test('hazırlık: bir ajans ve iki yayıncısı, yönetim yayıncısı, ilk günlerindeki ajanssız biri, ajanssız bir erkek', async () => {
    admin = await account('Merkez');
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    owner = await account('Bonus Ajans Sahibi');
    agencyId = ok(await admin.post('/api/admin/agency/create', { name: `Bonus Ajans ${rnd(3)}`, owner: owner.id })).agency.id;
    const code = (await q('SELECT code FROM agencies WHERE id = $1', [agencyId]))[0].code;
    await q("UPDATE agencies SET status = 'approved' WHERE id = $1", [agencyId]);
    s1 = await account('Bonus Bir');
    s2 = await account('Bonus İki');
    loner = await account('Ajanssız');
    for (const s of [s1, s2]) ok(await s.post('/api/agency/join', { code }), 'katıl');
    // Yönetim yayıncısı: signed up 5 days ago (past the 3 days to pick an agency), in none.
    held = await account('Yönetim Yayıncısı');
    await q("UPDATE users SET created_at = now() - interval '5 days' WHERE id = $1", [held.id]);
    man = await account('Ajanssız Erkek');
    await q("UPDATE users SET gender = 'Erkek', created_at = now() - interval '5 days' WHERE id = $1", [man.id]);
    gifter = await account('Hediyeci');
    await h.credit(gifter.id, 200_000, { channel: 'google' });
    await gift(s1, 50); // 25.000
    await gift(s2, 18); // 9.000
    await gift(loner, 60); // 30.000
    await gift(held, 90); // 45.000
    await gift(man, 24); // 12.000
    // The agency's owner: a woman in no agency, signed up 5 days ago; an owner gets no bonus.
    await q("UPDATE users SET created_at = now() - interval '5 days' WHERE id = $1", [owner.id]);
    await gift(owner, 40); // 20.000
  });

  test('Yayıncı Merkezi: bu haftanın kazancı, ulaşılan barem ve sonrakine kalan', async () => {
    const me = ok(await s1.get('/api/wallet/host-bonus'));
    assert.deepEqual([me.on, me.week, me.eligible, me.kind, me.earned], [true, week, true, 'agency', 25_000]);
    assert.deepEqual(me.tier, { from: 20_000, bonus: 10_000 });
    assert.deepEqual(me.next, { from: 40_000, bonus: 20_000, left: 15_000 });
    assert.equal(me.tiers.length, HOST_BONUS_TIERS.length);
    assert.equal(me.last, null);
    const two = ok(await s2.get('/api/wallet/host-bonus'));
    assert.deepEqual([two.tier, two.next.left], [null, 1_000], 'ilk baremin altı');
    const alone = ok(await loner.get('/api/wallet/host-bonus'));
    assert.deepEqual([alone.eligible, alone.kind], [false, null], 'ilk günlerinde, ajansı yok: bonus almaz');
    const h1 = ok(await held.get('/api/wallet/host-bonus'));
    assert.deepEqual([h1.eligible, h1.kind, h1.tier.bonus], [true, 'management', 20_000], 'yönetim yayıncısı ajanslı gibi');
    assert.equal(ok(await man.get('/api/wallet/host-bonus')).eligible, false, 'ajanssız erkek yönetim yayıncısı değil');
    assert.equal(ok(await owner.get('/api/wallet/host-bonus')).eligible, false, 'ajans sahibine haftalık bonus yok');
  });

  test('canlı ayar: barem sırası bozuk ya da boş tablo reddedilir', async () => {
    refused(await setLive({ host_weekly_bonus: { on: true, tiers: [{ from: 20_000, bonus: 10_000 }, { from: 10_000, bonus: 5_000 }] } }), 400, 'sıra');
    refused(await setLive({ host_weekly_bonus: { on: true, tiers: [] } }), 400, 'boş');
    refused(await setLive({ host_weekly_bonus: { on: true, tiers: [{ from: 10_000, bonus: 9_000 }, { from: 20_000, bonus: 5_000 }] } }), 400, 'bonus azalamaz');
  });

  test('kapalıyken biten hafta atlanır; sonra açmak o haftayı ödemez', async () => {
    ok(await setLive({ host_weekly_bonus: { on: false, tiers: HOST_BONUS_TIERS } }), 'kapat');
    assert.equal(ok(await s1.get('/api/wallet/host-bonus')).on, false);
    const before = await diamonds(s1);
    assert.equal(ok(await close()).week, week);
    const [run] = await q('SELECT is_on, done_at, people FROM host_bonus_runs WHERE week_start = $1', [week]);
    assert.deepEqual([run.is_on, !!run.done_at, run.people], [false, true, 0]);
    ok(await setLive({ host_weekly_bonus: { on: true, tiers: HOST_BONUS_TIERS } }), 'aç');
    ok(await close());
    assert.equal(await diamonds(s1), before, 'atlanan hafta kendiliğinden ödenmez');
    assert.equal((await q('SELECT count(*)::int AS n FROM host_bonuses'))[0].n, 0);
  });

  test('atlanan haftayı yönetim öder: ajans ve yönetim yayıncısı, baremin bonusu, bir kez; bildirim SimilarClub Sistem’den', async () => {
    refused(await s1.post('/api/admin/host-bonus/pay', { week, reason: 'Deneme' }), 403, 'yönetici değil');
    refused(await admin.post('/api/admin/host-bonus/pay', { week }), 400, 'gerekçe');
    refused(await admin.post('/api/admin/host-bonus/pay', { week: addDays(week, 1), reason: 'Deneme' }), 400, 'Pazartesi değil');
    refused(await admin.post('/api/admin/host-bonus/pay', { week: addDays(week, 7), reason: 'Deneme' }), 404, 'kapanmamış hafta');
    const before = await Promise.all([s1, s2, loner, held, man, owner].map(diamonds));
    const commission = (await q('SELECT count(*)::int AS n, coalesce(sum(amount), 0)::numeric AS s FROM agency_ledger WHERE agency_id = $1', [agencyId]))[0];
    const paid = ok(await admin.post('/api/admin/host-bonus/pay', { week, reason: 'Ayar yanlışlıkla kapalı kalmıştı' }), 'öde');
    assert.deepEqual([paid.people, paid.diamonds], [2, 30_000]);
    const after = await Promise.all([s1, s2, loner, held, man, owner].map(diamonds));
    assert.deepEqual(
      after.map((n, i) => n - before[i]),
      [10_000, 0, 0, 20_000, 0, 0],
      '25.000 → 10.000; 9.000 baremin altı; ilk günlerindeki ajanssız almaz; yönetim yayıncısı 45.000 → 20.000; ajanssız erkek almaz; ajans sahibi almaz',
    );
    const kinds = await q('SELECT user_id, kind, agency_id FROM host_bonuses ORDER BY bonus');
    assert.deepEqual(kinds.map((k) => [k.user_id, k.kind, k.agency_id]), [[s1.id, 'agency', agencyId], [held.id, 'management', null]]);
    const [row] = await q("SELECT amount, counterparty, channel, reason, actor FROM ledger WHERE user_id = $1 AND ref = $2", [s1.id, `hbonus:${week}:${s1.id}`]);
    assert.deepEqual([Number(row.amount), row.counterparty, row.channel, row.reason, row.actor], [10_000, null, 'yayinci_bonus', 'Haftalık yayıncı bonusu', admin.id]);
    const c2 = (await q('SELECT count(*)::int AS n, coalesce(sum(amount), 0)::numeric AS s FROM agency_ledger WHERE agency_id = $1', [agencyId]))[0];
    assert.deepEqual([c2.n, c2.s], [commission.n, commission.s], 'bonustan ajans komisyonu çıkmaz');
    assert.equal((await q("SELECT count(*)::int AS n FROM income_events WHERE source_ref LIKE 'hbonus%'"))[0].n, 0);
    const [note] = await q("SELECT title, body, category, link, data FROM team_notices WHERE target = $1 AND ref = $2", [s1.id, `hbonus:${week}`]);
    assert.equal(note.category, 'bonus');
    assert.match(note.body, /Yayıncı haftalık bonusu kapsamında 10\.000 elmas hesabına eklendi/);
    assert.match(note.body, /Bu hafta kazandığın elmas: 25\.000/);
    assert.match(note.body, /Ulaştığın barem: 20\.000 elmas/);
    assert.deepEqual([note.link, note.data.bonus, note.data.week], ['/yayinci', 10_000, week]);
    refused(await admin.post('/api/admin/host-bonus/pay', { week, reason: 'Tekrar' }), 409, 'ikinci kez');
    ok(await close());
    assert.equal(await diamonds(s1), after[0], 'çalıştırmak bir daha ödemez');
    const audit = await q("SELECT detail FROM audit_events WHERE action = 'host_bonus.pay'");
    assert.equal(audit.length, 1);
    assert.equal(audit[0].detail.week, week);
  });

  test('bonus kazanç sayılmaz; geçen haftanın bonusu Yayıncı Merkezi’nde görünür', async () => {
    const me = ok(await s1.get('/api/wallet/host-bonus'));
    assert.equal(me.earned, 25_000, 'bonus elması bu haftanın kazancına eklenmez');
  });

  test('yönetim listesi: hafta, kişiler, toplam; süren hafta önizleme', async () => {
    refused(await s1.get(`/api/admin/host-bonus?week=${week}`), 403);
    const v = ok(await admin.get(`/api/admin/host-bonus?week=${week}`));
    assert.equal(v.preview, true, 'süren hafta (gerçek saat) önizleme');
    assert.deepEqual(
      v.rows.map((r) => [r.userId, r.kind, r.earned, r.bonus]),
      [[held.id, 'management', 45_000, 20_000], [s1.id, 'agency', 25_000, 10_000]],
    );
    const w = v.weeks.find((x) => x.week === week);
    assert.deepEqual([w.on, w.people, w.diamonds], [true, 2, 30_000]);
    refused(await admin.get('/api/admin/host-bonus?week=2026-11-25'), 400, 'Pazartesi değil');
  });

  test('geri alma: yalnız yönetici, gerekçeyle, bir kez; elmas düşer, bildirim gider', async () => {
    const [b] = await q('SELECT id FROM host_bonuses WHERE user_id = $1', [s1.id]);
    const id = Number(b.id);
    refused(await s1.post('/api/admin/host-bonus/reverse', { id, reason: 'Kendim' }), 403);
    refused(await admin.post('/api/admin/host-bonus/reverse', { id }), 400, 'gerekçe');
    refused(await admin.post('/api/admin/host-bonus/reverse', { id: 999_999, reason: 'Yok' }), 404);
    const before = await diamonds(s1);
    const r = ok(await admin.post('/api/admin/host-bonus/reverse', { id, reason: 'Hileli hediye' }));
    assert.deepEqual([r.bonus, r.taken], [10_000, 10_000]);
    assert.equal(await diamonds(s1), before - 10_000);
    refused(await admin.post('/api/admin/host-bonus/reverse', { id, reason: 'Tekrar' }), 409);
    const [row] = await q('SELECT reversed_amount, reverse_reason, reversed_by FROM host_bonuses WHERE id = $1', [id]);
    assert.deepEqual([Number(row.reversed_amount), row.reverse_reason, row.reversed_by], [10_000, 'Hileli hediye', admin.id]);
    const [note] = await q("SELECT title, body FROM team_notices WHERE target = $1 AND ref = $2", [s1.id, `hbonus:${id}:back`]);
    assert.equal(note.title, 'Haftalık bonus geri alındı');
    assert.match(note.body, /Hesabından düşülen: 10\.000 elmas/);
    const [a] = await q("SELECT target, detail FROM audit_events WHERE action = 'host_bonus.reverse'");
    assert.deepEqual([a.target, a.detail.taken, a.detail.reason], [s1.id, 10_000, 'Hileli hediye']);
  });

  test('geri alma, hesapta çekilebilir elmas kadar: kilitli elmas yerinde kalır', async () => {
    // A second streamer whose bonus is paid by a closed week, then their unlocked diamonds spent.
    const s3 = await account('Bonus Üç');
    const code = (await q('SELECT code FROM agencies WHERE id = $1', [agencyId]))[0].code;
    ok(await s3.post('/api/agency/join', { code }), 'katıl');
    // 10.000 elmas from coins whose gift diamonds stay locked 48 hours (a store purchase's lock).
    const locker = await account('Kilitli Hediyeci');
    await h.credit(locker.id, 10_000, { channel: 'google', lockHours: 48 });
    for (let i = 0; i < 2; i++) ok(await locker.post('/api/gifts/send', { to: s3.id, giftId: 'g5', count: 10, ref: `t${rnd(8)}` }), 'kilitli hediye');
    // Next week, closed with the bonus on: nobody earned in it, nobody is paid.
    ok(await close(14));
    assert.equal((await q('SELECT people FROM host_bonus_runs WHERE week_start = $1', [addDays(week, 7)]))[0].people, 0);
    // s3 earned in this week, already closed: the test marks it skipped again and pays it; s1, paid, is not paid twice.
    await q("UPDATE host_bonus_runs SET is_on = false, done_at = now() WHERE week_start = $1", [week]);
    const s1Before = await diamonds(s1);
    ok(await admin.post('/api/admin/host-bonus/pay', { week, reason: 'Üçüncü yayıncı' }));
    const [b] = await q('SELECT id, bonus FROM host_bonuses WHERE user_id = $1', [s3.id]);
    assert.equal(Number(b.bonus), 5_000, '10.000 elmas → 5.000 bonus');
    assert.equal(await diamonds(s1), s1Before, 'ödenmiş yayıncıya ikinci kez ödenmez');
    // s3 sells the bonus's diamonds (unlocked) away: Çevir takes them.
    const live = ok(await s3.get('/api/catalog'));
    const ex = live.exchange;
    ok(await s3.post('/api/wallet/exchange', { diamonds: 4_000, ref: `t${rnd(8)}`, usdTry: ex.usdTry, coinValueTl: ex.coinValueTl, diamondsPerUsd: ex.diamondsPerUsd }), 'çevir');
    const r = ok(await admin.post('/api/admin/host-bonus/reverse', { id: Number(b.id), reason: 'Kısmi' }));
    assert.equal(r.taken, 1_000, 'çekilebilir 1.000 elmas alınır; kilitli hediye elması kalır');
    assert.equal(await diamonds(s3), 10_000);
  });
});
