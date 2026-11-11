// What Fener Kayalığı's stage is made of: the lighthouse tower at the head of the rows, the beam (a soft cone of
// light that rides the tower from row to row), a sea cell with its ship or kandil, and the storm's sky (the dark,
// the rain, the lightning and the title). Everything moves on Animated values with the native driver; the screen
// (fener) decides when. Nothing here knows a round.
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useMemo } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { ROWS, STORM_SPINS, cargoLabel, type FCell } from '@/lib/fener-slot';

const GLOW = require('../../../assets/fx/glow.png');
export const LIGHT = '#FFD27A';
export const SEA = '#13D9DF';
/** The tower's width and the gap between it and the rows (px). */
export const TOWER = 30;
export const TOWER_GAP = 6;
const clamp = { extrapolate: 'clamp' as const };
const fmt = (n: number) => Math.floor(n).toLocaleString('tr-TR');

/** How a ship is drawn, by its cargo (tenths of the stake): a dinghy, a boat, a freighter, and the rare gold ship. */
export const shipLook = (tenths: number) =>
  tenths >= 250 ? { emoji: '🚢', size: 34, gold: true } : tenths >= 50 ? { emoji: '🚢', size: 30, gold: false } : tenths >= 10 ? { emoji: '🚤', size: 27, gold: false } : { emoji: '⛵', size: 24, gold: false };

// --- The lighthouse and its beam ------------------------------------------------------------------------------------

