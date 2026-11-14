// Verilerimin kopyası (Ayarlar › Verilerimin kopyasını iste): the UK GDPR right of access. Everything the server keeps
// about me, as one JSON document the app saves or shares as a file.
//
//   GET /api/me/export   → { format, generatedAt, notes, account, … }   (once in 24 hours: 429 with nextAt after that)
//
// Every table that holds my personal data is read here, in one read-only snapshot: profile and sign-in, sessions and
// devices, follows and blocks, the direct messages I sent and received, Anlar, gifts sent and received, Çantam, the wallet
// (ledger, coin lots, diamond locks, purchases, VIP subscriptions, Jeton Noktası transfers, withdrawals, shop items, paid 1v1 minutes),
// games, rooms, Etkinlik Merkezi (my events, places and the reminders sent to me), family, bonds, agency, visits, reports I made, sanctions on me and my appeals, support tickets, the
// spending limit and Similar Ekibi notices written to me.
// Other people appear only as I already see them in the app: their id and name where I deal with them (a message, a
// gift, a follow). Never what is private to them or to the staff: who blocked or reported me, who visited my profile
// without the Abonelik (as GET /api/me/visitors), staff notes and which staff member acted, the room password, or the hashes,
// codes and risk flags kept to keep accounts safe. Short-lived records (sign-in codes, the match queue, who is in a
// room right now) are not included; they are deleted within hours.
// my-data-tables.mjs lists the tables read here and why the others that point at an account are not (the test holds
// every such table to one of the two lists).
// Kept for this: only when I last asked (data_exports, for the once-a-day limit); it goes with the account.
import { HttpError, SANCTION_SELECT, auth, db, limit, profileOf, sanctionView, subActive } from './core.mjs';
import { spendLimitOf } from './spend-limit.mjs';
import { ticketsOf } from './support.mjs';
import { referralDataOf } from './referrals.mjs';

export const EXPORT_HOURS = 24;

const num = (v) => (v === null || v === undefined ? null : Number(v));
const person = (id, name) => (id ? { id, name: name ?? null } : null);
/** People I block, or who block me: left out of the follow lists, as in the app. */
const NOT_BLOCKED = (col) => `NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = ${col}) OR (b.blocker = ${col} AND b.blocked = $1))`;

