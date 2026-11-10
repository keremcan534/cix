/// <reference types="node" />
// Arkadaşını Getir and the first-purchase gift as the screens word them (lib/invite-view): the code a person types
// read the way the server reads it (server/api/referrals.mjs codeOf), the steps in the demo and a live build, the
// line under "Seni … davet etti", Görevler's banner and a pack's gift from GET /api/rewards.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { ServerRewards } from '@/lib/api';
import { cleanInviteCode, firstBonusOf, inviteBannerText, inviteMessage, inviteSteps, myInviteText } from '@/lib/invite-view';
import { pushTarget } from '@/lib/push-target';

const rewards = (o: Partial<ServerRewards> = {}): ServerRewards => ({
  welcome: { coins: 0, on: true, amount: 100 },
  firstBonus: { on: true, packs: [{ productId: 'coins_1000', bonus: 1000 }, { productId: 'coins_5000', bonus: 2500 }] },
  invite: { on: true, coins: 200, canEnter: true },
  ...o,
});

describe('davet kodu', () => {
  test('boşluk, tire, küçük harf ve SIMI öneki olmadan da aynı kod', () => {
    for (const t of ['SIMI-AB23CD', 'simi-ab23cd', ' simi ab23 cd ', 'AB23CD', 'ab-23-cd']) assert.equal(cleanInviteCode(t), 'SIMI-AB23CD', t);
  });
  test('karışan harfler (0, O, 1, I), eksik ya da fazla harf kod değildir', () => {
    for (const t of ['', 'SIMI-AB23C', 'SIMI-AB23CDE', 'SIMI-0B23CD', 'SIMI-OB23CD', 'SIMI-1B23CD', 'SIMI-IB23CD', 'SIMI-AB23Ç!', 'x'.repeat(41)]) assert.equal(cleanInviteCode(t), null, t);
  });
});

describe('ekrandaki sözler', () => {
  test('demo adımları değişmedi; canlıda kayıttan sonraki günler de söylenir', () => {
    assert.deepEqual(inviteSteps(200), ['Kodunu ya da davet bağlantını arkadaşınla paylaş.', 'Arkadaşın kayıt olurken kodunu girsin.', 'İlk odasına girdiğinde ikinize de 200 jeton gelir.']);
    assert.match(inviteSteps(1500, 7)[1], /ilk 7 gün içinde Davet ekranından/);
    assert.match(inviteSteps(1500, 7)[2], /1\.500 jeton/);
    assert.match(inviteMessage('SIMI-AB23CD'), /davet kodumu kullan: SIMI-AB23CD/);
  });
  test('girilen davetin durumu', () => {
    assert.equal(myInviteText({ status: 'pending', reason: null, coins: 0 }, 200), 'İlk odana girdiğinde ikinize de 200 jeton gelir.');
    assert.equal(myInviteText({ status: 'paid', reason: null, coins: 300 }, 200), 'İkinize de 300 jeton verildi.');
    assert.match(myInviteText({ status: 'refused', reason: 'device', coins: 0 }, 200), /başka bir hesap/);
    assert.equal(myInviteText({ status: 'refused', reason: 'blocked', coins: 0 }, 200), 'Bu davet için ödül verilmedi.');
    assert.equal(myInviteText({ status: 'revoked', reason: 'staff', coins: 200 }, 200), 'Davet ödülü geri alındı.');
    assert.equal(myInviteText({ status: null, reason: null, coins: 0 }, 200), '');
  });
  test('Görevler bannerı: demo metni; canlıda sunucunun miktarı, kapalıyken yok', () => {
    assert.match(inviteBannerText(false, null) ?? '', /kayıt ve gelir görevlerinden/);
    assert.match(inviteBannerText(true, null) ?? '', /ikiniz de jeton/);
    assert.match(inviteBannerText(true, rewards({ invite: { on: true, coins: 250, canEnter: false } })) ?? '', /ikinize de 250 jeton/);
    assert.equal(inviteBannerText(true, rewards({ invite: { on: false, coins: 200, canEnter: false } })), null);
  });
  test('ödenen davetin bildirimi Arkadaşını Getir’i açar', () => {
    assert.equal(pushTarget({ type: 'invite' }), '/davet');
  });
});

describe('ilk alım hediyesi', () => {
  test('alınmamış paketin hediyesi; alınmış, bilinmeyen ya da kapalıysa 0', () => {
    assert.equal(firstBonusOf(rewards(), 'coins_1000'), 1000);
    assert.equal(firstBonusOf(rewards(), 'coins_10000'), 0);
    assert.equal(firstBonusOf(null, 'coins_1000'), 0);
    assert.equal(firstBonusOf(rewards({ firstBonus: { on: false, packs: [{ productId: 'coins_1000', bonus: 1000 }] } }), 'coins_1000'), 0);
  });
});
