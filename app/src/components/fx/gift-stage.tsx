// A gift's animation outside a room: a chat (Mesajlar, the room's messages sheet), a call, a profile, Anlar and the
// family chat. The same three looks as the room's stage (components/room/live-room): the gift's full-screen video
// when it is on the phone (lib/fx-videos), else its drawn show (data/gift-shows), else the pop of its picture; one at a
// time, in order, through the same queue (lib/fx-queue). The same switches as the room: Efekt ayarları (effects off,
// gift effects off, big gifts only), "hareketi azalt" and the gift sounds; muted during a call.
// The screen draws `node` over everything of its own (a Modal's root, not inside a sheet that would cut the video);
// it never takes a touch.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { GiftShowFx } from '@/components/fx/gift-show';
import { GiftVideoFx, giftVideoOf } from '@/components/fx/video-fx';
import { GiftAnimation } from '@/components/room/parts';
import { giftShowOf, type GiftShow } from '@/data/gift-shows';
import type { Gift } from '@/data/mock';
import { addCue, cueCount, emptyStage, endCue, type Stage } from '@/lib/fx-queue';
import { useMedia } from '@/lib/media';
import { useSettings } from '@/store';

type Play =
  | { kind: 'video'; gift: Gift; media: NonNullable<ReturnType<typeof giftVideoOf>>; fromName: string; toName: string }
  | { kind: 'show'; gift: Gift; show: GiftShow; fromName: string; toName: string }
  | { kind: 'pop'; gift: Gift; fromName: string; toName: string };
/** How long each plays, for the queue's backlog bound (as the room's: the clips are 5 s, the pop 2.5 s). */
const VIDEO_MS = 5_000;
const POP_MS = 2_500;

export type GiftStage = {
  /** `fromName` sent `count` of `gift` to `toName`: plays when the stage is free (nothing when effects are off). */
  play: (gift: Gift, fromName: string, toName: string, count?: number) => void;
  /** Drawn last in the screen's root. */
  node: ReactNode;
};

/** `muted`: no sound whatever the settings (a call's own screen). */
export function useGiftStage({ muted = false }: { muted?: boolean } = {}): GiftStage {
  const settings = useSettings();
  const media = useMedia();
  const [stage, setStage] = useState<Stage<Play>>(emptyStage);
  const n = useRef(0);
  // Read when a gift is played, which may be a while after the render that made `play` (a send's answer).
  const on = useRef(settings);
  useEffect(() => {
    on.current = settings;
  });
  const play = (gift: Gift, fromName: string, toName: string, count = 1) => {
    const s = on.current;
    if (s.effectsOff || !s.giftFx || s.reduceMotion || (s.bigGiftsOnly && gift.price < 100)) return;
    const video = giftVideoOf(gift.id);
    const show = video ? undefined : giftShowOf(gift.id);
    const payload: Play = video ? { kind: 'video', gift, media: video, fromName, toName } : show ? { kind: 'show', gift, show, fromName, toName } : { kind: 'pop', gift, fromName, toName };
    const key = `gfx-${++n.current}`;
    setStage((st) =>
      addCue(st, {
        key,
        from: fromName,
        what: gift.id,
        to: { [toName]: Math.max(1, count) },
        each: Math.max(1, count),
        price: gift.price,
        ms: video ? VIDEO_MS : (show?.durationMs ?? POP_MS),
        last: Date.now(),
        payload,
      }),
    );
  };
  const cue = stage.now;
  let node: ReactNode = null;
  if (cue) {
    const p = cue.payload;
    const done = () => setStage((st) => endCue(st, cue.key, Date.now()));
    const count = cueCount(cue);
    const fx =
      p.kind === 'video' ? (
        <GiftVideoFx key={cue.key} media={p.media} fromName={p.fromName} toText={p.toName} giftName={p.gift.name} count={count} muted={muted || !settings.giftSounds || !!media.call} onDone={done} />
      ) : p.kind === 'show' ? (
        <GiftShowFx key={cue.key} show={p.show} play={{ key: cue.key, gift: p.gift, fromName: p.fromName, toText: p.toName, count }} lite={settings.lowData} onDone={done} />
      ) : (
        <GiftAnimation key={cue.key} gift={p.gift} onDone={done} />
      );
    node = (
      <View style={[StyleSheet.absoluteFill, s.layer]} pointerEvents="none">
        {fx}
      </View>
    );
  }
  return { play, node };
}

const s = StyleSheet.create({
  // Over the screen's own views, Android's elevation included.
  layer: { zIndex: 50, elevation: 50 },
});
