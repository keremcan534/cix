// What Renk Kartları, XOX and Dört Taş draw alike (components/games/room/cards, xox, four): a player's face with the
// turn's clock running round it, the table's buttons, the card over the board when a hand ends, and the practice
// table that plays the other seats on this phone. Decoration and timing only: the rules are in lib/room-games.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

import { EdgeLight, Gloss, PressableScale, Shine } from '@/components/fx/surface';
import { Photo } from '@/components/photo';
import { Text } from '@/components/text';
import { playSfx } from '@/lib/game-sound';
import { TURN_MS } from '@/lib/room-games/seam';
import { useSettings } from '@/store';
import { colors, fonts, semantic } from '@/theme';

/** Someone at the table, as the screens draw them. */
export type Seat = { id: string; name: string; avatar: string };
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
export const rnd = (n: number) => Math.floor(Math.random() * n);

/**
 * How much the table moves. `still` ("Animasyonları azalt"): pieces change place at once and nothing loops. `fx`
 * off as well with "Tüm efektleri kapat": no confetti, sparks, breathing glows or light sweeps; a move still plays.
 */
export function useTableFx() {
  const { reduceMotion, effectsOff } = useSettings();
  return { still: reduceMotion, fx: !reduceMotion && !effectsOff };
}

/**
 * The height a board may take in the game's sheet (components/games/game-panel: it starts 22% down the screen) after
 * the sheet's header and the voice strip and `chrome`, the game's own rows round the board. In a full screen there
 * is more room than this, so it holds there too.
 */
export function useBoardRoom(chrome: number) {
  const { height } = useWindowDimensions();
  return Math.max(220, Math.floor(height * 0.78 - SHEET_CHROME - chrome));
}
const SHEET_CHROME = 128;

