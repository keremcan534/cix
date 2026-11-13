// Ses dalgası: the ring around a speaker's seat, which grows and glows with their voice (lib/live/voice-level). With no
// wave worn it is the plain ring in the speaker's gender color (parts VOICE_RING). The paid ones (the shop's 'wave'
// slot, server/api/catalog.mjs; data/catalog.ts COSMETICS) are drawn here in code and follow the same voice level.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Photo } from '@/components/photo';
import { semantic } from '@/theme';

/** The speaking ring's color: pink for women, blue for men, white when the gender isn't known or is hidden. */
export const VOICE_RING = { Kadın: semantic.live, Erkek: '#3D9BFF', none: '#FFFFFF' } as const;
/** My own ring's color, from my profile (a hidden gender: white). */
export const voiceOf = (gender: string | null | undefined, shown = true) => (shown && (gender === 'Kadın' || gender === 'Erkek') ? VOICE_RING[gender] : VOICE_RING.none);

export const WAVE_IDS = ['wv-sparkle', 'wv-flame', 'wv-rainbow', 'wv-gold'] as const;
export type WaveId = (typeof WAVE_IDS)[number];
export const isWave = (id: unknown): id is WaveId => typeof id === 'string' && (WAVE_IDS as readonly string[]).includes(id);

const FLAME = ['#FF8A3D', '#FF3B30'] as const;
const GOLD = '#F6BD60';
// No purple: red to blue.
const RAINBOW = ['#FF3B30', '#FF8A3D', '#FFD60A', '#34C759', '#13D9DF', '#3D9BFF', '#FF3B30'] as const;

/** The color the seat's photo edge and glow take while this wave plays; `voice`: the speaker's gender color. */
export function waveTint(wave: string | null | undefined, voice: string) {
  if (wave === 'wv-flame') return FLAME[0];
  if (wave === 'wv-rainbow') return RAINBOW[2];
  if (wave === 'wv-gold') return GOLD;
  return voice;
}

const glow = (c: string, r = 12) => `0 0 ${r}px ${c}CC`;

type Props = {
  /** The worn wave's id; anything else: the plain ring. */
  wave?: string | null;
  /** The face's size. */
  size: number;
  /** The speaker's gender color. */
  color: string;
  /** Their voice, 0..1. */
  level: Animated.Value;
  /** Reduce motion: a still ring. */
  still?: boolean;
};

export function VoiceWave({ wave, size, color, level, still }: Props) {
  const kind = isWave(wave) ? wave : null;
  // One clock for the styles that move on their own (the sparks' orbit, the rainbow's turn, the gold ripple).
  const [clock] = useState(() => new Animated.Value(0));
  const moving = !still && kind !== null && kind !== 'wv-flame';
  useEffect(() => {
    if (!moving) return;
    const ms = kind === 'wv-gold' ? 1_300 : kind === 'wv-rainbow' ? 3_200 : 2_600;
    const loop = Animated.loop(Animated.timing(clock, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => {
      loop.stop();
      clock.setValue(0);
    };
  }, [moving, kind, clock]);

  const round = { width: size, height: size, borderRadius: size / 2 };
  const grow = still ? 1.08 : level.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.38] });
  const fade = still ? 0.85 : level.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  const ring = (c: string, width = 4) => [s.abs, round, { borderWidth: width, borderColor: c, boxShadow: glow(c) }];
  const spin = clock.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  if (kind === 'wv-rainbow')
    return (
      // A turning rainbow disc behind the face: the part outside it is the ring.
      <Animated.View pointerEvents="none" style={[s.abs, round, { opacity: fade, transform: [{ scale: grow }, { rotate: spin }], boxShadow: glow(RAINBOW[2], 16) }]}>
        <LinearGradient colors={RAINBOW} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} />
      </Animated.View>
    );

  if (kind === 'wv-flame') {
    const outer = still ? 1.2 : level.interpolate({ inputRange: [0, 1], outputRange: [1.12, 1.58] });
    const outerFade = still ? 0.6 : level.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.9] });
    return (
      <>
        <Animated.View pointerEvents="none" style={[...ring(FLAME[1], 2), { opacity: outerFade, transform: [{ scale: outer }] }]} />
        <Animated.View pointerEvents="none" style={[...ring(FLAME[0]), { opacity: fade, transform: [{ scale: grow }] }]} />
      </>
    );
  }

  if (kind === 'wv-gold')
    return (
      <>
        {!still && (
          // A ripple that leaves the ring and fades, again and again.
          <Animated.View
            pointerEvents="none"
            style={[
              ...ring(GOLD, 2),
              { opacity: clock.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0] }), transform: [{ scale: clock.interpolate({ inputRange: [0, 1], outputRange: [1.1, 1.7] }) }] },
            ]}
          />
        )}
        <Animated.View pointerEvents="none" style={[...ring(GOLD, 5), { opacity: fade, transform: [{ scale: grow }] }]} />
      </>
    );

  const plain = <Animated.View pointerEvents="none" style={[...ring(color), { opacity: fade, transform: [{ scale: grow }] }]} />;
  if (kind !== 'wv-sparkle') return plain;
  // Parıltı: the plain ring with four white sparks turning around it.
  const dot = Math.max(4, Math.round(size / 10));
  return (
    <>
      {plain}
      <Animated.View pointerEvents="none" style={[s.abs, round, { transform: [{ scale: grow }, { rotate: spin }] }]}>
        {[0, 90, 180, 270].map((deg) => (
          <View key={deg} style={[StyleSheet.absoluteFill, { alignItems: 'center', transform: [{ rotate: `${deg}deg` }] }]}>
            <View style={{ width: dot, height: dot, borderRadius: dot / 2, marginTop: -dot / 2, backgroundColor: '#FFFFFF', boxShadow: glow('#FFFFFF', 8) }} />
          </View>
        ))}
      </Animated.View>
    </>
  );
}

/** The shop's sample: a face talking with this wave (the level flickers the way speech does). */
export function WavePreview({ wave, uri, color, size = 64, still }: { wave: string; uri: string; color: string; size?: number; still?: boolean }) {
  const [level] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (still) return;
    const steps = [0.55, 0.2, 0.85, 0.35, 0.7, 0.15, 0.95, 0.4];
    const talk = Animated.loop(Animated.sequence(steps.map((toValue, i) => Animated.timing(level, { toValue, duration: 120 + (i % 3) * 50, useNativeDriver: true }))));
    talk.start();
    return () => talk.stop();
  }, [still, level]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <VoiceWave wave={wave} size={size} color={color} level={level} still={still} />
      <Photo uri={uri} kind="face" style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: waveTint(wave, color) }} />
    </View>
  );
}

const s = StyleSheet.create({ abs: { position: 'absolute' } });
