// Agency network against a real Postgres (harness.mjs): the acceptance criteria of both agency specs, end to
// end over HTTP, under the weekly levels (owners, 24 Nov 2026: agency-levels.mjs) that replaced the pool, the
// parent's difference and the performance engine's rates. Ş1-n = "Üst Ajans, Alt Ajans ve Çok Katmanlı Ajans Yönetim Sistemi" test n; Ş2-n = "Performansa
// Dayalı Dinamik Komisyon" test n. The steps share one network and run in order: T (top agency), S and S2 (its
// sub-agencies), streamers tA (T), sA sB sC (S), s2A (S2). Background jobs are off (AGENCY_JOBS=0); the tests
// run the engine through the centre's routes. The server sells no play money (ALLOW_TEST_TOPUP=0), so payouts
// can be paid; the refusal on a server with play money is in qa-money.test.mjs.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ AGENCY_JOBS: '0', ALLOW_TEST_TOPUP: '0', AGENCY_INVITES: '1', AGENCY_LEVELS_TEST_CLOCK: '1' }); // the invite flow, closed by default (agency-invite-closed.test.mjs)
const { call, signUp } = h;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A signed-in account with a call helper: await A.get('/x'), A.post('/x', body) → [status, json]. */
async function account(name) {
  const s = await signUp(name);
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
const num = (v) => Number(v);
/** Coins as from a Google Play purchase, put straight into the database (no store here): a lot and the balance. */
const storeCoins = async (who, amount) => {
  await h.credit(who.id, amount, { channel: 'google' });
};

// Shared state, filled in step by step.
let admin, tOwner, sOwner, s2Owner, outsider, gifter, staffU, staffV, bdU, fin1, fin2;
let tA, sA, sB, sC, s2A;
let T, S, S2;
let roles;
const income = async (streamer, diamonds, type = 'gift') => ok(await admin.post('/api/admin/agency/income', { streamer: streamer.id, type, diamonds, ref: ref() }), 'gelir');
const commissionsOf = (streamer) => q('SELECT * FROM agency_commissions WHERE streamer_id = $1 ORDER BY id', [streamer.id]);
const ledgerOf = (commissionId) => q('SELECT agency_id, kind, amount, rate FROM agency_ledger WHERE commission_id = $1 ORDER BY id', [commissionId]);
const setting = async (key, value) => ok(await admin.post('/api/admin/agency/settings', { key, value, reason: 'Test ayarı' }), `ayar ${key}`);
/** The weekly levels with small numbers (the owners' table: agency-level-rules.mjs); `newWeeks` 0: no new agencies. */
const LEVELS = (newWeeks = 0) => ({
  min_active: 2,
  active_usd: 1,
  new_weeks: newWeeks,
  new_level: 'baslangic',
  levels: [
    { key: 'gonul_bagi', name: 'Gönül Bağı', rate: 0.35, from: 0, shown: false },
    { key: 'baslangic', name: 'Başlangıç', rate: 0.5, from: 20000, shown: false },
    { key: 'bronz', name: 'Bronz', rate: 0.6, from: 40000, shown: true },
  ],
});
/** Closes this week now (the test clock: as if it were next Monday). */
const closeWeek = () => admin.post('/api/admin/agency/levels/run', { at: new Date(Date.now() + 7 * 86400e3).toISOString() });

describe('Ajans ağı: kurulum ve hiyerarşi', () => {
  test('hesaplar', async () => {
    [admin, tOwner, sOwner, s2Owner, outsider, gifter, staffU, staffV, bdU, fin1, fin2] = await Promise.all(
      ['Merkez', 'Üst Sahip', 'Alt Sahip', 'Alt2 Sahip', 'Yabancı', 'Hediyeci', 'Personel', 'Personel2', 'BD', 'Finans1', 'Finans2'].map(account),
    );
    [tA, sA, sB, sC, s2A] = await Promise.all(['Yayıncı tA', 'Yayıncı sA', 'Yayıncı sB', 'Yayıncı sC1', 'Yayıncı s2A'].map(account));
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    // Only women's accounts may be streamers (streamer_policy.women_only); the rules themselves: streamer-policy.test.mjs.
    await q("UPDATE users SET gender = 'Kadın' WHERE id = ANY($1::uuid[])", [[tA, sA, sB, sC, s2A, outsider].map((x) => x.id)]);
    roles = Object.fromEntries(ok(await admin.get('/api/agency/roles')).roles.map((r) => [r.name, r.id]));
    assert.ok(roles['Yayıncı asistanı'] && roles['BD yöneticisi'] && roles['Finans sorumlusu']);
    // The rules the tests rely on, set through the centre's settings (each change is kept with a reason).
    await setting('weekly_levels', LEVELS());
    await setting('payout_policy', { min_diamonds: 1000 });
    // These tests follow a parent into its sub-agencies; by default it sees them by name only (agency-subs-hidden.test.mjs).
    await setting('parent_sees_subs', true);
  });

  test('[Ş1-1] merkez üst ajans oluşturur; yetkisiz kişi oluşturamaz ve reddi denetime yazılır', async () => {
    refused(await outsider.post('/api/admin/agency/create', { name: 'Kaçak Ajans', owner: outsider.id }), 403, 'yetkisiz');
    const denied = await q("SELECT * FROM agency_audit WHERE actor_id = $1 AND result = 'denied' AND action = 'agencies.manage'", [outsider.id]);
    assert.equal(denied.length, 1);
    T = ok(await admin.post('/api/admin/agency/create', { name: 'Yıldız Ajans', owner: tOwner.id })).agency;
    assert.equal(T.level, 1);
    assert.equal(T.status, 'approved');
    const me = ok(await tOwner.get('/api/agency/me'));
    assert.equal(me.agencies[0].id, T.id);
    assert.equal(me.agencies[0].viewer, 'owner');
  });

  test('[Ş1-2][Ş2-1] alt ajansı yalnız yönetim ekler; onaydan önce yayıncı eklenemez, komisyon yok', async () => {
    // A top agency sees its sub-agencies (Referans ajanslar) and never adds or approves one.
    refused(await tOwner.post('/api/agency/sub/create', { parentId: T.id, name: 'Kendi Alt Ajansım', owner: sOwner.id, submit: true }), 403, 'üst ajans alt ajans ekleyemez');
    assert.equal((await q("SELECT count(*)::int AS n FROM agency_audit WHERE actor_id = $1 AND result = 'denied' AND action = 'agencies.manage'", [tOwner.id]))[0].n, 1);
    S = ok(await admin.post('/api/agency/sub/create', { parentId: T.id, name: 'Ay Ajans', owner: sOwner.id, region: 'İzmir', submit: true })).agency;
    assert.equal(S.status, 'pending');
    assert.equal(S.level, 2);
    assert.equal(S.parentId, T.id);
    refused(await sOwner.post('/api/agency/invite', { id: S.id, user: sA.id }), 409, 'onaysız ajans davet');
    refused(await admin.post('/api/admin/agency/assign', { streamer: sA.id, agencyId: S.id, reason: 'Deneme' }), 409, 'onaysız ajansa atama');
    assert.equal((await q('SELECT * FROM agency_rates WHERE agency_id = $1', [S.id])).length, 0, 'onaydan önce oran yok');
    // Another agency's owner can't open a sub under T.
    refused(await outsider.post('/api/agency/sub/create', { parentId: T.id, name: 'Sızma Ajans' }), 403, 'başkasının altına alt ajans');
  });

  test('[Ş1-3] onay politikaya göre: merkez onayı; otomatik onay politikasında doğrudan aktif', async () => {
    const pend = ok(await admin.get('/api/admin/agency/list?status=pending')).agencies;
    assert.ok(pend.some((a) => a.id === S.id && a.pendingWith === 'center'));
    assert.equal(ok(await admin.post('/api/admin/agency/decide', { id: S.id, approve: true, note: 'Belgeler tamam' })).status, 'approved');
    const rate = await q('SELECT * FROM agency_rates WHERE agency_id = $1', [S.id]);
    assert.equal(rate.length, 1);
    assert.equal(num(rate[0].rate), 0.25, 'başlangıç kademesi oranı');
    assert.equal(num(rate[0].parent_floor), 0.01);
    const hist = await q('SELECT to_status FROM agency_status_history WHERE agency_id = $1 ORDER BY id', [S.id]);
    assert.deepEqual(hist.map((x) => x.to_status), ['draft', 'pending', 'approved']);

    await setting('subagency_policy', { approval: 'auto' });
    S2 = ok(await admin.post('/api/agency/sub/create', { parentId: T.id, name: 'Güneş Ajans', owner: s2Owner.id, submit: true })).agency;
    assert.equal(S2.status, 'approved', 'otomatik onay');
    await setting('subagency_policy', { approval: 'center' });
    // Two levels in this release: a sub-agency can't found its own.
    refused(await sOwner.post('/api/agency/sub/create', { parentId: S.id, name: 'Torun Ajans' }), 403, 'üçüncü katman');
  });

  test('üst ajansın koduyla başvuru da yönetimin onayını bekler; üst ajansa bilgi gider', async () => {
    const codeT = (await q('SELECT code FROM agencies WHERE id = $1', [T.id]))[0].code;
    const applicant = await account('Başvuran');
    const r = ok(await applicant.post('/api/agency/apply', { name: 'Kod Ajans', parentCode: codeT }));
    assert.equal(r.pendingWith, 'center');
    assert.equal(r.agency.status, 'pending');
    const nt = ok(await tOwner.get(`/api/agency/notices?id=${T.id}`)).notices;
    assert.ok(nt.some((n) => n.kind === 'sub' && /Kod Ajans/.test(n.title)));
    refused(await tOwner.post('/api/agency/sub/decide', { id: r.agency.id, approve: true }), 409, 'üst ajans karar veremez');
    ok(await admin.post('/api/admin/agency/decide', { id: r.agency.id, approve: false, note: 'Test başvurusu' }));
  });

  test('[Ş1-4][Ş2-2] alt ajans yayıncı davet eder; kodla ve bağlantıyla doğrudan katılınır; yönetici atar', async () => {
    const inv = ok(await sOwner.post('/api/agency/invite', { id: S.id, user: sA.id }));
    const mine = ok(await sA.get('/api/agency/me'));
    assert.equal(mine.requests[0].kind, 'invite');
    ok(await sA.post('/api/agency/requests/respond', { requestId: inv.request.id, accept: true }));
    assert.equal(ok(await sA.get('/api/agency/me')).membership.agency.id, S.id);

    const code = (await q('SELECT code FROM agencies WHERE id = $1', [S.id]))[0].code;
    assert.equal(ok(await sB.get(`/api/agency/lookup?code=${code}`)).agency.id, S.id);
    // The agency's code or link is its invitation: joining needs no further approval.
    const jr = ok(await sB.post('/api/agency/join', { code, method: 'code' }));
    assert.equal(jr.membership.agency.id, S.id);
    assert.equal(jr.request, undefined);
    assert.equal(ok(await sB.get('/api/agency/me')).membership.agency.id, S.id);
    assert.equal(ok(await sC.post('/api/agency/join', { code, method: 'link' })).membership.agency.id, S.id);

    ok(await admin.post('/api/admin/agency/assign', { streamer: tA.id, agencyId: T.id, reason: 'Sözleşme imzalandı' }));
    const inv2 = ok(await s2Owner.post('/api/agency/invite', { id: S2.id, user: s2A.id }));
    ok(await s2A.post('/api/agency/requests/respond', { requestId: inv2.request.id, accept: true }));

    const links = await q('SELECT streamer_id, method FROM agency_streamers WHERE agency_id = $1 AND ended_at IS NULL ORDER BY joined_at', [S.id]);
    assert.deepEqual(links.map((l) => l.method), ['invite', 'code', 'link']);
  });

  test('[Ş1-5][Ş2-3] bir yayıncı aynı anda iki ajansa bağlanamaz', async () => {
    const codeT = (await q('SELECT code FROM agencies WHERE id = $1', [T.id]))[0].code;
    refused(await sA.post('/api/agency/join', { code: codeT }), 409, 'ikinci ajansa başvuru');
    refused(await tOwner.post('/api/agency/invite', { id: T.id, user: sA.id }), 409, 'üst ajans alt ajansın yayıncısını davet');
    refused(await admin.post('/api/admin/agency/assign', { streamer: sA.id, agencyId: T.id, reason: 'x' }), 400, 'kısa gerekçe');
    // The database itself refuses a second open link.
    await assert.rejects(q("INSERT INTO agency_streamers (streamer_id, agency_id, method) VALUES ($1, $2, 'admin')", [sA.id, T.id]), /agency_streamers_one_open/);
  });

  test('[Ş1-6] üst ajans doğrudan yayıncılarını ve alt ajans yayıncılarını ayrı görür; onları taşıyamaz', async () => {
    const direct = ok(await tOwner.get(`/api/agency/streamers?id=${T.id}&scope=direct`)).streamers;
    assert.deepEqual(direct.map((x) => x.id), [tA.id]);
    const sub = ok(await tOwner.get(`/api/agency/streamers?id=${T.id}&scope=sub`)).streamers;
    assert.deepEqual(new Set(sub.map((x) => x.id)), new Set([sA.id, sB.id, sC.id, s2A.id]));
    assert.equal(sub.find((x) => x.id === sA.id).agencyName, 'Ay Ajans');
    const subs = ok(await tOwner.get(`/api/agency/subagencies?id=${T.id}`)).subagencies;
    assert.equal(subs.find((x) => x.id === S.id).streamers, 3);
    // Viewing a sub-agency is allowed; acting in it is not.
    ok(await tOwner.get(`/api/agency/streamers?id=${S.id}`));
    const pendingJoin = ok(await outsider.post('/api/agency/join', { code: (await q('SELECT code FROM agencies WHERE id = $1', [S.id]))[0].code, method: 'application' }));
    refused(await tOwner.post('/api/agency/requests/decide', { id: S.id, requestId: pendingJoin.request.id, approve: true }), 403, 'üst ajans alt ajansın başvurusunu onaylayamaz');
    ok(await outsider.post('/api/agency/requests/cancel', { requestId: pendingJoin.request.id }));
  });

  test('[Ş1-7][Ş2-19] alt ajans başka alt ajansı ve üst ajansın verisini göremez; denemeler denetime yazılır', async () => {
    refused(await sOwner.get(`/api/agency/overview?id=${S2.id}`), 403, 'kardeş alt ajans');
    refused(await sOwner.get(`/api/agency/streamers?id=${T.id}`), 403, 'üst ajansın yayıncıları');
    refused(await sOwner.get(`/api/agency/commissions?id=${T.id}`), 403, 'üst ajansın komisyonları');
    refused(await sOwner.get(`/api/agency/overview?id=${T.id}`), 403, 'üst ajans özeti');
    refused(await sOwner.get('/api/admin/agency/tree'), 403, 'merkez ağacı');
    refused(await sA.get(`/api/agency/overview?id=${S.id}`), 403, 'yayıncı ajans paneli');
    const denied = await q("SELECT action, target_id FROM agency_audit WHERE actor_id = $1 AND result = 'denied'", [sOwner.id]);
    assert.ok(denied.length >= 4);
    assert.ok(denied.some((d) => d.target_id === S2.id));
  });
});

describe('Komisyon motoru', () => {
  let giftRef;
  test('[Ş1-8] gerçek hediye: yalnız yayıncının ajansı, hafta içinde 0. seviye %35; üst ajans pay almaz; elmaslar dokunulmaz', async () => {
    await storeCoins(gifter, 10000);
    giftRef = ref();
    const g = ok(await gifter.post('/api/gifts/send', { to: sA.id, giftId: 'g5', count: 10, ref: giftRef }));
    assert.equal(g.total, 5000);
    const me = ok(await sA.get('/api/me'));
    assert.equal(me.user.diamonds, 5000, 'yayıncının elması tam: komisyon platformdan, ondan kesilmez');
    const [k] = await commissionsOf(sA);
    assert.equal(num(k.base_diamonds), 5000);
    assert.equal(num(k.total_rate), 0.35);
    assert.equal(num(k.agency_rate), 0.35);
    assert.equal(num(k.parent_rate), 0);
    assert.equal(num(k.agency_amount), 1750);
    assert.equal(num(k.parent_amount), 0);
    assert.equal(num(k.usd), 1.75, 'komisyon 1750 elmas; 1000 elmas = 1 USD');
    assert.equal(k.agency_id, S.id);
    assert.equal(k.parent_agency_id, T.id, 'ağaçtaki yeri raporlar için kayıtta');
    assert.match(k.txn, /^AKM-\d+$/);
    assert.match(k.rule_version, /^lv#\d+\|w\d{4}-\d{2}-\d{2}$/);
    assert.ok(k.level_week, 'haftanın seviyesini bekler');
    const l = await ledgerOf(k.id);
    assert.deepEqual(l.map((x) => [x.agency_id, x.kind, num(x.amount)]), [[S.id, 'direct', 1750]]);
    // More income for the scenario below.
    await income(tA, 10000);
    await income(sB, 20000);
    await income(sC, 20000);
    await income(s2A, 1000);
    const [kt] = await commissionsOf(tA);
    assert.equal(num(kt.agency_amount), 3500, 'üst ajansın doğrudan yayıncısı: %35');
    assert.equal(kt.parent_agency_id, null);

    // The top agency's panel: today / this week / this month per sub-agency, and per streamer.
    const subS = ok(await tOwner.get(`/api/agency/subagencies?id=${T.id}`)).subagencies.find((x) => x.id === S.id);
    assert.deepEqual(subS.gifts, { day: 45000, week: 45000, month: 45000 });
    assert.deepEqual(subS.mine, { day: 0, week: 0, month: 0 }, 'üst ajans alt ajansından fark almaz');
    const rowA = ok(await tOwner.get(`/api/agency/streamers?id=${T.id}&scope=sub`)).streamers.find((x) => x.id === sA.id);
    assert.equal(rowA.week, 5000);
    assert.equal(rowA.month, 5000);
  });

  test('[Ş1-9][Ş2-7] her kayıt payların toplamı; seviye tablosu %100’ü aşamaz; elle oran ve kademe kapalı', async () => {
    const all = await q('SELECT k.*, (SELECT sum(amount) FROM agency_ledger l WHERE l.commission_id = k.id) AS paid FROM agency_commissions k');
    for (const k of all) {
      assert.ok(num(k.total_rate) <= num(k.pool_cap));
      assert.equal(num(k.paid), Math.round(num(k.base_diamonds) * num(k.total_rate) * 1e4) / 1e4, `kayıt ${k.txn}: paylar toplamı = matrah × oran`);
    }
    const bad = LEVELS();
    bad.levels[2].rate = 1.2;
    refused(await admin.post('/api/admin/agency/settings', { key: 'weekly_levels', value: bad, reason: 'Deneme' }), 400, '%100 üstü');
    const down = LEVELS();
    down.levels[2].rate = 0.4;
    refused(await admin.post('/api/admin/agency/settings', { key: 'weekly_levels', value: down, reason: 'Deneme' }), 400, 'üst seviye alttakinden düşük');
    const order = LEVELS();
    order.levels[2].from = 10000;
    refused(await admin.post('/api/admin/agency/settings', { key: 'weekly_levels', value: order, reason: 'Deneme' }), 400, 'eşik sırası');
    refused(await admin.post('/api/admin/agency/rate', { id: S.id, rate: 0.3, reason: 'Deneme' }), 409, 'elle oran');
    refused(await admin.post('/api/admin/agency/tier', { id: S.id, tier: 'start', reason: 'Deneme' }), 409, 'elle kademe');
    refused(await admin.post('/api/admin/agency/performance/run', {}), 409, 'performans değerlendirmesi oran vermez');
    await assert.rejects(
      q(
        `WITH e AS (INSERT INTO income_events (streamer_id, source_type, source_ref, diamonds, occurred_at) VALUES ($2, 'gift', $3, 1, now()) RETURNING id)
         INSERT INTO agency_commissions (income_event_id, txn, streamer_id, agency_id, top_agency_id, chain, base_diamonds, income_type, pool_cap, total_rate, agency_rate, agency_amount, usd, period, rule_version, occurred_at)
         SELECT e.id, 'X', $2, $1, $1, ARRAY[$1::uuid], 1, 'gift', 0.4, 0.41, 0.41, 0.41, 0, '2026-01', 'x', now() FROM e`,
        [T.id, tA.id, `chk:${ref()}`],
      ),
      /agency_commissions_check|check constraint/i,
    );
  });

  test('[Ş1-10][Ş2-17] aynı gelir iki kez komisyon üretmez', async () => {
    const replay = ok(await gifter.post('/api/gifts/send', { to: sA.id, giftId: 'g5', count: 10, ref: giftRef }));
    assert.equal(replay.replay, true);
    assert.equal((await commissionsOf(sA)).length, 1);
    const r = ref();
    const first = ok(await admin.post('/api/admin/agency/income', { streamer: sB.id, type: 'gift', diamonds: 100, ref: r }));
    const second = ok(await admin.post('/api/admin/agency/income', { streamer: sB.id, type: 'gift', diamonds: 100, ref: r }));
    assert.ok(first.commission);
    assert.equal(second.commission, null);
    assert.equal(second.eventId, first.eventId);
    assert.equal((await q("SELECT count(*)::int AS n FROM agency_commissions WHERE income_event_id = $1", [first.eventId]))[0].n, 1);
    const again = ok(await admin.post('/api/admin/agency/commissions/run', {}));
    assert.equal(again.computed, 0);
    // The ledger can't be edited or deleted.
    await assert.rejects(q('UPDATE agency_ledger SET amount = 1 WHERE commission_id = $1', [first.commission.id]));
    await assert.rejects(q('DELETE FROM agency_commissions WHERE id = $1', [first.commission.id]));
  });

  test('gelir türleri: kapalı tür komisyon üretmez, iade eksi kayıttır', async () => {
    const c = ok(await admin.post('/api/admin/agency/income', { streamer: sB.id, type: 'campaign', diamonds: 500, ref: ref() }));
    assert.equal(c.status, 'excluded');
    assert.equal(c.commission, null);
    const r = ok(await admin.post('/api/admin/agency/income', { streamer: sB.id, type: 'refund', diamonds: -100, ref: ref() }));
    assert.equal(r.commission.agencyAmount, -35);
    assert.equal(r.commission.parentAmount, 0);
    refused(await admin.post('/api/admin/agency/income', { streamer: sB.id, type: 'refund', diamonds: 100, ref: ref() }), 400, 'pozitif iade');
  });
});

describe('Haftalık ajans seviyesi', () => {
  let firstSA;
  test('hafta kapanınca seviye: eşik ve aktif yayıncı; farkı tek satır; üst ajans pay almaz; bir kez', async () => {
    firstSA = (await commissionsOf(sA))[0];
    // T: 50.000 elmas (Bronz eşiği) ama tek aktif yayıncı: 0. seviye.
    await income(tA, 40000);
    const r = ok(await closeWeek(), 'hafta kapandı');
    assert.ok(r.agencies >= 3);
    const weeks = Object.fromEntries((await q('SELECT * FROM agency_level_weeks')).map((w) => [w.agency_id, w]));
    assert.deepEqual([weeks[S.id].level_key, num(weeks[S.id].base), weeks[S.id].active, weeks[S.id].reason], ['bronz', 45000, 3, 'threshold']);
    assert.equal(num(weeks[S.id].adjustment), 11250, '45.000 × (%60 − %35)');
    assert.deepEqual([weeks[T.id].level_key, num(weeks[T.id].base), weeks[T.id].active, weeks[T.id].reason], ['gonul_bagi', 50000, 1, 'active']);
    assert.equal(num(weeks[T.id].adjustment), 0);
    assert.equal(weeks[S2.id].level_key, 'gonul_bagi');
    const rows = await q("SELECT agency_id, amount, rate FROM agency_ledger WHERE kind = 'level'");
    assert.deepEqual(rows.map((x) => [x.agency_id, num(x.amount), num(x.rate)]), [[S.id, 11250, 0.6]]);
    assert.equal((await q("SELECT count(*)::int AS n FROM agency_ledger WHERE kind = 'difference'"))[0].n, 0, 'üst ajansa fark yazılmaz');
    // The cards: a level the app shows by name (Bronz), the lower ones without.
    assert.equal(ok(await sOwner.get(`/api/agency/overview?id=${S.id}`)).agency.tierName, 'Bronz');
    assert.equal(ok(await tOwner.get(`/api/agency/overview?id=${T.id}`)).agency.tierName, null);
    const ns = ok(await sOwner.get(`/api/agency/notices?id=${S.id}`)).notices;
    assert.ok(ns.some((n) => n.kind === 'tier' && /Bronz \(%60\)/.test(n.title)));
    const nt = ok(await tOwner.get(`/api/agency/notices?id=${T.id}`)).notices;
    assert.ok(nt.some((n) => n.kind === 'tier' && /%35/.test(n.title) && /2 aktif yayıncı şartı/.test(n.body)));
    // Once.
    assert.equal(ok(await closeWeek()).agencies, 0);
    assert.equal((await q("SELECT count(*)::int AS n FROM agency_ledger WHERE kind = 'level'"))[0].n, 1);
    // The panel's list of the week.
    const wk = (await q('SELECT week_start::text AS w FROM agency_level_weeks LIMIT 1'))[0].w;
    const list = ok(await admin.get(`/api/admin/agency/levels?week=${wk}`));
    assert.equal(list.preview, false);
    assert.equal(list.rows.find((x) => x.agencyId === S.id).levelName, 'Bronz');
    refused(await sOwner.get('/api/admin/agency/levels'), 403, 'ajans sahibi listeyi göremez');
  });

  test('kapanmış haftaya geç gelen gelir o haftanın oranıyla yazılır', async () => {
    await income(sA, 1000);
    const k = (await commissionsOf(sA)).at(-1);
    assert.deepEqual([num(k.agency_rate), num(k.agency_amount), k.level_week], [0.6, 600, null]);
  });

  test('yeni ajans: ilk haftalarında seviyesi sabit (Başlangıç %50), haftanın sonunda fark yok', async () => {
    await setting('weekly_levels', LEVELS(4));
    const nOwner = await account('Yeni Sahip');
    const N = ok(await admin.post('/api/admin/agency/create', { name: `Yeni Ajans ${rnd(3)}`, owner: nOwner.id })).agency;
    const nA = await account('Yayıncı nA');
    await q("UPDATE users SET gender = 'Kadın' WHERE id = $1", [nA.id]);
    const code = (await q('SELECT code FROM agencies WHERE id = $1', [N.id]))[0].code;
    ok(await nA.post('/api/agency/join', { code }), 'katıl');
    await income(nA, 1000);
    const k = (await commissionsOf(nA)).at(-1);
    assert.deepEqual([num(k.agency_rate), num(k.agency_amount), k.level_week], [0.5, 500, null]);
    const ov = ok(await nOwner.get(`/api/agency/overview?id=${N.id}`));
    assert.equal(ov.level.isNew, true);
    assert.equal(ov.level.level.rate, 0.5);
    assert.ok(ov.level.newUntil);
    assert.equal(ov.level.level.name, null, 'Başlangıç uygulamada adıyla görünmez');
    await setting('weekly_levels', LEVELS());
  });

  test('[Ş2-11][Ş2-12][Ş1-11] üst ajansın doğrudan komisyonu korunur; geçmiş kazançlar değişmez', async () => {
    await income(tA, 10000);
    const kt = (await commissionsOf(tA)).at(-1);
    assert.equal(num(kt.agency_amount), 3500, 'kapanmış haftanın oranı %35');
    const again = (await commissionsOf(sA))[0];
    assert.deepEqual(again, firstSA, 'ilk kayıt aynen duruyor (seviye farkı ayrı satır)');
    assert.equal(num(again.agency_amount), 1750);
  });

  test('[Ş1-12] transferler: yayıncı ayrılır, alt ajanstan üst ajansa geçer; geçmiş kayıtlar eski ajansta kalır', async () => {
    // Leaving without a move is closed by default (streamer_policy.can_leave); the centre can open it.
    refused(await sB.post('/api/agency/transfer', { reason: 'Kendi yoluma devam', ref: ref() }), 409, 'transfersiz ayrılma kapalı');
    await setting('streamer_policy', { can_leave: true });
    const leave = ok(await sB.post('/api/agency/transfer', { reason: 'Kendi yoluma devam', ref: ref() })).transfer;
    await setting('streamer_policy', { can_leave: false });
    assert.deepEqual(leave.needs, ['from']);
    refused(await tOwner.post('/api/agency/transfers/approve', { id: T.id, transferId: leave.id, approve: true }), 403, 'üst ajans taraf değil');
    assert.equal(ok(await sOwner.post('/api/agency/transfers/approve', { id: S.id, transferId: leave.id, approve: true })).transfer.status, 'completed');
    assert.equal(ok(await sB.get('/api/agency/me')).membership, null);

    const codeT = (await q('SELECT code FROM agencies WHERE id = $1', [T.id]))[0].code;
    const move = ok(await sC.post('/api/agency/transfer', { toCode: codeT, reason: 'Üst ajansa geçiyorum', ref: ref() })).transfer;
    assert.equal(move.fee, 0, 'düşük performans: ücretsiz');
    assert.deepEqual(move.needs, ['from', 'to']);
    // The parties' lists carry the names the panels show, and which approval is theirs.
    const listed = ok(await sOwner.get(`/api/agency/transfers?id=${S.id}`)).transfers.find((t) => t.id === move.id);
    assert.equal(listed.streamer.name, sC.name);
    assert.equal(listed.from.name, 'Ay Ajans');
    assert.equal(listed.to.name, 'Yıldız Ajans');
    assert.deepEqual(listed.myParty, ['from']);
    ok(await sOwner.post('/api/agency/transfers/approve', { id: S.id, transferId: move.id, approve: true }));
    assert.equal(ok(await tOwner.post('/api/agency/transfers/approve', { id: T.id, transferId: move.id, approve: true })).transfer.status, 'completed');
    const links = await q('SELECT agency_id, ended_at, end_reason, method FROM agency_streamers WHERE streamer_id = $1 ORDER BY joined_at', [sC.id]);
    assert.equal(links.length, 2);
    assert.equal(links[0].agency_id, S.id);
    assert.equal(links[0].end_reason, 'transfer');
    assert.equal(links[1].agency_id, T.id);
    assert.equal(links[1].method, 'transfer');
    await income(sC, 10000);
    const ks = await commissionsOf(sC);
    assert.equal(ks[0].agency_id, S.id, 'eski gelir eski ajansta');
    assert.equal(ks.at(-1).agency_id, T.id);
    assert.equal(num(ks.at(-1).agency_amount), 3500);
  });

  test('[Ş2-18] üst ajans alt ajansın puanını, kademesini, oranını değiştiremez', async () => {
    refused(await tOwner.post('/api/admin/agency/tier', { id: S.id, tier: 'start', reason: 'Düşür' }), 403, 'kademe');
    refused(await tOwner.post('/api/admin/agency/rate', { id: S.id, rate: 0.1, reason: 'Düşür' }), 403, 'oran');
    refused(await tOwner.post('/api/admin/agency/ops-score', { agencyId: S.id, score: 0, reason: 'Düşür' }), 403, 'operasyon puanı');
    refused(await tOwner.post('/api/admin/agency/performance/run', {}), 403, 'değerlendirme');
  });

  test('[Ş2-16] kurallar gerekçesiyle değişir; elle oran yok; geçmiş kayıtlara dokunulmaz', async () => {
    const before = await q('SELECT * FROM agency_commissions ORDER BY id');
    refused(await admin.post('/api/admin/agency/rate', { id: S.id, rate: 0.33, reason: 'Bölge kampanyası düzeltmesi' }), 409, 'elle oran');
    assert.deepEqual(await q('SELECT * FROM agency_commissions ORDER BY id'), before, 'geçmiş kayıtlara dokunulmadı');
    const settingsHist = ok(await admin.get('/api/admin/agency/settings')).history;
    assert.ok(settingsHist.length >= 5 && settingsHist.every((x) => x.reason && x.set_by));
  });
});

describe('Bağımsızlaşma', () => {
  let tr;
  test('[Ş2-13] alt ajans bağımsızlık başvurusu yapar; üst ajans onaylayamaz da engelleyemez', async () => {
    tr = ok(await s2Owner.post('/api/agency/independence', { id: S2.id, reason: 'Kendi markamızı büyütmek istiyoruz', ref: ref() })).transfer;
    assert.deepEqual(tr.needs, ['center']);
    refused(await tOwner.post('/api/agency/transfers/approve', { id: T.id, transferId: tr.id, approve: false }), 403, 'üst ajans veto');
    refused(await tOwner.post('/api/agency/transfers/approve', { id: T.id, transferId: tr.id, approve: true }), 403, 'üst ajans onay');
    const nt = ok(await tOwner.get(`/api/agency/notices?id=${T.id}`)).notices;
    assert.ok(nt.some((n) => n.title.includes('bağımsızlık')));
  });

  test('[Ş2-14][Ş2-15] merkez onaylar: hiyerarşi güncellenir; geçiş komisyonu yalnızca süresince', async () => {
    const endsAt = new Date(Date.now() + 4000).toISOString();
    const d = ok(await admin.post('/api/admin/agency/transfers/decide', { transferId: tr.id, approve: true, transition: { rate: 0.05, endsAt, scope: 'existing' }, note: 'Onaylandı' }));
    assert.equal(d.transfer.status, 'completed');
    const a = (await q('SELECT parent_id, level, tier FROM agencies WHERE id = $1', [S2.id]))[0];
    assert.equal(a.parent_id, null);
    assert.equal(a.level, 1);
    const parents = await q('SELECT parent_id, valid_to FROM agency_parents WHERE agency_id = $1 ORDER BY id', [S2.id]);
    assert.equal(parents.length, 2);
    assert.equal(parents[0].parent_id, T.id);
    assert.ok(parents[0].valid_to);
    assert.equal(parents[1].parent_id, null);
    refused(await tOwner.get(`/api/agency/streamers?id=${S2.id}`), 403, 'eski üst ajans artık göremez');

    await income(s2A, 1000);
    const k1 = (await commissionsOf(s2A)).at(-1);
    assert.equal(num(k1.total_rate), 0.35);
    assert.equal(num(k1.agency_amount), 300);
    assert.equal(num(k1.transition_amount), 50);
    assert.deepEqual((await ledgerOf(k1.id)).map((l) => [l.agency_id, l.kind, num(l.amount)]), [
      [S2.id, 'direct', 300],
      [T.id, 'transition', 50],
    ]);
    await sleep(Math.max(0, new Date(endsAt).getTime() - Date.now()) + 400);
    await income(s2A, 1000);
    const k2 = (await commissionsOf(s2A)).at(-1);
    assert.equal(num(k2.agency_amount), 350, 'süre bitti: tam oran bağımsız ajansın');
    assert.equal(num(k2.transition_amount), 0);
    assert.deepEqual((await ledgerOf(k2.id)).map((l) => l.agency_id), [S2.id]);
    // The earlier commission under T stays as it was.
    const k0 = (await commissionsOf(s2A))[0];
    assert.equal(k0.parent_agency_id, T.id);
    assert.equal(num(k0.parent_amount), 0, 'üst ajans o zaman da fark almadı');
  });
});

describe('Askı, personel, BD, ödemeler, raporlar', () => {
  test('[Ş1-13] askıya alma finansal geçmişi korur; askıdaki ajans ödeme isteyemez', async () => {
    const before = await q('SELECT count(*)::int AS n, sum(amount) AS s FROM agency_ledger WHERE agency_id = $1', [S.id]);
    ok(await admin.post('/api/admin/agency/status', { id: S.id, status: 'suspended', reason: 'Belge eksikliği incelemesi' }));
    const after = await q('SELECT count(*)::int AS n, sum(amount) AS s FROM agency_ledger WHERE agency_id = $1', [S.id]);
    assert.deepEqual(after, before);
    refused(await sOwner.post('/api/agency/payouts/request', { id: S.id, currency: 'USD', ref: ref() }), 403, 'askıda ödeme');
    refused(await sOwner.post('/api/agency/invite', { id: S.id, user: sB.id }), 409, 'askıda davet');
    assert.equal(ok(await sOwner.get(`/api/agency/overview?id=${S.id}`)).agency.status, 'suspended');
    ok(await admin.post('/api/admin/agency/status', { id: S.id, status: 'approved', reason: 'İnceleme tamamlandı' }));
    const hist = await q('SELECT to_status FROM agency_status_history WHERE agency_id = $1 ORDER BY id', [S.id]);
    assert.deepEqual(hist.slice(-2).map((x) => x.to_status), ['suspended', 'approved']);
  });

  test('[Ş1-14] merkez organizasyon ağacını görür', async () => {
    const tree = ok(await admin.get('/api/admin/agency/tree')).nodes;
    const byId = Object.fromEntries(tree.map((n) => [n.id, n]));
    assert.equal(byId[T.id].parentId, null);
    assert.equal(byId[S.id].parentId, T.id);
    assert.equal(byId[S2.id].parentId, null, 'bağımsızlaşan ajans artık kök');
    assert.equal(byId[S.id].streamers, 1);
    assert.equal(byId[T.id].streamers, 2);
    assert.ok(byId[T.id].orgVolume30 > byId[T.id].volume30);
    const ov = ok(await admin.get('/api/admin/agency/overview'));
    assert.equal(ov.tops, 3, 'Yıldız, bağımsızlaşan Güneş ve yeni ajans');
    assert.equal(ov.subs, 1);
    // The finance panel's lists: every agency with its code and rate, its upper agency, every streamer with their agency.
    const roster = ok(await admin.get('/api/admin/agency/finance-roster'));
    const ra = Object.fromEntries(roster.agencies.map((a) => [a.id, a]));
    assert.equal(ra[S.id].parentId, T.id);
    assert.ok(ra[T.id].code && ra[T.id].rate > 0);
    assert.equal(roster.streamers.filter((m) => m.agencyId === S.id).length, 1);
    assert.equal(roster.streamers.filter((m) => m.agencyId === T.id).length, byId[T.id].streamers);
    assert.ok(roster.topRate > 0);
    refused(await sOwner.get('/api/admin/agency/finance-roster'), 403, 'finans listesi');
  });

  test('[Ş1-15] personel izinleri esnek; BD yalnız sorumlu olduğu ajansları görür, BD komisyonu havuzdan ayrı', async () => {
    ok(await tOwner.post('/api/agency/staff/set', { id: T.id, user: staffU.id, roleId: roles['Yayıncı asistanı'] }));
    ok(await staffU.get(`/api/agency/streamers?id=${T.id}`));
    refused(await staffU.get(`/api/agency/commissions?id=${T.id}`), 403, 'asistan komisyon göremez');
    refused(await staffU.post('/api/agency/payouts/request', { id: T.id, currency: 'USD', ref: ref() }), 403, 'asistan ödeme isteyemez');
    refused(await staffU.post('/api/agency/staff/set', { id: T.id, user: staffV.id, extra: ['streamers.view'] }), 403, 'personel yönetimi yok');
    ok(await tOwner.post('/api/agency/staff/set', { id: T.id, user: staffU.id, roleId: roles['Yayıncı asistanı'], extra: ['staff.manage'] }));
    refused(await staffU.post('/api/agency/staff/set', { id: T.id, user: staffV.id, extra: ['payouts.request'] }), 403, 'sahip olmadığı yetkiyi veremez');
    ok(await staffU.post('/api/agency/staff/set', { id: T.id, user: staffV.id, extra: ['streamers.view'] }));
    // A denied permission wins over the role.
    ok(await tOwner.post('/api/agency/staff/set', { id: T.id, user: staffV.id, roleId: roles['Yayıncı asistanı'], denied: ['streamers.view'] }));
    refused(await staffV.get(`/api/agency/streamers?id=${T.id}`), 403, 'kısıtlanan izin');

    ok(await admin.post('/api/admin/agency/staff/set', { user: bdU.id, roleId: roles['BD yöneticisi'] }));
    ok(await admin.post('/api/admin/agency/bd', { agencyId: T.id, bd: bdU.id }));
    const tree = ok(await bdU.get('/api/admin/agency/tree')).nodes;
    assert.deepEqual(new Set(tree.map((n) => n.id)), new Set([T.id, S.id]));
    refused(await bdU.get('/api/admin/agency/overview'), 403, 'BD merkez özeti');
    refused(await bdU.get(`/api/agency/commissions?id=${T.id}`), 403, 'BD ajans komisyonu');
    await income(tA, 10000);
    const k = (await commissionsOf(tA)).at(-1);
    const bd = await q('SELECT * FROM bd_ledger WHERE commission_id = $1', [k.id]);
    assert.equal(bd.length, 1);
    assert.equal(num(bd[0].amount), (10000 + 3500) * 0.05, 'BD: (matrah + ajans payı) × %5');
    assert.equal(num(k.agency_amount), 3500, 'ajans payı BD yüzünden azalmaz');
    const rep = ok(await bdU.get('/api/admin/agency/bd-report'));
    assert.deepEqual(rep.agencies.map((a) => a.id), [T.id]);
    assert.equal(rep.ledger[0].amount, 675);
  });

  test('[Ş1-16] ödeme: kapanan dönem, tek açık talep, aynı istek tekrarı, iki kişili onay, benzersiz ödeme referansı', async () => {
    refused(await tOwner.post('/api/agency/payouts/request', { id: T.id, currency: 'USD', ref: ref() }), 409, 'dönem açıkken');
    // The period ending: simulated here; in production the job closes it period_close_days after its end.
    const period = (await q('SELECT DISTINCT period FROM agency_ledger'))[0].period;
    refused(await admin.post('/api/admin/agency/periods/close', { period }), 400, 'bitmemiş dönem kapanmaz');
    await q('INSERT INTO agency_periods (period) VALUES ($1)', [period]);
    // No aday ajans any more (24 Nov 2026): an agency with a closed period's earnings asks for its payout.
    const r0 = ref();
    const p = ok(await tOwner.post('/api/agency/payouts/request', { id: T.id, currency: 'USD', ref: r0 }));
    const expected = num((await q("SELECT sum(amount) AS s FROM agency_ledger WHERE agency_id = $1", [T.id]))[0].s);
    assert.equal(p.payout.amount, expected);
    assert.equal(p.payout.usd, Math.round((expected / 1000) * 100) / 100);
    const replay = ok(await tOwner.post('/api/agency/payouts/request', { id: T.id, currency: 'USD', ref: r0 }));
    assert.equal(replay.replay, true);
    assert.equal(replay.payout.id, p.payout.id);
    refused(await tOwner.post('/api/agency/payouts/request', { id: T.id, currency: 'USD', ref: ref() }), 409, 'ikinci açık talep');

    ok(await admin.post('/api/admin/agency/staff/set', { user: fin1.id, roleId: roles['Finans sorumlusu'] }));
    ok(await admin.post('/api/admin/agency/staff/set', { user: fin2.id, roleId: roles['Finans sorumlusu'] }));
    refused(await tOwner.post('/api/admin/agency/payouts/decide', { payoutId: p.payout.id, action: 'approve' }), 403, 'ajans kendi ödemesini onaylayamaz');
    const list = ok(await fin1.get('/api/admin/agency/payouts'));
    assert.equal(list.playMoney, false);
    assert.equal(list.payouts.find((x) => x.id === p.payout.id).payable, true, 'gerçek parayla kazanılan komisyon ödenebilir');
    ok(await fin1.post('/api/admin/agency/payouts/decide', { payoutId: p.payout.id, action: 'approve' }));
    refused(await fin1.post('/api/admin/agency/payouts/decide', { payoutId: p.payout.id, action: 'pay', paymentRef: 'BANKA-0001' }), 403, 'onaylayan ödeyemez');
    // Ödeme kuru (24 Nov 2026): the TL to send at 1 USD = 49 TL; a decision made on another rate is refused, nothing changes.
    const shown = ok(await fin2.get('/api/admin/agency/payouts')).payouts.find((x) => x.id === p.payout.id);
    assert.equal(shown.tlNow, Math.round(shown.usd * 49 * 100) / 100);
    const moved = await fin2.post('/api/admin/agency/payouts/decide', { payoutId: p.payout.id, action: 'pay', paymentRef: 'BANKA-0001', payUsdTry: 50 });
    refused(moved, 409, 'eski kur');
    ok(await fin2.post('/api/admin/agency/payouts/decide', { payoutId: p.payout.id, action: 'pay', paymentRef: 'BANKA-0001', payUsdTry: 49 }));
    const paid = ok(await fin2.get('/api/admin/agency/payouts')).payouts.find((x) => x.id === p.payout.id);
    assert.deepEqual([paid.payUsdTry, paid.payTl], [49, shown.tlNow], 'ödenen kur ve TL ödemeye yazılır');
    refused(await fin2.post('/api/admin/agency/payouts/decide', { payoutId: p.payout.id, action: 'pay', paymentRef: 'BANKA-0002' }), 409, 'ikinci kez ödeme');
    const view = ok(await tOwner.get(`/api/agency/payouts?id=${T.id}`));
    assert.equal(view.payouts[0].status, 'paid');
    assert.deepEqual(view.payouts[0].history.map((x) => x.to), ['pending', 'ready', 'paid']);
    assert.equal(view.balances.paid, expected);
    assert.equal(view.balances.available, 0);
    refused(await tOwner.post('/api/agency/payouts/request', { id: T.id, currency: 'USD', ref: ref() }), 409, 'ödenmiş kazanç tekrar istenemez');

    // The same payment reference can't close another payout.
    const ps = ok(await sOwner.post('/api/agency/payouts/request', { id: S.id, currency: 'TRY', ref: ref() }));
    ok(await fin1.post('/api/admin/agency/payouts/decide', { payoutId: ps.payout.id, action: 'approve' }));
    refused(await fin2.post('/api/admin/agency/payouts/decide', { payoutId: ps.payout.id, action: 'pay', paymentRef: 'BANKA-0001' }), 409, 'tekrarlanan referans');
    // Rejected: the earnings go back to the available balance.
    ok(await fin2.post('/api/admin/agency/payouts/decide', { payoutId: ps.payout.id, action: 'reject', note: 'IBAN hatalı' }));
    assert.equal(ok(await sOwner.get(`/api/agency/payouts?id=${S.id}`)).balances.available, ps.payout.amount);
    // Corrections are new records: a reversal after the payout doesn't touch the paid rows.
    const k = (await commissionsOf(tA)).at(-1);
    ok(await admin.post('/api/admin/agency/commissions/reverse', { commissionId: Number(k.id), reason: 'Hediye iadesi' }));
    refused(await admin.post('/api/admin/agency/commissions/reverse', { commissionId: Number(k.id), reason: 'Tekrar' }), 404, 'ikinci ters kayıt');
    const rev = await q("SELECT amount, payout_id FROM agency_ledger WHERE kind = 'reversal' AND agency_id = $1", [T.id]);
    assert.equal(num(rev[0].amount), -3500);
    assert.equal(rev[0].payout_id, null);
  });

  test('[Ş2-20] raporlar kayıtlarla tutarlı; filtreler çalışır', async () => {
    const rep = ok(await admin.get('/api/admin/agency/report'));
    const db = (await q('SELECT sum(base_diamonds) AS base, sum(agency_amount + parent_amount + transition_amount) AS com, count(*)::int AS n FROM agency_commissions'))[0];
    assert.equal(rep.totals.base, num(db.base));
    assert.equal(rep.totals.events, db.n);
    const level = num((await q("SELECT coalesce(sum(amount), 0) AS s FROM agency_ledger WHERE kind = 'level'"))[0].s);
    assert.equal(rep.totals.level, level, 'haftalık seviye farkları');
    assert.equal(rep.totals.commission, num(db.com) + level);
    const led = (await q("SELECT sum(amount) AS s FROM agency_ledger WHERE kind IN ('direct', 'difference', 'transition', 'level')"))[0];
    assert.equal(rep.totals.commission, num(led.s), 'rapor = defter');
    assert.equal(rep.totals.platformKeeps, num(db.base) - num(db.com) - level);
    const sub = ok(await admin.get(`/api/admin/agency/report?sub=${S.id}`));
    const dbS = (await q('SELECT sum(agency_amount) AS own, sum(parent_amount) AS up FROM agency_commissions WHERE agency_id = $1', [S.id]))[0];
    assert.equal(sub.bySub[0].own, num(dbS.own));
    assert.equal(sub.bySub[0].toParent, num(dbS.up));
    const one = ok(await admin.get(`/api/admin/agency/report?streamer=${sC.id}`));
    assert.equal(one.totals.base, 20000 + 10000);
    const panel = ok(await tOwner.get(`/api/agency/commissions?id=${T.id}`));
    assert.equal(panel.totals.direct, num((await q("SELECT sum(amount) AS s FROM agency_ledger WHERE agency_id = $1 AND kind = 'direct'", [T.id]))[0].s));
    const csv = ok(await tOwner.get(`/api/agency/commissions?id=${T.id}&format=csv`));
    assert.ok(csv.csv.startsWith('islem,tur,yayinci'));
    const sim = ok(await admin.post('/api/admin/agency/simulate', { base: 100000 }));
    assert.deepEqual([sim.level.key, sim.shares.map((x) => x.amount), sim.platformKeeps], ['bronz', [60000], 40000]);
    const few = ok(await admin.post('/api/admin/agency/simulate', { base: 100000, active: 1 }));
    assert.deepEqual([few.level.key, few.reason, few.pool], ['gonul_bagi', 'active', 35000]);
  });
});
