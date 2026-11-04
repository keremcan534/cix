// Sanction times on the server's clock (lib/sanctions): pure, so tests load it without the app around it.
// Each server answer carries serverNow; from there time runs on a monotonic clock, so changing the phone's clock
// neither shortens nor lengthens a countdown.
import type { SanctionView } from '@/lib/api';

export type Action = 'room_text' | 'room_voice' | 'dm' | 'call';

const mono = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
let clock = { server: Date.now(), at: mono() };
/** Now on the server's clock (ms), from the last serverNow it sent. */
export const serverNow = () => clock.server + (mono() - clock.at);
export function setServerNow(iso: string) {
  const t = Date.parse(iso);
  if (Number.isFinite(t)) clock = { server: t, at: mono() };
}

/** Milliseconds left on a sanction by the server's clock; Infinity for a lifetime one. */
export function remaining(s: Pick<SanctionView, 'endAt' | 'permanent'>, now = serverNow()) {
  if (s.permanent || !s.endAt) return Infinity;
  return Math.max(0, Date.parse(s.endAt) - now);
}

/** "2 gün 3 saat", "14 dk 05 sn"…: the two largest units of what is left. */
export function formatLeft(ms: number) {
  if (ms === Infinity) return 'Süresiz';
  const sec = Math.ceil(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d >= 365) return `${Math.floor(d / 365)} yıl ${Math.floor((d % 365) / 30)} ay`;
  if (d > 0) return `${d} gün ${h} saat`;
  if (h > 0) return `${h} saat ${m} dk`;
  return `${m} dk ${String(s).padStart(2, '0')} sn`;
}

/** "4 Kas 2026 14:05" in the phone's time zone (the instant itself is the server's). */
export function formatAt(iso: string | null) {
  if (!iso) return 'Süresiz';
  const d = new Date(iso);
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The sanction that stops `action` (in `roomId` for room actions), or null. A room mute counts only in its own
 * room; a sanction whose time is up by the server's clock no longer counts (the store asks the server again).
 */
export function stopping(list: SanctionView[], action: Action, roomId?: string | null, now = serverNow()) {
  return (
    list.find((s) => s.status === 'active' && s.restricts.includes(action) && (!s.roomId || s.roomId === roomId) && remaining(s, now) > 0) ?? null
  );
}

export function resetClock() {
  clock = { server: Date.now(), at: mono() };
}
