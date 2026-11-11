// Oda oyunları in a live room: the room's table on the server (lib/live/room-table, server/api/room-games.mjs), drawn
// like the demo's games (components/games/room-games). The server rolls the die, deals the cards, checks every move
// and plays a turn that ran out; this screen only shows the table and sends my taps. The room staff open a table;
// anyone in the room may sit while it waits, the others watch. Never touches the room's seats or microphones.
//
// What every game shares is here: reading the table, opening it, sitting down, starting, leaving. A game with a
// screen of its own (components/games/room/: Ludo) is handed its table and those buttons; Renk Kartları and XOX are
// still drawn here.
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { CardView, playable, roomGameStyles as g, winnerOf } from '@/components/games/room-games';
import { LudoLive, LudoModePicker } from '@/components/games/room/ludo';
import { Photo } from '@/components/photo';
import { Text } from '@/components/text';
import type { ServerTable, TableAction } from '@/lib/api';
import { errorHaptic, tapHaptic } from '@/lib/haptics';
import { myServerId } from '@/lib/live';
import { useRoomTable } from '@/lib/live/room-table';
import type { LudoMode } from '@/lib/room-games/ludo';
import { colors, semantic } from '@/theme';

export type TableGame = ServerTable['game'];
export const TABLE_GAMES: TableGame[] = ['ludo', 'cards', 'xox'];
export const isTableGame = (id: string): id is TableGame => (TABLE_GAMES as string[]).includes(id);
const NAMES: Record<TableGame, string> = { ludo: 'Ludo', cards: 'Renk Kartları', xox: 'XOX' };

