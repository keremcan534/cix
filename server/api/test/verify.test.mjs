// Kimlik ve yüz doğrulaması (verify.mjs) against a real Postgres, a stand-in Didit and a stand-in bucket: who may open
// which check, the consent's version, the provider's session (our mark for the person, never their id; the profile
// photo as the reference portrait), the signed webhook and the decision read back from the provider, the rules that
// send a check to staff (sex, age, the same document twice), the badge on profiles and its drop with a new photo,
// money out with Canlı ayarlar requiring the ID check (Para Çek, the account holder against the document), staff
// decisions (audited) and the manual check, a withdrawn consent, the budget, the daily tries, the provider down, two
// taps at once, the data copy, the sweep that deletes the provider's copy and account deletion.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';

import { CONSENT, canonicalJson, holderMatches, idReasons, nameWords, readDecision, signatureOk, stateOf } from '../verify-rules.mjs';
import { rnd, startApi } from './harness.mjs';

const SECRET = 'whsec-test-secret';
const CDN = 'https://cdn.example.com';
const KYC = '11111111-1111-4111-8111-111111111111';
const FACE = '22222222-2222-4222-8222-222222222222';

// --- The stand-in Didit: sessions made, decisions set by the test, deletions seen ----------------------------
const didit = { sessions: new Map(), decisions: new Map(), deleted: [], created: [], down: false, keys: [] };
const DIDIT_PORT = 33000 + (process.pid % 900);
const provider = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
  didit.keys.push(req.headers['x-api-key']);
  const send = (code, j) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(j));
  if (didit.down) return send(500, { detail: 'down' });
  const u = new URL(req.url, 'http://x');
  if (req.method === 'POST' && u.pathname === '/v3/session/') {
    const id = crypto.randomUUID();
    didit.sessions.set(id, body);
    didit.created.push({ id, body, idem: req.headers['idempotency-key'] });
    return send(201, { session_id: id, url: `https://verify.didit.me/session/${id}`, status: 'Not Started', vendor_data: body.vendor_data });
  }
  let m = /^\/v3\/session\/([^/]+)\/decision\/$/.exec(u.pathname);
  if (req.method === 'GET' && m) return send(200, didit.decisions.get(m[1]) ?? { session_id: m[1], status: 'In Progress' });
  m = /^\/v3\/session\/([^/]+)\/delete\/$/.exec(u.pathname);
  if (req.method === 'DELETE' && m) {
    if (!didit.sessions.has(m[1])) return send(404, { detail: 'not found' });
    didit.sessions.delete(m[1]);
    didit.deleted.push(m[1]);
    return send(200, { face_retention_outcome: 'deleted' });
  }
  send(404, { detail: 'no route' });
});
provider.listen(DIDIT_PORT, '127.0.0.1');
after(() => provider.close());

// --- The stand-in bucket (profile photos) ------------------------------------------------------------------
const stored = new Map();
const S3_PORT = 34000 + (process.pid % 900);
const bucket = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.searchParams.get('X-Amz-Signature')) return res.writeHead(403).end();
  if (req.method === 'GET' && u.pathname === '/media' && u.searchParams.get('list-type') === '2') {
    const keys = [...stored.keys()].filter((k) => k.startsWith(u.searchParams.get('prefix') ?? ''));
    return res.writeHead(200).end(`<?xml version="1.0"?><ListBucketResult>${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}<IsTruncated>false</IsTruncated></ListBucketResult>`);
  }
  const key = decodeURIComponent(u.pathname.replace(/^\/media\//, ''));
  if (req.method === 'DELETE') return stored.delete(key), res.writeHead(204).end();
  const f = stored.get(key);
  if (!f) return res.writeHead(404).end();
  const head = { 'content-length': String(f.length), 'content-type': 'image/jpeg' };
  if (req.method === 'HEAD') return res.writeHead(200, head).end();
  if (req.method === 'GET') return res.writeHead(200, head).end(f);
  res.writeHead(400).end();
});
bucket.listen(S3_PORT, '127.0.0.1');
after(() => bucket.close());

const h = startApi({
  DIDIT_API_URL: `http://127.0.0.1:${DIDIT_PORT}`,
  DIDIT_API_KEY: 'didit-test-key',
  DIDIT_WEBHOOK_SECRET: SECRET,
  DIDIT_KYC_WORKFLOW: KYC,
  DIDIT_FACE_WORKFLOW: FACE,
  VERIFY_SWEEP_MS: '150',
  S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`,
  S3_BUCKET: 'media',
  S3_KEY: 'testkey',
  S3_SECRET: 'testsecret',
  S3_PUBLIC_URL: CDN,
  AGENCY_JOBS: '0',
});
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${st} ${j.error}`);
  return j;
};
const refused = async (p, status, code, what) => {
  const [st, j] = await p;
  assert.equal(st, status, `${what}: ${st} ${j.error}`);
  if (code) assert.equal(j.code, code, `${what}: ${j.error}`);
  return j;
};
const wait = async (fn, what, ms = 4000) => {
  for (let t = 0; t < ms; t += 50) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail(`beklenmedi: ${what}`);
};

