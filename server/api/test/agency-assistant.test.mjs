// Ajans asistanı (agency-assistants.mjs, agency-lib.mjs calcEvent; docs/AJANS_ASISTANI.md) against a real Postgres:
// the owner names an assistant among the agency's own people; a streamer the assistant brought in gives the
// assistant a share of the agency's own commission, moved out of the owner's commission into the assistant's
// wallet in the same transaction; a change of share starts next Monday and comes once a week; a refund and the
// centre's reversal take the share back; removal stops it. Amounts: 1/10,000 diamond exact on the ledgers, rounded
// toward zero (the owner keeps the fraction); the wallet gets whole diamonds once the exact total reaches them.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

// Test top-ups on: the centre may date an income (occurredAt), so next week's share can be tried today.
const h = startApi({ AGENCY_JOBS: '0', ALLOW_TEST_TOPUP: '1' });
const { call, signUp } = h;

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
/** Monday 00:00 in Türkiye (UTC+3 all year) of the week `t` is in, and the next one: computed here on its own. */
const monday = (t) => {
  const d = new Date(t.getTime() + 3 * 3600e3);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back) - 3 * 3600e3);
};
const nextMonday = (t) => new Date(monday(t).getTime() + 7 * 86400e3);

let admin, owner, helper, a1, a2, a3, outsider, owner2, helper2, b1, gifter;
let T, T2;
let H; // the assistant record of `helper` in T
const income = async (streamer, diamonds, extra = {}) => ok(await admin.post('/api/admin/agency/income', { streamer: streamer.id, type: 'gift', diamonds, ref: ref(), ...extra }), 'gelir');
const diamondsOf = async (u) => num((await q('SELECT diamonds FROM users WHERE id = $1', [u.id]))[0].diamonds);
const ledgerOf = (commissionId) => q('SELECT agency_id, kind, amount, rate FROM agency_ledger WHERE commission_id = $1 ORDER BY id', [commissionId]);
const shareOf = async (commissionId) => (await q('SELECT * FROM agency_assistant_ledger WHERE commission_id = $1', [commissionId]))[0];
const codeOf = async (agencyId) => (await q('SELECT code FROM agencies WHERE id = $1', [agencyId]))[0].code;

