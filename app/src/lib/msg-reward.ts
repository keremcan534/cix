// The 5-minute rule as a chat shows it (server/api/message-holds.mjs, docs/OTOMATIK_MESAJ.md): under a paid message a
// streamer received, the diamonds she can earn and the time left; under my own paid message, what happened to its
// coins; and the label of an automatic message or a quick reply. Pure: no React, no API client, so the node tests can
// check it. A server answer that is malformed or from an older server reads as nothing (no line is drawn).

export type RewardState = 'waiting' | 'checking' | 'won' | 'expired';
export type MsgReward = { diamonds: number; state: RewardState; deadline: string };
export type FeeState = 'held' | 'paid' | 'refunded';
export type MsgFee = { coins: number; state: FeeState; returned: number };
export type MsgSource = 'auto_streamer' | 'auto_opener' | 'quick_reply';
export type MsgExtra = { reward?: MsgReward; fee?: MsgFee; source?: MsgSource };

const REWARD_STATES: readonly string[] = ['waiting', 'checking', 'won', 'expired'];
const FEE_STATES: readonly string[] = ['held', 'paid', 'refunded'];
const SOURCES: readonly string[] = ['auto_streamer', 'auto_opener', 'quick_reply'];
const whole = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** What a server message carries besides its text: its reward (to the streamer), its fee (to the payer), its source. */
export function extraOf(raw: unknown): MsgExtra {
  const m = obj(raw);
  if (!m) return {};
  const out: MsgExtra = {};
  const r = obj(m.reward);
  const diamonds = whole(r?.diamonds);
  if (r && diamonds !== null && diamonds > 0 && typeof r.state === 'string' && REWARD_STATES.includes(r.state) && typeof r.deadline === 'string' && !Number.isNaN(Date.parse(r.deadline)))
    out.reward = { diamonds, state: r.state as RewardState, deadline: r.deadline };
  const f = obj(m.fee);
  const coins = whole(f?.coins);
  if (f && coins !== null && coins > 0 && typeof f.state === 'string' && FEE_STATES.includes(f.state)) out.fee = { coins, state: f.state as FeeState, returned: whole(f.returned) ?? 0 };
  if (typeof m.source === 'string' && SOURCES.includes(m.source)) out.source = m.source as MsgSource;
  return out;
}

const fmt = (n: number) => n.toLocaleString('tr-TR');
/** "04:35" for the time left (never below 00:00). */
export function countdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export type RewardLine = { title: string; sub: string | null; tone: 'gold' | 'ok' | 'dim' };
/**
 * The line under a paid message I received (spec §9.3), at server time `now` (ms). A waiting reward whose time is up
 * reads as being checked until the server says won or expired: "kazanıldı" only once it is paid.
 */
export function rewardLine(r: MsgReward, now: number): RewardLine {
  const amount = `💎 +${fmt(r.diamonds)} Elmas`;
  const left = Date.parse(r.deadline) - now;
  if (r.state === 'waiting' && left > 0) return { title: amount, sub: `${countdown(left)} kaldı · 5 dakika içinde yanıtla ve kazan.`, tone: 'gold' };
  if (r.state === 'waiting' || r.state === 'checking') return { title: amount, sub: 'Ödül doğrulanıyor.', tone: 'dim' };
  if (r.state === 'won') return { title: `💎 +${fmt(r.diamonds)} kazanıldı.`, sub: null, tone: 'ok' };
  return { title: 'Ödül süresi doldu.', sub: null, tone: 'dim' };
}

/** The line under my own paid message: its coins only, never what the other one earns (spec §15.3). */
export function feeLine(f: MsgFee): string {
  if (f.state === 'held') return `${fmt(f.coins)} jeton · cevap bekleniyor (gelmezse iade edilir)`;
  if (f.state === 'paid') return `${fmt(f.coins)} jeton ödendi`;
  return f.returned > 0 ? `Cevap gelmedi · ${fmt(f.returned)} jeton iade edildi` : 'Cevap gelmedi';
}

/** The small label over an automatic message or a quick reply (spec §5.4, §6.2: never shown as a person's own act). */
export function sourceLabel(source: MsgSource | undefined, mine: boolean): string | null {
  if (source === 'auto_streamer') return mine ? 'Otomatik mesajın' : 'Otomatik mesaj';
  if (source === 'auto_opener') return mine ? 'Senin adına gönderilen ücretsiz sohbet başlangıcı' : 'Otomatik sohbet başlangıcı';
  if (source === 'quick_reply') return mine ? 'Hazır cevap' : null;
  return null;
}