async function person(name, gender = 'Kadın') {
  const s = await signUp(name);
  if (gender) await ok(call('PATCH', '/api/me', { gender, birthDate: '1995-04-02' }, s.session), 'profil');
  return s;
}
let admin;
async function staff() {
  if (admin) return admin;
  admin = await signUp('Doğrulama Yöneticisi');
  await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
  return admin;
}
async function setLive(changes) {
  const a = await staff();
  const view = await ok(call('GET', '/api/admin/live-settings', null, a.session), 'ayarlar');
  await ok(call('POST', '/api/admin/live-settings', { changes, reason: 'Doğrulama testi', baseV: view.v, confirm: true }, a.session), 'ayar');
}
const start = (s, kind, consent = CONSENT[kind].version) => call('POST', '/api/verify/start', { kind, consent }, s.session);
/** A webhook as Didit sends it: signed over the raw body (X-Signature) or, with v2, over the sorted JSON. */
async function webhook(sessionId, status, { v2 = false, secret = SECRET, at = Math.floor(Date.now() / 1000) } = {}) {
  const raw = JSON.stringify({ event_id: crypto.randomUUID(), webhook_type: 'status.updated', session_id: sessionId, status, timestamp: at, vendor_data: 'x' });
  const mac = crypto.createHmac('sha256', secret).update(v2 ? canonicalJson(JSON.parse(raw)) : raw).digest('hex');
  return call('POST', '/api/verify/webhook', raw, null, { 'x-timestamp': String(at), [v2 ? 'x-signature-v2' : 'x-signature']: mac });
}
const idDecision = (sid, { name = 'AYŞE YILMAZ', gender = 'F', dob = '1995-04-02', number = rnd(9), country = 'TUR', status = 'Approved', extra = {} } = {}) => ({
  session_id: sid,
  status,
  id_verifications: [{ status, full_name: name, gender, date_of_birth: dob, document_number: number, issuing_state: country, document_type: 'Identity Card' }],
  liveness_checks: [{ status: 'Approved', score: 98 }],
  face_matches: [{ status: 'Approved', score: 91 }],
  ...extra,
});
/** A woman whose ID check went through: { s, sid, number }. */
async function verifiedWoman(name, opts = {}) {
  const s = await person(name);
  const j = await ok(start(s, 'id'), 'başlat');
  const sid = j.url.split('/').pop();
  const number = opts.number ?? rnd(9);
  didit.decisions.set(sid, idDecision(sid, { ...opts, number }));
  await ok(webhook(sid, 'Approved'), 'webhook');
  return { s, sid, number };
}
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(400)]);
async function withPhoto(s, bytes = JPEG) {
  const key = `avatar/${s.user.id}/${rnd(6)}.jpg`;
  stored.set(key, bytes);
  await q('UPDATE users SET avatar_url = $2 WHERE id = $1', [s.user.id, `${CDN}/${key}`]);
  return `${CDN}/${key}`;
}

