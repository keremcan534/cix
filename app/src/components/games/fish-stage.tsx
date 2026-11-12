// What Balon Avı's stage is made of: the sky (sun rays, clouds, drifting specks of light), a balloon floating its
// crossing, the cannon, a shot in the air and what it leaves where it lands (a hit bursting into coins, or a small
// puff). Everything moves on Animated values with the native driver: a balloon hangs on one value for its whole
// crossing, the sky on two loops. The numbers come from fish-swim; nothing here knows a round. (A balloon is still a
// `Fish` here: the game's ids are its first, fish-shaped ones.)
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useMemo } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';

import { Coins } from '@/components/games/fx/coins';
import type { Swim } from '@/components/games/fish-swim';
import { Text } from '@/components/text';
import type { FishKind } from '@/lib/fish-hunt';

const GLOW = require('../../../assets/fx/glow.png');
const clamp = { extrapolate: 'clamp' as const };
const fmt = (n: number) => Math.floor(n).toLocaleString('tr-TR');

export type Fish = {
  key: number;
  kind: FishKind;
  swim: Swim;
  /** How big it is drawn (px) and how long a whole crossing takes (ms). */
  size: number;
  dur: number;
  /** 0 … 1 of the crossing. */
  p: Animated.Value;
  /** 0 → 1: the pop when it is hit, the wobble when a shot missed it. */
  hit: Animated.Value;
  /** Its place on the stage, from `p` (built once, when it is born). */
  move: { x: Animated.AnimatedInterpolation<number>; y: Animated.AnimatedInterpolation<number>; tilt: Animated.AnimatedInterpolation<string> };
  /** When it was hit (ms): it pops, and is taken off the stage once it has. */
  gone?: number;
};
export type Shot = { key: number; x0: number; y0: number; x1: number; y1: number; v: Animated.Value };
export type Burst = { key: number; kind: 'catch' | 'miss' | 'free'; x: number; y: number; amount: number; coins: number; ms: number; v: Animated.Value };

/** The light a balloon's price tag is written in, by how much it pays. */
export const tierColor = (mult: number) => (mult >= 50 ? '#FDE047' : mult >= 20 ? '#D8B4FE' : mult >= 8 ? '#86EFAC' : '#E0F2FE');

// --- The sky --------------------------------------------------------------------------------------------------

/** Ranges for something that follows f(q) with q = the loop's value shifted by `phase` (and wrapped, as a step). */
function looped(phase: number, qs: number[], f: (q: number) => number) {
  const a = [phase, ...qs.filter((q) => q > phase && q < 1), 1];
  const b = [0, ...qs.filter((q) => q > 0 && q < phase), phase];
  return { inputRange: [...a.map((q) => q - phase), ...b.map((q) => q - phase + 1)], outputRange: [...a.map(f), ...b.map(f)] };
}

/** Rays of sunlight from the top of the sky. */
const SUN_RAYS = [
  { x: 0.02, width: 44, deg: 15, a: 0.5, b: 0.9 },
  { x: 0.24, width: 72, deg: 19, a: 0.95, b: 0.45 },
  { x: 0.52, width: 38, deg: 13, a: 0.4, b: 0.85 },
  { x: 0.74, width: 60, deg: 17, a: 0.9, b: 0.5 },
];
/** Specks of light drifting up through the air. */
const SPECKS = [
  { x: 0.08, size: 7, phase: 0.05 },
  { x: 0.17, size: 4, phase: 0.55 },
  { x: 0.29, size: 9, phase: 0.3 },
  { x: 0.42, size: 5, phase: 0.8 },
  { x: 0.55, size: 6, phase: 0.15 },
  { x: 0.63, size: 4, phase: 0.65 },
  { x: 0.76, size: 8, phase: 0.42 },
  { x: 0.86, size: 5, phase: 0.92 },
  { x: 0.94, size: 6, phase: 0.25 },
];

