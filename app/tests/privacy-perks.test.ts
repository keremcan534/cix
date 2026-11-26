// Gizlilik as a VIP / Rütbe right (lib/privacy-perks; server/api/privacy.mjs).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { demoPrivacyPerks, perksFromServer, privacyShown } from '@/lib/privacy-perks';

describe('Gizlilik: VIP ve Rütbe ayrıcalığı', () => {
  test('normal kullanıcı hiçbirini görmez', () => {
    const none = demoPrivacyPerks(0, 0);
    for (const k of ['showCurrentRoom', 'globalHideName', 'showOnline', 'showLastSeen', 'profileMarks', 'profilePublic'] as const) assert.equal(privacyShown(none, k), false, k);
  });

  test('VIP seviyesine ve rütbeye göre açılır', () => {
    const vip2 = demoPrivacyPerks(2, 0);
    assert.equal(privacyShown(vip2, 'showCurrentRoom'), true);
    assert.equal(privacyShown(vip2, 'globalHideName'), false);
    const vip6 = demoPrivacyPerks(6, 0);
    assert.equal(privacyShown(vip6, 'profilePublic'), true);
    const kont = demoPrivacyPerks(0, 3);
    assert.deepEqual([privacyShown(kont, 'showOnline'), privacyShown(kont, 'showLastSeen'), privacyShown(kont, 'profilePublic')], [true, true, false]);
  });

  test('sunucu söylemezse (eski sunucu) hepsi görünür; henüz okunmadıysa hiçbiri', () => {
    assert.equal(privacyShown(undefined, 'profilePublic'), true);
    assert.equal(privacyShown(null, 'profilePublic'), false);
    assert.equal(perksFromServer(undefined), undefined);
    assert.deepEqual([...perksFromServer(['privacy_room', 3, null])!], ['privacy_room']);
  });
});
