// Hamle: the room's mic reactions that do something (the "Hamle" tab of the emoji panel). A kiss or a punch goes
// from my mic to the mic on my left or right; the dice and Taş Kağıt Makas show a result everyone in the room sees
// the same. A hamle travels to the other phones as one small 'act' signal (lib/live/room-bus) and each phone draws
// it; the result is drawn by the sender's phone and sent along. Nothing here moves coins. Pure, so the node tests
// can check it.

export type Side = 'l' | 'r';
export type Move = { a: 'kiss' | 'punch'; d: Side } | { a: 'dice'; n: number } | { a: 'rps'; n: number };

/** Taş Kağıt Makas: the three hands by their result number, with the art each one plays. */
export const RPS = [
  { id: 'hamle-tas', name: 'Taş' },
  { id: 'hamle-kagit', name: 'Kağıt' },
  { id: 'hamle-makas', name: 'Makas' },
] as const;

/** The die's six faces by the number thrown: their pictures (components/ReactionArt, assets/art/zar-zar-yuzu-N). */
export const diceFace = (n: number) => `hamle-zar-${n}`;

/**
 * The pictures a Hamle plays that aren't picks of the tab (so the catalog doesn't name them): the three hands, the
 * flying kiss, the bang a punch lands with, the die's faces. `emoji`: what is drawn where the picture can't play.
 */
export const MOVE_ART: Record<string, { name: string; emoji: string }> = {
  'hamle-tas': { name: 'Taş', emoji: '✊' },
  'hamle-kagit': { name: 'Kağıt', emoji: '✋' },
  'hamle-makas': { name: 'Makas', emoji: '✌️' },
  'hamle-opucuk': { name: 'Öpücük', emoji: '💋' },
  'hamle-carpma': { name: 'Çarpma', emoji: '💥' },
  ...Object.fromEntries(['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'].map((emoji, i) => [diceFace(i + 1), { name: `Zar: ${i + 1}`, emoji }])),
};

/**
 * Pictures drawn facing the other way. The kiss to the left plays the same blowing kiss as the one to the right, whose
 * heart flies off to the right; turned round, it flies to the left. The panel and the mic both draw it turned.
 */
export const MIRRORED_ART: ReadonlySet<string> = new Set(['hamle-opucuk-sol']);

/** The Hamle tab's picks (data/catalog 'hamle' pack) and what each one does. */
const PICKS: Record<string, 'dice' | 'rps' | { a: 'kiss' | 'punch'; d: Side }> = {
  'hamle-opucuk-sol': { a: 'kiss', d: 'l' },
  'hamle-opucuk-sag': { a: 'kiss', d: 'r' },
  'hamle-yumruk-sol': { a: 'punch', d: 'l' },
  'hamle-yumruk-sag': { a: 'punch', d: 'r' },
  'hamle-zar': 'dice',
  'hamle-tkm': 'rps',
};
export const isMovePick = (stickerId: string | null | undefined) => !!stickerId && stickerId in PICKS;
/** A pick that needs a mic to start from (it flies to the mic beside mine). */
export const needsMic = (m: Move) => m.a === 'kiss' || m.a === 'punch';

/** The move a pick makes: the dice and the hands are drawn here (`rnd`: 0 ≤ x < 1). Null for anything else. */
export function moveOfPick(stickerId: string | null | undefined, rnd: () => number = Math.random): Move | null {
  const p = stickerId ? PICKS[stickerId] : undefined;
  if (!p) return null;
  if (p === 'dice') return { a: 'dice', n: 1 + Math.min(5, Math.floor(rnd() * 6)) };
  if (p === 'rps') return { a: 'rps', n: Math.min(2, Math.floor(rnd() * 3)) };
  return { ...p };
}

/**
 * What a move puts on the sender's mic, as a sticker id: the picture its pick shows in the panel (a kiss or a punch to
 * the left faces left), the face the die landed on, the hand that came out. The result travels in the move (`n`, drawn
 * once by the sender's phone), so every phone in the room shows the same face and the same hand.
 */
export function moveArt(m: Move): string {
  if (m.a === 'dice') return diceFace(m.n);
  if (m.a === 'rps') return RPS[m.n].id;
  return `hamle-${m.a === 'kiss' ? 'opucuk' : 'yumruk'}-${m.d === 'l' ? 'sol' : 'sag'}`;
}

/** The die tumbling: faces in a fixed order (no face twice in a row, whichever is left out). */
const TUMBLE = [3, 1, 5, 2, 6, 4, 1, 5, 3];
/**
 * The pictures that flash by on the mic before a result settles (sticker ids): the die tumbling through the other faces
 * (never the one thrown, so it doesn't seem to land early), or the three hands twice. Fixed, so every phone shows the
 * same; a kiss or a punch has none.
 */
export function moveShuffle(m: Move): string[] {
  if (m.a === 'dice') return TUMBLE.filter((f) => f !== m.n).map(diceFace);
  if (m.a === 'rps') return [...RPS, ...RPS].map((h) => h.id);
  return [];
}

/** A move as another phone sent it, or null when it isn't one (only these shapes and ranges are drawn). */
export function parseMove(raw: unknown): Move | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if ((m.a === 'kiss' || m.a === 'punch') && (m.d === 'l' || m.d === 'r')) return { a: m.a, d: m.d };
  if (m.a === 'dice' && Number.isInteger(m.n) && (m.n as number) >= 1 && (m.n as number) <= 6) return { a: 'dice', n: m.n as number };
  if (m.a === 'rps' && Number.isInteger(m.n) && (m.n as number) >= 0 && (m.n as number) <= 2) return { a: 'rps', n: m.n as number };
  return null;
}

/** The room's chat line for a result (the dice, the hand); a kiss or a punch has none. */
export function moveLine(name: string, m: Move): string | null {
  if (m.a === 'dice') return `🎲 ${name} zar attı: ${m.n}`;
  if (m.a === 'rps') return `✊ ${name} Taş Kağıt Makas'ta ${RPS[m.n].name} çıkardı`;
  return null;
}

export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };
const centre = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/**
 * Where a kiss or a punch from the mic at `from` lands: the nearest mic on that side in the same row (`slots`: every
 * mic's place on the screen, by its number), or, with no mic there, a point a mic's width away. `index` null: nobody
 * to land on.
 */
export function sideTarget(from: Rect, slots: readonly { index: number; rect: Rect }[], side: Side): { index: number | null; to: Point } {
  const c = centre(from);
  const dir = side === 'l' ? -1 : 1;
  let best: { index: number; at: Point; gap: number } | null = null;
  for (const s of slots) {
    const at = centre(s.rect);
    const gap = (at.x - c.x) * dir;
    // The same row (centres within 60% of a mic's height) and clearly on that side.
    if (Math.abs(at.y - c.y) > from.h * 0.6 || gap < from.w * 0.4) continue;
    if (!best || gap < best.gap) best = { index: s.index, at, gap };
  }
  return best ? { index: best.index, to: best.at } : { index: null, to: { x: c.x + dir * from.w * 1.4, y: c.y } };
}
