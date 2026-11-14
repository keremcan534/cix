// Ses dalgası: the ring around a speaker's seat, which grows and glows with their voice (lib/live/voice-level). With no
// wave worn it is the plain ring in the speaker's gender color (parts VOICE_RING). The paid ones (the shop's 'wave'
// slot, server/api/catalog.mjs; data/catalog.ts COSMETICS) are drawn here in code and follow the same voice level.
// Every wave is drawn the same way and the same size (lib/seat-cell ringOf): behind the face and its frame, just
// outside the face (never on the photo), and the voice takes it at most `reach` px further out. So a speaker's ring
// looks the same on their own phone and on everyone else's whatever frame they wear, and never runs over the next seat.
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';

import { Photo } from '@/components/photo';
import { ringOf } from '@/lib/seat-cell';
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
// No purple: red, yellow, turquoise and blue round the ring.
const RAINBOW = ['#FF3B30', '#FFD60A', '#13D9DF', '#3D9BFF'] as const;

const glow = (c: string, r: number) => `0 0 ${r}px ${c}CC`;

type Props = {
  /** The worn wave's id; anything else: the plain ring. */
  wave?: string | null;
  /** The face's size: the ring goes round it. */
  size: number;
  /** The speaker's gender color. */
  color: string;
  /** Their voice, 0..1. */
  level: Animated.Value;
  /** Reduce motion: a still ring. */
  still?: boolean;
  /** How far (px) past the face the ring may go at full voice (a seat: lib/seat-cell ringReach); default a seventh of it. */
  reach?: number;
};

export function VoiceWave({ wave, size, color, level, still, reach = Math.round(size / 7) }: Props) {
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

  const { width: w, side, max } = ringOf(size, reach);
  // The ring's box, centred on the face: at rest its inner edge is just outside the face.
  const box: ViewStyle = { position: 'absolute', left: (size - side) / 2, top: (size - side) / 2, width: side, height: side, borderRadius: side / 2 };
  const blur = Math.max(3, Math.round(reach * 0.8));
  const at = (lo: number, hi: number) => level.interpolate({ inputRange: [0, 1], outputRange: [lo, hi], extrapolate: 'clamp' });
  const grow = still ? 1 : at(1, max);
  const fade = still ? 0.9 : at(0.55, 1);
  const ring = (c: string, width = w): ViewStyle => ({ ...box, borderWidth: width, borderColor: c, boxShadow: glow(c, blur) });
  const spin = clock.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  if (kind === 'wv-rainbow')
    return (
      // A turning ring in four colors: a ring, not a disc, so none of it shows on the photo or inside a frame.
      <Animated.View
        pointerEvents="none"
        style={[
          box,
          { borderWidth: w, borderTopColor: RAINBOW[0], borderRightColor: RAINBOW[1], borderBottomColor: RAINBOW[2], borderLeftColor: RAINBOW[3], boxShadow: glow(RAINBOW[1], blur) },
          { opacity: fade, transform: [{ scale: grow }, { rotate: spin }] },
        ]}
      />
    );

  if (kind === 'wv-flame') {
    // The orange ring on the face and a red one that the voice takes further out; both stay inside the reach.
    const half = 1 + (max - 1) / 2;
    const inner = still ? 1 : at(1, half);
    const outer = still ? half : at(1 + (max - 1) * 0.35, max);
    const outerFade = still ? 0.6 : at(0.25, 0.9);
    return (
      <>
        <Animated.View pointerEvents="none" style={[ring(FLAME[1], Math.max(1.5, w - 1)), { opacity: outerFade, transform: [{ scale: outer }] }]} />
        <Animated.View pointerEvents="none" style={[ring(FLAME[0]), { opacity: fade, transform: [{ scale: inner }] }]} />
      </>
    );
  }

  if (kind === 'wv-gold')
    return (
      <>
        {!still && (
          // A ripple that leaves the ring and fades out by the edge of the reach, again and again.
          <Animated.View
            pointerEvents="none"
            style={[
              ring(GOLD, 1.5),
              { opacity: clock.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0] }), transform: [{ scale: clock.interpolate({ inputRange: [0, 1], outputRange: [1, max] }) }] },
            ]}
          />
        )}
        <Animated.View pointerEvents="none" style={[ring(GOLD, w + 1), { opacity: fade, transform: [{ scale: grow }] }]} />
      </>
    );

  const plain = <Animated.View pointerEvents="none" style={[ring(color), { opacity: fade, transform: [{ scale: grow }] }]} />;
  if (kind !== 'wv-sparkle') return plain;
  // Parıltı: the plain ring with four white sparks turning on it.
  const dot = Math.max(3, Math.round(size / 12));
  return (
    <>
      {plain}
      <Animated.View pointerEvents="none" style={[box, { transform: [{ scale: grow }, { rotate: spin }] }]}>
        {[0, 90, 180, 270].map((deg) => (
          <View key={deg} style={[StyleSheet.absoluteFill, { alignItems: 'center', transform: [{ rotate: `${deg}deg` }] }]}>
            <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: '#FFFFFF', boxShadow: glow('#FFFFFF', 6) }} />
          </View>
        ))}
      </Animated.View>
    </>
  );
}

/** The shop's sample: a face talking with this wave (the level flickers the way speech does), drawn as on a seat. */
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
      <Photo uri={uri} kind="face" style={{ width: size, height: size, borderRadius: size / 2 }} />
    </View>
  );
}
