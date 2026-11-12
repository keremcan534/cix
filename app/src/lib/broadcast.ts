// Platform-wide win announcements (stand-in for the server's broadcast channel). Every win in any room
// or game goes out to every room; rooms show them one at a time as a banner near the top.
// The feed also simulates other people's wins so the prototype shows what other rooms would see.
import { useSyncExternalStore } from 'react';

import { ROOMS, USERS, roomById } from '@/data/mock';
import { liveBuild } from '@/lib/live-flag';

export type WinNews = {
  id: string;
  userName: string;
  avatar?: string;
  /** "Şanslı › Uğur Böceği", "Oyun Merkezi › Şans Çarkı" … */
  source: string;
  roomTitle?: string;
  mult?: number;
  amount: number;
  /** Several wins in one send, shown as a count. */
  wins?: number;
  /** When it was announced (ms); old news is skipped instead of shown late. */
  at: number;
  /** An Oyun Salonu win: only shown to people who can see Oyun Salonu (Cömertlik Lv.2+). */
  casino?: boolean;
};
export const NEWS_TTL_MS = 30_000;

const MAX_QUEUE = 6;
let queue: WinNews[] = [];
let showMyName = true;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export function useWinNews() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => queue,
    () => queue,
  );
}
/** The waiting banners, outside React (tests). */
export const getWinNews = () => queue;
/** Remove the banner that has finished showing. */
export const shiftWinNews = (id: string) => {
  queue = queue.filter((n) => n.id !== id);
  emit();
};
/** Privacy (Ayarlar): when off, my wins go out as "Bir kullanıcı". */
export const setShowMyName = (on: boolean) => {
  showMyName = on;
};

const rid = () => Math.random().toString(36).slice(2, 9);
export function announceWin(news: Omit<WinNews, 'id' | 'at'>, opts?: { mine?: boolean }) {
  if (news.amount <= 0) return;
  const n: WinNews = { ...news, id: rid(), at: Date.now(), ...(opts?.mine && !showMyName ? { userName: 'Bir kullanıcı', avatar: undefined } : null) };
  // Keep the newest few; a long backlog would be old news by the time it shows.
  queue = [...queue, n].slice(-MAX_QUEUE);
  emit();
}
/** An Oyun Salonu win. The source prefix counts too, so an announcement without the flag is still caught. */
export const isCasinoWin = (n: Pick<WinNews, 'casino' | 'source'>) => !!n.casino || n.source.startsWith('Oyun Merkezi ›');
/** Any game of chance (Oyun Salonu or Şanslı): not news for someone below the gambling level. */
export const isChanceWin = (n: Pick<WinNews, 'casino' | 'source'>) => isCasinoWin(n) || n.source.startsWith('Şanslı ›');
export const roomTitleOf = (roomId: string) => (roomId === 'yeni' ? 'Benim Odam' : (roomById(roomId)?.title ?? ''));

// --- Simulated wins from other rooms (offline demo only; never in live mode) ---------------------
const FAKE_SOURCES: { source: string; price: number; mults: number[]; casino?: boolean }[] = [
  { source: 'Şanslı › Şans Yoncası', price: 20, mults: [2, 5, 10, 20, 50, 100] },
  { source: 'Şanslı › Uğur Böceği', price: 100, mults: [2, 5, 10, 20, 50, 100, 1000] },
  { source: 'Şanslı › Altın Nal', price: 500, mults: [2, 5, 10, 20] },
  { source: 'Oyun Merkezi › Şans Çarkı', price: 100, mults: [2, 3, 5, 10], casino: true },
  { source: 'Oyun Merkezi › Ejder ile Kaplan', price: 500, mults: [2, 8], casino: true },
];
let feed: ReturnType<typeof setTimeout> | undefined;
export function startWinFeed() {
  // Made-up people winning in made-up rooms: a live build shows only real wins.
  if (feed || liveBuild()) return;
  const tick = () => {
    const u = USERS[Math.floor(Math.random() * USERS.length)];
    const s = FAKE_SOURCES[Math.floor(Math.random() * FAKE_SOURCES.length)];
    const mult = s.mults[Math.floor(Math.random() * s.mults.length)];
    const room = ROOMS[Math.floor(Math.random() * ROOMS.length)];
    announceWin({ userName: u.name, avatar: u.avatar, source: s.source, roomTitle: room.title, mult, amount: s.price * mult, casino: s.casino });
    feed = setTimeout(tick, 25_000 + Math.random() * 25_000);
  };
  feed = setTimeout(tick, 12_000);
}
export function stopWinFeed() {
  clearTimeout(feed);
  feed = undefined;
}