describe('Doğrulama kuralları', () => {
  test('sağlayıcının durumu, kimlikteki bilgiler, incelemeye düşme sebepleri', () => {
    assert.deepEqual(['Approved', 'Declined', 'In Review', 'Expired', 'Abandoned', 'Not Started', 'In Progress', 'Resubmitted', null].map(stateOf), ['approved', 'declined', 'review', 'expired', 'expired', 'pending', 'pending', 'pending', 'pending']);
    const r = readDecision(idDecision('s', { name: 'ŞEYMA NUR ÖZTÜRK', gender: 'F', dob: '2010-01-01', number: '12 345-678' }), new Date('2026-11-26'));
    assert.deepEqual([r.name, r.sex, r.adult, r.country, r.docNo, r.duplicateFace], ['ŞEYMA NUR ÖZTÜRK', 'F', false, 'TUR', '12345678', false]);
    // An older single-object shape, and nothing at all, never throw.
    assert.equal(readDecision({ status: 'Approved', id_verification: { first_name: 'Ali', last_name: 'Kaya', gender: 'M', age: 30 } }).name, 'Ali Kaya');
    assert.deepEqual(readDecision(null), { status: null, name: null, sex: null, adult: null, country: null, docNo: null, duplicateFace: false });
    assert.equal(readDecision({ warnings: [{ risk: 'POSSIBLE_MATCH_FOUND' }] }).duplicateFace, true);
    assert.equal(readDecision({ linked_records: { same_face: [{ session_id: 'x' }] } }).duplicateFace, true);
    assert.deepEqual(idReasons({ adult: true, sex: 'M', name: 'X Y' }, 'Kadın', false), ['sex_mismatch']);
    assert.deepEqual(idReasons({ adult: false, sex: null, name: null }, 'Kadın', true), ['under_18', 'no_name', 'no_sex', 'duplicate_document']);
    // An agency owner who never said a gender: the document's sex isn't compared.
    assert.deepEqual(idReasons({ adult: true, sex: 'M', name: 'X Y' }, null, false), []);
  });

  test('hesap sahibinin adı kimlikteki adla', () => {
    assert.deepEqual(nameWords('ŞEYMA  Nur-Öztürk'), ['seyma', 'nur', 'ozturk']);
    assert.deepEqual(nameWords('IRMAK İNCE'), ['irmak', 'ince']);
    assert.equal(holderMatches('Şeyma Öztürk', 'SEYMA NUR OZTURK'), true);
    assert.equal(holderMatches('seyma nur ozturk', 'ŞEYMA NUR ÖZTÜRK'), true);
    assert.equal(holderMatches('Ahmet Öztürk', 'ŞEYMA NUR ÖZTÜRK'), false);
    assert.equal(holderMatches('Şeyma', 'ŞEYMA NUR ÖZTÜRK'), false);
    assert.equal(holderMatches('Şeyma Öztürk', null), null);
  });

  test('webhook imzası: ham gövde ya da sıralı JSON, 5 dakika, sabit süreli karşılaştırma', () => {
    const now = Date.now();
    const at = String(Math.floor(now / 1000));
    const raw = '{"b":1,"a":"ğ"}';
    const mac = (s, k = SECRET) => crypto.createHmac('sha256', k).update(s).digest('hex');
    assert.equal(signatureOk(raw, { 'x-timestamp': at, 'x-signature': mac(raw) }, SECRET, now), true);
    assert.equal(signatureOk(raw, { 'x-timestamp': at, 'x-signature-v2': mac('{"a":"ğ","b":1}') }, SECRET, now), true);
    assert.equal(signatureOk(raw, { 'x-timestamp': at, 'x-signature': mac(raw, 'other') }, SECRET, now), false);
    assert.equal(signatureOk(raw, { 'x-timestamp': String(Math.floor(now / 1000) - 400), 'x-signature': mac(raw) }, SECRET, now), false);
    assert.equal(signatureOk(raw, { 'x-timestamp': at }, SECRET, now), false);
    assert.equal(signatureOk(raw, { 'x-timestamp': at, 'x-signature': mac(raw) }, '', now), false);
  });
});

