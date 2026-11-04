// Bağlar: two people tied as Çift, Kardeş, Ağabey, Kanka… The server (server/api/bonds.mjs) is the source of
// truth in live mode; these are the same kinds, prices and level steps for the screens and the offline demo.
// Points: every 100 coins the two spend on each other is 1 point, talking back and forth up to 10 a day.
import type Ionicons from '@expo/vector-icons/Ionicons';

import { USERS } from '@/data/mock';
import { seedOf } from '@/data/profile';

export type BondKind = 'cift' | 'kardes' | 'baci' | 'agabey' | 'abla' | 'yenge' | 'enishte' | 'kanka';
type IconName = keyof typeof Ionicons.glyphMap;
export type BondKindInfo = { label: string; gift: string; price: number; max: number; icon: IconName };

/** Same as KINDS in server/api/bonds.mjs. */
export const BOND_KINDS: Record<BondKind, BondKindInfo> = {
  cift: { label: 'Çift', gift: 'Bağ Yüzüğü', price: 5000, max: 1, icon: 'heart' },
  kardes: { label: 'Kardeş', gift: 'Kardeş Bilekliği', price: 1000, max: 3, icon: 'people' },
  baci: { label: 'Bacı', gift: 'Bacı Kolyesi', price: 1000, max: 3, icon: 'flower' },
  agabey: { label: 'Ağabey', gift: 'Ağabey Saati', price: 1000, max: 3, icon: 'shield' },
  abla: { label: 'Abla', gift: 'Abla Broşu', price: 1000, max: 3, icon: 'sparkles' },
  yenge: { label: 'Yenge', gift: 'Yenge Çiçeği', price: 1000, max: 3, icon: 'rose' },
  enishte: { label: 'Enişte', gift: 'Enişte Kravatı', price: 1000, max: 3, icon: 'ribbon' },
  kanka: { label: 'Kanka', gift: 'Kanka Rozeti', price: 500, max: 5, icon: 'hand-left' },
};
export const BOND_ORDER = Object.keys(BOND_KINDS) as BondKind[];
export const isBondKind = (k: string): k is BondKind => Object.hasOwn(BOND_KINDS, k);

/** Points needed for Lv1…Lv10 (server LEVELS). */
export const BOND_LEVELS = [0, 10, 30, 60, 100, 200, 400, 700, 1200, 2000];
export const bondLevel = (score: number) => BOND_LEVELS.reduce((lv, need, i) => (score >= need ? i + 1 : lv), 1);
export const nextLevelAt = (level: number): number | null => BOND_LEVELS[level] ?? null;

export type BondReward = { level: number; id: 'rozet' | 'mikrofon' | 'cerceve' | 'giris' | 'balon'; label: string };
export const BOND_REWARDS: BondReward[] = [
  { level: 2, id: 'rozet', label: 'Profil rozeti' },
  { level: 4, id: 'mikrofon', label: 'Yan yana mikrofonda bağ çizgisi' },
  { level: 6, id: 'cerceve', label: 'Profil çerçevesi' },
  { level: 8, id: 'giris', label: 'Odaya birlikte giriş efekti' },
  { level: 10, id: 'balon', label: 'Özel sohbet balonu' },
];
export const hasReward = (level: number, id: BondReward['id']) => level >= (BOND_REWARDS.find((r) => r.id === id)?.level ?? Infinity);

export const BOND_RULES = [
  'Bağ isteği bir bağ hediyesiyle gider; karşı taraf kabul edince hediye ona geçer.',
  'Reddedilirse, geri çekilirse ya da 3 gün içinde yanıtlanmazsa jetonların geri gelir.',
  'Birbirinize gönderdiğiniz her 100 jeton 1 puan; karşılıklı mesajlaşma günde en fazla 10 puan.',
  'Puan düşmez. Bağı iki taraf da istediği zaman bitirebilir: seviye ve ödüller sıfırlanır, jeton iadesi olmaz.',
  'Biten bir bağ aynı kişiyle 7 gün sonra yeniden kurulabilir.',
];

export type BondStatus = 'pending' | 'active' | 'refused' | 'expired' | 'withdrawn' | 'ended';
/** A bond as one side sees it: `partnerId` is the other person (a local id: 'me', u1… or a server id). */
export type Bond = {
  id: string;
  kind: BondKind;
  status: BondStatus;
  /** I asked (outgoing request), or the profile owner asked when viewing someone else. */
  requester: boolean;
  partnerId: string;
  price: number;
  score: number;
  level: number;
  nextLevelAt: number | null;
  /** When it was accepted (active bonds). */
  since: string | null;
  expiresAt: string | null;
};

/** Whole days since `since` (at least 1 on the first day). */
export const bondDays = (since: string | null, now: number) => (since ? Math.max(1, Math.ceil((now - Date.parse(since)) / 86_400_000)) : 0);
/** Çift first, then the others by level. */
export const sortBonds = (l: Bond[]) => [...l].sort((x, y) => Number(y.kind === 'cift') - Number(x.kind === 'cift') || y.level - x.level || y.score - x.score);
/** The highest level among active bonds (profile badge and frame). */
export const topBond = (l: Bond[]) => sortBonds(l.filter((b) => b.status === 'active')).sort((x, y) => y.level - x.level)[0] ?? null;

const demoBond = (id: string, partnerId: string, kind: BondKind, score: number, days: number, now: number): Bond => {
  const level = bondLevel(score);
  return { id, kind, status: 'active', requester: false, partnerId, price: BOND_KINDS[kind].price, score, level, nextLevelAt: nextLevelAt(level), since: new Date(now - days * 86_400_000).toISOString(), expiresAt: null };
};

/** Offline demo: a few bonds per person, the same every time for the same id. */
export function demoBondsOf(id: string, now: number): Bond[] {
  if (id === 'me') {
    return [demoBond('d-me-1', 'u1', 'cift', 75, 8, now), demoBond('d-me-2', 'u2', 'kanka', 22, 21, now), demoBond('d-me-3', 'u9', 'kardes', 4, 5, now)];
  }
  const s = seedOf(id);
  const others = USERS.filter((u) => u.id !== id);
  if (!others.length) return [];
  const at = (k: number) => others[(s + k) % others.length].id;
  const kinds = BOND_ORDER.filter((k) => k !== 'cift');
  const list: Bond[] = [];
  if (s % 3 !== 0) list.push(demoBond(`d-${id}-1`, at(1), 'cift', (s % 120) + 10, (s % 90) + 1, now));
  list.push(demoBond(`d-${id}-2`, at(3), kinds[s % kinds.length], (s % 40) + 2, (s % 40) + 3, now));
  if (s % 2 === 0) list.push(demoBond(`d-${id}-3`, at(5), kinds[(s + 1) % kinds.length], s % 9, (s % 12) + 1, now));
  return list;
}
