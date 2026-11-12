// Dört Taş as it is played on the screen: the two players over the score, each with their disc and the turn's
// clock, and the upright board. A disc falls down its column behind the board's face and bounces to rest; the
// winning four pulse; a full board with no line says so.
//
// One stage for both ways to play. FourPractice runs the app's own copy of the rules (lib/room-games/four) here on
// the phone against an opponent that plays by itself. FourLive shows a live room's table: the server checks every
// disc (server/api/room-games/four.mjs), this screen sends my taps. "Animasyonları azalt" puts discs in place at once.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { ActionButton, DuelHeader, EndCard, endSound, firstName, rnd, usePracticeTable, useSecondsLeft, type Seat } from '@/components/games/room/table-kit';
import { Text } from '@/components/text';
import type { FourServerTable } from '@/lib/api';
import { playSfx, warmSfx } from '@/lib/game-sound';
import { errorHaptic, pressHaptic, successHaptic } from '@/lib/haptics';
import { COLS, ROWS, botCol, cellOf, moveTable, openTable, restRow, sitDown, startTable, timeoutTable, type FourEvent, type FourMove, type FourTable } from '@/lib/room-games/four';
import { useSettings } from '@/store';
import { colors } from '@/theme';

/** What the stage shows. `me` −1: I watch. `discs`: seat → its colour. */
export type FourView = { status: 'waiting' | 'playing' | 'over'; turn: number; winner: number | null; seats: Seat[]; me: number; board: (number | null)[]; discs: number[]; wins: number[]; line: number[] | null; hand: number; n: number; last: FourEvent | null };

/** The two discs: coral and gold. */
export const DISC_COLORS: { name: string; light: string; base: string; deep: string }[] = [
  { name: 'Pembe', light: '#FF99A4', base: '#F2506A', deep: '#A91F3D' },
  { name: 'Altın', light: '#FFE08A', base: '#F2A93B', deep: '#B36A0C' },
];
const FRAME = '#1E4F8F';
const WELL = '#081226';
const PAD = 8;

/** A disc. `flat`: small, for a badge. */
export function Disc({ color, size }: { color: number; size: number }) {
  const c = DISC_COLORS[color] ?? DISC_COLORS[0];
  return (
    <LinearGradient colors={[c.light, c.base, c.deep]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.62, height: size * 0.62, borderRadius: size, borderWidth: Math.max(1, size * 0.06), borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(0,0,0,0.08)' }} />
    </LinearGradient>
  );
}

/** A disc on the board. `drop`: it just came, so it falls from above the board (that many rows) and bounces. */
function BoardDisc({ color, size, drop, lit, faint, newest, still }: { color: number; size: number; drop: number; lit: boolean; faint: boolean; newest: boolean; still: boolean }) {
  const [y] = useState(() => new Animated.Value(drop && !still ? -drop : 0));
  const [beat] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const land = setTimeout(() => drop && playSfx('chip', 0.9), still ? 0 : 150 + drop * 0.5);
    const a = Animated.timing(y, { toValue: 0, duration: 260 + drop * 1.1, easing: Easing.bounce, useNativeDriver: true });
    a.start();
    return () => {
      clearTimeout(land);
      a.stop();
    };
    // Once, when the disc comes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!lit || still) return void beat.setValue(0);
    const a = Animated.loop(Animated.sequence([Animated.timing(beat, { toValue: 1, duration: 460, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.timing(beat, { toValue: 0, duration: 460, easing: Easing.inOut(Easing.quad), useNativeDriver: true })]));
    a.start();
    return () => a.stop();
  }, [lit, still, beat]);
  return (
    <Animated.View style={{ opacity: faint ? 0.35 : 1, transform: [{ translateY: y }, { scale: beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }}>
      <Disc color={color} size={size} />
      {lit && <View style={[s.litRing, { borderRadius: size / 2 }]} />}
      {newest && !lit && <View style={[s.newest, { left: size / 2 - 3, top: size / 2 - 3 }]} />}
    </Animated.View>
  );
}

/** The arrows over the columns still open, when the turn is mine. */
function Arrows({ cell, open, color, still }: { cell: number; open: boolean[]; color: string; still: boolean }) {
  const [bob] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (still) return;
    const a = Animated.loop(Animated.sequence([Animated.timing(bob, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.timing(bob, { toValue: 0, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true })]));
    a.start();
    return () => a.stop();
  }, [still, bob]);
  return (
    <Animated.View pointerEvents="none" style={{ flexDirection: 'row', paddingHorizontal: PAD, transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [-2, 3] }) }] }}>
      {open.map((ok, col) => (
        <View key={col} style={{ width: cell, alignItems: 'center', opacity: ok ? 1 : 0 }}>
          <Ionicons name="caret-down" size={Math.min(20, cell * 0.5)} color={color} />
        </View>
      ))}
    </Animated.View>
  );
}

