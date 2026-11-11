// Free room games, playable in the prototype with room participants (other players are simulated). A live build's
// room plays them at the server's table instead (components/games/room-tables, same look: COLORS, CardView, styles).
// Pure game state: these components never touch the room, seats or microphones. Renk Kartları and XOX are here;
// a game with a screen of its own is in components/games/room/ (Ludo: room/ludo).
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import type { User } from '@/data/mock';
import { colors, semantic } from '@/theme';
import { Photo } from '@/components/photo';

export type Player = Pick<User, 'id' | 'name' | 'avatar'>;
export const COLORS = ['#13D9DF', '#FF6576', '#F6BD60', '#22C55E'];
const rnd = (n: number) => Math.floor(Math.random() * n);

// --- Renk Kartları (UNO-like mechanic with original naming)
export type Card = { color: number; value: number | '+2' | 'Atla' };
const newCard = (): Card => ({ color: rnd(4), value: rnd(10) < 8 ? rnd(10) : rnd(2) ? '+2' : 'Atla' });
export const playable = (c: Card, top: Card) => c.color === top.color || c.value === top.value;

export function ColorCards({ players: roomPlayers }: { players: Player[] }) {
  // Fixed when the game opens and on "Yeniden oyna" (like Ludo): a hand per player, even if the room changes.
  const [players, setPlayers] = useState(roomPlayers);
  const [hands, setHands] = useState<Card[][]>(() => players.map(() => Array.from({ length: 5 }, newCard)));
  const [top, setTop] = useState<Card>(() => ({ color: rnd(4), value: rnd(10) }));
  const [turn, setTurn] = useState(0);
  const [log, setLog] = useState('Rengi veya sayısı aynı kartı at. Atamazsan kart çek.');
  const [winner, setWinner] = useState<number | null>(null);
  // Counts moves: with two players a skip gives the turn back to the same player, and the turn alone wouldn't change.
  const [moves, setMoves] = useState(0);

  const play = (who: number, idx: number | null) => {
    const hand = hands[who];
    const nextHands = hands.map((h) => [...h]);
    let step = 1;
    if (idx === null) {
      nextHands[who].push(newCard());
      setLog(`${players[who].name} kart çekti`);
    } else {
      const card = hand[idx];
      nextHands[who].splice(idx, 1);
      setTop(card);
      if (card.value === '+2') {
        const victim = (who + 1) % players.length;
        nextHands[victim].push(newCard(), newCard());
        setLog(`${players[who].name} +2 attı: ${players[victim].name} 2 kart çekti`);
      } else if (card.value === 'Atla') {
        step = 2;
        setLog(`${players[who].name} sırayı atlattı`);
      } else setLog(`${players[who].name} kart attı`);
      if (nextHands[who].length === 0) {
        setWinner(who);
        setLog(`🏆 ${players[who].name} kartlarını bitirdi!`);
      } else if (nextHands[who].length === 1) setLog((l) => `${l} · SON KART!`);
    }
    setHands(nextHands);
    setTurn((t) => (t + step) % players.length);
    setMoves((m) => m + 1);
  };

  useEffect(() => {
    if (winner !== null || turn === 0) return;
    const t = setTimeout(() => {
      const i = hands[turn].findIndex((c) => playable(c, top));
      play(turn, i >= 0 ? i : null);
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, winner, moves]);

  return (
    <View style={{ gap: 10 }}>
      <View style={g.rowWrap}>
        {players.slice(1).map((p, i) => (
          <View key={p.id} style={[g.opp, turn === i + 1 && { borderColor: semantic.action }]}>
            <Photo uri={p.avatar} kind="face" style={g.avSmall} />
            <Text style={g.small}>
              {p.name} · {hands[i + 1].length} kart
            </Text>
          </View>
        ))}
      </View>
      <View style={{ alignItems: 'center' }}>
        <CardView card={top} big />
      </View>
      <Text style={g.log}>{log}</Text>
      <View style={g.rowWrap}>
        {hands[0].map((c, i) => (
          <Pressable key={i} disabled={turn !== 0 || winner !== null || !playable(c, top)} onPress={() => play(0, i)} style={{ opacity: turn === 0 && playable(c, top) ? 1 : 0.45 }} accessibilityLabel={`Kart ${c.value}`}>
            <CardView card={c} />
          </Pressable>
        ))}
      </View>
      {winner === null ? (
        <Pressable style={[g.btn, turn !== 0 && g.btnOff]} disabled={turn !== 0} onPress={() => play(0, null)}>
          <Text style={g.btnText}>{turn === 0 ? 'Kart çek' : `${players[turn].name} oynuyor…`}</Text>
        </Pressable>
      ) : (
        <Pressable
          style={g.btn}
          onPress={() => {
            setPlayers(roomPlayers);
            setHands(roomPlayers.map(() => Array.from({ length: 5 }, newCard)));
            setTop({ color: rnd(4), value: rnd(10) });
            setTurn(0);
            setWinner(null);
          }}
        >
          <Text style={g.btnText}>Yeniden oyna</Text>
        </Pressable>
      )}
    </View>
  );
}

export function CardView({ card, big }: { card: Card; big?: boolean }) {
  return (
    <View style={[g.card, { backgroundColor: COLORS[card.color] }, big && g.cardBig]}>
      <Text style={[g.cardText, big && { fontSize: 26 }]}>{card.value}</Text>
    </View>
  );
}

// --- XOX
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export const winnerOf = (b: (string | null)[]) => LINES.find(([a, c, d]) => b[a] && b[a] === b[c] && b[a] === b[d]);
function botMove(b: (string | null)[]) {
  for (const mark of ['O', 'X']) {
    for (const [a, c, d] of LINES) {
      const cells = [a, c, d];
      const mine = cells.filter((i) => b[i] === mark).length;
      const empty = cells.find((i) => !b[i]);
      if (mine === 2 && empty !== undefined) return empty;
    }
  }
  if (!b[4]) return 4;
  const free = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  return free[rnd(free.length)];
}

export function Xox({ players }: { players: Player[] }) {
  const [board, setBoard] = useState<(string | null)[]>(Array(9).fill(null));
  const line = winnerOf(board);
  const full = board.every(Boolean);
  const done = !!line || full;
  const xTurn = board.filter(Boolean).length % 2 === 0;

  useEffect(() => {
    if (done || xTurn) return;
    const t = setTimeout(() => setBoard((b) => b.map((v, i) => (i === botMove(b) ? 'O' : v))), 600);
    return () => clearTimeout(t);
  }, [board, done, xTurn]);

  const status = line ? (board[line[0]] === 'X' ? '🏆 Kazandın!' : `${players[1]?.name ?? 'Rakip'} kazandı`) : full ? 'Berabere' : xTurn ? 'Sıra sende (X)' : `${players[1]?.name ?? 'Rakip'} düşünüyor…`;
  return (
    <View style={{ gap: 10, alignItems: 'center' }}>
      <Text style={g.log}>{status}</Text>
      <View style={g.xox}>
        {board.map((v, i) => (
          <Pressable key={i} style={[g.xoxCell, line?.includes(i) && { backgroundColor: 'rgba(19,217,223,0.25)' }]} disabled={!!v || done || !xTurn} onPress={() => setBoard((b) => b.map((x, j) => (j === i ? 'X' : x)))} accessibilityLabel={`Kare ${i + 1}`}>
            <Text style={[g.xoxText, { color: v === 'X' ? semantic.action : colors.pink }]}>{v ?? ''}</Text>
          </Pressable>
        ))}
      </View>
      {done && (
        <Pressable style={g.btn} onPress={() => setBoard(Array(9).fill(null))}>
          <Text style={g.btnText}>Yeniden oyna</Text>
        </Pressable>
      )}
    </View>
  );
}

const g = StyleSheet.create({
  avSmall: { width: 26, height: 26, borderRadius: 13 },
  small: { color: colors.textDim, fontSize: 12, minWidth: 22, textAlign: 'center' },
  log: { color: colors.text, fontSize: 13, textAlign: 'center', minHeight: 18 },
  btn: { backgroundColor: semantic.action, borderRadius: 999, paddingVertical: 12, alignItems: 'center', alignSelf: 'stretch' },
  btnOff: { backgroundColor: colors.cardAlt },
  btnText: { color: semantic.actionInk, fontWeight: '900' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  opp: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: 'transparent', borderRadius: 999, paddingRight: 8, paddingLeft: 2, paddingVertical: 2, backgroundColor: colors.cardAlt },
  card: { width: 40, height: 58, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  cardBig: { width: 62, height: 88 },
  cardText: { color: colors.bg, fontWeight: '900', fontSize: 15 },
  xox: { width: 210, height: 210, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  xoxCell: { width: 66, height: 66, borderRadius: 12, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  xoxText: { fontSize: 34, fontWeight: '900' },
});
export { g as roomGameStyles };
