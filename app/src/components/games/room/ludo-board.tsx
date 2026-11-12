// The Ludo board, drawn with plain views: the four bases, the track of 72 squares, the home triangles and the tokens.
// One board for a practice game and for a live room's table (components/games/room/ludo): it shows the tokens it is
// given and says which one was tapped, nothing more. Tokens rest where `tokens` puts them; a move is played through
// the handle (`hop`, `back`), so whoever owns the game decides when a token walks. Geometry: lib/room-games/ludo-board.
// Every animation is a transform or an opacity on the native driver; with `still` (Animasyonları azalt) tokens
// change place at once and nothing pulses.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { BASE, HOME } from '@/lib/room-games/ludo';
import { GRID, cornerOf, hopSteps, stackSpots, tokenPoint, trackSquares, yardCentre, type Point } from '@/lib/room-games/ludo-board';

/** The four colours clockwise, from the app's palette: turquoise, pink (coral), gold, green. `ink` is text on the colour. */
export const LUDO_COLORS = [
  { name: 'Turkuaz', base: '#13D9DF', light: '#A5F6F8', dark: '#0A8F95', deep: '#0B4A58', ink: '#04161D' },
  { name: 'Pembe', base: '#FF6576', light: '#FFC2C9', dark: '#C93C4F', deep: '#5E1F2D', ink: '#3A0A14' },
  { name: 'Altın', base: '#F6BD60', light: '#FFE9BF', dark: '#B7832E', deep: '#5C4012', ink: '#3B2300' },
  { name: 'Yeşil', base: '#22C55E', light: '#A7F3C5', dark: '#15803D', deep: '#0E4A27', ink: '#052E16' },
] as const;

export type BoardToken = { color: number; index: number; step: number };
export type BoardHandle = {
  /** Walks a token square by square from `from` to `to`; `onStep` at each square. Resolves when it stands there. */
  hop: (color: number, index: number, from: number, to: number, onStep?: () => void) => Promise<void>;
  /** A captured token flies back to its base. */
  back: (color: number, index: number, from: number) => Promise<void>;
};

/** The board's rim (dp). */
const FRAME = 5;
const HOP_MS = 135;
/** How much bigger a token is drawn in its base, and how much smaller at home, than on a square. */
const BASE_SCALE = 1.24;
const HOME_SCALE = 0.62;
const GAP = 1.5;
const keyOf = (color: number, index: number) => `${color}:${index}`;
const run = (a: Animated.CompositeAnimation) => new Promise<void>((done) => a.start(() => done()));
const sizeAt = (step: number) => (step <= BASE ? BASE_SCALE : step >= HOME ? HOME_SCALE : 1);

type Rest = { x: number; y: number; scale: number };
type Values = { xy: Animated.ValueXY; scale: Animated.Value; lift: Animated.Value; at: Rest | null };

/** Where each token rests, in px: alone in the middle of its square, sharing it side by side. */
function restSpots(tokens: BoardToken[], count: number, turns: number, cell: number) {
  const out = new Map<string, Rest>();
  const shared = new Map<string, BoardToken[]>();
  for (const t of tokens) {
    const p = tokenPoint(t.color, t.step, t.index, count, turns);
    if (t.step <= BASE || t.step >= HOME) out.set(keyOf(t.color, t.index), { x: p.x * cell, y: p.y * cell, scale: sizeAt(t.step) });
    else {
      const k = `${p.x},${p.y}`;
      shared.set(k, [...(shared.get(k) ?? []), t]);
    }
  }
  for (const group of shared.values()) {
    const { spots, scale } = stackSpots(group.length);
    group.forEach((t, i) => {
      const p = tokenPoint(t.color, t.step, t.index, count, turns);
      out.set(keyOf(t.color, t.index), { x: (p.x + spots[i].x) * cell, y: (p.y + spots[i].y) * cell, scale });
    });
  }
  return out;
}

