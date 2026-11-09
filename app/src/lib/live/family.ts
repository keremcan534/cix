// Live mode (lib/live): Aile on the server (server/api/families.mjs, family-more.mjs). Families, members, requests,
// the family chat, the daily tasks, the weekly chests and the pairs are the server's; the screens (app/aile,
// app/kabile/*) show what it answers.
// Only lib/api and data/mock are used, so the unit tests can run this under Node.
import * as api from '@/lib/api';
import { putServerUser } from '@/data/mock';

export type FamilyRole = 'owner' | 'helper' | 'member';
export type FamilyPerson = { id: string; name: string; avatarUrl: string | null; gender: 'Kadın' | 'Erkek' | null };
export type LiveFamily = {
  id: string;
  name: string;
  announcement: string;
  joinMode: 'open' | 'approve';
  leader: { id: string; name: string; avatarUrl: string | null };
  members: number;
  power: number;
  weekly: number;
  level: number;
  capacity: number;
  createdAt: string;
  /** The leader's short tag beside the name ('' none) and the family's theme (data/kabile KABILE_THEMES). */
  tag: string;
  theme: string;
};
export type FamilyMember = FamilyPerson & { role: FamilyRole; joinedAt: string; weekly: number };
export type FamilyDetail = { family: LiveFamily | null; members: FamilyMember[]; myRole: FamilyRole | null; requested: boolean; requests: (FamilyPerson & { at: string })[] };
export type FamilyMessage = { id: string; author: FamilyPerson; text: string; createdAt: string };

export const ROLE_NAME: Record<FamilyRole, string> = { owner: 'Lider', helper: 'Yardımcı', member: 'Üye' };

/** What this phone knows about a person, so their profile opens with their name and photo. */
function know(p: FamilyPerson) {
  putServerUser({ id: p.id, name: p.name, ...(p.avatarUrl && { avatar: p.avatarUrl }), ...(p.gender && { gender: p.gender }) });
}

export const families = (q = '') =>
  api.apiRequest<{ families: LiveFamily[]; mine: string | null }>('GET', `/api/families${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);

/** A family (no id: mine; family null when I have none), its members, and the requests when I lead or help. */
export async function family(id?: string): Promise<FamilyDetail> {
  const r = await api.apiRequest<FamilyDetail>('GET', `/api/family${id ? `?id=${encodeURIComponent(id)}` : ''}`);
  r.members.forEach(know);
  r.requests.forEach(know);
  return r;
}

/** Founding a family takes the fee once, even when the request is sent again (`ref`). */
export const create = (name: string, ref: string) => api.apiRequest<{ family: LiveFamily | null; user: api.ServerUser }>('POST', '/api/families', { name, ref });
export const join = (id: string, on = true) => api.apiRequest<{ joined?: boolean; requested?: boolean }>('POST', '/api/family/join', { id, join: on });
export const answer = (userId: string, accept: boolean) => api.apiRequest<{ members: FamilyMember[] }>('POST', '/api/family/request', { userId, accept });
export const leave = () => api.apiRequest<{ left: true }>('POST', '/api/family/leave', {});
export const kick = (userId: string) => api.apiRequest<{ members: FamilyMember[] }>('POST', '/api/family/kick', { userId });
export const setRole = (userId: string, role: FamilyRole) => api.apiRequest<{ members: FamilyMember[] }>('POST', '/api/family/role', { userId, role });
export const settings = (s: { announcement?: string; joinMode?: 'open' | 'approve'; tag?: string; theme?: string }) => api.apiRequest<{ family: LiveFamily }>('POST', '/api/family/settings', s);

/** A daily task as the server counted it today (Turkey's day) from what I really did. */
export type FamilyTask = { id: string; progress: number; goal: number; per: number; kind: 'count' | 'rate'; done: boolean; points: number; doneBy: number };
export type FamilyChest = { id: string; need: number; coins: number; reached: boolean; claimed: boolean };
type Short = { id: string; name: string; avatarUrl: string | null };
/** GET /api/family/overview: my family's day and week. */
export type FamilyOverview = {
  tasks: FamilyTask[];
  me: { gifts: number; points: number };
  chests: FamilyChest[];
  week: { power: number; start: string };
  /** An estimate only (level rate × the week): paying it is a management decision. */
  bonus: { rate: number; pool: number };
  rank: number;
  room: { id: string; title: string; listeners: number } | null;
  highlights: (Short & { contribution: number })[];
  active: number;
  pairs: { a: Short; b: Short; kind: string; score: number }[];
  checkedIn: boolean;
};
export async function overview(): Promise<FamilyOverview> {
  const r = await api.apiRequest<FamilyOverview>('GET', '/api/family/overview');
  for (const x of [...r.highlights, ...r.pairs.flatMap((p) => [p.a, p.b])]) if (x) know({ ...x, gender: null });
  return r;
}
export const checkIn = () => api.apiRequest<{ checkedIn: true }>('POST', '/api/family/checkin', {});
/** Opens a weekly chest: reward coins (shop only), once per person and week; `ref` makes a retry safe. */
export const openChest = (chest: string, ref: string) => api.apiRequest<{ user: api.ServerUser; replay: boolean; coins: number }>('POST', '/api/family/chest', { chest, ref });

export async function chat(after?: string): Promise<FamilyMessage[]> {
  const r = await api.apiRequest<{ messages: FamilyMessage[] }>('GET', `/api/family/chat${after ? `?after=${encodeURIComponent(after)}` : ''}`);
  r.messages.forEach((m) => know(m.author));
  return r.messages;
}
export const say = (text: string) => api.apiRequest<{ message: FamilyMessage }>('POST', '/api/family/chat', { text }).then((r) => r.message);

/** May `me` (role `mine`) remove someone whose role is `theirs`? The leader removes anyone, a helper only members. */
export const mayKick = (mine: FamilyRole | null, theirs: FamilyRole) => mine === 'owner' ? theirs !== 'owner' : mine === 'helper' && theirs === 'member';
