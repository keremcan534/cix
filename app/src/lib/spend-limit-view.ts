// Günlük harcama limiti in a live build (server/api/spend-limit.mjs): when a change applies, and the words Ayarlar
// shows under the choices. The server keeps and enforces the limit; this only explains it. Pure, so the node tests
// can check it.
import { fmtDate } from '@/lib/admin-format';
import type { ServerSpendLimit } from '@/lib/api';

/** The choices Ayarlar offers (the demo's): 0 is no limit. */
export const LIMIT_OPTIONS = [0, 500, 2000, 10000] as const;

const fmt = (n: number) => n.toLocaleString('tr-TR');
const reach = (n: number | null) => (n === null || n === 0 ? Infinity : n);

/** As the server decides: lowering (or a first limit) now, raising or lifting after the wait. */
export function limitApplies(current: number | null, want: number): 'now' | 'later' {
  return reach(want) <= reach(current) ? 'now' : 'later';
}

/** The rule, said once under the choices. */
export const limitRule = (hours = 24) =>
  `Limiti düşürmek hemen, artırmak veya kaldırmak ${hours} saat sonra geçerli olur. Limit dolunca hediye, ücretli mesaj ve arama, oyun, şanslı çanta ve mağaza harcamaları Türkiye saatiyle gece yarısına kadar durur.`;

/** Today's spending, a waiting change, and the rule. */
export function limitFooter(s: ServerSpendLimit, now = new Date()): string {
  const parts: string[] = [];
  parts.push(s.limit === null ? `Bugün ${fmt(s.spentToday)} jeton harcadın.` : `Bugün ${fmt(s.spentToday)} / ${fmt(s.limit)} jeton harcadın · kalan ${fmt(s.left ?? 0)}.`);
  if (s.next) parts.push(s.next.limit === null ? `Limitin ${fmtDate(s.next.at, now)} tarihinde kalkacak.` : `Yeni limitin (${fmt(s.next.limit)} jeton) ${fmtDate(s.next.at, now)} tarihinde geçerli olacak.`);
  parts.push(limitRule(s.raiseHours));
  return parts.join(' ');
}

/** What to ask before a change that waits, or null when it applies at once. */
export function confirmRaise(s: Pick<ServerSpendLimit, 'limit' | 'raiseHours'>, want: number): { title: string; message: string } | null {
  if (limitApplies(s.limit, want) === 'now') return null;
  const now = s.limit === null ? 'limitsiz' : `${fmt(s.limit)} jeton`;
  return {
    title: want === 0 ? 'Limiti kaldır' : 'Limiti artır',
    message: `${want === 0 ? 'Limitin kaldırılması' : `${fmt(want)} jetonluk limit`} ${s.raiseHours} saat sonra geçerli olur. O zamana kadar günlük limitin ${now} olarak kalır.`,
  };
}
