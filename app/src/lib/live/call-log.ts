// Live mode (lib/live): what 1v1 left on the server (server/api/call-log.mjs), for the screens that show it: Mesajlar's
// call history (Aramalar) and heart points (Yakınlık), Yayıncı Merkezi's call figures and Görevler's call task. Each
// is read again when its screen comes to the front. The server counts and pays; this only shows its answers.
import * as api from '@/lib/api';
import { applyServerUser, rememberUser, toLocal } from '@/lib/live';
import { focusStore } from '@/lib/live/focus-store';

// --- Aramalar ------------------------------------------------------------------------------------------------
type CallPage = { calls: api.ServerCallLog[]; next: number | null };
const calls = focusStore<CallPage>(async () => {
  const r = await api.myCalls();
  r.calls.forEach((c) => rememberUser(c.other));
  return r;
});
/** My call history, newest first (null until read); `on` false reads nothing. */
export const useLiveCallLog = (on = true) => calls.useData(on);

let paging = false;
/** The next page under what is shown (the end of the list was reached). */
export async function moreLiveCalls() {
  const have = calls.current();
  if (!have?.next || paging) return;
  paging = true;
  try {
    const r = await api.myCalls(have.next);
    r.calls.forEach((c) => rememberUser(c.other));
    const now = calls.current();
    if (now === have) calls.put({ calls: [...have.calls, ...r.calls], next: r.next });
  } finally {
    paging = false;
  }
}

/** "Arama geçmişini temizle": gone from my history on the server; the other person's keeps them. */
export async function clearLiveCalls() {
  await api.clearMyCalls();
  calls.put({ calls: [], next: null });
}

// --- Yakınlık -----------------------------------------------------------------------------------------------
const hearts = focusStore(async () => new Map((await api.myHearts()).map((h) => [toLocal(h.id), h.points])));
/** Heart points with each person (this phone's ids), read while `on` (the Yakınlık filter is chosen). */
export const useLiveHearts = (on: boolean) => hearts.useData(on);

// --- Yayıncı Merkezi ----------------------------------------------------------------------------------------
const stats = focusStore(api.myCallStats);
/** This week's paid calls and matches I earned from, or null until read. */
export const useLiveCallStats = (on = true) => stats.useData(on);

// --- Görevler -----------------------------------------------------------------------------------------------
const task = focusStore(api.myCallTask);
/** Today's call task as the server counts it, or null until read. */
export const useLiveCallTask = (on = true) => task.useData(on);

/** Takes the call task's reward on the server; the answer's balance reaches the wallet. `paid`: false for a repeat. */
export async function claimLiveCallTask() {
  const r = await api.claimCallTask();
  applyServerUser(r, 'Görev ödülü');
  task.put(r.task);
  return { paid: !r.replay, task: r.task };
}
