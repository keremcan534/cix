import type { StyleProp, ViewStyle } from 'react-native';

/** onReady: the visible picture's size (half the encoded height) and the length in seconds. */
export type AlphaVideoReady = { duration: number; width: number; height: number; encodedHeight: number };
export type AlphaVideoError = { message: string };

export type AlphaVideoProps = {
  /** A file:// URI (e.g. a copy in the cache) or a bundled asset's URI (Image.resolveAssetSource(require(…)).uri). */
  source: string | null;
  loop?: boolean;
  paused?: boolean;
  /** Default true. The POC always plays muted (the clips have no sound). */
  muted?: boolean;
  /** Play again from 0: change it to any new number (seekTo(0) + play unless paused). Unmounting releases everything. */
  restartKey?: number;
  onReady?: (e: AlphaVideoReady) => void;
  onEnd?: () => void;
  onError?: (e: AlphaVideoError) => void;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
};

/** memory(): Android only (Java heap in use, its limit and the native heap, MB); null elsewhere. */
export type AlphaVideoMemory = { javaHeapMb?: number; javaMaxMb?: number; nativeHeapMb?: number };