function FourStage({ view, endsAt, busy, onMove, children }: { view: FourView; endsAt: number | null; busy?: boolean; onMove: (m: FourMove) => void; children?: ReactNode }) {
  const { reduceMotion: still } = useSettings();
  const [width, setWidth] = useState(0);
  // The state shown before this one: a disc that wasn't there is the one just dropped.
  const [pair, setPair] = useState<{ cur: FourView; before: FourView | null }>({ cur: view, before: null });
  if (pair.cur !== view) setPair({ cur: view, before: pair.cur });
  const before = pair.cur === view ? pair.before : pair.cur;
  useEffect(() => warmSfx(['chip', 'turn', 'tick', 'fanfare', 'lose']), []);

  const { me, status, board } = view;
  const playing = status === 'playing';
  const over = status === 'over';
  const myTurn = playing && view.turn === me;
  const cell = Math.floor((Math.min(width, 364) - PAD * 2) / COLS);
  const boardW = cell * COLS + PAD * 2;
  const boardH = cell * ROWS + PAD * 2;
  const disc = Math.round(cell * 0.8);
  const hole = disc - 2;
  const rim = Math.ceil(cell * 0.4);
  const open = Array.from({ length: COLS }, (_, col) => restRow(board, col) >= 0);
  const tone = !over ? null : view.winner === null ? 'draw' : view.winner === me ? 'win' : 'lose';
  const winnerSeat = view.winner !== null ? view.seats[view.winner] : null;
  const mine = me >= 0 ? (view.discs[me] ?? me) : null;
  const sub = tone === 'draw' ? 'Tahta doldu, dörtlü çıkmadı' : view.line ? (tone === 'win' ? 'Dört taşı dizdin' : 'Dört taşı dizdi') : view.seats.length < 2 ? 'Rakip masadan kalktı' : 'El bitti';

  const left = useSecondsLeft(myTurn ? endsAt : null);
  const heard = useRef({ turn: false, over: false, tick: 99 });
  useEffect(() => {
    const h = heard.current;
    if (myTurn && !h.turn && view.n > 0) playSfx('turn', 0.6);
    h.turn = myTurn;
    if (over && !h.over && before && tone) {
      // The last disc lands first.
      const t = setTimeout(() => endSound(tone), still ? 0 : 420);
      if (tone === 'win') successHaptic();
      h.over = over;
      return () => clearTimeout(t);
    }
    h.over = over;
    if (myTurn && left !== null && left <= 5 && left > 0 && left < h.tick) playSfx('tick', 0.6);
    h.tick = myTurn && left !== null ? left : 99;
  });

  const tap = (col: number) => {
    if (!myTurn || busy) return;
    if (!open[col]) return errorHaptic();
    pressHaptic();
    onMove({ col });
  };
  const turnSeat = view.seats[view.turn];
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
          ? `Sıra sende: bir sütuna dokun${left !== null && left <= 10 ? ` · ${left} sn` : ''}`
          : `${firstName(turnSeat?.name ?? '')} düşünüyor…`;
  // A disc that came with this state falls; every other one is where it was.
  const came = before && before.hand === view.hand && view.last && view.n > before.n ? cellOf(view.last.col, view.last.row) : -1;

  return (
    <View style={{ gap: 8 }} onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      <DuelHeader seats={view.seats} me={me} turn={view.turn} playing={playing} endsAt={endsAt} wins={view.wins} winner={view.winner} tints={[DISC_COLORS[view.discs[0] ?? 0].base, DISC_COLORS[view.discs[1] ?? 1].base]} token={(seat) => <View style={s.token}><Disc color={view.discs[seat] ?? seat} size={18} /></View>} />
      {width > 0 && (
        <View style={{ alignSelf: 'center', width: boardW }}>
          <View style={{ height: 22, justifyContent: 'flex-end' }}>{myTurn && mine !== null && <Arrows cell={cell} open={open} color={DISC_COLORS[mine].base} still={still} />}</View>
          <View style={[s.board, { width: boardW, height: boardH, borderColor: over && view.line ? '#FFD166' : '#2C66B4' }]}>
            {/* The discs, behind the board's face. */}
            <View style={{ position: 'absolute', left: PAD, top: PAD, width: cell * COLS, height: cell * ROWS, backgroundColor: WELL }}>
              {board.map((color, i) => {
                if (color === null) return null;
                const col = i % COLS;
                const row = Math.floor(i / COLS);
                const lit = !!view.line?.includes(i);
                return (
                  <View key={`${view.hand}:${i}`} style={{ position: 'absolute', left: col * cell + (cell - disc) / 2, top: (ROWS - 1 - row) * cell + (cell - disc) / 2 }}>
                    <BoardDisc color={color} size={disc} drop={i === came ? (ROWS - row) * cell : 0} lit={lit} faint={over && !!view.line && !lit} newest={playing && view.last !== null && cellOf(view.last.col, view.last.row) === i} still={still} />
                  </View>
                );
              })}
            </View>
            {/* The board's face: a wall with a round hole per cell, the falling disc showing through. */}
            <View pointerEvents="none" style={{ position: 'absolute', left: PAD, top: PAD, width: cell * COLS, height: cell * ROWS, flexDirection: 'row', flexWrap: 'wrap' }}>
              {Array.from({ length: COLS * ROWS }, (_, i) => (
                <View key={i} style={{ width: cell, height: cell, overflow: 'hidden' }}>
                  <View style={{ position: 'absolute', left: (cell - hole) / 2 - rim, top: (cell - hole) / 2 - rim, width: hole + rim * 2, height: hole + rim * 2, borderRadius: hole / 2 + rim, borderWidth: rim, borderColor: FRAME }} />
                  <View style={{ position: 'absolute', left: (cell - hole) / 2, top: (cell - hole) / 2, width: hole, height: hole, borderRadius: hole / 2, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.35)' }} />
                </View>
              ))}
            </View>
            {/* A column is one wide button. */}
            <View style={{ position: 'absolute', left: PAD, top: 0, bottom: 0, flexDirection: 'row' }}>
              {open.map((ok, col) => (
                <Pressable key={col} onPress={() => tap(col)} disabled={!myTurn || !!busy} style={{ width: cell, height: '100%' }} accessibilityRole="button" accessibilityLabel={`${col + 1}. sütun${ok ? '' : ', dolu'}`} />
              ))}
            </View>
          </View>
          <View style={[s.foot, { width: boardW + 12 }]} />
        </View>
      )}
      {over && tone ? (
        <EndCard inline tone={tone} title={prompt} sub={sub} size={boardW} still={still}>
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
 * A practice game on this phone: me on the first seat against the second of `players`, who plays by itself
 * (lib/room-games/four botCol). Nothing is sent anywhere and nothing is won.
 */
export function FourPractice({ players }: { players: Seat[] }) {
  // The line-up is fixed when the game opens: people coming to or leaving the room don't change a game being played.
  const [seats] = useState<Seat[]>(() => [players[0], players[1] ?? { id: 'rakip-1', name: 'Rakip', avatar: '' }]);
  const names = seats.map((x) => x.name);
  const { table, set, endsAt } = usePracticeTable<FourTable>(() => startTable(sitDown(openTable(seats[0].id), seats[1].id)), {
    bot: (t) => {
      const r = moveTable(t, t.turn, { col: botCol(t, t.turn, rnd) }, names);
      return r.ok ? r.table : t;
    },
    // Nobody loses a practice seat for thinking too long: the table drops the disc and that is all.
    ranOut: (t) => timeoutTable({ ...t, misses: t.misses.map(() => 0) }, names),
    think: [800, 600],
  });
  const view = useMemo<FourView>(() => ({ status: table.status, turn: table.turn, winner: table.winner, seats, me: 0, board: table.board, discs: table.colors, wins: table.wins, line: table.line, hand: table.hand, n: table.n, last: table.last }), [table, seats]);
  return (
    <FourStage
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
    </FourStage>
  );
}

/**
 * A live room's Dört Taş table (components/games/room-tables LiveTable reads it and sends the actions). `children`:
 * the table's buttons (sit, play again, leave), which are the same for every game.
 */
export function FourLive({ table, busy, onMove, children }: { table: FourServerTable; busy: boolean; onMove: (move: FourMove) => void; children?: ReactNode }) {
  const view = useMemo<FourView>(
    () => ({
      status: table.status,
      turn: table.turn,
      winner: table.winner,
      seats: table.seats.map((x) => ({ id: x.id, name: x.name, avatar: x.avatarUrl ?? '' })),
      me: table.mySeat,
      board: table.board ?? Array<number | null>(COLS * ROWS).fill(null),
      discs: table.colors ?? [0, 1],
      wins: table.wins ?? [0, 0],
      line: table.line ?? null,
      hand: table.hand ?? 0,
      n: table.n ?? 0,
      last: table.last ?? null,
    }),
    [table],
  );
  return (
    <FourStage view={view} endsAt={table.turnEndsAt ? Date.parse(table.turnEndsAt) : null} busy={busy} onMove={onMove}>
      {table.mySeat < 0 && table.status === 'playing' && <Text style={s.note}>Masayı izliyorsun; el bitince boş koltuğa oturabilirsin.</Text>}
      {children}
    </FourStage>
  );
}

const s = StyleSheet.create({
  board: { borderRadius: 18, borderWidth: 2, backgroundColor: FRAME, overflow: 'hidden', boxShadow: '0 8px 18px rgba(0,0,0,0.45)' },
  foot: { alignSelf: 'center', height: 8, marginTop: -2, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, backgroundColor: '#163A6B' },
  litRing: { position: 'absolute', left: -2, top: -2, right: -2, bottom: -2, borderWidth: 3, borderColor: '#FFFFFF', boxShadow: '0 0 12px rgba(255,255,255,0.9)' },
  newest: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  token: { borderRadius: 11, borderWidth: 2, borderColor: '#0A1426' },
  prompt: { color: colors.textDim, fontSize: 13, lineHeight: 18, fontWeight: '800', textAlign: 'center', minHeight: 18 },
  note: { color: colors.textDim, fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
