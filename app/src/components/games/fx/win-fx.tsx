// The moment a round pays. A small win throws a few coins and floats its amount; from five stakes up the stage dims,
// light turns behind the title, the amount counts up and coins rain (lib/win-tier decides which). A game shows it
// with `const win = useWinFx()`, draws `win.layer` last inside its root view and awaits `win.celebrate(…)` after the
// reels or the wheel have stopped, so Oto waits for the celebration. A tap ends a big one early. Decoration only:
// the round is settled before any of this, and nothing here touches the balance.
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Shine } from '@/components/fx/surface';
import { Coins } from '@/components/games/fx/coins';
import { Text } from '@/components/text';
import { playSfx } from '@/lib/game-sound';
import { pressHaptic, successHaptic } from '@/lib/haptics';
import { rollAt } from '@/lib/motion';
import { WIN_SHOW, WIN_TITLE, winTierOf, type WinTier } from '@/lib/win-tier';
import { useSettings } from '@/store';

const fmt = (n: number) => Math.floor(n).toLocaleString('tr-TR');

export type WinShow = {
  amount: number;
  bet: number;
  jackpot?: boolean;
  /** Instead of the tier's own title (e.g. "GRAND"). */
  title?: string;
  /** At most the small celebration: a game that shows its big wins with its own pictures (fx/jackpot-show). */
  smallOnly?: boolean;
};
export type Celebrate = (w: WinShow) => Promise<void>;

/** The ribbon and the light, per tier. */
const LOOK: Record<Exclude<WinTier, 'small'>, { ribbon: [string, string]; ink: string; ray: string }> = {
  big: { ribbon: ['#F59E0B', '#B45309'], ink: '#FFF7D6', ray: 'rgba(253,224,71,0.55)' },
  mega: { ribbon: ['#F97316', '#BE123C'], ink: '#FFF1E0', ray: 'rgba(251,146,60,0.6)' },
  epic: { ribbon: ['#13D9DF', '#0A5F7A'], ink: '#F0FEFF', ray: 'rgba(111,241,245,0.6)' },
  jackpot: { ribbon: ['#FACC15', '#DC2626'], ink: '#FFFBEB', ray: 'rgba(254,240,138,0.75)' },
};
const RAYS = 14;

export function useWinFx(): { celebrate: Celebrate; layer: ReactNode } {
  const [show, setShow] = useState<{ id: number; tier: WinTier; win: WinShow } | null>(null);
  const waiting = useRef<(() => void) | null>(null);
  const n = useRef(0);
  const celebrate = useCallback<Celebrate>(
    (w) =>
      new Promise<void>((resolve) => {
        const found = winTierOf(w.amount, w.bet, w.jackpot);
        if (!found) return resolve();
        const tier = w.smallOnly ? 'small' : found;
        // A celebration still up gives way; whoever waited for it goes on.
        waiting.current?.();
        waiting.current = resolve;
        setShow({ id: ++n.current, tier, win: w });
      }),
    [],
  );
  const done = useCallback(() => {
    setShow(null);
    waiting.current?.();
    waiting.current = null;
  }, []);
  // The screen closed mid-celebration: nobody is left waiting.
  useEffect(() => () => waiting.current?.(), []);
  return { celebrate, layer: show ? <WinCelebration key={show.id} {...show.win} tier={show.tier} onDone={done} /> : null };
}

