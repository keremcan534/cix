// A sent gift flies from the gift button to each recipient's seat along an arc, then lands with a pop
// and a "×count" tag. Window coordinates come from measureInWindow on the seat avatars.
// Transform/opacity only, on the native driver; callers skip it when effects are off or motion is reduced.
// `hold`: the gift first shows big where it starts (the screen's middle, Güncelleme 8) for that long, then every copy
// of one send leaves at once.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Icon3D, icon3dFor } from '@/components/Icon3D';
import { GiftArt, giftArtOf } from '@/components/GiftArt';
import { ReactionArt } from '@/components/ReactionArt';
import { colors, semantic } from '@/theme';

export type Point = { x: number; y: number };
export type Flight = {
  key: string;
  emoji: string;
  count: number;
  from: Point;
  to: Point;
  delay: number;
  /** Catalog gift id: flies its image when it has one. */
  giftId?: string;
  /** A sticker token (lib/stickers): flies its picture, playing (a Hamle's kiss or fist, lib/room-moves). */
  sticker?: string;
  /** Ms it shows big at `from` before it flies (0: it flies at once). */
  hold?: number;
};

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
  const hold = flight.hold ?? 0;
  // 1 while it waits big at the start (a send's pop in the middle), then it shrinks into the flight.
  const [pop] = useState(() => new Animated.Value(hold ? 0 : 1));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const a = Animated.sequence([
      Animated.delay(flight.delay),
      ...(hold
        ? [
            Animated.timing(pop, { toValue: 1, duration: Math.min(260, hold), easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
            Animated.delay(Math.max(0, hold - 260)),
          ]
        : []),
      Animated.timing(t, { toValue: 1, duration: FLY_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      Animated.timing(land, { toValue: 1, duration: LAND_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]);
    a.start(() => done.current(flight.key));
    return () => a.stop();
  }, [t, land, pop, hold, flight.delay, flight.key]);

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
            t.interpolate({ inputRange: [0, hold ? 0.02 : 0.08, 1], outputRange: [0, 1, 1] }),
            land.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1, 0] }),
          ),
          transform: [
            { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [from.x - SIZE / 2, to.x - SIZE / 2] }) },
            { translateY: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [from.y - SIZE / 2, midY - SIZE / 2, to.y - SIZE / 2] }) },
            {
              scale: Animated.add(
                hold
                  ? Animated.add(t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [2.4, 1.35, 1] }), pop.interpolate({ inputRange: [0, 1], outputRange: [-2.4, 0] }))
                  : t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.35, 1] }),
                land.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.45, 0.2] }),
              ),
            },
            { rotate: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-14deg', '10deg', '0deg'] }) },
          ],
        },
      ]}
    >
      {flight.sticker ? (
        <ReactionArt emoji={flight.sticker} size={SIZE} play="loop" />
      ) : giftArtOf(flight.giftId) ? (
        <GiftArt giftId={flight.giftId} emoji={flight.emoji} size={SIZE} />
      ) : icon ? (
        <Icon3D name={icon} size={SIZE} />
      ) : (
        <Text style={s.emoji}>{flight.emoji}</Text>
      )}
      {flight.count > 1 && (
        <Animated.View style={[s.tag, { opacity: land.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }) }]}>
          <Text style={s.tagText}>×{flight.count}</Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  abs: { position: 'absolute' },
  glow: { width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,210,90,0.55)', boxShadow: '0 0 60px rgba(255,200,80,0.9)' },
  burstCount: { width: 120, textAlign: 'center', color: '#FFE27A', fontSize: 30, fontWeight: '900', fontStyle: 'italic', textShadowColor: 'rgba(120,40,0,0.9)', textShadowRadius: 6 },
  box: { position: 'absolute', left: 0, top: 0, width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 36, lineHeight: 44 },
  tag: { position: 'absolute', right: -18, bottom: -6, backgroundColor: semantic.money, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: colors.bg },
  tagText: { color: semantic.moneyInk, fontWeight: '900', fontSize: 11 },
});

