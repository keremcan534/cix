// Agency network against a real Postgres (harness.mjs): the acceptance criteria of both agency specs, end to
// end over HTTP. Ş1-n = "Üst Ajans, Alt Ajans ve Çok Katmanlı Ajans Yönetim Sistemi" test n; Ş2-n = "Performansa
// Dayalı Dinamik Komisyon" test n. The steps share one network and run in order: T (top agency), S and S2 (its
// sub-agencies), streamers tA (T), sA sB sC (S), s2A (S2). Background jobs are off (AGENCY_JOBS=0); the tests
// run the engine through the centre's routes.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ AGENCY_JOBS: '0' });
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

// Shared state, filled in step by step.
let admin, tOwner, sOwner, s2Owner, outsider, gifter, staffU, staffV, bdU, fin1, fin2;
let tA, sA, sB, sC, s2A;
let T, S, S2;
let roles;
const income = async (streamer, diamonds, type = 'gift') => ok(await admin.post('/api/admin/agency/income', { streamer: streamer.id, type, diamonds, ref: ref() }), 'gelir');
const commissionsOf = (streamer) => q('SELECT * FROM agency_commissions WHERE streamer_id = $1 ORDER BY id', [streamer.id]);
const ledgerOf = (commissionId) => q('SELECT agency_id, kind, amount, rate FROM agency_ledger WHERE commission_id = $1 ORDER BY id', [commissionId]);
const setting = async (key, value) => ok(await admin.post('/api/admin/agency/settings', { key, value, reason: 'Test ayarı' }), `ayar ${key}`);

