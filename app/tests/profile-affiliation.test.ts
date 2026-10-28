/// <reference types="node" />
// Profile affiliations: which agency a user shows on their profile, and that the demo account has a gender to show.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { AGENCIES, agencyOf } from '@/data/agency';
import { ME, USERS } from '@/data/mock';

describe('Profil: ajans ve cinsiyet', () => {
  test('ajans sahipleri kendi ajanslarında "owner" olarak görünür', () => {
    for (const a of AGENCIES.filter((x) => x.status === 'active')) {
      const owner = USERS.find((u) => u.name === a.owner)!;
      assert.deepEqual(agencyOf(owner.id), { agency: a, role: 'owner' });
    }
  });

  test('ajansı olmayan kullanıcıda ajans yok', () => {
    assert.equal(agencyOf('u3'), null);
    assert.equal(agencyOf('yok'), null);
  });

  test('kapalı ajans profilde gösterilmez', () => {
    const closed = AGENCIES.find((a) => a.status === 'closed')!;
    const owner = USERS.find((u) => u.name === closed.owner)!;
    assert.equal(agencyOf(owner.id), null);
  });

  test('demo hesabının cinsiyeti tanımlı (rozet yalnızca yaş göstermez)', () => {
    assert.ok(ME.gender);
    assert.notEqual(ME.showGender, false);
  });
});
