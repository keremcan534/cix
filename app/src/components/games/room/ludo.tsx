// Ludo as it is played on the screen: the board (components/games/room/ludo-board) with the players at its corners
// and the die between them. A new state isn't just shown: what made it is played first (the die tumbles, the token
// walks its squares, a captured token flies back to its base), and only then is the next tap taken.
//
// One stage for both ways to play. LudoPractice runs the app's own copy of the rules (lib/room-games/ludo) here on
// the phone against opponents that play by themselves. LudoLive shows a live room's table: the server throws every
// die and checks every move (server/api/room-games/ludo.mjs), this screen sends my taps and plays back what comes.
// "Animasyonları azalt" skips the tumbling and the walking: the board just changes.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Art, type ArtName } from '@/components/Art';
import { Gloss, PressableScale } from '@/components/fx/surface';
import { LUDO_COLORS, LudoBoard, type BoardHandle, type BoardToken } from '@/components/games/room/ludo-board';
import { Photo } from '@/components/photo';
import { Text } from '@/components/text';
import type { LudoServerTable } from '@/lib/api';
import { playSfx, warmSfx } from '@/lib/game-sound';
import { errorHaptic, pressHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { BASE, HOME, META, MODES, moveTable, openTable, pickToken, seatColors, startTable, type LudoEvent, type LudoMode, type LudoMove, type LudoState, type LudoTable } from '@/lib/room-games/ludo';
import { cornerOf, turnsFor } from '@/lib/room-games/ludo-board';
import { useSettings } from '@/store';
import { colors, fonts, semantic } from '@/theme';

export type LudoSeat = { id: string; name: string; avatar: string };
/** What the stage shows: a table's Ludo fields with the people on its seats. */
export type LudoView = LudoState & { status: 'waiting' | 'playing' | 'over'; turn: number; winner: number | null; seats: LudoSeat[] };

export const MODE_NAMES: Record<LudoMode, string> = { quick: 'Hızlı', classic: 'Klasik' };
const modeLabel = (mode: LudoMode) => `${MODE_NAMES[mode]} · ${MODES[mode]} taş`;
/** How long the die tumbles before it shows what was thrown. */
const ROLL_MS = 560;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const first = (name: string) => name.trim().split(/\s+/)[0] || name;

/** The board of a table with no hand yet: everyone's tokens in base, on the colours a hand would give them. */
function idleView(seats: LudoSeat[], mode: LudoMode): LudoView {
  return { status: 'waiting', turn: 0, winner: null, seats, mode, hand: 0, colors: seatColors(seats.length), tokens: seats.map(() => Array<number>(MODES[mode]).fill(BASE)), phase: 'roll', die: null, sixes: 0, movable: [], n: 0, last: null };
}

/** The tokens of `v`; with `undo`, as they stood before that event. */
function tokensOf(v: LudoView, undo?: LudoEvent): BoardToken[] {
  return v.tokens.flatMap((steps, seat) =>
    steps.map((step, index) => {
      const color = v.colors[seat];
      if (undo && undo.color === color && undo.token === index && undo.from !== null) return { color, index, step: undo.from };
      const taken = undo?.captured.find((c) => c.color === color && c.token === index);
      return { color, index, step: taken ? taken.from : step };
    }),
  );
}

const nameOf = (v: LudoView, color: number) => first(v.seats[v.colors.indexOf(color)]?.name ?? '');
/** One short line about the event that made `v`; what I did myself is said to me ("3 attın"). */
function lineOf(v: LudoView, me: number) {
  const e = v.last;
  if (v.status === 'waiting') return v.seats.length < META.min ? 'Oyuncular bekleniyor' : 'Masa hazır';
  if (!e) return 'Zar at · 6 gelince taşın yola çıkar';
  const mine = me >= 0 && v.colors[me] === e.color;
  const who = nameOf(v, e.color);
  if (e.note === 'left') return 'Bir oyuncu masadan kalktı';
  if (e.note === 'sixes') return mine ? 'Üçüncü 6’yı attın · sıra geçti' : `${who} üçüncü 6’yı attı · sıra geçti`;
  if (e.note === 'none') return mine ? `${e.die} attın · oynayacak taşın yok` : `${who} ${e.die} attı · oynayacak taşı yok`;
  if (e.token === null) return thrown(who, mine, e.die);
  if (e.captured.length) return `${mine ? '' : `${who} `}${e.captured.length > 1 ? `${e.captured.length} taş` : mine ? 'Taş' : 'taş'} ${mine ? 'kırdın' : 'kırdı'}!`;
  if (e.to === HOME) return mine ? 'Bir taşın evde!' : `${who} bir taşını eve soktu`;
  if (e.from === BASE) return mine ? '6 attın · taşın yola çıktı' : `${who} 6 attı · taşı yola çıktı`;
  return thrown(who, mine, e.die);
}
const thrown = (who: string, mine: boolean, die: number | null) => (mine ? `${die} attın` : `${who} ${die} attı`);

type Frame = { view: LudoView; tokens: BoardToken[]; playing: boolean; line: string };
const frameOf = (view: LudoView, me: number): Frame => ({ view, tokens: tokensOf(view), playing: false, line: lineOf(view, me) });
type DieFace = { face: number | null; spinning: boolean; color: number | null };

function LudoStage({
  view,
  me,
  onRoll,
  onPick,
  busy,
  turnEndsAt = null,
  turnMs = 30_000,
  fit,
  free,
  onShown,
  cover,
  onAgain,
}: {
  view: LudoView;
  /** My seat; −1 when I only watch. */
  me: number;
  /** My taps; left out when the game isn't mine to play. */
  onRoll?: () => void;
  onPick?: (token: number) => void;
  /** A tap of mine is on its way to the server. */
  busy?: boolean;
  /** When the running turn ends (ms since 1970) and how long a turn is: the bar under the player on turn. */
  turnEndsAt?: number | null;
  turnMs?: number;
  /** In a room's sheet: the board is kept small enough to stay above the fold with the players around it. */
  fit?: boolean;
  /** A waiting table: the corners nobody sits at are shown as free seats. */
  free?: boolean;
  /** The screen has finished playing the state (hand, n): the next move may come. */
  onShown?: (hand: number, n: number) => void;
  /** Drawn over the board, which waits dimmed behind it: a practice game's settings before it starts. */
  cover?: ReactNode;
  /** After a hand: another one, from the winner's banner. */
  onAgain?: () => void;
}) {
  const { reduceMotion: still } = useSettings();
  const win = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const [frame, setFrame] = useState(() => frameOf(view, me));
  const [die, setDie] = useState<DieFace>({ face: view.die, spinning: false, color: null });
  const board = useRef<BoardHandle>(null);
  const queue = useRef<LudoView[]>([]);
  const running = useRef(false);
  const alive = useRef(true);
  const shown = useRef({ hand: view.hand, n: view.n });
  /** When my own tap set the die tumbling, before the throw's answer is here. */
  const spinAt = useRef<number | null>(null);
  const latest = useRef({ still, me, onShown });
  useEffect(() => {
    latest.current = { still, me, onShown };
  });
  useEffect(() => {
    alive.current = true;
    warmSfx(['dice', 'move', 'capture', 'turn', 'win']);
    return () => {
      alive.current = false;
    };
  }, []);

  /** Plays what made `v`, then shows it. A state that is not the next event (a new hand, a table read late) is just shown. */
  const play = async (v: LudoView) => {
    const { still: flat, me: mine } = latest.current;
    const e = v.last;
    const before = shown.current;
    shown.current = { hand: v.hand, n: v.n };
    const settle = () => {
      spinAt.current = null;
      setFrame(frameOf(v, mine));
      setDie({ face: v.die, spinning: false, color: e?.color ?? null });
      latest.current.onShown?.(v.hand, v.n);
    };
    if (!e || v.status === 'waiting' || v.hand !== before.hand || e.n !== v.n || v.n <= before.n || e.note === 'left') return settle();
    const who = nameOf(v, e.color);
    const myColor = mine >= 0 ? v.colors[mine] : -1;
    const own = e.color === myColor;
    setFrame({ view: v, tokens: tokensOf(v, e), playing: true, line: e.rolled ? (own ? 'Zar atıyorsun…' : `${who} zar atıyor…`) : thrown(who, own, e.die) });
    if (e.rolled) {
      // A throw of my own has been tumbling since the tap; anybody else's starts now.
      const since = spinAt.current ?? Date.now();
      if (spinAt.current === null) playSfx('dice');
      spinAt.current = null;
      setDie({ face: null, spinning: true, color: e.color });
      await sleep(flat ? 0 : Math.max(220, ROLL_MS - (Date.now() - since)));
      if (!alive.current) return;
      setDie({ face: e.die, spinning: false, color: e.color });
      setFrame((f) => ({ ...f, line: e.note === 'none' || e.note === 'sixes' ? lineOf(v, mine) : thrown(who, own, e.die) }));
      // Long enough to read the die: longer when nothing else is going to move.
      await sleep(flat ? 0 : e.token === null ? 560 : 260);
    } else await sleep(flat ? 0 : 30);
    if (!alive.current) return;
    if (e.token !== null && e.from !== null && e.to !== null) {
      await board.current?.hop(e.color, e.token, e.from, e.to, () => playSfx('move', 0.8));
      if (!alive.current) return;
      if (e.captured.length) {
        playSfx('capture');
        if (e.captured.some((c) => c.color === myColor)) errorHaptic();
        else if (e.color === myColor) successHaptic();
        await Promise.all(e.captured.map((c) => board.current?.back(c.color, c.token, c.from)));
        if (!alive.current) return;
      }
      if (e.to === HOME && v.status !== 'over') playSfx('win', 0.7);
    }
    settle();
    if (v.status === 'over') {
      if (v.winner === mine) {
        playSfx('fanfare');
        successHaptic();
      } else if (mine >= 0) playSfx('lose');
    } else if (v.turn === mine && e.color !== myColor) {
      playSfx('turn', 0.7);
      pressHaptic();
    }
  };
  const pump = async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.length && alive.current) {
      // Far behind (the phone slept while the room played on): only the newest state is worth playing.
      if (queue.current.length > 2) queue.current.splice(0, queue.current.length - 1);
      await play(queue.current.shift()!);
    }
    running.current = false;
  };
  const pumpRef = useRef(pump);
  useEffect(() => {
    pumpRef.current = pump;
  });
  useEffect(() => {
    queue.current.push(view);
    void pumpRef.current();
  }, [view]);
  // A throw that was refused brings no new state: the die I set tumbling comes to rest as it was.
  useEffect(() => {
    if (busy || spinAt.current === null) return;
    const t = setTimeout(() => {
      if (spinAt.current === null || running.current) return;
      spinAt.current = null;
      setDie((d) => ({ ...d, spinning: false }));
    }, 900);
    return () => clearTimeout(t);
  }, [busy, view]);

  const v = frame.view;
  // The stage is up to date and at rest: only then are taps taken.
  const ready = !frame.playing && v === view && !busy;
  const playing = v.status === 'playing';
  const myColor = me >= 0 ? (v.colors[me] ?? 0) : (v.colors[0] ?? 0);
  const turns = turnsFor(myColor);
  const active = frame.playing ? (v.last?.color ?? null) : playing ? (v.colors[v.turn] ?? null) : null;
  const myTurn = ready && playing && v.turn === me;
  const canRoll = myTurn && v.phase === 'roll' && !!onRoll && !die.spinning;
  const canPick = myTurn && v.phase === 'move' && !!onPick;
  const roll = () => {
    if (!canRoll) return;
    pressHaptic();
    if (!still) {
      spinAt.current = Date.now();
      setDie({ face: null, spinning: true, color: myColor });
      playSfx('dice');
    }
    onRoll?.();
  };
  const pick = (token: number) => {
    if (!canPick) return;
    tapHaptic();
    playSfx('tap');
    onPick?.(token);
  };

  // In a room's sheet the header, the voice strip and the players' rows leave this much for the board.
  const room = fit ? Math.max(288, win.height * 0.78 - 276) : 430;
  const size = Math.floor(Math.min(width, 430, room));
  const count = MODES[v.mode] ?? 2;
  const seatAt = (corner: number) => v.colors.findIndex((c) => cornerOf(c, turns) === corner);
  const chip = (corner: number) => {
    const seat = seatAt(corner);
    const side = corner === 0 || corner === 3 ? 'left' : 'right';
    if (seat < 0) return free ? <FreeSeat key={corner} side={side} width={chipWidth} /> : <View key={corner} style={{ width: chipWidth }} />;
    const color = v.colors[seat];
    return (
      <PlayerChip
        key={corner}
        seat={v.seats[seat]}
        color={color}
        side={side}
        width={chipWidth}
        mine={seat === me}
        active={active === color}
        home={v.tokens[seat].filter((step) => step === HOME).length}
        count={v.tokens[seat].length}
        winner={v.status === 'over' && !frame.playing && v.winner === seat}
        bar={playing && !frame.playing && v.turn === seat && turnEndsAt ? { endsAt: turnEndsAt, total: turnMs } : null}
        still={still}
      />
    );
  };
  const chipWidth = Math.floor((size - DIE_BLOCK) / 2);
  const turnName = playing ? first(v.seats[v.turn]?.name ?? '') : '';
  const hint = !playing ? '' : frame.playing ? '' : v.turn === me ? (v.phase === 'roll' ? 'Zar at' : 'Taşını seç') : `${turnName} oynuyor`;
  const won = v.status === 'over' && !frame.playing && v.winner !== null ? v.seats[v.winner] : null;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={s.stage}>
      {size > 0 && (
        <View style={{ width: size, gap: 6 }}>
          <View style={s.row}>
            {chip(0)}
            <Text style={s.line} numberOfLines={2} accessibilityLiveRegion="polite">
              {frame.line}
            </Text>
            {chip(1)}
          </View>
          <View>
            <LudoBoard ref={board} size={size} turns={turns} count={count} colors={v.colors} tokens={frame.tokens} active={active} movable={canPick ? { color: myColor, indexes: v.movable } : null} onPick={pick} still={still} />
            {cover && <View style={[StyleSheet.absoluteFill, w.veil, w.cover]}>{cover}</View>}
            {won && <WinBanner name={v.winner === me ? null : first(won.name)} color={v.colors[v.winner!] ?? 0} size={size} still={still} onAgain={onAgain && !busy ? onAgain : undefined} />}
          </View>
          <View style={s.row}>
            {chip(3)}
            <View style={s.dieBlock}>
              <Die size={46} face={die.face} spinning={die.spinning} color={die.spinning ? die.color : active} ready={canRoll} onPress={roll} still={still} />
              <Text style={[s.hint, v.turn === me && playing && { color: semantic.actionText }]} numberOfLines={1}>
                {hint}
              </Text>
            </View>
            {chip(2)}
          </View>
        </View>
      )}
    </View>
  );
}

