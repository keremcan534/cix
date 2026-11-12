/// <reference types="node" />
// Ajans asistanı (lib/agency-assistant): the example split on the owner's screens follows the server's arithmetic
// (1/10,000 diamond, the assistant's part toward zero, the owner keeps the rest), the share input takes only whole
// percents 0–100, and the assistant's notifications open the agency screen.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { assistantExample, assistantSplit, shareIn } from '@/lib/agency-assistant';
import { pushTarget } from '@/lib/push-target';

describe('Ajans asistanı', () => {
  test('örnek bölüşüm: 100 elmas, %20 komisyon, %80 pay → asistana 16, sahibe 4', () => {
    assert.deepEqual(assistantSplit(100, 0.2, 80), { commission: 20, assistant: 16, owner: 4 });
    assert.deepEqual(assistantSplit(100, 0.2, 0), { commission: 20, assistant: 0, owner: 20 });
    assert.deepEqual(assistantSplit(100, 0.2, 100), { commission: 20, assistant: 20, owner: 0 });
    // Fractions: 7 × 20 % = 1.4; 80 % of it = 1.12. 3 × 25 % = 0.75; 33 % of it = 0.2475, the owner 0.5025.
    assert.deepEqual(assistantSplit(7, 0.2, 80), { commission: 1.4, assistant: 1.12, owner: 0.28 });
    assert.deepEqual(assistantSplit(3, 0.25, 33), { commission: 0.75, assistant: 0.2475, owner: 0.5025 });
    // Toward zero below 1/10,000: the owner keeps it.
    const tiny = assistantSplit(1, 0.0003, 50);
    assert.equal(tiny.assistant, 0.0001);
    assert.equal(tiny.owner, 0.0002);
    assert.equal(assistantExample(0.2, 80), 'Örnek: Asistanın getirdiği yayıncı 100 elmas kazanırsa ajans komisyonun (%20) 20 elmas olur. Pay %80 ise asistana 16, sana 4 elmas kalır.');
  });

  test('pay girişi: 0–100 arası tam sayı', () => {
    assert.equal(shareIn('80'), 80);
    assert.equal(shareIn('0'), 0);
    assert.equal(shareIn('100'), 100);
    assert.equal(shareIn('101'), null);
    assert.equal(shareIn('12.5'), null);
    assert.equal(shareIn(''), null);
    assert.equal(shareIn('-5'), null);
  });

  test('asistan bildirimi ajans ekranını açar', () => {
    assert.equal(pushTarget({ type: 'agency_assistant' }), '/ajans');
  });
});
