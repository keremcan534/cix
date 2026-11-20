// Profil izleri's reads for the screens (lib/profile-marks has the rules, lib/mark-store the marks): who refuses a mark
// from me (their look's noMarks, read for me with the room's people, and why: marksFrom), whose photo shows a mark
// already (a mark gift of another kind goes to them as a plain gift), which gift cleans a kind now, the Muzip shelf's
// note, and my own marks read again when my profile tab opens (a Kaka sent to me outside a room arrives as a push only).
import { useEffect, useRef } from 'react';

import { userById } from '@/data/mock';
import * as api from '@/lib/api';
import { liveMode, myServerId, toLocal, toServer } from '@/lib/live';
import { giftMarkOf, liveCatalog, roomGiftShelf } from '@/lib/live/catalog-live';
import { lookOf } from '@/lib/live/looks';
import { marksOf, onMarkNews, putMarks, reportMarkEvent } from '@/lib/mark-store';
import { activeMark, markLine, markMinutes, parseMarks, shelfNoteOf, type MarkPair, type MarkRefusal } from '@/lib/profile-marks';
import { serverNow } from '@/lib/sanction-time';

/** Ids starting with this are the İz önizleme screen's own (app/iz-onizleme): kept as they are, in live mode too. */
export const PREVIEW_KEY = 'onizleme:';
/** The key lib/mark-store keeps `uid`'s marks under: their server id in live mode, the sample id in the demo. */
export const markKeyOf = (uid: string | null | undefined): string | null => (!uid ? null : uid.startsWith(PREVIEW_KEY) || !liveMode() ? uid : toServer(uid));

/** Whether `uid` takes no mark from me (Gizlilik): their look says so. The demo's people always do. */
export const refusesMarks = (uid: string) => (liveMode() ? lookOf(toServer(uid))?.noMarks === true : false);
/** Why `uid` takes no mark from me: only the people they follow, or nobody (an older server: nobody). */
export const marksRefusalOf = (uid: string): MarkRefusal => (lookOf(toServer(uid))?.marksFrom === 'following' ? 'following' : 'nobody');
/** The marks on `uid`'s photo as this phone has them (their look, the room's packets, my own sends). */
export const photoMarksOf = (uid: string) => {
  const key = markKeyOf(uid);
  return key ? marksOf(key) : [];
};

/** The gift that cleans a mark of `kind` now (the cheapest on the shelves), or undefined. */
export function cleanGiftFor(kind: string) {
  return roomGiftShelf()
    .filter((g) => giftMarkOf(g.id)?.role === 'clean' && giftMarkOf(g.id)?.kind === kind)
    .sort((a, b) => a.price - b.price)[0];
}

/**
 * The Muzip shelf's note while gifts on it leave a mark (lib/profile-marks shelfNoteOf): what each does, how long, what
 * cleans it and that anyone chooses who marks them. Null when no gift there does (the shelf's plain note then). Never a
 * "spend more" nudge.
 */
export function marksShelfNote(): string | null {
  const pairs: MarkPair[] = [];
  for (const g of roomGiftShelf()) {
    const rule = g.cat === 'gameplay' ? giftMarkOf(g.id) : null;
    if (rule?.role !== 'leave') continue;
    const clean = cleanGiftFor(rule.kind);
    pairs.push({ leave: { emoji: g.emoji, name: g.name }, minutes: markMinutes(rule, liveCatalog()?.marks), clean: clean ? { emoji: clean.emoji, name: clean.name } : null });
  }
  return shelfNoteOf(pairs);
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
 * on a clean photo does nothing; a leave while another kind shows does nothing either; the same kind again never ends
 * sooner). Live rooms hear it from the server instead.
 */
export function demoMarkGift(room: string, giftId: string, emoji: string, to: string) {
  const rule = giftMarkOf(giftId);
  if (!rule || liveMode()) return;
  const now = serverNow();
  const showing = activeMark(marksOf(to).filter((m) => m.kind === rule.kind), now);
  if (rule.role === 'clean' && !showing) return;
  if (rule.role === 'leave' && !showing && activeMark(marksOf(to), now)) return;
  const minutes = Math.max(markMinutes(rule), showing ? Math.round((showing.until - now) / 60_000) : 0);
  const clean = rule.role === 'leave' ? (cleanGiftFor(rule.kind)?.emoji ?? null) : null;
  demoEvent -= 1;
  reportMarkEvent({
    room,
    eventId: demoEvent,
    from: 'me',
    to,
    news:
      rule.role === 'leave'
        ? { role: 'leave', kind: rule.kind, gift: giftId, emoji, until: Math.max(now + markMinutes(rule) * 60_000, showing?.until ?? 0), hours: Math.min(168, Math.ceil(minutes / 60)), minutes, clean, again: !!showing }
        : { role: 'clean', kind: rule.kind, gift: giftId, emoji },
  });
}