/** The tower the light rides: stone with a rail down its face and a dim lens at each row. */
export const Tower = memo(function Tower({ rowH, gap }: { rowH: number; gap: number }) {
  return (
    <View style={[st.tower, { width: TOWER }]} pointerEvents="none">
      <LinearGradient colors={['#56657F', '#2A364D', '#141C2C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.towerBody} />
      <View style={st.rail} />
      {Array.from({ length: ROWS }, (_, r) => (
        <View key={r} style={[st.socket, { top: r * (rowH + gap) + rowH / 2 - 7 }]} />
      ))}
    </View>
  );
});

const FAN = [-8, -4, 0, 4, 8];

/**
 * The beam: a lens on the tower and a cone of light across the sea, made of a fan of soft strips that overlap at
 * the lens (bright) and part toward the far end (faint). `row` is the row it stands on (it glides between them),
 * `on` its strength (0 out … 1 settled), `flare` a pulse when it settles.
 */
export const Beam = memo(function Beam({ row, on, flare, width, rowH, gap }: { row: Animated.Value; on: Animated.Value; flare: Animated.Value; width: number; rowH: number; gap: number }) {
  const len = width - TOWER / 2;
  return (
    <Animated.View
      pointerEvents="none"
      style={[st.beam, { left: TOWER / 2, height: rowH, opacity: on, transform: [{ translateY: row.interpolate({ inputRange: [0, ROWS - 1], outputRange: [0, (ROWS - 1) * (rowH + gap)] }) }] }]}
    >
      {FAN.map((deg) => (
        // A box twice the beam's length centred on the lens, with the strip in its right half: turning the box fans the strip from the lens.
        <View key={deg} style={[st.fan, { left: -len, top: rowH / 2 - rowH * 0.3, width: len * 2, height: rowH * 0.6, transform: [{ rotate: `${deg}deg` }] }]}>
          <LinearGradient colors={['rgba(255,214,130,0)', 'rgba(255,214,130,0.2)', 'rgba(255,214,130,0)']} style={{ position: 'absolute', left: len, right: 0, top: 0, bottom: 0 }} />
        </View>
      ))}
      <LinearGradient colors={['rgba(255,226,160,0.6)', 'rgba(255,214,130,0.18)', 'rgba(255,214,130,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[st.core, { width: len, top: rowH * 0.22, height: rowH * 0.56 }]} />
      <Animated.Image source={GLOW} style={[st.halo, { top: rowH / 2 - 45, opacity: flare.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }), transform: [{ scale: flare.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }] }]} />
      <View style={[st.lens, { top: rowH / 2 - 11 }]}>
        <View style={st.lensCore} />
      </View>
    </Animated.View>
  );
});

// --- The sea --------------------------------------------------------------------------------------------------

/** How a column's cells come down onto the sea (`drop` 0 → 1, each column a little after the last) and sink away again (1 → 2). */
export function fallOf(drop: Animated.Value, col: number) {
  const a = col * 0.14;
  const b = a + 0.44;
  return {
    opacity: drop.interpolate({ inputRange: [a, a + 0.08, 1, 2], outputRange: [0, 1, 1, 0], ...clamp }),
    y: drop.interpolate({ inputRange: [a, b - 0.1, b, 1, 2], outputRange: [-42, 5, 0, 0, 12], ...clamp }),
  };
}
/** When column `col` has landed, as a part of the drop. */
export const landedAt = (col: number) => col * 0.14 + 0.44;

/**
 * One cell of the sea. A ship shows its cargo under it; in the settled light it shows what it brings home instead,
 * and `sail` (0 → 1) takes it along the row to the harbour at the tower. A kandil glows; the open sea is empty.
 */
export const SeaCell = memo(function SeaCell({
  cell,
  w,
  h,
  lit,
  amount,
  faint,
  fall,
  sail,
  away,
}: {
  cell: FCell;
  w: number;
  h: number;
  lit: boolean;
  /** What a lit ship pays (coins), written on it once the light has settled. */
  amount: number;
  /** A kandil that does nothing (the storm). */
  faint: boolean;
  fall: ReturnType<typeof fallOf>;
  sail: Animated.Value;
  /** How far the harbour is from this cell (px). */
  away: number;
}) {
  if (cell.kind === 'sea') return <View style={{ width: w, height: h }} />;
  if (cell.kind === 'lamp')
    return (
      <Animated.View style={[st.cell, { width: w, height: h, opacity: fall.opacity, transform: [{ translateY: fall.y }] }]} accessibilityLabel="Kandil">
        <View style={{ alignItems: 'center', opacity: faint ? 0.4 : 1 }}>
          <Image source={GLOW} style={st.lampGlow} />
          <Text style={{ fontSize: 24, lineHeight: 29 }}>🏮</Text>
          <Text style={st.lampTag}>KANDİL</Text>
        </View>
      </Animated.View>
    );
  const look = shipLook(cell.cargo);
  const rich = cell.cargo >= 50;
  return (
    <Animated.View style={[st.cell, { width: w, height: h, opacity: fall.opacity, transform: [{ translateY: fall.y }] }]} accessibilityLabel={`Gemi, yük ${cargoLabel(cell.cargo)}`}>
      <Animated.View
        style={{
          alignItems: 'center',
          opacity: sail.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
          transform: [{ translateX: sail.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0, -away] }) }, { translateY: sail.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, -5, 0] }) }, { scale: sail.interpolate({ inputRange: [0, 0.15, 1], outputRange: [1, 1.18, 0.6] }) }],
        }}
      >
        {(look.gold || lit) && <Image source={GLOW} style={[st.shipGlow, { opacity: lit ? 0.85 : 0.5 }]} />}
        <Text style={{ fontSize: look.size, lineHeight: look.size * 1.18 }}>{look.emoji}</Text>
        <View style={[st.load, rich && st.loadRich, lit && st.loadLit]}>
          <Text style={[st.loadText, rich && { color: LIGHT }, lit && { color: '#3A2400' }]} numberOfLines={1}>
            {lit && amount > 0 ? `+${fmt(amount)}` : cargoLabel(cell.cargo)}
          </Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
});

// --- The storm ------------------------------------------------------------------------------------------------

/** Ranges for something that follows f(q) with q = the loop's value shifted by `phase` (and wrapped, as a step). */
function looped(phase: number, f: (q: number) => number) {
  return { inputRange: [0, 1 - phase, 1 - phase, 1], outputRange: [f(phase), f(1), f(0), f(phase)] };
}
const DROPS = Array.from({ length: 16 }, (_, i) => ({ x: (i * 0.137 + 0.03) % 1, phase: (i * 0.61) % 1, len: 14 + (i % 4) * 5 }));
/** A bolt: a zigzag of short bars from the top of the stage. */
const BOLT = [
  { x: 0, y: 0, deg: 16, len: 46 },
  { x: -13, y: 40, deg: -24, len: 40 },
  { x: 4, y: 74, deg: 14, len: 44 },
  { x: -8, y: 112, deg: -20, len: 36 },
];

/**
 * The storm over the stage: `dark` (0 → 1) brings the night down and the rain with it, `bolt` (0 → 1 → 0) is one
 * stroke of lightning, `rain` loops. With "Animasyonları azalt" only the dark is drawn: nothing flashes.
 */
