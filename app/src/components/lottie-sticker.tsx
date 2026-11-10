// An animated sticker (a Lottie animation: the Duygular pack, components/ReactionArt). The phones play it
// (lottie-sticker.native.tsx, lottie-react-native); the web preview draws its emoji instead, so the web build
// carries no Lottie player.
import { Text } from '@/components/text';

/** How an animated sticker plays: still (its first frame), once, or over and over. */
export type StickerPlay = 'still' | 'once' | 'loop';
export type LottieStickerProps = {
  /** The animation (its JSON, as `require` gives it). */
  source: object;
  size: number;
  play: StickerPlay;
  label?: string;
  /** The emoji it stands for: what the web draws. */
  fallback: string;
};

export function LottieSticker({ size, label, fallback }: LottieStickerProps) {
  return (
    <Text accessibilityLabel={label} style={{ fontSize: Math.round(size * 0.82), lineHeight: Math.round(size * 1.05) }}>
      {fallback}
    </Text>
  );
}
