/// <reference types="node" />
// The profile screen in live mode (a server address is set) shows nobody's sample data (sosyal-6, mantik-8): no
// made-up height, job, zodiac, slogan, tags or birthday, for me or anyone else, and nobody is shown in a sample
// room or call. The offline demo keeps its sample values. Both read the address on each call, so it is switched here.
import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { ME, ROOMS, USERS } from '@/data/mock';
import { presenceOf } from '@/data/presence';
import { NO_EXTRAS, profileCompletion, profileExtras } from '@/data/profile';

const live = (on: boolean) => {
  if (on) process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  else delete process.env.EXPO_PUBLIC_API_URL;
};
afterEach(() => live(false));

describe('Profil ekstraları', () => {
  test('canlı modda kimsenin (benim de) örnek boyu, işi, burcu, sloganı, etiketi, doğum günü yok', () => {
    live(true);
    for (const u of [ME, ...USERS]) assert.deepEqual(profileExtras(u), NO_EXTRAS);
  });

  test('demoda örnek değerler kalır ve kişiye göre sabittir', () => {
    live(false);
    const u = USERS[0];
    const x = profileExtras(u);
    assert.ok(x.height > 0 && !!x.job && !!x.zodiac && x.tags.length > 0 && !!x.birthday);
    assert.deepEqual(profileExtras(u), x);
    assert.equal(profileExtras(ME).job, 'IT');
  });

  test('canlı modda tamamlanma oranı yalnızca gerçek alanlardan gelir (örnek iş, dil, etiket sayılmaz)', () => {
    const empty = { ...ME, avatar: '', name: 'Sen', bio: '', city: '', verified: false, gender: undefined, interests: [] };
    live(true);
    assert.equal(profileCompletion(empty, profileExtras(empty), 0), 0);
    live(false);
    assert.ok(profileCompletion(empty, profileExtras(empty), 0) > 0);
  });
});

describe('Nerede: oda / görüşme', () => {
  test('canlı modda kimse örnek bir odada ya da görüşmede görünmez', () => {
    live(true);
    for (const u of USERS) assert.equal(presenceOf(u.id), null);
    for (const r of ROOMS) assert.equal(presenceOf(r.hostId), null);
  });

  test('demoda oda sahibi kendi odasında görünür; hiçbir odada olmayan kimse görünmez', () => {
    live(false);
    const room = ROOMS[0];
    assert.deepEqual(presenceOf(room.hostId), { kind: 'room', roomId: room.id, title: room.title, locked: !!room.password });
    assert.equal(presenceOf('kimse-yok'), null);
  });
});
