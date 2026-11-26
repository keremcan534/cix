// Spam rules for a direct message's words (owners, 26 Nov 2026), beside the contact filter (contact-filter.mjs):
// a message that is only one letter or one digit, or a run of the same character, is refused; emoji, stickers and
// photos are fine. The same message sent over and over is messages.mjs's (DUP_LIMIT). The app runs the same rules
// before it sends (this file is the app's copy of server/api/message-quality.mjs: change one side, change the other).
//
// Pure module (no Node or database imports).

export const QUALITY_MESSAGE = 'Tek harf, tek rakam ya da anlamsız tekrar içeren mesaj gönderilemez.';
export const DUP_MESSAGE = 'Aynı mesajı üst üste ikiden fazla gönderemezsin.';
/** How many times in a row the same words may go to the same person. */
export const DUP_LIMIT = 2;
/** A character repeated this many times in a row ("aaaaaa", "??????") is a run. */
export const RUN = 6;

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/gu;

/** { ok: true } or { ok: false, reason: 'single' | 'run' }. */
export function checkQuality(text: string): { ok: true } | { ok: false; reason: 'single' | 'run' } {
  const t = String(text ?? '').normalize('NFKC').trim();
  if (!t) return { ok: true };
  const alnum = t.match(LETTER_OR_DIGIT) ?? [];
  // One letter or one digit, alone or with punctuation and emoji ("a", "5", "k!"); emoji alone is fine.
  if (alnum.length === 1) return { ok: false, reason: 'single' };
  // The same character over and over ("aaaaaa", "??????", "!!!!!!!").
  const chars = [...t];
  let run = 1;
  for (let i = 1; i < chars.length; i++) {
    run = chars[i] === chars[i - 1] && !/\s/u.test(chars[i]) ? run + 1 : 1;
    if (run >= RUN) return { ok: false, reason: 'run' };
  }
  return { ok: true };
}

/** The words two messages are compared by (case, spaces and trailing punctuation aside). */
export const dupKey = (text: string) =>
  String(text ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .replace(/[.!?…]+$/u, '')
    .trim();
