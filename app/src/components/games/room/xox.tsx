// XOX as it is played on the screen: the two players over the score, each with their mark and the turn's clock, and
// the board. A mark is drawn in when it is placed; the winning three are struck through and pulse; a board that
// fills with no line says so plainly.
//
// One stage for both ways to play. XoxPractice runs the app's own copy of the rules (lib/room-games/xox) here on the
// phone against an opponent that plays by itself. XoxLive shows a live room's table: the server checks every mark
// (server/api/room-games/xox.mjs), this screen sends my taps. "Animasyonları azalt" shows marks at once.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { ActionButton, DrawnRing, DuelHeader, EndCard, endSound, firstName, rnd, usePracticeTable, useSecondsLeft, type Seat } from '@/components/games/room/table-kit';
import { Text } from '@/components/text';
import type { XoxServerTable } from '@/lib/api';
import { playSfx, warmSfx } from '@/lib/game-sound';
import { errorHaptic, pressHaptic, successHaptic } from '@/lib/haptics';
import { botCell, moveTable, openTable, sitDown, startTable, timeoutTable, xoxLine, type Mark, type XoxMove, type XoxTable } from '@/lib/room-games/xox';
import { useSettings } from '@/store';
import { colors } from '@/theme';

/** What the stage shows. `me` −1: I watch. `marks`: seat → its mark. */
export type XoxView = { status: 'waiting' | 'playing' | 'over'; turn: number; winner: number | null; seats: Seat[]; me: number; board: (Mark | null)[]; marks: Mark[]; wins: number[] };

export const MARK_COLORS: Record<Mark, string> = { X: '#13D9DF', O: '#FF6576' };
const GAP = 8;
const LINE = '#FFD166';

/** One stroke of an X: a bar that runs in from one end. */
function Stroke({ length, thick, color, turn, t }: { length: number; thick: number; color: string; turn: string; t: Animated.AnimatedInterpolation<number> }) {
  return (
    <View style={{ position: 'absolute', width: length, height: thick, borderRadius: thick / 2, overflow: 'hidden', transform: [{ rotate: turn }] }}>
      <Animated.View style={{ flex: 1, borderRadius: thick / 2, backgroundColor: color, transform: [{ translateX: t }] }} />
    </View>
  );
}

/** A mark in its cell. `fresh`: just placed, so it is drawn in. `lit`: one of the winning three. `faint`: the hand is over and it isn't. */
function MarkView({ mark, cell, fresh, lit, faint, still }: { mark: Mark; cell: number; fresh: boolean; lit: boolean; faint: boolean; still: boolean }) {
  const [t] = useState(() => new Animated.Value(fresh && !still ? 0 : 1));
  const [beat] = useState(() => new Animated.Value(0));
  // Once drawn, the O is one whole ring: the two halves it is drawn with would show where they meet.
  const [drawn, setDrawn] = useState(!fresh || still);
  useEffect(() => {
    const a = Animated.timing(t, { toValue: 1, duration: mark === 'X' ? 300 : 340, easing: Easing.out(Easing.quad), useNativeDriver: true });
    a.start(({ finished }) => finished && setDrawn(true));
    return () => a.stop();
  }, [t, mark]);
  useEffect(() => {
    if (!lit || still) return void beat.setValue(0);
    const a = Animated.loop(Animated.sequence([Animated.timing(beat, { toValue: 1, duration: 480, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.timing(beat, { toValue: 0, duration: 480, easing: Easing.inOut(Easing.quad), useNativeDriver: true })]));
    a.start();
    return () => a.stop();
  }, [lit, still, beat]);
  const color = MARK_COLORS[mark];
  const length = cell * 0.66;
  const thick = Math.max(8, cell * 0.14);
  return (
    <Animated.View style={{ width: cell, height: cell, alignItems: 'center', justifyContent: 'center', opacity: faint ? 0.3 : 1, transform: [{ scale: beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }) }] }}>
      {mark === 'X' ? (
        <>
          <Stroke length={length} thick={thick} color={color} turn="45deg" t={t.interpolate({ inputRange: [0, 0.55, 1], outputRange: [-length, 0, 0] })} />
          <Stroke length={length} thick={thick} color={color} turn="-45deg" t={t.interpolate({ inputRange: [0, 0.45, 1], outputRange: [-length, -length, 0] })} />
        </>
      ) : drawn ? (
        <View style={{ width: cell * 0.6, height: cell * 0.6, borderRadius: cell * 0.3, borderWidth: thick, borderColor: color }} />
      ) : (
        <DrawnRing size={cell * 0.6} width={thick} color={color} t={t} />
      )}
    </Animated.View>
  );
}

