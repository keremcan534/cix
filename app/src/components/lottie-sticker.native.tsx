// An animated sticker on the phones: the Lottie animation itself (lottie-react-native). Still: its first frame (the
// emoji panel shows a whole page of them at once); once: plays and stops (a chat); loop: over and over (on a mic).
import LottieView, { type AnimationObject } from 'lottie-react-native';
import { View } from 'react-native';

import type { LottieStickerProps } from './lottie-sticker';

export function LottieSticker({ source, size, play, label }: LottieStickerProps) {
  return (
    <View accessible={!!label} accessibilityLabel={label} style={{ width: size, height: size }}>
      <LottieView source={source as AnimationObject} autoPlay={play !== 'still'} loop={play === 'loop'} style={{ width: size, height: size }} />
    </View>
  );
}
