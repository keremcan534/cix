// Live mode (lib/live): Similar Ekibi and the Odalar banners on the server (server/api/team.mjs). The management
// writes notices (events, updates, rewards, rules, announcements) for everyone or for one person; Mesajlar ›
// Similar Ekibi lists them, and an everyone notice may run as an Odalar banner with the top agencies, receivers
// and senders of the day, week and month. Only lib/api and lib/live/profile are used, so Node tests can run this.
import * as api from '@/lib/api';

import { uploadPhoto, type PickedImage } from '@/lib/live/profile';

export type TeamKind = 'event' | 'update' | 'reward' | 'rule' | 'notice';
export type TeamNotice = {
  id: string;
  kind: TeamKind;
  title: string;
  body: string;
  imageUrl: string | null;
  link: string | null;
  personal: boolean;
  createdAt: string;
  /** SimilarClub Sistem's own notices (server/api/system-notices.mjs): what it tells of and its figures; older servers send neither. */
  category?: string;
  data?: Record<string, unknown>;
  system?: boolean;
};
export type BannerEvent = TeamNotice & { endsAt: string };
export type BoardKey = 'agency' | 'charm' | 'wealth';
export type BoardPeriod = 'day' | 'week' | 'month';
type Named = { id: string; name: string; avatarUrl: string | null };
/** A person's row (charm, wealth) or an agency's (agency). */
export type BoardRow = { rank: number; score: number; user?: Named; agency?: Named };
/** Banner Yönetimi's colour for the button and rim (server/api/banners.mjs ACCENTS). */
export type BannerAccent = 'mor' | 'pembe' | 'altin' | 'turkuaz';
/** One of the management's banners (server/api/banners.mjs phoneView): an uploaded picture or one of the app's own. */
export type AdminBanner = {
  id: string;
  title: string;
  subtitle: string;
  cta: string;
  link: string | null;
  imageUrl: string | null;
  art: string | null;
  showText: boolean;
  accent: BannerAccent;
};
export type RoomBanners = { events: BannerEvent[]; boards: Record<BoardKey, Record<BoardPeriod, BoardRow[]>>; banners?: AdminBanner[] };

const ACCENTS: BannerAccent[] = ['mor', 'pembe', 'altin', 'turkuaz'];
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
/** The banners of an answer, read defensively: anything malformed is left out, never shown half. */
export function bannersOf(v: unknown): AdminBanner[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): AdminBanner[] => {
    if (!x || typeof x !== 'object') return [];
    const b = x as Record<string, unknown>;
    const id = str(b.id, 24);
    const title = str(b.title, 80);
    const imageUrl = typeof b.imageUrl === 'string' && /^https:\/\//.test(b.imageUrl) ? b.imageUrl : null;
    const art = typeof b.art === 'string' && /^[a-z0-9-]{1,40}$/.test(b.art) ? b.art : null;
    if (!id || !title || (!imageUrl && !art)) return [];
    const link = typeof b.link === 'string' && b.link.startsWith('/') ? b.link : null;
    return [{ id, title, subtitle: str(b.subtitle, 160), cta: link ? str(b.cta, 30) : '', link, imageUrl, art, showText: b.showText !== false, accent: ACCENTS.includes(b.accent as BannerAccent) ? (b.accent as BannerAccent) : 'mor' }];
  });
}

export const TEAM_KINDS: TeamKind[] = ['event', 'update', 'reward', 'rule', 'notice'];
export const TEAM_KIND_LABEL: Record<TeamKind, string> = { event: 'Etkinlik', update: 'Güncelleme', reward: 'Ödül', rule: 'Kural', notice: 'Duyuru' };

/** The Odalar banners; ?banners=1 asks for Banner Yönetimi's apart (an older app gets them as notice slides). */
export const roomBanners = () =>
  api.apiRequest<RoomBanners>('GET', '/api/room-banners?banners=1').then((d) => ({ ...d, banners: bannersOf(d.banners) }));
/** Banners shown in this run of the app, told once (the server counts each person once a day). */
const seenSent = new Set<string>();
export function bannerSeen(id: string) {
  if (seenSent.has(id)) return;
  seenSent.add(id);
  api.apiRequest('POST', '/api/banners/seen', { ids: [id] }).catch(() => seenSent.delete(id));
}
export const bannerClick = (id: string) => void api.apiRequest('POST', '/api/banners/click', { id }).catch(() => {});

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
