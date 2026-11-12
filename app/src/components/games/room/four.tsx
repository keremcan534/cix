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
import { Animated, Easing, Image, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { DISC_ART, RoomArtImage, roomArt, roomArtSet } from '@/components/games/room/table-art';
import { ActionButton, BEZEL, Bezel, DuelHeader, EndCard, StatusLine, alpha, endSound, firstName, rnd, useBoardRoom, usePracticeTable, useSecondsLeft, useTableFx, type Seat } from '@/components/games/room/table-kit';
import { Text } from '@/components/text';
import type { FourServerTable } from '@/lib/api';
import { playSfx, warmSfx } from '@/lib/game-sound';
import { errorHaptic, pressHaptic, successHaptic } from '@/lib/haptics';
import { COLS, ROWS, botCol, cellOf, moveTable, openTable, restRow, sitDown, startTable, timeoutTable, type FourEvent, type FourMove, type FourTable } from '@/lib/room-games/four';
import { colors } from '@/theme';

/** What the stage shows. `me` −1: I watch. `discs`: seat → its colour. */
export type FourView = { status: 'waiting' | 'playing' | 'over'; turn: number; winner: number | null; seats: Seat[]; me: number; board: (number | null)[]; discs: number[]; wins: number[]; line: number[] | null; hand: number; n: number; last: FourEvent | null };

/** The two discs: coral and gold. */
export const DISC_COLORS: { name: string; light: string; base: string; deep: string }[] = [
  { name: 'Pembe', light: '#FF99A4', base: '#F2506A', deep: '#A91F3D' },
  { name: 'Altın', light: '#FFE08A', base: '#F2A93B', deep: '#B36A0C' },
];
const FRAME = '#2459A6';
const PAD = 9;
/** What the stage draws round the board: the players' plates, the arrows, the stand, the status line, the gaps. */
const CHROME = 150;

/** A disc: a glossy dome with a groove round its middle, lit from above, its lower rim catching the light. */
export function Disc({ color, size }: { color: number; size: number }) {
  const art = roomArtSet(DISC_ART);
  if (art) return <RoomArtImage source={art[color] ?? art[0]} w={size} />;
  const c = DISC_COLORS[color] ?? DISC_COLORS[0];
  const groove = size * 0.66;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, boxShadow: `0 ${Math.max(1, size * 0.06)}px ${Math.max(2, size * 0.12)}px rgba(0,0,0,0.55)` }}>
      <LinearGradient colors={[c.light, c.base, c.deep]} locations={[0, 0.5, 1]} start={{ x: 0.25, y: 0 }} end={{ x: 0.75, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} />
      <View style={{ position: 'absolute', left: (size - groove) / 2, top: (size - groove) / 2, width: groove, height: groove, borderRadius: groove / 2, borderWidth: Math.max(1, size * 0.05), borderColor: alpha(c.deep, 0.75), borderTopColor: 'rgba(0,0,0,0.28)', borderBottomColor: 'rgba(255,255,255,0.4)' }} />
      <LinearGradient colors={['rgba(255,255,255,0.8)', 'rgba(255,255,255,0)']} style={{ position: 'absolute', left: size * 0.2, top: size * 0.06, width: size * 0.6, height: size * 0.42, borderRadius: size }} />
      <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: size / 2, borderWidth: Math.max(1, size * 0.045), borderColor: 'transparent', borderBottomColor: alpha(c.light, 0.75) }} />
    </View>
  );
}

/** A disc on the board. `drop`: it just came, so it falls from above the board (that many rows) and bounces. */
function BoardDisc({ color, size, drop, lit, faint, newest, still, fx }: { color: number; size: number; drop: number; lit: boolean; faint: boolean; newest: boolean; still: boolean; fx: boolean }) {
  const [y] = useState(() => new Animated.Value(drop && !still ? -drop : 0));
  // It lands a little squashed and springs back round.
  const [squash] = useState(() => new Animated.Value(0));
  const [beat] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const land = setTimeout(() => drop && playSfx('chip', 0.9), still ? 0 : 150 + drop * 0.5);
    const fall = 260 + drop * 1.1;
    const a = Animated.parallel([
      Animated.timing(y, { toValue: 0, duration: fall, easing: Easing.bounce, useNativeDriver: true }),
      Animated.sequence([Animated.delay(fall * 0.36), Animated.timing(squash, { toValue: 1, duration: 70, useNativeDriver: true }), Animated.spring(squash, { toValue: 0, speed: 22, bounciness: 14, useNativeDriver: true })]),
    ]);
    if (drop && !still) a.start();
    return () => {
      clearTimeout(land);
      a.stop();
    };
    // Once, when the disc comes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!lit || !fx) return void beat.setValue(0);
    const a = Animated.loop(Animated.sequence([Animated.timing(beat, { toValue: 1, duration: 460, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.timing(beat, { toValue: 0, duration: 460, easing: Easing.inOut(Easing.quad), useNativeDriver: true })]));
    a.start();
    return () => a.stop();
  }, [lit, fx, beat]);
  return (
    <Animated.View style={{ opacity: faint ? 0.35 : 1, transform: [{ translateY: y }, { scale: beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }, { scaleY: squash.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] }) }, { scaleX: squash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}>
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
    <Animated.View pointerEvents="none" style={{ flexDirection: 'row', paddingHorizontal: PAD + 1, transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [-2, 3] }) }] }}>
      {open.map((ok, col) => (
        <View key={col} style={{ width: cell, alignItems: 'center', opacity: ok ? 1 : 0 }}>
          <Ionicons name="caret-down" size={Math.min(22, cell * 0.5)} color={color} style={{ textShadowColor: color, textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 } }} />
        </View>
      ))}
    </Animated.View>
  );
}

