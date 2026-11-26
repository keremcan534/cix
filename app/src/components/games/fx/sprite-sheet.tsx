// A sprite sheet on the screen: a grid of frames (Blender renders, docs/VARLIK_KAYNAKLARI.md) shown one at a time
// through a window the size of one frame. An Animated value 0 → 1 plays the frames (lib/sprite-steps), on the native
// driver: the picture moves under the window on the UI thread, with no JS work per frame and no redraw.
import { useMemo } from 'react';
import { Animated, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

import { cellOf, frameSteps } from '@/lib/sprite-steps';

export type Sheet = { src: ImageSourcePropType; cols: number; rows: number; frames: number };

export function SpriteSheet({
  sheet,
  w,
  h,
  at,
  cycles = 1,
  frame = 0,
  style,
}: {
  sheet: Sheet;
  /** One frame's box (dp). */
  w: number;
  h: number;
  /** 0 → 1 plays the frames (`cycles` times); without it `frame` stands still. */
  at?: Animated.Value | null;
  cycles?: number;
  frame?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const transform = useMemo(() => {
    if (!at) {
      const c = cellOf(sheet, frame);
      return [{ translateX: -c.col * w }, { translateY: -c.row * h }];
    }
    const s = frameSteps(sheet, cycles);
    return [
      { translateX: at.interpolate({ inputRange: s.input, outputRange: s.col.map((c) => -c * w), extrapolate: 'clamp' }) },
      { translateY: at.interpolate({ inputRange: s.input, outputRange: s.row.map((r) => -r * h), extrapolate: 'clamp' }) },
    ];
  }, [at, sheet, cycles, frame, w, h]);
  return (
    <View style={[{ width: w, height: h, overflow: 'hidden' }, style]} pointerEvents="none">
      <Animated.Image source={sheet.src} style={{ width: w * sheet.cols, height: h * sheet.rows, transform }} fadeDuration={0} accessibilityIgnoresInvertColors />
    </View>
  );
}
