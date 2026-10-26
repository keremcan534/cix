// Illustrated avatar frames (one generated sheet, cut and cleaned; see docs). `hole` is the radius of the
// empty centre as a share of the image width, measured when cutting, so any avatar size sits exactly
// inside the ring. The art is drawn larger than the avatar box and overflows it on purpose.
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, View, type ImageSourcePropType } from 'react-native';

type Art = { src: ImageSourcePropType; hole: number; glow: string };
const ART: Record<string, Art> = {
  'fr-silver': { src: require('../../../assets/frames/fr-silver.png'), hole: 0.2775, glow: '#CBD5E1' },
  'fr-frost': { src: require('../../../assets/frames/fr-frost.png'), hole: 0.2411, glow: '#7DD3FC' },
  'fr-rose': { src: require('../../../assets/frames/fr-rose.png'), hole: 0.2441, glow: '#FF6576' },
  'fr-laurel': { src: require('../../../assets/frames/fr-laurel.png'), hole: 0.2502, glow: '#F6BD60' },
  'fr-crown-silver': { src: require('../../../assets/frames/fr-crown-silver.png'), hole: 0.2091, glow: '#13D9DF' },
  'fr-crown-gold': { src: require('../../../assets/frames/fr-crown-gold.png'), hole: 0.1777, glow: '#F6BD60' },
  'fr-wing-coral': { src: require('../../../assets/frames/fr-wing-coral.png'), hole: 0.2065, glow: '#FF6576' },
  'fr-wing-sky': { src: require('../../../assets/frames/fr-wing-sky.png'), hole: 0.2092, glow: '#13D9DF' },
};
export const frameArtOf = (id?: string) => (id ? ART[id] : undefined);

/** Avatar inside an illustrated frame: soft glow pulse behind, the frame breathes slightly. */
/**
 * `maxScale` caps how far the art may spread beyond the avatar box (1.8 = 40% each side). When a large
 * crown or wings would exceed it, the avatar shrinks inside the box instead, so tight layouts (seats,
 * list rows) don't get covered.
 */
export function ArtFrame({ art, size, still, maxScale = 1.8, children }: { art: Art; size: number; still?: boolean; maxScale?: number; children: ReactNode }) {
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
  const frame = Math.min(size / (2 * art.hole * 1.04), size * maxScale);
  const avatar = frame * 2 * art.hole * 1.04;
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
          transform: [{ scale: still ? 1 : t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) }],
        }}
      />
    </View>
  );
}
