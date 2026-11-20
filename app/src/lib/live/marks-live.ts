// Profil izleri's reads for the screens (lib/profile-marks has the rules, lib/mark-store the marks): who refuses marks
// (their look's noMarks, read with the room's people), which gift cleans a kind now, the Kutlama shelf's note, and my
// own marks read again when my profile tab opens (a Kaka sent to me outside a room arrives as a push only).
import { useEffect, useRef } from 'react';

import { userById } from '@/data/mock';
import * as api from '@/lib/api';
import { liveMode, myServerId, toLocal, toServer } from '@/lib/live';
import { giftMarkOf, roomGiftShelf } from '@/lib/live/catalog-live';
import { lookOf } from '@/lib/live/looks';
import { marksOf, onMarkNews, putMarks, reportMarkEvent } from '@/lib/mark-store';
import { MARK_HOURS, activeMark, markLine, parseMarks } from '@/lib/profile-marks';

/** The key lib/mark-store keeps `uid`'s marks under: their server id in live mode, the sample id in the demo. */
export const markKeyOf = (uid: string | null | undefined): string | null => (!uid ? null : liveMode() ? toServer(uid) : uid);

/** Whether `uid` refuses profile marks (Gizlilik): their look says so. The demo's people never do. */
export const refusesMarks = (uid: string) => (liveMode() ? lookOf(toServer(uid))?.noMarks === true : false);

/** The gift that cleans a mark of `kind` now (the cheapest on the shelves), or undefined. */
export function cleanGiftFor(kind: string) {
  return roomGiftShelf()
    .filter((g) => giftMarkOf(g.id)?.role === 'clean' && giftMarkOf(g.id)?.kind === kind)
    .sort((a, b) => a.price - b.price)[0];
}

/**
 * The Kutlama shelf's note while a gift on it leaves a mark: what it does, how long, what cleans it and that anyone may
 * refuse it. Null when no gift there does (the shelf's plain note then). Never a "spend more" nudge.
 */
export function marksShelfNote(): string | null {
  const leave = roomGiftShelf().find((g) => g.cat === 'gameplay' && giftMarkOf(g.id)?.role === 'leave');
  const rule = leave && giftMarkOf(leave.id);
  if (!leave || !rule) return null;
  const clean = cleanGiftFor(rule.kind);
  return `${leave.emoji} ${leave.name} alıcının profil fotoğrafında ${rule.hours ?? 24} saat iz bırakır${clean ? `; ${clean.emoji} ${clean.name} izi temizler` : ''}. İz istemeyen, Ayarlar › Gizlilik’ten kapatabilir.`;
}

let lastMine = 0;
/** My profile tab: my marks read again when it opens (at most once a minute), so a Kaka sent to me shows. */
export function useMyMarks(on: boolean) {
  useEffect(() => {
    const me = myServerId();
    if (!on || !liveMode() || !me || Date.now() - lastMine < 60_000) return;
    lastMine = Date.now();
    const started = Date.now();
    // card=1: the light read (no gift sum), as the room's person card asks.
    api
      .userProfile(me, false, true)
      .then((p) => p.marks !== undefined && putMarks(me, parseMarks(p.marks), started))
      .catch(() => {});
  }, [on]);
}

/**
 * The room's chat line for each gift that left or cleaned a mark in room `room` (my own sends too: lib/live/room hears
 * the server's packet for every phone): "X sana 💩 attı; 24 saat kalır ya da biri 💧 gönderene kadar" when it is my
 * photo. `say(text, id)` adds it (the id keeps one line per gift).
 */
export function useMarkLines(room: string, say: (text: string, id: string) => void) {
  const ref = useRef(say);
  useEffect(() => {
    ref.current = say;
  });
  useEffect(
    () =>
      onMarkNews((e) => {
        if (e.room !== room) return;
        const from = toLocal(e.from);
        const to = toLocal(e.to);
        const line = markLine(e.news, userById(from).name, to === 'me' ? 'me' : to, userById(to).name);
        if (line) ref.current(line, `mark:${e.eventId}`);
      }),
    [room],
  );
}

let demoEvent = 0;
/**
 * The demo room (no server): a gift that leaves or cleans a mark does it on this phone, as the server would (a clean
 * on a clean photo does nothing). Live rooms hear it from the server instead.
 */
export function demoMarkGift(room: string, giftId: string, emoji: string, to: string) {
  const rule = giftMarkOf(giftId);
  if (!rule || liveMode()) return;
  const showing = activeMark(marksOf(to).filter((m) => m.kind === rule.kind));
  if (rule.role === 'clean' && !showing) return;
  const hours = rule.hours ?? MARK_HOURS;
  const clean = rule.role === 'leave' ? (cleanGiftFor(rule.kind)?.emoji ?? null) : null;
  demoEvent -= 1;
  reportMarkEvent({
    room,
    eventId: demoEvent,
    from: 'me',
    to,
    news: rule.role === 'leave' ? { role: 'leave', kind: rule.kind, gift: giftId, emoji, until: Date.now() + hours * 3_600_000, hours, clean, again: !!showing } : { role: 'clean', kind: rule.kind, gift: giftId, emoji },
  });
}
