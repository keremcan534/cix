// Code-drawn room entry effects. One timeline per entry (~3.2 s):
//   0.00 s  banner springs in from the left, particle burst from the avatar
//   0.50 s  light sweep runs across the banner
//   0.00–2.6 s  the ride or creature crosses the band behind the banner (when there is one)
//   2.80 s  banner slides out to the right and fades
// Everything animates transform/opacity on the native driver. With "reduce motion" the banner just
// fades in and out, without travel, flashes or particles.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

export type EntryFx = 'sparkle' | 'thunder' | 'dragon' | 'comet' | 'vip';
export type EntryShow = { name: string; avatar: string; fx: EntryFx; ride?: string; colors?: readonly [string, string]; badge?: string };

type Look = { colors: readonly [string, string, string]; particle: string[]; mark: string; creature?: string; flash?: boolean };
export const ENTRY_LOOKS: Record<EntryFx, Look> = {
  sparkle: { colors: ['#4C1D95', '#7C3AED', '#0F766E'], particle: ['#5EEAD4', '#FFFFFF', '#C4B5FD'], mark: '✨' },
  thunder: { colors: ['#172554', '#1D4ED8', '#38BDF8'], particle: ['#E0F2FE', '#FDE047', '#FFFFFF'], mark: '⚡', flash: true },
  dragon: { colors: ['#450A0A', '#B91C1C', '#EA580C'], particle: ['#FDE047', '#F97316', '#FECACA'], mark: '🔥', creature: '🐉' },
  comet: { colors: ['#0B1022', '#312E81', '#7C3AED'], particle: ['#C7D2FE', '#FFFFFF', '#A78BFA'], mark: '🌠', creature: '☄️' },
  vip: { colors: ['#1E1B4B', '#4338CA', '#818CF8'], particle: ['#E0E7FF', '#FFFFFF', '#A5B4FC'], mark: '💠' },
};
const TOTAL_MS = 3200;
const BURST = 12;

export function EntryEffect({ show, still, onDone, top = 104 }: { show: EntryShow; still?: boolean; onDone?: () => void; top?: number }) {
  const { width } = useWindowDimensions();
  const look = ENTRY_LOOKS[show.fx];
  const colors = show.colors ? ([show.colors[0], show.colors[1], look.colors[2]] as const) : look.colors;
  const traveller = show.ride ?? look.creature;
  const [enter] = useState(() => new Animated.Value(still ? 1 : 0));
  const [exit] = useState(() => new Animated.Value(0));
  const [shine] = useState(() => new Animated.Value(0));
  const [burst] = useState(() => new Animated.Value(0));
  const [travel] = useState(() => new Animated.Value(0));
  const [flash] = useState(() => new Animated.Value(0));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (still) {
      const a = Animated.sequence([
        Animated.timing(exit, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(TOTAL_MS - 400),
        Animated.timing(exit, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]);
      a.start(() => done.current?.());
      return () => a.stop();
    }
    const a = Animated.parallel([
      Animated.spring(enter, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
      Animated.timing(burst, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.sequence([Animated.delay(450), Animated.timing(shine, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true })]),
      Animated.timing(travel, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      look.flash
        ? Animated.sequence([
            Animated.delay(120),
            Animated.timing(flash, { toValue: 1, duration: 60, useNativeDriver: true }),
            Animated.timing(flash, { toValue: 0, duration: 120, useNativeDriver: true }),
            Animated.timing(flash, { toValue: 0.7, duration: 50, useNativeDriver: true }),
            Animated.timing(flash, { toValue: 0, duration: 260, useNativeDriver: true }),
          ])
        : Animated.delay(0),
      Animated.sequence([Animated.delay(TOTAL_MS - 400), Animated.timing(exit, { toValue: 1, duration: 380, easing: Easing.in(Easing.cubic), useNativeDriver: true })]),
    ]);
    a.start(() => done.current?.());
    return () => a.stop();
  }, [still, enter, exit, shine, burst, travel, flash, look.flash]);

  const bannerW = Math.min(width - 24, 420);
  const opacity = exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <View pointerEvents="none" style={[s.band, { top }]} accessibilityLiveRegion="polite" accessibilityLabel={`${show.name} odaya katıldı`}>
      {/* Ride / creature crossing behind the banner */}
      {traveller && !still && (
        <Animated.Text
          style={[
            s.traveller,
            {
              transform: [
                { translateX: travel.interpolate({ inputRange: [0, 1], outputRange: [-90, width + 40] }) },
                { translateY: travel.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [6, -6, 4, -8, 0] }) },
                { scaleX: show.fx === 'dragon' ? -1 : 1 },
              ],
              opacity: travel.interpolate({ inputRange: [0, 0.08, 0.9, 1], outputRange: [0, 1, 1, 0] }),
            },
          ]}
        >
          {traveller}
        </Animated.Text>
      )}

      <Animated.View
        style={{
          width: bannerW,
          opacity,
          transform: [
            { translateX: still ? 0 : Animated.add(enter.interpolate({ inputRange: [0, 1], outputRange: [-bannerW - 40, 0] }), exit.interpolate({ inputRange: [0, 1], outputRange: [0, bannerW] })) },
            { scale: still ? 1 : enter.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.92, 1.03, 1] }) },
          ],
        }}
      >
        <LinearGradient colors={colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={s.banner}>
          {/* Light sweep */}
          {!still && (
            <Animated.View style={[s.shine, { transform: [{ translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-120, bannerW + 40] }) }, { rotate: '18deg' }] }]}>
              <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
            </Animated.View>
          )}
          <View style={s.avatarRing}>
            <Image source={{ uri: show.avatar }} style={s.avatar} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.name} numberOfLines={1}>
              {show.badge ? `${show.badge} ` : ''}
              {show.name}
            </Text>
            <Text style={s.sub} numberOfLines={1}>
              {show.ride ? `${show.ride} ile ` : ''}odaya katıldı
            </Text>
          </View>
          <Text style={s.mark}>{look.mark}</Text>
          {/* Lightning flash, clipped to the banner */}
          {look.flash && !still && <Animated.View style={[StyleSheet.absoluteFill, s.flash, { opacity: flash }]} />}
        </LinearGradient>

        {/* Particle burst from the avatar */}
        {!still &&
          Array.from({ length: BURST }, (_, i) => {
            const a = (i / BURST) * Math.PI * 2;
            const d = 46 + (i % 3) * 14;
            return (
              <Animated.View
                key={i}
                style={[
                  s.particle,
                  {
                    backgroundColor: look.particle[i % look.particle.length],
                    opacity: burst.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
                    transform: [
                      { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * d] }) },
                      { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * d * 0.7] }) },
                      { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1.2, 0.3] }) },
                    ],
                  },
                ]}
              />
            );
          })}
      </Animated.View>

    </View>
  );
}

const s = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0, height: 96, alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  traveller: { position: 'absolute', left: 0, top: -6, fontSize: 46 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 60, borderRadius: 30, paddingLeft: 5, paddingRight: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  shine: { position: 'absolute', top: -30, bottom: -30, width: 70 },
  avatarRing: { width: 50, height: 50, borderRadius: 25, padding: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
  avatar: { flex: 1, borderRadius: 23 },
  name: { color: '#fff', fontWeight: '900', fontSize: 15 },
  sub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  mark: { fontSize: 24 },
  particle: { position: 'absolute', left: 28, top: 27, width: 6, height: 6, borderRadius: 3 },
  flash: { backgroundColor: '#E0F2FE' },
});
