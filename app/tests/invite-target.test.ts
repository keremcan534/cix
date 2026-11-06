/// <reference types="node" />
// Ajans → Ofis → "Yayıncı davet et" (lib/invite-target): the owner can type the profile ID the app shows, an
// account id or a username. A profile ID is matched only against people the phone can list.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { parseInviteInput, pickByPublicId } from '@/lib/invite-target';

describe('Yayıncı davet hedefi', () => {
  test('account id, profile ID and username', () => {
    assert.deepEqual(parseInviteInput(' 3F2504E0-4F89-41D3-9A0C-0305E82C3301 '), { kind: 'user', id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' });
    assert.deepEqual(parseInviteInput('104829301457'), { kind: 'public', publicId: '104829301457', username: '104829301457' });
    assert.deepEqual(parseInviteInput('ID: 1048 2930 1457'), { kind: 'public', publicId: '104829301457', username: '104829301457' });
    assert.deepEqual(parseInviteInput('@ayse.yildiz'), { kind: 'username', username: 'ayse.yildiz' });
    assert.deepEqual(parseInviteInput('12345'), { kind: 'username', username: '12345' }, 'too short for a profile ID');
  });

  test('nothing usable', () => {
    assert.equal(parseInviteInput(''), null);
    assert.equal(parseInviteInput('  @ '), null);
    assert.equal(parseInviteInput('a'), null);
  });

  test('profile ID matches each person once', () => {
    const idOf = (id: string) => ({ u1: '111111111', u2: '222222222', u3: '111111111' })[id] ?? '';
    const people = [{ id: 'u1' }, { id: 'u2' }, { id: 'u1' }, { id: 'u3' }];
    assert.deepEqual(pickByPublicId('222222222', people, idOf), [{ id: 'u2' }]);
    assert.deepEqual(pickByPublicId('111111111', people, idOf).map((p) => p.id), ['u1', 'u3'], 'two hits: the caller asks for more');
    assert.deepEqual(pickByPublicId('999999999', people, idOf), []);
  });
});