/** The stroke through the winning three: it runs out from the middle, then pulses. */
function WinLine({ line, cell, still }: { line: number[]; cell: number; still: boolean }) {
  const [t] = useState(() => new Animated.Value(still ? 1 : 0));
  const [beat] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (still) return;
    const pulse = Animated.loop(Animated.sequence([Animated.timing(beat, { toValue: 0.45, duration: 480, useNativeDriver: true }), Animated.timing(beat, { toValue: 1, duration: 480, useNativeDriver: true })]));
    const a = Animated.timing(t, { toValue: 1, duration: 320, delay: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start(() => pulse.start());
    return () => {
      a.stop();
      pulse.stop();
    };
  }, [still, t, beat]);
  const [a, , c] = line;
  const at = (i: number) => ({ x: (i % 3) * (cell + GAP) + cell / 2, y: Math.floor(i / 3) * (cell + GAP) + cell / 2 });
  const [from, to] = [at(a), at(c)];
  const length = Math.hypot(to.x - from.x, to.y - from.y) + cell * 0.8;
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', left: (from.x + to.x) / 2 - length / 2, top: (from.y + to.y) / 2 - 4, width: length, height: 8, borderRadius: 4, backgroundColor: LINE, boxShadow: `0 0 12px ${LINE}`, opacity: beat, transform: [{ rotate: `${angle}deg` }, { scaleX: t }] }}
    />
  );
}

