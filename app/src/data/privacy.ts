// Other people's privacy choices and account status, as the server would return them with a profile.
// The demo user's own choices live in Settings (store); these are the mock values for everyone else.
import { FOLLOWS_ME } from '@/data/mock';

export type DmFrom = 'everyone' | 'following' | 'mutual';
export type CallsFrom = 'everyone' | 'following' | 'nobody';
export type InvitesFrom = 'everyone' | 'following' | 'nobody';
export type AccountStatus = 'active' | 'restricted' | 'suspended';

export type Privacy = {
  showOnline: boolean;
  showLastSeen: boolean;
  showCurrentRoom: boolean;
  /** Who may send them a private message ("following" = people they follow). */
  dmFrom: DmFrom;
  callsFrom: CallsFrom;
  invitesFrom: InvitesFrom;
  status: AccountStatus;
};

const DEFAULT: Privacy = { showOnline: true, showLastSeen: true, showCurrentRoom: true, dmFrom: 'everyone', callsFrom: 'everyone', invitesFrom: 'everyone', status: 'active' };

// A few demo users with stricter settings, so every rule can be tried from a profile.
const OVERRIDES: Record<string, Partial<Privacy>> = {
  u3: { dmFrom: 'following', callsFrom: 'following' }, // Zeynep: only people she follows
  u6: { callsFrom: 'nobody', showLastSeen: false }, // Burak: no calls
  u9: { showOnline: false, showCurrentRoom: false }, // Deniz: hides status and room
  u10: { status: 'restricted' }, // Kaan: temporarily restricted account
  u11: { invitesFrom: 'following' },
};

export const privacyOf = (userId: string): Privacy => ({ ...DEFAULT, ...OVERRIDES[userId] });

/** Does this person follow the demo user (their "following" list includes me)? */
export const followsMe = (userId: string) => FOLLOWS_ME.has(userId);

export const DM_FROM_LABEL: Record<DmFrom, string> = { everyone: 'Herkes', following: 'Takip ettiklerim', mutual: 'Karşılıklı takip' };
export const CALLS_FROM_LABEL: Record<CallsFrom, string> = { everyone: 'Herkes', following: 'Takip ettiklerim', nobody: 'Kimse' };
