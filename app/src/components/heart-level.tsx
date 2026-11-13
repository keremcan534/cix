// The heart level between two people, drawn in its look (lib/heart-tiers): a heart on its own, a badge with the
// level, the heartbeat line between two photos, the beating heart on a profile photo and the card on someone's
// profile. Everything one heart draws moves on one looping value (RN Animated, the native driver on phones), so the
// pulses on the line reach the heart just as it beats. It stands still, in the same look, with "Animasyonları
// azalt" or "Efektleri kapat", while its screen is not on top and while the app is in the background.
import Ionicons from '@expo/vector-icons/Ionicons';
import { NavigationContext } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { Animated, AppState, Easing, Image, Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { Avatar } from '@/components/ui';
import {
  glowCurve,
  heartMoves,
  heartShare,
  heartTier,
  heartTitle,
  nextLookText,
  particleCurves,
  particleWindows,
  pulseCurves,
  rippleCurves,
  scaleCurve,
  type Curve,
  type HeartTier,
  type HeartView,
} from '@/lib/heart-tiers';
import { useSettings } from '@/store';
import { makeStyles } from '@/theme';

const GLOW = require('../../assets/fx/glow.png');
/**
 * Each look's heart picture (docs/GORSEL_URETIM_LISTESI.md § 23, app/assets/hearts, 192 px). A look without one yet
 * keeps the drawn heart (Ionicons in its tint); the light, the motion, the rising hearts and the gold ring stay code
 * (the top look's picture has its own gold edge, so the drawn gold heart behind it goes).
 */
const HEART_ART: Partial<Record<HeartTier['id'], number>> = {
  soft: require('../../assets/hearts/kalp-seviye-kivilcim.png'),
  glow: require('../../assets/hearts/kalp-seviye-isilti.png'),
  pulse: require('../../assets/hearts/kalp-seviye-nabiz.png'),
  beat: require('../../assets/hearts/kalp-seviye-tutku.png'),
  crown: require('../../assets/hearts/kalp-seviye-sonsuz.png'),
};
/** The heartbeat that travels the line (§ 23 #6): a small heart with its light trailing behind, facing right. */
const BEAT_ART = require('../../assets/hearts/kalp-atis.png');
const BEAT_RATIO = 192 / 111;
/** The line between the two photos (§ 23 #7), stretched to the line's length; its band sits this far down the picture. */
const LINE_ART = require('../../assets/hearts/kalp-cizgisi.png');
const LINE_MID = 0.73;
const NATIVE = Platform.OS !== 'web';
const fmt = (n: number) => n.toLocaleString('tr-TR');

/** One of the two people on the line. */
export type HeartFace = { uri?: string; name?: string };

// --- The loop ------------------------------------------------------------------------------------------------

const onAppState = (l: () => void) => {
  const sub = AppState.addEventListener('change', l);
  return () => sub.remove();
};
const appActive = () => AppState.currentState !== 'background';

/**
 * Whether the screen this is on is the one on top and the app is in front. Where no screen is around it (the room,
 * which lives above the navigation), only the app counts.
 */
function useOnScreen() {
  const nav = useContext(NavigationContext);
  const onFocus = useCallback(
    (l: () => void) => {
      if (!nav) return () => {};
      const offFocus = nav.addListener('focus', l);
      const offBlur = nav.addListener('blur', l);
      return () => {
        offFocus();
        offBlur();
      };
    },
    [nav],
  );
  const focused = useSyncExternalStore(onFocus, () => nav?.isFocused() ?? true, () => true);
  const active = useSyncExternalStore(onAppState, appActive, () => true);
  return focused && active;
}

/** The loop everything a heart draws moves on (0 to 1, over and over); null while the heart stands still. */
function useHeartLoop(tier: HeartTier, still = false): Animated.Value | null {
  const settings = useSettings();
  const onScreen = useOnScreen();
  const moving = !still && onScreen && heartMoves(tier, settings);
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!moving) return;
    t.setValue(0);
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: tier.periodMs, easing: Easing.linear, useNativeDriver: NATIVE }));
    loop.start();
    return () => loop.stop();
  }, [moving, t, tier.periodMs]);
  return moving ? t : null;
}

