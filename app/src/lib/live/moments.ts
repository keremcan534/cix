// Live mode (lib/live): Anlar on the server (server/api/moments.mjs). Posts, likes and comments are the server's;
// the screen (app/(tabs)/anlar) shows what it answers and never keeps a post the server refused.
// Ids here are server ids. Only lib/api, lib/live/profile (photo upload) and data/mock are used, so the unit tests can run this under Node.
import * as api from '@/lib/api';
import { putServerUser } from '@/data/mock';

import { uploadPhoto, type PickedImage } from '@/lib/live/profile';

export type MomentAuthor = { id: string; name: string; avatarUrl: string | null; gender: 'Kadın' | 'Erkek' | null; age: number | null; vipLevel: number; frame: string | null };
export type LiveMoment = {
  id: string;
  author: MomentAuthor;
  text: string;
  imageUrl: string | null;
  topic: string | null;
  likes: number;
  comments: number;
  liked: boolean;
  createdAt: string;
};
export type LiveComment = { id: string; author: MomentAuthor; text: string; createdAt: string };
/** Önerilen = popular (the last 7 days by likes and comments), Son = recent, Arkadaşlar = friends (whom I follow, and me). */
export type FeedTab = 'popular' | 'recent' | 'friends';

/** What this phone knows about a writer, so their profile and chat open with their name and photo. */
function know(a: MomentAuthor) {
  putServerUser({ id: a.id, name: a.name, ...(a.avatarUrl && { avatar: a.avatarUrl }), ...(a.gender && { gender: a.gender }), ...(typeof a.age === 'number' && { age: a.age }) });
}

export async function feed(q: { tab?: FeedTab; topic?: string | null; user?: string; before?: string }): Promise<LiveMoment[]> {
  const p = new URLSearchParams();
  if (q.tab) p.set('tab', q.tab);
  if (q.topic) p.set('topic', q.topic);
  if (q.user) p.set('user', q.user);
  if (q.before) p.set('before', q.before);
  const r = await api.apiRequest<{ moments: LiveMoment[] }>('GET', `/api/moments?${p}`);
  r.moments.forEach((m) => know(m.author));
  return r.moments;
}

/** A new post; the photo (if any) goes to the storage first. `ref` makes a retry of the same post count once. */
export async function post(text: string, image: PickedImage | null, topic: string | null, ref = api.newRef()): Promise<LiveMoment> {
  const imageUrl = image ? await uploadPhoto('moment', image) : null;
  const r = await api.apiRequest<{ moment: LiveMoment }>('POST', '/api/moments', { text, ref, ...(imageUrl && { imageUrl }), ...(topic && { topic }) });
  return r.moment;
}

export const remove = (id: string) => api.apiRequest<{ deleted: true }>('POST', '/api/moments/delete', { id });

export const like = (id: string, on: boolean) => api.apiRequest<{ liked: boolean; likes: number }>('POST', '/api/moments/like', { id, like: on });

export async function comments(id: string): Promise<LiveComment[]> {
  const r = await api.apiRequest<{ comments: LiveComment[] }>('GET', `/api/moments/comments?id=${encodeURIComponent(id)}`);
  r.comments.forEach((c) => know(c.author));
  return r.comments;
}

/** Resolves with the post's comments as the server now has them (mine included). */
export async function comment(id: string, text: string, ref = api.newRef()): Promise<LiveComment[]> {
  const r = await api.apiRequest<{ comments: LiveComment[] }>('POST', '/api/moments/comment', { id, text, ref });
  r.comments.forEach((c) => know(c.author));
  return r.comments;
}

export const removeComment = (id: string) => api.apiRequest<{ deleted: true }>('POST', '/api/moments/comment/delete', { id });

/** "5 dakika önce", "3 saat önce", "2 gün önce", or the date for older posts. */
export function agoText(iso: string, now = Date.now()) {
  const min = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (min < 1) return 'şimdi';
  if (min < 60) return `${min} dakika önce`;
  if (min < 1440) return `${Math.floor(min / 60)} saat önce`;
  if (min < 7 * 1440) return `${Math.floor(min / 1440)} gün önce`;
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
