// The one shell every Oyun Salonu game is drawn in, so the games read as one product: the screen's layout (the stage
// takes the height the phone leaves, the controls stay at the bottom), the stage's frame (a layered gold bezel, an
// inner shadow, a soft light from the top, a vignette and a slow ambient light), the stage's title row and status
// plate, the glossy plate a symbol sits on, the numbers (tabular figures, gold glow for a win, a count-up) and the
// big round and wide action buttons with their press, glow and idle breathing. Decoration only: rounds are settled
// before anything here moves. "Animasyonları azalt" stops every motion here, "Tüm efektleri kapat" the ambient
// light, the idle breathing and the win shine.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { InfoButton } from '@/components/games/fx/info-sheet';
import { Text } from '@/components/text';
import { rollAt } from '@/lib/motion';
import { useSettings } from '@/store';
import { fonts, radius, semantic, space } from '@/theme';

const GLOW = require('../../../../assets/fx/glow.png');

type Colors = readonly [string, string, ...string[]];

/** The shell's own tokens: every Salon game takes its radii, gaps and golds from here (on top of the theme's). */
export const SALON = {
  /** Between the stage and the controls, and between two rows of controls. */
  gap: space.md,
  row: space.sm + 2,
  /** The stage's outer corner, its inner panel's, a control's. */
  stageRadius: radius.xl,
  innerRadius: radius.xl - 4,
  controlRadius: radius.lg,
  /** Height of the balance, the stake and the side buttons; the round action button's size. */
  control: 50,
  action: 84,
  gold: semantic.money,
  goldHi: '#FFE7B0',
  goldDeep: semantic.moneyEdge,
  goldInk: semantic.moneyInk,
  /** The navy glass of every control. */
  glass: ['#1C2E4A', '#0F1C33'] as Colors,
  glassRim: 'rgba(246,189,96,0.32)',
  ink: '#FFFFFF',
  dim: 'rgba(222,232,250,0.7)',
  win: '#FFE08A',
  bad: '#FF8E9A',
} as const;

/** The gold of the stage's bezel: light at the top, deep at the sides, a bright line at the bottom. */
const BEZEL: Colors = ['#FFE7B0', '#C9963F', '#5A3B10', '#B7832E', '#FFD98A'];

/** `still`: no motion at all. `quiet`: no decoration either (ambient light, idle breathing, win shine). */
export function useSalonFx() {
  const { reduceMotion, effectsOff } = useSettings();
  return { still: reduceMotion, quiet: reduceMotion || effectsOff };
}

/** The game's root: stage on top taking the free height, controls under it. */
export const salonScreen: ViewStyle = { flex: 1, gap: SALON.gap };

/** The size of a box as it is laid out (0 until then). For a flexible area whose content is sized from it. */
export function useBox() {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    const h = Math.round(e.nativeEvent.layout.height);
    setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
  };
  return { ...box, onLayout };
}

/**
 * The stage: a layered gold bezel round the game's own colours, lit from the top, darker at the edges, an inner
 * shadow under the bezel and a slow light drifting along the top. `win` changing to a new number (> 0) sends one
 * shine across the stage and lights the bezel. It fills the free height unless `fill` is off.
 */