describe('Ajans asistanı', () => {
  test('kurulum: ajans, yayıncılar ve %20 ajans oranı', async () => {
    [admin, owner, helper, a1, a2, a3, outsider, owner2, helper2, b1, gifter] = await Promise.all(
      ['Merkez', 'Sahip', 'Asistan Ayşe', 'Yayıncı Bir', 'Yayıncı İki', 'Yayıncı Üç', 'Yabancı', 'Sahip İki', 'Asistan Elif', 'Yayıncı Be', 'Hediyeci'].map(account),
    );
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    await q("UPDATE users SET gender = 'Kadın' WHERE id = ANY($1::uuid[])", [[helper, a1, a2, a3, outsider, helper2, b1].map((x) => x.id)]);
    T = ok(await admin.post('/api/admin/agency/create', { name: 'Asistan Ajans', owner: owner.id })).agency;
    T2 = ok(await admin.post('/api/admin/agency/create', { name: 'İkinci Ajans', owner: owner2.id })).agency;
    // The owner's commission in the example: 20 % of the streamer's income.
    for (const a of [T, T2]) ok(await admin.post('/api/admin/agency/rate', { id: a.id, rate: 0.2, reason: 'Örnek oran' }));
    ok(await helper.post('/api/agency/join', { code: await codeOf(T.id), method: 'code' }), 'asistan adayı yayıncı olur');
    ok(await helper2.post('/api/agency/join', { code: await codeOf(T2.id), method: 'code' }));
  });

  test('yalnız sahip, yalnız ajansın kendi insanlarından birini ve en fazla 1 asistan atar', async () => {
    refused(await outsider.post('/api/agency/assistants/add', { id: T.id, user: helper.id, pct: 80 }), 403, 'sahip olmayan');
    refused(await owner.post('/api/agency/assistants/add', { id: T.id, user: outsider.id, pct: 80 }), 409, 'ajansın üyesi değil');
    refused(await owner.post('/api/agency/assistants/add', { id: T.id, user: owner.id, pct: 80 }), 400, 'sahip kendisi');
    refused(await owner.post('/api/agency/assistants/add', { id: T.id, user: helper.id, pct: 101 }), 400, 'pay sınırı');
    refused(await owner.post('/api/agency/assistants/add', { id: T.id, user: helper.id, pct: 12.5 }), 400, 'tam sayı');
    H = ok(await owner.post('/api/agency/assistants/add', { id: T.id, user: helper.id, pct: 80 }), 'asistan atanır').assistant;
    assert.equal(H.share.pct, 80);
    assert.equal(H.upcoming, null);
    assert.match(H.code, /^[A-Z0-9]{6,10}$/);
    assert.notEqual(H.code, await codeOf(T.id));
    // The limit (assistant_policy.max, 1 by default): a second member can't be named while the first one is there.
    ok(await a2.post('/api/agency/join', { code: await codeOf(T.id), method: 'code' }));
    refused(await owner.post('/api/agency/assistants/add', { id: T.id, user: a2.id, pct: 50 }), 409, 'en fazla 1');
    const list = ok(await owner.get(`/api/agency/assistants?id=${T.id}`));
    assert.equal(list.max, 1);
    assert.equal(list.canAdd, false);
    assert.deepEqual(list.assistants.map((x) => x.user.id), [helper.id]);
    refused(await helper.get(`/api/agency/assistants?id=${T.id}`), 403, 'asistan listeyi göremez');
    // Candidates: the agency's own people, not the owner, not an assistant already.
    const cands = ok(await owner.get(`/api/agency/assistants/candidates?id=${T.id}`)).users.map((u) => u.id);
    assert.ok(cands.includes(a2.id) && !cands.includes(helper.id) && !cands.includes(owner.id) && !cands.includes(outsider.id));
  });

  test('asistanın kodu: katılan yayıncı asistanın getirdiği olarak kaydedilir', async () => {
    const look = ok(await a1.get(`/api/agency/lookup?code=${H.code}`));
    assert.equal(look.agency.id, T.id);
    assert.equal(look.assistant.name, helper.name);
    ok(await a1.post('/api/agency/join', { code: H.code, method: 'code' }));
    const m = (await q('SELECT agency_id, invited_by FROM agency_streamers WHERE streamer_id = $1 AND ended_at IS NULL', [a1.id]))[0];
    assert.equal(m.agency_id, T.id);
    assert.equal(m.invited_by, helper.id);
    // The agency's own code records nobody.
    assert.equal((await q('SELECT invited_by FROM agency_streamers WHERE streamer_id = $1', [a2.id]))[0].invited_by, null);
  });

  test('örnek: 100 elmas, ajans %20 = 20, asistan %80 = 16, sahip 4; elmas aynı işlemde asistanın hesabına geçer', async () => {
    const before = await diamondsOf(helper);
    const r = await income(a1, 100);
    const com = r.commission;
    assert.equal(com.agencyAmount, 20, 'ajansın komisyonu değişmez: 20');
    const rows = await ledgerOf(com.id);
    assert.deepEqual(
      rows.map((x) => [x.kind, num(x.amount), num(x.rate)]),
      [
        ['direct', 20, 0.2],
        ['assistant', -16, 0.16],
      ],
    );
    assert.equal(rows.reduce((s, x) => s + num(x.amount), 0), 4, 'sahibe kalan 4');
    const share = await shareOf(com.id);
    assert.equal(num(share.amount), 16);
    assert.equal(num(share.basis), 20);
    assert.equal(share.pct, 80);
    assert.equal(num(share.wallet), 16);
    assert.equal(await diamondsOf(helper), before + 16);
    const led = await q("SELECT amount, reason, channel, counterparty FROM ledger WHERE user_id = $1 AND currency = 'diamond' AND ref = $2", [helper.id, `asistan:k${com.id}`]);
    assert.deepEqual(led.map((x) => [num(x.amount), x.reason, x.channel, x.counterparty]), [[16, 'Ajans asistanı payı', 'asistan', null]]);
    // Locked as store-coin gift diamonds are: they count in the balance, they can't leave yet.
    const lock = await q("SELECT amount, unlock_at > now() + interval '6 days' AS week FROM diamond_locks WHERE user_id = $1 AND channel = 'asistan'", [helper.id]);
    assert.deepEqual(lock.map((x) => [num(x.amount), x.week]), [[16, true]]);
    assert.equal(num((await q('SELECT assistant_amount FROM agency_commissions WHERE id = $1', [com.id]))[0].assistant_amount), 16);
    // A streamer nobody brought: the agency keeps all of it.
    const r2 = await income(a2, 100);
    assert.deepEqual((await ledgerOf(r2.commission.id)).map((x) => x.kind), ['direct']);
    assert.equal(await shareOf(r2.commission.id), undefined);
  });

  test('yuvarlama: payın küsuratı birikir, tam elmas olunca hesaba geçer; sahip ile asistanın toplamı komisyonun kendisi', async () => {
    const start = await diamondsOf(helper);
    const steps = [
      // income → commission (20 %) → share (80 %), exact; wallet = floor(running exact total) − what went before
      [7, 1.4, 1.12, 1], // 16 + 1.12 = 17.12 → +1
      [3, 0.6, 0.48, 0], // 17.60 → +0
      [2, 0.4, 0.32, 0], // 17.92 → +0
      [1, 0.2, 0.16, 1], // 18.08 → +1
    ];
    for (const [diamonds, commission, part, wallet] of steps) {
      const com = (await income(a1, diamonds)).commission;
      const rows = await ledgerOf(com.id);
      assert.equal(num(rows.find((x) => x.kind === 'direct').amount), commission);
      assert.equal(num(rows.find((x) => x.kind === 'assistant').amount), -part);
      const share = await shareOf(com.id);
      assert.equal(num(share.amount), part, `${diamonds} elmas: pay`);
      assert.equal(num(share.wallet), wallet, `${diamonds} elmas: cüzdana geçen`);
    }
    assert.equal(await diamondsOf(helper), start + 2);
    const all = await q("SELECT sum(amount) AS s FROM agency_assistant_ledger WHERE user_id = $1", [helper.id]);
    const wallet = await q("SELECT sum(amount) AS s FROM ledger WHERE user_id = $1 AND channel = 'asistan'", [helper.id]);
    assert.equal(num(all[0].s), 18.08);
    assert.equal(num(wallet[0].s), Math.floor(18.08), 'cüzdana geçen hiçbir zaman kesin toplamı aşmaz');
  });

  test('pay haftada bir değişir ve gelecek pazartesi 00:00’dan (Türkiye) geçerli olur', async () => {
    const now = new Date();
    const changed = ok(await owner.post('/api/agency/assistants/share', { id: T.id, assistantId: H.id, pct: 50 }), 'değişiklik').assistant;
    assert.equal(changed.share.pct, 80, 'bu hafta eski pay');
    assert.equal(changed.upcoming.pct, 50);
    assert.equal(new Date(changed.upcoming.from).getTime(), nextMonday(now).getTime());
    assert.equal(changed.canChange, false);
    // A double tap is the same change; another change this week is refused.
    assert.equal(ok(await owner.post('/api/agency/assistants/share', { id: T.id, assistantId: H.id, pct: 50 })).replay, true);
    refused(await owner.post('/api/agency/assistants/share', { id: T.id, assistantId: H.id, pct: 60 }), 409, 'haftada bir');
    refused(await helper.post('/api/agency/assistants/share', { id: T.id, assistantId: H.id, pct: 100 }), 403, 'asistan kendi payını değiştiremez');
    // Income now: still 80 %. Income next Monday 01:00: 50 %.
    const nowCom = (await income(a1, 100)).commission;
    assert.equal(num((await shareOf(nowCom.id)).amount), 16);
    const later = new Date(nextMonday(now).getTime() + 3600e3);
    const nextCom = (await income(a1, 100, { occurredAt: later.toISOString() })).commission;
    assert.equal(num((await shareOf(nextCom.id)).amount), 10, '20 × %50');
    // One minute before Monday 00:00: the old share.
    const justBefore = new Date(nextMonday(now).getTime() - 60e3);
    const beforeCom = (await income(a1, 100, { occurredAt: justBefore.toISOString() })).commission;
    assert.equal(num((await shareOf(beforeCom.id)).amount), 16);
  });

  test('%0 ve %100; geçen hafta yapılan değişiklik bu haftayı kilitlemez', async () => {
    const H2 = ok(await owner2.post('/api/agency/assistants/add', { id: T2.id, user: helper2.id, pct: 0 })).assistant;
    ok(await b1.post('/api/agency/join', { code: H2.code, method: 'code' }));
    const zero = (await income(b1, 100)).commission;
    assert.deepEqual((await ledgerOf(zero.id)).map((x) => [x.kind, num(x.amount)]), [['direct', 20]], '%0: bütün komisyon sahibin');
    assert.equal(await shareOf(zero.id), undefined);
    // A change made last week (written straight into the table, as it would have been then) does not count this week.
    const lastWeek = new Date(monday(new Date()).getTime() - 2 * 86400e3);
    await q('INSERT INTO agency_assistant_shares (assistant_id, streamer_pct, effective_from, created_at) VALUES ($1, 0, $2, $3)', [H2.id, monday(new Date()), lastWeek]);
    const full = ok(await owner2.post('/api/agency/assistants/share', { id: T2.id, assistantId: H2.id, pct: 100 }), 'bu hafta değişebilir').assistant;
    assert.equal(full.upcoming.pct, 100);
    const before = await diamondsOf(helper2);
    const com = (await income(b1, 100, { occurredAt: new Date(nextMonday(new Date()).getTime() + 60e3).toISOString() })).commission;
    const rows = await ledgerOf(com.id);
    assert.deepEqual(rows.map((x) => [x.kind, num(x.amount)]), [['direct', 20], ['assistant', -20]]);
    assert.equal(rows.reduce((s, x) => s + num(x.amount), 0), 0, '%100: sahibe bu gelirden bir şey kalmaz');
    assert.equal(await diamondsOf(helper2), before + 20);
  });

  test('iade: payı aynı yoldan geri alır; bakiye yetmezse eksik sonraki paylardan düşülür', async () => {
    // A refund is dated at its gift's time (jeton.mjs refundPurchase), so it meets the same share.
    const at = new Date().toISOString();
    const gift = (await income(a1, 100, { occurredAt: at })).commission;
    assert.equal(num((await shareOf(gift.id)).amount), 16);
    const before = await diamondsOf(helper);
    const back = (await income(a1, -100, { type: 'refund', occurredAt: at })).commission;
    const rows = await ledgerOf(back.id);
    assert.deepEqual(rows.map((x) => [x.kind, num(x.amount)]), [['direct', -20], ['assistant', 16]]);
    const share = await shareOf(back.id);
    assert.equal(num(share.amount), -16);
    assert.equal(num(share.wallet), -16);
    assert.equal(await diamondsOf(helper), before - 16);
    assert.equal((await q("SELECT reason FROM ledger WHERE user_id = $1 AND ref = $2", [helper.id, `asistan:k${back.id}`]))[0].reason, 'Ajans asistanı payı geri alındı');

    // The assistant already spent their diamonds: what the balance can't pay stays owed and the next share pays it.
    const gift2 = (await income(a1, 100, { occurredAt: at })).commission;
    assert.equal(num((await shareOf(gift2.id)).wallet), 16);
    const spent = await diamondsOf(helper);
    await q("UPDATE users SET diamonds = 10 WHERE id = $1", [helper.id]);
    const back2 = (await income(a1, -100, { type: 'refund', occurredAt: at })).commission;
    assert.equal(num((await shareOf(back2.id)).wallet), -10, 'bakiyedeki 10 geri alınır');
    assert.equal(await diamondsOf(helper), 0);
    const next = (await income(a1, 100)).commission;
    assert.equal(num((await shareOf(next.id)).amount), 16);
    assert.equal(num((await shareOf(next.id)).wallet), 10, '16 − 6 borç = 10');
    assert.equal(await diamondsOf(helper), 10);
    assert.ok(spent > 10);
  });

  test('merkezin ters kaydı asistan payını da geri alır; ikinci kez yapılamaz', async () => {
    const com = (await income(a1, 100)).commission;
    const before = await diamondsOf(helper);
    const r = ok(await admin.post('/api/admin/agency/commissions/reverse', { commissionId: com.id, reason: 'Hatalı gelir' }));
    assert.equal(r.reversed, 2);
    assert.equal(r.assistants, 1);
    const rev = await q("SELECT o.kind AS of, r.kind, r.amount FROM agency_ledger r JOIN agency_ledger o ON o.id = r.reverses WHERE o.commission_id = $1 ORDER BY o.kind", [com.id]);
    assert.deepEqual(rev.map((x) => [x.of, x.kind, num(x.amount)]), [['assistant', 'reversal', 16], ['direct', 'reversal', -20]]);
    const orig = await shareOf(com.id);
    const back = (await q('SELECT amount, wallet, agency_ledger_id FROM agency_assistant_ledger WHERE reverses = $1', [orig.id]))[0];
    assert.equal(num(back.amount), -16);
    assert.equal(num(back.wallet), -16);
    assert.ok(back.agency_ledger_id, 'sahibin ters kaydına bağlı');
    assert.equal(await diamondsOf(helper), before - 16);
    refused(await admin.post('/api/admin/agency/commissions/reverse', { commissionId: com.id, reason: 'Tekrar' }), 404);
  });

  test('para yaratılmaz: sahibin asistan satırları ile asistanın hesabı her zaman sıfırlanır; cüzdana geçen kesin toplamı aşmaz', async () => {
    const own = await q(
      `SELECT coalesce(sum(l.amount), 0) AS s FROM agency_ledger l
        WHERE l.kind = 'assistant' OR l.reverses IN (SELECT id FROM agency_ledger WHERE kind = 'assistant')`,
    );
    const side = await q('SELECT coalesce(sum(amount), 0) AS s FROM agency_assistant_ledger');
    assert.equal(num(own[0].s) + num(side[0].s), 0);
    for (const u of [helper, helper2]) {
      const x = (await q('SELECT coalesce(sum(amount), 0) AS exact, coalesce(sum(wallet), 0) AS wallet FROM agency_assistant_ledger WHERE user_id = $1', [u.id]))[0];
      const moved = (await q("SELECT coalesce(sum(amount), 0) AS s FROM ledger WHERE user_id = $1 AND channel = 'asistan'", [u.id]))[0];
      assert.equal(num(moved.s), num(x.wallet), 'cüzdan defteri ile asistan hesabı aynı');
      assert.ok(num(x.wallet) <= Math.floor(num(x.exact)), 'cüzdana geçen ≤ kesin toplam');
    }
    // The rows can't be edited or deleted.
    await assert.rejects(h.sql.query('UPDATE agency_assistant_ledger SET amount = 1'), /never changed/);
    await assert.rejects(h.sql.query('DELETE FROM agency_assistant_ledger'), /never deleted/);
  });

  test('davet yoluyla getirilen yayıncı da sayılır; asistan kendi kartında payını ve kazancını görür', async () => {
    const roles = Object.fromEntries(ok(await admin.get('/api/agency/roles')).roles.map((r) => [r.name, r.id]));
    ok(await owner.post('/api/agency/staff/set', { id: T.id, user: helper.id, roleId: roles['Yayıncı asistanı'] }));
    const inv = ok(await helper.post('/api/agency/invite', { id: T.id, user: a3.id }));
    ok(await a3.post('/api/agency/requests/respond', { requestId: inv.request.id, accept: true }));
    assert.equal((await q('SELECT invited_by FROM agency_streamers WHERE streamer_id = $1 AND ended_at IS NULL', [a3.id]))[0].invited_by, helper.id);
    const com = (await income(a3, 50)).commission;
    assert.equal(num((await shareOf(com.id)).amount), 8, '10 × %80');

    const me = ok(await helper.get('/api/agency/me')).assistant;
    assert.equal(me.agency.id, T.id);
    assert.equal(me.code, H.code);
    assert.equal(me.share.pct, 80);
    assert.equal(me.upcoming.pct, 50);
    assert.equal(me.invited.total, 2, 'kodla bir, davetle bir');
    assert.ok(me.week.streamerIncome >= 150);
    assert.ok(me.rows.length > 0 && me.rows[0].amount === 8);
    const src = ok(await helper.get('/api/wallet/income?period=all')).sources.find((s) => s.key === 'assistant');
    assert.equal(src.label, 'Ajans asistanı payı');
    const wallet = (await q('SELECT coalesce(sum(wallet), 0) AS s FROM agency_assistant_ledger WHERE user_id = $1', [helper.id]))[0];
    assert.equal(src.diamonds, num(wallet.s));
    // Someone who never was an assistant sees no such line.
    assert.equal(ok(await a1.get('/api/wallet/income?period=all')).sources.some((s) => s.key === 'assistant'), false);
    assert.equal(ok(await a1.get('/api/agency/me')).assistant, null);
    // The owner's panel: the share leaves the owner's totals.
    const ov = ok(await owner.get(`/api/agency/overview?id=${T.id}`)).earnings;
    assert.ok(ov.assistant30 < 0);
    assert.ok(ov.balances.assistant < 0);
  });

  test('gerçek hediye: hediyenin komisyonu ile asistan payı aynı işlemde yazılır', async () => {
    ok(await gifter.post('/api/wallet/test-topup', { amount: 1000, ref: ref() }));
    const before = await diamondsOf(helper);
    ok(await gifter.post('/api/wallet/gift', { to: a1.id, amount: 50, ref: ref() }));
    const com = (await q("SELECT k.id FROM agency_commissions k JOIN income_events e ON e.id = k.income_event_id WHERE e.source_ref LIKE 'test-gift:%' AND k.streamer_id = $1", [a1.id]))[0];
    assert.ok(com, 'hediyenin komisyonu');
    assert.equal(num((await shareOf(com.id)).amount), 8, '50 × %20 × %80');
    assert.equal(await diamondsOf(helper), before + 8);
  });

  test('ayrılan asistan pay almaz; sahip çıkarınca pay durur, getirdikleri ajansta kalır; aynı hafta yeniden eklenemez', async () => {
    // Elif leaves the agency (the centre ends her membership): no share from then on.
    ok(await admin.post('/api/admin/agency/assign', { streamer: helper2.id, reason: 'Ajanstan ayrıldı' }));
    const gone = (await income(b1, 100)).commission;
    assert.equal(await shareOf(gone.id), undefined, 'ajanstan ayrılan asistan');
    assert.equal(ok(await owner2.get(`/api/agency/assistants?id=${T2.id}`)).assistants[0].member, false);

    ok(await owner.post('/api/agency/assistants/remove', { id: T.id, assistantId: H.id }));
    const after = (await income(a1, 100)).commission;
    assert.deepEqual((await ledgerOf(after.id)).map((x) => [x.kind, num(x.amount)]), [['direct', 20]], 'komisyonun tamamı sahibin');
    assert.equal((await q('SELECT agency_id FROM agency_streamers WHERE streamer_id = $1 AND ended_at IS NULL', [a1.id]))[0].agency_id, T.id, 'yayıncı ajansta kalır');
    refused(await a2.get(`/api/agency/lookup?code=${H.code}`), 404, 'eski kod çalışmaz');
    refused(await owner.post('/api/agency/assistants/share', { id: T.id, assistantId: H.id, pct: 30 }), 404);
    refused(await owner.post('/api/agency/assistants/add', { id: T.id, user: helper.id, pct: 80 }), 409, 'aynı hafta yeniden');
    // Another member can be named at once; the slot is free.
    const next = ok(await owner.post('/api/agency/assistants/add', { id: T.id, user: a2.id, pct: 40 })).assistant;
    assert.equal(next.share.pct, 40);
    // The former assistant still sees what she earned.
    const me = ok(await helper.get('/api/agency/me')).assistant;
    assert.equal(me.active, false);
    assert.ok(me.total.wallet > 0);
  });
});
