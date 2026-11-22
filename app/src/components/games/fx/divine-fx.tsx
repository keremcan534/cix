// The web build's stand-in for the GPU light of a big win (fx/divine-fx.native.tsx): Skia on the web would need its
// own 6 MB engine loaded first, so the browser keeps the plain celebration (fx/win-fx, fx/jackpot-show) and this
// draws nothing. Same props as the phone's, so the screens don't tell the two apart.
import type { DivineProps } from '@/components/games/fx/divine-look';

export function DivineFx(_: DivineProps) {
  return null;
}

/** A reel the game is waiting for: the web keeps the reel's own lit frame (games/line-slot reelWait). */
export function TeaseAura() {
  return null;
}
