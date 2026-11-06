/// <reference types="node" />
// Profile affiliations and what the "Ben" tab shows about me. Demo: the agency a user shows on their profile, and
// that the demo account has a gender to show. Live mode (lib/me-view): my agency from GET /api/agency/me, the Ben
// menu rows that depend on it, my profile from GET /api/me with nothing of the demo left, and no local staff roles.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { AGENCIES, agencyOf } from '@/data/agency';
import { ME, USERS } from '@/data/mock';
import { INITIAL_RBAC, initialUserRoles, shownStaffBadge } from '@/data/rbac';
import { agencyLinkOf, myCompletion, profileFromServer, rowVisible, type ServerMeView } from '@/lib/me-view';
import type { Me, MyAgency } from '@/lib/agency-net';

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

const agency = (id: string, viewer: MyAgency['viewer'], status: MyAgency['status']) => ({ id, name: `Ajans ${id}`, viewer, status }) as unknown as MyAgency;
const me = (p: Partial<Me>): Me => ({ membership: null, requests: [], transfer: null, agencies: [], platform: [], ...p });
const membership = { agency: { id: 'm1', name: 'Yayın Ajansı', code: 'YA1', level: 1, parentName: null }, joinedAt: '2026-10-01', method: 'code' };

describe('Canlı: ajansım sunucudan (GET /api/agency/me)', () => {
  test('onaylı ya da askıdaki sahibi olduğum ajans "owner"', () => {
    assert.deepEqual(agencyLinkOf(me({ agencies: [agency('a1', 'owner', 'approved')] })), { id: 'a1', name: 'Ajans a1', role: 'owner' });
    assert.deepEqual(agencyLinkOf(me({ agencies: [agency('a2', 'owner', 'suspended')] })), { id: 'a2', name: 'Ajans a2', role: 'owner' });
  });

  test('taslak ya da bekleyen başvuru henüz ajans değil', () => {
    assert.equal(agencyLinkOf(me({ agencies: [agency('a1', 'owner', 'draft'), agency('a2', 'owner', 'pending')] })), null);
  });

  test('ekibinde olduğum ajans "staff"; sahibi olduğum önce gelir', () => {
    assert.deepEqual(agencyLinkOf(me({ agencies: [agency('s1', 'staff', 'approved')] })), { id: 's1', name: 'Ajans s1', role: 'staff' });
    assert.equal(agencyLinkOf(me({ agencies: [agency('s1', 'staff', 'approved'), agency('o1', 'owner', 'approved')] }))?.id, 'o1');
  });

  test('yayın yaptığım ajans "member"; üst ajans ya da merkez bakışı ajans sayılmaz', () => {
    assert.deepEqual(agencyLinkOf(me({ membership })), { id: 'm1', name: 'Yayın Ajansı', role: 'member' });
    assert.equal(agencyLinkOf(me({ agencies: [agency('p1', 'parent', 'approved'), agency('c1', 'center', 'approved')] })), null);
  });

  test('cevap yoksa ya da hiçbir ajansım yoksa ajans yok', () => {
    assert.equal(agencyLinkOf(null), null);
    assert.equal(agencyLinkOf(me({})), null);
  });
});

describe('Ben menüsü: hangi satır görünür', () => {
  const live = { demo: false, live: true };
  test('ajans satırları sunucunun cevabına göre; cevap gelmeden ikisi de gizli', () => {
    assert.equal(rowVisible({ agencyOnly: true }, { ...live, hasAgency: true }), true);
    assert.equal(rowVisible({ agencyOnly: true }, { ...live, hasAgency: false }), false);
    assert.equal(rowVisible({ noAgencyOnly: true }, { ...live, hasAgency: false }), true);
    assert.equal(rowVisible({ noAgencyOnly: true }, { ...live, hasAgency: true }), false);
    assert.equal(rowVisible({ agencyOnly: true }, { ...live, hasAgency: null }), false);
    assert.equal(rowVisible({ noAgencyOnly: true }, { ...live, hasAgency: null }), false);
  });

  test('sunucuda karşılığı olmayan satırlar canlıda gizli, demoda görünür', () => {
    assert.equal(rowVisible({ localOnly: true, agencyOnly: true }, { ...live, hasAgency: true }), false);
    assert.equal(rowVisible({ localOnly: true, agencyOnly: true }, { demo: true, live: false, hasAgency: true }), true);
  });

  test('yönetim ekranları yalnızca demo derlemesinde', () => {
    assert.equal(rowVisible({ demoOnly: true }, { ...live, hasAgency: false }), false);
    assert.equal(rowVisible({ demoOnly: true }, { demo: true, live: true, hasAgency: false }), true);
    assert.equal(rowVisible({}, { ...live, hasAgency: null }), true);
  });
});