/** A curve on the loop; its value at rest (the loop's start) while the heart stands still. */
const on = (t: Animated.Value | null, c: Curve) => (t ? t.interpolate(c) : c.outputRange[0]);
/** The heart's size curve, softened by `k` (a badge with text grows less than a bare heart). */
const softened = (c: Curve, k: number): Curve => ({ inputRange: c.inputRange, outputRange: c.outputRange.map((v) => 1 + (v - 1) * k) });

// --- The pieces around a heart -------------------------------------------------------------------------------

/** The light around a `size` box, centered on it (place it first in that box). */
function Glow({ tier, size, t, strength = 1 }: { tier: HeartTier; size: number; t: Animated.Value | null; strength?: number }) {
  if (!tier.glow) return null;
  const g = size * 2.2;
  const c = glowCurve(tier.motion);
  const opacity = on(t, { inputRange: c.inputRange, outputRange: c.outputRange.map((v) => v * strength) });
  return <Animated.Image source={GLOW} style={{ position: 'absolute', width: g, height: g, left: (size - g) / 2, top: (size - g) / 2, tintColor: tier.glow, opacity, pointerEvents: 'none' }} />;
}

/** The top look: a gold ring leaves the heart at each beat. */
function Ripple({ tier, size, t }: { tier: HeartTier; size: number; t: Animated.Value | null }) {
  if (!tier.rim || !t) return null;
  const r = rippleCurves();
  return (
    <Animated.View
      style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: tier.rim, opacity: t.interpolate(r.opacity), transform: [{ scale: t.interpolate(r.scale) }], pointerEvents: 'none' }}
    />
  );
}

/** Small hearts rising from a `size` box (the beat and the top looks), only while it moves. */
function Particles({ tier, size, t }: { tier: HeartTier; size: number; t: Animated.Value | null }) {
  if (!t || tier.particles === 0) return null;
  const p = Math.max(7, Math.round(size * 0.42));
  const rise = size * 1.15;
  return (
    <>
      {particleWindows(tier.particles).map((w, i) => {
        const c = particleCurves(w);
        const translateY = t.interpolate({ inputRange: c.rise.inputRange, outputRange: c.rise.outputRange.map((v) => -v * rise) });
        const translateX = t.interpolate({ inputRange: c.rise.inputRange, outputRange: c.rise.outputRange.map((v) => v * w.dx * size * 0.45) });
        return (
          <Animated.View key={i} style={{ position: 'absolute', left: (size - p) / 2, top: (size - p) / 2 - size * 0.2, opacity: t.interpolate(c.opacity), transform: [{ translateX }, { translateY }], pointerEvents: 'none' }}>
            <Ionicons name="heart" size={p} color={tier.rim && i % 2 === 1 ? tier.rim : tier.tint} />
          </Animated.View>
        );
      })}
    </>
  );
}

// --- A heart on its own --------------------------------------------------------------------------------------

/**
 * A heart in its level's look: its color, a light around it, and what it does (breathes, swells, beats, small
 * hearts rising; a gold edge and ring at the top). `t`: a loop to move on (the line's), else it runs its own.
 */
export function HeartGlyph({ level, size = 22, t: outer, still }: { level: number; size?: number; t?: Animated.Value | null; still?: boolean }) {
  const tier = heartTier(level);
  const own = useHeartLoop(tier, still || outer !== undefined);
  const t = outer !== undefined ? outer : own;
  const scale = on(t, scaleCurve(tier.motion));
  const rim = Math.round(size * 1.2);
  const art = HEART_ART[tier.id];
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Glow tier={tier} size={size} t={t} />
      <Ripple tier={tier} size={size} t={t} />
      <Particles tier={tier} size={size} t={t} />
      <Animated.View style={{ width: size, height: size, transform: [{ scale }] }}>
        {tier.rim && !art && <Ionicons name="heart" size={rim} color={tier.rim} style={{ position: 'absolute', left: (size - rim) / 2, top: (size - rim) / 2 }} />}
        {art ? (
          <Image source={art} style={{ width: size, height: size }} resizeMode="contain" />
        ) : (
          <Ionicons name={tier.id === 'none' ? 'heart-outline' : 'heart'} size={size} color={tier.tint} />
        )}
      </Animated.View>
    </View>
  );
}

