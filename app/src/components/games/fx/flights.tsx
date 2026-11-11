// Things that fly across a game: the chip from the tray onto the option it is bet on, and a win's coins from the
// option to the balance. Where they start and land is measured on the screen when they set off, so the layer only
// needs to fill the view both ends live in (`root`); draw `layer` last in it. One native-driven value per flight,
// however many coins it carries. Decoration only: a bet counts and a win is paid whether or not anything flew.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Animated, Easing, StyleSheet, View, type HostInstance } from 'react-native';

import { ChipFace, type ChipLook } from '@/components/games/fx/chips';
import { icon3dSource } from '@/components/Icon3D';

const COIN = icon3dSource('coin');

type Point = { x: number; y: number };
type ChipFlight = { kind: 'chip'; id: number; from: Point; to: Point; look: ChipLook; size: number; ms: number; delay: number };
type Coin = { /** Where it starts, off the middle of the option (px). */ dx: number; dy: number; /** How far its path leans sideways. */ lean: number; size: number; /** When it sets off, 0…1 of the flight. */ at: number };
type CoinFlight = { kind: 'coins'; id: number; from: Point; to: Point; coins: Coin[]; ms: number };
type Flight = ChipFlight | CoinFlight;

/** The part of a coin flight each coin is in the air for; the last coin sets off at 1 − COIN_AIR. */
const COIN_AIR = 0.58;
/** When the first coin of a flight of `ms` lands. */
export const firstCoinAt = (ms: number) => Math.round(ms * COIN_AIR);

/** A view's box on the screen; null when it is not there (or not laid out yet). */
const boxOf = (node: HostInstance | null) =>
  new Promise<{ x: number; y: number; w: number; h: number } | null>((resolve) => {
    if (!node) return resolve(null);
    node.measureInWindow((x, y, w, h) => resolve(Number.isFinite(x) && Number.isFinite(y) && (w > 0 || h > 0) ? { x, y, w, h } : null));
  });

export function useFlights(root: RefObject<HostInstance | null>) {
  const [list, setList] = useState<Flight[]>([]);
  const seq = useRef(0);
  const waiting = useRef(new Map<number, () => void>());
  const alive = useRef(true);
  useEffect(() => {
    const w = waiting.current;
    return () => {
      alive.current = false;
      // The screen closed mid-flight: nobody is left waiting.
      w.forEach((done) => done());
      w.clear();
    };
  }, []);

  /** The middles of two views, counted from the root's corner. */
  const ends = useCallback(
    async (a: HostInstance | null, b: HostInstance | null) => {
      const [r, from, to] = await Promise.all([boxOf(root.current), boxOf(a), boxOf(b)]);
      if (!r || !from || !to || !alive.current) return null;
      return { from: { x: from.x - r.x + from.w / 2, y: from.y - r.y + from.h / 2 }, to: { x: to.x - r.x + to.w / 2, y: to.y - r.y + to.h / 2 } };
    },
    [root],
  );
  const launch = useCallback((f: Flight) => {
    const landed = new Promise<void>((resolve) => waiting.current.set(f.id, resolve));
    setList((l) => [...l, f]);
    return landed;
  }, []);
  const done = useCallback((id: number) => {
    setList((l) => l.filter((f) => f.id !== id));
    waiting.current.get(id)?.();
    waiting.current.delete(id);
  }, []);

  /** A chip from one view to another; resolves when it has landed (at once if either end can't be found). */
  const chip = useCallback(
    async (from: HostInstance | null, to: HostInstance | null, look: ChipLook, o: { size?: number; ms?: number; delay?: number; /** Where on the target it lands, off its middle (px). */ aim?: Point } = {}) => {
      const e = await ends(from, to);
      if (!e) return;
      await launch({ kind: 'chip', id: ++seq.current, from: e.from, to: { x: e.to.x + (o.aim?.x ?? 0), y: e.to.y + (o.aim?.y ?? 0) }, look, size: o.size ?? 30, ms: o.ms ?? 230, delay: o.delay ?? 0 });
    },
    [ends, launch],
  );
  /** `count` coins from one view to another, one after the other; resolves when the last has landed. */
  const coins = useCallback(
    async (from: HostInstance | null, to: HostInstance | null, o: { count?: number; ms?: number; aim?: Point } = {}) => {
      const e = await ends(from, to);
      if (!e) return;
      const n = Math.max(1, o.count ?? 8);
      const list: Coin[] = Array.from({ length: n }, (_, i) => ({
        dx: (Math.random() - 0.5) * 26,
        dy: (Math.random() - 0.5) * 16,
        lean: (i % 2 ? 1 : -1) * (14 + Math.random() * 30),
        size: 18 + Math.round(Math.random() * 6),
        at: n === 1 ? 0 : (i / (n - 1)) * (1 - COIN_AIR),
      }));
      await launch({ kind: 'coins', id: ++seq.current, from: e.from, to: { x: e.to.x + (o.aim?.x ?? 0), y: e.to.y + (o.aim?.y ?? 0) }, coins: list, ms: o.ms ?? 640 });
    },
    [ends, launch],
  );

  const layer = list.length ? (
    <View style={[StyleSheet.absoluteFill, f.layer]} pointerEvents="none">
      {list.map((x) => (x.kind === 'chip' ? <ChipFly key={x.id} flight={x} onDone={done} /> : <CoinsFly key={x.id} flight={x} onDone={done} />))}
    </View>
  ) : null;
  return { chip, coins, layer };
}