/** Everything about `uid`, read through `c` (one snapshot). */
export async function exportOf(c, uid) {
  const all = async (sql, map = (x) => x) => (await c.query(sql, [uid])).rows.map(map);
  const u = (await c.query('SELECT * FROM users WHERE id = $1', [uid])).rows[0];

  const account = {
    id: u.id,
    name: u.name,
    ...profileOf(u),
    birthDate: u.birth_date ? new Date(u.birth_date).toISOString().slice(0, 10) : null,
    phone: u.phone ?? null,
    role: u.role,
    createdAt: u.created_at,
    balances: { coins: num(u.coins), diamonds: num(u.diamonds), gameCoins: num(u.game_coins) },
    svipXp: num(u.svip_xp),
    roomXp: num(u.room_xp),
    bondsHidden: u.bonds_hidden ?? false,
    equipped: u.equipped ?? {},
  };

  const signIn = await all('SELECT provider, subject, email, created_at, last_used_at FROM auth_identities WHERE user_id = $1 ORDER BY created_at', (x) => ({
    provider: x.provider,
    subject: x.subject,
    email: x.email ?? null,
    createdAt: x.created_at,
    lastUsedAt: x.last_used_at,
  }));
  const sessions = await all('SELECT device, scope, created_at, last_seen_at, expires_at FROM sessions WHERE user_id = $1 ORDER BY created_at', (x) => ({
    device: x.device,
    scope: x.scope,
    createdAt: x.created_at,
    lastSeenAt: x.last_seen_at,
    expiresAt: x.expires_at,
  }));
  const devices = await all(
    `SELECT d.platform, d.model, d.os_version, d.app_version, a.first_seen_at, a.last_seen_at
       FROM device_accounts a JOIN device_registry d ON d.id = a.device_id WHERE a.user_id = $1 ORDER BY a.first_seen_at`,
    (x) => ({ platform: x.platform, model: x.model, osVersion: x.os_version, appVersion: x.app_version, firstSeenAt: x.first_seen_at, lastSeenAt: x.last_seen_at }),
  );
  const pushTokens = await all('SELECT platform, kind, updated_at FROM push_tokens WHERE user_id = $1', (x) => ({ platform: x.platform, kind: x.kind, updatedAt: x.updated_at }));

  const following = await all(
    `SELECT u.id, u.name, f.created_at FROM follows f JOIN users u ON u.id = f.followee WHERE f.follower = $1 AND u.deleted_at IS NULL AND ${NOT_BLOCKED('u.id')} ORDER BY f.created_at`,
    (x) => ({ ...person(x.id, x.name), since: x.created_at }),
  );
  const followers = await all(
    `SELECT u.id, u.name, f.created_at FROM follows f JOIN users u ON u.id = f.follower WHERE f.followee = $1 AND u.deleted_at IS NULL AND ${NOT_BLOCKED('u.id')} ORDER BY f.created_at`,
    (x) => ({ ...person(x.id, x.name), since: x.created_at }),
  );
  const blocked = await all('SELECT u.id, u.name, b.created_at FROM blocks b JOIN users u ON u.id = b.blocked WHERE b.blocker = $1 ORDER BY b.created_at', (x) => ({
    ...person(x.id, x.name),
    since: x.created_at,
  }));

  const messages = await all(
    `SELECT m.id, m.sender, m.recipient, m.body, m.image_url, m.event_id, m.created_at, m.read_at, o.id AS other, o.name AS other_name
       FROM messages m JOIN users o ON o.id = CASE WHEN m.sender = $1 THEN m.recipient ELSE m.sender END
      WHERE m.sender = $1 OR m.recipient = $1 ORDER BY m.id`,
    (x) => ({
      id: num(x.id),
      direction: x.sender === uid ? 'sent' : 'received',
      with: person(x.other, x.other_name),
      text: x.body,
      image: x.image_url ?? null,
      // An event sent with it (Etkinlik Merkezi "Arkadaşına gönder").
      event: num(x.event_id),
      createdAt: x.created_at,
      readAt: x.read_at,
    }),
  );

  const moments = {
    posts: await all('SELECT id, body, image_url, topic, created_at, deleted_at FROM moments WHERE author = $1 ORDER BY id', (x) => ({
      id: num(x.id),
      text: x.body,
      image: x.image_url ?? null,
      topic: x.topic ?? null,
      createdAt: x.created_at,
      deletedAt: x.deleted_at,
    })),
    comments: await all('SELECT id, moment, body, created_at, deleted_at FROM moment_comments WHERE author = $1 ORDER BY id', (x) => ({
      id: num(x.id),
      moment: num(x.moment),
      text: x.body,
      createdAt: x.created_at,
      deletedAt: x.deleted_at,
    })),
    likes: await all('SELECT moment, created_at FROM moment_likes WHERE user_id = $1 ORDER BY created_at', (x) => ({ moment: num(x.moment), at: x.created_at })),
    commentLikes: await all('SELECT comment, created_at FROM moment_comment_likes WHERE user_id = $1 ORDER BY created_at', (x) => ({ comment: num(x.comment), at: x.created_at })),
  };

  const gift = (x) => ({ id: num(x.id), giftId: x.gift_id, count: x.count, unitPrice: num(x.unit_price), total: num(x.total), place: x.place ?? null, room: x.room ?? null, at: x.created_at });
  const gifts = {
    sent: await all('SELECT g.*, u.name AS other_name FROM gift_events g JOIN users u ON u.id = g.recipient WHERE g.sender = $1 ORDER BY g.id', (x) => ({
      ...gift(x),
      to: person(x.recipient, x.other_name),
    })),
    received: await all('SELECT g.*, u.name AS other_name FROM gift_events g JOIN users u ON u.id = g.sender WHERE g.recipient = $1 ORDER BY g.id', (x) => ({
      ...gift(x),
      from: person(x.sender, x.other_name),
    })),
  };

  // Çantam (backpack.mjs): what is in it, and each gift that came in (with its reward) or went out (its gift event).
  const backpack = {
    items: await all('SELECT gift_id, count, updated_at FROM backpack_items WHERE user_id = $1 ORDER BY gift_id', (x) => ({ giftId: x.gift_id, count: x.count, at: x.updated_at })),
    moves: await all('SELECT id, gift_id, delta, source, gift_event, created_at FROM backpack_moves WHERE user_id = $1 ORDER BY id', (x) => ({
      id: num(x.id),
      giftId: x.gift_id,
      change: x.delta,
      source: x.source,
      giftEvent: num(x.gift_event),
      at: x.created_at,
    })),
  };

  const wallet = {
    ledger: await all('SELECT id, currency, amount, balance, reason, channel, counterparty, created_at FROM ledger WHERE user_id = $1 ORDER BY id', (x) => ({
      id: num(x.id),
      currency: x.currency,
      amount: num(x.amount),
      balance: num(x.balance),
      reason: x.reason,
      channel: x.channel ?? null,
      counterparty: x.counterparty ?? null,
      at: x.created_at,
    })),
    coinLots: await all('SELECT id, channel, amount, remaining, lock_hours, source_user, created_at FROM coin_lots WHERE user_id = $1 ORDER BY id', (x) => ({
      id: num(x.id),
      channel: x.channel,
      amount: num(x.amount),
      remaining: num(x.remaining),
      lockHours: x.lock_hours,
      from: x.source_user ?? null,
      at: x.created_at,
    })),
    diamondLocks: await all('SELECT id, amount, channel, unlock_at, status, sender, created_at FROM diamond_locks WHERE user_id = $1 ORDER BY id', (x) => ({
      id: num(x.id),
      amount: num(x.amount),
      channel: x.channel,
      unlockAt: x.unlock_at,
      status: x.status,
      from: x.sender ?? null,
      at: x.created_at,
    })),
    purchases: await all('SELECT id, platform, product_id, transaction_id, coins, bonus, campaign_bonus, status, sandbox, created_at FROM purchases WHERE user_id = $1 ORDER BY id', (x) => ({
      id: num(x.id),
      platform: x.platform,
      productId: x.product_id,
      transactionId: x.transaction_id,
      coins: num(x.coins),
      bonus: num(x.bonus),
      campaignBonus: num(x.campaign_bonus),
      status: x.status,
      sandbox: x.sandbox,
      at: x.created_at,
    })),
    // Abonelik (vip.mjs): the store's order number, not the purchase token (that one only the store and this server use).
    vipSubscriptions: await all('SELECT id, platform, product_id, order_id, expires_at, auto_renewing, state, test, created_at FROM vip_subscriptions WHERE user_id = $1 ORDER BY id', (x) => ({
      id: num(x.id),
      platform: x.platform,
      productId: x.product_id,
      orderId: x.order_id ?? null,
      until: x.expires_at,
      autoRenewing: x.auto_renewing,
      state: x.state,
      test: x.test,
      at: x.created_at,
    })),
    // Jeton Noktası: the reference, note and address only on transfers I made myself.
    transfers: await all(
      `SELECT t.*, o.name AS other_name FROM coin_transfers t LEFT JOIN users o ON o.id = CASE WHEN t.from_user = $1 THEN t.to_user ELSE t.from_user END
        WHERE t.from_user = $1 OR t.to_user = $1 ORDER BY t.id`,
      (x) => ({
        id: num(x.id),
        kind: x.kind,
        direction: x.from_user === uid ? 'out' : 'in',
        with: person(x.from_user === uid ? x.to_user : x.from_user, x.other_name),
        coins: num(x.coins),
        diamonds: num(x.diamonds),
        valueTl: num(x.value_tl),
        ...(x.actor === uid ? { paymentRef: x.payment_ref ?? null, note: x.note ?? null, ip: x.ip ?? null } : {}),
        at: x.created_at,
      }),
    ),
    withdrawals: await all('SELECT id, diamonds, usd, method, holder, account, status, note, ip, created_at, decided_at FROM withdrawals WHERE user_id = $1 ORDER BY id', (x) => ({
      id: num(x.id),
      diamonds: num(x.diamonds),
      usd: num(x.usd),
      method: x.method,
      holder: x.holder,
      account: x.account,
      status: x.status,
      note: x.note ?? null,
      ip: x.ip ?? null,
      at: x.created_at,
      decidedAt: x.decided_at,
    })),
    shopItems: await all('SELECT sku, kind, tier, price, starts_at, ends_at, source, revoked_at, revoked_why, created_at FROM entitlements WHERE user_id = $1 ORDER BY id', (x) => ({
      sku: x.sku,
      kind: x.kind,
      tier: x.tier,
      price: num(x.price),
      startsAt: x.starts_at,
      endsAt: x.ends_at,
      source: x.source,
      revokedAt: x.revoked_at,
      revokedWhy: x.revoked_why ?? null,
      at: x.created_at,
    })),
    paidOneOnOne: await all(
      `SELECT p.kind, p.coins, p.payer, p.earner, p.created_at, o.id AS other, o.name AS other_name
         FROM paid_events p LEFT JOIN users o ON o.id = CASE WHEN p.payer = $1 THEN p.earner ELSE p.payer END
        WHERE p.payer = $1 OR p.earner = $1 ORDER BY p.id`,
      (x) => ({ kind: x.kind, coins: num(x.coins), role: x.payer === uid ? 'paid' : 'earned', with: person(x.other, x.other_name), at: x.created_at }),
    ),
    income: await all('SELECT source_type, diamonds, occurred_at FROM income_events WHERE streamer_id = $1 ORDER BY id', (x) => ({
      source: x.source_type,
      diamonds: num(x.diamonds),
      at: x.occurred_at,
    })),
    spendLimit: await spendLimitOf(c, uid),
  };

  const calls = await all(
    `SELECT k.*, o.name AS other_name FROM calls k JOIN users o ON o.id = CASE WHEN k.caller = $1 THEN k.callee ELSE k.caller END
      WHERE k.caller = $1 OR k.callee = $1 ORDER BY k.id`,
    (x) => ({
      id: num(x.id),
      kind: x.kind,
      mode: x.mode,
      direction: x.caller === uid ? 'out' : 'in',
      with: person(x.caller === uid ? x.callee : x.caller, x.other_name),
      status: x.status,
      endReason: x.end_reason ?? null,
      iPaid: x.payer === uid,
      minutes: x.minutes,
      coins: num(x.coins),
      createdAt: x.created_at,
      startedAt: x.started_at,
      endedAt: x.ended_at,
    }),
  );

  const games = {
    wheel: await all('SELECT tier, spins, cost, from_game, payout, jackpot, created_at FROM wheel_spins WHERE user_id = $1 ORDER BY id', (x) => ({
      tier: x.tier,
      spins: x.spins,
      cost: num(x.cost),
      fromGameCoins: num(x.from_game),
      payout: num(x.payout),
      jackpot: num(x.jackpot),
      at: x.created_at,
    })),
    // Oyun Salonu rounds (casino.mjs): the game, the stake, what it paid and what came up.
    casino: await all('SELECT game, bet, from_game, payout, jackpot, pick, bets, place, detail, created_at FROM casino_rounds WHERE user_id = $1 ORDER BY id', (x) => ({
      game: x.game,
      bet: num(x.bet),
      fromGameCoins: num(x.from_game),
      payout: num(x.payout),
      jackpot: num(x.jackpot),
      pick: x.pick ?? null,
      bets: x.bets ?? null,
      place: x.place,
      detail: x.detail,
      at: x.created_at,
    })),
    luckyGifts: await all('SELECT gift_id, room, count, recipients, cost, shared, payout, created_at FROM lucky_sends WHERE user_id = $1 ORDER BY id', (x) => ({
      giftId: x.gift_id,
      room: x.room ?? null,
      count: x.count,
      to: x.recipients,
      cost: num(x.cost),
      shared: num(x.shared),
      payout: num(x.payout),
      at: x.created_at,
    })),
    luckyBags: await all('SELECT id, room, kind, gift_id, unit_price, units, packets, status, returned, created_at FROM lucky_bags WHERE sender = $1 ORDER BY id', (x) => ({
      id: num(x.id),
      room: x.room,
      kind: x.kind,
      giftId: x.gift_id ?? null,
      unitPrice: x.unit_price,
      units: x.units,
      packets: x.packets,
      status: x.status,
      returned: x.returned,
      at: x.created_at,
    })),
    luckyBagGrabs: await all('SELECT bag_id, units, coins, created_at FROM lucky_bag_grabs WHERE user_id = $1 ORDER BY created_at', (x) => ({
      bag: num(x.bag_id),
      units: x.units,
      coins: x.coins,
      at: x.created_at,
    })),
    luckyBagEntries: await all('SELECT bag_id, created_at FROM lucky_bag_entries WHERE user_id = $1 ORDER BY created_at', (x) => ({ bag: num(x.bag_id), at: x.created_at })),
  };

  const rooms = {
    owned: await all('SELECT id, title, announcement, room_type, theme, bg_id, cover_url, created_at, closed_at FROM rooms WHERE owner = $1 ORDER BY created_at', (x) => ({
      id: x.id,
      title: x.title,
      announcement: x.announcement ?? '',
      type: x.room_type,
      theme: x.theme ?? null,
      // Oda süslemesi and Oda kapağı (room-decor.mjs): the free background and the uploaded card picture.
      background: x.bg_id ?? null,
      coverUrl: x.cover_url ?? null,
      createdAt: x.created_at,
      closedAt: x.closed_at,
    })),
    // What my room shows over the free background, my own picture and the term I paid for (room-decor.mjs).
    decoration: await all('SELECT pick, custom_url, custom_until, custom_paid_at, custom_price, custom_removed_at FROM room_decor WHERE owner = $1', (x) => ({
      showing: x.pick ?? null,
      customUrl: x.custom_url ?? null,
      customUntil: x.custom_until,
      customPaidAt: x.custom_paid_at,
      customPrice: num(x.custom_price),
      customRemovedByStaffAt: x.custom_removed_at,
    })),
    admin: await all('SELECT room_id, super FROM room_admins WHERE user_id = $1', (x) => ({ room: x.room_id, super: x.super })),
    dj: await all('SELECT room_id, created_at FROM room_djs WHERE user_id = $1', (x) => ({ room: x.room_id, since: x.created_at })),
    member: await all('SELECT room_id, status, created_at FROM room_members WHERE user_id = $1', (x) => ({ room: x.room_id, status: x.status, since: x.created_at })),
    bannedFrom: await all('SELECT room_id, until, created_at FROM room_bans WHERE user_id = $1', (x) => ({ room: x.room_id, until: x.until, at: x.created_at })),
    visits: await all('SELECT room, joined_at, left_at, seconds FROM presence_log WHERE user_id = $1 ORDER BY id', (x) => ({
      room: x.room,
      joinedAt: x.joined_at,
      leftAt: x.left_at,
      seconds: x.seconds,
    })),
    animations: await all('SELECT room, animation_id, price, created_at FROM room_animations WHERE sender = $1 ORDER BY id', (x) => ({
      room: x.room,
      animation: x.animation_id,
      price: x.price,
      at: x.created_at,
    })),
    events: await all('SELECT room_id, title, description, when_text, kind, cancelled_at, created_at FROM room_events WHERE creator = $1 ORDER BY id', (x) => ({
      room: x.room_id,
      title: x.title,
      description: x.description,
      when: x.when_text,
      kind: x.kind,
      cancelledAt: x.cancelled_at,
      at: x.created_at,
    })),
    eventsGoing: await all('SELECT event_id, created_at FROM room_event_going WHERE user_id = $1', (x) => ({ event: num(x.event_id), at: x.created_at })),
    // Etkinlik Merkezi (events.mjs): the events I applied for, my places and the ones I came to.
    centreEvents: await all('SELECT id, room_id, category, title, description, rules, cover_url, starts_at, ends_at, status, reject_reason, started_at, ended_at, created_at FROM events WHERE created_by = $1 ORDER BY id', (x) => ({
      id: num(x.id),
      room: x.room_id,
      category: x.category,
      title: x.title,
      description: x.description,
      rules: x.rules,
      cover: x.cover_url,
      startsAt: x.starts_at,
      endsAt: x.ends_at,
      status: x.status,
      rejectReason: x.reject_reason,
      startedAt: x.started_at,
      endedAt: x.ended_at,
      at: x.created_at,
    })),
    eventReservations: await all('SELECT event_id, status, remind, created_at, updated_at FROM event_reservations WHERE user_id = $1 ORDER BY created_at', (x) => ({
      event: num(x.event_id),
      status: x.status,
      reminders: x.remind,
      at: x.created_at,
      changedAt: x.updated_at,
    })),
    eventsAttended: await all('SELECT event_id, joined_at FROM event_participants WHERE user_id = $1 ORDER BY joined_at', (x) => ({ event: num(x.event_id), at: x.joined_at })),
    // The reminders sent to me, and whether I turned every event reminder off (Ayarlar › Bildirimler).
    eventReminders: await all('SELECT event_id, kind, starts_at, sent_at FROM event_reminders_sent WHERE user_id = $1 ORDER BY sent_at', (x) => ({ event: num(x.event_id), kind: x.kind, eventStart: x.starts_at, at: x.sent_at })),
    eventRemindersOff: await all('SELECT created_at FROM event_reminder_optout WHERE user_id = $1', (x) => ({ since: x.created_at })),
    music: await all('SELECT title, artist, url, seconds, size, created_at, removed_at FROM music_tracks WHERE owner = $1 ORDER BY id', (x) => ({
      title: x.title,
      artist: x.artist,
      url: x.url,
      seconds: x.seconds,
      size: x.size,
      at: x.created_at,
      removedAt: x.removed_at,
    })),
  };

  const family = {
    membership: await all('SELECT f.id, f.name, m.role, m.joined_at FROM family_members m JOIN families f ON f.id = m.family_id WHERE m.user_id = $1', (x) => ({
      family: { id: num(x.id), name: x.name },
      role: x.role,
      since: x.joined_at,
    })),
    led: await all('SELECT id, name, tag, announcement, created_at, closed_at FROM families WHERE leader = $1 ORDER BY id', (x) => ({
      id: num(x.id),
      name: x.name,
      tag: x.tag ?? null,
      announcement: x.announcement ?? '',
      createdAt: x.created_at,
      closedAt: x.closed_at,
    })),
    requests: await all('SELECT family_id, created_at FROM family_requests WHERE user_id = $1', (x) => ({ family: num(x.family_id), at: x.created_at })),
    invites: await all('SELECT i.family_id, i.invited_by, u.name, i.created_at FROM family_invites i LEFT JOIN users u ON u.id = i.invited_by WHERE i.user_id = $1', (x) => ({
      family: num(x.family_id),
      by: person(x.invited_by, x.name),
      at: x.created_at,
    })),
    messages: await all('SELECT family_id, body, created_at FROM family_messages WHERE author = $1 ORDER BY id', (x) => ({ family: num(x.family_id), text: x.body, at: x.created_at })),
    checkins: await all('SELECT family_id, day FROM family_checkins WHERE user_id = $1 ORDER BY day', (x) => ({ family: num(x.family_id), day: x.day })),
    chests: await all('SELECT family_id, week, chest, coins, created_at FROM family_chest_claims WHERE user_id = $1 ORDER BY created_at', (x) => ({
      family: num(x.family_id),
      week: x.week,
      chest: x.chest,
      coins: x.coins,
      at: x.created_at,
    })),
  };

  const bonds = await all(
    `SELECT b.*, o.name AS other_name, o.id AS other FROM bonds b JOIN users o ON o.id = CASE WHEN b.a = $1 THEN b.b ELSE b.a END
      WHERE b.a = $1 OR b.b = $1 ORDER BY b.id`,
    (x) => ({
      id: num(x.id),
      kind: x.kind,
      status: x.status,
      requester: x.a === uid,
      with: person(x.other, x.other_name),
      giftCoins: num(x.gift_coins),
      talkPoints: x.talk_points,
      createdAt: x.created_at,
      acceptedAt: x.accepted_at,
      endedAt: x.ended_at,
    }),
  );

  const agency = {
    streamer: await all(
      'SELECT a.id, a.name, s.method, s.contract, s.joined_at, s.ended_at, s.end_reason FROM agency_streamers s JOIN agencies a ON a.id = s.agency_id WHERE s.streamer_id = $1 ORDER BY s.id',
      (x) => ({ agency: { id: x.id, name: x.name }, method: x.method, contract: x.contract, joinedAt: x.joined_at, endedAt: x.ended_at, endReason: x.end_reason ?? null }),
    ),
    // What I wrote in agency groups (agency-chat.mjs).
    messages: await all('SELECT a.name, m.body, m.created_at FROM agency_messages m JOIN agencies a ON a.id = m.agency_id WHERE m.author = $1 ORDER BY m.id', (x) => ({ agency: x.name, text: x.body, at: x.created_at })),
    requests: await all('SELECT r.kind, r.method, r.note, r.status, r.created_at, r.decided_at, a.name FROM agency_requests r JOIN agencies a ON a.id = r.agency_id WHERE r.user_id = $1 ORDER BY r.id', (x) => ({
      agency: x.name,
      kind: x.kind,
      method: x.method,
      note: x.note ?? null,
      status: x.status,
      at: x.created_at,
      decidedAt: x.decided_at,
    })),
    transfers: await all(
      `SELECT t.kind, t.status, t.reason, t.created_at, t.decided_at, f.name AS from_name, o.name AS to_name
         FROM agency_transfers t LEFT JOIN agencies f ON f.id = t.from_agency_id LEFT JOIN agencies o ON o.id = t.to_agency_id
        WHERE t.streamer_id = $1 ORDER BY t.id`,
      (x) => ({ kind: x.kind, status: x.status, from: x.from_name ?? null, to: x.to_name ?? null, reason: x.reason, at: x.created_at, decidedAt: x.decided_at }),
    ),
    owned: await all(
      'SELECT id, code, name, status, country, region, contact_name, contact_phone, contact_email, description, created_at, approved_at, closed_at FROM agencies WHERE owner_id = $1 ORDER BY created_at',
      (x) => ({
        id: x.id,
        code: x.code,
        name: x.name,
        status: x.status,
        country: x.country,
        region: x.region,
        contact: { name: x.contact_name, phone: x.contact_phone, email: x.contact_email },
        description: x.description ?? '',
        createdAt: x.created_at,
        approvedAt: x.approved_at,
        closedAt: x.closed_at,
      }),
    ),
    // My agency assistant roles and the shares they gave me (agency-assistants.mjs).
    assistant: await all(
      'SELECT a.name, x.code, x.assigned_at, x.ended_at, x.end_reason FROM agency_assistants x JOIN agencies a ON a.id = x.agency_id WHERE x.user_id = $1 ORDER BY x.id',
      (x) => ({ agency: x.name, code: x.code, assignedAt: x.assigned_at, endedAt: x.ended_at, endReason: x.end_reason ?? null }),
    ),
    assistantShares: await all('SELECT l.amount, l.wallet, l.pct, l.period, l.created_at FROM agency_assistant_ledger l WHERE l.user_id = $1 ORDER BY l.id', (x) => ({
      diamonds: Number(x.amount),
      toWallet: Number(x.wallet),
      pct: x.pct,
      period: x.period,
      at: x.created_at,
    })),
  };

  // Who opened my profile: as GET /api/me/visitors shows it (the count for everyone, the people with the Abonelik).
  const vip = subActive(u);
  const visitorRows = await all(
    `SELECT v.visitor_id, u.name, v.visits, v.last_at FROM profile_visits v JOIN users u ON u.id = v.visitor_id
      WHERE v.owner_id = $1 AND v.last_at > now() - interval '7 days' AND u.deleted_at IS NULL AND ${NOT_BLOCKED('v.visitor_id')} ORDER BY v.last_at DESC`,
  );
  const visits = {
    made: await all('SELECT v.owner_id, u.name, v.visits, v.last_at FROM profile_visits v JOIN users u ON u.id = v.owner_id WHERE v.visitor_id = $1 ORDER BY v.last_at DESC', (x) => ({
      profile: person(x.owner_id, x.name),
      visits: x.visits,
      lastAt: x.last_at,
    })),
    visitorsLast7Days: visitorRows.length,
    visitors: vip ? visitorRows.map((x) => ({ ...person(x.visitor_id, x.name), visits: x.visits, lastAt: x.last_at })) : null,
  };

  const safety = {
    reportsMade: await all('SELECT target_type, target_id, reason, note, status, created_at, handled_at FROM reports WHERE reporter = $1 ORDER BY id', (x) => ({
      type: x.target_type,
      target: x.target_id,
      reason: x.reason,
      note: x.note ?? '',
      status: x.status,
      at: x.created_at,
      handledAt: x.handled_at,
    })),
    // What the app shows of a sanction (core.mjs sanctionView): never the staff's notes or who they were.
    sanctions: await all(`${SANCTION_SELECT} WHERE s.user_id = $1 ORDER BY s.id`, sanctionView),
    appeals: await all('SELECT sanction_id, body, status, decision_note, created_at, decided_at FROM sanction_appeals WHERE user_id = $1 ORDER BY id', (x) => ({
      sanction: num(x.sanction_id),
      text: x.body,
      status: x.status,
      decision: x.status === 'open' ? null : (x.decision_note ?? null),
      at: x.created_at,
      decidedAt: x.decided_at,
    })),
    contactFilterRefusals: await all('SELECT category, place, created_at FROM contact_refusals WHERE user_id = $1 ORDER BY id', (x) => ({ category: x.category, place: x.place, at: x.created_at })),
  };

  const notices = await all('SELECT kind, title, body, link, created_at, removed_at FROM team_notices WHERE target = $1 ORDER BY id', (x) => ({
    kind: x.kind,
    title: x.title,
    text: x.body,
    link: x.link ?? null,
    at: x.created_at,
    removedAt: x.removed_at,
  }));
  const seenUpTo = (await c.query('SELECT last_id FROM team_notice_seen WHERE user_id = $1', [uid])).rows[0]?.last_id ?? null;
  const lastExport = (await c.query('SELECT last_at FROM data_exports WHERE user_id = $1', [uid])).rows[0]?.last_at ?? null;

  // Profile extras and the album (profiles.mjs), the Gizlilik choices and the call-history mark (privacy.mjs,
  // call-log.mjs), and the room invites and polls I took part in (room-social.mjs).
  const profileMore = {
    extras: (await all('SELECT height_cm, weight_kg, job, languages, zodiac, tags, relationship, education, slogan, country, updated_at FROM profile_extras WHERE user_id = $1'))[0] ?? null,
    album: await all('SELECT url, created_at FROM profile_photos WHERE user_id = $1 ORDER BY id', (x) => ({ url: x.url, at: x.created_at })),
  };
  const privacy = {
    settings: (await all('SELECT profile_public, show_online, show_last_seen, show_current_room, dm_from, calls_from, invites_from, updated_at FROM privacy_settings WHERE user_id = $1'))[0] ?? null,
    callHistoryClearedAt: (await all('SELECT cleared_at FROM call_history_cleared WHERE user_id = $1'))[0]?.cleared_at ?? null,
  };
  const roomSocial = {
    micInvitesSent: await all('SELECT room_id, to_user, seat, status, created_at, answered_at FROM room_mic_invites WHERE from_user = $1 ORDER BY id', (x) => ({
      room: x.room_id, to: x.to_user, seat: x.seat, status: x.status, at: x.created_at, answeredAt: x.answered_at,
    })),
    micInvitesReceived: await all('SELECT room_id, from_user, seat, status, created_at, answered_at FROM room_mic_invites WHERE to_user = $1 ORDER BY id', (x) => ({
      room: x.room_id, from: x.from_user, seat: x.seat, status: x.status, at: x.created_at, answeredAt: x.answered_at,
    })),
    pollsStarted: await all('SELECT room_id, question, options, ends_at, closed_at, created_at FROM room_polls WHERE creator = $1 ORDER BY id', (x) => ({
      room: x.room_id, question: x.question, options: x.options, endsAt: x.ends_at, closedAt: x.closed_at, at: x.created_at,
    })),
    pollVotes: await all('SELECT p.question, p.options, v.option, v.created_at FROM room_poll_votes v JOIN room_polls p ON p.id = v.poll_id WHERE v.user_id = $1 ORDER BY v.created_at', (x) => ({
      question: x.question, answer: x.options[x.option] ?? null, at: x.created_at,
    })),
    followerInvitesSent: await all('SELECT room_id, recipients, created_at FROM room_follower_invites WHERE sent_by = $1 OR owner_id = $1 ORDER BY id', (x) => ({
      room: x.room_id, recipients: x.recipients, at: x.created_at,
    })),
    // Following rooms (room-follow.mjs): a follow is on the room's account, so it is named by its owner.
    roomsFollowed: await all(
      `SELECT u.id, u.name, f.created_at FROM room_follows f JOIN users u ON u.id = f.owner_id WHERE f.user_id = $1 AND u.deleted_at IS NULL AND ${NOT_BLOCKED('u.id')} ORDER BY f.created_at`,
      (x) => ({ roomOf: person(x.id, x.name), since: x.created_at }),
    ),
    roomFollowers: await all(
      `SELECT u.id, u.name, f.created_at FROM room_follows f JOIN users u ON u.id = f.user_id WHERE f.owner_id = $1 AND u.deleted_at IS NULL AND ${NOT_BLOCKED('u.id')} ORDER BY f.created_at`,
      (x) => ({ ...person(x.id, x.name), since: x.created_at }),
    ),
    roomOpenNotices: await all('SELECT room_id, recipients, created_at FROM room_open_notices WHERE owner_id = $1 ORDER BY id', (x) => ({
      room: x.room_id, recipients: x.recipients, at: x.created_at,
    })),
  };

  return {
    account,
    signIn,
    sessions,
    devices,
    pushTokens,
    follows: { following, followers },
    blocked,
    messages,
    moments,
    gifts,
    backpack,
    wallet,
    calls,
    games,
    rooms,
    family,
    bonds,
    agency,
    visits,
    profileMore,
    privacy,
    roomSocial,
    safety,
    support: await ticketsOf(c, uid),
    // Arkadaşını Getir: my code, whose code I entered, and who entered mine.
    referrals: await referralDataOf(c, uid),
    notices,
    noticesSeenUpTo: num(seenUpTo),
    previousExport: lastExport,
  };
}

