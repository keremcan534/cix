// What Yörünge's stage is made of: deep space with stars at three depths, the planet and its ramp, the escape orbit
// with the route up to it, the rocket, the trail it leaves, and the two ways a flight ends (it blows up, or it shoots
// off along the orbit). Everything that moves hangs on a flight's two Animated values (native driver): `u`, the
// rocket's way along the path, and `fx`, the ending. The numbers come from rocket-flight; nothing here knows a round.
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useMemo } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';

import { artSource } from '@/components/Art';
import { climbSeconds, driftRanges, orbitY, pathAt, pathSamples, routeMarks, scatter, type FlightPlan, type Geo } from '@/components/games/rocket-flight';
import { Text } from '@/components/text';

const GLOW = require('../../../assets/fx/glow.png');
const ROCKET = artSource('oyun-roket');

/** The rocket's box on the stage (px); the picture points straight up and is turned along the path. */
export const ROCKET_SIZE = 58;
export const ORBIT = '#67E8F9';

export type Flight = {
  id: number;
  plan: FlightPlan;
  /** 0 → plan.uStop over plan.ms, linear: the rocket's way along the path (the multiplier grows with it). */
  u: Animated.Value;
  /** 0 → 1 once the rocket has stopped: the explosion, or the escape. */
  fx: Animated.Value;
  /** The trail's light: 1 in flight, dimmed once the round is over, out when the next rocket fires. */
  glow: Animated.Value;
  end: 'boom' | 'escape';
  /** Where each star layer stood when this flight took off (px into its tile). */
  from: number[];
};

const clamp = { extrapolate: 'clamp' as const };

// --- Space ----------------------------------------------------------------------------------------------------

/** Star layers, far to near: their share of the drift, how many stars a tile holds, their size and light. */
export const STAR_LAYERS = [
  { speed: 0.2, count: 22, min: 1.2, max: 2, alpha: 0.5 },
  { speed: 0.48, count: 16, min: 1.8, max: 2.6, alpha: 0.72 },
  { speed: 1, count: 11, min: 2.4, max: 3.4, alpha: 0.95 },
] as const;
/** The stars drift down and this much to the left per px, against the rocket's heading. */
const SLANT = 0.3;
const SLANT_DEG = (Math.atan(SLANT) * 180) / Math.PI;

/**
 * The sky. In a flight each layer drifts against the rocket, slowly at first and streaking by the end (the nearest
 * layer also draws speed lines); between flights it stands where the last one left it.
 */
