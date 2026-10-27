// Finds reaction stickers in a message. Pure (no React Native), so it is unit tested; the images
// themselves live in components/ReactionArt.

/** Emoji compare without the variation selector, so "❤" and "❤️" are the same sticker. */
export const emojiKey = (emoji: string) => emoji.replace(/️/g, '');

/**
 * The stickers of `text` when it is nothing but known reaction emoji (whitespace allowed) and at most
 * `max` of them; otherwise null, and the message is drawn as plain text. `keys` are emojiKey()s.
 */
export function stickersOf(text: string, keys: readonly string[], max = 3): string[] | null {
  // Longest first, so a multi-code-point emoji is never split into a shorter one.
  const sorted = [...keys].sort((a, b) => b.length - a.length);
  let rest = emojiKey(text).replace(/\s+/g, '');
  const out: string[] = [];
  while (rest) {
    const k = sorted.find((x) => rest.startsWith(x));
    if (!k || out.length === max) return null;
    out.push(k);
    rest = rest.slice(k.length);
  }
  return out.length ? out : null;
}