export function LudoBoard({
  size,
  turns,
  count,
  colors,
  tokens,
  active = null,
  movable,
  onPick,
  still,
  ref,
}: {
  /** The board's side (dp). */
  size: number;
  /** Quarter turns clockwise: the viewer's colour sits bottom-left (lib/room-games/ludo-board turnsFor). */
  turns: number;
  /** Tokens each (2 or 4): the places drawn in a base. */
  count: number;
  /** The colours somebody plays; the other bases are dimmed. */
  colors: number[];
  tokens: BoardToken[];
  /** The colour whose turn it is: its base lights up. */
  active?: number | null;
  /** The tokens of one colour that may be tapped now. */
  movable?: { color: number; indexes: number[] } | null;
  onPick?: (index: number) => void;
  still?: boolean;
  ref?: Ref<BoardHandle>;
}) {
  // The rim and its hairline border are inside `size`.
  const inner = size - 2 * (FRAME + 1);
  const cell = inner / GRID;
  const unit = cell * 0.84;
  // Each token's place on the screen, kept for as long as the board is: the animations write to them, not React.
  const [values] = useState(() => new Map<string, Values>());
  const [busy] = useState(() => new Set<string>());
  const alive = useRef(true);
  const [moving, setMoving] = useState<string | null>(null);
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number; color: number }[]>([]);
  const burstId = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const rest = useMemo(() => restSpots(tokens, count, turns, cell), [tokens, count, turns, cell]);
  const valuesOf = (key: string) => {
    let v = values.get(key);
    if (!v) {
      const r = rest.get(key);
      v = { xy: new Animated.ValueXY({ x: r?.x ?? 0, y: r?.y ?? 0 }), scale: new Animated.Value(r?.scale ?? 1), lift: new Animated.Value(0), at: null };
      values.set(key, v);
    }
    return v;
  };
  // What decides whether a token glides to its new place or is simply put there (a resized or turned board).
  const laid = useRef({ cell, turns, count });
  useLayoutEffect(() => {
    const glide = !still && laid.current.cell === cell && laid.current.turns === turns && laid.current.count === count;
    laid.current = { cell, turns, count };
    for (const [key, r] of rest) {
      const v = values.get(key);
      // A token walking (hop, back) is left alone: it ends on its square, and the next layout puts it in its place there.
      if (!v || busy.has(key)) continue;
      if (v.at && v.at.x === r.x && v.at.y === r.y && v.at.scale === r.scale) continue;
      const first = !v.at;
      v.at = r;
      if (first || !glide) {
        v.xy.setValue({ x: r.x, y: r.y });
        v.scale.setValue(r.scale);
      } else {
        Animated.parallel([
          Animated.timing(v.xy, { toValue: { x: r.x, y: r.y }, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(v.scale, { toValue: r.scale, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]).start();
      }
    }
    // Tokens that left the board (their player got up) take their values with them.
    for (const key of [...values.keys()]) if (!rest.has(key)) values.delete(key);
  }, [rest, cell, turns, count, still, values, busy]);

  const burst = (p: Point, color: number) => {
    if (still) return;
    const id = ++burstId.current;
    setBursts((b) => [...b, { id, x: p.x * cell, y: p.y * cell, color }]);
  };

  useImperativeHandle(ref, () => ({
    async hop(color, index, from, to, onStep) {
      const key = keyOf(color, index);
      const v = values.get(key);
      if (!v || still) return;
      busy.add(key);
      setMoving(key);
      for (const step of hopSteps(from, to)) {
        const p = tokenPoint(color, step, index, count, turns);
        // Out of base is one longer leap; along the track each square is a small hop.
        const ms = from <= BASE ? 280 : HOP_MS;
        await run(
          Animated.parallel([
            Animated.timing(v.xy, { toValue: { x: p.x * cell, y: p.y * cell }, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(v.scale, { toValue: sizeAt(step), duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.sequence([
              Animated.timing(v.lift, { toValue: 1, duration: ms / 2, easing: Easing.out(Easing.quad), useNativeDriver: true }),
              Animated.timing(v.lift, { toValue: 0, duration: ms / 2, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            ]),
          ]),
        );
        if (!alive.current) return;
        v.at = { x: p.x * cell, y: p.y * cell, scale: sizeAt(step) };
        onStep?.();
        if (step >= HOME) burst(p, color);
      }
      busy.delete(key);
      setMoving(null);
    },
    async back(color, index, from) {
      const key = keyOf(color, index);
      const v = values.get(key);
      if (!v || still) return;
      busy.add(key);
      burst(tokenPoint(color, from, index, count, turns), color);
      const p = tokenPoint(color, BASE, index, count, turns);
      await run(
        Animated.parallel([
          Animated.timing(v.xy, { toValue: { x: p.x * cell, y: p.y * cell }, duration: 460, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(v.scale, { toValue: 1.7, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(v.scale, { toValue: BASE_SCALE, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
        ]),
      );
      if (!alive.current) return;
      v.at = { x: p.x * cell, y: p.y * cell, scale: BASE_SCALE };
      busy.delete(key);
    },
  }));

  const pickable = movable && onPick ? movable : null;
  return (
    <LinearGradient colors={['#34507C', '#1A2B47', '#101C33']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[b.frame, { width: size, height: size, borderRadius: cell * 0.9 }]} accessibilityLabel="Ludo tahtası">
      <View style={[b.felt, { width: inner, height: inner, borderRadius: cell * 0.7 }]}>
        <Surface cell={cell} turns={turns} count={count} colors={colors} active={active} still={!!still} />
        {tokens.map((t) => {
          const key = keyOf(t.color, t.index);
          const can = !!pickable && pickable.color === t.color && pickable.indexes.includes(t.index);
          return (
            <Token
              key={key}
              color={t.color}
              unit={unit}
              v={valuesOf(key)}
              top={moving === key}
              pulse={can}
              still={!!still}
              label={`${t.index + 1}. taşı oyna`}
              // The same function for every render would be nicer, but a token is a handful of views.
              onPress={can ? () => onPick?.(t.index) : undefined}
            />
          );
        })}
        {bursts.map((x) => (
          <Burst key={x.id} x={x.x} y={x.y} size={cell * 2.6} color={LUDO_COLORS[x.color].light} onDone={() => setBursts((all) => all.filter((y) => y.id !== x.id))} />
        ))}
      </View>
    </LinearGradient>
  );
}

/** Everything that doesn't move: bases, squares, the centre. Redrawn only when the board itself changes. */
const Surface = memo(function Surface({ cell, turns, count, colors, active, still }: { cell: number; turns: number; count: number; colors: number[]; active: number | null; still: boolean }) {
  const squares = useMemo(() => trackSquares(turns), [turns]);
  const side = cell - GAP;
  return (
    <>
      {[0, 1, 2, 3].map((color) => (
        <Yard key={color} color={color} corner={cornerOf(color, turns)} turns={turns} cell={cell} count={count} playing={colors.includes(color)} active={active === color} still={still} />
      ))}
      {squares.map((q) => {
        const c = q.color === null ? null : LUDO_COLORS[q.color];
        const at = { left: q.col * cell + GAP / 2, top: q.row * cell + GAP / 2, width: side, height: side, borderRadius: cell * 0.2 };
        if (q.kind === 'lane' || q.kind === 'start')
          return (
            <LinearGradient key={`${q.col}-${q.row}`} colors={[c!.base, c!.dark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[b.square, at, b.tinted]}>
              {q.kind === 'start' && <Ionicons name="caret-forward" size={cell * 0.62} color={c!.ink} style={{ opacity: 0.55, transform: [{ rotate: `${q.heading * 90}deg` }] }} />}
            </LinearGradient>
          );
        return (
          <View key={`${q.col}-${q.row}`} style={[b.square, at, q.kind === 'star' ? b.star : b.plain]}>
            {q.kind === 'star' && <Ionicons name="star" size={cell * 0.62} color="rgba(255,255,255,0.62)" />}
            {q.kind === 'gate' && <Ionicons name="arrow-forward" size={cell * 0.62} color={c!.base} style={{ transform: [{ rotate: `${q.heading * 90}deg` }] }} />}
          </View>
        );
      })}
      <Centre cell={cell} turns={turns} />
    </>
  );
});

function Yard({ color, corner, turns, cell, count, playing, active, still }: { color: number; corner: number; turns: number; cell: number; count: number; playing: boolean; active: boolean; still: boolean }) {
  const c = LUDO_COLORS[color];
  const side = cell * 6;
  const centre = yardCentre(corner);
  const left = (centre.x - 3) * cell;
  const top = (centre.y - 3) * cell;
  const well = cell * 1.56;
  const [glow] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active || still) return void glow.setValue(active ? 1 : 0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.25, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, still, glow]);
  return (
    <View style={{ position: 'absolute', left, top, width: side, height: side, padding: 2.5, opacity: playing ? 1 : 0.28 }}>
      <LinearGradient colors={[c.base, c.dark]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={[b.yard, { borderRadius: cell * 0.75 }]}>
        <LinearGradient colors={['rgba(255,255,255,0.34)', 'rgba(255,255,255,0)']} style={b.yardSheen} />
        <View style={[b.tray, { margin: cell * 0.62, borderRadius: cell * 0.8 }]} />
      </LinearGradient>
      {/* Whose turn it is: the rim of the base breathes. */}
      <Animated.View style={[b.yardRim, { borderRadius: cell * 0.75, opacity: glow, boxShadow: `0 0 ${Math.round(cell * 0.7)}px ${c.light}` }]} />
      {Array.from({ length: count }, (_, i) => {
        const p = tokenPoint(color, BASE, i, count, turns);
        return <View key={i} style={[b.well, { left: p.x * cell - left - well / 2, top: p.y * cell - top - well / 2, width: well, height: well, borderRadius: well / 2, backgroundColor: c.deep }]} />;
      })}
    </View>
  );
}

/** Home: four triangles, each colour's on the side its home column comes in from. */
function Centre({ cell, turns }: { cell: number; turns: number }) {
  const side = cell * 3;
  const diamond = side * Math.SQRT2;
  // A square of four quarters turned 45°: its top-left quarter becomes the top triangle, top-right the right one,
  // bottom-left the left one, bottom-right the bottom one. Colour 0 comes in from the left on an unturned board.
  const colorAt = (edge: number) => LUDO_COLORS[(((edge - turns) % 4) + 4) % 4];
  return (
    <View style={[b.centre, { left: cell * 6 + GAP / 2, top: cell * 6 + GAP / 2, width: side - GAP, height: side - GAP, borderRadius: cell * 0.22 }]}>
      <View style={{ position: 'absolute', left: (side - GAP - diamond) / 2, top: (side - GAP - diamond) / 2, width: diamond, height: diamond, flexDirection: 'row', flexWrap: 'wrap', transform: [{ rotate: '45deg' }] }}>
        {[1, 2, 0, 3].map((edge) => (
          <LinearGradient key={edge} colors={[colorAt(edge).base, colorAt(edge).dark]} start={{ x: 1, y: 1 }} end={{ x: 0, y: 0 }} style={b.quarter} />
        ))}
      </View>
      <View style={[b.hub, { width: cell * 0.9, height: cell * 0.9, borderRadius: cell }]}>
        <Ionicons name="trophy" size={cell * 0.5} color="#F6BD60" />
      </View>
    </View>
  );
}

const Token = memo(function Token({ color, unit, v, top, pulse, still, label, onPress }: { color: number; unit: number; v: Values; top: boolean; pulse: boolean; still: boolean; label: string; onPress?: () => void }) {
  const c = LUDO_COLORS[color];
  const rise = v.lift.interpolate({ inputRange: [0, 1], outputRange: [0, -unit * 0.45] });
  const swell = v.lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const body = (
    <LinearGradient colors={[c.light, c.base, c.dark]} locations={[0, 0.42, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[k.body, { borderRadius: unit / 2 }, pulse && k.lit]}>
      <View style={[k.core, { borderRadius: unit, backgroundColor: c.dark, borderColor: c.light }]} />
      <View style={[k.shine, { borderRadius: unit }]} />
    </LinearGradient>
  );
  return (
    <Animated.View
      style={[k.wrap, { width: unit, height: unit, marginLeft: -unit / 2, marginTop: -unit / 2, zIndex: top ? 30 : pulse ? 20 : 10, pointerEvents: onPress ? 'auto' : 'none', transform: [{ translateX: v.xy.x }, { translateY: v.xy.y }, { translateY: rise }, { scale: Animated.multiply(v.scale, swell) }] }]}
    >
      {pulse && <Ring unit={unit} still={still} />}
      {onPress ? (
        <Pressable onPress={onPress} hitSlop={Math.max(4, (40 - unit) / 2)} accessibilityRole="button" accessibilityLabel={label} style={k.fill}>
          {body}
        </Pressable>
      ) : (
        body
      )}
    </Animated.View>
  );
});

/** Around a token that may be moved: a ring that spreads and fades, over and over. */
function Ring({ unit, still }: { unit: number; still: boolean }) {
  const [p] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(Animated.timing(p, { toValue: 1, duration: 950, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [p, still]);
  if (still) return <View style={[k.ring, { borderRadius: unit, margin: -3 }]} />;
  return <Animated.View style={[k.ring, { borderRadius: unit, opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.95, 0] }), transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }] }]} />;
}

/** A capture, a token home: a ring and a few sparks from that square, once. */
function Burst({ x, y, size, color, onDone }: { x: number; y: number; size: number; color: string; onDone: () => void }) {
  const [p] = useState(() => new Animated.Value(0));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const a = Animated.timing(p, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start(() => done.current());
    return () => a.stop();
  }, [p]);
  const fade = p.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.7, 0] });
  return (
    <View style={{ position: 'absolute', left: x, top: y, zIndex: 40, pointerEvents: 'none' }}>
      <Animated.View style={{ position: 'absolute', left: -size / 2, top: -size / 2, width: size, height: size, borderRadius: size, borderWidth: 2, borderColor: color, opacity: fade, transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }] }} />
      {SPARKS.map(([dx, dy], i) => (
        <Animated.View
          key={i}
          style={[k.spark, { backgroundColor: i % 2 ? '#FFFFFF' : color, opacity: fade, transform: [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, dx * size * 0.62] }) }, { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, dy * size * 0.62] }) }] }]}
        />
      ))}
    </View>
  );
}
const SPARKS = Array.from({ length: 8 }, (_, i) => [Math.cos((Math.PI * 2 * i) / 8 + 0.4), Math.sin((Math.PI * 2 * i) / 8 + 0.4)] as const);