const serverMe = (p: Partial<ServerMeView> = {}): ServerMeView => ({
  id: '7f1c2a9e-0000-4000-8000-000000000001',
  name: 'Ayşe',
  coins: 0,
  diamonds: 0,
  gameCoins: 0,
  createdAt: '2026-10-20T09:30:00.000Z',
  username: null,
  gender: null,
  age: null,
  city: null,
  bio: '',
  interests: [],
  avatarUrl: null,
  ...p,
});

describe('Canlı: profilim sunucudan (GET /api/me)', () => {
  test('boş alanlar boş kalır; demo kullanıcı adı, doğum tarihi ve mavi tik gelmez', () => {
    const p = profileFromServer(serverMe());
    assert.equal(p.username, '');
    assert.notEqual(p.username, 'sen');
    assert.equal(p.birthDate, '');
    assert.equal(p.verified, false);
    assert.equal(p.age, 0);
    assert.equal(p.city, '');
    assert.equal(p.avatar, '');
    assert.equal(p.gender, undefined);
  });

  test('katılma tarihi hesabın açıldığı gün', () => {
    assert.equal(profileFromServer(serverMe()).joinedAt, '2026-10-20');
  });

  test('sunucunun gönderdiği alanlar olduğu gibi gelir', () => {
    const p = profileFromServer(serverMe({ username: 'ayse.k', gender: 'Kadın', age: 24, city: 'İzmir', birthDate: '2002-03-14T00:00:00.000Z', verified: true }));
    assert.equal(p.username, 'ayse.k');
    assert.equal(p.gender, 'Kadın');
    assert.equal(p.age, 24);
    assert.equal(p.city, 'İzmir');
    assert.equal(p.birthDate, '2002-03-14');
    assert.equal(p.verified, true);
  });

  test('profil tamamlama doldurulan alanlara göre, demonun ek alanları sayılmaz', () => {
    const empty = { ...ME, ...profileFromServer(serverMe({ name: 'Sen' })) };
    const filled = { ...ME, ...profileFromServer(serverMe({ bio: 'Merhaba', city: 'İzmir', gender: 'Kadın', interests: ['🎧 Müzik'], avatarUrl: 'https://x/y.jpg' })) };
    assert.equal(myCompletion(empty, true), 0);
    assert.ok(myCompletion(filled, true) > myCompletion(empty, true));
    // The demo profile counts its sample extras (job, tags, languages): live mode does not.
    assert.ok(myCompletion(filled, false) > myCompletion(filled, true));
  });
});

describe('Personel rozeti', () => {
  test('canlıda yerel roller boş başlar; demoda örnek roller var', () => {
    assert.deepEqual(initialUserRoles({ live: true, demo: true }), []);
    assert.deepEqual(initialUserRoles({ live: true, demo: false }), []);
    assert.ok(initialUserRoles({ live: false, demo: true }).some((u) => u.userId === 'me'));
  });

  test('canlıda rozet yalnızca benim, sunucudaki rolümden', () => {
    const demoRoles = { ...INITIAL_RBAC, userRoles: initialUserRoles({ live: false, demo: true }) };
    assert.equal(shownStaffBadge(demoRoles, 'me', true, null), null);
    assert.equal(shownStaffBadge(demoRoles, 'me', true, 'admin'), 'Yönetici');
    assert.equal(shownStaffBadge(demoRoles, 'me', true, 'moderator'), 'Moderatör');
    assert.equal(shownStaffBadge(demoRoles, 'u3', true, 'admin'), null);
  });

  test('demoda rozet yerel rollerden', () => {
    const demoRoles = { ...INITIAL_RBAC, userRoles: initialUserRoles({ live: false, demo: true }) };
    assert.equal(shownStaffBadge(demoRoles, 'me', false, null), 'Yönetici');
  });
});
