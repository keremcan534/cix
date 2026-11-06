// The opening, once per cold start. It plays over the first screen while that screen draws underneath, so it
// adds no waiting. The native splash hands over on the same navy, with the same mark at the same size and place.
// Then:
//   - the heart beats twice and rises;
//   - the S and the C arrive white-hot, turn gold, then settle into the mark's two colors (turquoise and coral);
//   - the rest of "Similar Club" opens out from them;
//   - a gold hairline draws, a sweep of light passes, and the whole opening lifts away.
// A tap skips it. "Animasyonları azalt" and the phone's own reduce-motion setting turn it off.
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';

import { Text } from '@/components/text';
import { useSettings } from '@/store';
import { colors } from '@/theme';

/** The native splash image (app.json expo-splash-screen), so the hand-over has no jump. */
const MARK = require('../../../assets/splash-icon.png');
const GLOW = require('../../../assets/fx/glow.png');

/** app.json expo-splash-screen imageWidth: the mark starts exactly where the native splash leaves it. */
const SPLASH_MARK = 200;
/** The main timeline in ms; the lift-away adds EXIT. */
const TOTAL = 1980;
const EXIT = 380;
/** However the timeline behaves (a paused tab, a lost callback), the cover never stays over the app. */
const FAILSAFE = TOTAL + EXIT + 1500;
const NATIVE = Platform.OS !== 'web';

const TURQUOISE = colors.primaryText;
const CORAL = colors.pink;
const GOLD = colors.gold;
const PEARL = '#FFF8EC';

/** How far the heart rises and how small it ends. */
const RISE = 80;
const MARK_END = 0.5;

/** Once per launch: a store reset remounts the app but must not replay the opening. */
let played = false;

type Ease = (v: number) => number;
const smooth = Easing.bezier(0.65, 0, 0.35, 1);
const out = Easing.out(Easing.cubic);

/** A value along the timeline, keyed in milliseconds. */
function at(t: Animated.Value, ms: number[], output: number[], easing?: Ease) {
  return t.interpolate({ inputRange: ms.map((m) => m / TOTAL), outputRange: output, easing, extrapolate: 'clamp' });
}

export function Intro() {
  const settings = useSettings();
  const [done, setDone] = useState(played);
  // null until the phone answers; the first frame (the splash pose) is shown meanwhile.
  const [osStill, setOsStill] = useState<boolean | null>(null);
  const [t] = useState(() => new Animated.Value(0));
  const [exit] = useState(() => new Animated.Value(0));
  const leaving = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(
      (v) => setOsStill(!!v),
      () => setOsStill(false),
    );
  }, []);

  const finish = useCallback(() => {
    played = true;
    setDone(true);
  }, []);

  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    Animated.timing(exit, { toValue: 1, duration: EXIT, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }).start(finish);
  }, [exit, finish]);

  // Off for "Animasyonları azalt" and the phone's reduce-motion setting: the app simply appears.
  const off = settings.reduceMotion || osStill === true;
  useEffect(() => {
    if (off) played = true;
  }, [off]);
  useEffect(() => {
    if (done || off || osStill === null) return;
    const run = Animated.timing(t, { toValue: 1, duration: TOTAL, easing: Easing.linear, useNativeDriver: NATIVE });
    run.start(({ finished }) => finished && leave());
    const failsafe = setTimeout(finish, FAILSAFE);
    return () => {
      run.stop();
      clearTimeout(failsafe);
    };
  }, [done, off, osStill, t, leave, finish]);

  if (done || off) return null;
  return <Stage t={t} exit={exit} onSkip={leave} />;
}