const b = StyleSheet.create({
  frame: { padding: FRAME, boxShadow: '0 10px 26px rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  felt: { backgroundColor: '#0A1426', overflow: 'hidden' },
  square: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  plain: { backgroundColor: 'rgba(163,177,207,0.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  star: { backgroundColor: 'rgba(163,177,207,0.26)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  tinted: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  yard: { flex: 1, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  yardSheen: { position: 'absolute', left: 0, right: 0, top: 0, height: '46%' },
  yardRim: { position: 'absolute', left: 2.5, top: 2.5, right: 2.5, bottom: 2.5, borderWidth: 2, borderColor: '#FFFFFF', pointerEvents: 'none' },
  tray: { flex: 1, backgroundColor: 'rgba(8,15,30,0.34)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.26)' },
  well: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.5)' },
  centre: { position: 'absolute', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  quarter: { width: '50%', height: '50%', borderWidth: 1, borderColor: 'rgba(8,15,30,0.45)' },
  hub: { backgroundColor: '#0A1426', borderWidth: 1.5, borderColor: '#F6BD60', alignItems: 'center', justifyContent: 'center' },
});
const k = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, top: 0 },
  fill: { flex: 1 },
  body: { flex: 1, borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 3px rgba(0,0,0,0.5)' },
  lit: { boxShadow: '0 0 8px rgba(255,255,255,0.95)' },
  core: { width: '46%', height: '46%', borderWidth: 1, opacity: 0.9 },
  shine: { position: 'absolute', left: '18%', top: '10%', width: '34%', height: '22%', backgroundColor: 'rgba(255,255,255,0.75)' },
  ring: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: '#FFFFFF' },
  spark: { position: 'absolute', left: -2.5, top: -2.5, width: 5, height: 5, borderRadius: 3 },
});