export function SalonStage({
  colors: tint,
  accent = SALON.gold,
  fill = true,
  win = 0,
  minHeight,
  style,
  inner,
  onLayout,
  children,
}: {
  colors: Colors;
  /** The light's colour (the top glow, the shine). */
  accent?: string;
  fill?: boolean;
  win?: number;
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
  /** The inner panel's own layout (padding, gap, alignment). */
  inner?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  return (
    <View style={[st.outer, fill && { flex: 1 }, minHeight !== undefined && { minHeight }, style]}>
      <LinearGradient colors={BEZEL} locations={[0, 0.2, 0.55, 0.85, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[st.bezel, fill && { flex: 1 }]}>
        <View style={[st.groove, fill && { flex: 1 }]}>
          <LinearGradient colors={tint} style={[st.inner, fill && { flex: 1 }, inner]} onLayout={onLayout}>
            <StageLight accent={accent} />
            {children}
            <View style={st.innerShadow} pointerEvents="none" />
          </LinearGradient>
        </View>
      </LinearGradient>
      <WinShine win={win} accent={accent} />
    </View>
  );
}

/** Behind the stage's content: the vignette, the light from the top and its slow drift. */
const StageLight = memo(function StageLight({ accent }: { accent: string }) {
  const { quiet } = useSalonFx();
  const [drift] = useState(() => new Animated.Value(0));
  const [w, setW] = useState(0);
  useEffect(() => {
    if (quiet || !w) return;
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 7000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 7000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [quiet, w, drift]);
  const glowW = Math.max(220, w * 0.9);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
      <LinearGradient colors={['rgba(255,255,255,0.13)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.38)']} locations={[0, 0.18, 0.62, 1]} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(0,0,0,0.32)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.32)']} locations={[0, 0.14, 0.86, 1]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      {w > 0 && (
        <Animated.Image
          source={GLOW}
          style={[
            st.topGlow,
            { width: glowW, height: glowW * 0.62, top: -glowW * 0.36, left: (w - glowW) / 2, tintColor: accent },
            { transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.18, w * 0.18] }) }] },
          ]}
        />
      )}
    </View>
  );
});

/** One shine across the stage and a lit bezel when `win` changes; nothing while it stays. */
function WinShine({ win, accent }: { win: number; accent: string }) {
  const { quiet } = useSalonFx();
  const [t] = useState(() => new Animated.Value(0));
  const [w, setW] = useState(0);
  const seen = useRef(win);
  useEffect(() => {
    if (win === seen.current) return;
    seen.current = win;
    if (quiet || win <= 0) return;
    t.setValue(0);
    const a = Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [win, quiet, t]);
  if (quiet) return null;
  const band = Math.max(90, w * 0.32);
  return (
    <View style={[StyleSheet.absoluteFill, st.shineBox]} pointerEvents="none" onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
      <Animated.View style={[StyleSheet.absoluteFill, st.rimLit, { borderColor: accent, opacity: t.interpolate({ inputRange: [0, 0.12, 0.7, 1], outputRange: [0, 1, 0.6, 0] }) }]} />
      {w > 0 && (
        <Animated.View style={[st.shineBand, { width: band, transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-band * 1.6, w + band * 0.6] }) }, { rotate: '16deg' }] }]}>
          <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,246,214,0.34)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
        </Animated.View>
      )}
    </View>
  );
}

/**
 * A row of cabinet bulbs across a machine (over and under its reels): two sets that take turns lighting while it
 * waits, all lit while `hot` (a win). Still with "Animasyonları azalt", plain with "Tüm efektleri kapat".
 */
export const Marquee = memo(function Marquee({ width, hot, color = SALON.goldHi }: { width: number; hot?: boolean; color?: string }) {
  const { quiet } = useSalonFx();
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (quiet) return;
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: hot ? 160 : 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: hot ? 160 : 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [quiet, hot, t]);
  const count = Math.max(5, Math.floor(width / 22));
  const a = t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] });
  const b = t.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  return (
    <View style={[st.marquee, { width }]} pointerEvents="none">
      {Array.from({ length: count }, (_, i) => (
        <Animated.View key={i} style={[st.bulb, { backgroundColor: color, boxShadow: `0 0 6px ${color}`, opacity: quiet ? 0.85 : i % 2 ? a : b }]} />
      ))}
    </View>
  );
});

/** The stage's title row: the game's name in the display face, a line under it, and the "?" on the right. */
export function StageHeader({ title, kicker, ink = SALON.win, kickerInk = SALON.dim, onInfo, right, style }: { title: string; kicker?: string; ink?: string; kickerInk?: string; onInfo: () => void; right?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[st.head, style]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[st.title, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} accessibilityRole="header">
          {title}
        </Text>
        {!!kicker && (
          <Text style={[st.kicker, { color: kickerInk }]} numberOfLines={1}>
            {kicker}
          </Text>
        )}
      </View>
      {right}
      <InfoButton onPress={onInfo} tint={SALON.glassRim} />
    </View>
  );
}

/**
 * The plate a symbol sits on: a glossy gradient, a rim lit from the top and a soft drop shadow. `tone` is the plate's
 * colour (dark navy glass by default); `lit` rings it in gold.
 */