function Stage({ t, exit, onSkip }: { t: Animated.Value; exit: Animated.Value; onSkip: () => void }) {
  const { width } = useWindowDimensions();
  const size = Math.min(46, Math.round(width * 0.118));

  // The S and C start side by side in the middle (a monogram) and move out to their places in the word; their
  // places are only known once the word is laid out.
  type Box = { x: number; w: number };
  const [box, setBox] = useState<{ row?: Box; s?: Box; c?: Box }>({});
  const measure = (key: 'row' | 's' | 'c') => (e: LayoutChangeEvent) => {
    const { x, width: w } = e.nativeEvent.layout;
    setBox((b) => ({ ...b, [key]: { x, w } }));
  };
  const spread = { s: 0, c: 0 };
  if (box.row && box.s && box.c) {
    const gap = size * 0.12;
    const start = box.row.w / 2 - (box.s.w + gap + box.c.w) / 2;
    spread.s = start - box.s.x;
    spread.c = start + box.s.w + gap - box.c.x;
  }

  // The heart: two beats, then up and smaller.
  const beat = at(t, [0, 130, 240, 350, 450], [1, 1.07, 0.98, 1.035, 1], Easing.inOut(Easing.sin));
  const shrink = at(t, [400, 780], [1, MARK_END], smooth);
  const markScale = Animated.multiply(beat, shrink);
  const markY = at(t, [400, 780], [0, -RISE], smooth);

  // The capitals, once the heart has made room: in white-hot, then gold, then the mark's own colors. Each
  // color's glow comes and goes with it, so the letters end crisp with a soft light of their own color.
  const capIn = at(t, [740, 1000], [0, 1], out);
  const capScale = at(t, [740, 1000], [1.6, 1], out);
  const gold = at(t, [900, 1080], [0, 1]);
  const brand = at(t, [1280, 1540], [0, 1], smooth);
  const halos = {
    pearl: at(t, [740, 900, 1080], [0, 0.5, 0]),
    gold: at(t, [900, 1080, 1280, 1540], [0, 0.5, 0.5, 0]),
    brand: at(t, [1280, 1540, TOTAL], [0, 0.42, 0.3]),
  };

  // Exit: the whole stage lifts a little, grows a touch and fades with the navy.
  const fade = exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const lift = exit.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });
  const grow = exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  const wordY = size * 0.75;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.root, { opacity: fade }]}>
      {/* Ambient light: turquoise from the top left, coral from the bottom right. */}
      <Animated.Image
        source={GLOW}
        style={[s.ambient, { width: width * 1.7, height: width * 1.7, left: -width * 0.75, top: '6%', tintColor: TURQUOISE, opacity: at(t, [150, 900], [0, 0.2]), transform: [{ translateY: at(t, [0, TOTAL], [0, -40]) }] }]}
      />
      <Animated.Image
        source={GLOW}
        style={[s.ambient, { width: width * 1.7, height: width * 1.7, right: -width * 0.8, bottom: '2%', tintColor: CORAL, opacity: at(t, [300, 1000], [0, 0.16]), transform: [{ translateY: at(t, [0, TOTAL], [0, 30]) }] }]}
      />

      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: lift }, { scale: grow }] }]} pointerEvents="none">
        {/* Rings sent out by the two beats. */}
        <Layer>
          <Ring t={t} from={60} color={TURQUOISE} />
        </Layer>
        <Layer>
          <Ring t={t} from={330} color={CORAL} />
        </Layer>

        <Layer>
          <Animated.Image source={MARK} resizeMode="contain" style={{ width: SPLASH_MARK, height: SPLASH_MARK, transform: [{ translateY: markY }, { scale: markScale }] }} />
        </Layer>

        <Layer>
          <View style={[s.row, { transform: [{ translateY: wordY }] }]} onLayout={measure('row')}>
            <Capital ch="S" color={TURQUOISE} size={size} t={t} appear={capIn} scale={capScale} gold={gold} brand={brand} halos={halos} shift={spread.s} onLayout={measure('s')} />
            {'imilar'.split('').map((ch, i, all) => (
              // Left behind as the S travels out: from the middle outwards.
              <Letter key={i} ch={ch} size={size} t={t} from={1150 + (all.length - 1 - i) * 45} />
            ))}
            <View style={{ width: size * 0.24 }} />
            <Capital ch="C" color={CORAL} size={size} t={t} appear={capIn} scale={capScale} gold={gold} brand={brand} halos={halos} shift={spread.c} onLayout={measure('c')} />
            {'lub'.split('').map((ch, i) => (
              <Letter key={i} ch={ch} size={size} t={t} from={1180 + i * 55} />
            ))}
          </View>
        </Layer>

        {/* The gold hairline under the word, drawn from the middle out. */}
        <Layer>
          <Animated.View style={{ width: size * 4.2, height: 1.5, opacity: at(t, [1380, 1530], [0, 1]), transform: [{ translateY: wordY + size * 0.95 }, { scaleX: at(t, [1380, 1720], [0, 1], out) }] }}>
            <LinearGradient colors={['rgba(246,189,96,0)', GOLD, 'rgba(246,189,96,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </Layer>

        {/* A sweep of light across the word: a soft streak with no edges, so it reads as light, not as a pane. */}
        <Layer>
          <Animated.Image
            source={GLOW}
            style={{
              width: size * 1.1,
              height: size * 3.2,
              tintColor: PEARL,
              opacity: at(t, [1500, 1600, 1820, 1920], [0, 0.45, 0.45, 0]),
              transform: [{ translateY: wordY }, { translateX: at(t, [1500, 1920], [-size * 3.4, size * 3.4], smooth) }, { rotate: '18deg' }],
            }}
          />
        </Layer>

        {SPARKS.map((p, i) => (
          <Layer key={i}>
            <Spark t={t} from={1300 + i * 50} x={p[0] * size * 3.4} y={wordY + p[1] * size} size={p[2]} color={i % 3 === 1 ? PEARL : GOLD} />
          </Layer>
        ))}
      </Animated.View>

      <Pressable style={StyleSheet.absoluteFill} onPress={onSkip} accessibilityRole="button" accessibilityLabel="Similar Club" accessibilityHint="Açılışı geçmek için dokun" />
    </Animated.View>
  );
}

