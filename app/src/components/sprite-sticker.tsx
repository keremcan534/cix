// A sticker drawn from a sheet of frames (the Penguen pack, components/ReactionArt SPRITES): the frames sit in a grid,
// each 192 px with a clear 2 px gutter round it so scaling never bleeds a neighbour in. Playing steps through them on
// the native driver, so the JS thread does no work per frame, and it works the same on the web.
// Still: the designer's preview picture alone (a page of the emoji panel loads no sheets); once: plays through and
// stays on the last frame (a chat); loop: over and over (on a mic, a gift flight).
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Image, View } from 'react-native';

import type { StickerPlay } from '@/components/lottie-sticker';

/**
 * A sticker's frames: the sheet and the still, how many frames in how many columns and how long one frame shows.
 * `holds`: frames that show for more than one frame's time (frame index → how many), as the source animation has them.
 */
export type SpriteArt = { sheet: number; still: number; frames: number; cols: number; frameMs: number; holds?: Record<number, number> };

/** A frame's size and the clear gutter around it, in the sheet's own pixels. */
export const SPRITE_FRAME = 192;
export const SPRITE_GUTTER = 2;
const CELL = SPRITE_FRAME + 2 * SPRITE_GUTTER;

/** Where each frame starts on the sticker's clock (in frame times), and the length of one pass. */
export function spriteTimeline(art: Pick<SpriteArt, 'frames' | 'holds'>): { starts: number[]; length: number } {
  const starts: number[] = [];
  let at = 0;
  for (let i = 0; i < art.frames; i++) {
    starts.push(at);
    at += Math.max(1, art.holds?.[i] ?? 1);
  }
  return { starts, length: at };
}

export function SpriteSticker({ art, size, play, label }: { art: SpriteArt; size: number; play: StickerPlay; label?: string }) {
  const [clock] = useState(() => new Animated.Value(0));
  const { starts, length } = useMemo(() => spriteTimeline(art), [art]);
  useEffect(() => {
    if (play === 'still') return;
    clock.setValue(0);
    const pass = Animated.timing(clock, { toValue: length, duration: length * art.frameMs, easing: Easing.linear, useNativeDriver: true });
    const run = play === 'loop' ? Animated.loop(pass) : pass;
    run.start();
    return () => run.stop();
  }, [clock, play, length, art.frameMs]);
  // Each frame holds from its start to just before the next one; a pass that ended stays on the last frame.
  const shift = useMemo(() => {
    const k = size / SPRITE_FRAME;
    const inputRange: number[] = [];
    const xs: number[] = [];
    const ys: number[] = [];
    starts.forEach((start, i) => {
      const end = i + 1 < starts.length ? starts[i + 1] : length;
      const x = -((i % art.cols) * CELL + SPRITE_GUTTER) * k;
      const y = -(Math.floor(i / art.cols) * CELL + SPRITE_GUTTER) * k;
      inputRange.push(start, end - 0.001);
      xs.push(x, x);
      ys.push(y, y);
    });
    return {
      x: clock.interpolate({ inputRange, outputRange: xs, extrapolate: 'clamp' }),
      y: clock.interpolate({ inputRange, outputRange: ys, extrapolate: 'clamp' }),
      w: art.cols * CELL * k,
      h: Math.ceil(art.frames / art.cols) * CELL * k,
    };
  }, [clock, starts, length, size, art.cols, art.frames]);

  if (play === 'still') {
    return <Image source={art.still} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel={label} accessibilityIgnoresInvertColors />;
  }
  return (
    <View accessible={!!label} accessibilityLabel={label} style={{ width: size, height: size, overflow: 'hidden' }}>
      <Animated.Image
        source={art.sheet}
        style={{ position: 'absolute', left: 0, top: 0, width: shift.w, height: shift.h, transform: [{ translateX: shift.x }, { translateY: shift.y }] }}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}
