// Hemen Tanış engine: random voice/video matching with the states from the spec (§5) and the billing
// rules from §6. Module-level so a search keeps running while the user moves around the app (e.g. into a
// room), and the incoming match card can appear on any screen.
// Prototype: timers stand in for the matchmaking server; in production every transition below is a
// server event and the client only renders it.
import { useSyncExternalStore } from 'react';

import { MATCH_ACCEPT_SECONDS, MATCH_GRACE_SECONDS, MATCH_PRICE } from '@/data/economy';
import { USERS, userById, type User } from '@/data/mock';
import { checkInteraction } from '@/lib/interaction';
import { beginCall, endCall, getMedia } from '@/lib/media';

export type MatchMode = 'voice' | 'video';
export type MatchFilter = 'Herkes' | 'Kadın' | 'Erkek';
export type MatchPhase =
  | 'idle'
  | 'searching' // Eşleşme arıyor
  | 'found' // Eşleşme bulundu (kabul/ret bekleniyor)
  | 'awaiting_peer' // Karşı tarafın kabulü bekleniyor
  | 'connecting' // Görüşme bağlanıyor
  | 'active' // Sesli / görüntülü görüşme aktif
  | 'ending' // Görüşme sonlandırılıyor
  | 'completed' // Görüşme tamamlandı
  | 'busy' // Kullanıcı meşgul
  | 'error' // Bağlantı hatası (veya bakiye yetersiz)
  | 'declined' // Reddedildi (ben, karşı taraf veya süre doldu)
  | 'cancelled'; // İptal edildi

export const PHASE_LABEL: Record<MatchPhase, string> = {
  idle: 'Hazır',
  searching: 'Eşleşme aranıyor',
  found: 'Eşleşme bulundu',
  awaiting_peer: 'Karşı tarafın kabulü bekleniyor',
  connecting: 'Görüşme bağlanıyor',
  active: 'Görüşme aktif',
  ending: 'Görüşme sonlandırılıyor',
  completed: 'Görüşme tamamlandı',
  busy: 'Meşgul',
  error: 'Bağlantı hatası',
  declined: 'Eşleşme reddedildi',
  cancelled: 'Eşleşme iptal edildi',
};

/** Demo switch so every acceptance case can be tried on a phone. */
export type Scenario = 'normal' | 'peer_declines' | 'connect_error' | 'drop';

export type CallSummary = { peerId: string; mode: MatchMode; seconds: number; charged: number; refunded: number; reason: string };
export type MatchState = {
  phase: MatchPhase;
  mode: MatchMode;
  filter: MatchFilter;
  peerId?: string;
  acceptDeadline?: number;
  startedAt?: number;
  elapsed: number;
  charged: number;
  message?: string;
  lowBalance?: boolean;
  last?: CallSummary;
  scenario: Scenario;
  log: { phase: MatchPhase; at: string; note?: string }[];
};

/** What the engine needs from the app store; set by <MatchBridge> on every render. */
export type MatchDeps = {
  coins: () => number;
  spend: (n: number, reason: string) => boolean;
  refund: (n: number, reason: string) => void;
  blocked: Set<string>;
  following: Set<string>;
  myAge: number;
};
let deps: MatchDeps | null = null;
export const setMatchDeps = (d: MatchDeps) => {
  deps = d;
};

let state: MatchState = { phase: 'idle', mode: 'voice', filter: 'Herkes', elapsed: 0, charged: 0, scenario: 'normal', log: [] };
const listeners = new Set<() => void>();
const clock = () => new Date().toTimeString().slice(0, 8);
const set = (patch: Partial<MatchState>, note?: string) => {
  const phaseChanged = patch.phase && patch.phase !== state.phase;
  state = { ...state, ...patch, log: phaseChanged ? [{ phase: patch.phase!, at: clock(), note }, ...state.log].slice(0, 30) : state.log };
  listeners.forEach((l) => l());
};
export const getMatch = () => state;
export function useMatch() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getMatch,
    getMatch,
  );
}

let timers: ReturnType<typeof setTimeout>[] = [];
let ticker: ReturnType<typeof setInterval> | undefined;
const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
const clearTimers = () => {
  timers.forEach(clearTimeout);
  timers = [];
  clearInterval(ticker);
  ticker = undefined;
};

export const priceOf = (mode: MatchMode) => MATCH_PRICE[mode];
export const modeLabel = (mode: MatchMode) => (mode === 'voice' ? 'Sesli Tanış' : 'Görüntülü Tanış');
const busyReason = () => {
  const c = getMedia().call;
  return c ? (c.kind === 'match' ? 'Zaten bir Hemen Tanış görüşmesindesin.' : 'Şu an bire bir bir görüşmedesin; yeni eşleşme başlatılamaz.') : null;
};

