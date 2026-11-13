// A skinned machine's big moment in its own pictures (fx/slot-skin): the game dims, light rays turn behind the
// JACKPOT plaque as it springs in with a shine, the coin pile rises, gold coins burst out of it and rain down
// (fx/coins with the skin's coin), sparkles twinkle and the amount counts up on the win plate; then it closes
// itself. A Büyük Kazanç is the same pieces, lighter and shorter: its title on the shared Büyük Kazanç plaque
// (fx/salon-art) instead of the JACKPOT one, and no pile. A tap ends it early.
// "Animasyonları azalt" and "Efektleri kapat" show it still: everything in place, the amount at once, no coins.
// Native-driven Animated only (the count-up is the text). Decoration: the round was settled before it starts.
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Shine } from '@/components/fx/surface';
import { Coins } from '@/components/games/fx/coins';
import { SALON } from '@/components/games/fx/salon';
import { salonArt } from '@/components/games/fx/salon-art';
import { SkinOverlay, type SlotSkin } from '@/components/games/fx/slot-skin';
import { Text } from '@/components/text';
import { playSfx } from '@/lib/game-sound';
import { pressHaptic, successHaptic } from '@/lib/haptics';
import { rollAt } from '@/lib/motion';
import { useSettings } from '@/store';
import { fonts } from '@/theme';

export type ShowKind = 'jackpot' | 'big';
type Play = (s: { kind: ShowKind; amount: number; bet: number }) => Promise<void>;

const fmt = (n: number) => Math.floor(n).toLocaleString('tr-TR');
/** The Büyük Kazanç plaque every machine shares; its middle is empty for the title. */
const BIG_PLAQUE = salonArt('levha-buyuk-kazanc');
const BIG_ASPECT = 768 / 263;

/** How long each show stays (ms), moving and still. */
const SHOW_MS: Record<ShowKind, { ms: number; calm: number }> = { jackpot: { ms: 4500, calm: 2200 }, big: { ms: 2800, calm: 1600 } };

/** Where the sparkles twinkle (parts of the layer) and when in each twinkle cycle. */
const SPARKLES = [
  { x: 0.14, y: 0.16, at: 0, size: 34 },
  { x: 0.86, y: 0.2, at: 0.3, size: 28 },
  { x: 0.24, y: 0.46, at: 0.55, size: 24 },
  { x: 0.8, y: 0.5, at: 0.15, size: 36 },
  { x: 0.5, y: 0.08, at: 0.7, size: 26 },
  { x: 0.1, y: 0.7, at: 0.42, size: 30 },
  { x: 0.9, y: 0.74, at: 0.82, size: 26 },
];

/**
 * `const show = useJackpotShow(skin)`: await `show.play(…)` after the reels stop. The show is drawn over the whole game
 * panel (SkinOverlay, games/game-panel); without one, draw `show.layer` last over the game.
 */
export function useJackpotShow(skin: SlotSkin | undefined): { play: Play; layer: ReactNode } {
  const [show, setShow] = useState<{ id: number; kind: ShowKind; amount: number; bet: number } | null>(null);
  const waiting = useRef<(() => void) | null>(null);
  const n = useRef(0);
  const play = useCallback<Play>(
    (s) =>
      new Promise<void>((resolve) => {
        waiting.current?.();
        waiting.current = resolve;
        setShow({ id: ++n.current, ...s });
      }),
    [],
  );
  const done = useCallback(() => {
    setShow(null);
    waiting.current?.();
    waiting.current = null;
  }, []);
  useEffect(() => () => waiting.current?.(), []);
  const layer = useMemo(() => (show && skin ? <JackpotShow key={show.id} skin={skin} kind={show.kind} amount={show.amount} bet={show.bet} onDone={done} /> : null), [show, skin, done]);
  const host = useContext(SkinOverlay);
  useEffect(() => {
    host?.(layer);
  }, [host, layer]);
  useEffect(() => () => host?.(null), [host]);
  return { play, layer: host ? null : layer };
}