export const Space = memo(function Space({ geo, flight, still, breathe }: { geo: Geo; flight: Flight | null; still: boolean; breathe: Animated.Value }) {
  const period = geo.h;
  const fields = useMemo(
    () =>
      STAR_LAYERS.map((l, li) => {
        const rnd = scatter(71 + li * 977);
        const stars = Array.from({ length: l.count }, () => ({ x: -SLANT * period + rnd() * (geo.w + 2 * SLANT * period), y: rnd() * period, size: l.min + rnd() * (l.max - l.min), alpha: l.alpha * (0.55 + rnd() * 0.45) }));
        const lines = li === 2 ? Array.from({ length: 9 }, () => ({ x: -SLANT * period + rnd() * (geo.w + 2 * SLANT * period), y: rnd() * period, len: 22 + rnd() * 26 })) : [];
        return { stars, lines };
      }),
    [geo.w, period],
  );
  const drift = useMemo(
    () =>
      STAR_LAYERS.map((l, li) => {
        if (!flight || still) return null;
        const r = driftRanges(climbSeconds(flight.plan.target), l.speed, period, flight.from[li] ?? 0);
        return {
          x: flight.u.interpolate({ inputRange: r.input, outputRange: r.output.map((s) => -s * SLANT * period), ...clamp }),
          y: flight.u.interpolate({ inputRange: r.input, outputRange: r.output.map((s) => s * period), ...clamp }),
        };
      }),
    [flight, still, period],
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={['#04051A', '#0D0F3A', '#1D1554', '#2A1B5E']} locations={[0, 0.45, 0.85, 1]} style={StyleSheet.absoluteFill} />
      <Image source={GLOW} style={[st.nebula, { width: geo.w * 1.2, height: geo.w * 1.2, right: -geo.w * 0.45, top: -geo.w * 0.5, tintColor: '#7C3AED', opacity: 0.42 }]} />
      <Image source={GLOW} style={[st.nebula, { width: geo.w * 0.9, height: geo.w * 0.9, left: -geo.w * 0.4, top: geo.h * 0.1, tintColor: '#2563EB', opacity: 0.3 }]} />
      {/* A far moon, so the sky has a place in it. */}
      <View style={[st.moon, { left: geo.w * 0.8, top: geo.h * 0.66 }]}>
        <LinearGradient colors={['#E0E7FF', '#A5B4FC', '#4F46E5']} start={{ x: 0.2, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={[st.crater, { left: 7, top: 8, width: 8, height: 8 }]} />
        <View style={[st.crater, { left: 17, top: 17, width: 5, height: 5 }]} />
      </View>
      {fields.map((f, li) => {
        const d = drift[li];
        return (
          <Animated.View key={li} style={[StyleSheet.absoluteFill, d && { transform: [{ translateX: d.x }, { translateY: d.y }] }]}>
            {[-1, 0].map((j) =>
              f.stars.map((s, i) => {
                const style = { left: s.x - j * SLANT * period, top: s.y + j * period, width: s.size, height: s.size, borderRadius: s.size, opacity: s.alpha };
                // A few of the far stars twinkle.
                return li === 0 && i < 6 && !still ? (
                  <Animated.View key={`${j}-${i}`} style={[st.star, style, { opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: i % 2 ? [s.alpha, 0.12] : [0.12, s.alpha] }) }]} />
                ) : (
                  <View key={`${j}-${i}`} style={[st.star, style]} />
                );
              }),
            )}
            {flight && !still && f.lines.length > 0 && (
              // Speed lines: they come up as the climb gains speed and go out with the flight.
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: flight.u.interpolate({ inputRange: [0.2, 1], outputRange: [0, 0.8], ...clamp }) }]}>
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: flight.fx.interpolate({ inputRange: [0, 0.25], outputRange: [1, 0], ...clamp }) }]}>
                  {[-1, 0].map((j) => f.lines.map((s, i) => <View key={`${j}-${i}`} style={[st.line, { left: s.x - j * SLANT * period, top: s.y + j * period, height: s.len, transform: [{ rotate: `${SLANT_DEG}deg` }] }]} />))}
                </Animated.View>
              </Animated.View>
            )}
          </Animated.View>
        );
      })}
    </View>
  );
});

// --- The planet, the ramp and the way up ----------------------------------------------------------------------------

/** The planet's lit edge at the bottom of the stage and the ramp the rocket lies on. */
export const Planet = memo(function Planet({ geo }: { geo: Geo }) {
  const a = pathAt(geo, 0);
  const rad = (a.deg * Math.PI) / 180;
  // Along the rocket and across it (to its underside).
  const along = { x: Math.sin(rad), y: -Math.cos(rad) };
  const under = { x: Math.cos(rad), y: Math.sin(rad) };
  const rail = { x: geo.ax + under.x * 21, y: geo.ay + under.y * 21 };
  const legs = [-22, 20].map((d) => ({ x: rail.x + along.x * d, y: rail.y + along.y * d }));
  const r = geo.planet;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {legs.map((p, i) => (
        <View key={i} style={[st.leg, { left: p.x - 2.5, top: p.y, height: 60 }]} />
      ))}
      <View style={[st.air, { left: geo.cx - r - 9, top: geo.cy - r - 9, width: (r + 9) * 2, height: (r + 9) * 2, borderRadius: r + 9 }]} />
      <View style={[st.planet, { left: geo.cx - r, top: geo.cy - r, width: r * 2, height: r * 2, borderRadius: r }]}>
        <LinearGradient colors={['#FDBA74', '#EA580C', '#7C2D12']} locations={[0, 0.07, 0.2]} style={StyleSheet.absoluteFill} />
      </View>
      <LinearGradient
        colors={['#E2E8F0', '#64748B']}
        style={[st.rail, { left: rail.x - 40, top: rail.y - 3.5, transform: [{ rotate: `${a.deg - 90}deg` }] }]}
      />
    </View>
  );
});

/**
 * The escape orbit (the line the rocket has to reach, with the picked multiplier written on it) and the way up to
 * it: a row of dots that light toward the orbit while the game waits, and the multipliers passed on the way.
 */
