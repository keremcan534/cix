/// <reference types="node" />
// Anlık Kulüp (lib/club): the online people most like you, a name and question from what you share, the
// same club again after a restart (rebuilt from the room id), and blocked people never in it.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { ME, USERS, roomById } from '@/data/mock';
import { CLUB_SIZE, buildClub, clubDay, parseClubRoomId, setClubHidden } from '@/lib/club';
import { similarity } from '@/lib/similarity';

const me = { ...ME, interests: ['🎧 Müzik', '☕ Kahve', '💬 Sohbet'] };
const DAY = '2026-10-30';

describe('Anlık Kulüp', () => {
  test('en benzer çevrimiçi kişiler, en benzeri önce', () => {
    const club = buildClub(me, { day: DAY });
    assert.equal(club.members.length, CLUB_SIZE);
    for (const m of club.members) {
      assert.ok(m.user.online, `${m.user.name} çevrimiçi değil`);
      assert.notEqual(m.user.id, me.id);
    }
    const scores = club.members.map((m) => m.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
    const best = Math.max(...USERS.filter((u) => u.online).map((u) => similarity(me, u).score));
    assert.equal(scores[0], best);
    assert.ok(club.average >= 30 && club.average <= 98);
  });

  test('ad ve soru ortak ilgi alanlarından', () => {
    const club = buildClub(me, { day: DAY });
    assert.ok(club.topics.length > 0);
    for (const t of club.topics) assert.ok(me.interests.some((i) => i.endsWith(t)), t);
    assert.match(club.name, /Kulübü$/);
    assert.ok(club.icebreaker.endsWith('?') || club.icebreaker.endsWith('.'), club.icebreaker);
  });

  test('aynı gün ve tur aynı kulüp; "Başka kişiler" başka kişiler getirir', () => {
    const a = buildClub(me, { day: DAY, round: 0 });
    const b = buildClub(me, { day: DAY, round: 0 });
    assert.deepEqual(a, b);
    const next = buildClub(me, { day: DAY, round: 1 });
    assert.notDeepEqual(
      next.members.map((m) => m.user.id),
      a.members.map((m) => m.user.id),
    );
  });

  test('engellenen kişi kulübe girmez', () => {
    const first = buildClub(me, { day: DAY }).members[0].user.id;
    const club = buildClub(me, { day: DAY, exclude: new Set([first]) });
    assert.ok(!club.members.some((m) => m.user.id === first));
  });

  test('oda kimliğinden yeniden kurulur: sen koltuktasın, oda seni adınla karşılar', () => {
    setClubHidden(new Set());
    const club = buildClub(ME, { day: DAY, round: 2 });
    assert.deepEqual(parseClubRoomId(club.roomId), { day: DAY, round: 2 });
    const room = roomById(club.roomId);
    assert.equal(room.id, club.roomId);
    assert.equal(room.title, club.name);
    assert.ok(room.seatUserIds.includes('me'));
    for (const m of club.members) assert.ok(room.seatUserIds.includes(m.user.id), m.user.name);
    assert.ok(room.announcement?.includes(club.icebreaker));
    assert.ok(room.script?.[0].text.includes(ME.name), 'ilk mesaj adınla');
    assert.equal(parseClubRoomId('r1'), null);
    assert.equal(roomById('r1').id, 'r1', 'normal odalar etkilenmez');
  });

  test('gün yerel takvimden, iki haneli', () => {
    assert.equal(clubDay(new Date(2026, 0, 5)), '2026-01-05');
  });
});
