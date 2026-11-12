// AlphaVideoView on the phone (android/, ios/). An app build without the module (an older APK, Expo Go) gets a
// transparent box and one onError, so a screen using it never crashes.
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { useEffect, type ComponentType } from 'react';
import { View, type NativeSyntheticEvent } from 'react-native';

import type { AlphaVideoError, AlphaVideoMemory, AlphaVideoProps, AlphaVideoReady } from './types';

type NativeProps = Omit<AlphaVideoProps, 'onReady' | 'onEnd' | 'onError'> & {
  onReady?: (e: NativeSyntheticEvent<AlphaVideoReady>) => void;
  onEnd?: (e: NativeSyntheticEvent<object>) => void;
  onError?: (e: NativeSyntheticEvent<AlphaVideoError>) => void;
};

const native = requireOptionalNativeModule<{ memory(): AlphaVideoMemory }>('SimilarAlphaVideo');
const NativeView: ComponentType<NativeProps> | null = native ? requireNativeView<NativeProps>('SimilarAlphaVideo', 'AlphaVideoView') : null;

/** True when this app build has the native view. */
export const alphaVideoAvailable = !!NativeView;

/** The app's heap (Android); null where it can't be read cheaply. */
export function alphaVideoMemory(): AlphaVideoMemory | null {
  try {
    const m = native?.memory();
    return m && Object.keys(m).length ? m : null;
  } catch {
    return null;
  }
}

export function AlphaVideoView({ source, loop = false, paused = false, muted = true, restartKey = 0, onReady, onEnd, onError, style, pointerEvents }: AlphaVideoProps) {
  const missing = !NativeView;
  useEffect(() => {
    if (missing) onError?.({ message: 'Bu uygulama sürümünde şeffaf video modülü yok.' });
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!NativeView) return <View style={style} pointerEvents={pointerEvents} />;
  return (
    <NativeView
      source={source}
      loop={loop}
      paused={paused}
      muted={muted}
      restartKey={restartKey}
      onReady={(e) => onReady?.(e.nativeEvent)}
      onEnd={() => onEnd?.()}
      onError={(e) => onError?.(e.nativeEvent)}
      style={style}
      pointerEvents={pointerEvents}
    />
  );
}
