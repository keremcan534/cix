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

import { MARK_ART, RoomArtImage, roomArtSet } from '@/components/games/room/table-art';
import { ActionButton, BEZEL, Bezel, DrawnRing, DuelHeader, EndCard, StatusLine, alpha, endSound, firstName, rnd, useBoardRoom, usePracticeTable, useSecondsLeft, useTableFx, type Seat } from '@/components/games/room/table-kit';
import { Text } from '@/components/text';
import type { XoxServerTable } from '@/lib/api';
import { playSfx, warmSfx } from '@/lib/game-sound';
import { errorHaptic, pressHaptic, successHaptic } from '@/lib/haptics';
import { botCell, moveTable, openTable, sitDown, startTable, timeoutTable, xoxLine, type Mark, type XoxMove, type XoxTable } from '@/lib/room-games/xox';
import { colors } from '@/theme';

/** What the stage shows. `me` −1: I watch. `marks`: seat → its mark. */
export type XoxView = { status: 'waiting' | 'playing' | 'over'; turn: number; winner: number | null; seats: Seat[]; me: number; board: (Mark | null)[]; marks: Mark[]; wins: number[] };

export const MARK_COLORS: Record<Mark, string> = { X: '#13D9DF', O: '#FF6576' };
/** Each mark's light and deep tone: the stroke is a lit tube, not a flat bar. */
const MARK_TONES: Record<Mark, [string, string]> = { X: ['#B4F8FA', '#0A8F95'], O: ['#FFC9CF', '#C93C4F'] };
const GAP = 8;
/** The bezel round the cells. */
const INSET = 10;
/** What the stage draws round the board: the players' plates, the status line and the gaps between them. */
const CHROME = 120;
const LINE = '#FFD166';

