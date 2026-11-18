// Otomatik mesaj's answers as the app reads them (server/api/auto-chat.mjs, message-holds.mjs; lib/live/auto-chat calls
// the server and holds the hooks). Pure, so the node tests can check it: every field is read defensively, and a field
// an older server doesn't send, or a malformed one, reads as "nothing to show" and never throws.
import { extraOf, type MsgExtra } from '@/lib/msg-reward';

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const bool = (v: unknown, d = false) => (typeof v === 'boolean' ? v : d);

export type Right = { total: number; used: number; left: number; on: boolean };
const rightOf = (v: unknown): Right | null => {
  const r = obj(v);
  if (!('total' in r)) return null;
  const total = num(r.total);
  const used = Math.min(total, num(r.used));
  return { total, used, left: num(r.left, Math.max(0, total - used)), on: bool(r.on, true) };
};
export type QuickReply = { no: number; text: string };
export type AutoMe = {
  /** A woman streamer: the templates, the automatic messages, quick replies and the 5-minute reward are hers. */
  tools: boolean;
  auto: (Right & { sending: boolean; done: string | null }) | null;
  quick: (Right & { replies: QuickReply[]; done: string | null }) | null;
  /** A man: the free conversation starts the system may send in his name. */
  opener: (Right & { sending: boolean; seen: boolean }) | null;
  receive: boolean;
  replyMinutes: number;
  resetsAt: string | null;
};
export const NO_AUTO: AutoMe = { tools: false, auto: null, quick: null, opener: null, receive: true, replyMinutes: 0, resetsAt: null };

/** GET /api/auto-chat/me as the app reads it. */
export function autoMeOf(raw: unknown): AutoMe {
  const m = obj(raw);
  const auto = rightOf(m.auto);
  const quick = rightOf(m.quick);
  const opener = rightOf(m.opener);
  const q = obj(m.quick);
  return {
    tools: bool(m.tools),
    auto: auto ? { ...auto, sending: bool(obj(m.auto).sending, true), done: typeof obj(m.auto).done === 'string' ? str(obj(m.auto).done) : null } : null,
    quick: quick
      ? {
          ...quick,
          replies: (Array.isArray(q.replies) ? q.replies : []).map((x) => ({ no: num(obj(x).no), text: str(obj(x).text) })).filter((x) => x.no > 0 && x.text),
          done: typeof q.done === 'string' ? q.done : null,
        }
      : null,
    opener: opener ? { ...opener, sending: bool(obj(m.opener).sending, true), seen: bool(obj(m.opener).seen) } : null,
    receive: bool(m.receive, true),
    replyMinutes: num(obj(m.reply).minutes),
    resetsAt: typeof m.resetsAt === 'string' ? m.resetsAt : null,
  };
}

export type Template = { no: number; text: string; custom: boolean; defaultText: string };
export type Templates = { templates: Template[]; limits: { min: number; max: number }; auto: Right | null; resetsAt: string | null };
const templateOf = (v: unknown): Template => {
  const t = obj(v);
  return { no: num(t.no), text: str(t.text), custom: bool(t.custom), defaultText: str(t.defaultText, str(t.text)) };
};
export function templatesOf(raw: unknown): Templates {
  const m = obj(raw);
  const list = (Array.isArray(m.templates) ? m.templates : []).map(templateOf).filter((t) => t.no >= 1 && t.no <= 10);
  return { templates: list, limits: { min: num(obj(m.limits).min, 5), max: num(obj(m.limits).max, 200) }, auto: rightOf(m.auto), resetsAt: typeof obj(m.auto).resetsAt === 'string' ? str(obj(m.auto).resetsAt) : null };
}

export type QuickResult = { ok: true; left: number; done: string | null; reward: number } | { ok: false; reason: string; quota: boolean };