/**
 * The sky the balloons float in: deep blue above, light toward the horizon, the sun's glow and rays at the top that
 * breathe, clouds along the bottom and specks of light drifting up. `flow` loops 0 → 1 (the specks' way up), `sway`
 * goes 0 → 1 → 0.
 */
export const Sky = memo(function Sky({ w, h, still, flow, sway }: { w: number; h: number; still: boolean; flow: Animated.Value; sway: Animated.Value }) {
  const specks = useMemo(
    () =>
      SPECKS.map((b) => ({
        ...b,
        y: flow.interpolate(looped(b.phase, [], (q) => h + 10 - q * (h + 30))),
        opacity: flow.interpolate(looped(b.phase, [0.06, 0.8], (q) => (q <= 0 || q >= 1 ? 0 : 0.55))),
      })),
    [flow, h],
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={['#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD']} locations={[0, 0.2, 0.48, 0.76, 1]} style={StyleSheet.absoluteFill} />
      <Image source={GLOW} style={{ position: 'absolute', left: w * 0.1, top: -w * 0.5, width: w * 0.8, height: w * 0.8, tintColor: '#FEF3C7', opacity: 0.55 }} />
      {SUN_RAYS.map((s, i) => (
        <Animated.View key={i} style={[st.sunRay, { left: s.x * w, width: s.width, height: h * 0.9, transform: [{ rotate: `${s.deg}deg` }], opacity: still ? 0.6 : sway.interpolate({ inputRange: [0, 1], outputRange: [s.a, s.b] }) }]}>
          <LinearGradient colors={['rgba(255,251,235,0.45)', 'rgba(255,251,235,0.14)', 'rgba(255,251,235,0)']} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ))}
      {/* The top of the sky: a band of light. */}
      <LinearGradient colors={['rgba(255,251,235,0.4)', 'rgba(255,251,235,0)']} style={st.skyTop} />
      {/* Clouds along the bottom: far ones, then a near one. */}
      <View style={[st.cloud, { left: -w * 0.1, width: w * 0.62, height: 96, bottom: -34, backgroundColor: 'rgba(255,255,255,0.55)' }]} />
      <View style={[st.cloud, { left: w * 0.44, width: w * 0.72, height: 124, bottom: -52, backgroundColor: 'rgba(255,255,255,0.6)' }]} />
      <View style={[st.cloud, { left: -w * 0.2, width: w * 1.4, height: 70, bottom: -44, backgroundColor: 'rgba(255,255,255,0.85)' }]} />
      {!still &&
        specks.map((b, i) => (
          <Animated.View
            key={i}
            style={[st.speck, { left: b.x * w, width: b.size, height: b.size, borderRadius: b.size, opacity: b.opacity, transform: [{ translateY: b.y }, { translateX: sway.interpolate({ inputRange: [0, 1], outputRange: i % 2 ? [-5, 5] : [4, -4] }) }] }]}
          />
        ))}
    </View>
  );
});

/** The sky turned to ice while the balloons are stopped: a cold light over the stage and frost in its corners. */
export function Frost({ on }: { on: Animated.Value }) {
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: on }]} pointerEvents="none">
      <LinearGradient colors={['rgba(224,242,254,0.42)', 'rgba(186,230,253,0.12)', 'rgba(224,242,254,0.36)']} style={StyleSheet.absoluteFill} />
      {[
        { left: -60, top: -60 },
        { right: -60, top: -60 },
        { left: -60, bottom: -60 },
        { right: -60, bottom: -60 },
      ].map((p, i) => (
        <Image key={i} source={GLOW} style={[st.frost, p]} />
      ))}
      {[
        { left: '12%', top: '16%', size: 20 },
        { left: '78%', top: '24%', size: 26 },
        { left: '46%', top: '42%', size: 18 },
        { left: '22%', top: '58%', size: 24 },
        { left: '70%', top: '62%', size: 16 },
      ].map((f, i) => (
        <Ionicons key={i} name="snow" size={f.size} color="rgba(255,255,255,0.75)" style={{ position: 'absolute', left: f.left as `${number}%`, top: f.top as `${number}%` }} />
      ))}
    </Animated.View>
  );
}

