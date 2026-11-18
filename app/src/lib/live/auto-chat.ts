// Live mode (lib/live): Otomatik mesajlaşma on the server (server/api/auto-chat.mjs, message-holds.mjs,
// docs/OTOMATIK_MESAJ.md). My rights today (automatic messages, quick replies, a man's free starts), a woman
// streamer's 10 templates, the quick reply itself, my answer figures and an agency's, my choices, and the reward and
// fee states of the messages of an open chat (lib/msg-reward). Every answer is read defensively: a field an older
// server doesn't send, or a malformed one, reads as "nothing to show" and never breaks a screen.
import { useEffect, useState } from 'react';

import * as api from '@/lib/api';
import { liveMode, toServer } from '@/lib/live';
import {
  agencyPerformanceOf,
  autoMeOf,
  extraFor,
  forgetThreads,
  onThreads,
  performanceOf,
  periodQuery,
  templatesOf,
  ticking,
  NO_AUTO,
  type AutoMe,
  type Period,
  type QuickResult,
} from '@/lib/auto-chat-core';

export * from '@/lib/auto-chat-core';
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

let cached: { at: number; value: AutoMe } | null = null;
const listeners = new Set<(v: AutoMe) => void>();
const publish = (v: AutoMe) => {
  cached = { at: Date.now(), value: v };
  listeners.forEach((f) => f(v));
};
/** My rights and choices now (a minute's copy is kept; `fresh` reads again). The demo has none. */
export async function loadAutoMe(fresh = false): Promise<AutoMe> {
  if (!liveMode()) return NO_AUTO;
  if (!fresh && cached && Date.now() - cached.at < 60_000) return cached.value;
  const v = autoMeOf(await api.apiRequest<unknown>('GET', '/api/auto-chat/me'));
  publish(v);
  return v;
}
/** My rights and choices, kept up to date across screens (null until read). */
export function useAutoMe() {
  const [v, setV] = useState<AutoMe | null>(cached?.value ?? null);
  useEffect(() => {
    listeners.add(setV);
    if (liveMode()) void loadAutoMe().catch(() => {});
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}

/** One of my choices (privacy.mjs keys); the state is read again after. */
export async function setAutoChoice(key: 'autoReceive' | 'autoOpener' | 'autoOpenerSeen' | 'autoSend', value: boolean) {
  await api.updateAutoChoices({ [key]: value });
  return loadAutoMe(true);
}

// --- Templates ---------------------------------------------------------------------------------------------------
export const loadTemplates = async () => templatesOf(await api.apiRequest<unknown>('GET', '/api/auto-chat/templates'));
export const saveTemplate = async (no: number, text: string) => templatesOf(await api.apiRequest<unknown>('POST', '/api/auto-chat/templates', { no, text: text.trim() }));
export const resetTemplate = async (no: number) => templatesOf(await api.apiRequest<unknown>('POST', '/api/auto-chat/templates/reset', { no }));

// --- Quick replies -----------------------------------------------------------------------------------------------
/** Sends quick reply `no` to `userId` (the server takes its words from the pool and one of today's rights). */
export async function sendQuick(userId: string, no: number, ref = api.newRef()): Promise<QuickResult> {
  const to = toServer(userId);
  if (!to) return { ok: false, reason: 'Kullanıcı bulunamadı', quota: false };
  try {
    const r = obj(await api.apiRequest<unknown>('POST', '/api/messages', { to, quick: no, ref }));
    const q = obj(r.quick);
    void loadAutoMe(true).catch(() => {});
    return { ok: true, left: num(q.left), done: typeof q.done === 'string' ? q.done : null, reward: num(obj(r.reward).diamonds) };
  } catch (e) {
    const quota = e instanceof api.ApiError && e.data.code === 'quick_quota';
    return { ok: false, reason: e instanceof Error ? e.message : 'Gönderilemedi', quota };
  }
}

export const loadPerformance = async (p: Period, range?: { from: string; to: string }) => performanceOf(await api.apiRequest<unknown>('GET', `/api/auto-chat/performance?${periodQuery(p, range)}`));

export const loadAgencyPerformance = async (agencyId: string, p: Period, range?: { from: string; to: string }) =>
  agencyPerformanceOf(await api.apiRequest<unknown>('GET', `/api/agency/message-performance?id=${encodeURIComponent(agencyId)}&${periodQuery(p, range)}`));

/** The rewards and fees of the open chat with `userId`, by server message id; redraws each second while a reward's time runs. */
export function useThreadExtras(userId: string) {
  const peer = toServer(userId) ?? '';
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    const off = onThreads(f);
    const tick = setInterval(() => ticking(peer) && f(), 1000);
    return () => {
      off();
      clearInterval(tick);
    };
  }, [peer]);
  return (sid: number | undefined) => extraFor(peer, sid);
}

/** Signed out: nothing of the last account stays. */
export function forgetAutoChat() {
  cached = null;
  forgetThreads();
}