/** `#RRGGBB` at `a` opacity (other colours as they are). */
export const alpha = (hex: string, a: number) => (/^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}` : hex);

/** A value that breathes between `low` and 1 while `on`, and stands at 1 (on) or 0 (off) otherwise. */
export function useBreath(on: boolean, animate: boolean, ms = 750, low = 0.3) {
  const [v] = useState(() => new Animated.Value(on ? 1 : 0));
  useEffect(() => {
    if (!on || !animate) return void v.setValue(on ? 1 : 0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: low, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [on, animate, ms, low, v]);
  return v;
}

/** What a board is made of: its rim from light to dark, its surface, the hairline round it. */
export type BezelTone = { rim: readonly [string, string, ...string[]]; face: readonly [string, string, ...string[]]; edge: string };
export const BEZEL = {
  /** Night-blue lacquer: Ludo, XOX. */
  night: { rim: ['#4A6A9C', '#22385E', '#101D36'], face: ['#16294B', '#0D1A33', '#091327'], edge: 'rgba(255,255,255,0.2)' },
  /** Petrol felt: Renk Kartları. */
  felt: { rim: ['#3C6E86', '#1A3D52', '#0C2131'], face: ['#16485F', '#0E3046', '#0A2033'], edge: 'rgba(255,255,255,0.18)' },
  /** Blue plastic: Dört Taş. */
  plastic: { rim: ['#5A9BEA', '#2A62B0', '#173E7A'], face: ['#0A1630', '#081226'], edge: 'rgba(255,255,255,0.3)' },
} satisfies Record<string, BezelTone>;

// A few faint diagonal bands: the surface's grain, made of gradients and drawn once.
const GRAIN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const Grain = memo(function Grain({ strength }: { strength: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      {GRAIN.map((i) => (
        <LinearGradient
          key={i}
          colors={['rgba(255,255,255,0)', `rgba(255,255,255,${i % 3 === 0 ? strength * 1.6 : strength})`, 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: 'absolute', top: '-40%', bottom: '-40%', left: `${i * 11 - 6}%`, width: i % 2 ? '3%' : '6%', transform: [{ rotate: '28deg' }] }}
        />
      ))}
    </View>
  );
});

/**
 * A board in its bezel: a rim lit from above round a surface sunk into it (an inner shadow, soft light from the
 * top, a faint grain). `children` lie on the surface, `inset` dp in from the outside. `over`: the light and the
 * inner shadow go over the children too (Dört Taş: its face is drawn as a child). `glow`: a coloured light round it.
 * `surface`: a delivered picture of the surface (components/games/room/table-art) instead of the gradient.
 */
export function Bezel({ width, height, radius, inset, tone = BEZEL.night, glow, over, surface, children }: { width: number; height: number; radius: number; inset: number; tone?: BezelTone; glow?: string | null; over?: boolean; surface?: ReactNode; children?: ReactNode }) {
  const inner = Math.max(4, radius - inset * 0.7);
  const light = <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']} style={[k.faceLight, { borderTopLeftRadius: inner, borderTopRightRadius: inner }]} />;
  const sunk = <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: inner, boxShadow: 'inset 0 3px 10px rgba(0,0,0,0.7), inset 0 -1px 2px rgba(255,255,255,0.10)' }]} />;
  return (
    <View style={{ width, height, borderRadius: radius, boxShadow: `0 14px 28px rgba(0,0,0,0.55)${glow ? `, 0 0 22px ${alpha(glow, 0.45)}` : ''}` }}>
      <LinearGradient colors={tone.rim} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1, borderColor: glow ?? tone.edge }]} />
      {/* The rim's upper edge catches the light. */}
      <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0)']} style={{ position: 'absolute', left: 1, right: 1, top: 1, height: Math.max(inset * 2, 10), borderTopLeftRadius: radius, borderTopRightRadius: radius }} />
      <View style={{ position: 'absolute', left: inset, top: inset, right: inset, bottom: inset, borderRadius: inner, overflow: 'hidden' }}>
        {surface ?? (
          <>
            <LinearGradient colors={tone.face} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={StyleSheet.absoluteFill} />
            <Grain strength={0.022} />
          </>
        )}
        {!over && light}
        {!over && sunk}
        {children}
        {over && light}
        {over && sunk}
      </View>
    </View>
  );
}

/** Seconds left until `endsAt` (a clock time in ms), ticking; null with no clock. */
export function useSecondsLeft(endsAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => setNow(Date.now());
    // At once too: the clock read when nothing was running is an old one.
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 500);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [endsAt]);
  return endsAt === null ? null : Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** Half of a ring, turning about the ring's centre behind a window that shows one side: together two of them draw an arc of any length. */
function HalfRing({ size, width, color, side, turn }: { size: number; width: number; color: string; side: 'left' | 'right'; turn: Animated.AnimatedInterpolation<string> }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: side === 'right' ? size / 2 : 0, width: size / 2, height: size, overflow: 'hidden' }}>
      <Animated.View style={{ position: 'absolute', top: 0, left: side === 'right' ? -size / 2 : 0, width: size, height: size, transform: [{ rotate: turn }] }}>
        <View style={{ width: size / 2, height: size, overflow: 'hidden' }}>
          <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: width, borderColor: color }} />
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * The turn's clock as a ring that empties clockwise from the top. `endsAt` null: no clock, the ring just stands full
 * (a practice opponent thinking). It is information, so it runs with "Animasyonları azalt" too.
 */
export function TurnRing({ size, width = 3, color, endsAt, total = TURN_MS }: { size: number; width?: number; color: string; endsAt: number | null; total?: number }) {
  const [gone] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (endsAt === null) return void gone.setValue(0);
    const left = Math.max(0, endsAt - Date.now());
    gone.setValue(1 - Math.min(1, left / total));
    const a = Animated.timing(gone, { toValue: 1, duration: left, easing: Easing.linear, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [endsAt, total, gone]);
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }} pointerEvents="none">
      <View style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, borderRadius: size / 2, borderWidth: width, borderColor: 'rgba(255,255,255,0.12)' }} />
      <HalfRing size={size} width={width} color={color} side="right" turn={gone.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['180deg', '360deg', '360deg'] })} />
      <HalfRing size={size} width={width} color={color} side="left" turn={gone.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '0deg', '180deg'] })} />
    </View>
  );
}

/** A ring drawn clockwise from the top as `t` goes 0 → 1 (XOX's O). */
export function DrawnRing({ size, width, color, t }: { size: number; width: number; color: string; t: Animated.Value }) {
  return (
    <View style={{ width: size, height: size }}>
      <HalfRing size={size} width={width} color={color} side="right" turn={t.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '180deg', '180deg'] })} />
      <HalfRing size={size} width={width} color={color} side="left" turn={t.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['180deg', '180deg', '360deg'] })} />
    </View>
  );
}

/** The clock's colour as it runs out: the player's own, then gold, then coral for the last five seconds. */
export const clockColor = (left: number | null, own: string) => (left === null || left > 10 ? own : left > 5 ? semantic.money : semantic.social);

/**
 * A player's face. On their turn a glowing ring breathes round it and the turn's clock runs out on it when there is
 * a clock, the seconds showing once few are left. `tinted`: off turn the ring keeps the player's colour, faintly
 * (the colour says whose mark, disc or corner it is). `badge` sits on the lower right corner (a mark, a card count).
 */
export function SeatFace({
  seat,
  size,
  color,
  active,
  endsAt,
  total,
  winner,
  dim,
  tinted,
  badge,
}: {
  seat: Seat;
  size: number;
  color: string;
  active: boolean;
  endsAt: number | null;
  /** How long a turn is (ms). */
  total?: number;
  winner?: boolean;
  dim?: boolean;
  tinted?: boolean;
  badge?: ReactNode;
}) {
  const { fx } = useTableFx();
  const left = useSecondsLeft(active ? endsAt : null);
  const glow = useBreath(active, fx);
  const ring = clockColor(left, color);
  const pad = 4;
  const face = size - pad * 2;
  return (
    <View style={{ width: size, height: size, opacity: dim ? 0.55 : 1 }}>
      {active && <Animated.View pointerEvents="none" style={[k.halo, { borderRadius: size, borderColor: alpha(ring, 0.55), boxShadow: `0 0 ${Math.round(size * 0.32)}px ${ring}`, opacity: glow }]} />}
      <View style={[k.faceRim, { left: pad, top: pad, width: face, height: face, borderRadius: face / 2 }]}>
        <Photo uri={seat.avatar} kind="face" style={{ width: face, height: face, borderRadius: face / 2, backgroundColor: colors.cardAlt }} />
        <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.2)', 'rgba(255,255,255,0)']} style={k.faceLight} />
      </View>
      {active ? <TurnRing size={size} color={ring} endsAt={endsAt} total={total} /> : <View style={[k.idle, { width: size, height: size, borderRadius: size / 2 }, tinted && { borderColor: alpha(color, 0.55) }]} />}
      {active && left !== null && left <= 10 && (
        <View style={[k.secs, { backgroundColor: ring }]}>
          <Text style={k.secsText}>{left}</Text>
        </View>
      )}
      {winner && (
        <View style={k.crown}>
          <Ionicons name="trophy" size={11} color={semantic.moneyInk} />
        </View>
      )}
      {badge ? <View style={k.badge}>{badge}</View> : null}
    </View>
  );
}

/** A player's plate: glass that takes their colour and lights up on their turn (DuelHeader, my own row at the cards). */
export function Plate({ active, tint, style, children, label }: { active: boolean; tint: string; style?: StyleProp<ViewStyle>; children: ReactNode; label?: string }) {
  return (
    <LinearGradient
      colors={active ? [alpha(tint, 0.26), alpha(tint, 0.06)] : ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.025)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.4, y: 1 }}
      style={[k.plate, style, active && { borderColor: alpha(tint, 0.85), boxShadow: `0 0 16px ${alpha(tint, 0.35)}` }]}
      accessibilityLabel={label}
    >
      <EdgeLight inset={18} strength={active ? 0.3 : 0.16} />
      {children}
    </LinearGradient>
  );
}

/**
 * The line under a board that says what is going on. `lit`: it is my turn, so it stands out in a pill of `tint`
 * with a dot that breathes.
 */
export function StatusLine({ text, lit, tint = semantic.action }: { text: string; lit: boolean; tint?: string }) {
  const { fx } = useTableFx();
  const beat = useBreath(lit, fx, 600, 0.25);
  return (
    <View style={[k.status, lit && { backgroundColor: alpha(tint, 0.14), borderColor: alpha(tint, 0.45) }]} accessibilityLiveRegion="polite">
      {lit && <Animated.View style={[k.statusDot, { backgroundColor: tint, boxShadow: `0 0 8px ${tint}`, opacity: beat }]} />}
      <Text style={[k.statusText, lit && { color: colors.text }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/**
 * The two players of a game for two, face to face over the score: each with what they play (`token`: a mark, a
 * disc), the one on turn lit with the turn's clock. A seat nobody has taken yet shows as free.
 */
export function DuelHeader({
  seats,
  me,
  turn,
  playing,
  endsAt,
  wins,
  winner,
  tints,
  token,
}: {
  seats: Seat[];
  me: number;
  turn: number;
  playing: boolean;
  endsAt: number | null;
  wins: number[];
  winner: number | null;
  /** Each seat's colour. */
  tints: string[];
  token: (seat: number) => ReactNode;
}) {
  const plate = (seat: number) => {
    const who = seats[seat];
    const right = seat === 1;
    if (!who)
      return (
        <Plate active={false} tint={tints[seat]} style={[k.plateFill, right && k.plateRight]}>
          <View style={k.free}>
            <Ionicons name="add" size={20} color={colors.textDim} />
          </View>
          <Text style={k.plateHint}>Boş koltuk</Text>
        </Plate>
      );
    const active = playing && turn === seat;
    return (
      <Plate active={active} tint={tints[seat]} style={[k.plateFill, right && k.plateRight]} label={`${seat === me ? 'Sen' : who.name}, ${wins[seat] ?? 0} el${active ? ', sıra onda' : ''}`}>
        <SeatFace seat={who} size={48} color={tints[seat]} active={active} endsAt={endsAt} winner={!playing && winner === seat} tinted badge={token(seat)} />
        <View style={{ flex: 1, alignItems: right ? 'flex-end' : 'flex-start' }}>
          <Text style={[k.plateName, active && { color: colors.text }]} numberOfLines={1}>
            {seat === me ? 'Sen' : firstName(who.name)}
          </Text>
          <Text style={[k.plateHint, active && { color: tints[seat] }]} numberOfLines={1}>
            {!playing ? (winner === seat ? 'Kazandı' : ' ') : active ? (seat === me ? 'Sıra sende' : 'Oynuyor…') : 'Bekliyor'}
          </Text>
        </View>
      </Plate>
    );
  };
  return (
    <View style={k.duel}>
      {plate(0)}
      <View style={k.score} accessibilityLabel={`Skor ${wins[0] ?? 0} - ${wins[1] ?? 0}`}>
        <Text style={k.scoreText}>
          {wins[0] ?? 0} : {wins[1] ?? 0}
        </Text>
        <Text style={k.scoreLabel}>SKOR</Text>
      </View>
      {plate(1)}
    </View>
  );
}

/** The table's main button, and its quiet one. */
export function ActionButton({ label, onPress, disabled, ghost, icon, small }: { label: string; onPress: () => void; disabled?: boolean; ghost?: boolean; icon?: keyof typeof Ionicons.glyphMap; small?: boolean }) {
  if (ghost)
    return (
      <Pressable onPress={onPress} disabled={disabled} style={[k.ghost, small && k.small, disabled && { opacity: 0.45 }]} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}>
        {icon && <Ionicons name={icon} size={16} color={colors.text} />}
        <Text style={k.ghostText}>{label}</Text>
      </Pressable>
    );
  return (
    <PressableScale onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} style={disabled ? { opacity: 0.45 } : undefined}>
      <LinearGradient colors={['#6FF1F5', '#0FB8BE']} style={[k.action, small && k.small]}>
        <Gloss strength={0.22} />
        {icon && <Ionicons name={icon} size={17} color={semantic.actionInk} />}
        <Text style={k.actionText}>{label}</Text>
      </LinearGradient>
    </PressableScale>
  );
}

// Where each scrap of confetti flies, fixed once: a render never draws random numbers.
const CONFETTI = Array.from({ length: 28 }, (_, i) => {
  const a = (i * 137.5 * Math.PI) / 180;
  const far = 0.3 + ((i * 53) % 23) / 55;
  return { dx: Math.cos(a) * far, dy: Math.sin(a) * far * 0.8 - 0.15, color: i % 4, turn: (i % 2 ? 1 : -1) * (180 + ((i * 71) % 240)), w: 5 + (i % 3) * 2 };
});
const CONFETTI_COLORS = ['#13D9DF', '#FF6576', '#F6BD60', '#22C55E'];

/**
 * The card that says how a hand ended: `tone` 'win' (mine: confetti and a trophy), 'lose' (someone else's) or
 * 'draw'. Over the table by default; `inline` puts it in the flow under a board whose last move should stay in
 * sight (the winning line), a moment after that move. `children`: what to do next ("Tekrar oyna").
 */
export function EndCard({ tone, title, sub, size, still, inline, trophy, children }: { tone: 'win' | 'lose' | 'draw'; title: string; sub?: string; size: number; still: boolean; inline?: boolean; /** A drawn trophy instead of the icon (components/games/room/table-art). */ trophy?: ReactNode; children?: ReactNode }) {
  const [t] = useState(() => new Animated.Value(still ? 1 : 0));
  const [fly] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (still) return;
    const a = Animated.sequence([
      Animated.delay(inline ? 450 : 0),
      Animated.parallel([
        Animated.spring(t, { toValue: 1, speed: 10, bounciness: 12, useNativeDriver: true }),
        Animated.timing(fly, { toValue: 1, duration: 1600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]);
    a.start();
    return () => a.stop();
  }, [still, inline, t, fly]);
  const { fx } = useTableFx();
  // The light turning behind the cup of a hand I won.
  const [turn] = useState(() => new Animated.Value(0));
  const rays = fx && tone === 'win';
  useEffect(() => {
    if (!rays) return;
    const a = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [rays, turn]);
  const edge = tone === 'win' ? semantic.money : tone === 'draw' ? colors.textDim : semantic.action;
  const confetti =
    !still && fx && tone === 'win'
      ? CONFETTI.map((f, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: f.w,
              height: f.w * 1.6,
              borderRadius: 1.5,
              backgroundColor: CONFETTI_COLORS[f.color],
              opacity: fly.interpolate({ inputRange: [0, 0.01, 0.75, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [0, f.dx * size] }) },
                { translateY: fly.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, f.dy * size, f.dy * size + size * 0.22] }) },
                { rotate: fly.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${f.turn}deg`] }) },
              ],
            }}
          />
        ))
      : null;
  const cupSize = inline ? 42 : 50;
  const cup = (
    <View style={{ width: cupSize, height: cupSize, alignItems: 'center', justifyContent: 'center', marginBottom: inline ? 0 : 2 }}>
      {rays && (
        <Animated.View pointerEvents="none" style={[k.rays, { width: cupSize * 2.4, height: cupSize * 2.4, transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
          {[0, 45, 90, 135].map((r) => (
            <LinearGradient key={r} colors={['rgba(255,224,138,0)', 'rgba(255,224,138,0.5)', 'rgba(255,224,138,0)']} style={[k.ray, { transform: [{ rotate: `${r}deg` }] }]} />
          ))}
        </Animated.View>
      )}
      {tone === 'win' && trophy ? (
        trophy
      ) : (
        <LinearGradient colors={tone === 'win' ? ['#FFE08A', '#F2A93B'] : tone === 'draw' ? ['#B8C4DE', '#7C8BAD'] : ['#6FF1F5', '#0FB8BE']} style={[k.cup, { width: cupSize, height: cupSize, borderRadius: cupSize / 2 }]}>
          <Gloss strength={0.35} />
          <Ionicons name={tone === 'win' ? 'trophy' : tone === 'draw' ? 'hand-left' : 'ribbon'} size={inline ? 22 : 26} color={semantic.moneyInk} />
        </LinearGradient>
      )}
    </View>
  );
  const pop = { opacity: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }), transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] };
  if (inline)
    return (
      <View accessibilityLiveRegion="polite">
        {/* The confetti bursts over the board above. */}
        <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: -size * 0.45, zIndex: 5 }}>
          {confetti}
        </View>
        <Animated.View style={pop}>
          <LinearGradient colors={['#1C2E4A', '#101C33']} style={[k.endRow, { borderColor: edge, boxShadow: `0 0 16px ${alpha(edge, 0.4)}` }]}>
            {rays && <Shine radius={20} every={2400} />}
            <EdgeLight inset={24} strength={0.22} />
            <View style={k.endHead}>
              {cup}
              <View style={{ flex: 1 }}>
                <Text style={k.endTitleInline}>{title}</Text>
                {sub ? <Text style={[k.endSub, { textAlign: 'left' }]}>{sub}</Text> : null}
              </View>
            </View>
            {children ? <View style={[k.endActions, { marginTop: 2 }]}>{children}</View> : null}
          </LinearGradient>
        </Animated.View>
      </View>
    );
  return (
    <View style={[StyleSheet.absoluteFill, k.veil]} accessibilityLiveRegion="polite">
      {confetti}
      <Animated.View style={pop}>
        <LinearGradient colors={['#1C2E4A', '#101C33']} style={[k.endCard, { borderColor: edge, boxShadow: `0 0 26px ${edge}` }]}>
          {rays && <Shine radius={22} every={2400} />}
          <EdgeLight inset={24} strength={0.22} />
          {cup}
          <Text style={k.endTitle}>{title}</Text>
          {sub ? <Text style={k.endSub}>{sub}</Text> : null}
          {children ? <View style={k.endActions}>{children}</View> : null}
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

/** The sound of a hand's end, once: mine, someone else's, nobody's. */
export function endSound(tone: 'win' | 'lose' | 'draw') {
  playSfx(tone === 'win' ? 'fanfare' : tone === 'lose' ? 'lose' : 'turn', tone === 'draw' ? 0.6 : 1);
}

type Playing = { status: 'waiting' | 'playing' | 'over'; turn: number };
/**
 * A practice table on this phone, starting as `first` makes it. I sit on the first seat; the others play by
 * themselves a moment after their turn comes (`bot`), and my own turn has the table's clock: when it runs out the
 * table does what the room's would (`ranOut`). Returns the table, a way to change it and when my turn ends.
 */
export function usePracticeTable<T extends Playing>(first: () => T, play: { bot: (t: T) => T; ranOut: (t: T) => T; think?: [number, number] }) {
  // `step` counts the changes (the turn alone can stay where it was: a card that skips the only other player) and
  // `since` is when the last one was made: my turn's clock starts there.
  const [state, setState] = useState(() => ({ table: first(), step: 0, since: Date.now() }));
  const fns = useRef(play);
  useEffect(() => {
    fns.current = play;
  });
  const set = useCallback((next: T | ((t: T) => T)) => setState((s) => ({ table: typeof next === 'function' ? next(s.table) : next, step: s.step + 1, since: Date.now() })), []);
  const { table, step, since } = state;
  const playing = table.status === 'playing';
  const mine = table.turn === 0;
  useEffect(() => {
    if (!playing) return;
    const [min, more] = fns.current.think ?? [750, 650];
    const t = mine ? setTimeout(() => set((x) => fns.current.ranOut(x)), Math.max(0, since + TURN_MS - Date.now())) : setTimeout(() => set((x) => fns.current.bot(x)), min + rnd(more));
    return () => clearTimeout(t);
  }, [playing, mine, step, since, set]);
  return { table, set, endsAt: playing && mine ? since + TURN_MS : null };
}

const k = StyleSheet.create({
  idle: { position: 'absolute', left: 0, top: 0, borderWidth: 2, borderColor: 'rgba(255,255,255,0.10)' },
  halo: { position: 'absolute', left: -3, top: -3, right: -3, bottom: -3, borderWidth: 2 },
  faceRim: { position: 'absolute', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.5)' },
  faceLight: { position: 'absolute', left: 0, right: 0, top: 0, height: '48%' },
  status: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 30, maxWidth: '100%', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: 'transparent' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { flexShrink: 1, color: colors.textDim, fontSize: 13, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
  rays: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ray: { position: 'absolute', width: '100%', height: 10, borderRadius: 5 },
  secs: { position: 'absolute', left: -4, top: -4, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: '#0A1426' },
  secsText: { color: '#04161D', fontSize: 11, lineHeight: 14, fontWeight: '900' },
  crown: { position: 'absolute', right: -3, top: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: semantic.money, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#0A1426' },
  badge: { position: 'absolute', right: -6, bottom: -4 },
  action: { minHeight: 48, borderRadius: 999, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 18, boxShadow: '0 4px 14px rgba(19,217,223,0.4)' },
  actionText: { color: semantic.actionInk, fontFamily: fonts.displayBold, fontSize: 16, lineHeight: 22 },
  ghost: { minHeight: 44, borderRadius: 999, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt, paddingHorizontal: 16 },
  ghostText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  small: { minHeight: 40, paddingHorizontal: 14 },
  veil: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,15,30,0.6)', borderRadius: 18, zIndex: 30 },
  endCard: { alignItems: 'center', gap: 4, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 14, borderRadius: 22, borderWidth: 1.5, minWidth: 210, overflow: 'hidden' },
  cup: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', boxShadow: '0 4px 12px rgba(0,0,0,0.45)' },
  endTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 21, lineHeight: 27, textAlign: 'center' },
  endRow: { gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5, overflow: 'hidden' },
  endHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  endTitleInline: { color: colors.text, fontFamily: fonts.display, fontSize: 18, lineHeight: 24 },
  endSub: { color: colors.textDim, fontSize: 12, lineHeight: 16, textAlign: 'center' },
  endActions: { alignSelf: 'stretch', marginTop: 8, gap: 6 },
  duel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  plate: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 60, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 7, paddingVertical: 5, overflow: 'hidden' },
  plateFill: { flex: 1 },
  plateRight: { flexDirection: 'row-reverse' },
  plateName: { color: colors.textDim, fontSize: 14, lineHeight: 19, fontWeight: '800' },
  plateHint: { color: colors.textDim, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  free: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  score: { alignItems: 'center', minWidth: 52 },
  scoreText: { color: colors.text, fontFamily: fonts.display, fontSize: 20, lineHeight: 26 },
  scoreLabel: { color: colors.textDim, fontSize: 9, lineHeight: 12, fontWeight: '800', letterSpacing: 1 },
});
