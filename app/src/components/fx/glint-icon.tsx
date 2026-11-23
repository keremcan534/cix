// The web build's shining icon (fx/glint-icon.native.tsx draws the light on the phone): the picture alone.
import { Image } from 'react-native';

export type GlintIconProps = { source: number; size: number; every?: number; delay?: number };

export function GlintIcon({ source, size }: GlintIconProps) {
  return <Image source={source} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}