/** Points of a path for an interpolation: `n` + 1 of them from 0 to 1. */
const samples = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);

function ChipFly({ flight, onDone }: { flight: ChipFlight; onDone: (id: number) => void }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.sequence([Animated.delay(flight.delay), Animated.timing(t, { toValue: 1, duration: flight.ms, easing: Easing.out(Easing.quad), useNativeDriver: true })]);
    a.start(() => onDone(flight.id));
    return () => a.stop();
  }, [t, flight, onDone]);
  const { from, to, size } = flight;
  // A low arc: the chip is tossed, not slid.
  const lift = Math.min(46, 14 + Math.hypot(to.x - from.x, to.y - from.y) * 0.12);
  const at = samples(6);
  const x = t.interpolate({ inputRange: [0, 1], outputRange: [from.x, to.x] });
  const y = t.interpolate({ inputRange: at, outputRange: at.map((p) => from.y + (to.y - from.y) * p - lift * 4 * p * (1 - p)) });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: -size / 2,
        top: -size / 2,
        opacity: t.interpolate({ inputRange: [0, 0.01, 0.9, 1], outputRange: [0, 1, 1, 0] }),
        transform: [{ translateX: x }, { translateY: y }, { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1.25, 0.6] }) }],
      }}
    >
      <ChipFace size={size} look={flight.look} />
    </Animated.View>
  );
}

function CoinsFly({ flight, onDone }: { flight: CoinFlight; onDone: (id: number) => void }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.timing(t, { toValue: 1, duration: flight.ms, easing: Easing.linear, useNativeDriver: true });
    a.start(() => onDone(flight.id));
    return () => a.stop();
  }, [t, flight, onDone]);
  const { from, to } = flight;
  const at = samples(6);
  return (
    <>
      {flight.coins.map((c, i) => {
        const a = c.at;
        const b = Math.min(1, a + COIN_AIR);
        const input = at.map((p) => a + (b - a) * p);
        // Up out of the option first, then faster and faster into the balance: a curve through a point above the start.
        const x0 = from.x + c.dx;
        const y0 = from.y + c.dy;
        const cx = x0 + (to.x - x0) * 0.25 + c.lean;
        const cy = y0 - 34;
        const path = at.map((p) => p ** 1.5);
        const x = t.interpolate({ inputRange: input, outputRange: path.map((q) => (1 - q) ** 2 * x0 + 2 * q * (1 - q) * cx + q * q * to.x), extrapolate: 'clamp' });
        const y = t.interpolate({ inputRange: input, outputRange: path.map((q) => (1 - q) ** 2 * y0 + 2 * q * (1 - q) * cy + q * q * to.y), extrapolate: 'clamp' });
        const q = (b - a) / 4;
        return (
          <Animated.Image
            key={i}
            source={COIN}
            style={{
              position: 'absolute',
              left: -c.size / 2,
              top: -c.size / 2,
              width: c.size,
              height: c.size,
              opacity: t.interpolate({ inputRange: [a, a + 0.03, b - 0.03, b], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' }),
              transform: [
                { translateX: x },
                { translateY: y },
                // A coin turning in the air shows its edge twice.
                { scaleX: t.interpolate({ inputRange: [a, a + q, a + 2 * q, a + 3 * q, b], outputRange: [1, 0.15, 1, 0.15, 1], extrapolate: 'clamp' }) },
                { scale: t.interpolate({ inputRange: [a, a + q, b], outputRange: [0.5, 1, 0.75], extrapolate: 'clamp' }) },
              ],
            }}
          />
        );
      })}
    </>
  );
}

const f = StyleSheet.create({
  layer: { zIndex: 40, elevation: 40 },
});
