// Emoji in messages: a message of one to three emoji alone is drawn large, and emoji inside text are drawn a
// size up from the text around them (components/ReactionArt EmojiText). Only Unicode emoji; stickers are
// tokens (lib/stickers) and drawn as pictures.

// Pictographs: the emoji blocks, plus the older symbols that phones draw as emoji.
const PIC =
  '\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2300}-\\u{23FF}\\u{2B00}-\\u{2BFF}\\u{2190}-\\u{21FF}\\u{25A0}-\\u{25FF}' +
  '\\u{2900}-\\u{297F}\\u{3030}\\u{303D}\\u{3297}\\u{3299}\\u{00A9}\\u{00AE}\\u{203C}\\u{2049}\\u{2122}\\u{2139}\\u{24C2}';
// What may follow a pictograph inside one emoji: the emoji form, skin tones and flag tags.
const MOD = '\\u{FE0F}\\u{1F3FB}-\\u{1F3FF}\\u{E0020}-\\u{E007F}';
const ONE = `(?:[\\u{1F1E6}-\\u{1F1FF}]{2}|[#*0-9]\\u{FE0F}?\\u{20E3}|[${PIC}][${MOD}]*(?:\\u{200D}[${PIC}][${MOD}]*)*)`;

// Built at run time: an engine without Unicode regular expressions draws emoji as plain text instead of failing.
const build = (src: string, flags: string) => {
  try {
    return new RegExp(src, flags);
  } catch {
    return null;
  }
};
const ANY = build(ONE, 'gu');
const ONLY = build(`^(?:\\s*${ONE})+\\s*$`, 'u');

/** How many emoji the message is, when it is emoji alone (spaces aside); 0 when it has anything else. */
export function emojiOnlyCount(text: string): number {
  if (!ANY || !ONLY || !ONLY.test(text)) return 0;
  return text.match(ANY)?.length ?? 0;
}

/** The text cut into runs of emoji and of everything else, in order. */
export function emojiRuns(text: string): { text: string; emoji: boolean }[] {
  if (!ANY) return [{ text, emoji: false }];
  const out: { text: string; emoji: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(ANY)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ text: text.slice(at, i), emoji: false });
    const last = out[out.length - 1];
    if (last?.emoji && i === at) last.text += m[0];
    else out.push({ text: m[0], emoji: true });
    at = i + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), emoji: false });
  return out;
}

/** The font size of a message of `count` emoji alone (1 → largest), or null when it isn't drawn large. */
export const bigEmojiSize = (count: number) => (count === 1 ? 44 : count === 2 ? 38 : count === 3 ? 32 : null);
