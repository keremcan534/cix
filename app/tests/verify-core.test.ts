/// <reference types="node" />
// Kimlik ve yüz doğrulaması (lib/verify-core): the server's answer read defensively (a malformed one is no state, a
// check of another shape none, only an https page opens) and what the screen says and offers.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canStart, canWithdraw, parseCheck, parseConsent, parseVerifyState, statusText, verifyUrl, type VerifyState } from '@/lib/verify-core';

const consent = { version: 'id-2026-11-26', title: 'Kimlik', lines: ['Bir', 'İki'], accept: 'Onaylıyorum' };
const base = {
  on: { id: true, face: true },
  id: null,
  face: null,
  verified: false,
  idVerified: false,
  payoutNeedsId: false,
  consent: { id: consent, face: { ...consent, version: 'face-2026-11-26' } },
};

test('durum: bozuk cevap durum değildir, eksik alanlar kapalı sayılır', () => {
  assert.equal(parseVerifyState(null), null);
  assert.equal(parseVerifyState([]), null);
  assert.equal(parseVerifyState('x'), null);
  const s = parseVerifyState({})!;
  assert.deepEqual([s.on, s.id, s.face, s.verified, s.idVerified, s.payoutNeedsId, s.consent], [{ id: false, face: false }, null, null, false, false, false, { id: null, face: null }]);
  const full = parseVerifyState({ ...base, verified: 'true', idVerified: true })!;
  assert.deepEqual([full.verified, full.idVerified, full.consent.id?.version], [false, true, 'id-2026-11-26']);
});

test('doğrulama kaydı: tür, durum, kimlik; sayfa yalnız bekleyende ve https ise', () => {
  assert.equal(parseCheck({ id: 1, kind: 'pasaport', status: 'pending' }), null);
  assert.equal(parseCheck({ id: 1, kind: 'id', status: 'bitti' }), null);
  assert.equal(parseCheck({ id: '1', kind: 'id', status: 'pending' }), null);
  const c = parseCheck({ id: 4, kind: 'id', status: 'pending', url: 'https://verify.didit.me/session/abc', reasons: ['provider_review', 3] })!;
  assert.deepEqual([c.url, c.reasons], ['https://verify.didit.me/session/abc', ['provider_review']]);
  assert.equal(parseCheck({ id: 4, kind: 'id', status: 'approved', url: 'https://verify.didit.me/x' })!.url, null);
  assert.equal(verifyUrl('javascript:alert(1)'), null);
  assert.equal(verifyUrl('http://verify.didit.me/x'), null);
  assert.equal(verifyUrl('similarclub://x'), null);
  assert.equal(verifyUrl('https://verify.didit.me/x y'), null);
});

test('rıza metni: sürüm, başlık, satırlar, onay cümlesi şart', () => {
  assert.deepEqual(parseConsent(consent), consent);
  assert.equal(parseConsent({ ...consent, lines: [] }), null);
  assert.equal(parseConsent({ ...consent, version: '' }), null);
  assert.deepEqual(parseConsent({ ...consent, lines: ['Bir', 2, ''] })!.lines, ['Bir']);
});

test('ekranın söyledikleri ve sunduklarından', () => {
  const s = parseVerifyState(base) as VerifyState;
  assert.equal(statusText('id', null, false), null);
  assert.match(statusText('id', null, true)!, /Kimliğin doğrulandı/);
  const review = parseCheck({ id: 1, kind: 'id', status: 'review', reasons: ['provider_review'] });
  assert.match(statusText('id', review, false)!, /inceleniyor/);
  assert.match(statusText('id', parseCheck({ id: 1, kind: 'id', status: 'declined', reasons: ['staff_reset'] }), false)!, /sıfırlandı/);
  assert.match(statusText('face', parseCheck({ id: 1, kind: 'face', status: 'approved' }), false)!, /fotoğrafını değiştirdin/);
  assert.equal(canStart('id', s), true);
  assert.equal(canStart('id', { ...s, id: review }), false);
  assert.equal(canStart('id', { ...s, idVerified: true }), false);
  assert.equal(canStart('face', { ...s, on: { id: true, face: false } }), false);
  assert.equal(canWithdraw('face', s), false);
  assert.equal(canWithdraw('id', { ...s, id: review }), true);
});