/** One full-screen layer that centers its child; children are placed from the center with transforms. */
function Layer({ children }: { children: ReactNode }) {
  return (
    <View style={s.layer} pointerEvents="none">
      {children}
    </View>
  );
}

function Ring({ t, from, color }: { t: Animated.Value; from: number; color: string }) {
  return (
    <Animated.View
      style={[
        s.ring,
        {
          borderColor: color,
          opacity: at(t, [from, from + 120, from + 640], [0, 0.55, 0]),
          transform: [{ scale: at(t, [from, from + 640], [0.75, 1.9], out) }],
        },
      ]}
    />
  );
}

/**
 * The S or the C: three copies of the letter on top of each other (white-hot, gold, its own color). Each one
 * fades in over the one below, so the color changes without the letter ever dimming, and the change runs on the
 * native animation thread. A soft glow behind it changes with it.
 */
function Capital({
  ch,
  color,
  size,
  appear,
  scale,
  gold,
  brand,
  halos,
  shift,
  onLayout,
  t,
}: {
  ch: string;
  color: string;
  size: number;
  appear: Animated.AnimatedInterpolation<number>;
  scale: Animated.AnimatedInterpolation<number>;
  gold: Animated.AnimatedInterpolation<number>;
  brand: Animated.AnimatedInterpolation<number>;
  halos: Record<'pearl' | 'gold' | 'brand', Animated.AnimatedInterpolation<number>>;
  shift: number;
  onLayout: (e: LayoutChangeEvent) => void;
  t: Animated.Value;
}) {
  const type = { fontSize: size, lineHeight: Math.round(size * 1.25), fontWeight: '800' as const, letterSpacing: -0.5 };
  const halo = size * 2.1;
  const translateX = at(t, [1040, 1380], [shift, 0], out);
  const glow = (tint: string, opacity: Animated.AnimatedInterpolation<number>) => (
    <Animated.Image source={GLOW} style={[s.halo, { width: halo, height: halo, left: -halo / 2, top: -halo / 2, tintColor: tint, opacity }]} />
  );
  return (
    <View onLayout={onLayout}>
      <Animated.View style={{ opacity: appear, transform: [{ translateX }, { scale }] }}>
        <View style={s.haloAnchor} pointerEvents="none">
          {glow(PEARL, halos.pearl)}
          {glow(GOLD, halos.gold)}
          {glow(color, halos.brand)}
        </View>
        <Text style={[type, { color: PEARL }]}>{ch}</Text>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: gold }]}>
          <Text style={[type, { color: GOLD }]}>{ch}</Text>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: brand }]}>
          <Text style={[type, { color }]}>{ch}</Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function Letter({ ch, size, t, from }: { ch: string; size: number; t: Animated.Value; from: number }) {
  const type = { fontSize: size, lineHeight: Math.round(size * 1.25), fontWeight: '800' as const, letterSpacing: -0.5, color: '#FFFFFF' };
  return (
    <Animated.View style={{ opacity: at(t, [from, from + 260], [0, 1], out), transform: [{ translateY: at(t, [from, from + 260], [size * 0.22, 0], out) }] }}>
      <Text style={type}>{ch}</Text>
    </Animated.View>
  );
}

/** Small points of light around the word: [x in word half-widths, y in letter heights, size in px]. */
const SPARKS: [number, number, number][] = [
  [-0.95, -0.95, 16],
  [0.82, -1.15, 12],
  [1.02, 0.75, 14],
  [-0.62, 1.05, 10],
  [0.12, -1.45, 9],
  [-1.12, 0.25, 8],
  [0.45, 1.25, 11],
];

function Spark({ t, from, x, y, size, color }: { t: Animated.Value; from: number; x: number; y: number; size: number; color: string }) {
  const life = [from, from + 160, from + 380];
  return (
    <Animated.Image
      source={GLOW}
      style={{
        width: size,
        height: size,
        tintColor: color,
        opacity: at(t, life, [0, 1, 0]),
        transform: [{ translateX: x }, { translateY: at(t, [from, from + 380], [y, y - 10]) }, { scale: at(t, life, [0.4, 1.1, 0.5]) }],
      }}
    />
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: colors.bg, zIndex: 1000, elevation: 1000 },
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  ambient: { position: 'absolute' },
  ring: { width: SPLASH_MARK * 0.9, height: SPLASH_MARK * 0.9, borderRadius: SPLASH_MARK * 0.45, borderWidth: 1.5 },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  // The glows are centered on the letter whatever its width.
  haloAnchor: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, overflow: 'visible' },
  halo: { position: 'absolute' },
});