// --- The show in the middle before a send flies out (Güncelleme 8, the owners' sample video) ----------------------
/** One send's show: its gift, how many recipients (copies) and how many each, where, how long before they fly. */
export type Burst = { key: string; emoji: string; giftId?: string; at: Point; copies: number; count: number; ms: number };

export function GiftBursts({ bursts, onDone }: { bursts: Burst[]; onDone: (key: string) => void }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bursts.map((b) => (
        <GiftBurst key={b.key} burst={b} onDone={onDone} />
      ))}
    </View>
  );
}

const RING = 10;
const BIG = 64;
/** A gift's picture at `size` (its art, its 3D icon, or its emoji). */
function GiftPic({ giftId, emoji, size }: { giftId?: string; emoji: string; size: number }) {
  const icon = icon3dFor(emoji);
  if (giftArtOf(giftId)) return <GiftArt giftId={giftId} emoji={emoji} size={size} />;
  if (icon) return <Icon3D name={icon} size={size} />;
  return <Text style={{ fontSize: size * 0.8 }}>{emoji}</Text>;
}

/**
 * A golden glow opens behind the gift, which springs up big in the middle; two rings of copies swirl out around it
 * and fade; ×count under it when more than one each. Over by `ms`, when the copies leave for the seats.
 */
function GiftBurst({ burst, onDone }: { burst: Burst; onDone: (key: string) => void }) {
  const [t] = useState(() => new Animated.Value(0));
  const [big] = useState(() => new Animated.Value(0));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const a = Animated.parallel([
      Animated.timing(t, { toValue: 1, duration: burst.ms, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.sequence([Animated.spring(big, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }), Animated.delay(Math.max(0, burst.ms - 420))]),
    ]);
    a.start(() => done.current(burst.key));
    return () => a.stop();
  }, [t, big, burst.ms, burst.key]);
  const { x, y } = burst.at;
  const ring = (n: number, radius: number, size: number, from: number, turn: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const out = t.interpolate({ inputRange: [0, from, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });
      return (
        <Animated.View
          key={`${radius}-${i}`}
          style={[
            s.abs,
            {
              left: x - size / 2,
              top: y - size / 2,
              width: size,
              height: size,
              opacity: t.interpolate({ inputRange: [0, from, from + 0.15, 0.85, 1], outputRange: [0, 0, 1, 1, 0], extrapolate: 'clamp' }),
              transform: [
                { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${turn}deg`] }) },
                { translateX: Animated.multiply(out, Math.cos(a) * radius) },
                { translateY: Animated.multiply(out, Math.sin(a) * radius) },
                { scale: out.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1.15, 0.9] }) },
              ],
            },
          ]}
        >
          <GiftPic giftId={burst.giftId} emoji={burst.emoji} size={size} />
        </Animated.View>
      );
    });
  return (
    <>
      {/* The glow: a soft golden disc that opens and fades. */}
      <Animated.View
        style={[
          s.abs,
          s.glow,
          {
            left: x - 110,
            top: y - 110,
            opacity: t.interpolate({ inputRange: [0, 0.2, 0.75, 1], outputRange: [0, 0.75, 0.55, 0] }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1.5] }) }],
          },
        ]}
      />
      {ring(RING, 104, 30, 0.12, 40)}
      {ring(Math.max(6, Math.min(RING, burst.copies * 2)), 62, 36, 0.05, -30)}
      <Animated.View
        style={[
          s.abs,
          {
            left: x - BIG,
            top: y - BIG,
            width: BIG * 2,
            height: BIG * 2,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: t.interpolate({ inputRange: [0, 0.05, 0.9, 1], outputRange: [0, 1, 1, 0] }),
            transform: [{ scale: big.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }, { rotate: t.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: ['-8deg', '6deg', '-4deg', '0deg'] }) }],
          },
        ]}
      >
        <GiftPic giftId={burst.giftId} emoji={burst.emoji} size={BIG * 1.6} />
      </Animated.View>
      {burst.count > 1 && <Animated.Text style={[s.abs, s.burstCount, { left: x - 60, top: y + BIG * 0.75, opacity: big }]}>×{burst.count.toLocaleString('tr-TR')}</Animated.Text>}
    </>
  );
}
