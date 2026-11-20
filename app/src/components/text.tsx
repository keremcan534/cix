// The app's text: one brand typeface, Plus Jakarta Sans (loaded in the root layout), for every label. Custom
// fonts don't synthesize weights on every platform, so a style's fontWeight picks the matching weight file.
// Nested text without its own weight inherits its parent's face, exactly like the system font did, and an
// explicit fontFamily (theme `fonts`, monospace) is kept as is. Inputs get the same face for what you type and
// for the placeholder. The face's "fi" ligature drops the i's dot ("Profil" read as "Profıl"), so the common
// ligatures are off everywhere (lib/ligatures).
import { createContext, useContext, type ComponentRef, type ReactNode, type Ref } from 'react';
import { Platform, StyleSheet, Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps, type TextStyle } from 'react-native';

import { breakFi, fontVariantOf } from '@/lib/ligatures';

/** Loaded font names by weight (root layout `useFonts`). */
export const FACE = { 400: 'Jakarta', 500: 'JakartaMedium', 600: 'JakartaSemiBold', 700: 'JakartaBold', 800: 'JakartaExtraBold' } as const;
type Weight = keyof typeof FACE;
const WEIGHT: Record<string, Weight> = { normal: 400, '100': 400, '200': 400, '300': 400, '400': 400, '500': 500, '600': 600, '700': 700, bold: 700, '800': 800, '900': 800 };

export const faceFor = (weight?: string | number) => FACE[WEIGHT[String(weight ?? 'normal')] ?? 400];

/**
 * How much the phone's own text size ("Yazı boyutu", "Ekran boyutu") may grow the app's text. Icons, badges and
 * seats keep their size, so a number grown past this no longer fits its badge or circle and spills out of it.
 */
export const MAX_FONT_SCALE = 1.15;

/** The face of the nearest Text above, so nested text inherits instead of resetting to regular. */
const ParentFace = createContext<string | null>(null);

/** Android's font padding is taller above this font than below it, so words sat low in their box; a style can still ask for it. */
const NO_PAD = Platform.OS === 'android' ? { includeFontPadding: false } : null;

/** Ligatures off, merged with a style's own fontVariant (tabular-nums stays). */
const variantOf = (own: TextStyle['fontVariant']) => ({ fontVariant: fontVariantOf(own) as TextStyle['fontVariant'] });
const NO_LIGATURES = variantOf(undefined);

/**
 * The phones' renderer ignores the ligature part of fontVariant (the web honours it): there the words themselves keep
 * f and i apart. Not in selectable text, so a copied word has no invisible character in it.
 */
const SPLIT_FI = Platform.OS !== 'web';
function unjoinFi(children: ReactNode): ReactNode {
  if (typeof children === 'string') return breakFi(children);
  // The elements are the same objects (their keys untouched); only the strings change.
  if (Array.isArray(children) && children.some((c) => typeof c === 'string' && c.includes('fi'))) return children.map((c) => (typeof c === 'string' ? breakFi(c) : c));
  return children;
}

export function Text({ style, children, ...rest }: TextProps) {
  const parent = useContext(ParentFace);
  const flat = StyleSheet.flatten(style);
  let face: string | null;
  let own: object | null = null;
  if (flat?.fontFamily) face = flat.fontFamily;
  else if (flat?.fontWeight !== undefined || !parent) {
    face = faceFor(flat?.fontWeight);
    // The weight is in the file; a fontWeight on top would make some platforms embolden it again.
    own = { fontFamily: face, fontWeight: 'normal' };
  } else face = parent;
  // Set on the outermost text (nested text inherits it, with any fontVariant its parent has) and merged into a
  // nested text's own fontVariant.
  const variant = flat?.fontVariant !== undefined ? variantOf(flat.fontVariant) : parent ? null : NO_LIGATURES;
  return (
    <RNText style={[NO_PAD, style, own, variant]} maxFontSizeMultiplier={MAX_FONT_SCALE} {...rest}>
      <ParentFace.Provider value={face}>{SPLIT_FI && !rest.selectable ? unjoinFi(children) : children}</ParentFace.Provider>
    </RNText>
  );
}

export function TextInput({ style, ref, ...rest }: TextInputProps & { ref?: Ref<ComponentRef<typeof RNTextInput>> }) {
  const flat = StyleSheet.flatten(style);
  const own = flat?.fontFamily ? null : { fontFamily: faceFor(flat?.fontWeight), fontWeight: 'normal' as const };
  // Android centres the text of a tall box vertically: a multi-line box starts at the top unless its style says otherwise.
  const top = rest.multiline ? { textAlignVertical: 'top' as const } : null;
  // What is typed can't be changed, so only the web (which honours fontVariant) loses the ligature here.
  const variant = flat?.fontVariant !== undefined ? variantOf(flat.fontVariant) : NO_LIGATURES;
  return <RNTextInput ref={ref} style={[top, style, own, variant]} maxFontSizeMultiplier={MAX_FONT_SCALE} {...rest} />;
}
