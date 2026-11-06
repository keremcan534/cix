// Ayarlar › Aktif oturumlar in a live build (giris-5, mantik-9, gorsel-7): the account's real sessions from the
// server (GET /api/sessions) with this phone's marked, and Sonlandır ends one on the server
// (POST /api/sessions/revoke) before the list is read again. The demo build keeps the store's sample list.
import { useCallback, useEffect, useState } from 'react';

import * as api from '@/lib/api';

export type SessionRow = { id: string; title: string; subtitle: string; current: boolean; web: boolean };
export type SessionsStatus = 'loading' | 'ready' | 'failed';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** "3 Kas" (with the year when it is not this year's). */
function shortDate(t: number, now: number) {
  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

/** How long ago a session was last used: "Az önce", "12 dk önce", "3 saat önce", "2 gün önce", then the date. */
export function agoText(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const ago = Math.max(0, now - t);
  if (ago < 2 * MIN) return 'Az önce';
  if (ago < HOUR) return `${Math.floor(ago / MIN)} dk önce`;
  if (ago < DAY) return `${Math.floor(ago / HOUR)} saat önce`;
  if (ago < 7 * DAY) return `${Math.floor(ago / DAY)} gün önce`;
  return shortDate(t, now);
}

/** The server's sessions as rows: this phone first, then by last use; a session without a device name says so. */
export function sessionRows(list: api.ServerSession[], now = Date.now()): SessionRow[] {
  const at = (s: api.ServerSession) => Date.parse(s.lastSeenAt) || 0;
  return [...list]
    .sort((a, b) => Number(b.current) - Number(a.current) || at(b) - at(a))
    .map((s) => {
      const device = (s.device ?? '').trim();
      const since = Number.isFinite(Date.parse(s.createdAt)) ? `Giriş ${shortDate(Date.parse(s.createdAt), now)}` : '';
      const used = s.current ? 'Şu an aktif' : `Son kullanım ${agoText(s.lastSeenAt, now)}`;
      return {
        id: s.id,
        title: s.current ? (device ? `Bu cihaz · ${device}` : 'Bu cihaz') : device || 'Başka bir cihaz',
        subtitle: [used, since].filter(Boolean).join(' · '),
        current: s.current,
        web: /web|chrome|safari|firefox|edge/i.test(device),
      };
    });
}

/** Reads the list from the server. */
export const loadSessions = async (now?: number) => sessionRows(await api.sessions(), now);

/** Ends a session on the server, then reads the list again (a session already gone just drops out). */
export async function revokeAndReload(id: string, now?: number) {
  await api.revokeSession(id);
  return loadSessions(now);
}

/** The screen's view of it: read once when `on`, again with reload(); revoke() ends one session. */
export function useLiveSessions(on: boolean) {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [status, setStatus] = useState<SessionsStatus>('loading');
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      loadSessions().then(
        (r) => {
          setRows(r);
          setStatus('ready');
        },
        () => setStatus('failed'),
      ),
    [],
  );
  useEffect(() => {
    if (on) void reload();
  }, [on, reload]);

  const revoke = useCallback(async (id: string) => {
    setBusy(id);
    try {
      setRows(await revokeAndReload(id));
      setStatus('ready');
    } finally {
      setBusy(null);
    }
  }, []);

  return { rows, status, busy, reload, revoke };
}
