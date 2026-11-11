// What Renk Kartları, XOX and Dört Taş draw alike (components/games/room/cards, xox, four): a player's face with the
// turn's clock running round it, the table's buttons, the card over the board when a hand ends, and the practice
// table that plays the other seats on this phone. Decoration and timing only: the rules are in lib/room-games.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { Gloss, PressableScale } from '@/components/fx/surface';
import { Photo } from '@/components/photo';
import { Text } from '@/components/text';
import { playSfx } from '@/lib/game-sound';
import { TURN_MS } from '@/lib/room-games/seam';
import { colors, fonts, semantic } from '@/theme';

/** Someone at the table, as the screens draw them. */
export type Seat = { id: string; name: string; avatar: string };
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
export const rnd = (n: number) => Math.floor(Math.random() * n);

/** Seconds left until `endsAt` (a clock time in ms), ticking; null with no clock. */
export function useSecondsLeft(endsAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
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

/** The clock's colour as it runs out: the player's own, then gold, then coral for the last five seconds. */
export const clockColor = (left: number | null, own: string) => (left === null || left > 10 ? own : left > 5 ? semantic.money : semantic.social);

/**
 * A player's face. On their turn a ring stands round it, running out with the turn's time when there is a clock,
 * and the seconds show once few are left. `badge` sits on the lower right corner (a mark, a card count).
 */
export function SeatFace({
  seat,
  size,
  color,
  active,
  endsAt,
  winner,
  dim,
  badge,
}: {
  seat: Seat;
  size: number;
  color: string;
  active: boolean;
  endsAt: number | null;
  winner?: boolean;
  dim?: boolean;
  badge?: ReactNode;
}) {
  const left = useSecondsLeft(active ? endsAt : null);
  const pad = 4;
  return (
    <View style={{ width: size, height: size, opacity: dim ? 0.55 : 1 }}>
      <Photo uri={seat.avatar} kind="face" style={{ position: 'absolute', left: pad, top: pad, width: size - pad * 2, height: size - pad * 2, borderRadius: size / 2, backgroundColor: colors.cardAlt }} />
      {active ? <TurnRing size={size} color={clockColor(left, color)} endsAt={endsAt} /> : <View style={[k.idle, { width: size, height: size, borderRadius: size / 2 }]} />}
      {active && left !== null && left <= 10 && (
        <View style={[k.secs, { backgroundColor: clockColor(left, color) }]}>
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
 * The card over the board when a hand ends: `tone` 'win' (mine: confetti and a trophy), 'lose' (someone else's) or
 * 'draw'. `children`: what to do next ("Tekrar oyna").
 */
export function EndCard({ tone, title, sub, size, still, children }: { tone: 'win' | 'lose' | 'draw'; title: string; sub?: string; size: number; still: boolean; children?: ReactNode }) {
  const [t] = useState(() => new Animated.Value(still ? 1 : 0));
  const [fly] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (still) return;
    const a = Animated.parallel([
      Animated.spring(t, { toValue: 1, speed: 10, bounciness: 12, useNativeDriver: true }),
      Animated.timing(fly, { toValue: 1, duration: 1600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
    a.start();
    return () => a.stop();
  }, [still, t, fly]);
  const edge = tone === 'win' ? semantic.money : tone === 'draw' ? colors.textDim : semantic.action;
  return (
    <View style={[StyleSheet.absoluteFill, k.veil]} accessibilityLiveRegion="polite">
      {!still &&
        tone === 'win' &&
        CONFETTI.map((f, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: f.w,
              height: f.w * 1.6,
              borderRadius: 1.5,
              backgroundColor: CONFETTI_COLORS[f.color],
              opacity: fly.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [0, f.dx * size] }) },
                { translateY: fly.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, f.dy * size, f.dy * size + size * 0.22] }) },
                { rotate: fly.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${f.turn}deg`] }) },
              ],
            }}
          />
        ))}
      <Animated.View style={{ opacity: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }), transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
        <LinearGradient colors={['#1C2E4A', '#101C33']} style={[k.endCard, { borderColor: edge, boxShadow: `0 0 26px ${edge}` }]}>
          <LinearGradient colors={tone === 'win' ? ['#FFE08A', '#F2A93B'] : tone === 'draw' ? ['#B8C4DE', '#7C8BAD'] : ['#6FF1F5', '#0FB8BE']} style={k.cup}>
            <Ionicons name={tone === 'win' ? 'trophy' : tone === 'draw' ? 'hand-left' : 'ribbon'} size={26} color={semantic.moneyInk} />
          </LinearGradient>
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
 * A practice table on this phone. I sit on the first seat; the others play by themselves a moment after their turn
 * comes (`bot`), and my own turn has the table's clock: when it runs out the table does what the room's would
 * (`ranOut`). `table` null: no game yet. Returns the table, a way to change it and when my turn ends.
 */
export function usePracticeTable<T extends Playing>(play: { bot: (t: T) => T; ranOut: (t: T) => T; think?: [number, number] }) {
  // `step` counts the changes: the turn alone can stay where it was (a card that skips the only other player).
  const [state, setState] = useState<{ table: T | null; step: number }>({ table: null, step: 0 });
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const fns = useRef(play);
  useEffect(() => {
    fns.current = play;
  });
  const set = useCallback((next: T | null | ((t: T) => T)) => setState((s) => ({ table: typeof next === 'function' ? (s.table ? next(s.table) : s.table) : next, step: s.step + 1 })), []);
  const { table, step } = state;
  const playing = table?.status === 'playing';
  const turn = table?.turn;
  useEffect(() => {
    if (!playing) return setEndsAt(null);
    if (turn !== 0) {
      setEndsAt(null);
      const [min, more] = fns.current.think ?? [750, 650];
      const t = setTimeout(() => set((x) => fns.current.bot(x)), min + rnd(more));
      return () => clearTimeout(t);
    }
    setEndsAt(Date.now() + TURN_MS);
    const t = setTimeout(() => set((x) => fns.current.ranOut(x)), TURN_MS);
    return () => clearTimeout(t);
  }, [playing, turn, step, set]);
  return { table, set, endsAt };
}

const k = StyleSheet.create({
  idle: { position: 'absolute', left: 0, top: 0, borderWidth: 2, borderColor: 'rgba(255,255,255,0.10)' },
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
  endCard: { alignItems: 'center', gap: 4, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 14, borderRadius: 22, borderWidth: 1.5, minWidth: 200 },
  cup: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  endTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 21, lineHeight: 27, textAlign: 'center' },
  endSub: { color: colors.textDim, fontSize: 12, lineHeight: 16, textAlign: 'center' },
  endActions: { alignSelf: 'stretch', marginTop: 8, gap: 6 },
});