// --- A balloon ------------------------------------------------------------------------------------------------

/**
 * One balloon: it rides its crossing (place and tilt from `fish.p`), it wobbles with the shared `flex` beat, and
 * its price tag stays level under it. Hit, it flashes, swells and spins away; missed, it wobbles. `turn` spins the
 * lock ring.
 */
export const FishSprite = memo(function FishSprite({ fish, locked, flex, turn }: { fish: Fish; locked: boolean; flex: Animated.Value; turn: Animated.Value }) {
  const s = fish.size;
  const box = s + 22;
  const { hit } = fish;
  const caught = fish.gone !== undefined;
  const color = tierColor(fish.kind.mult);
  const body = caught
    ? {
        opacity: hit.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
        transform: [{ scale: hit.interpolate({ inputRange: [0, 0.16, 0.45, 1], outputRange: [1, 1.45, 1.2, 0.15] }) }, { rotate: hit.interpolate({ inputRange: [0, 0.3, 1], outputRange: ['0deg', '0deg', `${fish.swim.dir * 240}deg`] }) }],
      }
    : {
        transform: [
          { rotate: hit.interpolate({ inputRange: [0, 0.2, 0.45, 0.7, 1], outputRange: ['0deg', '-13deg', '10deg', '-5deg', '0deg'] }) },
          { translateX: hit.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, fish.swim.dir * 7, 0] }) },
          { scaleX: flex.interpolate({ inputRange: [0, 1], outputRange: [1, 0.91] }) },
        ],
      };
  return (
    <Animated.View pointerEvents="none" style={[st.fish, { width: box, height: box, transform: [{ translateX: fish.move.x }, { translateY: fish.move.y }] }]}>
      {locked && !caught && (
        <Animated.View style={[st.lock, { width: box + 4, height: box + 4, borderRadius: (box + 4) / 2, left: -2, top: -2, transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]} />
      )}
      <Animated.View style={{ transform: [{ rotate: fish.move.tilt }] }}>
        <Animated.View style={body}>
          <Text style={{ fontSize: s * 0.82, lineHeight: s * 1.08, transform: [{ scaleX: fish.swim.dir === 1 ? -1 : 1 }] }}>{fish.kind.emoji}</Text>
        </Animated.View>
      </Animated.View>
      {caught ? (
        <Animated.Image source={GLOW} style={[st.fishFlash, { width: box * 1.5, height: box * 1.5, left: -box * 0.25, top: -box * 0.25, opacity: hit.interpolate({ inputRange: [0, 0.1, 0.4], outputRange: [0, 1, 0], ...clamp }) }]} />
      ) : (
        <View style={[st.tag, { borderColor: color }, fish.kind.mult >= 20 && st.tagBig]}>
          <Text style={[st.tagText, { color }, fish.kind.mult >= 20 && { fontSize: 13 }]}>{fish.kind.mult}×</Text>
        </View>
      )}
    </Animated.View>
  );
});

// --- The cannon and its shots ---------------------------------------------------------------------------------

/** From the cannon's hub to its mouth (px): where a shot leaves it. */
export const BARREL = 66;
/** The hub stands this far above the stage's bottom edge. */
export const HUB_UP = 28;

/** The cannon at the bottom of the stage: the barrel turns around the hub (`aim`, degrees) and kicks back when it fires. */
export const Cannon = memo(function Cannon({ aim, kick }: { aim: Animated.Value; kick: Animated.Value }) {
  return (
    <View style={st.cannon} pointerEvents="none">
      {/* A box twice the barrel's length centred on the hub, with the barrel in its upper half: turning the box turns the barrel around the hub. */}
      <Animated.View style={[st.turret, { transform: [{ rotate: aim.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] }) }] }]}>
        <Animated.View style={{ alignItems: 'center', transform: [{ translateY: kick.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }) }] }}>
          <Animated.Image source={GLOW} style={[st.muzzleFlash, { opacity: kick.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 0.35, 1] }) }]} />
          <View style={st.muzzle} />
          <LinearGradient colors={['#F8FAFC', '#94A3B8', '#334155']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={st.barrel}>
            <View style={[st.band, { top: 8 }]} />
            <View style={[st.band, { top: 30 }]} />
          </LinearGradient>
        </Animated.View>
      </Animated.View>
      <LinearGradient colors={['#7C8BA1', '#334155', '#0F172A']} style={st.base}>
        <View style={st.hub}>
          <View style={st.hubCore} />
        </View>
      </LinearGradient>
    </View>
  );
});

