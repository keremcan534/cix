// Global hediye (server/api/global-gifts.mjs): a gift the admins marked global is told, once paid, to every phone of
// the sender's country on the live line (opened with ?global=1, lib/api LIVE_LINE): a banner on top of the room I am
// in (lib/broadcast, components/fx/global-gift-banner) and a line in its chat (lib/live/global-gift). The catalog
// marks such gifts `global: true` (lib/live/catalog-live), for the gift panel's Global shelf and the tile's badge.
// Pure: the parsing and the words, for the unit tests. Anything malformed is left out, never thrown.
import { toPerson } from '@/lib/tr-dative';

/** One announcement as the phone shows it; a hidden name ("Adım genel duyurularda görünmesin") has no id. */
export type GlobalGift = {
  /** The server's first send of it (gift_events id): each announcement once. */
  id: number;
  from: { id: string | null; name: string; avatar?: string };
  to: { id: string | null; name: string };
  gift: { id: string; name: string; emoji: string; icon?: string };
  /** ×N: sends of the same gift to the same person that waited for the same announcement. */
  count: number;
  /** The server room it was sent in; null outside one (a chat, a profile). Locked: a password or private room. */
  room: { id: string; title: string; locked: boolean } | null;
};

export const HIDDEN_NAME = 'Bir kullanıcı';
const GIFT_ID = /^[A-Za-z0-9_-]{1,32}$/;
const SERVER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max ? v.replace(/\s+/g, ' ').trim() : null);
const id = (v: unknown) => (typeof v === 'string' && SERVER_ID.test(v) ? v : null);
const https = (v: unknown) => (typeof v === 'string' && v.length <= 600 && /^https:\/\/[^\s"'<>\\]+$/.test(v) ? v : undefined);

/** A person: no id and no name means they hid it ("Bir kullanıcı", no photo). */
function personOf(raw: unknown, photo: boolean) {
  const p = obj(raw);
  const pid = id(p.id);
  const name = pid ? text(p.name, 60) : null;
  if (!pid || !name) return { id: null, name: HIDDEN_NAME };
  const avatar = photo ? https(p.avatar) : undefined;
  return { id: pid, name, ...(avatar ? { avatar } : {}) };
}

/** A 'global_gift' line event as the phone shows it; null for any other event or a malformed one. */
export function globalGiftOfLine(e: unknown): GlobalGift | null {
  const x = obj(e);
  if (x.type !== 'global_gift') return null;
  const n = x.id;
  const count = x.count;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0) return null;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1 || count > 1_000_000) return null;
  const g = obj(x.gift);
  const giftName = text(g.name, 40);
  if (typeof g.id !== 'string' || !GIFT_ID.test(g.id) || !giftName) return null;
  const icon = https(g.icon);
  const r = obj(x.room);
  const roomId = id(r.id);
  const title = text(r.title, 80);
  return {
    id: n,
    from: personOf(x.from, true),
    to: personOf(x.to, false),
    gift: { id: g.id, name: giftName, emoji: text(g.emoji, 16) ?? '🎁', ...(icon ? { icon } : {}) },
    count,
    room: roomId && title ? { id: roomId, title, locked: r.locked === true } : null,
  };
}

/** "Artemis’e"; a hidden receiver: "bir kullanıcıya". */
export const receiverText = (g: Pick<GlobalGift, 'to'>) => (g.to.id ? toPerson(g.to.name) : 'bir kullanıcıya');
/** What was sent: "🚀 Roket", "🚀 Roket ×3". */
export const giftText = (g: Pick<GlobalGift, 'gift' | 'count'>) => `${g.gift.emoji} ${g.gift.name}${g.count > 1 ? ` ×${g.count.toLocaleString('tr-TR')}` : ''}`;
/** The announcement in one sentence: "Kaan → Artemis’e 🚀 Roket gönderdi". */
export const globalGiftText = (g: GlobalGift) => `${g.from.name} → ${receiverText(g)} ${giftText(g)} gönderdi`;
/** The line in the chat of a room I am in: the sentence, and in which room it was sent. */
export const globalChatLine = (g: GlobalGift) => `🌍 ${globalGiftText(g)}${g.room ? ` · ${g.room.title} odasında` : ''}`;
/** Someone in the announcement this phone blocked: it isn't shown (the server leaves blocks out already). */
export const globalGiftBlocked = (g: GlobalGift, blocked: { has: (id: string) => boolean }) => [g.from.id, g.to.id].some((x) => !!x && blocked.has(x));

/** The catalog's gifts marked global: their ids, in its order; [] when none or malformed. */
/**
 * The gifts the catalog marks "Yakında" (`soon: true`, server/api/custom-gifts.mjs giftSoon, owners 22 Nov 2026): on
 * their shelf, greyed, not sent. Malformed entries are skipped.
 */
export function parseSoonIds(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const x of list) {
    const g = obj(x);
    if (g.soon === true && typeof g.id === 'string' && GIFT_ID.test(g.id) && !out.includes(g.id)) out.push(g.id);
    if (out.length >= 200) break;
  }
  return out;
}

export function parseGlobalIds(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const x of list) {
    const g = obj(x);
    if (g.global === true && typeof g.id === 'string' && GIFT_ID.test(g.id) && !out.includes(g.id)) out.push(g.id);
    if (out.length >= 200) break;
  }
  return out;
}