export const myDataRoutes = {
  async 'GET /api/me/export'(req) {
    const me = await auth(req);
    limit(`export:${me.id}`, 3, 'Çok sık istedin, biraz bekle');
    const last = (await db.query(`SELECT last_at, last_at + make_interval(hours => ${EXPORT_HOURS}) AS next_at, last_at > now() - make_interval(hours => ${EXPORT_HOURS}) AS recent FROM data_exports WHERE user_id = $1`, [me.id])).rows[0];
    if (last?.recent) {
      throw Object.assign(new HttpError(429, `Verilerinin kopyasını 24 saatte bir alabilirsin. Bir sonraki: ${new Date(last.next_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`), {
        extra: { code: 'export_wait', nextAt: last.next_at },
      });
    }
    // One consistent snapshot of every table, read only.
    const c = await db.connect();
    let data;
    try {
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      data = await exportOf(c, me.id);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
    // Counted once the copy is ready, so a failed read doesn't use up the day.
    await db.query('INSERT INTO data_exports (user_id, last_at) VALUES ($1, now()) ON CONFLICT (user_id) DO UPDATE SET last_at = now()', [me.id]);
    return {
      format: 'similar-verilerim-1',
      generatedAt: new Date().toISOString(),
      notes: [
        'Bu dosya, Similar Club sunucusunda hesabınla ilgili tutulan kişisel verilerin kopyasıdır (UK GDPR, veri erişim hakkı).',
        'Diğer kişiler yalnızca uygulamada zaten gördüğün kadarıyla yer alır (kimlik ve ad).',
        'Tarihler UTC saatiyle, jeton ve elmas tutarları tam sayı olarak verilmiştir.',
      ],
      ...data,
    };
  },
};