/** A shot on its way: bright at the head, fading behind. */
export const ShotView = memo(function ShotView({ shot }: { shot: Shot }) {
  const deg = (Math.atan2(shot.x1 - shot.x0, shot.y0 - shot.y1) * 180) / Math.PI;
  return (
    <Animated.View
      pointerEvents="none"
      style={[st.shot, { transform: [{ translateX: shot.v.interpolate({ inputRange: [0, 1], outputRange: [shot.x0 - 5, shot.x1 - 5] }) }, { translateY: shot.v.interpolate({ inputRange: [0, 1], outputRange: [shot.y0 - 15, shot.y1 - 15] }) }, { rotate: `${deg}deg` }] }]}
    >
      <LinearGradient colors={['#FFFFFF', '#FDE047', 'rgba(249,115,22,0)']} locations={[0, 0.3, 1]} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
});

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];
const DROPS = [-52, -18, 20, 50];

/**
 * What a shot leaves where it lands. A hit: a ring of light, rays, coins thrown up from the balloon and its amount
 * floating off. A miss, or a shot into empty sky: a small ring and a few sparks, soon gone.
 */
export const BurstView = memo(function BurstView({ burst, still }: { burst: Burst; still: boolean }) {
  const { v } = burst;
  if (burst.kind !== 'catch')
    return (
      <View style={{ position: 'absolute', left: burst.x, top: burst.y }} pointerEvents="none">
        <Animated.View style={[st.ripple, { opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.8, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, burst.kind === 'miss' ? 1.25 : 0.9] }) }] }]} />
        {DROPS.map((deg, i) => (
          <View key={i} style={[st.arm, { transform: [{ rotate: `${deg}deg` }] }]}>
            <Animated.View style={[st.drop, { opacity: v.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 0.9, 0.7, 0] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-4, -22 - (i % 2) * 8] }) }] }]} />
          </View>
        ))}
      </View>
    );
  const big = burst.coins >= 12;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {!still && (
        <View style={{ position: 'absolute', left: burst.x - 120, top: burst.y - 150, width: 240, height: 300 }}>
          <Coins kind="fountain" count={burst.coins} width={240} height={300} ms={burst.ms} from={0.5} />
        </View>
      )}
      <View style={{ position: 'absolute', left: burst.x, top: burst.y }}>
        <Animated.Image source={GLOW} style={[st.catchGlow, { opacity: v.interpolate({ inputRange: [0, 0.08, 0.5], outputRange: [0, 1, 0], ...clamp }), transform: [{ scale: v.interpolate({ inputRange: [0, 0.5], outputRange: [0.3, 1.3], ...clamp }) }] }]} />
        <Animated.View style={[st.catchRing, { opacity: v.interpolate({ inputRange: [0, 0.08, 0.55], outputRange: [0, 1, 0], ...clamp }), transform: [{ scale: v.interpolate({ inputRange: [0, 0.55], outputRange: [0.25, big ? 2 : 1.5], ...clamp }) }] }]} />
        {RAYS.map((deg) => (
          <View key={deg} style={[st.arm, { transform: [{ rotate: `${deg}deg` }] }]}>
            <Animated.View style={[st.ray, { opacity: v.interpolate({ inputRange: [0, 0.06, 0.4], outputRange: [0, 1, 0], ...clamp }), transform: [{ translateY: v.interpolate({ inputRange: [0, 0.4], outputRange: [-8, -44], ...clamp }) }] }]} />
          </View>
        ))}
        <Animated.View style={[st.amountWrap, { opacity: v.interpolate({ inputRange: [0, 0.08, 0.78, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-6, -62] }) }, { scale: v.interpolate({ inputRange: [0, 0.14, 0.26, 1], outputRange: [0.5, 1.25, 1, 1] }) }] }]}>
          <Text style={[st.amount, big && { fontSize: 26 }]} numberOfLines={1}>
            +{fmt(burst.amount)}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
});

