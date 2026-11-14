// Illustrated avatar frames (one generated sheet, cut and cleaned; see docs). Their measurements (data/frame-art):
// `hole` is the radius of the empty centre as a share of the image width, measured when cutting, so any avatar size
// sits exactly inside the ring; `reach` how far the picture goes from its centre. The art is drawn larger than the
// avatar box and overflows it on purpose; on a seat it stays inside the seat's cell (lib/seat-cell).
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, View, type ImageSourcePropType } from 'react-native';

import { FRAME_ART_SIZES, type FrameArtSize } from '@/data/frame-art';
import { ART_BREATHE, artFit, artScaleIn, type SeatRoom } from '@/lib/seat-cell';

type Art = FrameArtSize & { src: ImageSourcePropType; glow: string };
const made = (id: string, src: ImageSourcePropType, glow: string): Art => ({ ...FRAME_ART_SIZES[id], src, glow });
const ART: Record<string, Art> = {
  'fr-silver': made('fr-silver', require('../../../assets/frames/fr-silver.png'), '#CBD5E1'),
  'fr-frost': made('fr-frost', require('../../../assets/frames/fr-frost.png'), '#7DD3FC'),
  'fr-rose': made('fr-rose', require('../../../assets/frames/fr-rose.png'), '#FF6576'),
  'fr-laurel': made('fr-laurel', require('../../../assets/frames/fr-laurel.png'), '#F6BD60'),
  'fr-crown-silver': made('fr-crown-silver', require('../../../assets/frames/fr-crown-silver.png'), '#13D9DF'),
  'fr-crown-gold': made('fr-crown-gold', require('../../../assets/frames/fr-crown-gold.png'), '#F6BD60'),
  'fr-wing-coral': made('fr-wing-coral', require('../../../assets/frames/fr-wing-coral.png'), '#FF6576'),
  'fr-wing-sky': made('fr-wing-sky', require('../../../assets/frames/fr-wing-sky.png'), '#13D9DF'),
};
export const frameArtOf = (id?: string) => (id ? ART[id] : undefined);

/** Avatar inside an illustrated frame: soft glow pulse behind, the frame breathes slightly. */
/**
 * `maxScale` caps how far the art may spread beyond the avatar box (1.8 = 40% each side). When a large
 * crown or wings would exceed it, the avatar shrinks inside the box instead, so tight layouts (seats,
 * list rows) don't get covered. `room`: a seat's cell around the box (lib/seat-cell); the art stays inside it
 * whatever its shape, so wide wings or hanging gems never run over the name or the next seat.
 */
export function ArtFrame({ art, size, still, maxScale = 1.8, room, children }: { art: Art; size: number; still?: boolean; maxScale?: number; room?: SeatRoom; children: ReactNode }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, still]);
  // Avatar radius = hole radius (+4% tucked under the ring).
  const { frame, avatar } = artFit(art, size, room ? Math.min(maxScale, artScaleIn(art, size, room)) : maxScale);
  const inset = (size - avatar) / 2;
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: inset - avatar * 0.08,
          top: inset - avatar * 0.08,
          width: avatar * 1.16,
          height: avatar * 1.16,
          borderRadius: size,
          backgroundColor: art.glow,
          opacity: still ? 0.25 : t.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.4] }),
        }}
      />
      <View style={{ position: 'absolute', left: inset, top: inset, width: avatar, height: avatar, borderRadius: avatar / 2, overflow: 'hidden' }}>{children}</View>
      <Animated.Image
        source={art.src}
        resizeMode="contain"
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: frame,
          height: frame,
          left: (size - frame) / 2,
          top: (size - frame) / 2,
          transform: [{ scale: still ? 1 : t.interpolate({ inputRange: [0, 1], outputRange: [1, ART_BREATHE] }) }],
        }}
      />
    </View>
  );
}