function XoxStage({ view, endsAt, busy, onMove, children }: { view: XoxView; endsAt: number | null; busy?: boolean; onMove: (m: XoxMove) => void; children?: ReactNode }) {
  const { reduceMotion: still } = useSettings();
  const [width, setWidth] = useState(0);
  // The board shown before this one: a mark that wasn't there is the one just placed.
  const [pair, setPair] = useState<{ cur: XoxView; before: XoxView | null }>({ cur: view, before: null });
  if (pair.cur !== view) setPair({ cur: view, before: pair.cur });
  const before = pair.cur === view ? pair.before : pair.cur;
  useEffect(() => warmSfx(['move', 'turn', 'tick', 'fanfare', 'lose']), []);

  const { me, status, board } = view;
  const playing = status === 'playing';
  const over = status === 'over';
  const myTurn = playing && view.turn === me;
  const line = over ? xoxLine(board) : null;
  const side = Math.min(width, 312);
  const cell = Math.floor((side - GAP * 2) / 3);
  const placed = board.filter(Boolean).length;
  const tone = !over ? null : view.winner === null ? 'draw' : view.winner === me ? 'win' : 'lose';
  const winnerSeat = view.winner !== null ? view.seats[view.winner] : null;
  // A hand lost on time or by leaving has no line to show: the card says why.
  const sub = tone === 'draw' ? 'Dokuz kare doldu, üçlü çıkmadı' : line ? (tone === 'win' ? 'Üçünü dizdin' : 'Üçünü dizdi') : view.seats.length < 2 ? 'Rakip masadan kalktı' : 'Süre doldu';

  const left = useSecondsLeft(myTurn ? endsAt : null);
  const heard = useRef({ placed: -1, turn: false, over: false, tick: 99 });
  useEffect(() => {
    const h = heard.current;
    if (h.placed >= 0 && placed > h.placed) playSfx('move');
    h.placed = placed;
    if (myTurn && !h.turn && placed > 0) playSfx('turn', 0.6);
    h.turn = myTurn;
    if (over && !h.over && before && tone) {
      endSound(tone);
      if (tone === 'win') successHaptic();
    }
    h.over = over;
    if (myTurn && left !== null && left <= 5 && left > 0 && left < h.tick) playSfx('tick', 0.6);
    h.tick = myTurn && left !== null ? left : 99;
  });

  const tap = (i: number) => {
    if (!myTurn || busy || board[i]) return void (myTurn && board[i] && errorHaptic());
    pressHaptic();
    onMove({ cell: i });
  };
  const turnSeat = view.seats[view.turn];
  const myMark = me >= 0 ? view.marks[me] : null;
  const prompt =
    status === 'waiting'
      ? 'İkinci oyuncu oturunca oyun başlar'
      : over
        ? tone === 'draw'
          ? 'Berabere'
          : tone === 'win'
            ? 'Kazandın!'
            : `${firstName(winnerSeat?.name ?? '')} kazandı`
        : myTurn
          ? `Sıra sende: ${myMark} koy${left !== null && left <= 10 ? ` · ${left} sn` : ''}`
          : `${firstName(turnSeat?.name ?? '')} düşünüyor…`;

  return (
    <View style={{ gap: 10 }} onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      <DuelHeader
        seats={view.seats}
        me={me}
        turn={view.turn}
        playing={playing}
        endsAt={endsAt}
        wins={view.wins}
        winner={view.winner}
        tints={[MARK_COLORS[view.marks[0] ?? 'X'], MARK_COLORS[view.marks[1] ?? 'O']]}
        token={(seat) => (
          <View style={[s.token, { borderColor: MARK_COLORS[view.marks[seat] ?? (seat === 0 ? 'X' : 'O')] }]}>
            <Text style={[s.tokenText, { color: MARK_COLORS[view.marks[seat] ?? (seat === 0 ? 'X' : 'O')] }]}>{view.marks[seat] ?? (seat === 0 ? 'X' : 'O')}</Text>
          </View>
        )}
      />
      {width > 0 && (
        <LinearGradient colors={['#16294A', '#0C182E']} style={[s.frame, { width: side + 20, borderColor: over ? (tone === 'draw' ? colors.border : LINE) : myTurn && myMark ? MARK_COLORS[myMark] : colors.border }]}>
          <View style={{ width: side, height: cell * 3 + GAP * 2, flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
            {board.map((v, i) => (
              <Pressable key={i} onPress={() => tap(i)} disabled={!myTurn || !!busy} style={[s.cell, { width: cell, height: cell }, myTurn && !v && s.cellOpen]} accessibilityRole="button" accessibilityLabel={`Kare ${i + 1}${v ? `, ${v}` : ', boş'}`}>
                {v && <MarkView mark={v} cell={cell} fresh={!!before && before.board[i] !== v} lit={!!line?.includes(i)} faint={over && !line?.includes(i)} still={still} />}
              </Pressable>
            ))}
            {line && <WinLine line={line} cell={cell} still={still} />}
          </View>
        </LinearGradient>
      )}
      {over && tone ? (
        <EndCard inline tone={tone} title={prompt} sub={sub} size={side} still={still}>
          {children}
        </EndCard>
      ) : (
        <>
          <Text style={[s.prompt, myTurn && { color: colors.text }]} accessibilityLiveRegion="polite">
            {prompt}
          </Text>
          {children}
        </>
      )}
    </View>
  );
}

/**
 * A practice game on this phone: me as X against the second of `players`, who plays by itself (lib/room-games/xox
 * botCell). Nothing is sent anywhere and nothing is won.
 */
export function XoxPractice({ players }: { players: Seat[] }) {
  // The line-up is fixed when the game opens: people coming to or leaving the room don't change a game being played.
  const [seats] = useState<Seat[]>(() => [players[0], players[1] ?? { id: 'rakip-1', name: 'Rakip', avatar: '' }]);
  const names = seats.map((x) => x.name);
  const { table, set, endsAt } = usePracticeTable<XoxTable>(() => startTable(sitDown(openTable(seats[0].id), seats[1].id)), {
    bot: (t) => {
      const r = moveTable(t, t.turn, { cell: botCell(t.board, t.marks[t.turn], rnd) }, names);
      return r.ok ? r.table : t;
    },
    ranOut: (t) => timeoutTable(t, names),
    think: [550, 500],
  });
  const view = useMemo<XoxView>(() => ({ status: table.status, turn: table.turn, winner: table.winner, seats, me: 0, board: table.board, marks: table.marks, wins: table.wins }), [table, seats]);
  return (
    <XoxStage
      view={view}
      endsAt={endsAt}
      onMove={(m) =>
        set((t) => {
          const r = moveTable(t, 0, m, names);
          return r.ok ? r.table : t;
        })
      }
    >
      {view.status === 'over' && <ActionButton label="Tekrar oyna" icon="refresh" onPress={() => set((t) => startTable(t))} />}
    </XoxStage>
  );
}

/**
 * A live room's XOX table (components/games/room-tables LiveTable reads it and sends the actions). `children`: the
 * table's buttons (sit, play again, leave), which are the same for every game.
 */
export function XoxLive({ table, busy, onMove, children }: { table: XoxServerTable; busy: boolean; onMove: (move: XoxMove) => void; children?: ReactNode }) {
  const view = useMemo<XoxView>(
    () => ({
      status: table.status,
      turn: table.turn,
      winner: table.winner,
      seats: table.seats.map((x) => ({ id: x.id, name: x.name, avatar: x.avatarUrl ?? '' })),
      me: table.mySeat,
      board: table.board ?? Array<Mark | null>(9).fill(null),
      // A table kept from before the marks were stored: the first seat is X.
      marks: table.marks ?? ['X', 'O'],
      wins: table.wins ?? [0, 0],
    }),
    [table],
  );
  return (
    <XoxStage view={view} endsAt={table.turnEndsAt ? Date.parse(table.turnEndsAt) : null} busy={busy} onMove={onMove}>
      {table.mySeat < 0 && table.status === 'playing' && <Text style={s.note}>Masayı izliyorsun; el bitince boş koltuğa oturabilirsin.</Text>}
      {children}
    </XoxStage>
  );
}

const s = StyleSheet.create({
  frame: { alignSelf: 'center', padding: 10, borderRadius: 24, borderWidth: 2 },
  cell: { borderRadius: 16, backgroundColor: '#0A1426', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  cellOpen: { borderColor: 'rgba(255,255,255,0.2)', backgroundColor: '#0E1B33' },
  token: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#0A1426', borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tokenText: { fontSize: 12, lineHeight: 15, fontWeight: '900' },
  prompt: { color: colors.textDim, fontSize: 13, lineHeight: 18, fontWeight: '800', textAlign: 'center', minHeight: 18 },
  note: { color: colors.textDim, fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