function FourStage({ view, endsAt, busy, onMove, children }: { view: FourView; endsAt: number | null; busy?: boolean; onMove: (m: FourMove) => void; children?: ReactNode }) {
  const { still, fx } = useTableFx();
  const room = useBoardRoom(CHROME);
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
  // The board takes the width it is given, as long as it still fits the sheet's height (1 + 2 for the bezel's hairline).
  const cell = Math.floor(Math.min((width - PAD * 2 - 2) / COLS, (room - PAD * 2 - 2) / ROWS));
  const boardW = cell * COLS + PAD * 2 + 2;
  const boardH = cell * ROWS + PAD * 2 + 2;
  const disc = Math.round(cell * 0.8);
  const hole = disc - 2;
  const rim = Math.ceil(cell * 0.4);
  const cellArt = roomArt('dort-tas-hucre');
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
    <View style={{ gap: 10 }} onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      <DuelHeader seats={view.seats} me={me} turn={view.turn} playing={playing} endsAt={endsAt} wins={view.wins} winner={view.winner} tints={[DISC_COLORS[view.discs[0] ?? 0].base, DISC_COLORS[view.discs[1] ?? 1].base]} token={(seat) => <View style={s.token}><Disc color={view.discs[seat] ?? seat} size={18} /></View>} />
      {width > 0 && (
        <View style={{ alignSelf: 'center', width: boardW }}>
          <View style={{ height: 24, justifyContent: 'flex-end' }}>{myTurn && mine !== null && <Arrows cell={cell} open={open} color={DISC_COLORS[mine].base} still={still} />}</View>
          <Bezel width={boardW} height={boardH} radius={20} inset={PAD + 1} tone={BEZEL.plastic} glow={over && view.line ? '#FFD166' : myTurn && mine !== null ? DISC_COLORS[mine].base : null} over>
            {/* The discs, behind the board's face. */}
            {board.map((color, i) => {
              if (color === null) return null;
              const col = i % COLS;
              const row = Math.floor(i / COLS);
              const lit = !!view.line?.includes(i);
              return (
                <View key={`${view.hand}:${i}`} style={{ position: 'absolute', left: col * cell + (cell - disc) / 2, top: (ROWS - 1 - row) * cell + (cell - disc) / 2 }}>
                  <BoardDisc color={color} size={disc} drop={i === came ? (ROWS - row) * cell : 0} lit={lit} faint={over && !!view.line && !lit} newest={playing && view.last !== null && cellOf(view.last.col, view.last.row) === i} still={still} fx={fx} />
                </View>
              );
            })}
            {/* The board's face: a wall with a round hole per cell, the falling disc showing through; each hole's
                edge is bevelled, dark where the wall shades it and lit along its lower lip. */}
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: cell * COLS, height: cell * ROWS, flexDirection: 'row', flexWrap: 'wrap' }}>
              {Array.from({ length: COLS * ROWS }, (_, i) =>
                cellArt ? (
                  <Image key={i} source={cellArt} style={{ width: cell, height: cell }} />
                ) : (
                  <View key={i} style={{ width: cell, height: cell, overflow: 'hidden' }}>
                    <View style={{ position: 'absolute', left: (cell - hole) / 2 - rim, top: (cell - hole) / 2 - rim, width: hole + rim * 2, height: hole + rim * 2, borderRadius: hole / 2 + rim, borderWidth: rim, borderColor: FRAME }} />
                    <View style={[s.lip, { left: (cell - hole) / 2 - 1, top: (cell - hole) / 2 - 1, width: hole + 2, height: hole + 2, borderRadius: hole / 2 + 1 }]} />
                  </View>
                ),
              )}
            </View>
            {/* A column is one wide button. */}
            <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, flexDirection: 'row' }}>
              {open.map((ok, col) => (
                <Pressable key={col} onPress={() => tap(col)} disabled={!myTurn || !!busy} style={{ width: cell, height: '100%' }} accessibilityRole="button" accessibilityLabel={`${col + 1}. sütun${ok ? '' : ', dolu'}`} />
              ))}
            </View>
          </Bezel>
          {/* The stand the board sits in. */}
          <LinearGradient colors={['#2A62B0', '#143468']} style={s.foot} />
        </View>
      )}
      {over && tone ? (
        <EndCard inline tone={tone} title={prompt} sub={sub} size={boardW} still={still}>
          {children}
        </EndCard>
      ) : (
        <>
          <StatusLine text={prompt} lit={myTurn} tint={mine !== null ? DISC_COLORS[mine].base : undefined} />
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
  lip: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(0,0,0,0.3)', borderTopColor: 'rgba(0,0,0,0.6)', borderBottomColor: 'rgba(255,255,255,0.32)' },
  foot: { height: 10, marginTop: -3, marginHorizontal: 10, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderWidth: 1, borderTopWidth: 0, borderColor: 'rgba(255,255,255,0.14)', boxShadow: '0 6px 12px rgba(0,0,0,0.5)' },
  litRing: { position: 'absolute', left: -2, top: -2, right: -2, bottom: -2, borderWidth: 3, borderColor: '#FFFFFF', boxShadow: '0 0 12px rgba(255,255,255,0.9)' },
  newest: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  token: { borderRadius: 11, borderWidth: 2, borderColor: '#0A1426' },
  note: { color: colors.textDim, fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
