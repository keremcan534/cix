// What the "Ben" tab and my own profile show about me, as plain rules (tests/profile-affiliation.test.ts).
// With a server (live mode) every number and link here comes from the server: my follower counts and id
// (lib/live/me-stats), my agency (GET /api/agency/me) and my profile (GET /api/me). The demo data in data/mock,
// data/agency and data/profile stays for the offline demo only.
import { ROLE_LABEL } from '@/data/agency';
import { MOMENTS, type User } from '@/data/mock';
import { profileCompletion, profileExtras, type ProfileExtras } from '@/data/profile';
import type { Me } from '@/lib/agency-net';
import type { ServerMe } from '@/lib/api';

/** /api/me as it may grow: a verified flag and the birth date are read when the server sends them. */
export type ServerMeView = ServerMe & { verified?: boolean; birthDate?: string | null };

/**
 * The server profile as the phone's own profile (`me`). Every field is the server's, empty when the person never
 * filled it in, so nothing of the demo profile (the 'sen' handle, a sample birth date, a blue tick) survives a
 * sign-in. verified stays false until the server itself says so.
 */
export function profileFromServer(u: ServerMeView): Partial<User> {
  return {
    name: u.name,
    bio: u.bio,
    interests: u.interests,
    gender: u.gender ?? undefined,
    age: u.age ?? 0,
    city: u.city ?? '',
    username: u.username ?? '',
    avatar: u.avatarUrl ?? '',
    birthDate: u.birthDate ? u.birthDate.slice(0, 10) : '',
    joinedAt: u.createdAt ? u.createdAt.slice(0, 10) : '',
    verified: u.verified === true,
  };
}

/** My agency as the profile pill shows it. */
export type AgencyLink = { id: string; name: string; role: 'owner' | 'staff' | 'member' };
export const AGENCY_ROLE_TEXT: Record<AgencyLink['role'], string> = { owner: ROLE_LABEL.owner, staff: 'Ajans ekibi', member: ROLE_LABEL.member };

/**
 * My agency from the server's answer (GET /api/agency/me, the same one /ajans shows): an approved (or suspended)
 * agency I own or work for, else the agency I stream for. A draft or an application still waiting is not one yet.
 */
export function agencyLinkOf(d: Me | null): AgencyLink | null {
  if (!d) return null;
  const live = (a: Me['agencies'][number]) => a.status === 'approved' || a.status === 'suspended';
  const run = d.agencies.find((a) => a.viewer === 'owner' && live(a)) ?? d.agencies.find((a) => a.viewer === 'staff' && live(a));
  if (run) return { id: run.id, name: run.name, role: run.viewer === 'owner' ? 'owner' : 'staff' };
  if (d.membership) return { id: d.membership.agency.id, name: d.membership.agency.name, role: 'member' };
  return null;
}

/** A row of the Ben menu. */
export type MenuFlags = {
  agencyOnly?: boolean;
  noAgencyOnly?: boolean;
  /** Admin screen: shown in demo builds only (lib/build). */
  demoOnly?: boolean;
  /** Example data only: hidden when the app talks to the server. */
  localOnly?: boolean;
};
/** `hasAgency` null: the server's answer is not in yet, so neither agency row shows (no "join" flash for an owner). */
export function rowVisible(m: MenuFlags, ctx: { demo: boolean; live: boolean; hasAgency: boolean | null }) {
  if (m.demoOnly && !ctx.demo) return false;
  if (m.localOnly && ctx.live) return false;
  if (m.agencyOnly) return ctx.hasAgency === true;
  if (m.noAgencyOnly) return ctx.hasAgency === false;
  return true;
}

// The server keeps none of the extra profile fields (height, job, tags…): in live mode none of them count.
const NO_EXTRAS: ProfileExtras = { height: 0, weight: 0, job: '', languages: [], zodiac: '', slogan: null, tags: [], relationship: '', education: '', birthday: '' };

/** Profile completion (%) from what is filled in; the same count as my profile screen (data/profile). */
export function myCompletion(me: User, live: boolean) {
  // The server keeps no photo posts on a profile yet, so none count in live mode either.
  const photos = live ? 0 : MOMENTS.filter((m) => m.userId === me.id && m.image).length;
  return profileCompletion(me, live ? NO_EXTRAS : profileExtras(me), photos);
}