describe('Ajans ağı: kurulum ve hiyerarşi', () => {
  test('hesaplar', async () => {
    [admin, tOwner, sOwner, s2Owner, outsider, gifter, staffU, staffV, bdU, fin1, fin2] = await Promise.all(
      ['Merkez', 'Üst Sahip', 'Alt Sahip', 'Alt2 Sahip', 'Yabancı', 'Hediyeci', 'Personel', 'Personel2', 'BD', 'Finans1', 'Finans2'].map(account),
    );
    [tA, sA, sB, sC, s2A] = await Promise.all(['Yayıncı tA', 'Yayıncı sA', 'Yayıncı sB', 'Yayıncı sC', 'Yayıncı s2A'].map(account));
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    roles = Object.fromEntries(ok(await admin.get('/api/agency/roles')).roles.map((r) => [r.name, r.id]));
    assert.ok(roles['Yayıncı asistanı'] && roles['BD yöneticisi'] && roles['Finans sorumlusu']);
    // The rules the tests rely on, set through the centre's settings (each change is kept with a reason).
    await setting('weights', { volume: 40, active: 40, average: 0, growth: 0, retention: 0, acquisition: 0, operations: 0, reliability: 20 });
    await setting('performance', { window_months: 1, min_active_streamers: 1, promotion_min_periods: 2, demotion_min_periods: 1, max_step: 3 });
    await setting('tiers', [
      { key: 'start', name: 'Başlangıç', min_score: 0, sub_rate: 0.25, min_active: 0 },
      { key: 'growing', name: 'Gelişen', min_score: 40, sub_rate: 0.3, min_active: 1 },
      { key: 'successful', name: 'Başarılı', min_score: 60, sub_rate: 0.35, min_active: 2 },
      { key: 'overtook', name: 'Üst ajansı geçmiş', min_score: 60, sub_rate: 0.38, min_active: 2, overtake: true },
      { key: 'elite', name: 'Çok yüksek performans', min_score: 80, sub_rate: 0.39, min_active: 10, overtake: true },
    ]);
    await setting('payout_policy', { min_diamonds: 1000 });
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

  test('[Ş1-2][Ş2-1] üst ajans alt ajans başvurusu oluşturur; onaydan önce yayıncı eklenemez, komisyon yok', async () => {
    S = ok(await tOwner.post('/api/agency/sub/create', { parentId: T.id, name: 'Ay Ajans', owner: sOwner.id, region: 'İzmir', submit: true })).agency;
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
    S2 = ok(await tOwner.post('/api/agency/sub/create', { parentId: T.id, name: 'Güneş Ajans', owner: s2Owner.id, submit: true })).agency;
    assert.equal(S2.status, 'approved', 'otomatik onay');
    await setting('subagency_policy', { approval: 'center' });
    // Two levels in this release: a sub-agency can't found its own.
    refused(await sOwner.post('/api/agency/sub/create', { parentId: S.id, name: 'Torun Ajans' }), 403, 'üçüncü katman');
  });

  test('[Ş1-4][Ş2-2] alt ajans yayıncı davet eder; kodla başvuru onaylanır; yönetici atar', async () => {
    const inv = ok(await sOwner.post('/api/agency/invite', { id: S.id, user: sA.id }));
    const mine = ok(await sA.get('/api/agency/me'));
    assert.equal(mine.requests[0].kind, 'invite');
    ok(await sA.post('/api/agency/requests/respond', { requestId: inv.request.id, accept: true }));
    assert.equal(ok(await sA.get('/api/agency/me')).membership.agency.id, S.id);

    const code = (await q('SELECT code FROM agencies WHERE id = $1', [S.id]))[0].code;
    assert.equal(ok(await sB.get(`/api/agency/lookup?code=${code}`)).agency.id, S.id);
    const jr = ok(await sB.post('/api/agency/join', { code, method: 'code' }));
    assert.equal(jr.request.status, 'pending');
    ok(await sOwner.post('/api/agency/requests/decide', { id: S.id, requestId: jr.request.id, approve: true }));
    const jc = ok(await sC.post('/api/agency/join', { code, method: 'link' }));
    ok(await sOwner.post('/api/agency/requests/decide', { id: S.id, requestId: jc.request.id, approve: true }));

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
    const pendingJoin = ok(await outsider.post('/api/agency/join', { code: (await q('SELECT code FROM agencies WHERE id = $1', [S.id]))[0].code }));
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
  test('[Ş1-8] gerçek hediye: alt ajans %25, üst ajans fark %15, toplam %40; elmaslar dokunulmaz', async () => {
    ok(await gifter.post('/api/wallet/test-topup', { amount: 10000, ref: ref() }));
    giftRef = ref();
    const g = ok(await gifter.post('/api/gifts/send', { to: sA.id, giftId: 'g5', count: 10, ref: giftRef }));
    assert.equal(g.total, 5000);
    const me = ok(await sA.get('/api/me'));
    assert.equal(me.user.diamonds, 5000, 'yayıncının elması tam: komisyon platformdan, ondan kesilmez');
    const [k] = await commissionsOf(sA);
    assert.equal(num(k.base_diamonds), 5000);
    assert.equal(num(k.total_rate), 0.4);
    assert.equal(num(k.agency_rate), 0.25);
    assert.equal(num(k.parent_rate), 0.15);
    assert.equal(num(k.agency_amount), 1250);
    assert.equal(num(k.parent_amount), 750);
    assert.equal(num(k.usd), 0.4, 'komisyon 2000 elmas; 5000 elmas = 1 USD → 0,4 USD');
    assert.equal(k.agency_id, S.id);
    assert.equal(k.parent_agency_id, T.id);
    assert.match(k.txn, /^AKM-\d+$/);
    assert.match(k.rule_version, /^cap#\d+\|r#/);
    const l = await ledgerOf(k.id);
    assert.deepEqual(l.map((x) => [x.agency_id, x.kind, num(x.amount)]), [
      [S.id, 'direct', 1250],
      [T.id, 'difference', 750],
    ]);
    // More income for the scenario below.
    await income(tA, 10000);
    await income(sB, 20000);
    await income(sC, 20000);
    await income(s2A, 1000);
    const [kt] = await commissionsOf(tA);
    assert.equal(num(kt.agency_amount), 4000, 'üst ajansın doğrudan yayıncısı: tam %40');
    assert.equal(kt.parent_agency_id, null);
  });

  test('[Ş1-9][Ş2-7] havuz sınırı: hiçbir kayıt %40ı aşmaz; aşan oran ve ayar reddedilir', async () => {
    const all = await q('SELECT k.*, (SELECT sum(amount) FROM agency_ledger l WHERE l.commission_id = k.id) AS paid FROM agency_commissions k');
    for (const k of all) {
      assert.ok(num(k.total_rate) <= num(k.pool_cap));
      assert.equal(num(k.paid), Math.round(num(k.base_diamonds) * num(k.total_rate) * 1e4) / 1e4, `kayıt ${k.txn}: paylar toplamı = matrah × toplam oran`);
    }
    refused(await admin.post('/api/admin/agency/settings', { key: 'top_rate', value: 0.5, reason: 'Deneme' }), 400, 'üst oran > havuz');
    refused(await admin.post('/api/admin/agency/settings', { key: 'tiers', value: [{ key: 'start', name: 'Başlangıç', sub_rate: 0.45 }], reason: 'Deneme' }), 400, 'kademe > havuz');
    refused(await admin.post('/api/admin/agency/rate', { id: S.id, rate: 0.395, reason: 'Deneme' }), 400, 'alt oran > üst oran − asgari pay');
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
    assert.equal(r.commission.agencyAmount, -25);
    assert.equal(r.commission.parentAmount, -15);
    refused(await admin.post('/api/admin/agency/income', { streamer: sB.id, type: 'refund', diamonds: 100, ref: ref() }), 400, 'pozitif iade');
  });
});

describe('Performans ve dinamik komisyon', () => {
  let firstSA;
  test('[Ş2-4] alt ajans performansta üst ajansını geçer; ikisine bildirim gider', async () => {
    firstSA = (await commissionsOf(sA))[0];
    const r1 = ok(await admin.post('/api/admin/agency/performance/run', { effectiveFrom: new Date().toISOString(), note: 'Test 1' }));
    const s1 = r1.rows.find((x) => x.agencyId === S.id);
    const t1 = r1.rows.find((x) => x.agencyId === T.id);
    assert.ok(s1.score > t1.score, `alt ${s1.score} > üst ${t1.score}`);
    assert.equal(s1.overtakes, true);
    assert.equal(s1.qualified, 'overtook');
    assert.equal(s1.change, 'waiting', 'tek dönem yetmez: art arda 2 değerlendirme gerekir');
    assert.equal(s1.streak, 1);
    assert.ok(r1.rows.find((x) => x.agencyId === T.id).flags.includes('overtaken'));
    // Criteria beyond revenue are measured.
    assert.equal(s1.metrics.active, 3);
    assert.equal(t1.metrics.active, 1);
    assert.equal(s1.metrics.volume, 45000);
    assert.equal(t1.metrics.volume, 10000);
    assert.equal(t1.metrics.org_volume, 10000 + 45000 + 1000, 'organizasyon hacmi ayrı tutulur, puana girmez');
    const ns = ok(await sOwner.get(`/api/agency/notices?id=${S.id}`)).notices;
    const nt = ok(await tOwner.get(`/api/agency/notices?id=${T.id}`)).notices;
    assert.ok(ns.some((n) => n.kind === 'overtake'));
    assert.ok(nt.some((n) => n.kind === 'overtake'));
  });

  test('[Ş2-5][Ş2-6][Ş2-8] kademe yükselir, oran güncellenir, üst ajansın payı azalır; alt ajans bağlı kalır', async () => {
    const r2 = ok(await admin.post('/api/admin/agency/performance/run', { effectiveFrom: new Date().toISOString(), note: 'Test 2' }));
    const s2 = r2.rows.find((x) => x.agencyId === S.id);
    assert.equal(s2.change, 'up');
    assert.equal(s2.assigned, 'overtook');
    const ov = ok(await sOwner.get(`/api/agency/overview?id=${S.id}`));
    assert.equal(ov.agency.tier, 'overtook');
    assert.equal(ov.rate.rate, 0.38);
    assert.equal(ov.rate.parentShare, 0.02);
    assert.equal(ov.agency.parentId, T.id, 'geçse de bağlı kalır');
    assert.equal(ov.agency.level, 2);
    await income(sA, 10000);
    const k = (await commissionsOf(sA)).at(-1);
    assert.equal(num(k.agency_amount), 3800);
    assert.equal(num(k.parent_amount), 200);
    assert.equal(num(k.total_rate), 0.4);
    const perf = ok(await tOwner.get(`/api/agency/performance?id=${T.id}`));
    assert.equal(perf.subagencies[0].id, S.id, 'üst ajans panelinde alt ajans sıralaması');
    const ph = ok(await sOwner.get(`/api/agency/performance?id=${S.id}`));
    assert.ok(ph.tierHistory.some((t) => t.to === 'overtook' && t.source === 'engine'));
  });

  test('[Ş2-11][Ş2-12][Ş1-11] üst ajansın doğrudan komisyonu korunur; geçmiş kazançlar değişmez', async () => {
    await income(tA, 10000);
    const kt = (await commissionsOf(tA)).at(-1);
    assert.equal(num(kt.agency_amount), 4000);
    const again = (await commissionsOf(sA))[0];
    assert.deepEqual(again, firstSA, 'ilk kayıt aynen duruyor (oran değişikliği geriye işlemez)');
    assert.equal(num(again.agency_amount), 1250);
  });

  test('[Ş1-12] transferler: yayıncı ayrılır, alt ajanstan üst ajansa geçer; geçmiş kayıtlar eski ajansta kalır', async () => {
    const leave = ok(await sB.post('/api/agency/transfer', { reason: 'Kendi yoluma devam', ref: ref() })).transfer;
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
    assert.equal(num(ks.at(-1).agency_amount), 4000);
  });

  test('[Ş2-10][Ş2-9] performans düşünce kademe iner; yeni oran bir sonraki dönemden geçerli', async () => {
    const r = ok(await admin.post('/api/admin/agency/performance/run', { note: 'Test 3' }));
    const s = r.rows.find((x) => x.agencyId === S.id);
    assert.equal(s.metrics.active, 1);
    assert.equal(s.overtakes, false);
    assert.equal(s.change, 'down');
    assert.equal(s.assigned, 'growing');
    assert.ok(s.flags.includes('decline'));
    const eff = new Date(r.effectiveFrom);
    assert.ok(eff > new Date(), 'yürürlük gelecekte');
    assert.equal(eff.toISOString(), (await q('SELECT effective_from FROM agency_rates WHERE agency_id = $1 ORDER BY id DESC LIMIT 1', [S.id]))[0].effective_from.toISOString());
    // Earnings until then keep the current rate.
    await income(sA, 1000);
    const k = (await commissionsOf(sA)).at(-1);
    assert.equal(num(k.agency_amount), 380);
    const ov = ok(await sOwner.get(`/api/agency/overview?id=${S.id}`));
    assert.equal(ov.rate.rate, 0.38);
    assert.equal(ov.rate.upcoming.rate, 0.3);
  });

  test('[Ş2-18] üst ajans alt ajansın puanını, kademesini, oranını değiştiremez', async () => {
    refused(await tOwner.post('/api/admin/agency/tier', { id: S.id, tier: 'start', reason: 'Düşür' }), 403, 'kademe');
    refused(await tOwner.post('/api/admin/agency/rate', { id: S.id, rate: 0.1, reason: 'Düşür' }), 403, 'oran');
    refused(await tOwner.post('/api/admin/agency/ops-score', { agencyId: S.id, score: 0, reason: 'Düşür' }), 403, 'operasyon puanı');
    refused(await tOwner.post('/api/admin/agency/performance/run', {}), 403, 'değerlendirme');
  });

  test('[Ş2-16] merkezin elle değişikliği: kim, ne zaman, eski, yeni, gerekçe kayıtlı; geçmiş tarih reddedilir', async () => {
    refused(await admin.post('/api/admin/agency/rate', { id: S.id, rate: 0.3, reason: 'Geriye dönük', effectiveFrom: '2026-01-01T00:00:00Z' }), 400, 'geçmiş tarih');
    refused(await admin.post('/api/admin/agency/rate', { id: S.id, rate: 0.3 }), 400, 'gerekçesiz');
    const before = await q('SELECT * FROM agency_commissions ORDER BY id');
    const r = ok(await admin.post('/api/admin/agency/rate', { id: S.id, rate: 0.33, reason: 'Bölge kampanyası düzeltmesi' }));
    assert.equal(r.rate, 0.33);
    const a = (await q("SELECT * FROM agency_audit WHERE action = 'agency.rate' AND target_id = $1 ORDER BY id DESC LIMIT 1", [S.id]))[0];
    assert.equal(a.actor_id, admin.id);
    assert.equal(a.reason, 'Bölge kampanyası düzeltmesi');
    assert.equal(a.before.rate, 0.38);
    assert.equal(a.after.rate, 0.33);
    assert.ok(a.created_at);
    const th = (await q("SELECT * FROM agency_tier_history WHERE agency_id = $1 AND source = 'manual' ORDER BY id DESC LIMIT 1", [S.id]))[0];
    assert.equal(th.actor_id, admin.id);
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
    assert.equal(num(k1.total_rate), 0.4);
    assert.equal(num(k1.agency_amount), 350);
    assert.equal(num(k1.transition_amount), 50);
    assert.deepEqual((await ledgerOf(k1.id)).map((l) => [l.agency_id, l.kind, num(l.amount)]), [
      [S2.id, 'direct', 350],
      [T.id, 'transition', 50],
    ]);
    await sleep(Math.max(0, new Date(endsAt).getTime() - Date.now()) + 400);
    await income(s2A, 1000);
    const k2 = (await commissionsOf(s2A)).at(-1);
    assert.equal(num(k2.agency_amount), 400, 'süre bitti: tam oran bağımsız ajansın');
    assert.equal(num(k2.transition_amount), 0);
    assert.deepEqual((await ledgerOf(k2.id)).map((l) => l.agency_id), [S2.id]);
    // The earlier commission under T stays as it was.
    const k0 = (await commissionsOf(s2A))[0];
    assert.equal(k0.parent_agency_id, T.id);
    assert.equal(num(k0.parent_amount), 150);
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
    assert.equal(ov.tops, 2);
    assert.equal(ov.subs, 1);
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
    assert.equal(num(bd[0].amount), (10000 + 4000) * 0.05, 'BD: (matrah + havuz) × %5');
    assert.equal(num(k.agency_amount), 4000, 'ajans payı BD yüzünden azalmaz');
    const rep = ok(await bdU.get('/api/admin/agency/bd-report'));
    assert.deepEqual(rep.agencies.map((a) => a.id), [T.id]);
    assert.equal(rep.ledger[0].amount, 700);
  });

  test('[Ş1-16] ödeme: kapanan dönem, tek açık talep, aynı istek tekrarı, iki kişili onay, benzersiz ödeme referansı', async () => {
    refused(await tOwner.post('/api/agency/payouts/request', { id: T.id, currency: 'USD', ref: ref() }), 409, 'dönem açıkken');
    // The period ending: simulated here; in production the job closes it period_close_days after its end.
    const period = (await q('SELECT DISTINCT period FROM agency_ledger'))[0].period;
    refused(await admin.post('/api/admin/agency/periods/close', { period }), 400, 'bitmemiş dönem kapanmaz');
    await q('INSERT INTO agency_periods (period) VALUES ($1)', [period]);
    const r0 = ref();
    const p = ok(await tOwner.post('/api/agency/payouts/request', { id: T.id, currency: 'USD', ref: r0 }));
    const expected = num((await q("SELECT sum(amount) AS s FROM agency_ledger WHERE agency_id = $1", [T.id]))[0].s);
    assert.equal(p.payout.amount, expected);
    assert.equal(p.payout.usd, Math.round((expected / 5000) * 100) / 100);
    const replay = ok(await tOwner.post('/api/agency/payouts/request', { id: T.id, currency: 'USD', ref: r0 }));
    assert.equal(replay.replay, true);
    assert.equal(replay.payout.id, p.payout.id);
    refused(await tOwner.post('/api/agency/payouts/request', { id: T.id, currency: 'USD', ref: ref() }), 409, 'ikinci açık talep');

    ok(await admin.post('/api/admin/agency/staff/set', { user: fin1.id, roleId: roles['Finans sorumlusu'] }));
    ok(await admin.post('/api/admin/agency/staff/set', { user: fin2.id, roleId: roles['Finans sorumlusu'] }));
    refused(await tOwner.post('/api/admin/agency/payouts/decide', { payoutId: p.payout.id, action: 'approve' }), 403, 'ajans kendi ödemesini onaylayamaz');
    ok(await fin1.post('/api/admin/agency/payouts/decide', { payoutId: p.payout.id, action: 'approve' }));
    refused(await fin1.post('/api/admin/agency/payouts/decide', { payoutId: p.payout.id, action: 'pay', paymentRef: 'BANKA-0001' }), 403, 'onaylayan ödeyemez');
    ok(await fin2.post('/api/admin/agency/payouts/decide', { payoutId: p.payout.id, action: 'pay', paymentRef: 'BANKA-0001' }));
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
    assert.equal(num(rev[0].amount), -4000);
    assert.equal(rev[0].payout_id, null);
  });

  test('[Ş2-20] raporlar kayıtlarla tutarlı; filtreler çalışır', async () => {
    const rep = ok(await admin.get('/api/admin/agency/report'));
    const db = (await q('SELECT sum(base_diamonds) AS base, sum(agency_amount + parent_amount + transition_amount) AS com, count(*)::int AS n FROM agency_commissions'))[0];
    assert.equal(rep.totals.base, num(db.base));
    assert.equal(rep.totals.commission, num(db.com));
    assert.equal(rep.totals.events, db.n);
    const led = (await q("SELECT sum(amount) AS s FROM agency_ledger WHERE kind IN ('direct', 'difference', 'transition')"))[0];
    assert.equal(rep.totals.commission, num(led.s), 'rapor = defter');
    assert.equal(rep.totals.platformKeeps, num(db.base) - num(db.com));
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
    const sim = ok(await admin.post('/api/admin/agency/simulate', { base: 100000, subRate: 0.35 }));
    assert.deepEqual(sim.shares.map((x) => x.amount), [35000, 5000]);
    assert.equal(sim.platformKeeps, 60000);
  });

  test('canlı yayın süresi aktiflik ölçüsüne yazılır', async () => {
    // LiveKit webhook path is covered in launch.test.mjs; here the row shape the engine reads.
    await q("INSERT INTO presence_log (user_id, room, joined_at, left_at, seconds) VALUES ($1, 'oda1', now() - interval '1 hour', now(), 3600)", [sB.id]);
    const r = ok(await admin.post('/api/admin/agency/performance/run', { dryRun: true }));
    assert.ok(r.rows.length >= 3);
    assert.equal((await q('SELECT dry_run FROM agency_perf_runs WHERE id = $1', [r.runId]))[0].dry_run, true);
  });
});
