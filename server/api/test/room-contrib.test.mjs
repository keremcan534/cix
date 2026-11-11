// Oda katkı sıralaması on the server (room-contrib.mjs) against a real Postgres: Cömertlik (sent) and Yankı
// (received) count only the gifts of this room (by its id or its LiveKit name), 1 coin = 1 point; the hour, day
// and week start on Turkey's clock; a tie goes to whoever gave first; the top 50 and my own place; deleted
// accounts leave the list; bad requests are refused.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi();
const { call, signUp } = h;
const q = async (sql, args = []) => (await h.sql.query(sql, args)).rows;
const topUp = async (s, amount) => {
  for (const pack of [10000, 5000, 1000]) {
    for (; amount >= pack; amount -= pack) assert.equal((await call('POST', '/api/wallet/test-topup', { amount: pack, ref: rnd(6) }, s))[0], 200);
  }
};
const open = async (s) => {
  const [st, j] = await call('POST', '/api/rooms', { title: `Oda ${rnd(2)}` }, s);
  assert.equal(st, 200, j.error);
  return j.room.id;
};
const board = async (s, room, side, period = 'day') => {
  const [st, j] = await call('GET', `/api/rooms/contrib?room=${room}&side=${side}&period=${period}`, null, s);
  assert.equal(st, 200, j.error);
  return j;
};
const pairs = (j) => j.rows.map((r) => [r.rank, r.user.name, r.score]);
const TZ = 'Europe/Istanbul';

