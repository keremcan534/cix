// Oda oyunları in a live room: the room's table on the server (lib/live/room-table, server/api/room-games.mjs), drawn
// like the demo's games (components/games/room-games). The server rolls the die, deals the cards, checks every move
// and plays a turn that ran out; this screen only shows the table and sends my taps. The room staff open a table;
// anyone in the room may sit while it waits, the others watch. Never touches the room's seats or microphones.
//
// What every game shares is here: reading the table, opening it, sitting down, starting, leaving. Each game has a
// screen of its own (components/games/room/: Ludo, Renk Kartları, XOX, Dört Taş), which is handed its table and
// those buttons.
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { roomGameStyles as g } from '@/components/games/room-games';
import { CardsLive } from '@/components/games/room/cards';
import { FourLive } from '@/components/games/room/four';
import { LudoLive, LudoModePicker } from '@/components/games/room/ludo';
import { XoxLive } from '@/components/games/room/xox';
import { Text } from '@/components/text';
import type { ServerTable, TableAction } from '@/lib/api';
import { errorHaptic, tapHaptic } from '@/lib/haptics';
import { myServerId } from '@/lib/live';
import { useRoomTable } from '@/lib/live/room-table';
import type { LudoMode } from '@/lib/room-games/ludo';
import { colors } from '@/theme';

export type TableGame = ServerTable['game'];
export const TABLE_GAMES: TableGame[] = ['ludo', 'cards', 'xox', 'four'];
export const isTableGame = (id: string): id is TableGame => (TABLE_GAMES as string[]).includes(id);
const NAMES: Record<TableGame, string> = { ludo: 'Ludo', cards: 'Renk Kartları', xox: 'XOX', four: 'Dört Taş' };

function Btn({ label, onPress, disabled, ghost }: { label: string; onPress: () => void; disabled?: boolean; ghost?: boolean }) {
  return (
    <Pressable style={[g.btn, (disabled || ghost) && g.btnOff]} disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={[g.btnText, ghost && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function LiveTable({ roomId, game, canOpen }: { roomId: string; game: TableGame; canOpen: boolean }) {
  const { table, state, error, act, reload } = useRoomTable(roomId);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Ludo's opener picks the short game or the long one.
  const [mode, setMode] = useState<LudoMode>('quick');
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

  const seated = table.mySeat >= 0;
  const full = table.seats.length >= table.max;

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
      <LudoLive table={table} busy={busy} onMove={(move) => run('move', { move }, true)} onAgain={over && seated && table.seats.length >= table.min ? () => run('again') : undefined}>
        {table.status === 'waiting' ? waitingButtons : handButtons}
      </LudoLive>
    );

  // The table's buttons as each game's own screen places them.
  const buttons = table.status === 'waiting' ? waitingButtons : handButtons;
  if (table.game === 'cards')
    return (
      <CardsLive table={table} busy={busy} onMove={(move) => run('move', { move }, true)}>
        {buttons}
      </CardsLive>
    );
  if (table.game === 'four')
    return (
      <FourLive table={table} busy={busy} onMove={(move) => run('move', { move }, true)}>
        {buttons}
      </FourLive>
    );
  return (
    <XoxLive table={table} busy={busy} onMove={(move) => run('move', { move }, true)}>
      {buttons}
    </XoxLive>
  );
}