const st = StyleSheet.create({
  sunRay: { position: 'absolute', top: -40 },
  skyTop: { position: 'absolute', left: 0, right: 0, top: 0, height: 54 },
  cloud: { position: 'absolute', borderRadius: 999 },
  speck: { position: 'absolute', top: 0, backgroundColor: 'rgba(255,255,255,0.7)' },
  frost: { position: 'absolute', width: 220, height: 220, tintColor: '#FFFFFF', opacity: 0.6 },
  fish: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center' },
  lock: { position: 'absolute', borderWidth: 2.5, borderColor: '#FB7185', borderStyle: 'dashed' },
  fishFlash: { position: 'absolute', tintColor: '#FFFBEB' },
  tag: { position: 'absolute', bottom: -3, minWidth: 30, height: 18, borderRadius: 9, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(4,14,44,0.82)', borderWidth: 1.2 },
  tagBig: { height: 20, borderRadius: 10, borderWidth: 1.6 },
  tagText: { fontSize: 12, lineHeight: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  cannon: { position: 'absolute', left: '50%', bottom: 0, width: 0, height: 0 },
  turret: { position: 'absolute', left: -BARREL, bottom: HUB_UP - BARREL, width: BARREL * 2, height: BARREL * 2 },
  muzzleFlash: { position: 'absolute', left: BARREL - 32, top: -30, width: 64, height: 64, tintColor: '#FDE68A' },
  muzzle: { width: 32, height: 10, borderRadius: 4, backgroundColor: '#1E293B', borderWidth: 2, borderColor: '#FACC15' },
  barrel: { width: 24, height: BARREL - 10, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, borderWidth: 1.5, borderColor: '#0F172A' },
  band: { position: 'absolute', left: -1.5, right: -1.5, height: 6, backgroundColor: '#FACC15', borderWidth: 1, borderColor: '#92400E' },
  base: { position: 'absolute', left: -48, bottom: -46, width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: '#FACC15', alignItems: 'center' },
  hub: { marginTop: 6, width: 30, height: 30, borderRadius: 15, backgroundColor: '#0F172A', borderWidth: 2, borderColor: '#94A3B8', alignItems: 'center', justifyContent: 'center' },
  hubCore: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#22D3EE' },
  shot: { position: 'absolute', left: 0, top: 0, width: 10, height: 30, borderRadius: 5, overflow: 'hidden' },
  arm: { position: 'absolute', left: 0, top: 0, width: 0, height: 0 },
  ripple: { position: 'absolute', left: -22, top: -22, width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'rgba(224,242,254,0.9)' },
  drop: { position: 'absolute', left: -2.5, top: -8, width: 5, height: 8, borderRadius: 3, backgroundColor: 'rgba(224,242,254,0.95)' },
  catchGlow: { position: 'absolute', left: -80, top: -80, width: 160, height: 160, tintColor: '#FDE68A' },
  catchRing: { position: 'absolute', left: -36, top: -36, width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: '#FDE047' },
  ray: { position: 'absolute', left: -2, top: -9, width: 4, height: 18, borderRadius: 2, backgroundColor: '#FFFBEB' },
  amountWrap: { position: 'absolute', left: -90, top: -34, width: 180, alignItems: 'center' },
  amount: { color: '#FDE047', fontSize: 21, fontWeight: '900', fontVariant: ['tabular-nums'], textShadowColor: 'rgba(4,14,44,0.95)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 5 },
});