export const Route = memo(function Route({ geo, target, label, march, still }: { geo: Geo; target: number; label: string; march: Animated.Value; still: boolean }) {
  const dots = useMemo(() => pathSamples(geo, 26).slice(2, -1), [geo]);
  const marks = useMemo(() => routeMarks(target).map((m) => ({ ...m, ...pathAt(geo, m.u) })), [geo, target]);
  // Four groups of dots take turns to shine, so the light walks up the path.
  const wave = useMemo(
    () => [0, 1, 2, 3].map((g) => march.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 1, 2, 3, 4].map((k) => ((k - g + 4) % 4 === 0 ? 0.85 : 0.22)) })),
    [march],
  );
  const r = geo.orbit;
  const tagX = geo.w * 0.3;
  const tagY = orbitY(geo, tagX);
  const tagDeg = (Math.atan2(tagX - geo.cx, geo.cy - tagY) * 180) / Math.PI;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[st.orbitGlow, { left: geo.cx - r, top: geo.cy - r, width: r * 2, height: r * 2, borderRadius: r }]} />
      <View style={[st.orbit, { left: geo.cx - r, top: geo.cy - r, width: r * 2, height: r * 2, borderRadius: r }]} />
      {dots.map((d, i) => (still ? <View key={i} style={[st.dot, { left: d.x - 1.5, top: d.y - 1.5, opacity: 0.4 }]} /> : <Animated.View key={i} style={[st.dot, { left: d.x - 1.5, top: d.y - 1.5, opacity: wave[i % 4] }]} />))}
      {marks.map((m) => (
        <View key={m.m} style={[st.mark, { left: m.x + 10, top: m.y + 6 }]}>
          <Text style={st.markText}>{m.m.toLocaleString('tr-TR')}×</Text>
        </View>
      ))}
      <View style={[st.tagWrap, { left: tagX - 60, top: tagY - 13, transform: [{ rotate: `${tagDeg}deg` }] }]}>
        <View style={st.tag} accessibilityLabel={`Kaçış yörüngesi ${label}`}>
          <Text style={st.tagHead}>KAÇIŞ</Text>
          <Text style={st.tagValue}>{label}</Text>
        </View>
      </View>
    </View>
  );
});

// --- The rocket -----------------------------------------------------------------------------------------------

/** The rocket picture with its flame behind it; `power` (0 … 1) is how hard the engine burns, `flick` its flicker. */
export function RocketSprite({ power, flick }: { power: Animated.AnimatedInterpolation<number> | Animated.Value | number; flick: Animated.Value }) {
  return (
    <View style={{ width: ROCKET_SIZE, height: ROCKET_SIZE }}>
      <Animated.Image source={GLOW} style={[st.burn, { opacity: power, transform: [{ scale: flick.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] }) }] }]} />
      <Animated.View style={[st.flame, { opacity: power, transform: [{ scaleY: flick.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.2] }) }] }]}>
        <LinearGradient colors={['#FFFBEB', '#FDBA74', 'rgba(234,88,12,0)']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Image source={ROCKET} style={{ width: ROCKET_SIZE, height: ROCKET_SIZE }} accessibilityIgnoresInvertColors />
    </View>
  );
}

/** The rocket on the ramp before it fires: it slides in when a new one is rolled out and shakes while the engine lights. */
export function ReadyRocket({ geo, arm, ignite, flick }: { geo: Geo; arm: Animated.Value; ignite: Animated.Value; flick: Animated.Value }) {
  const a = pathAt(geo, 0);
  const half = ROCKET_SIZE / 2;
  return (
    <View style={[st.rocketBox, { transform: [{ translateX: a.x - half }, { translateY: a.y - half }, { rotate: `${a.deg}deg` }] }]} pointerEvents="none">
      {/* The smoke the engine blows back along the ramp as it lights. */}
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[
            st.puff,
            {
              opacity: ignite.interpolate({ inputRange: [0, 0.15 + i * 0.12, 1], outputRange: [0, 0.55, 0] }),
              transform: [{ translateY: ignite.interpolate({ inputRange: [0, 1], outputRange: [half + 4, half + 26 + i * 12] }) }, { translateX: (i - 1) * 7 }, { scale: ignite.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.3 + i * 0.25] }) }],
            },
          ]}
        />
      ))}
      <Animated.View
        style={{
          opacity: arm,
          transform: [{ translateY: arm.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) }, { translateX: Animated.multiply(ignite.interpolate({ inputRange: [0, 0.05, 0.95, 1], outputRange: [0, 1, 1, 0] }), flick.interpolate({ inputRange: [0, 1], outputRange: [-1.3, 1.3] })) }],
        }}
      >
        <RocketSprite power={ignite} flick={flick} />
      </Animated.View>
    </View>
  );
}

