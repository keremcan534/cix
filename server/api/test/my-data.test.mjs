// Verilerimin kopyası (my-data.mjs, GET /api/me/export) against a real Postgres: my data from every table that holds
// it, other people only as I see them in the app (never who blocked or reported me, never visitors without VIP,
// never staff notes), once in 24 hours, and the date it was taken goes with the account.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';
import { EXPORTED, NOT_EXPORTED } from '../my-data-tables.mjs';

const h = startApi({ AUTO_MUTE_REFUSALS: '0' });
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const exportOf = (s) => ok(call('GET', '/api/me/export', null, s), 'veri kopyası');

describe('Verilerimin kopyası', () => {
  test('her tablodaki verim gelir; başkalarının gizli verisi gelmez', async () => {
    const me = await signUp('Veri Sahibi');
    const friend = await signUp('Arkadaş');
    const hater = await signUp('Engelleyen');
    const snoop = await signUp('Ziyaretçi');
    const spammer = await signUp('Spamcı');
    await ok(call('PATCH', '/api/me', { bio: 'Kahve ve kitap', city: 'İzmir', birthDate: '1995-04-12' }, me.session), 'profil');
    await ok(call('POST', '/api/wallet/test-topup', { amount: 1000, ref: rnd(6) }, me.session), 'yükleme');
    await ok(call('POST', '/api/follow', { to: friend.user.id }, me.session), 'takip');
    await ok(call('POST', '/api/follow', { to: me.user.id }, friend.session), 'takipçi');
    await ok(call('POST', '/api/messages', { to: friend.user.id, text: 'Selam, nasılsın?', ref: rnd(6) }, me.session), 'mesaj');
    await ok(call('POST', '/api/messages', { to: me.user.id, text: 'İyiyim, sen?', ref: rnd(6) }, friend.session), 'cevap');
    await ok(call('POST', '/api/gifts/send', { to: friend.user.id, giftId: 'g4', count: 1, ref: rnd(6) }, me.session), 'hediye');
    await ok(call('POST', '/api/report', { type: 'user', id: spammer.user.id, reason: 'Spam' }, me.session), 'şikâyet');
    await ok(call('POST', '/api/support/tickets', { category: 'Teknik', text: 'Uygulama açılışta donuyor', ref: rnd(6) }, me.session), 'talep');
    await ok(call('POST', '/api/me/spend-limit', { limit: 2000 }, me.session), 'limit');
    // What is private to others: who blocked me, who reported me, who visited me (I have no VIP), staff notes.
    await ok(call('POST', '/api/block', { to: me.user.id }, hater.session), 'engel');
    await ok(call('POST', '/api/report', { type: 'user', id: me.user.id, reason: 'Taciz veya hakaret', note: 'gizli not' }, hater.session), 'beni şikâyet');
    await ok(call('GET', `/api/user?id=${me.user.id}&visit=1`, null, snoop.session), 'ziyaret');
    await q(
      "INSERT INTO user_sanctions (user_id, sanction_type, scope, reason_code, reason_description, internal_note, expires_at, created_role) VALUES ($1, 'mute_global_text', 'global', 'spam', 'Odada spam', 'YETKILI-NOTU', now() + interval '1 hour', 'moderator')",
      [me.user.id],
    );

    const x = await exportOf(me.session);
    assert.equal(x.format, 'similar-verilerim-1');
    assert.equal(x.account.id, me.user.id);
    assert.deepEqual([x.account.bio, x.account.city, x.account.birthDate], ['Kahve ve kitap', 'İzmir', '1995-04-12']);
    assert.equal(x.account.balances.coins, 800);
    assert.ok(x.sessions.length >= 1 && !('tokenHash' in x.sessions[0]) && !('token_hash' in x.sessions[0]), 'oturumlar, anahtarı olmadan');
    assert.deepEqual(x.follows.following.map((p) => p.name), ['Arkadaş']);
    assert.deepEqual(x.follows.followers.map((p) => p.name), ['Arkadaş']);
    assert.deepEqual(x.messages.map((m) => [m.direction, m.with.name, m.text]), [
      ['sent', 'Arkadaş', 'Selam, nasılsın?'],
      ['received', 'Arkadaş', 'İyiyim, sen?'],
    ]);
    assert.deepEqual(x.gifts.sent.map((g) => [g.giftId, g.total, g.to.name]), [['g4', 200, 'Arkadaş']]);
    assert.ok(x.wallet.ledger.some((l) => l.reason === 'Test yüklemesi' && l.amount === 1000));
    assert.ok(x.wallet.ledger.some((l) => l.amount === -200));
    assert.equal(x.wallet.spendLimit.limit, 2000);
    assert.equal(x.wallet.spendLimit.spentToday, 200);
    assert.deepEqual(x.safety.reportsMade.map((r) => [r.reason, r.target]), [['Spam', spammer.user.id]]);
    assert.ok(x.safety.sanctions.some((s) => s.reasonText === 'Odada spam' && s.appliedBy === 'Platform moderatörü'));
    assert.deepEqual(x.support.map((t) => [t.category, t.text]), [['Teknik', 'Uygulama açılışta donuyor']]);
    assert.equal(x.visits.visitorsLast7Days, 1);
    assert.equal(x.visits.visitors, null, 'VIP olmadan kim olduğu gelmez');

    const text = JSON.stringify(x);
    assert.ok(!text.includes(hater.user.id), 'beni engelleyen ve şikâyet eden görünmez');
    assert.ok(!text.includes(snoop.user.id), 'VIP olmadan ziyaretçi görünmez');
    assert.ok(!text.includes('gizli not') && !text.includes('YETKILI-NOTU'), 'başkasının notu ve yetkili notu gelmez');
    assert.ok(!text.includes('device_key_hash') && !text.includes('password_hash'));
  });

  test('24 saatte bir; süresi dolunca yeniden; hesapla birlikte silinir', async () => {
    const a = await signUp('Sık İsteyen');
    const first = await exportOf(a.session);
    assert.equal(first.previousExport, null);
    const [st, j] = await call('GET', '/api/me/export', null, a.session);
    assert.equal(st, 429);
    assert.equal(j.code, 'export_wait');
    assert.ok(Date.parse(j.nextAt) > Date.now() + 23 * 3600_000);
    await q("UPDATE data_exports SET last_at = now() - interval '25 hours' WHERE user_id = $1", [a.user.id]);
    const again = await exportOf(a.session);
    assert.ok(again.previousExport, 'önceki kopyanın tarihi');
    await ok(call('DELETE', '/api/me', null, a.session), 'sil');
    assert.equal((await q('SELECT count(*)::int AS n FROM data_exports WHERE user_id = $1', [a.user.id])).rows[0].n, 0);
  });

  test('hesaba bağlı her tablo ya kopyada ya da neden olmadığı yazılı', async () => {
    const r = await q("SELECT DISTINCT conrelid::regclass::text AS t FROM pg_constraint WHERE contype = 'f' AND confrelid = 'users'::regclass ORDER BY 1");
    const missing = r.rows.map((x) => x.t).filter((t) => !EXPORTED.includes(t) && !Object.hasOwn(NOT_EXPORTED, t));
    assert.deepEqual(missing, [], 'my-data.mjs bu tabloları okumalı (ya da my-data-tables.mjs NOT_EXPORTED nedenini yazmalı)');
    assert.deepEqual(EXPORTED.filter((t) => Object.hasOwn(NOT_EXPORTED, t)), [], 'bir tablo iki listede birden olamaz');
  });
});
