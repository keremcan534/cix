// A sent gift flies from the gift button to each recipient's seat along an arc, then lands with a pop
// and a "×count" tag. Window coordinates come from measureInWindow on the seat avatars.
// Transform/opacity only, on the native driver; callers skip it when effects are off or motion is reduced.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Icon3D, icon3dFor } from '@/components/Icon3D';
import { GiftArt, giftArtOf } from '@/components/GiftArt';
import { colors, semantic } from '@/theme';

export type Point = { x: number; y: number };
export type Flight = { key: string; emoji: string; count: number; from: Point; to: Point; delay: number; /** Catalog gift id: flies its image when it has one. */ giftId?: string };

const FLY_MS = 760;
const LAND_MS = 520;
const SIZE = 44;

export function GiftFlights({ flights, onDone }: { flights: Flight[]; onDone: (key: string) => void }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {flights.map((f) => (
        <GiftFlight key={f.key} flight={f} onDone={onDone} />
      ))}
    </View>
  );
}

function GiftFlight({ flight, onDone }: { flight: Flight; onDone: (key: string) => void }) {
  const [t] = useState(() => new Animated.Value(0));
  const [land] = useState(() => new Animated.Value(0));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const a = Animated.sequence([
      Animated.delay(flight.delay),
      Animated.timing(t, { toValue: 1, duration: FLY_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      Animated.timing(land, { toValue: 1, duration: LAND_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]);
    a.start(() => done.current(flight.key));
    return () => a.stop();
  }, [t, land, flight.delay, flight.key]);

  const { from, to } = flight;
  // Arc: x moves linearly, y gets an extra lift that peaks halfway.
  const lift = Math.min(160, Math.abs(from.y - to.y) * 0.35 + 60);
  const midY = (from.y + to.y) / 2 - lift;
  const icon = icon3dFor(flight.emoji);

  return (
    <Animated.View
      style={[
        s.box,
        {
          opacity: Animated.multiply(
            t.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 1, 1] }),
            land.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1, 0] }),
          ),
          transform: [
            { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [from.x - SIZE / 2, to.x - SIZE / 2] }) },
            { translateY: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [from.y - SIZE / 2, midY - SIZE / 2, to.y - SIZE / 2] }) },
            { scale: Animated.add(t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.35, 1] }), land.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.45, 0.2] })) },
            { rotate: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-14deg', '10deg', '0deg'] }) },
          ],
        },
      ]}
    >
      {giftArtOf(flight.giftId) ? <GiftArt giftId={flight.giftId} emoji={flight.emoji} size={SIZE} /> : icon ? <Icon3D name={icon} size={SIZE} /> : <Text style={s.emoji}>{flight.emoji}</Text>}
      {flight.count > 1 && (
        <Animated.View style={[s.tag, { opacity: land.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }) }]}>
          <Text style={s.tagText}>×{flight.count}</Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  box: { position: 'absolute', left: 0, top: 0, width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 36, lineHeight: 44 },
  tag: { position: 'absolute', right: -18, bottom: -6, backgroundColor: semantic.money, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: colors.bg },
  tagText: { color: semantic.moneyInk, fontWeight: '900', fontSize: 11 },
});
