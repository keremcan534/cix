// One place that decides whether the demo user may message, call, gift or invite someone.
// Order: own profile → my block → their account status → age → their privacy choice.
// The same rules must run on the server (the client check only explains why a button is off).
import type { User } from '@/data/mock';
import { followsMe, privacyOf } from '@/data/privacy';

export type Action = 'message' | 'voice' | 'video' | 'gift' | 'invite';
export type Check = { ok: true } | { ok: false; reason: string };

export const MIN_AGE = 18;

export function checkInteraction(action: Action, target: User, ctx: { blocked: Set<string>; following: Set<string>; myAge: number }): Check {
  if (target.id === 'me') return { ok: false, reason: 'Bu senin profilin.' };
  if (ctx.blocked.has(target.id)) return { ok: false, reason: `${target.name} kişisini engelledin. Engeli kaldırmadan mesaj, arama, hediye veya davet gönderemezsin.` };
  const p = privacyOf(target.id);
  if (p.status === 'suspended') return { ok: false, reason: 'Bu hesap askıya alındı; şu an etkileşime kapalı.' };
  if (p.status === 'restricted' && action !== 'message') return { ok: false, reason: 'Bu hesap geçici olarak kısıtlı; arama, hediye ve davet alamıyor.' };
  if (ctx.myAge < MIN_AGE) return { ok: false, reason: `Bu özellik ${MIN_AGE} yaş ve üzeri içindir.` };
  const theyFollowMe = followsMe(target.id);
  if (action === 'message') {
    if (p.dmFrom === 'following' && !theyFollowMe) return { ok: false, reason: `${target.name} yalnızca takip ettiği kişilerden mesaj alıyor.` };
    if (p.dmFrom === 'mutual' && !(theyFollowMe && ctx.following.has(target.id))) return { ok: false, reason: `${target.name} yalnızca karşılıklı takipleştiği kişilerden mesaj alıyor.` };
  }
  if (action === 'voice' || action === 'video') {
    if (p.callsFrom === 'nobody') return { ok: false, reason: `${target.name} şu an arama kabul etmiyor.` };
    if (p.callsFrom === 'following' && !theyFollowMe) return { ok: false, reason: `${target.name} yalnızca takip ettiği kişilerden arama alıyor.` };
  }
  if (action === 'invite') {
    if (p.invitesFrom === 'nobody') return { ok: false, reason: `${target.name} oda daveti almıyor.` };
    if (p.invitesFrom === 'following' && !theyFollowMe) return { ok: false, reason: `${target.name} yalnızca takip ettiği kişilerden oda daveti alıyor.` };
  }
  return { ok: true };
}
