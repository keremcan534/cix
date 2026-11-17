// An empty or locked mic seat in any color (Koltuk rengi, data/seat-colors): three pictures of the same pouf stacked
// (components/RoomArt SEAT_LAYERS): its cushion in white, tinted with the color; its light and shade over it; its
// gold, kept as it is. So the panel can give the seats any color and each has the same folds and trim.
import { Image, StyleSheet, View } from 'react-native';

import { SEAT_LAYERS } from '@/components/RoomArt';

export function SeatPouf({ color, locked, size }: { color: string; locked?: boolean; size: number }) {
  const art = locked ? SEAT_LAYERS.locked : SEAT_LAYERS.empty;
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <Image source={art.color} style={[StyleSheet.absoluteFill, { width: size, height: size, tintColor: color }]} resizeMode="contain" accessibilityIgnoresInvertColors />
      <Image source={art.light} style={[StyleSheet.absoluteFill, { width: size, height: size }]} resizeMode="contain" accessibilityIgnoresInvertColors />
      <Image source={art.gold} style={[StyleSheet.absoluteFill, { width: size, height: size }]} resizeMode="contain" accessibilityIgnoresInvertColors />
    </View>
  );
}