export function SymbolPlate({ w, h, tone = PLATE, round, lit, style, children }: { w: number; h: number; tone?: Colors; round?: boolean; lit?: boolean; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const r = round ? Math.min(w, h) / 2 : Math.max(8, Math.round(Math.min(w, h) * 0.2));
  return (
    <View style={[{ width: w, height: h, borderRadius: r }, st.plate, lit && st.plateLit, style]}>
      <LinearGradient colors={tone} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: r }]} />
      <LinearGradient colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']} locations={[0, 0.45, 0.46]} style={[StyleSheet.absoluteFill, { borderRadius: r }]} />
      <View style={[StyleSheet.absoluteFill, st.plateRim, { borderRadius: r }]} />
      {children}
    </View>
  );
}
/** The default plate: deep navy glass. */
export const PLATE: Colors = ['#2A3F63', '#16253C', '#0B1528'];

/** A soft dark oval under a symbol, so it stands on its plate instead of floating. */
export function ContactShadow({ size, style }: { size: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[st.contact, { width: size * 0.62, height: size * 0.14, borderRadius: size, bottom: -size * 0.02 }, style]} pointerEvents="none" />;
}

/** Text style for an emoji or glyph standing on a plate: its own drop shadow. */
export const symbolShadow: TextStyle = { textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 5 };

/** Gold digits with a glow, for a win; tabular so they don't jump while they count. */
export const glowNumber: TextStyle = { color: SALON.win, fontFamily: fonts.display, fontVariant: ['tabular-nums'], textShadowColor: 'rgba(246,189,96,0.75)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12 };
/** Plain digits of the shell (stakes, balances). */
export const tabular: TextStyle = { fontFamily: fonts.display, fontVariant: ['tabular-nums'] };

/**
 * A number that counts up from zero to `value` (at once with "Animasyonları azalt"). It counts once, when it is
 * mounted: give it `key={value}` to count again for a new value.
 */
export function CountUp({ value, ms = 900, format = (n: number) => Math.floor(n).toLocaleString('tr-TR'), style, numberOfLines = 1 }: { value: number; ms?: number; format?: (n: number) => string; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const { still } = useSalonFx();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (still || value <= 0) return;
    const start = Date.now();
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / ms);
      setShown(rollAt(0, value, t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, ms, still]);
  return (
    <Text style={[tabular, style]} numberOfLines={numberOfLines}>
      {format(still || value <= 0 ? value : shown)}
    </Text>
  );
}

export type StatusTone = 'win' | 'err' | 'bonus' | 'jackpot';

/**
 * The stage's status plate. A win shows its label and the amount counting up in glowing gold; a refusal reads in
 * coral and smaller; anything else is a quiet line.
 */
export function StageStatus({ text, tone, amount, label, style }: { text: string; tone?: StatusTone; /** A win's amount: counted up after `label`. */ amount?: number; label?: string; style?: StyleProp<ViewStyle> }) {
  const lit = tone === 'win' || tone === 'jackpot' || tone === 'bonus';
  return (
    <View style={[st.status, lit && st.statusLit, tone === 'jackpot' && st.statusJp, style]} accessibilityLiveRegion="polite">
      {lit && <LinearGradient colors={['rgba(246,189,96,0.32)', 'rgba(246,189,96,0.06)']} style={[StyleSheet.absoluteFill, { borderRadius: SALON.controlRadius - 4 }]} />}
      {amount !== undefined && amount > 0 && (tone === 'win' || tone === 'jackpot') ? (
        <View style={st.statusRow}>
          <Text style={st.statusLabel} numberOfLines={1}>
            {label ?? 'KAZANÇ'}
          </Text>
          <CountUp key={amount} value={amount} format={(n) => `+${Math.floor(n).toLocaleString('tr-TR')}`} style={[glowNumber, st.statusAmount]} />
        </View>
      ) : (
        <Text style={[st.statusText, lit && { color: SALON.win }, tone === 'err' && st.statusErr]} numberOfLines={2}>
          {text}
        </Text>
      )}
    </View>
  );
}

/** A dark plaque for a JACKPOT fund: the name small, the fund in glowing gold digits. */
export function FundPlaque({ name, children, style }: { name: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient colors={['#FFE7B0', '#B7832E', '#FFD98A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.plaqueRim, style]}>
      <LinearGradient colors={['#3A1220', '#1A0E1E', '#0B1426']} style={st.plaque}>
        <LinearGradient colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']} style={[StyleSheet.absoluteFill, { height: '50%', borderTopLeftRadius: 999, borderTopRightRadius: 999 }]} />
        <Text style={st.plaqueName}>{name}</Text>
        {children}
      </LinearGradient>
    </LinearGradient>
  );
}
/** The digits inside a FundPlaque. */
export const plaqueValue: TextStyle = { ...glowNumber, fontSize: 26, lineHeight: 30, letterSpacing: 1 };

/** A press that sinks and springs back (native driver). */
function usePress(to: number) {
  const [scale] = useState(() => new Animated.Value(1));
  const spring = (toValue: number) => Animated.spring(scale, { toValue, speed: 40, bounciness: toValue === 1 ? 10 : 0, useNativeDriver: true }).start();
  return { scale, onPressIn: () => spring(to), onPressOut: () => spring(1) };
}

/** 0 → 1 → 0 slowly while `on`: the idle breathing of an action button. */
function useBreath(on: boolean) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!on) {
      v.setValue(0);
      return;
    }
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [on, v]);
  return v;
}

