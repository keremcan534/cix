// The owners' rules of 18 Nov (streamer-rule.mjs, families.mjs, docs/YAYINCI_KURALLARI.md): who is a streamer, who may
// take money out, a streamer's wait after leaving a family, and the Aile ve Dost shelf.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ AGENCY_JOBS: '0' });
const { call, signUp } = h;
const ref = () => `t${rnd(8)}`;
const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;
const ok = async (p, msg = '') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${msg} ${j?.error ?? ''}`);
  return j;
};
const refused = async (p, code, match) => {
  const [st, j] = await p;
  assert.equal(st, code, JSON.stringify(j).slice(0, 200));
  if (match) assert.match(j.error, match);
  return j;
};
async function person(name, gender) {
  const s = await signUp(name);
  if (gender) await q('UPDATE users SET gender = $2 WHERE id = $1', [s.user.id, gender]);
  return s;
}
const cashOut = (s) => ok(call('GET', '/api/wallet/cash-out', null, s.session));
/** A family led by `owner` with `members` people, the leader among them. */
async function familyOf(owner, members) {
  await h.credit(owner.user.id, 4999, { channel: 'google' });
  // A visible name: rnd(3) is digits only (harness.mjs); 12 hex characters can spell a handle the contact filter refuses.
  const f = await ok(call('POST', '/api/families', { name: `Aile ${rnd(3)}`, ref: ref(), price: 4999 }, owner.session));
  await q("UPDATE families SET join_mode = 'open' WHERE id = $1", [f.family.id]);
  for (let i = 1; i < members; i++) {
    const m = await signUp(`Üye ${rnd(3)}`);
    await q("INSERT INTO family_members (user_id, family_id, role) VALUES ($1, $2, 'member')", [m.user.id, f.family.id]);
  }
  return f.family;
}

let admin, bank;
describe('para çekme kuralı', () => {
  test('hazırlık', async () => {
    admin = await person('Merkez');
    bank = await person('Bayi', 'Erkek');
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
    await q("UPDATE users SET role = 'coins_bank' WHERE id = $1", [bank.user.id]);
  });

  test('erkek hesap para çekemez, elmas bozduramaz; hiçbir şey hareket etmez', async () => {
    const man = await person('Erkek', 'Erkek');
    const s = await cashOut(man);
    assert.deepEqual([s.allowed, s.code], [false, 'men_no_cashout']);
    const body = { diamonds: 50_000, method: 'other', details: { holder: 'Ali Veli', account: 'hesap 12345' }, ref: ref() };
    const a = await refused(call('POST', '/api/wallet/withdraw', body, man.session), 403, /Erkek hesaplar/);
    assert.equal(a.code, 'men_no_cashout');
    await refused(call('POST', '/api/jeton/sell-diamonds', { bank: bank.user.id, diamonds: 1000, ref: ref() }, man.session), 403, /Erkek hesaplar/);
    assert.equal((await q('SELECT count(*)::int AS n FROM withdrawals WHERE user_id = $1', [man.user.id]))[0].n, 0);
    // The list says so too, for the app's screens.
    assert.equal((await ok(call('GET', '/api/wallet/withdrawals', null, man.session))).cashOut.allowed, false);
  });

  test('cinsiyetini seçmeyen önce seçer; kadın hesap çekebilir', async () => {
    const none = await person('Seçmemiş');
    assert.equal((await cashOut(none)).code, 'gender_needed');
    assert.equal((await cashOut(await person('Kadın', 'Kadın'))).allowed, true);
  });

  test('ajans sahibi erkek çekebilir; onaysız ajans saymaz', async () => {
    const owner = await person('Ajans Sahibi', 'Erkek');
    const a = (await ok(call('POST', '/api/admin/agency/create', { name: `Ajans ${rnd(3)}`, owner: owner.user.id }, admin.session))).agency;
    assert.equal((await cashOut(owner)).allowed, true);
    await q("UPDATE agencies SET status = 'suspended' WHERE id = $1", [a.id]);
    assert.equal((await cashOut(owner)).allowed, false);
  });

  test('aile sahibi erkek ancak en az 10 üyeyle çekebilir', async () => {
    const small = await person('Küçük Aile', 'Erkek');
    await familyOf(small, 9);
    assert.equal((await cashOut(small)).allowed, false, '9 üye');
    const big = await person('Büyük Aile', 'Erkek');
    await familyOf(big, 10);
    assert.equal((await cashOut(big)).allowed, true, '10 üye');
  });

  test('Jeton Noktası satışı açık kalır', async () => {
    const buyer = await person('Alıcı', 'Erkek');
    await h.credit(bank.user.id, 5000, { channel: 'google' });
    await ok(call('POST', '/api/jeton/transfer', { to: buyer.user.id, coins: 1000, paymentRef: 'HAVALE-1', ref: ref() }, bank.session));
  });
});

describe('yayıncı kimdir', () => {
  const pair = async (me, other) => (await ok(call('GET', `/api/one-on-one?with=${other.user.id}`, null, me.session))).pair;

  test('3 gün ajans seçmeyen kadın yönetimde kalır ve yayıncı sayılır; yeni hesap sayılmaz', async () => {
    const man = await person('Sohbetçi', 'Erkek');
    const fresh = await person('Yeni Kadın', 'Kadın');
    assert.equal((await pair(man, fresh)).streamer, false);
    const held = await person('Eski Kadın', 'Kadın');
    await q("UPDATE users SET created_at = now() - interval '4 days' WHERE id = $1", [held.user.id]);
    assert.equal((await pair(man, held)).streamer, true);
  });

  test('erkek hesap ajans ya da büyük aile sahibi değilse yayıncı olmaz', async () => {
    const man = await person('Sıradan', 'Erkek');
    const older = await person('Eski Erkek', 'Erkek');
    await q("UPDATE users SET created_at = now() - interval '40 days' WHERE id = $1", [older.user.id]);
    assert.equal((await pair(man, older)).streamer, false);
    const owner = await person('Sahip', 'Erkek');
    await ok(call('POST', '/api/admin/agency/create', { name: `Ajans ${rnd(3)}`, owner: owner.user.id }, admin.session));
    assert.equal((await pair(man, owner)).streamer, true);
  });
});

describe('aileden ayrılan yayıncı 90 gün başka aileye giremez', () => {
  /** A woman the centre holds: a streamer. */
  async function streamer(name) {
    const s = await person(name, 'Kadın');
    await q("UPDATE users SET created_at = now() - interval '10 days' WHERE id = $1", [s.user.id]);
    return s;
  }

  test('kendi isteğiyle ayrılınca başka aile olmaz; ayrıldığı aileye dönebilir; süre bitince serbest', async () => {
    const [lead1, lead2] = [await person('Lider 1', 'Erkek'), await person('Lider 2', 'Erkek')];
    const [f1, f2] = [await familyOf(lead1, 2), await familyOf(lead2, 2)];
    const s = await streamer('Yayıncı');
    await ok(call('POST', '/api/family/join', { id: f1.id }, s.session));
    assert.equal((await ok(call('GET', '/api/family', null, s.session))).leaveDays, 90);
    const left = await ok(call('POST', '/api/family/leave', {}, s.session));
    assert.ok(new Date(left.rejoinAt) > new Date(Date.now() + 89 * 86400_000));
    const r = await refused(call('POST', '/api/family/join', { id: f2.id }, s.session), 409, /başka bir aileye katılamazsın/);
    assert.equal(r.code, 'family_rejoin_wait');
    await h.credit(s.user.id, 4999, { channel: 'google' });
    await refused(call('POST', '/api/families', { name: `Yeni ${rnd(3)}`, ref: ref(), price: 4999 }, s.session), 409, /katılamazsın/);
    await refused(call('POST', '/api/family/invite', { userId: s.user.id }, lead2.session), 409, /katılamaz/);
    await ok(call('POST', '/api/family/join', { id: f1.id }, s.session), 'ayrıldığı aile');
    await ok(call('POST', '/api/family/leave', {}, s.session));
    await q("UPDATE family_cooldowns SET until = now() - interval '1 minute' WHERE user_id = $1", [s.user.id]);
    await ok(call('POST', '/api/family/join', { id: f2.id }, s.session), 'süre bitti');
  });

  test('yayıncı olmayan beklemez; aileden çıkarılan yayıncı beklemez', async () => {
    const [lead1, lead2] = [await person('Lider 3', 'Erkek'), await person('Lider 4', 'Erkek')];
    const [f1, f2] = [await familyOf(lead1, 2), await familyOf(lead2, 2)];
    const plain = await person('Üye', 'Erkek');
    await ok(call('POST', '/api/family/join', { id: f1.id }, plain.session));
    assert.equal((await ok(call('POST', '/api/family/leave', {}, plain.session))).rejoinAt, null);
    await ok(call('POST', '/api/family/join', { id: f2.id }, plain.session));
    const s = await streamer('Çıkarılan');
    await ok(call('POST', '/api/family/join', { id: f1.id }, s.session));
    await ok(call('POST', '/api/family/kick', { userId: s.user.id }, lead1.session));
    await ok(call('POST', '/api/family/join', { id: f2.id }, s.session));
  });
});

describe('Aile ve Dost rafı', () => {
  const BONDS = ['bag-kardes', 'bag-baci', 'bag-agabey', 'bag-abla', 'bag-yenge', 'bag-enishte', 'bag-kanka', 'bag-cift'];

  test('yeni uygulama rafı görür; eski uygulama bağ hediyesini görmez, Koruma Kartı İkili rafında kalır', async () => {
    const fresh = (await ok(call('GET', '/api/catalog?gifts=2&family=1'))).gifts;
    // Kalbim Seninle (bag-cift) is on Çift (owners, 22 Nov 2026), the other bond gifts and Koruma Kartı on Aile ve Dost.
    for (const id of [...BONDS, 'koruma']) assert.equal(fresh.find((g) => g.id === id)?.cat, id === 'bag-cift' ? 'couple' : 'family', id);
    const old = (await ok(call('GET', '/api/catalog?gifts=2'))).gifts;
    assert.equal(old.some((g) => BONDS.includes(g.id)), false);
    assert.equal(old.find((g) => g.id === 'koruma').cat, 'couple');
  });

  test('fiyatlar Bağlar kuralıyla aynı', async () => {
    const { KINDS } = (await ok(call('GET', '/api/bonds/info'))).kinds ? { KINDS: (await ok(call('GET', '/api/bonds/info'))).kinds } : {};
    const fresh = (await ok(call('GET', '/api/catalog?gifts=2&family=1'))).gifts;
    for (const k of KINDS) {
      const g = fresh.find((x) => x.id === `bag-${k.id}`);
      assert.deepEqual([g.name, g.price], [k.gift, k.price], k.id);
    }
  });

  test('bağ hediyesi bağı olmayana sıradan hediye olarak gitmez (bond_needed), bağ isteği olarak gider', async () => {
    const [a, b] = [await person('Gönderen', 'Erkek'), await person('Alan', 'Kadın')];
    await h.credit(a.user.id, 5000, { channel: 'google' });
    assert.equal((await refused(call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'bag-kardes', count: 1, ref: ref() }, a.session), 409)).code, 'bond_needed');
    const r = await ok(call('POST', '/api/bonds/request', { to: b.user.id, kind: 'kardes', ref: ref(), room: 'oda-00000000-0000-4000-8000-000000000000' }, a.session));
    assert.equal(r.bond.status, 'pending');
    assert.equal(r.user.coins, 4000);
  });

  test('panel: bağ hediyesinin fiyatı değişir; yeni uygulama gördüğünü öder, eski uygulama güncelleme ister', async () => {
    const [a, b, c] = [await person('Bağ Kuran', 'Erkek'), await person('Bağ Alan', 'Kadın'), await person('Üçüncü', 'Kadın')];
    await h.credit(a.user.id, 3000, { channel: 'google' });
    const coins = async () => (await ok(call('GET', '/api/me', null, a.session))).user.coins;
    const ask = (body, to = b) => call('POST', '/api/bonds/request', { to: to.user.id, kind: 'kanka', ...body }, a.session);
    assert.equal((await ok(call('POST', '/api/admin/gifts/update', { id: 'bag-kanka', price: 750 }, admin.session))).gift.price, 750);
    // The newer app's catalog and the bond kinds say the panel's price; an older app's catalog has no bond gifts anyway.
    assert.equal((await ok(call('GET', '/api/catalog?gifts=2&family=1'))).gifts.find((g) => g.id === 'bag-kanka').price, 750);
    assert.equal((await ok(call('GET', '/api/bonds/info'))).kinds.find((k) => k.id === 'kanka').price, 750);
    // An older app sends no price and shows 500: asked to update, nothing taken.
    const old = await refused(ask({ ref: ref() }), 409, /güncelle/);
    assert.equal(old.code, 'update_required');
    // A newer app that still showed 500: told the new price, nothing taken.
    const moved = await refused(ask({ ref: ref(), price: 500 }), 409, /750/);
    assert.deepEqual([moved.code, moved.price], ['price_changed', 750]);
    await refused(ask({ ref: ref(), price: '750' }), 400, /fiyat/);
    await refused(ask({ ref: ref(), price: -1 }), 400, /fiyat/);
    assert.equal(await coins(), 3000);
    // At the price shown: 750 held; a retry of it after the price moved again is its replay, not a second charge.
    const sent = ref();
    const r = await ok(ask({ ref: sent, price: 750 }));
    assert.deepEqual([r.bond.price, r.user.coins], [750, 2250]);
    await ok(call('POST', '/api/admin/gifts/update', { id: 'bag-kanka', price: 900 }, admin.session));
    const again = await ok(ask({ ref: sent, price: 750 }));
    assert.deepEqual([again.replay, again.user.coins], [true, 2250]);
    // Refused: the 750 it held comes back, whatever the price is now.
    assert.equal((await ok(call('POST', '/api/bonds/respond', { id: r.bond.id, accept: false }, b.session))).bond.status, 'refused');
    assert.equal(await coins(), 3000);
    // Back to the app's price: an older app sends again.
    await ok(call('POST', '/api/admin/gifts/reset', { id: 'bag-kanka', fields: ['price'] }, admin.session));
    const back = await ok(ask({ ref: ref() }, c));
    assert.deepEqual([back.bond.price, back.user.coins], [500, 2500]);
    const audits = await h.sql.query("SELECT count(*)::int AS n FROM audit_events WHERE action LIKE 'gift.%' AND detail->>'gift' = 'bag-kanka'");
    assert.ok(audits.rows[0].n >= 3, 'fiyat değişiklikleri kayıtlı');
  });

  test('panel: bağ hediyesinin rafı değişmez, adı değişir', async () => {
    await refused(call('POST', '/api/admin/gifts/update', { id: 'bag-kanka', cat: 'hot' }, admin.session), 400, /rafında/);
    const g = await ok(call('POST', '/api/admin/gifts/update', { id: 'bag-kanka', name: 'Kanka Madalyası' }, admin.session));
    assert.equal(g.gift.name, 'Kanka Madalyası');
  });

  test('Bağ Yüzüğü Çift rafında: yeni uygulama görür, eski görmez; panelde fiyatı ve adı değişir, rafı Aile ve Dost ya da Çift; profilden ve raftan aynı istek', async () => {
    const fresh = (await ok(call('GET', '/api/catalog?gifts=2&family=1'))).gifts;
    assert.deepEqual(['name', 'price', 'cat'].map((k) => fresh.find((g) => g.id === 'bag-cift')?.[k]), ['Bağ Yüzüğü', 5000, 'couple']);
    for (const q of ['/api/catalog?gifts=2', '/api/catalog']) assert.equal((await ok(call('GET', q))).gifts.some((g) => g.id === 'bag-cift'), false, q);
    // Panel: it is listed with the other bond gifts; a bond gift goes on Aile ve Dost or Çift, no other shelf.
    await refused(call('POST', '/api/admin/gifts/update', { id: 'bag-cift', cat: 'hot' }, admin.session), 400, /Aile ve Dost ya da Çift rafında/);
    assert.ok((await ok(call('GET', '/api/admin/gifts?builtin=1', null, admin.session))).gifts.some((g) => g.id === 'bag-cift' && g.cat === 'couple'));
    await ok(call('POST', '/api/admin/gifts/update', { id: 'bag-cift', name: 'Sevgili Yüzüğü', price: 6000 }, admin.session));
    try {
      const info = (await ok(call('GET', '/api/bonds/info'))).kinds.find((k) => k.id === 'cift');
      assert.deepEqual([info.gift, info.price], ['Sevgili Yüzüğü', 6000]);
      // The shelf and the profile's "Bağ kur" are the same request: 6000 held, at the price the phone showed.
      const [a, b] = [await person('Yüzük Veren', 'Erkek'), await person('Yüzük Alan', 'Kadın')];
      await h.credit(a.user.id, 7000, { channel: 'google' });
      assert.equal((await refused(call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'bag-cift', count: 1, price: 6000, ref: ref() }, a.session), 409)).code, 'bond_needed');
      const r = await ok(call('POST', '/api/bonds/request', { to: b.user.id, kind: 'cift', price: 6000, ref: ref(), room: 'oda-00000000-0000-4000-8000-000000000000' }, a.session));
      assert.deepEqual([r.bond.status, r.bond.price, r.user.coins], ['pending', 6000, 1000]);
    } finally {
      await ok(call('POST', '/api/admin/gifts/reset', { id: 'bag-cift', fields: ['name', 'price'] }, admin.session));
    }
  });
});

describe('roketin beş videosu', () => {
  test('yalnız yönetici; seviye 1–5; kaldırma çalışır; panele beş satır gelir', async () => {
    const user = await person('Üye', 'Erkek');
    await refused(call('POST', '/api/admin/rocket/video', { level: 1, video: null }, user.session), 403);
    await refused(call('POST', '/api/admin/rocket/video', { level: 6, video: null }, admin.session), 400);
    await refused(call('POST', '/api/admin/rocket/video', { level: 1 }, admin.session), 400);
    const r = await ok(call('POST', '/api/admin/rocket/video', { level: 2, video: null }, admin.session));
    assert.deepEqual(r.videos.map((v) => v.level), [1, 2, 3, 4, 5]);
    assert.equal((await ok(call('GET', '/api/admin/rocket', null, admin.session))).videos.length, 5);
    assert.equal((await q("SELECT count(*)::int AS n FROM audit_events WHERE action = 'rocket.video'"))[0].n, 1);
  });
});