function WinCelebration({ amount, bet, tier, title, onDone }: WinShow & { tier: WinTier; onDone: () => void }) {
  const { reduceMotion, effectsOff } = useSettings();
  const small = tier === 'small';
  const ms = reduceMotion && !small ? Math.min(1400, WIN_SHOW[tier].ms) : WIN_SHOW[tier].ms;
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [inV] = useState(() => new Animated.Value(0));
  const [out] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));
  const [count, setCount] = useState(small || reduceMotion ? amount : 0);
  const done = useRef(onDone);
  const closing = useRef(false);
  useEffect(() => {
    done.current = onDone;
  });

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setCount(amount);
    Animated.timing(out, { toValue: 1, duration: 240, useNativeDriver: true }).start(() => done.current());
  }, [amount, out]);

  useEffect(() => {
    successHaptic();
    playSfx(tier === 'jackpot' ? 'jackpot' : small ? 'win' : 'winBig', small ? 0.8 : 1);
    const ring = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }));
    if (!small && !reduceMotion) ring.start();
    const a = small
      ? Animated.timing(inV, { toValue: 1, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      : Animated.spring(inV, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true });
    a.start();
    const t = setTimeout(close, ms);
    return () => {
      clearTimeout(t);
      a.stop();
      ring.stop();
    };
    // Started once per celebration (the layer is keyed by it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The amount counts up over the first half of the show, ticking; then a coin lands.
  useEffect(() => {
    if (small || reduceMotion) return;
    const span = ms * 0.5;
    const start = Date.now();
    let frame = 0;
    let lastTick = 0;
    const step = () => {
      if (closing.current) return;
      const t = Math.min(1, (Date.now() - start) / span);
      setCount(rollAt(0, amount, t));
      const now = Date.now();
      if (t < 1 && now - lastTick > 90) {
        lastTick = now;
        playSfx('tick', 0.35);
      }
      if (t < 1) frame = requestAnimationFrame(step);
      else {
        playSfx('coin', 0.8);
        pressHaptic();
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLayout = (e: LayoutChangeEvent) => setBox({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) });
  const fade = out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  if (small)
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
        {!reduceMotion && <Coins kind="fountain" count={WIN_SHOW.small.coins} width={box.w} height={box.h} ms={ms} from={0.42} />}
        <Animated.View style={[s.floatWrap, { opacity: inV.interpolate({ inputRange: [0, 0.12, 0.75, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateY: inV.interpolate({ inputRange: [0, 1], outputRange: [10, -46] }) }] }]}>
          <Text style={s.float}>+{fmt(amount)}</Text>
        </Animated.View>
      </View>
    );

  const look = LOOK[tier];
  const x = bet > 0 ? Math.floor(amount / bet) : 0;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.layer, { opacity: fade }]} onLayout={onLayout} accessibilityLiveRegion="assertive">
      <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={close} accessibilityRole="button" accessibilityLabel={`${title ?? WIN_TITLE[tier]}, ${amount} jeton. Kapatmak için dokun`} />
      <View style={s.center} pointerEvents="none">
        {!reduceMotion && (
          <Animated.View style={[s.rays, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
            {Array.from({ length: RAYS }, (_, i) => (
              <View key={i} style={[s.rayArm, { transform: [{ rotate: `${(360 / RAYS) * i}deg` }] }]}>
                <LinearGradient colors={[look.ray, 'rgba(255,255,255,0)']} start={{ x: 0.5, y: 1 }} end={{ x: 0.5, y: 0 }} style={[s.ray, i % 2 === 1 && s.rayThin]} />
              </View>
            ))}
          </Animated.View>
        )}
        <Animated.View style={{ alignItems: 'center', opacity: inV.interpolate({ inputRange: [0, 0.4], outputRange: [0, 1], extrapolate: 'clamp' }), transform: [{ scale: inV.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
          <LinearGradient colors={look.ribbon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.ribbon}>
            <LinearGradient colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']} style={s.ribbonGloss} />
            <Text style={[s.title, { color: look.ink }]} numberOfLines={1} adjustsFontSizeToFit>
              {title ?? WIN_TITLE[tier]}
            </Text>
            {!effectsOff && <Shine radius={999} every={900} />}
          </LinearGradient>
          <Text style={s.amount} numberOfLines={1} adjustsFontSizeToFit>
            +{fmt(count)}
          </Text>
          <Text style={s.unit}>jeton{x >= 2 ? ` · bahsin ${fmt(x)} katı` : ''}</Text>
        </Animated.View>
      </View>
      {!reduceMotion && <Coins kind="rain" count={WIN_SHOW[tier].coins} width={box.w} height={box.h} ms={ms} />}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  layer: { zIndex: 30, elevation: 30, overflow: 'hidden', borderRadius: 22 },
  scrim: { backgroundColor: 'rgba(4,8,22,0.78)' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  rays: { position: 'absolute', width: 2, height: 2, alignItems: 'center', justifyContent: 'center' },
  rayArm: { position: 'absolute', width: 2, height: 2, alignItems: 'center' },
  ray: { position: 'absolute', bottom: 1, width: 26, height: 230, borderTopLeftRadius: 13, borderTopRightRadius: 13 },
  rayThin: { width: 12, height: 180 },
  ribbon: { borderRadius: 999, paddingHorizontal: 22, paddingVertical: 7, borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)', overflow: 'hidden', boxShadow: '0 8px 20px rgba(0,0,0,0.5)' },
  ribbonGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '50%' },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: 2.5, fontStyle: 'italic' },
  amount: { color: '#FFE08A', fontSize: 54, lineHeight: 62, fontWeight: '900', fontVariant: ['tabular-nums'], marginTop: 10, textShadowColor: 'rgba(246,189,96,0.85)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 18 },
  unit: { color: 'rgba(255,255,255,0.86)', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  floatWrap: { position: 'absolute', left: 0, right: 0, top: '36%', alignItems: 'center' },
  float: { color: '#FDE68A', fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'], textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
});
