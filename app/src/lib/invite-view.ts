// Arkadaşını Getir and the first-purchase gift as the screens say them: the code a person types, the steps, the line
// under "Seni … davet etti", and a pack's gift. Pure, so the node tests load it. The server decides everything
// (server/api/referrals.mjs); these only word its answers.
import type { MyInvite, ServerRewards } from '@/lib/api';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** "simi-ab2 c3d", "AB2C3D" → "SIMI-AB2C3D" (the server's codeOf); null when it can't be a code. */
export function cleanInviteCode(text: string): string | null {
  if (text.length > 40) return null;
  const s = text.toUpperCase().replace(/[\s-]/g, '').replace(/^SIMI/, '');
  return s.length === 6 && [...s].every((ch) => ALPHABET.includes(ch)) ? `SIMI-${s}` : null;
}

const n = (x: number) => x.toLocaleString('tr-TR');

/** "Nasıl çalışır?" in three steps. `enterDays`: a live build, where the code also goes in from Davet after sign-up. */
export function inviteSteps(coins: number, enterDays?: number): string[] {
  return [
    'Kodunu ya da davet bağlantını arkadaşınla paylaş.',
    enterDays ? `Arkadaşın kayıt olurken ya da ilk ${enterDays} gün içinde Davet ekranından kodunu girsin.` : 'Arkadaşın kayıt olurken kodunu girsin.',
    `İlk odasına girdiğinde ikinize de ${n(coins)} jeton gelir.`,
  ];
}

/** The line under "Seni … davet etti": where the invite I entered stands. */
export function myInviteText(mine: Pick<MyInvite, 'status' | 'reason' | 'coins'>, coins: number): string {
  switch (mine.status) {
    case 'pending':
      return `İlk odana girdiğinde ikinize de ${n(coins)} jeton gelir.`;
    case 'paid':
      return `İkinize de ${n(mine.coins)} jeton verildi.`;
    case 'refused':
      return mine.reason === 'device' ? 'Bu telefonda daha önce başka bir hesap açıldığı için davet ödülü verilmedi.' : 'Bu davet için ödül verilmedi.';
    case 'revoked':
      return 'Davet ödülü geri alındı.';
    default:
      return '';
  }
}

/** A pack's first-purchase gift for me (0: none, or not known yet). */
export const firstBonusOf = (rewards: ServerRewards | null, productId: string) => (rewards?.firstBonus.on ? (rewards.firstBonus.packs.find((p) => p.productId === productId)?.bonus ?? 0) : 0);

/**
 * Görevler's "Ödüllü davet" line: the demo's, or in a live build the server's amount (a plain line until it is read).
 * Null while the owner has invite rewards switched off: no banner then.
 */
export function inviteBannerText(live: boolean, rewards: Pick<ServerRewards, 'invite'> | null): string | null {
  if (!live) return 'Arkadaşlarını davet et, kayıt ve gelir görevlerinden ödül kazan';
  if (!rewards) return 'Arkadaşını davet et, ikiniz de jeton kazanın';
  return rewards.invite.on ? `Arkadaşını davet et; ilk odasına girince ikinize de ${n(rewards.invite.coins)} jeton` : null;
}

/** The share text, the same in the demo and a live build. */
export const inviteMessage = (code: string) => `Similar Club'a katıl, sesli odalarda tanışalım! Kayıt olurken davet kodumu kullan: ${code} 🎙️`;