// --- Figures -----------------------------------------------------------------------------------------------------
export type Figures = {
  total: number;
  answered: number;
  inTime: number;
  late: number;
  unanswered: number;
  waiting: number;
  quick: number;
  manual: number;
  diamonds: number;
  missed: number;
  missedDiamonds: number;
  avgSeconds: number | null;
  inTimeRate: number | null;
};
export function figuresOf(v: unknown): Figures {
  const f = obj(v);
  const n = (k: string) => num(f[k]);
  return {
    total: n('total'),
    answered: n('answered'),
    inTime: n('inTime'),
    late: n('late'),
    unanswered: n('unanswered'),
    waiting: n('waiting'),
    quick: n('quick'),
    manual: n('manual'),
    diamonds: n('diamonds'),
    missed: n('missed'),
    missedDiamonds: n('missedDiamonds'),
    avgSeconds: typeof f.avgSeconds === 'number' ? f.avgSeconds : null,
    inTimeRate: typeof f.inTimeRate === 'number' ? f.inTimeRate : null,
  };
}
export type Period = 'today' | '7d' | '30d' | 'custom';
export const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Bugün' },
  { key: '7d', label: 'Son 7 gün' },
  { key: '30d', label: 'Son 30 gün' },
  { key: 'custom', label: 'Tarih aralığı' },
];
export const periodQuery = (p: Period, range?: { from: string; to: string }) => `period=${p}${p === 'custom' && range ? `&from=${range.from}&to=${range.to}` : ''}`;
export type Performance = { stats: Figures; days: (Figures & { day: string })[]; today: { auto: Right | null; quick: Right | null }; replyMinutes: number };
export function performanceOf(raw: unknown): Performance {
  const m = obj(raw);
  return {
    stats: figuresOf(m.stats),
    days: (Array.isArray(m.days) ? m.days : []).map((d) => ({ ...figuresOf(d), day: str(obj(d).day) })).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.day)),
    today: { auto: rightOf(obj(m.today).auto), quick: rightOf(obj(m.today).quick) },
    replyMinutes: num(obj(m.reply).minutes, 5),
  };
}

export type StreamerRow = Figures & { id: string; name: string; publicNo: string | null; avatarUrl: string | null; online: boolean; quickToday: { used: number; total: number } };
export type AgencyPerformance = { streamers: StreamerRow[]; totals: Figures; previous: Figures; fastest: { id: string; name: string; avgSeconds: number | null }[]; lowest: { id: string; name: string; inTimeRate: number | null }[] };
export function agencyPerformanceOf(raw: unknown): AgencyPerformance {
  const m = obj(raw);
  const people = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => obj(x));
  return {
    streamers: people(m.streamers)
      .map((x) => ({
        ...figuresOf(x),
        id: str(x.id),
        name: str(x.name, 'Yayıncı'),
        publicNo: typeof x.publicNo === 'string' ? x.publicNo : null,
        avatarUrl: typeof x.avatarUrl === 'string' ? x.avatarUrl : null,
        online: bool(x.online),
        quickToday: { used: num(obj(x.quickToday).used), total: num(obj(x.quickToday).total, 10) },
      }))
      .filter((x) => x.id),
    totals: figuresOf(m.totals),
    previous: figuresOf(m.previous),
    fastest: people(m.fastest).map((x) => ({ id: str(x.id), name: str(x.name), avgSeconds: typeof x.avgSeconds === 'number' ? x.avgSeconds : null })),
    lowest: people(m.lowest).map((x) => ({ id: str(x.id), name: str(x.name), inTimeRate: typeof x.inTimeRate === 'number' ? x.inTimeRate : null })),
  };
}

/** "3 dk 05 sn", "45 sn", "—". */
export function secondsText(s: number | null) {
  if (s === null) return '—';
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} sa ${m % 60} dk` : `${m} dk ${String(s % 60).padStart(2, '0')} sn`;
}

// --- An open chat's rewards and fees -----------------------------------------------------------------------------
const threads = new Map<string, Map<number, MsgExtra>>();
let skew = 0;
const threadListeners = new Set<() => void>();

/** A thread read from the server (lib/live/messages): what each message carries now, and the server's clock. */
export function noteThread(peer: string, rows: readonly unknown[], serverNow?: unknown) {
  const t = typeof serverNow === 'string' ? Date.parse(serverNow) : NaN;
  if (Number.isFinite(t)) skew = t - Date.now();
  const map = threads.get(peer) ?? new Map<number, MsgExtra>();
  let changed = false;
  for (const raw of rows) {
    const id = num(obj(raw).id, -1);
    if (id < 0) continue;
    const x = extraOf(raw);
    const before = map.get(id);
    if (JSON.stringify(before ?? {}) === JSON.stringify(x)) continue;
    if (x.reward || x.fee || x.source) map.set(id, x);
    else map.delete(id);
    changed = true;
  }
  threads.set(peer, map);
  if (changed) threadListeners.forEach((f) => f());
}
/** The server's time now (ms), as the last read said. */
export const serverNowMs = () => Date.now() + skew;

/** What message `sid` of the chat with `peer` (a server id) carries now. */
export const extraFor = (peer: string, sid: number | undefined) => (sid === undefined ? undefined : threads.get(peer)?.get(sid));
/** Whether a reward's time runs in the chat with `peer` (the screen redraws each second then). */
export const ticking = (peer: string) => [...(threads.get(peer)?.values() ?? [])].some((x) => x.reward?.state === 'waiting');
/** Tells `f` when a thread's rewards or fees change; returns the way to stop. */
export function onThreads(f: () => void) {
  threadListeners.add(f);
  return () => {
    threadListeners.delete(f);
  };
}
/** Signed out: nothing of the last account stays. */
export function forgetThreads() {
  threads.clear();
}