/** The width of the die and its caption between the two players of the lower row. */
const DIE_BLOCK = 104;
const FACES = [1, 2, 3, 4, 5, 6] as const;

/** The die on its pad: tumbling while `spinning`, then the face thrown; lit and tappable when it is mine to throw. */
function Die({ size, face, spinning, color, ready, onPress, still }: { size: number; face: number | null; spinning: boolean; color: number | null; ready: boolean; onPress: () => void; still: boolean }) {
  const [tumble, setTumble] = useState(3);
  const [turn] = useState(() => new Animated.Value(0));
  const [land] = useState(() => new Animated.Value(1));
  const [halo] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!spinning || still) return;
    const t = setInterval(
      () =>
        setTumble((f) => {
          const n = 1 + Math.floor(Math.random() * 5);
          return n >= f ? n + 1 : n;
        }),
      70,
    );
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 300, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => {
      clearInterval(t);
      loop.stop();
      turn.setValue(0);
      // It lands: a little too big, then settles.
      land.setValue(1.28);
      Animated.spring(land, { toValue: 1, speed: 18, bounciness: 12, useNativeDriver: true }).start();
    };
  }, [spinning, still, turn, land]);
  useEffect(() => {
    if (!ready || still) return;
    const loop = Animated.loop(Animated.timing(halo, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => {
      loop.stop();
      halo.setValue(0);
    };
  }, [ready, still, halo]);
  const shown = spinning && !still ? tumble : (face ?? 6);
  const c = color === null ? null : LUDO_COLORS[color];
  const pad = size + 18;
  return (
    <Pressable onPress={onPress} disabled={!ready} hitSlop={8} accessibilityRole="button" accessibilityLabel={ready ? 'Zar at' : `Zar: ${face ?? 'atılmadı'}`} accessibilityState={{ disabled: !ready }} style={{ width: pad, height: pad }}>
      {ready && !still && <Animated.View style={[d.halo, { borderRadius: pad, borderColor: c?.base ?? semantic.action, opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }), transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }] }]} />}
      <LinearGradient colors={c ? [c.light, c.dark] : ['#3A4E72', '#1F3050']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={[d.pad, { borderRadius: pad }, ready && { boxShadow: `0 0 14px ${c?.base ?? semantic.action}` }]}>
        <View style={[d.well, { borderRadius: pad }]}>
          <Animated.View style={{ width: size, height: size, opacity: face === null && !spinning ? 0.45 : 1, transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }, { scale: land }] }}>
            {/* Every face stays mounted, so changing face never waits for a picture to load. */}
            {FACES.map((n) => (
              <Art key={n} name={`zar-zar-yuzu-${n}` as ArtName} size={size} style={{ position: 'absolute', opacity: n === shown ? 1 : 0 }} />
            ))}
          </Animated.View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function PlayerChip({
  seat,
  color,
  side,
  width,
  mine,
  active,
  home,
  count,
  winner,
  bar,
  still,
}: {
  seat: LudoSeat;
  color: number;
  side: 'left' | 'right';
  width: number;
  mine: boolean;
  active: boolean;
  /** Tokens home, of `count`. */
  home: number;
  count: number;
  winner: boolean;
  bar: { endsAt: number; total: number } | null;
  still: boolean;
}) {
  const c = LUDO_COLORS[color];
  const [glow] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active || still) return void glow.setValue(active ? 1 : 0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.2, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, still, glow]);
  const right = side === 'right';
  const textWidth = width - FACE - 12;
  return (
    <View style={[p.chip, { width, flexDirection: right ? 'row-reverse' : 'row' }]} accessibilityLabel={`${mine ? 'Sen' : seat.name}, ${c.name}, ${home}/${count} taş evde${active ? ', sıra onda' : ''}`}>
      <View style={{ width: FACE + 6, height: FACE + 6 }}>
        <Animated.View style={[p.halo, { borderColor: c.base, opacity: glow, boxShadow: `0 0 10px ${c.base}` }]} />
        <LinearGradient colors={[c.light, c.dark]} style={p.ring}>
          <Photo uri={seat.avatar} kind="face" style={p.face} />
        </LinearGradient>
        {winner && (
          <View style={p.crown}>
            <Ionicons name="trophy" size={11} color={semantic.moneyInk} />
          </View>
        )}
      </View>
      <View style={{ width: textWidth, gap: 3, alignItems: right ? 'flex-end' : 'flex-start' }}>
        <Text style={[p.name, active && { color: colors.text }]} numberOfLines={1}>
          {mine ? 'Sen' : seat.name}
        </Text>
        <View style={p.pips}>
          {Array.from({ length: count }, (_, i) => (
            <View key={i} style={[p.pip, { borderColor: c.base }, i < home && { backgroundColor: c.base }]} />
          ))}
        </View>
        {bar && <TurnBar endsAt={bar.endsAt} total={bar.total} color={c.base} width={Math.min(textWidth, 64)} />}
      </View>
    </View>
  );
}
const FACE = 34;

