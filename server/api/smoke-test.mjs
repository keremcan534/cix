// End-to-end check of the live API (docs/SUNUCU.md): node server/api/smoke-test.mjs [base-url]
// Creates two throwaway test accounts and moves test coins between them.
const B = process.argv[2] ?? 'https://130-61-230-94.sslip.io';
const rnd = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const call = async (m, p, body, s) => { const r = await fetch(B + p, { method: m, headers: { 'content-type': 'application/json', ...(s ? { authorization: `Bearer ${s}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return [r.status, await r.json()]; };
const ok = (name, cond, extra = '') => console.log(`${cond ? 'OK  ' : 'FAIL'} ${name} ${extra}`);
const [, a] = await call('POST', '/api/auth/dev', { deviceKey: rnd(24), name: 'Test A' });
const kb = rnd(24); const [, b] = await call('POST', '/api/auth/dev', { deviceKey: kb, name: 'Test B' });
ok('kayıt', a.user?.coins === 0 && b.user?.id, a.user?.id);
const [, b2] = await call('POST', '/api/auth/dev', { deviceKey: kb }); ok('aynı cihazla tekrar giriş aynı kullanıcı', b2.user.id === b.user.id);
let [st] = await call('GET', '/api/me'); ok('girişsiz /me reddedilir', st === 401, st);
const r1 = rnd(8); let [, t] = await call('POST', '/api/wallet/test-topup', { amount: 5000, ref: r1 }, a.session); ok('test yüklemesi', t.user.coins === 5000);
[, t] = await call('POST', '/api/wallet/test-topup', { amount: 5000, ref: r1 }, a.session); ok('aynı istek ikinci kez işlenmez', t.replay && t.user.coins === 5000);
[st] = await call('POST', '/api/wallet/test-topup', { amount: 777, ref: rnd(8) }, a.session); ok('paket dışı miktar reddedilir', st === 400);
const g = rnd(8);
const both = await Promise.all([1, 2].map(() => call('POST', '/api/wallet/gift', { to: b.user.id, amount: 1200, ref: g }, a.session)));
const [, me] = await call('GET', '/api/me', null, a.session); const [, meB] = await call('GET', '/api/me', null, b.session);
ok('aynı hediye aynı anda iki kez → bir kez', me.user.coins === 3800 && meB.user.diamonds === 1200, `A=${me.user.coins} B elmas=${meB.user.diamonds} ${both.map((x) => x[0])}`);
[st, t] = await call('POST', '/api/wallet/gift', { to: b.user.id, amount: 999999, ref: rnd(8) }, a.session); ok('yetersiz bakiye reddedilir', st === 409, t.error);
[st] = await call('POST', '/api/wallet/gift', { to: a.user.id, amount: 1, ref: rnd(8) }, a.session); ok('kendine hediye reddedilir', st === 400);
const [, led] = await call('GET', '/api/ledger', null, a.session); ok('işlem kaydı bakiyeyi açıklıyor', led.rows.length === 2 && led.rows[0].balance === 3800, led.rows.map((r) => `${r.reason}:${r.amount}`).join(', '));
[st] = await call('GET', '/token?room=oda-1'); ok('girişsiz ses token\'ı reddedilir', st === 401);
[st, t] = await call('GET', '/token?room=oda-1', null, a.session); const p = JSON.parse(Buffer.from(t.token.split('.')[1], 'base64url')); ok('girişli ses token\'ı', st === 200 && p.sub === a.user.id && p.name === 'Test A');