/** One turn a second while `on`. */
function useTurn(on: boolean) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!on) return;
    const a = Animated.loop(Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => {
      a.stop();
      v.setValue(0);
    };
  }, [on, v]);
  return v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
}

export type ActionLook = { ring: Colors; core: Colors; ink: string };
/** The shell's action button: a gold ring round a deep core. A game may tint the core (its own colour). */
export const ACTION: ActionLook = { ring: ['#FFF1C9', '#F6BD60', '#B7832E'], core: ['#1E3557', '#0A162C'], ink: SALON.win };

/**
 * The round action button (Çevir): a gold ring, a deep core with its icon, a halo that breathes while it waits, a
 * press that sinks and glows, and the icon turning while a round runs. `count` shows Oto's spins left instead.
 */
export function ActionButton({ onPress, disabled, busy, count, icon = 'sync', look = ACTION, size = SALON.action, label }: { onPress: () => void; disabled?: boolean; busy?: boolean; count?: number | null; icon?: keyof typeof Ionicons.glyphMap; look?: ActionLook; size?: number; label: string }) {
  const { still, quiet } = useSalonFx();
  const press = usePress(0.9);
  const breath = useBreath(!quiet && !busy && !disabled && count == null);
  const turn = useTurn(!!busy && !still && count == null);
  const core = Math.round(size * 0.8);
  return (
    <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, busy: !!busy }} hitSlop={6}>
      <Animated.View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [{ scale: press.scale }] }}>
        <Animated.Image source={GLOW} style={[st.halo, { width: size * 2, height: size * 2, tintColor: look.ring[1], opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [quiet ? 0.32 : 0.28, 0.6] }) }]} />
        <LinearGradient colors={look.ring} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[st.ring, { width: size, height: size, borderRadius: size / 2 }, disabled && !busy && { opacity: 0.6 }]}>
          <LinearGradient colors={look.core} style={[st.core, { width: core, height: core, borderRadius: core / 2 }]}>
            <LinearGradient colors={['rgba(255,255,255,0.24)', 'rgba(255,255,255,0)']} style={[st.coreGloss, { borderTopLeftRadius: core / 2, borderTopRightRadius: core / 2 }]} />
            {count != null ? (
              <Text style={[tabular, st.count, { color: look.ink }]}>{count}</Text>
            ) : (
              <Animated.View style={{ transform: [{ rotate: turn }] }}>
                <Ionicons name={icon} size={Math.round(size * 0.4)} color={look.ink} />
              </Animated.View>
            )}
          </LinearGradient>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

/**
 * The wide action button (Çevir · 1.000, Fırlat): gold, glossy, a shine passing while it waits, a press that sinks.
 * `off` greys it while it can't be pressed (nothing on the board yet).
 */
