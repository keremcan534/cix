// Live mode (lib/live): Aile on the server (server/api/families.mjs). Families, members, requests and the family
// chat are the server's; the screens (app/aile, app/kabile/sohbet) show what it answers.
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
export const settings = (s: { announcement?: string; joinMode?: 'open' | 'approve' }) => api.apiRequest<{ family: LiveFamily }>('POST', '/api/family/settings', s);

export async function chat(after?: string): Promise<FamilyMessage[]> {
  const r = await api.apiRequest<{ messages: FamilyMessage[] }>('GET', `/api/family/chat${after ? `?after=${encodeURIComponent(after)}` : ''}`);
  r.messages.forEach((m) => know(m.author));
  return r.messages;
}
export const say = (text: string) => api.apiRequest<{ message: FamilyMessage }>('POST', '/api/family/chat', { text }).then((r) => r.message);

/** May `me` (role `mine`) remove someone whose role is `theirs`? The leader removes anyone, a helper only members. */
export const mayKick = (mine: FamilyRole | null, theirs: FamilyRole) => mine === 'owner' ? theirs !== 'owner' : mine === 'helper' && theirs === 'member';
