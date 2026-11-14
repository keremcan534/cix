// Wins announced to everyone (server/api/lucky.mjs → live-line.mjs lineWin): another person's Şanslı win, in any
// room, comes on the live line with what its banner shows and joins the banner line of every room (lib/broadcast,
// components/fx/win-banner). The server leaves out my own wins (this phone showed them already), anyone in a block
// with me, and wins under the floor the admins set (Canlı ayarlar › Kazanç duyurusu). Each win once, however the
// line reconnects; a run of one person's wins of the same gift waits as one banner.
import { announceWin, type WinNews } from '@/lib/broadcast';
import type { LineEvent } from '@/lib/live/line-events';

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);
const whole = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);

/** A 'win' event as its banner; null for any other event or a malformed one. `id`: the server's send, for dedupe. */
export function winOfLine(e: LineEvent): { id: number; news: Omit<WinNews, 'id' | 'at'> } | null {
  if (e.type !== 'win') return null;
  const id = whole(e.id);
  const amount = whole(e.coins);
  const gift = text(e.gift, 30);
  if (!id || !amount || !gift) return null;
  // Without an id and a name the winner hid their name: "Bir kullanıcı", no photo, never merged with anyone.
  const uid = text(e.uid, 64);
  const name = uid ? text(e.name, 60) : null;
  const avatar = name ? text(e.avatar, 500) : null;
  const room = text(e.room, 80);
  const mult = whole(e.mult) ?? 0;
  const wins = whole(e.wins) ?? 1;
  return {
    id,
    news: {
      userName: name ?? 'Bir kullanıcı',
      ...(uid && name ? { uid, key: `${uid}:${gift}` } : {}),
      ...(avatar?.startsWith('https://') ? { avatar } : {}),
      source: `Şanslı › ${gift}`,
      ...(room ? { roomTitle: room } : {}),
      ...(mult > 0 ? { mult } : {}),
      amount,
      ...(wins > 1 ? { wins } : {}),
    },
  };
}

const seen: number[] = [];
/** A live line event: a win joins the banners (once). True when it was a win event, handled here. */
export function takeWinEvent(e: LineEvent): boolean {
  if (e.type !== 'win') return false;
  const w = winOfLine(e);
  if (!w || seen.includes(w.id)) return true;
  seen.push(w.id);
  if (seen.length > 200) seen.shift();
  announceWin(w.news);
  return true;
}
