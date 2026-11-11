// Ajans sohbet grubu in live mode (server/api/agency-chat.mjs): each approved agency's private group for its
// streamers, its owner and its staff. The server decides who is in it; a sub-agency has its own group.
import * as api from '@/lib/api';

import type { AgencyChatMember, AgencyChatMessage, AgencyGroup } from '@/lib/agency-chat-view';

export * from '@/lib/agency-chat-view';

export const groups = () => api.apiRequest<{ groups: AgencyGroup[] }>('GET', '/api/agency/chat/groups').then((r) => r.groups);
export const chat = (id: string, after?: string) =>
  api.apiRequest<{ messages: AgencyChatMessage[] }>('GET', `/api/agency/chat?id=${encodeURIComponent(id)}${after ? `&after=${encodeURIComponent(after)}` : ''}`).then((r) => r.messages);
export const say = (id: string, text: string) => api.apiRequest<{ message: AgencyChatMessage }>('POST', '/api/agency/chat', { id, text }).then((r) => r.message);
export const members = (id: string) => api.apiRequest<{ members: AgencyChatMember[] }>('GET', `/api/agency/chat/members?id=${encodeURIComponent(id)}`).then((r) => r.members);