// --- The badge -----------------------------------------------------------------------------------------------

const BADGE = {
  xs: { h: 16, icon: 9, font: 10, pad: 5, gap: 2 },
  sm: { h: 20, icon: 11, font: 11, pad: 7, gap: 3 },
  md: { h: 26, icon: 14, font: 13, pad: 9, gap: 4 },
} as const;

/** "♥ Lv.7" in its level's look. `still` for lists (one row after another needs no motion). */
export function HeartBadge({ level, size = 'sm', t: outer, still, style }: { level: number; size?: keyof typeof BADGE; t?: Animated.Value | null; still?: boolean; style?: StyleProp<ViewStyle> }) {
  const s = useStyles();
  const tier = heartTier(level);
  const own = useHeartLoop(tier, still || outer !== undefined);
  const t = outer !== undefined ? outer : own;
  const b = BADGE[size];
  const scale = on(t, softened(scaleCurve(tier.motion), 0.5));
  return (
    <View style={[{ alignSelf: 'flex-start' }, style]} accessible accessibilityLabel={`Kalp seviyesi ${level}`}>
      {/* The light and the rising hearts sit around the heart at the badge's start. */}
      <View style={{ position: 'absolute', left: b.pad - (b.h - b.icon) / 2, top: 0, width: b.h, height: b.h }}>
        <Glow tier={tier} size={b.h} t={t} strength={0.85} />
        <Particles tier={tier} size={b.h} t={t} />
      </View>
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient
          colors={tier.fill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[s.badge, { height: b.h, borderRadius: b.h / 2, paddingHorizontal: b.pad, gap: b.gap }, tier.rim && { borderWidth: 1.5, borderColor: tier.rim, paddingHorizontal: b.pad - 1.5 }]}
        >
          <Ionicons name={tier.id === 'none' ? 'heart-outline' : 'heart'} size={b.icon} color="#fff" />
          <Text style={[s.badgeText, { fontSize: b.font, lineHeight: b.h - 2 }]}>Lv.{level}</Text>
        </LinearGradient>
        {tier.rim && <Ionicons name="sparkles" size={b.icon} color={tier.rim} style={{ position: 'absolute', right: -b.icon / 2, top: -b.icon / 2 }} />}
      </Animated.View>
    </View>
  );
}

// --- The heartbeat line between two photos ---------------------------------------------------------------------

// `beat`: the travelling heartbeat's height; `line`: the line picture's height (its band is about a fifth of it, as
// thick as `thick`, the drawn line Lv.0 keeps).
const LINK = {
  sm: { face: 24, thick: 2, beat: 10, line: 10, gap: -2, heart: 18 },
  lg: { face: 46, thick: 3, beat: 14, line: 15, gap: -4, heart: 0 },
} as const;

/**
 * My photo and theirs with a line between them and our heart in the middle. From the pulse look on, heartbeats
 * travel the line (from me, or from both of us to meet at the heart, which beats as they arrive). `sm` for the
 * chat's heart bar (a bare heart in the middle), `lg` for the profile (the level badge in the middle).
 */