function pickPeer(): User | null {
  const d = deps;
  if (!d) return null;
  const pool = USERS.filter(
    (u) =>
      u.online &&
      u.id !== state.last?.peerId &&
      (state.filter === 'Herkes' || u.gender === state.filter) &&
      checkInteraction(state.mode === 'video' ? 'video' : 'voice', u, { blocked: d.blocked, following: d.following, myAge: d.myAge }).ok,
  );
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

export function setScenario(scenario: Scenario) {
  set({ scenario });
}

export function startMatch(mode: MatchMode, filter: MatchFilter = state.filter) {
  if (['searching', 'found', 'awaiting_peer', 'connecting', 'active'].includes(state.phase)) return;
  clearTimers();
  const busy = busyReason();
  if (busy) return set({ phase: 'busy', mode, filter, message: busy, peerId: undefined });
  set({ phase: 'searching', mode, filter, peerId: undefined, message: undefined, elapsed: 0, charged: 0, lowBalance: false, startedAt: undefined });
  later(2200 + Math.random() * 1500, () => {
    const busyNow = busyReason();
    if (busyNow) return set({ phase: 'busy', message: `${busyNow} Arama durduruldu.` });
    const peer = pickPeer();
    if (!peer) return set({ phase: 'error', message: 'Şu an filtrene uygun çevrimiçi kimse yok. Biraz sonra tekrar dene.' });
    set({ phase: 'found', peerId: peer.id, acceptDeadline: Date.now() + MATCH_ACCEPT_SECONDS * 1000 }, peer.name);
    later(MATCH_ACCEPT_SECONDS * 1000, () => {
      if (state.phase === 'found') set({ phase: 'declined', message: 'Süre doldu; eşleşme kabul edilmediği için kapandı. Ücret alınmadı.' }, 'zaman aşımı');
    });
  });
}

export function acceptMatch() {
  if (state.phase !== 'found' || !state.peerId || !deps) return;
  clearTimers();
  const price = priceOf(state.mode);
  if (deps.coins() < price) return set({ phase: 'error', message: `Bakiye yetersiz: ${modeLabel(state.mode)} dakikası ${price} jeton. Görüşme başlatılmadı, ücret alınmadı.` }, 'bakiye');
  const busy = busyReason();
  if (busy) return set({ phase: 'busy', message: busy });
  const peer = userById(state.peerId);
  set({ phase: 'awaiting_peer' });
  later(1200, () => {
    if (state.scenario === 'peer_declines') return set({ phase: 'declined', message: `${peer.name} eşleşmeyi reddetti. Ücret alınmadı.` }, 'karşı taraf');
    set({ phase: 'connecting' });
    later(1000, () => connect(peer));
  });
}

function connect(peer: User) {
  if (!deps) return;
  if (state.scenario === 'connect_error') return set({ phase: 'error', message: 'Bağlantı kurulamadı. Ücret alınmadı; tekrar deneyebilirsin.' }, 'bağlantı');
  // Devices are claimed only now; the room drops my seat/camera when it sees the call (lib/media).
  const claim = beginCall({ kind: 'match', mode: state.mode, peerId: peer.id });
  if (!claim.ok) return set({ phase: 'busy', message: claim.reason });
  const price = priceOf(state.mode);
  // The meter starts at connection: first minute charged now (refunded if the call drops within the grace period).
  if (!deps.spend(price, `${modeLabel(state.mode)} · ${peer.name} · 1. dk`)) {
    endCall(peer.id);
    return set({ phase: 'error', message: 'Ödeme alınamadı (bakiye veya günlük limit). Görüşme başlatılmadı.' }, 'ödeme');
  }
  set({ phase: 'active', startedAt: Date.now(), elapsed: 0, charged: price, lowBalance: false });
  ticker = setInterval(tick, 1000);
  if (state.scenario === 'drop') later(5000, () => dropConnection());
}

function tick() {
  if (state.phase !== 'active' || !state.startedAt || !deps) return;
  const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
  const price = priceOf(state.mode);
  const minute = Math.floor(elapsed / 60) + 1;
  const paidMinutes = Math.round(state.charged / price);
  if (minute > paidMinutes) {
    const peer = userById(state.peerId!);
    if (!deps.spend(price, `${modeLabel(state.mode)} · ${peer.name} · ${minute}. dk`)) return finish('Bakiyen bittiği için görüşme güvenli şekilde sonlandırıldı.', elapsed);
    return set({ elapsed, charged: state.charged + price, lowBalance: false });
  }
  // Warn 20 s before the next minute if the balance can't cover it.
  const lowBalance = 60 - (elapsed % 60) <= 20 && deps.coins() < price;
  set({ elapsed, lowBalance });
}

function finish(reason: string, elapsedNow?: number, asError = false) {
  if (state.phase !== 'active' || !state.peerId) return;
  clearTimers();
  const seconds = elapsedNow ?? (state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0);
  set({ phase: 'ending', elapsed: seconds });
  // Grace: a call that dies in the first seconds costs nothing.
  const refunded = seconds < MATCH_GRACE_SECONDS ? priceOf(state.mode) : 0;
  if (refunded && deps) deps.refund(refunded, `${modeLabel(state.mode)} iadesi · bağlantı ${MATCH_GRACE_SECONDS} sn dolmadan bitti`);
  endCall(state.peerId);
  const last: CallSummary = { peerId: state.peerId, mode: state.mode, seconds, charged: state.charged - refunded, refunded, reason };
  set({ phase: asError ? 'error' : 'completed', last, message: reason, charged: 0 });
}

export const hangUp = () => finish('Görüşmeyi sonlandırdın.');
export const dropConnection = () => finish('Bağlantı koptu. Odadaysan oda bağlantın ve üyeliğin korunuyor.', undefined, true);

export function declineMatch() {
  if (state.phase !== 'found') return;
  clearTimers();
  set({ phase: 'declined', message: 'Eşleşmeyi reddettin. Ücret alınmadı.' }, 'ben');
}

export function cancelMatch() {
  if (!['searching', 'found', 'awaiting_peer', 'connecting'].includes(state.phase)) return;
  clearTimers();
  set({ phase: 'cancelled', message: 'Eşleşme aramasını iptal ettin. Ücret alınmadı.' });
}

/** "Sonraki": end the current call (if any) and look for someone new with the same settings. */
export function nextMatch() {
  if (state.phase === 'active') finish('Sonraki kişiye geçtin.');
  else clearTimers();
  set({ phase: 'idle' });
  startMatch(state.mode, state.filter);
}

export function resetMatch() {
  if (state.phase === 'active') return;
  clearTimers();
  set({ phase: 'idle', message: undefined, peerId: undefined });
}
