// The app's face (Plus Jakarta Sans) joins "fi" into one ligature glyph whose i has no dot: "Profil" reads as
// "Profıl" to a Turkish reader. components/text turns the common ligatures off for every Text and TextInput.
// Pure, so the node tests load it.

/** The fontVariant value that turns the "fi", "fl", "ff" ligatures off. */
export const NO_LIGATURES = 'no-common-ligatures';
/** Any of these in a style's own fontVariant is that style's own choice about ligatures, kept as it is. */
const LIGATURE_CHOICES = new Set(['common-ligatures', 'no-common-ligatures']);

const DEFAULT: readonly string[] = [NO_LIGATURES];

/**
 * A style's fontVariant with the ligatures off: none → ['no-common-ligatures'] (the same array every time); its own
 * (['tabular-nums'], or the CSS-like 'small-caps tabular-nums') → kept, with 'no-common-ligatures' added unless it
 * already says something about common ligatures.
 */
export function fontVariantOf(own: readonly string[] | string | null | undefined): readonly string[] {
  const list = typeof own === 'string' ? own.split(/\s+/).filter(Boolean) : (own ?? []);
  if (!list.length) return DEFAULT;
  return list.some((v) => LIGATURE_CHOICES.has(v)) ? list : [...list, NO_LIGATURES];
}

/**
 * The phones' renderer (React Native's new architecture, Android and iOS) drops the ligature values of fontVariant,
 * so there the text itself keeps f and i apart: a zero-width non-joiner between them (invisible, no width, read
 * the same by screen readers). Only "fi" (and "ffi"): the font's "fl" and "ff" lose no dot.
 */
export const ZWNJ = '‌';
export const breakFi = (text: string) => (text.includes('fi') ? text.replace(/f(?=i)/g, `f${ZWNJ}`) : text);