/** One stroke of an X: a lit tube that runs in from one end. */
function Stroke({ length, thick, mark, turn, t }: { length: number; thick: number; mark: Mark; turn: string; t: Animated.AnimatedInterpolation<number> }) {
  const [light, deep] = MARK_TONES[mark];
  return (
    <View style={{ position: 'absolute', width: length, height: thick, borderRadius: thick / 2, overflow: 'hidden', transform: [{ rotate: turn }] }}>
      <Animated.View style={{ flex: 1, borderRadius: thick / 2, overflow: 'hidden', transform: [{ translateX: t }] }}>
        <LinearGradient colors={[light, MARK_COLORS[mark], deep]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

/**
 * A mark in its cell. `fresh`: just placed, so it is drawn in, and its glow blooms as the stroke closes. `lit`: one
 * of the winning three. `faint`: the hand is over and it isn't.
 */
function MarkView({ mark, cell, fresh, lit, faint, still, fx }: { mark: Mark; cell: number; fresh: boolean; lit: boolean; faint: boolean; still: boolean; fx: boolean }) {
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
    if (!lit || !fx) return void beat.setValue(0);
    const a = Animated.loop(Animated.sequence([Animated.timing(beat, { toValue: 1, duration: 480, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.timing(beat, { toValue: 0, duration: 480, easing: Easing.inOut(Easing.quad), useNativeDriver: true })]));
    a.start();
    return () => a.stop();
  }, [lit, fx, beat]);
  const color = MARK_COLORS[mark];
  const length = cell * 0.62;
  const thick = Math.max(8, cell * 0.15);
  const ring = cell * 0.56;
  const art = roomArtSet(MARK_ART);
  const bloom = t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 0.15, 1] });
  const halo = `0 0 ${Math.round(thick * 1.6)}px ${color}`;
  let body: ReactNode;
  if (art)
    body = (
      <Animated.View style={{ opacity: t, transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
        <RoomArtImage source={art[mark === 'X' ? 0 : 1]} w={cell * 0.78} />
      </Animated.View>
    );
  else
    body = (
      <>
        {/* The glow under the stroke. */}
        <Animated.View pointerEvents="none" style={[s.fill, { opacity: bloom }]}>
          {mark === 'X' ? (
            ['45deg', '-45deg'].map((r) => <View key={r} style={{ position: 'absolute', width: length, height: thick, borderRadius: thick / 2, backgroundColor: alpha(color, 0.45), boxShadow: halo, transform: [{ rotate: r }] }} />)
          ) : (
            <View style={{ width: ring, height: ring, borderRadius: ring / 2, borderWidth: thick, borderColor: alpha(color, 0.45), boxShadow: `${halo}, inset ${halo}` }} />
          )}
        </Animated.View>
        {mark === 'X' ? (
          <>
            <Stroke length={length} thick={thick} mark="X" turn="45deg" t={t.interpolate({ inputRange: [0, 0.55, 1], outputRange: [-length, 0, 0] })} />
            <Stroke length={length} thick={thick} mark="X" turn="-45deg" t={t.interpolate({ inputRange: [0, 0.45, 1], outputRange: [-length, -length, 0] })} />
          </>
        ) : drawn ? (
          <View style={{ width: ring, height: ring, borderRadius: ring / 2, borderWidth: thick, borderColor: color }}>
            {/* The tube's light along its upper arc. */}
            <View style={{ position: 'absolute', left: -thick * 0.72, top: -thick * 0.72, right: -thick * 0.72, bottom: -thick * 0.72, borderRadius: ring, borderWidth: thick * 0.32, borderColor: 'transparent', borderTopColor: alpha(MARK_TONES.O[0], 0.85), transform: [{ rotate: '-35deg' }] }} />
          </View>
        ) : (
          <DrawnRing size={ring} width={thick} color={color} t={t} />
        )}
      </>
    );
  return <Animated.View style={{ width: cell, height: cell, alignItems: 'center', justifyContent: 'center', opacity: faint ? 0.28 : 1, transform: [{ scale: beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }}>{body}</Animated.View>;
}

/** The stroke through the winning three: it sweeps from the first to the last with a spark at its head, then pulses. */
function WinLine({ line, cell, still, fx }: { line: number[]; cell: number; still: boolean; fx: boolean }) {
  const [t] = useState(() => new Animated.Value(still ? 1 : 0));
  const [beat] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (still) return;
    const pulse = Animated.loop(Animated.sequence([Animated.timing(beat, { toValue: 0.55, duration: 520, useNativeDriver: true }), Animated.timing(beat, { toValue: 1, duration: 520, useNativeDriver: true })]));
    const a = Animated.timing(t, { toValue: 1, duration: 420, delay: 160, easing: Easing.inOut(Easing.cubic), useNativeDriver: true });
    a.start(() => fx && pulse.start());
    return () => {
      a.stop();
      pulse.stop();
    };
  }, [still, fx, t, beat]);
  const [a, , c] = line;
  const at = (i: number) => ({ x: (i % 3) * (cell + GAP) + cell / 2, y: Math.floor(i / 3) * (cell + GAP) + cell / 2 });
  const [from, to] = [at(a), at(c)];
  const length = Math.hypot(to.x - from.x, to.y - from.y) + cell * 0.7;
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  const h = Math.max(8, cell * 0.09);
  const spark = h * 3;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: (from.x + to.x) / 2 - length / 2, top: (from.y + to.y) / 2 - h / 2, width: length, height: h, transform: [{ rotate: `${angle}deg` }] }}>
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: length, height: h, borderRadius: h / 2, overflow: 'hidden', boxShadow: `0 0 14px ${LINE}`, opacity: beat, transformOrigin: 'left', transform: [{ scaleX: t }] }}>
        <LinearGradient colors={['#FFF4CC', LINE, '#E3A630']} style={StyleSheet.absoluteFill} />
      </Animated.View>
      {fx && (
        <Animated.View
          style={{
            position: 'absolute',
            left: -spark / 2,
            top: h / 2 - spark / 2,
            width: spark,
            height: spark,
            borderRadius: spark / 2,
            backgroundColor: '#FFFFFF',
            boxShadow: `0 0 16px ${LINE}`,
            opacity: t.interpolate({ inputRange: [0, 0.05, 0.85, 1], outputRange: [0, 1, 1, 0] }),
            transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, length] }) }],
          }}
        />
      )}
    </View>
  );
}

