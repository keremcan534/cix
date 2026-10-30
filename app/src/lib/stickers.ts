// Sticker tokens in message text. Pure (no React Native), so it is unit tested; the images live in
// components/ReactionArt and the packs in data/catalog.
//
// A custom-drawn sticker is sent as `⟦<sticker id>⟧`, not as a Unicode emoji: standard emoji are free
// and stay plain text, so only someone who owns a pack can put its sticker in a message.

const TOKEN = /⟦([a-z0-9-]+)⟧/g;

export const stickerToken = (id: string) => `⟦${id}⟧`;

/** The sticker id of a single token (e.g. a seat reaction), or null for a plain emoji. */
export function stickerIdOf(value: string): string | null {
  const m = /^⟦([a-z0-9-]+)⟧$/.exec(value);
  return m ? m[1] : null;
}

/**
 * The sticker ids of `text` when it is nothing but known sticker tokens (whitespace allowed) and at
 * most `max` of them; otherwise null, and the message is drawn as text.
 */
export function stickersOf(text: string, known: (id: string) => boolean, max = 3): string[] | null {
  const ids = [...text.matchAll(TOKEN)].map((m) => m[1]);
  if (!ids.length || ids.length > max || text.replace(TOKEN, '').trim() || !ids.every(known)) return null;
  return ids;
}

/** Text with every known sticker token replaced by `[name]`, for previews and mixed messages. */
export function stickerText(text: string, nameOf: (id: string) => string | undefined): string {
  return text.replace(TOKEN, (token, id: string) => {
    const name = nameOf(id);
    return name ? `[${name}]` : token;
  });
}
