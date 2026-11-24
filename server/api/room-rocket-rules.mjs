// Oda roketi's rules (room-rocket.mjs, docs/ODA_ROKETI.md), pure so the tests run them on their own: the levels'
// goals and prizes and their check, which levels a day's coins have filled, how a gift's coins split over the levels
// it crosses, and the draw of a launch's prizes among the people who filled the level.

export const ROCKET_LEVELS = 5;
/** Prize kinds: coins (normal ones, as Şanslı hediye pays), or a shop item for some days. */
export const PRIZE_KINDS = Object.freeze(['coins', 'item']);
/** The shop's kinds a prize may be: what someone wears for some days. */
export const PRIZE_ITEM_KINDS = Object.freeze(['frame', 'entry', 'ride', 'bubble', 'wave']);
/** The rules the panel shows and every save checks. */
export const ROCKET_LIMITS = Object.freeze({
  levels: ROCKET_LEVELS,
  goalMin: 1_000,
  goalMax: 100_000_000,
  prizesMax: 6,
  winnersMax: 50,
  coinsMax: 1_000_000,
  daysMax: 30,
});

/**
 * Until the panel saves its own: off (the owners switch it on in the panel: its prizes are drawn by chance), goals
 * that grow level by level, coins for five people at each launch and one shop item on the shelf.
 */
export const DEFAULT_ROCKET = Object.freeze({
  enabled: false,
  levels: [
    { goal: 10_000, prizes: [{ kind: 'item', sku: 'fr-neon', days: 1, winners: 1 }, { kind: 'coins', amount: 300, winners: 5 }] },
    { goal: 30_000, prizes: [{ kind: 'item', sku: 'bb-galaxy', days: 3, winners: 1 }, { kind: 'coins', amount: 500, winners: 5 }] },
    { goal: 80_000, prizes: [{ kind: 'item', sku: 'fr-aurora', days: 3, winners: 1 }, { kind: 'coins', amount: 1_000, winners: 5 }] },
    { goal: 200_000, prizes: [{ kind: 'item', sku: 'rd-sport', days: 3, winners: 1 }, { kind: 'coins', amount: 2_000, winners: 5 }] },
    { goal: 500_000, prizes: [{ kind: 'item', sku: 'en-dragon', days: 3, winners: 1 }, { kind: 'coins', amount: 4_000, winners: 5 }] },
  ],
});

class RocketError extends Error {}
const bad = (message) => new RocketError(message);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const whole = (v, min, max) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max ? v : null);
const fmt = (n) => n.toLocaleString('tr-TR');

/**
 * The rocket's settings as the panel sent them, checked: on or off, five levels each with a goal and its prizes (in
 * the order they are drawn). `itemOf(sku)`: the shop item a prize names (on the shelf now), or undefined. Throws a
 * RocketError whose message says what to fix.
 */
export function checkRocket(v, itemOf) {
  const o = obj(v);
  if (!o) throw bad('Roket ayarları geçersiz');
  if (typeof o.enabled !== 'boolean') throw bad('Roket açık mı kapalı mı seçilmeli');
  const L = ROCKET_LIMITS;
  if (!Array.isArray(o.levels) || o.levels.length !== L.levels) throw bad(`Roketin ${L.levels} seviyesi olmalı`);
  const levels = o.levels.map((raw, i) => {
    const n = i + 1;
    const l = obj(raw);
    if (!l) throw bad(`Lv.${n} geçersiz`);
    const goal = whole(l.goal, L.goalMin, L.goalMax);
    if (goal === null) throw bad(`Lv.${n}: hedef ${fmt(L.goalMin)}–${fmt(L.goalMax)} jeton arasında tam sayı olmalı`);
    if (!Array.isArray(l.prizes) || l.prizes.length > L.prizesMax) throw bad(`Lv.${n}: en çok ${L.prizesMax} ödül olabilir`);
    const prizes = l.prizes.map((rp, j) => {
      const p = obj(rp);
      const at = `Lv.${n}, ${j + 1}. ödül`;
      if (!p || !PRIZE_KINDS.includes(p.kind)) throw bad(`${at}: tür jeton ya da eşya olmalı`);
      const winners = whole(p.winners, 1, L.winnersMax);
      if (winners === null) throw bad(`${at}: kazanan sayısı 1–${L.winnersMax} olmalı`);
      if (p.kind === 'coins') {
        const amount = whole(p.amount, 1, L.coinsMax);
        if (amount === null) throw bad(`${at}: jeton 1–${fmt(L.coinsMax)} arasında tam sayı olmalı`);
        return { kind: 'coins', amount, winners };
      }
      const item = typeof p.sku === 'string' ? itemOf(p.sku) : undefined;
      if (!item) throw bad(`${at}: mağazada satışta olan bir çerçeve, giriş efekti, araç, balon ya da dalga seçin`);
      if (!PRIZE_ITEM_KINDS.includes(item.kind)) throw bad(`${at}: ${item.name} ödül olamaz (çerçeve, giriş efekti, araç, balon ya da dalga olmalı)`);
      const days = whole(p.days, 1, L.daysMax);
      if (days === null) throw bad(`${at}: gün 1–${L.daysMax} olmalı`);
      return { kind: 'item', sku: item.sku, days, winners };
    });
    return { goal, prizes };
  });
  return { enabled: o.enabled, levels };
}
export const isRocketError = (e) => e instanceof RocketError;