export function WideAction({ onPress, disabled, off, label, children, style }: { onPress: () => void; disabled?: boolean; off?: boolean; label: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { quiet } = useSalonFx();
  const press = usePress(0.96);
  const breath = useBreath(!quiet && !disabled && !off);
  return (
    <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} disabled={disabled} style={style} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}>
      <Animated.View style={[st.wideWrap, { transform: [{ scale: press.scale }] }]}>
        <Animated.View style={[st.wideGlow, { opacity: off ? 0 : breath.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] }) }]} />
        <LinearGradient colors={off ? ['#2A3A57', '#18253D'] : ['#FFE7B0', '#F6BD60', '#D9952F']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[st.wide, off && st.wideOff]}>
          <LinearGradient colors={['rgba(255,255,255,0.4)', 'rgba(255,255,255,0)']} style={st.wideGloss} />
          {children}
          {!off && !quiet && <WideShine />}
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}
/** Ink on the wide action button (dark on gold, light when it is off). */
export const wideInk = (off?: boolean): TextStyle => ({ color: off ? SALON.dim : SALON.goldInk });

function WideShine() {
  const [t] = useState(() => new Animated.Value(0));
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!w) return;
    const a = Animated.loop(Animated.sequence([Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.delay(2400)]));
    a.start();
    return () => a.stop();
  }, [w, t]);
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: SALON.controlRadius }]} pointerEvents="none" onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
      <Animated.View style={[st.wideShine, { transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-80, w + 40] }) }, { rotate: '18deg' }] }]}>
        <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  );
}

/** A side button of the controls (Turbo, Oto, Tekrar, Temizle): navy glass, gold when on. */
export function SideButton({ onPress, on, disabled, icon, label, sub, a11y, style, compact }: { onPress: () => void; on?: boolean; disabled?: boolean; icon?: keyof typeof Ionicons.glyphMap; label?: string; sub?: string; a11y: string; style?: StyleProp<ViewStyle>; /** Icon only, square. */ compact?: boolean }) {
  const press = usePress(0.94);
  const ink = on ? SALON.goldInk : SALON.win;
  return (
    <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} disabled={disabled} style={[compact ? null : { flex: 1 }, style]} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ selected: !!on, disabled: !!disabled }}>
      <Animated.View style={{ transform: [{ scale: press.scale }], opacity: disabled ? 0.45 : 1 }}>
        <LinearGradient colors={on ? ['#FFE7B0', '#F6BD60', '#D9952F'] : SALON.glass} style={[st.side, compact && st.sideCompact, on && st.sideOn]}>
          <LinearGradient colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']} style={st.sideGloss} />
          {icon && <Ionicons name={icon} size={compact ? 20 : 16} color={ink} />}
          {(!!label || !!sub) && (
            <View style={{ alignItems: 'center' }}>
              {!!label && <Text style={[st.sideText, { color: ink }]}>{label}</Text>}
              {!!sub && <Text style={[tabular, st.sideSub, { color: on ? SALON.goldInk : SALON.dim }]}>{sub}</Text>}
            </View>
          )}
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

/** A row of choices under the stage (atış gücü, kaçış çarpanı): navy glass chips, the chosen one gold. */
export function ChoiceChip({ on, onPress, disabled, children, label, style }: { on: boolean; onPress: () => void; disabled?: boolean; children: ReactNode; label: string; style?: StyleProp<ViewStyle> }) {
  const press = usePress(0.94);
  return (
    <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} disabled={disabled} style={style} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: !!disabled }} accessibilityLabel={label}>
      <Animated.View style={{ transform: [{ scale: press.scale }], opacity: disabled && !on ? 0.45 : 1 }}>
        <LinearGradient colors={on ? ['#FFE7B0', '#F6BD60', '#D9952F'] : SALON.glass} style={[st.choice, on && st.sideOn]}>
          {children}
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}
/** Ink of a ChoiceChip's text. */
export const choiceInk = (on: boolean): TextStyle => ({ color: on ? SALON.goldInk : SALON.ink });

