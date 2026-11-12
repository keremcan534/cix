// The web has no AlphaVideoView: an empty, see-through box of the same size, so the web build and its screens work.
import { View } from 'react-native';

import type { AlphaVideoMemory, AlphaVideoProps } from './types';

export const alphaVideoAvailable = false;

export function alphaVideoMemory(): AlphaVideoMemory | null {
  return null;
}

export function AlphaVideoView({ style, pointerEvents }: AlphaVideoProps) {
  return <View style={style} pointerEvents={pointerEvents} />;
}
