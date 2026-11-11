// The Patron seat (Patron Koltuğu). Pure, so the node tests can check it.
//  - One person, one place: the holder is drawn on it only while they are in the room and on no numbered mic. On a
//    numbered mic they are drawn there and the Patron seat waits empty for them.
//  - Otomatik mode's rule (server/api/boss-rules.mjs bossStep): in a server room the server decides, in the gift's own
//    transaction, and every phone reads the holder from the room; the demo follows the same rule here, and
//    tests/patron-seat.test.ts holds both to the same answers.
//  - The sheet's words (in our own words) and the room chat's lines for what the server says happened.

/**
 * Who is drawn on the Patron seat: `holder` (as the server or the demo names them) when they are in the room
 * (`members`; my own phone is always in it) and not on one of `seats`; otherwise nobody.
 */
export function patronOnSeat(holder: string | null, seats: readonly (string | null)[], members: readonly string[]): string | null {
  if (!holder) return null;
  if (seats.includes(holder)) return null;
  return holder === 'me' || members.includes(holder) ? holder : null;
}

/** The seat's two modes: Otomatik (gifts decide) and Davet (the owner seats someone). */
export type BossMode = 'auto' | 'invite';
/** The demo's numbers, the server's defaults (server/api/live-registry.mjs boss_seat_coins, boss_seat_minutes). */
export const BOSS_SEAT_DEFAULTS = { coins: 25_000, minutes: 10 } as const;
/** The holder sits this long before anyone may take the seat. */
export const BOSS_HOLD_MS = 5_000;
/** A sitting: since / until in ms (until null: Davet, no end), `spent` the holder's coins in it. */
export type BossSitting = { holder: string; since: number; until: number | null; spent: number };
export type BossCfg = { coins: number; minutes: number };
export type BossStep = { seat: BossSitting | null; event: 'sat' | 'took' | 'extended' | null; before: string | null };

/**
 * The seat after one send of `coins` by `sender` (Otomatik): an empty seat takes a send of at least `cfg.coins`; the
 * holder's every send adds `cfg.minutes`; after BOSS_HOLD_MS someone else's single send larger than the holder's
 * spending in this sitting takes it. A sitting whose end passed is empty (`before`: its holder).
 */
export function bossStep(seat: BossSitting | null, send: { sender: string; coins: number }, cfg: BossCfg, now: number): BossStep {
  const coins = Number(send.coins);
  const term = cfg.minutes * 60_000;
  const ended = !!seat && seat.until !== null && seat.until <= now;
  const before = ended ? seat.holder : null;
  const current = seat && !ended ? seat : null;
  if (!Number.isSafeInteger(coins) || coins <= 0) return { seat: current, event: null, before };
  const sit = (event: 'sat' | 'took'): BossStep => ({ seat: { holder: send.sender, since: now, until: now + term, spent: coins }, event, before });
  if (!current) return coins >= cfg.coins ? sit('sat') : { seat: null, event: null, before };
  if (current.holder === send.sender) {
    if (current.until === null) return { seat: current, event: null, before };
    return { seat: { ...current, until: current.until + term, spent: current.spent + coins }, event: 'extended', before };
  }
  if (now - current.since > BOSS_HOLD_MS && coins > current.spent) return sit('took');
  return { seat: current, event: null, before };
}

const fmt = (n: number) => Math.round(n).toLocaleString('tr-TR');

/** "8 dakika", "1 dakikadan az"; null without an end. */
export function bossLeftText(seconds: number | null): string | null {
  if (seconds === null) return null;
  return seconds < 60 ? '1 dakikadan az' : `${Math.ceil(seconds / 60)} dakika`;
}

/** What one send must be right now to sit or take the seat (0: nothing to win: it is mine, or Davet). */
export function bossNeed(mode: BossMode, holder: string | null, spent: number, cfg: BossCfg): number {
  if (mode === 'invite' || holder === 'me') return 0;
  return holder ? Math.max(spent + 1, 1) : cfg.coins;
}

/** The sheet's head: the seat as I see it now. `name` is the holder's name; `left` seconds to the sitting's end. */
export function bossHeadline(v: { mode: BossMode; holder: string | null; name: string; left: number | null; spent: number; cfg: BossCfg }): { title: string; text: string } {
  const left = bossLeftText(v.left);
  if (v.mode === 'invite') {
    if (v.holder === 'me') return { title: 'Patron koltuğu senin', text: 'Oda sahibi seni koltuğa oturttu. İstediğin zaman kalkabilirsin.' };
    return { title: v.holder ? `Patron koltuğunda ${v.name}` : 'Patron koltuğu boş', text: 'Bu odada koltuğa yalnızca oda sahibi oturtur.' };
  }
  if (!v.holder) return { title: 'Patron koltuğu seni bekliyor', text: `Tek seferde ${fmt(v.cfg.coins)} jeton gönderirsen koltuğa oturursun.` };
  if (v.holder === 'me') return { title: 'Patron koltuğu senin', text: `${left ? `${left} kaldı. ` : ''}Koltuktayken gönderdiğin her hediye süreni ${v.cfg.minutes} dakika uzatır.` };
  return {
    title: `Patron koltuğunda ${v.name}`,
    text: `Koltuğu almak için tek seferde ${fmt(bossNeed('auto', v.holder, v.spent, v.cfg))} jeton gönder.${left ? ` Süresinin bitmesine ${left} var.` : ''}`,
  };
}

/** The rules of a mode, in our own words, for the sheet's "Nasıl işler?". */
export function bossRules(mode: BossMode, cfg: BossCfg, holdSeconds = BOSS_HOLD_MS / 1000): string[] {
  if (mode === 'invite') return ['Koltuğa yalnızca oda sahibi birini oturtur; bu modda hediyeler koltuğu değiştirmez.', 'Koltuktaki kişi istediğinde kalkar, oda sahibi de indirebilir.'];
  return [
    `Koltuk boşken tek seferde en az ${fmt(cfg.coins)} jetonluk hediye gönderen koltuğa oturur.`,
    `Koltukta ${cfg.minutes} dakika kalınır. Koltuktayken gönderilen her hediye süreyi ${cfg.minutes} dakika uzatır.`,
    `Koltuk ${holdSeconds} saniyeden uzun süredir doluysa başkası alabilir: tek seferde, oturanın bu oturuşta gönderdiğinin toplamından fazlasını göndermesi yeter.`,
  ];
}

/** What the server said happened to the seat (server/api/boss-seat.mjs 'boss' packet; lib/live/room-bus parseServerBoss). */
export type BossNews = { event: 'sat' | 'took' | 'expired' | 'left' | 'removed' | 'mode'; user: string | null; name: string | null; mode: BossMode | 'off' | null };

/** The room chat's line for it; null when it says nothing. */
export function bossLine(n: Pick<BossNews, 'event' | 'name' | 'mode'>): string | null {
  const name = n.name || 'Bir üye';
  switch (n.event) {
    case 'sat':
      return `👑 ${name} patron koltuğuna oturdu`;
    case 'took':
      return `👑 ${name} patron koltuğunu aldı`;
    case 'expired':
      return `${name} için patron koltuğunun süresi doldu`;
    case 'left':
      return `${name} patron koltuğundan kalktı`;
    case 'removed':
      return `${name} patron koltuğundan indirildi`;
    case 'mode':
      return n.mode === 'auto' ? '👑 Patron koltuğu otomatik modda' : n.mode === 'invite' ? '👑 Patron koltuğu davet modunda' : n.mode === 'off' ? 'Patron koltuğu kapatıldı' : null;
    default:
      return null;
  }
}
