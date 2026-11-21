// Şanslı hediyeler in live mode: the server (server/api/lucky.mjs) keeps the packages and odds, takes the price,
// gives each recipient their 20 % as diamonds, draws and pays the rewards in coins. This phone reads the
// packages into lib/lucky (applyServerLucky; malformed ones left out, lib/lucky-art) and their own icons into
// lib/lucky-art, sends with the price and the settings' version the sheet showed (a moved one is refused with nothing
// moved, and the sheet reads the packages again), and shows what the server answered.
import * as api from '@/lib/api';
import { applyServerUser, liveMode, once, rememberUser, toLocal, toServer } from '@/lib/live';
import { addServerRecords, applyServerLucky, getLucky, luckyGift, type LuckyGift, type LuckyRecord } from '@/lib/lucky';
import { luckyShown, parseLuckyPackages, setLuckyIcons, type ServerLuckyPackage } from '@/lib/lucky-art';
import { luckyHostDiamonds } from '@/data/rules';

const clock = (t: number) => `${new Date(t).toLocaleDateString('tr-TR')} ${new Date(t).toTimeString().slice(0, 8)}`;
const toGift = (g: ServerLuckyPackage): LuckyGift => ({ id: g.id, name: g.name, emoji: g.emoji, price: g.price, enabled: g.enabled, tiers: g.tiers });

/** One record per draw: draw k went to recipient to[floor(k / count)]. */
function records(s: api.ServerLuckySend, gifts: Map<string, ServerLuckyPackage>, ts = Date.parse(s.at)): LuckyRecord[] {
  const g = gifts.get(s.giftId);
  return s.draws.map((mult, k) => ({
    txId: `${s.ref}-${k}`,
    at: clock(ts),
    ts,
    userId: 'me',
    roomId: s.room ?? '',
    giftId: s.giftId,
    giftName: g?.name ?? 'Şanslı hediye',
    emoji: g?.emoji ?? '🎁',
    toId: toLocal(s.to[Math.floor(k / s.count)] ?? ''),
    price: s.price,
    mult,
    reward: s.price * mult,
    hostDiamonds: luckyHostDiamonds(s.price),
    configVersion: s.configVersion,
    odds: s.odds,
  }));
}

let known = new Map<string, ServerLuckyPackage>();

/** Reads the packages (and my last sends) from the server. Offline: nothing to read. */
export async function refreshLucky() {
  if (!liveMode()) return;
  const r = await api.lucky();
  const gifts = parseLuckyPackages(r.gifts);
  known = new Map(gifts.map((g) => [g.id, g]));
  setLuckyIcons(gifts);
  applyServerLucky({
    version: r.version,
    gifts: gifts.map(toGift),
    announceFrom: r.announceFrom,
    open: Object.fromEntries(gifts.map((g) => [g.id, g.open])),
    allowed: r.allowed,
    records: (Array.isArray(r.mine) ? r.mine : []).flatMap((s) => records(s, known)),
  });
}

/**
 * `count` of one package to each of `toIds` (this phone's ids). Throws the server's refusal (age, Cömertlik,
 * balance, closed package, daily limit). The same send tried again after a lost answer is played once. `named`: a
 * win goes to every room with my name and photo (else as "Bir kullanıcı").
 */
export async function liveLuckySend(giftId: string, toIds: string[], count: number, roomId: string, named = false, times = 1) {
  const to = toIds.map(toServer);
  if (to.some((x) => !x)) throw new Error('Bu kişiye Şanslı hediye gönderilemez.');
  const ids = to as string[];
  const g = known.get(giftId);
  // What the sheet showed: the package's price and the settings' version they came with (lib/lucky's copy).
  const shown = luckyShown(luckyGift(giftId), getLucky().config.version);
  // `times` combo taps in one request: count × times gifts to each (server/api/lucky.mjs).
  const r = await once(`lucky:${giftId}:${ids.join(',')}:${count}x${times}:${roomId}`, (ref) => api.luckySend(giftId, ids, count, roomId, ref, named, shown, times));
  // Two rows, the price and the reward, so the whole price counts as spending (store SERVER_TAKES).
  const won = r.send.payout;
  const what = `${g?.name ?? giftId} ×${count * times * ids.length}`;
  if (won > 0) applyServerUser({ user: { ...r.user, coins: r.user.coins - won } }, `Şanslı hediye: ${what}`);
  applyServerUser(r, won > 0 ? `Şanslı ödülü: ${what}` : `Şanslı hediye: ${what}`);
  const list = records(r.send, known, Date.now());
  addServerRecords(list);
  return { records: list, replay: r.replay, send: r.send };
}

// --- Admin -----------------------------------------------------------------------------------------------
export async function loadLuckyAdmin() {
  const r = await api.luckyAdmin();
  for (const s of [...r.recent, ...r.winners]) rememberUser(s.sender);
  return r;
}
export async function saveLuckyAdmin(config: api.ServerLuckyConfig, version: number) {
  const r = await api.saveLuckyConfig(config, version);
  // My own screens show the new packages right away.
  void refreshLucky().catch(() => {});
  return r;
}