const st = StyleSheet.create({
  outer: { borderRadius: SALON.stageRadius, boxShadow: '0 14px 30px rgba(0,0,0,0.55), 0 2px 0 rgba(255,231,176,0.08)' },
  bezel: { borderRadius: SALON.stageRadius, padding: 2.5 },
  groove: { borderRadius: SALON.stageRadius - 2.5, padding: 2, backgroundColor: '#05090F' },
  inner: { borderRadius: SALON.innerRadius, overflow: 'hidden', padding: 10, gap: 8 },
  innerShadow: { ...StyleSheet.absoluteFill, borderRadius: SALON.innerRadius, boxShadow: 'inset 0 2px 16px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.12)' },
  topGlow: { position: 'absolute', opacity: 0.26 },
  shineBox: { borderRadius: SALON.stageRadius, overflow: 'hidden' },
  rimLit: { borderRadius: SALON.stageRadius, borderWidth: 2.5, boxShadow: '0 0 22px rgba(246,189,96,0.85)' },
  shineBand: { position: 'absolute', top: -60, bottom: -60 },
  marquee: { height: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6 },
  bulb: { width: 7, height: 7, borderRadius: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34 },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 27, letterSpacing: 0.6, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  kicker: { fontFamily: fonts.displayBold, fontSize: 10, lineHeight: 13, letterSpacing: 1.8 },
  plate: { boxShadow: '0 4px 10px rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  plateLit: { boxShadow: '0 0 14px rgba(255,224,138,0.75), 0 4px 10px rgba(0,0,0,0.45)' },
  plateRim: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderTopColor: 'rgba(255,255,255,0.32)' },
  contact: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.2)', boxShadow: '0 0 8px 4px rgba(0,0,0,0.18)' },
  status: { alignSelf: 'stretch', minHeight: 38, borderRadius: SALON.controlRadius - 4, paddingVertical: 6, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: 'rgba(4,9,20,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  statusLit: { borderColor: 'rgba(246,189,96,0.8)', boxShadow: '0 0 14px rgba(246,189,96,0.35)' },
  statusJp: { borderColor: '#FFE7B0', boxShadow: '0 0 20px rgba(255,231,176,0.6)' },
  statusRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 10 },
  statusLabel: { color: SALON.goldHi, fontFamily: fonts.displayBold, fontSize: 13, letterSpacing: 2 },
  statusAmount: { fontSize: 22, lineHeight: 26 },
  statusText: { color: '#E8EEFA', fontFamily: fonts.displayBold, fontSize: 14, lineHeight: 19, textAlign: 'center', letterSpacing: 0.4 },
  statusErr: { color: SALON.bad, fontSize: 12.5, lineHeight: 17, letterSpacing: 0 },
  plaqueRim: { alignSelf: 'stretch', borderRadius: 999, padding: 2, boxShadow: '0 6px 16px rgba(0,0,0,0.45), 0 0 18px rgba(246,189,96,0.25)' },
  plaque: { borderRadius: 999, alignItems: 'center', paddingVertical: 4, overflow: 'hidden' },
  plaqueName: { color: SALON.goldHi, fontFamily: fonts.displayBold, fontSize: 10, lineHeight: 13, letterSpacing: 2.4 },
  halo: { position: 'absolute' },
  ring: { alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(0,0,0,0.55)' },
  core: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.6)' },
  coreGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '48%' },
  count: { fontSize: 28, lineHeight: 34 },
  wideWrap: { borderRadius: SALON.controlRadius },
  wideGlow: { ...StyleSheet.absoluteFill, borderRadius: SALON.controlRadius, boxShadow: '0 0 22px rgba(246,189,96,0.65)' },
  wide: { height: 54, borderRadius: SALON.controlRadius, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,241,201,0.9)', boxShadow: '0 6px 14px rgba(0,0,0,0.45)' },
  wideOff: { borderColor: 'rgba(255,255,255,0.12)', boxShadow: 'none' },
  wideGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '50%' },
  wideShine: { position: 'absolute', top: -20, bottom: -20, width: 46 },
  side: { height: SALON.control, borderRadius: SALON.controlRadius, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: SALON.glassRim, overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.35)' },
  sideCompact: { width: SALON.control, paddingHorizontal: 0 },
  sideOn: { borderColor: '#FFF1C9', boxShadow: '0 0 14px rgba(246,189,96,0.55)' },
  sideGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '50%' },
  sideText: { fontFamily: fonts.displayBold, fontSize: 14, lineHeight: 18, letterSpacing: 0.8 },
  sideSub: { fontSize: 10, lineHeight: 12 },
  choice: { height: 40, borderRadius: SALON.controlRadius - 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: SALON.glassRim, overflow: 'hidden' },
});