describe('Oda katkı sıralaması', () => {
  test('Cömertlik ve Yankı yalnız bu odanın hediyelerinden; 1 jeton = 1 puan; benim yerim', async () => {
    const owner = await signUp('Sahip');
    const other = await signUp('Öteki');
    const ali = await signUp('Ali');
    const ayse = await signUp('Ayşe');
    const can = await signUp('Can');
    const viewer = await signUp('Bakan');
    await topUp(ali.session, 5000);
    await topUp(ayse.session, 5000);
    const room = await open(owner.session);
    const room2 = await open(other.session);
    const gift = async (from, to, giftId, count, r) => {
      const [st, j] = await call('POST', '/api/gifts/send', { to: to.user.id, giftId, count, ...(r === undefined ? {} : { room: r }), ref: rnd(6) }, from.session);
      assert.equal(st, 200, j.error);
    };
    await gift(ali, owner, 'g4', 1, room); // 200, by the room's id
    await gift(ayse, can, 'g1', 1, `oda-${room}`); // 10, by its LiveKit name
    await gift(ayse, owner, 'g1', 5, room); // 50
    await gift(ali, owner, 'g4', 1); // outside any room: not counted
    await gift(ali, can, 'g4', 5, room2); // another room: not counted

    const sent = await board(viewer.session, room, 'sent');
    assert.deepEqual(pairs(sent), [
      [1, 'Ali', 200],
      [2, 'Ayşe', 60],
    ]);
    assert.equal(sent.rows[0].user.id, ali.user.id);
    assert.equal(sent.rows[0].user.avatarUrl, null);
    assert.deepEqual(sent.me, { rank: null, score: 0 });
    assert.deepEqual((await board(ayse.session, room, 'sent')).me, { rank: 2, score: 60 });

    const got = await board(owner.session, `oda-${room}`, 'received');
    assert.deepEqual(pairs(got), [
      [1, 'Sahip', 250],
      [2, 'Can', 10],
    ]);
    assert.deepEqual(got.me, { rank: 1, score: 250 });
    // The other room sees only its own gift.
    assert.deepEqual(pairs(await board(viewer.session, room2, 'received', 'week')), [[1, 'Can', 1000]]);

    // A tie: whoever got their first gift of the period earlier stays ahead.
    const dila = await signUp('Dila');
    await gift(ali, dila, 'g1', 1, room);
    assert.deepEqual(pairs(await board(viewer.session, room, 'received')).slice(1), [
      [2, 'Can', 10],
      [3, 'Dila', 10],
    ]);

    // A deleted account leaves the list.
    assert.equal((await call('DELETE', '/api/me', null, ayse.session))[1].deleted, true);
    assert.deepEqual(pairs(await board(viewer.session, room, 'sent')), [[1, 'Ali', 210]]);
  });

  test('saatlik, günlük, haftalık Türkiye saatiyle başlar; geçen haftanın hediyesi sayılmaz', async () => {
    const owner = await signUp('Sahip');
    const ali = await signUp('Ali');
    const can = await signUp('Can');
    await topUp(ali.session, 1000);
    const room = await open(owner.session);
    const send = async (giftId) => {
      const ref = rnd(6);
      assert.equal((await call('POST', '/api/gifts/send', { to: can.user.id, giftId, count: 1, room, ref }, ali.session))[0], 200);
      return ref;
    };
    await send('g1'); // 10, now
    const lastHour = await send('g4'); // 200, moved to just before this hour began
    const lastWeek = await send('g4'); // 200, moved to just before this week began
    const move = (ref, unit) =>
      q(`UPDATE gift_events SET created_at = date_trunc($3, now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}' - interval '1 second' WHERE sender = $1 AND ref = $2`, [ali.user.id, ref, unit]);
    await move(lastHour, 'hour');
    await move(lastWeek, 'week');

    // Each window starts on Istanbul's clock (UTC+3 all year): on the hour, at midnight, on Monday at midnight.
    const clock = (unit) => `to_char(date_trunc('${unit}', now() AT TIME ZONE '${TZ}'), 'YYYY-MM-DD"T"HH24:MI:SS')`;
    const starts = (await q(`SELECT ${clock('hour')} AS hour, ${clock('day')} AS day, ${clock('week')} AS week`))[0];
    const local = (iso) => new Date(Date.parse(iso) + 3 * 3600_000);
    const hour = await board(ali.session, room, 'sent', 'hour');
    const day = await board(ali.session, room, 'sent', 'day');
    const week = await board(ali.session, room, 'sent', 'week');
    for (const [j, unit] of [[hour, 'hour'], [day, 'day'], [week, 'week']]) assert.equal(local(j.since).toISOString().slice(0, 19), starts[unit]);
    assert.ok(starts.hour.endsWith(':00:00'));
    assert.ok(starts.day.endsWith('T00:00:00'));
    assert.equal(local(week.since).getUTCDay(), 1);

    // The gift from just before this hour counts for the day and the week only when that moment is still in them;
    // the one from last week never does.
    const prev = Date.parse(hour.since) - 1000;
    assert.deepEqual(hour.me, { rank: 1, score: 10 });
    assert.deepEqual(day.me, { rank: 1, score: prev >= Date.parse(day.since) ? 210 : 10 });
    assert.deepEqual(week.me, { rank: 1, score: prev >= Date.parse(week.since) ? 210 : 10 });
  });

  test('ilk 50 ve 50’nin altındaki yerim', async () => {
    const owner = await signUp('Sahip');
    const room = await open(owner.session);
    const people = [];
    for (let i = 0; i < 52; i++) people.push(await h.account(`Kişi ${i + 1}`));
    // 52 senders, the first gave the most; written straight to gift_events (the API's gifts are tested above).
    for (const [i, p] of people.entries()) {
      await q('INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, room, ref) VALUES ($1, $2, $3, 1, $4, $4, $5, $6)', [p.user.id, owner.user.id, 'g1', 1000 - i, room, rnd(6)]);
    }
    const j = await board(people[51].session, room, 'sent', 'week');
    assert.equal(j.rows.length, 50);
    assert.deepEqual(j.rows[0], { rank: 1, user: { id: people[0].user.id, name: 'Kişi 1', avatarUrl: null }, score: 1000 });
    assert.equal(j.rows[49].rank, 50);
    assert.deepEqual(j.me, { rank: 52, score: 949 });
    assert.deepEqual((await board(people[3].session, room, 'sent', 'week')).me, { rank: 4, score: 997 });
  });

  test('geçersiz istekler', async () => {
    const owner = await signUp('Sahip');
    const room = await open(owner.session);
    const get = async (qs, s = owner.session) => (await call('GET', `/api/rooms/contrib?${qs}`, null, s))[0];
    assert.equal(await get(`room=${room}`), 200); // sent, day by default
    assert.equal(await get(`room=${room}`, null), 401);
    assert.equal(await get('room=r1'), 400);
    assert.equal(await get(`room=${crypto.randomUUID()}`), 404);
    assert.equal(await get(`room=${room}&side=constructor`), 400);
    assert.equal(await get(`room=${room}&side=sender`), 400);
    assert.equal(await get(`room=${room}&period=month`), 400);
    // A closed room's list can still be read.
    assert.equal((await call('POST', '/api/rooms/close', { id: room }, owner.session))[0], 200);
    assert.equal(await get(`room=${room}&period=week`), 200);
  });
});