function Btn({ label, onPress, disabled, ghost }: { label: string; onPress: () => void; disabled?: boolean; ghost?: boolean }) {
  return (
    <Pressable style={[g.btn, (disabled || ghost) && g.btnOff]} disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={[g.btnText, ghost && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

/** Seconds left in the turn, ticking. */
function useSecondsLeft(ends: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ends) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ends]);
  return ends ? Math.max(0, Math.ceil((Date.parse(ends) - now) / 1000)) : null;
}

export function LiveTable({ roomId, game, canOpen }: { roomId: string; game: TableGame; canOpen: boolean }) {
  const { table, state, error, act, reload } = useRoomTable(roomId);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Ludo's opener picks the short game or the long one.
  const [mode, setMode] = useState<LudoMode>('quick');
  const left = useSecondsLeft(table?.status === 'playing' ? table.turnEndsAt : null);
  /** `quiet`: the game's own screen already answered the tap (a sound, a tick). */
  const run = async (action: TableAction, extra?: Parameters<typeof act>[1], quiet = false) => {
    if (busy) return;
    setBusy(true);
    if (!quiet) tapHaptic();
    const e = await act(action, extra);
    setNote(e);
    if (e) errorHaptic();
    setBusy(false);
  };
  const noteLine = note ? <Text style={[g.log, { color: colors.gold }]}>{note}</Text> : null;

  if (!table && state === 'loading') return <Text style={g.log}>Masa yükleniyor…</Text>;
  if (!table && state === 'failed')
    return (
      <View style={{ gap: 10 }}>
        <Text style={g.log}>Masa açılamadı: {error}</Text>
        <Btn label="Tekrar dene" onPress={reload} />
      </View>
    );
  if (!table)
    return (
      <View style={{ gap: 10 }}>
        <Text style={g.log}>{canOpen ? `Odada açık masa yok. ${NAMES[game]} masasını aç; odadakiler masaya oturur.` : `Odada açık masa yok. ${NAMES[game]} masasını oda sahibi veya yöneticiler açar.`}</Text>
        {canOpen && game === 'ludo' && <LudoModePicker mode={mode} onChange={setMode} />}
        {canOpen && <Btn label={`${NAMES[game]} masası aç`} disabled={busy} onPress={() => run('open', game === 'ludo' ? { game, options: { mode } } : { game })} />}
        {noteLine}
      </View>
    );

  // As the server: whoever opened it, the room staff, or the first seat once the opener has left the table.
  const opener = canOpen || table.openedBy === myServerId() || (table.mySeat === 0 && !table.seats.some((p) => p.id === table.openedBy));
  if (table.game !== game)
    return (
      <View style={{ gap: 10 }}>
        <Text style={g.log}>Odada şu an bir {table.name} masası var; önce o bitmeli ya da kapanmalı.</Text>
        {opener && <Btn label={`${table.name} masasını kapat`} ghost disabled={busy} onPress={() => run('close')} />}
        {noteLine}
      </View>
    );

  const me = table.mySeat;
  const seated = me >= 0;
  const myTurn = table.status === 'playing' && table.turn === me;
  const turnName = table.seats[table.turn]?.name ?? '';
  const full = table.seats.length >= table.max;

  const seatsRow = (
    <View style={g.rowWrap}>
      {table.seats.map((p, i) => (
        <View key={p.id} style={[g.opp, table.status === 'playing' && table.turn === i && { borderColor: semantic.action }]}>
          <Photo uri={p.avatarUrl ?? ''} kind="face" style={g.avSmall} />
          <Text style={g.small}>
            {i === me ? 'Sen' : p.name}
            {table.game === 'cards' && table.status !== 'waiting' && table.counts ? ` · ${table.counts[i]} kart` : ''}
          </Text>
        </View>
      ))}
    </View>
  );

  const over = table.status === 'over';
  // The table's buttons, the same for every game: while it waits, and during and after a hand.
  const waitingButtons = (
    <>
      {!seated && !full && <Btn label="Masaya otur" disabled={busy} onPress={() => run('join')} />}
      {seated && opener && <Btn label={table.seats.length < table.min ? `En az ${table.min} oyuncu bekleniyor` : 'Başlat'} disabled={busy || table.seats.length < table.min} onPress={() => run('start')} />}
      {seated && <Btn label="Masadan kalk" ghost disabled={busy} onPress={() => run('leave')} />}
      {opener && !seated && <Btn label="Masayı kapat" ghost disabled={busy} onPress={() => run('close')} />}
      {noteLine}
    </>
  );
  const handButtons = (
    <>
      {over && seated && table.seats.length >= table.min && <Btn label="Yeniden oyna" disabled={busy} onPress={() => run('again')} />}
      {over && !seated && !full && <Btn label="Masaya otur" disabled={busy} onPress={() => run('join')} />}
      {seated && <Btn label="Masadan kalk" ghost disabled={busy} onPress={() => run('leave')} />}
      {over && opener && <Btn label="Masayı kapat" ghost disabled={busy} onPress={() => run('close')} />}
      {noteLine}
    </>
  );
  if (table.game === 'ludo')
    return (
      <LudoLive table={table} busy={busy} onMove={(move) => run('move', { move }, true)}>
        {table.status === 'waiting' ? waitingButtons : handButtons}
      </LudoLive>
    );

  if (table.status === 'waiting')
    return (
      <View style={{ gap: 10 }}>
        {seatsRow}
        <Text style={g.log}>
          {table.seats.length}/{table.max} oyuncu · en az {table.min} · {table.log}
        </Text>
        {waitingButtons}
      </View>
    );

  const status = over ? (table.winner !== null && table.winner === me ? '🏆 Kazandın!' : table.log) : `${table.log}${left !== null ? ` · ${myTurn ? 'senin sıran' : turnName} ${left} sn` : ''}`;
  return (
    <View style={{ gap: 10 }}>
      {seatsRow}
      {table.game === 'cards' && table.top && (
        <>
          <View style={{ alignItems: 'center' }}>
            <CardView card={table.top} big />
          </View>
          <Text style={g.log}>{status}</Text>
          {table.hand && (
            <View style={g.rowWrap}>
              {table.hand.map((c, i) => (
                <Pressable
                  key={i}
                  disabled={!myTurn || busy || !playable(c, table.top!)}
                  onPress={() => run('move', { move: { card: i } })}
                  style={{ opacity: myTurn && playable(c, table.top!) ? 1 : 0.45 }}
                  accessibilityLabel={`Kart ${c.value}`}
                >
                  <CardView card={c} />
                </Pressable>
              ))}
            </View>
          )}
          {!over && seated && <Btn label={myTurn ? 'Kart çek' : `${turnName} oynuyor…`} disabled={!myTurn || busy} onPress={() => run('move', { move: { card: null } })} />}
        </>
      )}
      {table.game === 'xox' && table.board && (
        <View style={{ gap: 10, alignItems: 'center' }}>
          <Text style={g.log}>{over ? status : myTurn ? `Sıra sende (${me === 0 ? 'X' : 'O'})${left !== null ? ` · ${left} sn` : ''}` : `${turnName} düşünüyor…`}</Text>
          <View style={g.xox}>
            {table.board.map((v, i) => (
              <Pressable
                key={i}
                style={[g.xoxCell, winnerOf(table.board!)?.includes(i) && { backgroundColor: 'rgba(19,217,223,0.25)' }]}
                disabled={!!v || !myTurn || busy}
                onPress={() => run('move', { move: { cell: i } })}
                accessibilityLabel={`Kare ${i + 1}`}
              >
                <Text style={[g.xoxText, { color: v === 'X' ? semantic.action : colors.pink }]}>{v ?? ''}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      {!seated && !over && <Text style={g.log}>Masayı izliyorsun; el bitince boş koltuğa oturabilirsin.</Text>}
      {handButtons}
    </View>
  );
}
