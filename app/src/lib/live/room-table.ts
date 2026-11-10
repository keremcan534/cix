// Live mode (lib/live): the room's game table (Ludo, Renk Kartları, XOX) on the server (server/api/room-games.mjs).
// The server rolls, deals, checks every move and plays a run-out turn; after each change it tells the room (packet
// 'table', lib/live/room-bus) and every phone here reads the table again, so all of them show the same game. A
// turn's end is also a moment to read it, so a table nobody touches still moves on. My own cards come only to me.
import { useCallback, useEffect, useRef, useState } from 'react';

import * as api from '@/lib/api';
import { message, rememberUser } from '@/lib/live';
import { onServerTable } from '@/lib/live/room-bus';

export type TableView = { table: api.ServerTable | null; state: 'loading' | 'ready' | 'failed'; error: string | null };

/** The room's table, read on open, on the room's packet and when a turn runs out; `act` sends one action. */
export function useRoomTable(roomId: string, on = true) {
  const [view, setView] = useState<TableView>({ table: null, state: 'loading', error: null });
  // A read that started before my own action's answer would put an older table back.
  const seq = useRef(0);
  const read = useCallback(() => {
    const n = ++seq.current;
    api.roomTable(roomId).then(
      (table) => {
        if (n !== seq.current) return;
        table?.seats.forEach(rememberUser);
        setView({ table, state: 'ready', error: null });
      },
      (e: unknown) => n === seq.current && setView((v) => ({ ...v, state: v.table ? 'ready' : 'failed', error: message(e) })),
    );
  }, [roomId]);
  useEffect(() => {
    if (!on) return;
    read();
    return onServerTable(roomId, read);
  }, [on, roomId, read]);
  // When the turn runs out the server plays it on the next read: read just after.
  const ends = view.table?.status === 'playing' ? view.table.turnEndsAt : null;
  useEffect(() => {
    if (!on || !ends) return;
    const t = setTimeout(read, Math.max(500, Date.parse(ends) - Date.now() + 700));
    return () => clearTimeout(t);
  }, [on, ends, read]);

  const act = useCallback(
    async (action: api.TableAction, extra: Parameters<typeof api.roomTableAction>[2] = {}): Promise<string | null> => {
      const n = ++seq.current;
      try {
        const table = await api.roomTableAction(roomId, action, extra);
        if (n === seq.current) setView({ table, state: 'ready', error: null });
        return null;
      } catch (e) {
        read();
        return message(e);
      }
    },
    [roomId, read],
  );
  return { ...view, act, reload: read };
}

/**
 * Calls `onOpened` when a table opens in the room while I'm in it (read on the room's packet): the room hears of it as
 * the demo's chat line says. A table already there when I come in is not news.
 */
export function useTableNews(roomId: string, on: boolean, onOpened: (t: api.ServerTable) => void) {
  const cb = useRef(onOpened);
  useEffect(() => {
    cb.current = onOpened;
  });
  useEffect(() => {
    if (!on) return;
    let alive = true;
    // undefined until the first read; then the opening of the last table seen (null: none).
    let seen: string | null | undefined;
    const read = () =>
      void api.roomTable(roomId).then(
        (t) => {
          if (!alive) return;
          const opened = t?.openedAt ?? null;
          if (seen !== undefined && t && t.status === 'waiting' && opened !== seen) cb.current(t);
          seen = opened;
        },
        () => {},
      );
    read();
    const off = onServerTable(roomId, read);
    return () => {
      alive = false;
      off();
    };
  }, [roomId, on]);
}