describe('Kimlik doğrulaması', () => {
  test('kim açabilir; rızanın sürümü; sağlayıcıya giden oturum', async () => {
    const man = await person('Doğrulama Erkek', 'Erkek');
    await refused(start(man, 'id'), 403, 'men_no_cashout', 'erkek');
    const none = await person('Doğrulama Cinsiyetsiz', null);
    await refused(start(none, 'id'), 403, 'gender_needed', 'cinsiyet yok');
    const w = await person('Doğrulama Kadın');
    const changed = await refused(start(w, 'id', 'id-eski'), 409, 'consent_changed', 'eski metin');
    assert.equal(changed.consent.id.version, CONSENT.id.version);
    await refused(call('POST', '/api/verify/start', { kind: 'yuz', consent: 'x' }, w.session), 400, null, 'tür');

    const view = await ok(call('GET', '/api/verify', null, w.session), 'durum');
    assert.deepEqual([view.on, view.id, view.face, view.verified, view.idVerified, view.payoutNeedsId], [{ id: true, face: true }, null, null, false, false, false]);
    assert.equal(view.consent.id.lines.length > 3, true);

    const before = didit.created.length;
    const j = await ok(start(w, 'id'), 'başlat');
    assert.match(j.url, /^https:\/\/verify\.didit\.me\/session\//);
    assert.equal(j.check.status, 'pending');
    const sent = didit.created.at(-1);
    assert.equal(didit.created.length, before + 1);
    assert.equal(sent.body.workflow_id, KYC);
    assert.equal(sent.body.language, 'tr');
    assert.equal(sent.body.callback, 'similarclub://kimlik-dogrulama');
    assert.equal(sent.body.portrait_image, undefined);
    // The provider gets a stable mark, never our id for the person.
    assert.match(sent.body.vendor_data, /^u-[0-9a-f]{32}$/);
    assert.ok(!sent.body.vendor_data.includes(w.user.id));
    assert.match(sent.idem, /^similar-check-\d+$/);
    assert.ok(didit.keys.every((k) => k === 'didit-test-key'));
    // A second tap: the same page, no new session.
    const again = await ok(start(w, 'id'), 'tekrar');
    assert.equal(again.url, j.url);
    assert.equal(didit.created.length, before + 1);
    const row = (await q('SELECT consent_version, consent_ip, status FROM identity_checks WHERE user_id = $1', [w.user.id])).rows;
    assert.equal(row.length, 1);
    assert.equal(row[0].consent_version, CONSENT.id.version);
    assert.ok(row[0].consent_ip);
  });

  test('imzalı webhook: karar sağlayıcıdan okunur; imzasız ya da eski olan reddedilir', async () => {
    const w = await person('Webhook Kadın');
    const j = await ok(start(w, 'id'), 'başlat');
    const sid = j.url.split('/').pop();
    didit.decisions.set(sid, idDecision(sid, { name: 'AYŞE YILMAZ' }));
    await refused(webhook(sid, 'Approved', { secret: 'yanlis' }), 401, null, 'yanlış imza');
    await refused(webhook(sid, 'Approved', { at: Math.floor(Date.now() / 1000) - 600 }), 401, null, 'eski');
    assert.equal((await q('SELECT status FROM identity_checks WHERE session_id = $1', [sid])).rows[0].status, 'pending');
    // A webhook for a session we never opened is answered and ignored.
    await ok(webhook(crypto.randomUUID(), 'Approved'), 'başkasının');
    await ok(webhook(sid, 'Approved', { v2: true }), 'imzalı (v2)');
    const r = (await q('SELECT * FROM identity_checks WHERE session_id = $1', [sid])).rows[0];
    assert.deepEqual([r.status, r.doc_name, r.doc_sex, r.doc_adult, r.doc_country, r.reasons], ['approved', 'AYŞE YILMAZ', 'F', true, 'TUR', []]);
    assert.match(r.doc_hash, /^[0-9a-f]{64}$/);
    assert.ok(r.decided_at);
    assert.equal(r.session_url, null);
    const view = await ok(call('GET', '/api/verify', null, w.session), 'durum');
    assert.deepEqual([view.idVerified, view.id.status], [true, 'approved']);
    await refused(start(w, 'id'), 409, 'already', 'zaten');
  });

  test('uygulama tarayıcıdan dönünce sağlayıcıya sorar', async () => {
    const w = await person('Dönen Kadın');
    const j = await ok(start(w, 'id'), 'başlat');
    const sid = j.url.split('/').pop();
    let r = await ok(call('POST', '/api/verify/refresh', { kind: 'id' }, w.session), 'yarım');
    assert.equal(r.check.status, 'pending');
    didit.decisions.set(sid, idDecision(sid, { status: 'Declined' }));
    r = await ok(call('POST', '/api/verify/refresh', { kind: 'id' }, w.session), 'red');
    assert.deepEqual([r.check.status, r.idVerified], ['declined', false]);
  });

  test('incelemeye düşenler: cinsiyet, yaş, aynı kimlik iki hesapta', async () => {
    const first = await verifiedWoman('İlk Sahip', { number: 'TR-AYNI-1' });
    assert.equal((await q('SELECT status FROM identity_checks WHERE session_id = $1', [first.sid])).rows[0].status, 'approved');
    const second = await verifiedWoman('İkinci Sahip', { number: 'TR-AYNI-1' });
    const dup = (await q('SELECT status, reasons FROM identity_checks WHERE session_id = $1', [second.sid])).rows[0];
    assert.deepEqual([dup.status, dup.reasons], ['review', ['duplicate_document']]);
    const male = await verifiedWoman('Erkek Kimlikli', { gender: 'M' });
    assert.deepEqual((await q('SELECT status, reasons FROM identity_checks WHERE session_id = $1', [male.sid])).rows[0].reasons, ['sex_mismatch']);
    const young = await verifiedWoman('Küçük Kimlikli', { dob: '2012-05-05' });
    const y = (await q('SELECT status, reasons, doc_adult FROM identity_checks WHERE session_id = $1', [young.sid])).rows[0];
    assert.deepEqual([y.status, y.reasons, y.doc_adult], ['review', ['under_18'], false]);
    // An 18+ app: staff hear of it (the uptime check e-mails on any warning).
    const alerts = await ok(call('GET', '/api/admin/alerts', null, (await staff()).session), 'alarmlar');
    const minor = (alerts.alerts ?? alerts.warnings ?? []).find((x) => x.code === 'verify_minor');
    assert.ok(minor, JSON.stringify(alerts).slice(0, 300));
    assert.ok(minor.details.some((d) => d.user === young.s.user.id));
    // The person sees why it waits, never that another account has the same document.
    const mine = await ok(call('GET', '/api/verify', null, second.s.session), 'durum');
    assert.deepEqual([mine.id.status, mine.id.reasons, mine.idVerified], ['review', [], false]);
    // The provider's own review.
    const w = await person('Sağlayıcı İncelemesi');
    const j = await ok(start(w, 'id'), 'başlat');
    const sid = j.url.split('/').pop();
    didit.decisions.set(sid, idDecision(sid, { status: 'In Review' }));
    await ok(webhook(sid, 'In Review'), 'webhook');
    assert.deepEqual((await q('SELECT status, reasons FROM identity_checks WHERE session_id = $1', [sid])).rows[0].reasons, ['provider_review']);
  });

  test('yönetim: karar, sıfırlama, yüz taramasız elle doğrulama; denetim kaydı', async () => {
    const a = await staff();
    const male = await verifiedWoman('Kararı Yönetimde', { gender: 'M' });
    const row = (await q('SELECT id FROM identity_checks WHERE session_id = $1', [male.sid])).rows[0];
    await refused(call('GET', '/api/admin/verify?status=review', null, male.s.session), 403, null, 'yönetici değil');
    const list = await ok(call('GET', '/api/admin/verify?status=review&kind=id', null, a.session), 'liste');
    const seen = list.checks.find((x) => x.id === Number(row.id));
    assert.deepEqual([seen.user.id, seen.doc.sex, seen.reasonLabels[0], seen.sessionId], [male.s.user.id, 'M', 'Kimlikteki cinsiyet hesaptakiyle uyuşmuyor', male.sid]);
    await refused(call('POST', '/api/admin/verify/decide', { id: Number(row.id), approve: 'evet' }, a.session), 400, null, 'approve');
    const d = await ok(call('POST', '/api/admin/verify/decide', { id: Number(row.id), approve: true, note: 'Kimlik elle bakıldı' }, a.session), 'onay');
    assert.equal(d.check.status, 'approved');
    // A later provider update doesn't override staff.
    didit.decisions.set(male.sid, idDecision(male.sid, { status: 'Declined' }));
    await ok(webhook(male.sid, 'Declined'), 'webhook');
    const after = (await q('SELECT status, decided_by, provider_status FROM identity_checks WHERE id = $1', [row.id])).rows[0];
    assert.deepEqual([after.status, after.decided_by, after.provider_status], ['approved', a.user.id, 'Declined']);
    const audit = (await q("SELECT detail FROM audit_events WHERE action = 'verify.decide' AND target = $1", [male.s.user.id])).rows[0].detail;
    assert.deepEqual([audit.before.status, audit.after.status, audit.note], ['review', 'approved', 'Kimlik elle bakıldı']);

    await ok(call('POST', '/api/admin/verify/reset', { user: male.s.user.id, kind: 'id', note: 'Yeniden' }, a.session), 'sıfırla');
    assert.equal((await ok(call('GET', '/api/verify', null, male.s.session), 'durum')).idVerified, false);
    assert.ok((await q("SELECT 1 FROM audit_events WHERE action = 'verify.reset' AND target = $1", [male.s.user.id])).rowCount);

    const w = await person('Elle Doğrulanan');
    await refused(call('POST', '/api/admin/verify/manual', { user: w.user.id, docName: 'Elif Kaya', docSex: 'F', adult: true }, a.session), 400, null, 'not yok');
    await refused(call('POST', '/api/admin/verify/manual', { user: w.user.id, docName: 'Elif Kaya', docSex: 'F', adult: false, note: 'x' }, a.session), 400, null, '18 altı');
    const m = await ok(call('POST', '/api/admin/verify/manual', { user: w.user.id, docName: 'Elif Kaya', docSex: 'F', adult: true, note: 'Görüntülü görüşmede kimliğe bakıldı' }, a.session), 'elle');
    assert.deepEqual([m.check.status, m.check.provider], ['approved', 'manual']);
    assert.equal((await ok(call('GET', '/api/verify', null, w.session), 'durum')).idVerified, true);
    assert.ok((await q("SELECT 1 FROM audit_events WHERE action = 'verify.manual' AND target = $1", [w.user.id])).rowCount);
  });
});

describe('Para çekmede kimlik şartı', () => {
  test('şart kapalıyken bir şey değişmez; açıkken doğrulanmamış çekemez, doğrulanan çeker; ad karşılaştırılır', async () => {
    const plain = await person('Şartsız Kadın');
    assert.equal((await ok(call('GET', '/api/wallet/cash-out', null, plain.session), 'kapalı')).allowed, true);
    await setLive({ verify_payout_required: 1 });
    try {
      const no = await ok(call('GET', '/api/wallet/cash-out', null, plain.session), 'şart');
      assert.deepEqual([no.allowed, no.code], [false, 'id_required']);
      assert.match(no.why, /Kimlik Doğrulamam/);
      assert.equal((await ok(call('GET', '/api/verify', null, plain.session), 'durum')).payoutNeedsId, true);
      await h.credit(plain.user.id, 20_000, { currency: 'diamond' });
      const r = await refused(
        call('POST', '/api/wallet/withdraw', { diamonds: 10_000, method: 'iban', details: { holder: 'Ayşe Yılmaz', account: 'TR330006100519786457841326' }, ref: `wd-${rnd(10)}` }, plain.session),
        403,
        'id_required',
        'doğrulamasız çekim',
      );
      assert.match(r.error, /kimliğini doğrula/);
      assert.equal(Number((await q('SELECT diamonds FROM users WHERE id = $1', [plain.user.id])).rows[0].diamonds), 20_000);
      // The ID check itself stays open to her (it leaves the ID requirement out).
      await ok(start(plain, 'id'), 'şart varken başlatabilir');

      const { s } = await verifiedWoman('Çeken Kadın', { name: 'ŞEYMA NUR ÖZTÜRK' });
      assert.equal((await ok(call('GET', '/api/wallet/cash-out', null, s.session), 'doğrulanmış')).allowed, true);
      await h.credit(s.user.id, 40_000, { currency: 'diamond' });
      const a = await ok(call('POST', '/api/wallet/withdraw', { diamonds: 10_000, method: 'iban', details: { holder: 'Seyma Ozturk', account: 'TR330006100519786457841326' }, ref: `wd-${rnd(10)}` }, s.session), 'çekim');
      assert.equal(a.withdrawal.holderMatchesId, true);
      const staffView = await ok(call('GET', '/api/admin/withdrawals?status=pending', null, (await staff()).session), 'liste');
      const mine = staffView.rows.find((x) => x.user.id === s.user.id);
      assert.deepEqual([mine.idName, mine.holderMatchesId], ['ŞEYMA NUR ÖZTÜRK', true]);
      await ok(call('POST', '/api/wallet/withdrawals/cancel', { id: a.withdrawal.id }, s.session), 'iptal');
      const b = await ok(call('POST', '/api/wallet/withdraw', { diamonds: 10_000, method: 'iban', details: { holder: 'Mehmet Demir', account: 'TR330006100519786457841326' }, ref: `wd-${rnd(10)}` }, s.session), 'başkasının hesabı');
      assert.equal(b.withdrawal.holderMatchesId, false);

      // An agency's payout: its owner's ID check (a man's account owns this one: the cash-out rule lets agency owners).
      const owner = await person('Ajans Sahibi Doğrulama', 'Erkek');
      const [ag] = (await q("INSERT INTO agencies (code, name, level, status, owner_id) VALUES ($1, 'Doğrulama Ajansı', 1, 'approved', $2) RETURNING id", [`D${rnd(3).toUpperCase()}`, owner.user.id])).rows;
      const pay = () => call('POST', '/api/agency/payouts/request', { id: ag.id, currency: 'USD', ref: `ap-${rnd(10)}` }, owner.session);
      const p1 = await refused(pay(), 403, 'id_required', 'sahibi doğrulanmamış');
      assert.match(p1.error, /ajans sahibinin kimliği/);
      const oc = await ok(start(owner, 'id'), 'sahip başlatır');
      const osid = oc.url.split('/').pop();
      didit.decisions.set(osid, idDecision(osid, { name: 'MEHMET KAYA', gender: 'M' }));
      await ok(webhook(osid, 'Approved'), 'sahip onay');
      assert.equal((await q('SELECT status FROM identity_checks WHERE session_id = $1', [osid])).rows[0].status, 'approved');
      // Past the ID check now: what stops it is the agency's own rule (nothing to pay yet).
      const [st, j] = await pay();
      assert.notEqual(j.code, 'id_required', `${st} ${j.error}`);
    } finally {
      await setLive({ verify_payout_required: 0 });
    }
  });
});

describe('Yüz doğrulaması ve mavi rozet', () => {
  test('profil fotoğrafı referans; onayda rozet, fotoğraf değişince düşer; rıza geri alınınca silinir', async () => {
    const s = await person('Rozetli Kişi', 'Erkek');
    await refused(start(s, 'face'), 409, 'no_photo', 'fotoğraf yok');
    await withPhoto(s, Buffer.from('GIF89a not a photo'));
    await refused(start(s, 'face'), 409, 'photo_type', 'tür');
    const photo = await withPhoto(s);
    const j = await ok(start(s, 'face'), 'başlat');
    const sent = didit.created.at(-1).body;
    assert.equal(sent.workflow_id, FACE);
    assert.equal(Buffer.from(sent.portrait_image, 'base64').equals(JPEG), true);
    const sid = j.url.split('/').pop();
    didit.decisions.set(sid, { session_id: sid, status: 'Approved', liveness_checks: [{ status: 'Approved' }], face_matches: [{ status: 'Approved', score: 88 }] });
    await ok(webhook(sid, 'Approved'), 'webhook');
    const me = await ok(call('GET', '/api/me', null, s.session), 'ben');
    assert.equal(me.user.verified, true);
    const other = await signUp('Bakan');
    assert.equal((await ok(call('GET', `/api/user?id=${s.user.id}`, null, other.session), 'profil')).user.verified, true);
    assert.equal((await q('SELECT verified_avatar FROM users WHERE id = $1', [s.user.id])).rows[0].verified_avatar, photo);
    assert.equal((await ok(call('GET', '/api/verify', null, s.session), 'durum')).verified, true);
    await refused(start(s, 'face'), 409, 'already', 'zaten');

    // A new photo: the badge drops by itself.
    await withPhoto(s);
    assert.equal((await ok(call('GET', '/api/me', null, s.session), 'ben')).user.verified, false);

    // Consent withdrawn: the rows go, the provider's copy is deleted at once.
    await ok(call('POST', '/api/verify/withdraw', { kind: 'face' }, s.session), 'geri al');
    assert.equal((await q("SELECT count(*)::int AS n FROM identity_checks WHERE user_id = $1 AND kind = 'face'", [s.user.id])).rows[0].n, 0);
    assert.ok(didit.deleted.includes(sid));
    assert.equal((await q('SELECT verified_avatar FROM users WHERE id = $1', [s.user.id])).rows[0].verified_avatar, null);
    assert.ok((await q("SELECT 1 FROM audit_events WHERE action = 'verify.withdraw' AND actor = $1", [s.user.id])).rowCount);
  });

  test('rıza geri alınırken sağlayıcıya ulaşılamazsa: kişinin hiçbir bilgisi kalmaz, silme sonra tekrar denenir', async () => {
    const { s, sid } = await verifiedWoman('Geri Alan Kadın', { name: 'DERYA AK' });
    didit.down = true;
    try {
      const r = await ok(call('POST', '/api/verify/withdraw', { kind: 'id' }, s.session), 'geri al');
      assert.equal(r.idVerified, false);
      const left = (await q('SELECT status, reasons, doc_name, doc_hash, doc_sex, provider_deleted_at FROM identity_checks WHERE session_id = $1', [sid])).rows[0];
      assert.deepEqual([left.status, left.reasons, left.doc_name, left.doc_hash, left.doc_sex, left.provider_deleted_at], ['expired', ['withdrawn'], null, null, null, null]);
      const view = await ok(call('GET', '/api/verify', null, s.session), 'durum');
      assert.deepEqual([view.id, view.idVerified], [null, false]);
    } finally {
      didit.down = false;
    }
    await wait(async () => (await q('SELECT count(*)::int AS n FROM identity_checks WHERE session_id = $1', [sid])).rows[0].n === 0, 'sonradan silinir');
    assert.ok(didit.deleted.includes(sid));
  });

  test('yönetim rozeti sıfırlar', async () => {
    const s = await person('Sıfırlanan Rozet', 'Erkek');
    await withPhoto(s);
    const j = await ok(start(s, 'face'), 'başlat');
    const sid = j.url.split('/').pop();
    didit.decisions.set(sid, { session_id: sid, status: 'Approved' });
    await ok(call('POST', '/api/verify/refresh', { kind: 'face' }, s.session), 'dönüş');
    assert.equal((await ok(call('GET', '/api/me', null, s.session), 'ben')).user.verified, true);
    await ok(call('POST', '/api/admin/verify/reset', { user: s.user.id, kind: 'face', note: 'Çalıntı fotoğraf şikâyeti' }, (await staff()).session), 'sıfırla');
    assert.equal((await ok(call('GET', '/api/me', null, s.session), 'ben')).user.verified, false);
  });
});

describe('Sınırlar ve hatalar', () => {
  test('günlük deneme, bütçe, sağlayıcıya ulaşılamaması, aynı anda iki dokunuş', async () => {
    const w = await person('Sınır Kadın');
    // Three sessions a day: each stale one (older than an hour) is closed and its provider copy deleted.
    for (let i = 0; i < 3; i++) {
      await ok(start(w, 'id'), `deneme ${i + 1}`);
      await q("UPDATE identity_checks SET created_at = now() - interval '2 hours' + make_interval(secs => $2) WHERE user_id = $1 AND status = 'pending'", [w.user.id, i]);
    }
    await q("UPDATE identity_checks SET created_at = now() - interval '2 hours' WHERE user_id = $1", [w.user.id]);
    await refused(start(w, 'id'), 429, 'tries', 'dördüncü');
    const closed = (await q('SELECT status, provider_deleted_at FROM identity_checks WHERE user_id = $1 ORDER BY id', [w.user.id])).rows;
    assert.deepEqual(closed.slice(0, 2).map((x) => [x.status, !!x.provider_deleted_at]), [['expired', true], ['expired', true]]);

    const down = await person('Ulaşılamayan Kadın');
    didit.down = true;
    try {
      await refused(start(down, 'id'), 502, null, 'sağlayıcı yok');
    } finally {
      didit.down = false;
    }
    assert.equal((await q('SELECT count(*)::int AS n FROM identity_checks WHERE user_id = $1', [down.user.id])).rows[0].n, 0);

    const twice = await person('İki Dokunuş');
    const both = await Promise.all([start(twice, 'id'), start(twice, 'id')]);
    const urls = both.filter(([st]) => st === 200).map(([, j]) => j.url);
    assert.ok(urls.length >= 1, JSON.stringify(both));
    assert.ok(both.every(([st, j]) => st === 200 || (st === 409 && j.code === 'opening')), JSON.stringify(both));
    assert.equal((await q("SELECT count(*)::int AS n FROM identity_checks WHERE user_id = $1 AND status = 'pending'", [twice.user.id])).rows[0].n, 1);

    await setLive({ verify_monthly_usd: 0 });
    try {
      const v = await ok(call('GET', '/api/verify', null, twice.session), 'durum');
      assert.deepEqual(v.on, { id: false, face: false });
      await refused(start(await person('Bütçesiz'), 'id'), 503, 'verify_off', 'kapalı');
    } finally {
      await setLive({ verify_monthly_usd: 100 });
    }
    await setLive({ verify_monthly_usd: 1 });
    try {
      // Spent this month by the tests above is past 1 USD.
      await refused(start(await person('Bütçe Doldu'), 'id'), 503, 'budget', 'bütçe');
    } finally {
      await setLive({ verify_monthly_usd: 100 });
    }
  });
});

describe('Veri: kopya, saklama süresi, hesap silme', () => {
  test('veri kopyasında; karardan 30 gün sonra sağlayıcıdaki kopya silinir; yarım kalan kapanır', async () => {
    const { s, sid } = await verifiedWoman('Kopyası Olan', { name: 'ELİF KAYA' });
    const copy = await ok(call('GET', '/api/me/export', null, s.session), 'kopya');
    const c = copy.identityChecks.find((x) => x.kind === 'id');
    assert.deepEqual([c.status, c.document.name, c.document.sex, c.consent.version], ['approved', 'ELİF KAYA', 'F', CONSENT.id.version]);
    assert.equal(JSON.stringify(copy.identityChecks).includes(sid), false);

    await q("UPDATE identity_checks SET decided_at = now() - interval '31 days' WHERE session_id = $1", [sid]);
    await wait(async () => (await q('SELECT provider_deleted_at FROM identity_checks WHERE session_id = $1', [sid])).rows[0].provider_deleted_at, 'sağlayıcıdan silme');
    assert.ok(didit.deleted.includes(sid));
    // The outcome stays: she is still verified.
    assert.equal((await ok(call('GET', '/api/verify', null, s.session), 'durum')).idVerified, true);

    const w = await person('Yarım Bırakan');
    await ok(start(w, 'id'), 'başlat');
    await q("UPDATE identity_checks SET created_at = now() - interval '3 days' WHERE user_id = $1", [w.user.id]);
    await wait(async () => (await q('SELECT status FROM identity_checks WHERE user_id = $1', [w.user.id])).rows[0].status === 'expired', 'yarım kapanır');
  });

  test('hesap silinince kimlik bilgisi hemen gider, sağlayıcıdaki kopya ve satırlar ardından', async () => {
    const { s, sid } = await verifiedWoman('Silinen Kadın');
    await ok(call('DELETE', '/api/me', null, s.session), 'sil');
    const r = (await q('SELECT doc_name, doc_hash, doc_sex FROM identity_checks WHERE session_id = $1', [sid])).rows[0];
    if (r) assert.deepEqual([r.doc_name, r.doc_hash, r.doc_sex], [null, null, null]);
    await wait(async () => (await q('SELECT count(*)::int AS n FROM identity_checks WHERE user_id = $1', [s.user.id])).rows[0].n === 0, 'satırlar gider');
    assert.ok(didit.deleted.includes(sid));
  });
});
