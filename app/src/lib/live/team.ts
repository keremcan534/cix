// Live mode (lib/live): Similar Ekibi and the Odalar banners on the server (server/api/team.mjs). The management
// writes notices (events, updates, rewards, rules, announcements) for everyone or for one person; Mesajlar ›
// Similar Ekibi lists them, and an everyone notice may run as an Odalar banner with the top agencies, receivers
// and senders of the day, week and month. Only lib/api and lib/live/profile are used, so Node tests can run this.
import * as api from '@/lib/api';

import { uploadPhoto, type PickedImage } from '@/lib/live/profile';

export type TeamKind = 'event' | 'update' | 'reward' | 'rule' | 'notice';
export type TeamNotice = { id: string; kind: TeamKind; title: string; body: string; imageUrl: string | null; link: string | null; personal: boolean; createdAt: string };
export type BannerEvent = TeamNotice & { endsAt: string };
export type BoardKey = 'agency' | 'charm' | 'wealth';
export type BoardPeriod = 'day' | 'week' | 'month';
type Named = { id: string; name: string; avatarUrl: string | null };
/** A person's row (charm, wealth) or an agency's (agency). */
export type BoardRow = { rank: number; score: number; user?: Named; agency?: Named };
export type RoomBanners = { events: BannerEvent[]; boards: Record<BoardKey, Record<BoardPeriod, BoardRow[]>> };

export const TEAM_KINDS: TeamKind[] = ['event', 'update', 'reward', 'rule', 'notice'];
export const TEAM_KIND_LABEL: Record<TeamKind, string> = { event: 'Etkinlik', update: 'Güncelleme', reward: 'Ödül', rule: 'Kural', notice: 'Duyuru' };

export const roomBanners = () => api.apiRequest<RoomBanners>('GET', '/api/room-banners');

/** A page of my notices, newest first (`before`: the last id of the page shown), and how many are new. */
export const teamPage = (before?: string) => api.apiRequest<{ notices: TeamNotice[]; unread: number }>('GET', `/api/team${before ? `?before=${encodeURIComponent(before)}` : ''}`);
export const teamUnread = () => api.apiRequest<{ unread: number }>('GET', '/api/team/unread').then((r) => r.unread);
/** Everything up to `upTo` (the newest shown) is seen; resolves with what is still new. */
export const markTeamSeen = (upTo: string) => api.apiRequest<{ unread: number }>('POST', '/api/team/seen', { upTo }).then((r) => r.unread);

// --- Yönetim › Duyurular (admins) ---------------------------------------------------------------------------------
export type AdminTeamNotice = TeamNotice & { target: { id: string; name: string } | null; banner: boolean; endsAt: string | null; by: string | null };
export type TeamDraft = { kind: TeamKind; title: string; body: string; link?: string; target?: string; bannerDays?: number; image?: PickedImage | null };

export const adminTeam = () => api.apiRequest<{ notices: AdminTeamNotice[] }>('GET', '/api/admin/team').then((r) => r.notices);

/** Sends a notice; its picture (if any) goes to the storage first. */
export async function sendTeamNotice(d: TeamDraft) {
  const imageUrl = d.image ? await uploadPhoto('notice', d.image) : null;
  const body = {
    kind: d.kind,
    title: d.title.trim(),
    body: d.body.trim(),
    ...(imageUrl && { imageUrl }),
    ...(d.link?.trim() && { link: d.link.trim() }),
    ...(d.target?.trim() && { target: d.target.trim() }),
    ...(d.bannerDays && { bannerDays: d.bannerDays }),
  };
  return (await api.apiRequest<{ notice: TeamNotice }>('POST', '/api/admin/team', body)).notice;
}

export const removeTeamNotice = (id: string) => api.apiRequest<{ removed: true }>('POST', '/api/admin/team/remove', { id });
