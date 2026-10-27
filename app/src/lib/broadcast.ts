// Platform-wide win announcements (stand-in for the server's broadcast channel). Every win in any room
// or game goes out to every room; rooms show them one at a time as a banner near the top.
// The feed also simulates other people's wins so the prototype shows what other rooms would see.
import { useSyncExternalStore } from 'react';

import { ROOMS, USERS, roomById } from '@/data/mock';

export type WinNews = {
  id: string;
  userName: string;
  avatar?: string;
  /** "Lucky › Uğur Böceği", "Oyun Merkezi › Şans Çarkı" … */
  source: string;
  roomTitle?: string;
  mult?: number;
  amount: number;
  /** Several wins in one send, shown as a count. */
  wins?: number;
  /** When it was announced (ms); old news is skipped instead of shown late. */
  at: number;
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
export const roomTitleOf = (roomId: string) => (roomId === 'yeni' ? 'Benim Odam' : (roomById(roomId)?.title ?? ''));

// --- Simulated wins from other rooms (prototype only) --------------------------------------------
const FAKE_SOURCES: { source: string; price: number; mults: number[] }[] = [
  { source: 'Lucky › Şans Yoncası', price: 20, mults: [2, 5, 10, 20, 50, 100] },
  { source: 'Lucky › Uğur Böceği', price: 100, mults: [2, 5, 10, 20, 50, 100, 1000] },
  { source: 'Lucky › Altın Nal', price: 500, mults: [2, 5, 10, 20] },
  { source: 'Oyun Merkezi › Şans Çarkı', price: 100, mults: [2, 3, 5, 10] },
  { source: 'Oyun Merkezi › Dragon Tiger', price: 500, mults: [2, 8] },
];
let feed: ReturnType<typeof setTimeout> | undefined;
export function startWinFeed() {
  if (feed) return;
  const tick = () => {
    const u = USERS[Math.floor(Math.random() * USERS.length)];
    const s = FAKE_SOURCES[Math.floor(Math.random() * FAKE_SOURCES.length)];
    const mult = s.mults[Math.floor(Math.random() * s.mults.length)];
    const room = ROOMS[Math.floor(Math.random() * ROOMS.length)];
    announceWin({ userName: u.name, avatar: u.avatar, source: s.source, roomTitle: room.title, mult, amount: s.price * mult });
    feed = setTimeout(tick, 25_000 + Math.random() * 25_000);
  };
  feed = setTimeout(tick, 12_000);
}
export function stopWinFeed() {
  clearTimeout(feed);
  feed = undefined;
}