export const StormSky = memo(function StormSky({ dark, bolt, rain, height, still }: { dark: Animated.Value; bolt: Animated.Value; rain: Animated.Value; height: number; still: boolean }) {
  const drops = useMemo(() => DROPS.map((d) => ({ ...d, y: rain.interpolate(looped(d.phase, (q) => -30 + q * (height + 60))) })), [rain, height]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: dark }]}>
        <LinearGradient colors={['rgba(8,10,24,0.82)', 'rgba(10,16,34,0.5)', 'rgba(4,6,16,0.72)']} style={StyleSheet.absoluteFill} />
        {!still && drops.map((d, i) => <Animated.View key={i} style={[st.rain, { left: `${d.x * 100}%`, height: d.len, transform: [{ translateY: d.y }, { rotate: '14deg' }] }]} />)}
      </Animated.View>
      {!still && (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, st.flash, { opacity: bolt.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }) }]} />
          <Animated.View style={[st.boltAt, { opacity: bolt }]}>
            {BOLT.map((b, i) => (
              <View key={i} style={[st.boltBar, { left: b.x, top: b.y, height: b.len, transform: [{ rotate: `${b.deg}deg` }] }]} />
            ))}
          </Animated.View>
        </>
      )}
    </View>
  );
});

/** The storm's brightness, one step per spin: the steps passed stay lit and the current one stands out. */
export function BrightLadder({ step }: { step: number }) {
  return (
    <View style={st.ladder} accessibilityLabel={`Parlaklık ${step} kat`}>
      {Array.from({ length: STORM_SPINS }, (_, i) => (
        <View key={i} style={[st.rung, i + 1 <= step && st.rungOn, i + 1 === step && st.rungNow]}>
          <Text style={[st.rungText, i + 1 <= step && { color: '#3A2400' }]}>×{i + 1}</Text>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  tower: { position: 'absolute', left: 0, top: 0, bottom: 0, alignItems: 'center' },
  towerBody: { position: 'absolute', left: 4, right: 4, top: -6, bottom: -6, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(255,210,122,0.25)' },
  rail: { position: 'absolute', top: 2, bottom: 2, width: 4, borderRadius: 2, backgroundColor: 'rgba(5,10,20,0.7)' },
  socket: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: '#0B1220', borderWidth: 1.5, borderColor: 'rgba(255,210,122,0.4)' },
  beam: { position: 'absolute', top: 0, right: 0 },
  fan: { position: 'absolute' },
  core: { position: 'absolute', left: 0, borderRadius: 14 },
  halo: { position: 'absolute', left: -45, width: 90, height: 90, tintColor: LIGHT },
  lens: { position: 'absolute', left: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: LIGHT, borderWidth: 2, borderColor: '#FFF3D0', alignItems: 'center', justifyContent: 'center' },
  lensCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  lampGlow: { position: 'absolute', top: -12, width: 54, height: 54, tintColor: '#FB923C', opacity: 0.7 },
  lampTag: { color: LIGHT, fontSize: 9, fontWeight: '900', letterSpacing: 0.6, marginTop: -3 },
  shipGlow: { position: 'absolute', top: -12, width: 60, height: 60, tintColor: LIGHT },
  load: { marginTop: -4, minWidth: 34, height: 17, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3,12,23,0.78)', borderWidth: 1, borderColor: 'rgba(230,251,255,0.3)' },
  loadRich: { borderColor: LIGHT },
  loadLit: { backgroundColor: LIGHT, borderColor: '#FFF3D0' },
  loadText: { color: '#E6FBFF', fontSize: 12, lineHeight: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  rain: { position: 'absolute', top: 0, width: 1.5, borderRadius: 1, backgroundColor: 'rgba(200,220,255,0.55)' },
  flash: { backgroundColor: '#DCEBFF' },
  boltAt: { position: 'absolute', right: '24%', top: -6 },
  boltBar: { position: 'absolute', width: 4, borderRadius: 2, backgroundColor: '#F5FAFF' },
  ladder: { flexDirection: 'row', gap: 3 },
  rung: { minWidth: 26, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,210,122,0.35)', backgroundColor: 'rgba(255,210,122,0.06)' },
  rungOn: { backgroundColor: 'rgba(255,210,122,0.75)', borderColor: LIGHT },
  rungNow: { backgroundColor: LIGHT, borderColor: '#FFF3D0', transform: [{ scale: 1.15 }] },
  rungText: { color: 'rgba(255,210,122,0.8)', fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
});