/** A corner nobody sits at yet, while the table waits. */
function FreeSeat({ side, width }: { side: 'left' | 'right'; width: number }) {
  return (
    <View style={[p.chip, { width, flexDirection: side === 'right' ? 'row-reverse' : 'row' }]}>
      <View style={p.free}>
        <Ionicons name="add" size={18} color={colors.textDim} />
      </View>
      <Text style={p.freeText}>Boş koltuk</Text>
    </View>
  );
}

/** The turn's time running out under the player's name. It is information, so it runs with "Animasyonları azalt" too. */
function TurnBar({ endsAt, total, color, width }: { endsAt: number; total: number; color: string; width: number }) {
  const [gone] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const left = Math.max(0, endsAt - Date.now());
    gone.setValue(1 - Math.min(1, left / total));
    const a = Animated.timing(gone, { toValue: 1, duration: left, easing: Easing.linear, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [endsAt, total, gone]);
  return (
    <View style={[p.bar, { width }]}>
      <Animated.View style={{ flex: 1, borderRadius: 2, backgroundColor: color, transform: [{ translateX: gone.interpolate({ inputRange: [0, 1], outputRange: [0, -width] }) }] }} />
    </View>
  );
}

// Where each scrap of the winner's confetti flies, fixed once: a render never draws random numbers.
const CONFETTI = Array.from({ length: 26 }, (_, i) => {
  const a = (i * 137.5 * Math.PI) / 180;
  const far = 0.28 + ((i * 53) % 23) / 60;
  return { dx: Math.cos(a) * far, dy: Math.sin(a) * far * 0.8 - 0.12, color: i % 4, turn: (i % 2 ? 1 : -1) * (180 + ((i * 71) % 240)), w: 5 + (i % 3) * 2 };
});

/** Over the board when the hand is won. `name` null: it is me. */
function WinBanner({ name, color, size, still, onAgain }: { name: string | null; color: number; size: number; still: boolean; onAgain?: () => void }) {
  const [t] = useState(() => new Animated.Value(still ? 1 : 0));
  const [fly] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (still) return;
    const a = Animated.parallel([
      Animated.spring(t, { toValue: 1, speed: 10, bounciness: 12, useNativeDriver: true }),
      Animated.timing(fly, { toValue: 1, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
    a.start();
    return () => a.stop();
  }, [still, t, fly]);
  const c = LUDO_COLORS[color];
  return (
    <View style={[StyleSheet.absoluteFill, w.veil]} accessibilityLiveRegion="polite">
      {!still &&
        CONFETTI.map((f, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              width: f.w,
              height: f.w * 1.6,
              borderRadius: 1.5,
              backgroundColor: LUDO_COLORS[f.color].base,
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
        <LinearGradient colors={['#1C2E4A', '#101C33']} style={[w.card, { borderColor: c.base, boxShadow: `0 0 26px ${c.base}` }]}>
          <LinearGradient colors={['#FFE08A', '#F2A93B']} style={w.cup}>
            <Ionicons name="trophy" size={28} color={semantic.moneyInk} />
          </LinearGradient>
          <Text style={w.title}>{name === null ? 'Kazandın!' : `${name} kazandı`}</Text>
          <Text style={w.sub}>{name === null ? 'Bütün taşların evde' : 'El bitti'}</Text>
          {onAgain && (
            <View style={w.again}>
              <ActionButton label="Yeniden oyna" onPress={onAgain} />
            </View>
          )}
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

function ActionButton({ label, onPress, disabled, ghost }: { label: string; onPress: () => void; disabled?: boolean; ghost?: boolean }) {
  if (ghost)
    return (
      <Pressable onPress={onPress} disabled={disabled} style={[s.ghost, disabled && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel={label}>
        <Text style={s.ghostText}>{label}</Text>
      </Pressable>
    );
  return (
    <PressableScale onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={disabled ? { opacity: 0.5 } : undefined}>
      <LinearGradient colors={['#6FF1F5', '#0FB8BE']} style={s.action}>
        <Gloss strength={0.22} />
        <Text style={s.actionText}>{label}</Text>
      </LinearGradient>
    </PressableScale>
  );
}

/** A row of choices, one of them on. */
function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <View style={s.choice} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={s.choiceLabel}>{label}</Text>
      {options.map(([v, text]) => (
        <Pressable
          key={String(v)}
          onPress={() => {
            tapHaptic();
            onChange(v);
          }}
          style={[s.option, v === value && s.optionOn]}
          accessibilityRole="radio"
          accessibilityState={{ checked: v === value }}
          accessibilityLabel={text}
        >
          <Text style={[s.optionText, v === value && { color: '#FFFFFF' }]}>{text}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Hızlı (2 taş) or Klasik (4 taş): for whoever opens a live table, and for a practice game. */
export function LudoModePicker({ mode, onChange }: { mode: LudoMode; onChange: (m: LudoMode) => void }) {
  return (
    <Choice
      label="Oyun"
      value={mode}
      onChange={onChange}
      options={[
        ['quick', modeLabel('quick')],
        ['classic', modeLabel('classic')],
      ]}
    />
  );
}

const rnd = (n: number) => Math.floor(Math.random() * n);

/**
 * A practice game on this phone: me on the first seat against the others in `players`, who play by themselves
 * (lib/room-games/ludo pickToken). Nothing is sent anywhere and nothing is won.
 */
export function LudoPractice({ players, fit }: { players: LudoSeat[]; fit?: boolean }) {
  const [mode, setMode] = useState<LudoMode>('quick');
  const [size, setSize] = useState(Math.min(META.max, Math.max(META.min, players.length)));
  // The line-up is fixed when a game starts: people coming to or leaving the room don't change a game being played.
  const [game, setGame] = useState<{ table: LudoTable; seats: LudoSeat[] } | null>(null);
  const [shown, setShown] = useState({ hand: 0, n: -1 });
  const lineup = useMemo(() => {
    // A room with nobody else in it still has someone to play against.
    const rivals = [...players.slice(1), ...Array.from({ length: META.max }, (_, i) => ({ id: `rakip-${i + 1}`, name: `Rakip ${i + 1}`, avatar: '' }))];
    return [players[0], ...rivals.slice(0, size - 1)];
  }, [players, size]);

  const start = () => {
    const table = lineup.slice(1).reduce((t, p) => ({ ...t, seats: [...t.seats, p.id], misses: [...t.misses, 0] }), openTable(lineup[0].id, { mode }));
    pressHaptic();
    setShown({ hand: 0, n: -1 });
    setGame({ table: startTable(game && game.seats === lineup ? game.table : table), seats: lineup });
  };
  const act = (seat: number, m: LudoMove) =>
    setGame((g) => {
      if (!g) return g;
      const r = moveTable(g.table, seat, m, g.seats.map((x) => x.name), rnd);
      return r.ok ? { ...g, table: r.table } : g;
    });

  // The others play when the screen has finished showing the last move: a throw, then their choice of token.
  const table = game?.table;
  useEffect(() => {
    if (!table || table.status !== 'playing' || table.turn === 0) return;
    if (shown.hand !== table.hand || shown.n !== table.n) return;
    const t = setTimeout(() => act(table.turn, table.phase === 'roll' ? { roll: true } : { token: pickToken(table, table.turn) }), table.phase === 'roll' ? 650 : 520);
    return () => clearTimeout(t);
  }, [table, shown]);

  const view = useMemo<LudoView>(() => (game ? { ...game.table, seats: game.seats } : idleView(lineup, mode)), [game, lineup, mode]);
  const over = game?.table.status === 'over';
  // Before a game the settings lie over the board, so the button that starts it is in sight in a room's sheet too.
  const setup = (
    <View style={s.setup}>
      <LudoModePicker mode={mode} onChange={setMode} />
      <Choice label="Oyuncu" value={size} onChange={setSize} options={[2, 3, 4].map((n) => [n, `${n} kişi`])} />
      <ActionButton label="Oyunu başlat" onPress={start} />
    </View>
  );
  return (
    <View style={{ gap: 10 }}>
      <LudoStage
        view={view}
        me={0}
        fit={fit}
        cover={game ? undefined : setup}
        onAgain={over ? start : undefined}
        onRoll={() => act(0, { roll: true })}
        onPick={(token) => act(0, { token })}
        onShown={(hand, n) => setShown({ hand, n })}
      />
      {game && <ActionButton ghost label={over ? 'Oyun ayarları' : 'Oyunu bırak'} onPress={() => setGame(null)} />}
    </View>
  );
}

/** The live table's state as the stage draws it; null when the server sent a Ludo table this screen can't read. */
function liveView(table: LudoServerTable): LudoView | null {
  const seats = table.seats.map((x) => ({ id: x.id, name: x.name, avatar: x.avatarUrl ?? '' }));
  const mode: LudoMode = table.mode === 'classic' ? 'classic' : 'quick';
  if (table.status === 'waiting') return idleView(seats, mode);
  const { tokens, colors: seated } = table;
  if (!tokens || !seated) return null;
  // Someone who sat down after the hand has no colour yet: they wait on a corner nobody played from.
  const spare = [0, 1, 2, 3].filter((c) => !seated.includes(c));
  const extra = seats.slice(seated.length).map((_, i) => spare[i] ?? 0);
  return {
    status: table.status,
    turn: table.turn,
    winner: table.winner,
    seats: seats.slice(0, seated.length + spare.length),
    mode,
    hand: table.hand ?? 1,
    colors: [...seated, ...extra].slice(0, 4),
    tokens: [...tokens, ...extra.map(() => Array<number>(MODES[mode]).fill(BASE))].slice(0, 4),
    phase: table.phase ?? 'roll',
    die: table.die ?? null,
    sixes: table.sixes ?? 0,
    movable: table.movable ?? [],
    n: table.n ?? 0,
    last: table.last ?? null,
  };
}

/**
 * A live room's Ludo table (components/games/room-tables LiveTable reads it and sends the actions): the board for
 * everyone in the room, the die and the tokens for whoever is on turn. `children`: the table's buttons (sit, start,
 * leave), which are the same for every game.
 */
export function LudoLive({ table, busy, onMove, onAgain, children }: { table: LudoServerTable; busy: boolean; onMove: (move: LudoMove) => void; /** I sit at a finished hand that can be played again. */ onAgain?: () => void; children?: ReactNode }) {
  const view = useMemo(() => liveView(table), [table]);
  if (!view)
    return (
      <View style={{ gap: 10 }}>
        <Text style={s.note}>Bu masa uygulamanın başka bir sürümüyle açılmış. Masayı kapatıp yeniden aç.</Text>
        {children}
      </View>
    );
  const waiting = table.status === 'waiting';
  return (
    <View style={{ gap: 10 }}>
      <LudoStage
        view={view}
        me={table.mySeat}
        fit
        free={waiting && table.seats.length < table.max}
        busy={busy}
        turnEndsAt={table.turnEndsAt ? Date.parse(table.turnEndsAt) : null}
        onAgain={onAgain}
        onRoll={() => onMove({ roll: true })}
        onPick={(token) => onMove({ token })}
      />
      <Text style={s.note}>
        {waiting ? `${table.seats.length}/${table.max} oyuncu · en az ${table.min} · ${modeLabel(view.mode)}` : table.mySeat < 0 && table.status === 'playing' ? 'Masayı izliyorsun; el bitince boş koltuğa oturabilirsin.' : modeLabel(view.mode)}
      </Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  stage: { alignItems: 'center', alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  line: { flex: 1, color: colors.textDim, fontSize: 12, lineHeight: 16, textAlign: 'center', paddingHorizontal: 4 },
  dieBlock: { width: DIE_BLOCK, alignItems: 'center', gap: 2 },
  hint: { color: colors.textDim, fontSize: 12, lineHeight: 16, fontWeight: '800', maxWidth: DIE_BLOCK },
  setup: { alignSelf: 'stretch', gap: 10, backgroundColor: colors.card, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', boxShadow: '0 10px 24px rgba(0,0,0,0.5)' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  choiceLabel: { color: colors.textDim, fontSize: 12, fontWeight: '700', width: 54 },
  option: { flex: 1, minHeight: 36, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  optionOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  action: { minHeight: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 4px 14px rgba(19,217,223,0.4)' },
  actionText: { color: semantic.actionInk, fontFamily: fonts.displayBold, fontSize: 16, lineHeight: 22 },
  ghost: { minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt },
  ghostText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  note: { color: colors.textDim, fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
const d = StyleSheet.create({
  pad: { flex: 1, padding: 3 },
  well: { flex: 1, backgroundColor: '#0A1426', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  halo: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderWidth: 2 },
});
const p = StyleSheet.create({
  chip: { alignItems: 'center', gap: 6, minHeight: FACE + 6 },
  halo: { position: 'absolute', left: -2, top: -2, right: -2, bottom: -2, borderRadius: 999, borderWidth: 2 },
  ring: { flex: 1, borderRadius: 999, padding: 3 },
  face: { flex: 1, borderRadius: 999, backgroundColor: colors.cardAlt },
  crown: { position: 'absolute', right: -3, top: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: semantic.money, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#0A1426' },
  name: { color: colors.textDim, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  pips: { flexDirection: 'row', gap: 3 },
  pip: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5 },
  bar: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  free: { width: FACE + 6, height: FACE + 6, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  freeText: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
});
const w = StyleSheet.create({
  veil: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,15,30,0.55)', borderRadius: 16 },
  cover: { padding: 14 },
  again: { alignSelf: 'stretch', minWidth: 170, marginTop: 8 },
  card: { alignItems: 'center', gap: 4, paddingHorizontal: 26, paddingTop: 16, paddingBottom: 14, borderRadius: 22, borderWidth: 1.5 },
  cup: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 22, lineHeight: 28 },
  sub: { color: colors.textDim, fontSize: 12, lineHeight: 16 },
});
