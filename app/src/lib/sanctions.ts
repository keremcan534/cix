// My sanctions as the server knows them (server/api/sanctions.mjs GET /api/sanctions/mine): the ban screen,
// the room's disabled chat and mic, the DM refusal and the appeal form all read this one store.
//
// Time is the server's: each answer carries serverNow, and the countdown runs on a monotonic clock from there,
// so changing the phone's clock neither shortens nor lengthens anything. Whether a sanction is still on is
// decided by the server; when a countdown reaches zero the store only asks the server again.
import { useSyncExternalStore } from 'react';

import { ApiError, apiEnabled, appealSanction, mySanctions, onBlocked, retrySignIn, type Block, type MyAppeal, type SanctionView } from '@/lib/api';
import { onContactStrike } from '@/lib/contact-filter';
import { remaining, resetClock, setServerNow } from '@/lib/sanction-time';

export { formatAt, formatLeft, remaining, serverNow, stopping, type Action } from '@/lib/sanction-time';

/** `shown`: the sanction whose details sheet is open (from a banner or a refusal). */
type State = { sanctions: SanctionView[]; appeals: MyAppeal[]; block: Block | null; loaded: boolean; shown: SanctionView | null };

let state: State = { sanctions: [], appeals: [], block: null, loaded: false, shown: null };
const listeners = new Set<() => void>();
const emit = (p: Partial<State>) => {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getSanctions = () => state;
export const useSanctions = () => useSyncExternalStore(subscribe, getSanctions, getSanctions);

// --- Loading -----------------------------------------------------------------------------------------------
let timer: ReturnType<typeof setTimeout> | undefined;
let loading: Promise<void> | null = null;

/** Asks the server again (on start, when a room opens, after a refusal, when a countdown ends). */
export function refreshSanctions(): Promise<void> {
  if (!apiEnabled()) return Promise.resolve();
  loading ??= (async () => {
    try {
      const r = await mySanctions(state.block?.appealSession);
      setServerNow(r.serverNow);
      emit({ sanctions: r.sanctions, appeals: r.appeals, loaded: true });
      // A ban that ended or was lifted: back to the app (it signs in again on its own).
      if (state.block && !r.sanctions.some((s) => s.id === state.block?.sanction.id)) clearBlock();
      schedule();
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      // The appeal session no longer works: the ban ended or was lifted, or the session ran out (one day). A sign-in
      // tells which: it succeeds (back to the app) or is refused with a new appeal session.
      if (state.block && e.status === 401 && (await retrySignIn())) clearBlock();
    }
  })().finally(() => (loading = null));
  return loading;
}

/** Wakes when the nearest sanction ends by the server's clock (at most once a minute while one runs). */
function schedule() {
  clearTimeout(timer);
  const left = Math.min(...state.sanctions.map((s) => remaining(s)), state.block ? remaining(state.block.sanction) : Infinity);
  if (left === Infinity) return;
  timer = setTimeout(() => void refreshSanctions().catch(() => {}), Math.min(Math.max(left + 1500, 2000), 60_000));
}

/** A mute the server just named: it counts at once (composers close, banners show), then the list is asked again. */
function noteMute(s: SanctionView, now?: string, show = false) {
  if (now) setServerNow(now);
  emit({ sanctions: [s, ...state.sanctions.filter((x) => x.id !== s.id)], ...(show ? { shown: s } : {}) });
  schedule();
  void refreshSanctions().catch(() => {});
}

/** A refusal from the server (403 code muted): the sanction it names is shown at once, then the list is asked again. */
export function noteRefusal(e: unknown, show = false) {
  if (!(e instanceof ApiError) || e.data.code !== 'muted' || !e.data.sanction) return false;
  noteMute(e.data.sanction, e.data.serverNow, show);
  return true;
}

// The contact filter's automatic mute began with this refusal (lib/contact-filter): no waiting for the next poll.
onContactStrike((s) => {
  if (s?.muted && s.sanction) noteMute(s.sanction, s.serverNow);
});

let askedAppeal = false;
onBlocked((b) => {
  setServerNow(b.serverNow);
  // A new refusal without an appeal session (e.g. a background call) keeps the one we already have.
  const appealSession = b.appealSession ?? state.block?.appealSession ?? null;
  emit({ block: { ...b, appealSession } });
  // Still none: a sign-in attempt is refused with one, so the appeal form opens without restarting the app.
  if (!appealSession && !askedAppeal) {
    askedAppeal = true;
    void retrySignIn();
  }
  schedule();
  void refreshSanctions().catch(() => {});
});

export const showSanction = (s: SanctionView | null) => emit({ shown: s });

/** The ban screen was opened by a sign-in attempt: forget it once the person signs in fine again. */
export const clearBlock = () => {
  askedAppeal = false;
  emit({ block: null });
};

export async function sendAppeal(sanctionId: number, text: string) {
  const a = await appealSanction(sanctionId, text, state.block?.appealSession);
  emit({
    appeals: [a, ...state.appeals],
    sanctions: state.sanctions.map((s) => (s.id === sanctionId ? { ...s, appeal: 'open' } : s)),
    shown: state.shown?.id === sanctionId ? { ...state.shown, appeal: 'open' } : state.shown,
    block: state.block && state.block.sanction.id === sanctionId ? { ...state.block, sanction: { ...state.block.sanction, appeal: 'open' } } : state.block,
  });
  return a;
}

export const APPEAL_STATUS: Record<MyAppeal['status'], string> = {
  open: 'İnceleniyor',
  needs_review: 'Ek incelemede',
  upheld: 'Karar yerinde bulundu',
  reduced: 'Süre azaltıldı',
  lifted: 'Yaptırım kaldırıldı',
};

/** For tests. */
export function resetSanctions() {
  clearTimeout(timer);
  askedAppeal = false;
  state = { sanctions: [], appeals: [], block: null, loaded: false, shown: null };
  resetClock();
}