/** Where each level ends in a day's coins: level n is full once the day's fuel reaches ends[n - 1]. */
export const levelEnds = (config) => config.levels.reduce((ends, l) => [...ends, (ends.at(-1) ?? 0) + l.goal], []);
/** How many levels are full at `fuel`. */
export const levelsFull = (ends, fuel) => ends.filter((e) => fuel >= e).length;

/**
 * How `coins` given when the day's fuel was `before` split over the levels they fill: [{ level, coins }]. What lands
 * past the last level fills nothing (the rocket is done for the day).
 */
export function splitFuel(ends, before, coins) {
  const out = [];
  let at = before;
  let left = coins;
  for (const [i, end] of ends.entries()) {
    if (left <= 0) break;
    if (at >= end) continue;
    const part = Math.min(left, end - at);
    out.push({ level: i + 1, coins: part });
    at += part;
    left -= part;
  }
  return out;
}

/**
 * A level's prizes one per winner, biggest first (owners, 25 Nov 2026): the coin prizes from the most coins down, then
 * the items in the panel's order. [{ ...prize, slot }]: `slot` is the place in that order, the winner's rank.
 */
export const prizeSlots = (prizes) =>
  prizes
    .flatMap((p, at) => Array.from({ length: p.winners }, () => ({ p, at })))
    .sort((x, y) => (x.p.kind === 'coins' ? 0 : 1) - (y.p.kind === 'coins' ? 0 : 1) || (x.p.kind === 'coins' ? y.p.amount - x.p.amount : 0) || x.at - y.at)
    .map(({ p }, slot) => ({ ...p, slot }));

/**
 * Who wins at a launch (owners, 25 Nov 2026: no draw): up to `n` different people out of `fuel` ([{ user, coins }],
 * what each gave in the room that day), the most first, so the one who gave most takes the biggest prize (prizeSlots).
 * Equal amounts: the account id's order, the same every time.
 */
export function rankWinners(fuel, n) {
  return fuel
    .filter((x) => x.coins > 0)
    .sort((a, b) => b.coins - a.coins || (a.user < b.user ? -1 : a.user > b.user ? 1 : 0))
    .slice(0, n)
    .map((x) => x.user);
}

/**
 * Who wins at a launch: up to `n` different people out of `fuel` ([{ user, coins }]), drawn one after another
 * without putting anyone back, each draw's chance as each one's share of what is left. `rand(max)` gives a whole
 * number from 0 to max - 1. The first drawn takes the first prize, so the more someone gave, the likelier the
 * first prizes are theirs.
 */
export function drawWinners(fuel, n, rand) {
  const pool = fuel.filter((x) => x.coins > 0);
  const out = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, x) => s + x.coins, 0);
    let r = rand(total);
    const i = pool.findIndex((x) => (r -= x.coins) < 0);
    out.push(pool[i].user);
    pool.splice(i, 1);
  }
  return out;
}