function JackpotShow({ skin, kind, amount, bet, onDone }: { skin: SlotSkin; kind: ShowKind; amount: number; bet: number; onDone: () => void }) {
  const { reduceMotion, effectsOff } = useSettings();
  const calm = reduceMotion || effectsOff;
  const jackpot = kind === 'jackpot';
  const ms = calm ? SHOW_MS[kind].calm : SHOW_MS[kind].ms;
  const art = skin.show;
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [dim] = useState(() => new Animated.Value(calm ? 1 : 0));
  const [pop] = useState(() => new Animated.Value(calm ? 1 : 0));
  const [turn] = useState(() => new Animated.Value(0));
  const [rise] = useState(() => new Animated.Value(calm ? 1 : 0));
  const [twinkle] = useState(() => new Animated.Value(calm ? 0.5 : 0));
  const [out] = useState(() => new Animated.Value(0));
  const [count, setCount] = useState(calm ? amount : 0);
  const [burst, setBurst] = useState(false);
  const closing = useRef(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setCount(amount);
    Animated.timing(out, { toValue: 1, duration: 280, useNativeDriver: true }).start(() => done.current());
  }, [amount, out]);

  useEffect(() => {
    successHaptic();
    playSfx(jackpot ? 'jackpot' : 'winBig', 1);
    const end = setTimeout(close, ms);
    if (calm) return () => clearTimeout(end);
    // 1. the dim, 2. the plaque (or the title) springs in over turning rays, 3. the pile rises and bursts.
    const enter = Animated.parallel([
      Animated.timing(dim, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.sequence([Animated.delay(220), Animated.spring(pop, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true })]),
      Animated.sequence([Animated.delay(jackpot ? 800 : 300), Animated.timing(rise, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true })]),
    ]);
    const rays = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 14000, easing: Easing.linear, useNativeDriver: true }));
    const sparkle = Animated.loop(Animated.timing(twinkle, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    enter.start();
    rays.start();
    sparkle.start();
    const go = setTimeout(() => setBurst(true), jackpot ? 1150 : 450);
    return () => {
      clearTimeout(end);
      clearTimeout(go);
      enter.stop();
      rays.stop();
      sparkle.stop();
    };
    // Started once per show (the layer is keyed by it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 4. the amount counts up on the plate, ticking; a coin lands when it is reached.
  useEffect(() => {
    if (calm) return;
    const from = Date.now() + (jackpot ? 1100 : 350);
    const span = jackpot ? 2000 : 1200;
    let frame = 0;
    let lastTick = 0;
    const step = () => {
      if (closing.current) return;
      const now = Date.now();
      const t = Math.max(0, Math.min(1, (now - from) / span));
      setCount(rollAt(0, amount, t));
      if (t > 0 && t < 1 && now - lastTick > 90) {
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
  const { w, h } = box;
  const plaqueW = Math.min(w * 0.92, 380);
  const plaqueH = plaqueW / art.plaque.aspect;
  const plateW = Math.min(w * 0.9, 360);
  const plateH = plateW / skin.plate.aspect;
  const pileW = Math.min(w * 0.96, 420);
  const pileH = pileW / art.pile.aspect;
  const rayS = Math.min(Math.max(w, h) * 0.95, 620);
  const x = bet > 0 ? Math.floor(amount / bet) : 0;
  const title = jackpot ? 'JACKPOT' : 'BÜYÜK KAZANÇ';
  const fade = out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const popIn = { opacity: pop.interpolate({ inputRange: [0, 0.35], outputRange: [0, 1], extrapolate: 'clamp' as const }), transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] };

  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.layer, { opacity: fade }]} onLayout={onLayout} accessibilityLiveRegion="assertive">
      <Animated.View style={[StyleSheet.absoluteFill, s.scrim, { opacity: dim }]} pointerEvents="none" />
      {w > 0 && (
        <>
          {/* The rays turn behind the plaque, a little above the middle. */}
          <Animated.Image
            source={art.rays}
            pointerEvents="none"
            style={[
              s.abs,
              {
                width: rayS,
                height: rayS,
                left: (w - rayS) / 2,
                top: h * 0.36 - rayS / 2,
                opacity: calm ? 0.55 : pop.interpolate({ inputRange: [0, 1], outputRange: [0, 0.95], extrapolate: 'clamp' }),
                transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
              },
            ]}
          />
          {jackpot && (
            <Animated.Image
              source={art.pile.src}
              pointerEvents="none"
              style={[s.abs, { width: pileW, height: pileH, left: (w - pileW) / 2, bottom: -pileH * 0.12, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [pileH, 0] }) }] }]}
            />
          )}
          {!calm && burst && <Coins kind="fountain" count={jackpot ? 34 : 18} width={w} height={h} ms={jackpot ? 2600 : 1900} from={jackpot ? 1 - pileH * 0.55 / h : 0.6} source={art.coin} />}
          {!calm && burst && jackpot && <Coins kind="rain" count={40} width={w} height={h} ms={3000} source={art.coin} />}
          {SPARKLES.map((sp, i) => {
            const a = sp.at;
            const phase = calm
              ? 0.6
              : twinkle.interpolate({ inputRange: [0, a, Math.min(1, a + 0.12), Math.min(1, a + 0.24), 1], outputRange: [0, 0, 1, 0, 0], extrapolate: 'clamp' });
            return (
              <Animated.Image
                key={i}
                source={art.sparkle}
                pointerEvents="none"
                style={[s.abs, { width: sp.size * 2, height: sp.size * 2, left: sp.x * w - sp.size, top: sp.y * h - sp.size, opacity: phase, transform: [{ scale: calm ? 1 : twinkle.interpolate({ inputRange: [0, a, Math.min(1, a + 0.12), Math.min(1, a + 0.24), 1], outputRange: [0.4, 0.4, 1.15, 0.4, 0.4], extrapolate: 'clamp' }) }] }]}
              />
            );
          })}
          <View style={[s.abs, s.column, { left: 0, right: 0, top: h * 0.36 - plaqueH / 2 }]} pointerEvents="none">
            <Animated.View style={popIn}>
              {jackpot ? (
                <View style={{ width: plaqueW, height: plaqueH }}>
                  <Image source={art.plaque.src} style={{ width: plaqueW, height: plaqueH }} resizeMode="contain" />
                  {/* The shine runs across the plaque's red field only. */}
                  {!calm && (
                    <View style={[s.abs, { left: plaqueW * 0.15, right: plaqueW * 0.15, top: plaqueH * 0.3, bottom: plaqueH * 0.3, borderRadius: plaqueH * 0.2, overflow: 'hidden' }]}>
                      <Shine radius={plaqueH * 0.2} every={1300} />
                    </View>
                  )}
                </View>
              ) : BIG_PLAQUE !== undefined ? (
                <View style={{ width: plaqueW, height: plaqueH, justifyContent: 'center' }}>
                  <Image source={BIG_PLAQUE} style={[s.abs, { left: 0, top: (plaqueH - plaqueW / BIG_ASPECT) / 2, width: plaqueW, height: plaqueW / BIG_ASPECT }]} resizeMode="contain" />
                  <Text style={[s.title, { fontSize: Math.round(plaqueW * 0.085), marginHorizontal: plaqueW * 0.12 }]} numberOfLines={1} adjustsFontSizeToFit>
                    {title}
                  </Text>
                </View>
              ) : (
                <View style={{ height: plaqueH, justifyContent: 'center' }}>
                  <Text style={[s.title, { fontSize: Math.round(plaqueW * 0.11) }]} numberOfLines={1} adjustsFontSizeToFit>
                    {title}
                  </Text>
                </View>
              )}
            </Animated.View>
            <Animated.View style={[{ marginTop: 14, alignItems: 'center' }, popIn]}>
              <View style={{ width: plateW, height: plateH }}>
                <Image source={skin.plate.src} style={{ width: plateW, height: plateH }} resizeMode="contain" />
                <View style={[s.abs, s.center, { left: plateW * 0.15, right: plateW * 0.15, top: plateH * 0.26, bottom: plateH * 0.22 }]}>
                  <Text style={[s.amount, { fontSize: Math.round(plateH * 0.38), lineHeight: Math.round(plateH * 0.46) }]} numberOfLines={1} adjustsFontSizeToFit>
                    +{fmt(count)}
                  </Text>
                </View>
              </View>
              <Text style={s.unit}>jeton{x >= 2 ? ` · bahsin ${fmt(x)} katı` : ''}</Text>
            </Animated.View>
          </View>
        </>
      )}
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel={`${title}, ${amount} jeton. Kapatmak için dokun`} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  layer: { zIndex: 40, elevation: 40, overflow: 'hidden' },
  scrim: { backgroundColor: 'rgba(6,4,10,0.84)' },
  abs: { position: 'absolute' },
  column: { alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFE08A', fontFamily: fonts.display, letterSpacing: 2, fontStyle: 'italic', paddingHorizontal: 12, paddingVertical: 6, textShadowColor: 'rgba(110,30,0,0.95)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 5 },
  amount: { color: '#FFE08A', fontFamily: fonts.display, fontVariant: ['tabular-nums'], textShadowColor: 'rgba(40,6,0,0.95)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  unit: { color: SALON.goldHi, fontSize: 14, fontWeight: '800', letterSpacing: 0.5, marginTop: 6, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
});
