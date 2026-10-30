// The app's text: one brand typeface, Plus Jakarta Sans (loaded in the root layout), for every label. Custom
// fonts don't synthesize weights on every platform, so a style's fontWeight picks the matching weight file.
// Nested text without its own weight inherits its parent's face, exactly like the system font did, and an
// explicit fontFamily (theme `fonts`, monospace) is kept as is. Inputs get the same face for what you type and
// for the placeholder.
import { createContext, useContext, type ComponentRef, type Ref } from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';

/** Loaded font names by weight (root layout `useFonts`). */
export const FACE = { 400: 'Jakarta', 500: 'JakartaMedium', 600: 'JakartaSemiBold', 700: 'JakartaBold', 800: 'JakartaExtraBold' } as const;
type Weight = keyof typeof FACE;
const WEIGHT: Record<string, Weight> = { normal: 400, '100': 400, '200': 400, '300': 400, '400': 400, '500': 500, '600': 600, '700': 700, bold: 700, '800': 800, '900': 800 };

export const faceFor = (weight?: string | number) => FACE[WEIGHT[String(weight ?? 'normal')] ?? 400];

/** The face of the nearest Text above, so nested text inherits instead of resetting to regular. */
const ParentFace = createContext<string | null>(null);

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
  return (
    <RNText style={own ? [style, own] : style} {...rest}>
      <ParentFace.Provider value={face}>{children}</ParentFace.Provider>
    </RNText>
  );
}

export function TextInput({ style, ref, ...rest }: TextInputProps & { ref?: Ref<ComponentRef<typeof RNTextInput>> }) {
  const flat = StyleSheet.flatten(style);
  const own = flat?.fontFamily ? null : { fontFamily: faceFor(flat?.fontWeight), fontWeight: 'normal' as const };
  return <RNTextInput ref={ref} style={own ? [style, own] : style} {...rest} />;
}