function XoxStage({ view, endsAt, busy, onMove, children }: { view: XoxView; endsAt: number | null; busy?: boolean; onMove: (m: XoxMove) => void; children?: ReactNode }) {
  const { still, fx } = useTableFx();
  const room = useBoardRoom(CHROME);
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
  // The board takes the width it is given, as long as it still fits the sheet's height with the players and the line.
  const cell = Math.floor((Math.min(width, room) - INSET * 2 - GAP * 2) / 3);
  const side = cell * 3 + GAP * 2;
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
    <View style={{ gap: 12 }} onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}>
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
          <View style={[s.token, { borderColor: MARK_COLORS[view.marks[seat] ?? (seat === 0 ? 'X' : 'O')], boxShadow: `0 0 6px ${MARK_COLORS[view.marks[seat] ?? (seat === 0 ? 'X' : 'O')]}` }]}>
            <Text style={[s.tokenText, { color: MARK_COLORS[view.marks[seat] ?? (seat === 0 ? 'X' : 'O')] }]}>{view.marks[seat] ?? (seat === 0 ? 'X' : 'O')}</Text>
          </View>
        )}
      />
      {width > 0 && (
        <View style={{ alignSelf: 'center' }}>
          <Bezel width={side + INSET * 2} height={side + INSET * 2} radius={26} inset={INSET} tone={BEZEL.night} glow={over ? (tone === 'draw' ? null : LINE) : myTurn && myMark ? MARK_COLORS[myMark] : null}>
            <View style={{ width: side, height: side, flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
              {board.map((v, i) => {
                const lit = !!line?.includes(i);
                const open = myTurn && !v;
                return (
                  <Pressable key={i} onPress={() => tap(i)} disabled={!myTurn || !!busy} style={[s.cell, { width: cell, height: cell, borderRadius: cell * 0.18 }, open && s.cellOpen]} accessibilityRole="button" accessibilityLabel={`Kare ${i + 1}${v ? `, ${v}` : ', boş'}`}>
                    <LinearGradient colors={lit ? [alpha(LINE, 0.3), '#0B1730'] : open ? ['#15294F', '#0D1B38'] : ['#0D1A35', '#09142B']} style={[StyleSheet.absoluteFill, { borderRadius: cell * 0.18 }]} />
                    <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.sunk, { borderRadius: cell * 0.18 }]} />
                    {v && <MarkView mark={v} cell={cell} fresh={!!before && before.board[i] !== v} lit={lit} faint={over && !lit} still={still} fx={fx} />}
                  </Pressable>
                );
              })}
              {line && <WinLine line={line} cell={cell} still={still} fx={fx} />}
            </View>
          </Bezel>
        </View>
      )}
      {over && tone ? (
        <EndCard inline tone={tone} title={prompt} sub={sub} size={side} still={still}>
          {children}
        </EndCard>
      ) : (
        <>
          <StatusLine text={prompt} lit={myTurn} tint={myMark ? MARK_COLORS[myMark] : undefined} />
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
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  cell: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderBottomColor: 'rgba(255,255,255,0.12)' },
  cellOpen: { borderColor: 'rgba(255,255,255,0.16)', borderBottomColor: 'rgba(255,255,255,0.22)' },
  sunk: { boxShadow: 'inset 0 3px 7px rgba(0,0,0,0.55)' },
  token: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#0A1426', borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tokenText: { fontSize: 12, lineHeight: 15, fontWeight: '900' },
  note: { color: colors.textDim, fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