export function HeartLink({ level, me, them, size = 'lg', still }: { level: number; me: HeartFace; them: HeartFace; size?: keyof typeof LINK; still?: boolean }) {
  const tier = heartTier(level);
  const t = useHeartLoop(tier, still);
  const l = LINK[size];
  const [w, setW] = useState(0);
  const beatW = Math.round(l.beat * BEAT_RATIO);
  const travel = Math.max(0, w - beatW);
  const pulse = (from: 'me' | 'them', at: number) => {
    const c = pulseCurves(tier.line, from);
    if (!c) return null;
    // Standing still: the heartbeats stay drawn on the line, a quarter of the way from each photo.
    const x = t ? t.interpolate({ inputRange: c.at.inputRange, outputRange: c.at.outputRange.map((v) => v * travel) }) : at * travel;
    const opacity = t ? t.interpolate(c.opacity) : 0.85;
    return (
      <Animated.View key={from} style={{ position: 'absolute', left: 0, top: (l.face - l.beat) / 2, opacity, transform: [{ translateX: x }], pointerEvents: 'none' }}>
        {/* From their photo it runs the other way: the picture turned round, its light trailing behind it. */}
        <Image source={BEAT_ART} style={{ width: beatW, height: l.beat, transform: from === 'them' ? [{ scaleX: -1 }] : undefined }} resizeMode="contain" />
      </Animated.View>
    );
  };
  const lineOpacity = tier.line === 'still' ? 0.6 : 0.9;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Avatar uri={me.uri} name={me.name} size={l.face} />
      <View style={{ flex: 1, minWidth: l.face, height: l.face, marginHorizontal: l.gap, alignItems: 'center', justifyContent: 'center' }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {tier.line === 'none' ? (
          <LinearGradient colors={[`${tier.tint}66`, tier.tint, `${tier.tint}66`]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ position: 'absolute', left: 0, right: 0, top: (l.face - l.thick) / 2, height: l.thick, borderRadius: l.thick, opacity: lineOpacity }} />
        ) : (
          <Image source={LINE_ART} resizeMode="stretch" style={{ position: 'absolute', left: 0, right: 0, top: l.face / 2 - l.line * LINE_MID, height: l.line, opacity: lineOpacity }} />
        )}
        {w > 0 && (tier.line === 'one' || tier.line === 'both') && (
          <>
            {pulse('me', 0.25)}
            {tier.line === 'both' && pulse('them', 0.75)}
          </>
        )}
        {l.heart ? <HeartGlyph level={level} size={l.heart} t={t} /> : <HeartBadge level={level} size="md" t={t} style={{ alignSelf: 'center' }} />}
      </View>
      <Avatar uri={them.uri} name={them.name} size={l.face} />
    </View>
  );
}

// --- On a profile ---------------------------------------------------------------------------------------------

/** The beat and the top looks: a small heart beating on their profile photo (put it in the photo's box). */
export function HeartPin({ level, style }: { level: number; style?: StyleProp<ViewStyle> }) {
  const s = useStyles();
  if (!heartTier(level).pin) return null;
  return (
    <View style={[s.pin, style]} accessible accessibilityLabel={`Aranızdaki kalp seviyesi ${level}`}>
      <HeartGlyph level={level} size={18} />
    </View>
  );
}

/** Their profile: the heart between us, with the two photos, its level and look, and what the next look brings. */
export function HeartCard({ heart, me, them }: { heart: HeartView; me: HeartFace; them: HeartFace }) {
  const s = useStyles();
  const tier = heartTier(heart.level);
  const next = nextLookText(heart.level);
  return (
    <View style={[s.card, { borderColor: `${tier.rim ?? tier.tint}55` }]} accessible accessibilityLabel={`Aranızdaki kalp: ${heartTitle(heart.level)}. ${next ?? 'En yüksek görünüm.'}`}>
      <Text style={s.cardHead}>Aranızdaki kalp</Text>
      <HeartLink level={heart.level} me={me} them={them} />
      <View style={s.cardRow}>
        <Text style={s.cardTitle}>{heartTitle(heart.level)}</Text>
        <Text style={s.cardPoints}>{heart.next === null ? `${fmt(heart.points)} · en yüksek seviye` : `${fmt(heart.points)} / ${fmt(heart.next)}`}</Text>
      </View>
      <View style={s.track}>
        <View style={[s.fill, { width: `${Math.round(heartShare(heart) * 100)}%`, backgroundColor: tier.tint }]} />
      </View>
      <Text style={s.hint} numberOfLines={2}>
        {next ?? 'Kalbiniz en parlak hâlinde'}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors, dark, lift }) => ({
  badge: { flexDirection: 'row', alignItems: 'center' },
  badgeText: { color: '#fff', fontWeight: '800' },
  pin: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 8, marginTop: 12, ...lift },
  cardHead: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  cardRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  cardTitle: { color: colors.pink, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  cardPoints: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  track: { height: 5, borderRadius: 3, backgroundColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)', overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3 },
  hint: { color: colors.textDim, fontSize: 12 },
}));
