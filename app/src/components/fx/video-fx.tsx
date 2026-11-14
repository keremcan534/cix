// Full-screen transparent videos for some gifts and entry effects (modules/similar-alpha-video): each MP4 is stacked,
// the picture in its top half and its alpha in the bottom half (scripts/alpha-stack.sh), cut out of the black-ground
// videos the designer delivered, with their sound. The clips come from the server and are kept on the phone
// (lib/fx-videos; server/api/fx.mjs says which gift plays which), so a new gift video doesn't make the app bigger.
// Never takes touches; it ends itself when the clip ends, or after a safety timeout when the player can't start.
// Phones with the module only: the web build and an older APK keep the code-drawn effects (giftVideoOf /
// entryVideoOf say null there), and so does a phone that hasn't downloaded that clip yet.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import type { EntryFx } from '@/components/fx/entry';
import { fxMedia, setFxVideos, type FxMedia } from '@/lib/fx-videos';
import { fxSafetyMs } from '@/lib/fx-videos-core';
import { useLiveCatalog } from '@/lib/live/catalog-live';
import { useSettings } from '@/store';

import { AlphaVideoView, alphaVideoAvailable } from '../../../modules/similar-alpha-video';

export type { FxMedia };

/** The video a gift plays instead of its show or animation (by gift id, data/mock GIFTS), when it's on the phone. */
export const giftVideoOf = (giftId?: string): FxMedia | null => (alphaVideoAvailable && giftId ? fxMedia('gift', giftId) : null);
/** The video an entry effect plays under the name banner (by COSMETICS `fx`), when it's on the phone. */
export const entryVideoOf = (fx?: EntryFx): FxMedia | null => (alphaVideoAvailable && fx ? fxMedia('entry', fx) : null);

/** Keeps the phone's clips in step with the server's list; fetches ahead unless Düşük veri modu is on. Draws nothing. */
export function FxVideoSync() {
  const fx = useLiveCatalog()?.fx ?? null;
  const { lowData } = useSettings();
  useEffect(() => {
    if (alphaVideoAvailable) setFxVideos(fx, { prefetch: !lowData });
  }, [fx, lowData]);
  return null;
}

/** A clip whose player hasn't got ready by then is given up on (the next effect comes). */
const START_TIMEOUT_MS = 6000;

export function VideoFx({ media, muted = true, onDone, children }: { media: FxMedia; muted?: boolean; onDone: () => void; children?: ReactNode }) {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  // The clip waits, paused on its first frame, until its player is ready and the screen has drawn two more frames,
  // then plays from the start with its banner. Started as soon as it was ready, a clip opening on a busy screen (a
  // room coming up) ran on unseen while the phone was stuck and showed up halfway through.
  const [playing, setPlaying] = useState(false);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  const ready = () => requestAnimationFrame(() => requestAnimationFrame(() => live.current && setPlaying(true)));
  // A player that never gets ready, or never ends, still lets the next effect come.
  const safety = playing ? fxSafetyMs(media.ms) : START_TIMEOUT_MS;
  useEffect(() => {
    const t = setTimeout(() => done.current(), safety);
    return () => clearTimeout(t);
  }, [safety]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <AlphaVideoView
        source={media.uri}
        paused={!playing}
        muted={muted}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        onReady={ready}
        onEnd={() => done.current()}
        onError={() => done.current()}
      />
      {playing && children}
    </View>
  );
}

/** A gift's video with a line naming who sent it to whom. */
export function GiftVideoFx({ media, fromName, toText, giftName, count, muted, onDone }: { media: FxMedia; fromName: string; toText: string; giftName: string; count: number; muted?: boolean; onDone: () => void }) {
  return (
    <VideoFx media={media} muted={muted} onDone={onDone}>
      <View style={s.banner}>
        <Text style={s.bannerText} numberOfLines={1}>
          {fromName} → {toText} · {giftName}
          {count > 1 ? ` ×${count}` : ''}
        </Text>
      </View>
    </VideoFx>
  );
}

const s = StyleSheet.create({
  banner: { position: 'absolute', top: 120, alignSelf: 'center', maxWidth: '86%', backgroundColor: 'rgba(22,14,18,0.72)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  bannerText: { color: '#FFE7A3', fontWeight: '800', fontSize: 14 },
});
