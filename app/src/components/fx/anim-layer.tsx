// Room animation layer. Two separate mechanisms (spec §5):
//  1. Room events (manual sends, free or paid) arrive on the room bus and start at the event's startAt,
//     so everyone in the room sees them together. Caps keep the room smooth: one full-screen effect at a
//     time, a few small ones at once, the rest waits in a short queue (oldest free reactions dropped first).
//  2. The equipped mic effect plays locally around my seat only while I'm on the mic, unmuted and speaking.
//     It is never a gift and never charges anything; voice level only drives this visual.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { AnimPlay, type Pt } from '@/components/fx/anim-player';
import type { Animation } from '@/data/animations';
import { animById, subscribeRoom, type RoomAnimEvent } from '@/lib/animations';

export const MAX_FULLSCREEN = 1;
export const MAX_SMALL = 6;
const MAX_QUEUE = 12;

type Item = { key: string; anim: Animation; origin: Pt | null };

export function AnimLayer({
  roomId,
  originOf,
  lite,
  off,
  micEffect,
}: {
  roomId: string;
  /** Window position of a user's seat (null when not seated). */
  originOf: (userId: string) => Promise<Pt | null>;
  lite?: boolean;
  off?: boolean;
  /** active = on a mic and unmuted; isSpeaking is polled so effects follow actual talking. */
  micEffect?: { animationId: string | null; active: boolean; isSpeaking: () => boolean };
}) {
  const screen = useWindowDimensions();
  const [playing, setPlaying] = useState<Item[]>([]);
  // Mirrors of what is playing and waiting; admission is computed here, outside state updaters.
  const live = useRef<Item[]>([]);
  const queue = useRef<Item[]>([]);
  const commit = (next: Item[]) => {
    live.current = next;
    setPlaying(next);
  };

  // Admit queued items while under the caps.
  const pump = () => {
    let next = live.current;
    const rest: Item[] = [];
    for (const it of queue.current) {
      const full = it.anim.display_type === 'fullscreen';
      const fullNow = next.filter((x) => x.anim.display_type === 'fullscreen').length;
      const smallNow = next.length - fullNow;
      if (full ? fullNow < MAX_FULLSCREEN : smallNow < MAX_SMALL) next = [...next, it];
      else rest.push(it);
    }
    queue.current = rest;
    if (next !== live.current) commit(next);
  };
  const pumpRef = useRef(pump);
  useEffect(() => {
    pumpRef.current = pump;
  });

  const enqueue = (it: Item) => {
    queue.current.push(it);
    if (queue.current.length > MAX_QUEUE) {
      const i = queue.current.findIndex((x) => x.anim.is_free);
      queue.current.splice(i >= 0 ? i : 0, 1);
    }
    pumpRef.current();
  };
  const enqueueRef = useRef(enqueue);
  useEffect(() => {
    enqueueRef.current = enqueue;
  });

  // 1. Room events.
  useEffect(() => {
    if (off) return;
    return subscribeRoom(roomId, (e: RoomAnimEvent) => {
      const anim = animById(e.animationId);
      if (!anim) return;
      setTimeout(
        async () => {
          const origin = await originOf(e.fromUserId);
          enqueueRef.current({ key: e.eventId, anim, origin });
        },
        Math.max(0, e.startAt - Date.now()),
      );
    });
    // originOf reads live seat refs; re-subscribing on every render isn't needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, off]);

  // 2. Mic effect while speaking.
  const micId = micEffect?.animationId ?? null;
  const micActive = !!micEffect?.active && !off;
  useEffect(() => {
    if (!micId || !micActive) return;
    const anim = animById(micId);
    if (!anim) return;
    const run = async () => {
      if (!micEffect?.isSpeaking()) return;
      enqueueRef.current({ key: `mic-${Date.now()}`, anim, origin: await originOf('me') });
    };
    const t = setInterval(run, anim.duration_ms + 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micId, micActive]);

  if (off || playing.length === 0) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {playing.map((it) => (
        <AnimPlay
          key={it.key}
          anim={it.anim}
          origin={it.origin}
          screen={screen}
          lite={lite}
          onDone={() => {
            commit(live.current.filter((x) => x.key !== it.key));
            pumpRef.current();
          }}
        />
      ))}
    </View>
  );
}
