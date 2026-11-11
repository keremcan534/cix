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
        <View style={[k.plate, right && k.plateRight]}>
          <View style={k.free}>
            <Ionicons name="add" size={20} color={colors.textDim} />
          </View>
          <Text style={k.plateHint}>Boş koltuk</Text>
        </View>
      );
    const active = playing && turn === seat;
    return (
      <View style={[k.plate, right && k.plateRight, active && { borderColor: tints[seat], backgroundColor: 'rgba(255,255,255,0.06)' }]} accessibilityLabel={`${seat === me ? 'Sen' : who.name}, ${wins[seat] ?? 0} el${active ? ', sıra onda' : ''}`}>
        <SeatFace seat={who} size={48} color={tints[seat]} active={active} endsAt={endsAt} winner={!playing && winner === seat} badge={token(seat)} />
        <View style={{ flex: 1, alignItems: right ? 'flex-end' : 'flex-start' }}>
          <Text style={[k.plateName, active && { color: colors.text }]} numberOfLines={1}>
            {seat === me ? 'Sen' : firstName(who.name)}
          </Text>
          <Text style={[k.plateHint, active && { color: tints[seat] }]} numberOfLines={1}>
            {!playing ? (winner === seat ? 'Kazandı' : ' ') : active ? (seat === me ? 'Sıra sende' : 'Oynuyor…') : 'Bekliyor'}
          </Text>
        </View>
      </View>
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
export function EndCard({ tone, title, sub, size, still, inline, children }: { tone: 'win' | 'lose' | 'draw'; title: string; sub?: string; size: number; still: boolean; inline?: boolean; children?: ReactNode }) {
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
  const edge = tone === 'win' ? semantic.money : tone === 'draw' ? colors.textDim : semantic.action;
  const confetti =
    !still && tone === 'win'
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
  const cup = (
    <LinearGradient colors={tone === 'win' ? ['#FFE08A', '#F2A93B'] : tone === 'draw' ? ['#B8C4DE', '#7C8BAD'] : ['#6FF1F5', '#0FB8BE']} style={[k.cup, inline && k.cupSmall]}>
      <Ionicons name={tone === 'win' ? 'trophy' : tone === 'draw' ? 'hand-left' : 'ribbon'} size={inline ? 22 : 26} color={semantic.moneyInk} />
    </LinearGradient>
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
          <LinearGradient colors={['#1C2E4A', '#101C33']} style={[k.endRow, { borderColor: edge, boxShadow: `0 0 16px ${edge}66` }]}>
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
  endRow: { gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5 },
  endHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  endTitleInline: { color: colors.text, fontFamily: fonts.display, fontSize: 18, lineHeight: 24 },
  cupSmall: { width: 42, height: 42, borderRadius: 21, marginBottom: 0 },
  endSub: { color: colors.textDim, fontSize: 12, lineHeight: 16, textAlign: 'center' },
  endActions: { alignSelf: 'stretch', marginTop: 8, gap: 6 },
  duel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  plate: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 60, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.07)', backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 7, paddingVertical: 5 },
  plateRight: { flexDirection: 'row-reverse' },
  plateName: { color: colors.textDim, fontSize: 14, lineHeight: 19, fontWeight: '800' },
  plateHint: { color: colors.textDim, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  free: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  score: { alignItems: 'center', minWidth: 52 },
  scoreText: { color: colors.text, fontFamily: fonts.display, fontSize: 20, lineHeight: 26 },
  scoreLabel: { color: colors.textDim, fontSize: 9, lineHeight: 12, fontWeight: '800', letterSpacing: 1 },
});