// --- A flight -------------------------------------------------------------------------------------------------

const TRAIL = 26;
/** The trail's colour from the ramp (pale gold) to the orbit (hot pink). */
const trailColor = (t: number) => {
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${mix(253, 244)},${mix(224, 114)},${mix(71, 182)})`;
};

/** One flight on the stage: the trail lighting up behind the rocket, the rocket on its path, and how it ends. */
export const FlightLayer = memo(function FlightLayer({ geo, flight, flick }: { geo: Geo; flight: Flight; flick: Animated.Value }) {
  const pts = useMemo(() => pathSamples(geo, TRAIL), [geo]);
  const marks = useMemo(() => routeMarks(flight.plan.target).map((m) => ({ ...m, ...pathAt(geo, m.u) })), [geo, flight.plan.target]);
  const half = ROCKET_SIZE / 2;
  const { u, fx } = flight;
  const escape = flight.end === 'escape';
  const end = pathAt(geo, flight.plan.uStop);
  const us = pts.map((p) => p.u);
  const pos = {
    x: u.interpolate({ inputRange: us, outputRange: pts.map((p) => p.x - half), ...clamp }),
    y: u.interpolate({ inputRange: us, outputRange: pts.map((p) => p.y - half), ...clamp }),
    rotate: u.interpolate({ inputRange: us, outputRange: pts.map((p) => `${p.deg}deg`), ...clamp }),
  };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: flight.glow }]}>
        {pts.slice(0, -1).map((p, i) => {
          const q = pts[i + 1];
          const len = Math.hypot(q.x - p.x, q.y - p.y) + 3;
          const thick = 3 + (i / TRAIL) * 3;
          return (
            <Animated.View
              key={i}
              style={[
                st.trail,
                { left: (p.x + q.x) / 2 - len / 2, top: (p.y + q.y) / 2 - (thick + 10) / 2, width: len, height: thick + 10, transform: [{ rotate: `${(Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI}deg` }], opacity: u.interpolate({ inputRange: [p.u, q.u], outputRange: [0, 1], ...clamp }) },
              ]}
            >
              <View style={[st.trailGlow, { backgroundColor: trailColor(i / TRAIL), borderRadius: (thick + 10) / 2 }]} />
              <View style={{ height: thick, borderRadius: thick / 2, backgroundColor: trailColor(i / TRAIL) }} />
            </Animated.View>
          );
        })}
      </Animated.View>

      {marks.map((m) => (
        <Animated.View key={m.m} style={[st.mark, st.markOn, { left: m.x + 10, top: m.y + 6, opacity: u.interpolate({ inputRange: [m.u - 0.02, m.u], outputRange: [0, 1], ...clamp }) }]}>
          <Text style={[st.markText, { color: '#FDE68A' }]}>{m.m.toLocaleString('tr-TR')}×</Text>
        </Animated.View>
      ))}

      {escape ? <Escape geo={geo} fx={fx} /> : <Explosion x={end.x} y={end.y} fx={fx} />}

      <Animated.View style={[st.rocketBox, { transform: [{ translateX: pos.x }, { translateY: pos.y }, { rotate: pos.rotate }] }]}>
        <Animated.View
          style={
            escape
              ? // It made it: the engine kicks and it is gone along its heading.
                { opacity: fx.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }), transform: [{ translateY: fx.interpolate({ inputRange: [0, 0.25, 0.55, 1], outputRange: [0, -26, -130, -460] }) }, { scale: fx.interpolate({ inputRange: [0, 0.2, 1], outputRange: [1, 1.12, 0.7] }) }] }
              : { opacity: fx.interpolate({ inputRange: [0, 0.04], outputRange: [1, 0], ...clamp }) }
          }
        >
          <RocketSprite power={1} flick={flick} />
        </Animated.View>
      </Animated.View>
    </View>
  );
});

const SPARKS = Array.from({ length: 12 }, (_, i) => ({ deg: i * 30 + (i % 2 ? 11 : -7), far: 46 + ((i * 37) % 34), size: 3 + (i % 3) }));

/** The rocket blowing up: a burst of light, two rings opening, sparks thrown out and smoke left hanging. */
function Explosion({ x, y, fx }: { x: number; y: number; fx: Animated.Value }) {
  return (
    <View style={{ position: 'absolute', left: x, top: y }}>
      {[0, 1, 2].map((i) => (
        <Animated.Image
          key={`s${i}`}
          source={GLOW}
          style={[
            st.smoke,
            {
              left: -40 + (i - 1) * 20,
              top: -40 - i * 6,
              opacity: fx.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.7, 0] }),
              transform: [{ translateY: fx.interpolate({ inputRange: [0, 1], outputRange: [0, -22 - i * 9] }) }, { scale: fx.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.5 + i * 0.2] }) }],
            },
          ]}
        />
      ))}
      <Animated.Image source={GLOW} style={[st.blast, { tintColor: '#FDBA74', opacity: fx.interpolate({ inputRange: [0, 0.06, 0.45, 1], outputRange: [0, 1, 0.45, 0] }), transform: [{ scale: fx.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.2, 1.15, 1.5] }) }] }]} />
      <Animated.Image source={GLOW} style={[st.blast, { tintColor: '#FFFFFF', opacity: fx.interpolate({ inputRange: [0, 0.05, 0.3], outputRange: [0, 1, 0], ...clamp }), transform: [{ scale: fx.interpolate({ inputRange: [0, 0.3], outputRange: [0.15, 0.75], ...clamp }) }] }]} />
      <Animated.View style={[st.ring, { borderColor: '#FDE68A', opacity: fx.interpolate({ inputRange: [0, 0.08, 0.7], outputRange: [0, 0.95, 0], ...clamp }), transform: [{ scale: fx.interpolate({ inputRange: [0, 0.7], outputRange: [0.15, 1.5], ...clamp }) }] }]} />
      <Animated.View style={[st.ring, { borderColor: '#FB7185', borderWidth: 2, opacity: fx.interpolate({ inputRange: [0.1, 0.2, 1], outputRange: [0, 0.8, 0], ...clamp }), transform: [{ scale: fx.interpolate({ inputRange: [0.1, 1], outputRange: [0.2, 2.2], ...clamp }) }] }]} />
      {SPARKS.map((s, i) => (
        <View key={i} style={[st.sparkArm, { transform: [{ rotate: `${s.deg}deg` }] }]}>
          <Animated.View
            style={[
              st.spark,
              { left: -s.size / 2, top: -s.size * 1.5, width: s.size, height: s.size * 3, borderRadius: s.size, opacity: fx.interpolate({ inputRange: [0, 0.05, 0.6, 0.85], outputRange: [0, 1, 0.8, 0], ...clamp }), transform: [{ translateY: fx.interpolate({ inputRange: [0, 0.3, 0.85], outputRange: [0, -s.far * 0.7, -s.far], ...clamp }) }] },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

/** The rocket reaching the orbit: the line lights up, a ring opens where it crossed and a streak is left along its heading. */
function Escape({ geo, fx }: { geo: Geo; fx: Animated.Value }) {
  const b = pathAt(geo, 1);
  const r = geo.orbit;
  return (
    <>
      <Animated.View style={[st.orbit, st.orbitWon, { left: geo.cx - r, top: geo.cy - r, width: r * 2, height: r * 2, borderRadius: r, opacity: fx.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0.75] }) }]} />
      <View style={{ position: 'absolute', left: b.x, top: b.y }}>
        <Animated.Image source={GLOW} style={[st.blast, { tintColor: '#86EFAC', opacity: fx.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.9, 0] }), transform: [{ scale: fx.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1.2] }) }] }]} />
        <Animated.View style={[st.ring, { borderColor: '#BBF7D0', opacity: fx.interpolate({ inputRange: [0, 0.1, 0.8], outputRange: [0, 1, 0], ...clamp }), transform: [{ scale: fx.interpolate({ inputRange: [0, 0.8], outputRange: [0.15, 1.7], ...clamp }) }] }]} />
        <View style={[st.sparkArm, { transform: [{ rotate: `${b.deg}deg` }] }]}>
          <Animated.View style={[st.streak, { opacity: fx.interpolate({ inputRange: [0, 0.2, 0.5, 1], outputRange: [0, 0, 0.95, 0] }), transform: [{ scaleY: fx.interpolate({ inputRange: [0.2, 0.7], outputRange: [0.1, 1], ...clamp }) }] }]}>
            <LinearGradient colors={['rgba(255,255,255,0)', '#FFFFFF', '#FDE68A']} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>
      </View>
    </>
  );
}

/** With "Animasyonları azalt" nothing flies: a mark stands where the rocket blew up, or on the orbit it reached. */
export function EndMark({ geo, flight }: { geo: Geo; flight: Flight }) {
  const p = pathAt(geo, flight.plan.uStop);
  const won = flight.end === 'escape';
  return (
    <View style={[st.endMark, { left: p.x - 15, top: p.y - 15, borderColor: won ? '#86EFAC' : '#FB7185' }]} pointerEvents="none">
      <Text style={[st.endText, { color: won ? '#BBF7D0' : '#FECDD3' }]}>{won ? '✓' : '✕'}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  nebula: { position: 'absolute' },
  moon: { position: 'absolute', width: 30, height: 30, borderRadius: 15, overflow: 'hidden', opacity: 0.8 },
  crater: { position: 'absolute', borderRadius: 5, backgroundColor: 'rgba(49,46,129,0.35)' },
  star: { position: 'absolute', backgroundColor: '#fff' },
  line: { position: 'absolute', width: 1.5, borderRadius: 1, backgroundColor: 'rgba(224,231,255,0.75)' },
  leg: { position: 'absolute', width: 5, borderRadius: 2, backgroundColor: '#475569' },
  air: { position: 'absolute', backgroundColor: 'rgba(251,146,60,0.16)' },
  planet: { position: 'absolute', overflow: 'hidden', borderWidth: 2, borderColor: '#FED7AA' },
  rail: { position: 'absolute', width: 80, height: 7, borderRadius: 4 },
  orbit: { position: 'absolute', borderWidth: 1.5, borderStyle: 'dashed', borderColor: ORBIT, opacity: 0.85 },
  orbitGlow: { position: 'absolute', borderWidth: 7, borderColor: 'rgba(103,232,249,0.1)' },
  orbitWon: { borderStyle: 'solid', borderWidth: 2.5, borderColor: '#86EFAC' },
  dot: { position: 'absolute', width: 3, height: 3, borderRadius: 2, backgroundColor: '#C7D2FE' },
  mark: { position: 'absolute', borderRadius: 7, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: 'rgba(4,5,26,0.55)' },
  markOn: { backgroundColor: 'rgba(4,5,26,0.85)', borderWidth: 1, borderColor: 'rgba(253,230,138,0.6)', marginLeft: -1, marginTop: -1 },
  markText: { color: 'rgba(199,210,254,0.85)', fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tagWrap: { position: 'absolute', width: 120, height: 26, alignItems: 'center', justifyContent: 'center' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 13, height: 26, paddingHorizontal: 10, backgroundColor: '#0A0C2C', borderWidth: 1.5, borderColor: ORBIT },
  tagHead: { color: ORBIT, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  tagValue: { color: '#fff', fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  rocketBox: { position: 'absolute', left: 0, top: 0, width: ROCKET_SIZE, height: ROCKET_SIZE },
  burn: { position: 'absolute', left: ROCKET_SIZE / 2 - 30, top: ROCKET_SIZE - 26, width: 60, height: 60, tintColor: '#FB923C' },
  flame: { position: 'absolute', left: ROCKET_SIZE / 2 - 7, top: ROCKET_SIZE - 14, width: 14, height: 40, borderRadius: 7, overflow: 'hidden' },
  puff: { position: 'absolute', left: ROCKET_SIZE / 2 - 11, top: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(226,232,240,0.7)' },
  trail: { position: 'absolute', justifyContent: 'center' },
  trailGlow: { ...StyleSheet.absoluteFill, opacity: 0.2 },
  smoke: { position: 'absolute', width: 80, height: 80, tintColor: '#94A3B8' },
  blast: { position: 'absolute', left: -90, top: -90, width: 180, height: 180 },
  ring: { position: 'absolute', left: -45, top: -45, width: 90, height: 90, borderRadius: 45, borderWidth: 3 },
  sparkArm: { position: 'absolute', left: 0, top: 0, width: 0, height: 0 },
  spark: { position: 'absolute', backgroundColor: '#FDE68A' },
  streak: { position: 'absolute', left: -2.5, bottom: 0, width: 5, height: 190, borderRadius: 3, overflow: 'hidden' },
  endMark: { position: 'absolute', width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(4,5,26,0.6)' },
  endText: { fontSize: 15, fontWeight: '900' },
});
