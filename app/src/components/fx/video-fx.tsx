// Full-screen transparent videos for some gifts and entry effects (modules/similar-alpha-video): each MP4 is stacked,
// the picture in its top half and its alpha in the bottom half (scripts/alpha-stack.sh), cut out of the black-ground
// videos the designer delivered, with their sound. The clips come from the server and are kept on the phone
// (lib/fx-videos; server/api/fx.mjs says which gift plays which), so a new gift video doesn't make the app bigger.
// Never takes touches; it ends itself when the clip ends, or after a safety timeout when the player can't start.
// Phones with the module only: the web build and an older APK keep the code-drawn effects (giftVideoOf /
// entryVideoOf say null there), and so does a phone that hasn't downloaded that clip yet.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent, type TextStyle } from 'react-native';

import { Text } from '@/components/text';
import type { EntryFx } from '@/components/fx/entry';
import { fxMedia, setFxVideos, type FxMedia } from '@/lib/fx-videos';
import { fxSafetyMs } from '@/lib/fx-videos-core';
import { plateLayout, plateText, type Plate } from '@/lib/shop-live-core';
import { useLiveCatalog } from '@/lib/live/catalog-live';
import { useSettings } from '@/store';

import { AlphaVideoView, alphaVideoAvailable } from '../../../modules/similar-alpha-video';

export type { FxMedia };

/** The video a gift plays instead of its show or animation (by gift id, data/mock GIFTS), when it's on the phone. */
export const giftVideoOf = (giftId?: string): FxMedia | null => (alphaVideoAvailable && giftId ? fxMedia('gift', giftId) : null);
/** The video an entry effect plays under the name banner (by COSMETICS `fx`), when it's on the phone. */
export const entryVideoOf = (fx?: EntryFx): FxMedia | null => (alphaVideoAvailable && fx ? fxMedia('entry', fx) : null);
/** An entry show's clip: the team's own (Yönetim › Mağaza, fx entry <id>) or the app's entry effect's. */
export const entryClipOf = (show: { fx?: EntryFx; clip?: string }): FxMedia | null =>
  alphaVideoAvailable ? (show.clip ? fxMedia('entry', show.clip) : show.fx ? fxMedia('entry', show.fx) : null) : null;

/** How long the name takes to come in and to go (a plate's `anim`; `none`: at once). */
const PLATE_IN_MS = 350;
const PLATE_OUT_MS = 300;
/** Eight ways round a letter: the outline is the name drawn in its colour this far each way, under the name. */
const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.71, 0.71], [-0.71, 0.71], [0.71, -0.71], [-0.71, -0.71]] as const;
/** `#RRGGBB` and an opacity as `#RRGGBBAA`. */
const withAlpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;

/**
 * The entering person's name on an entry effect's plate (Yönetim › Mağaza): over the clip, which the player draws
 * aspect-fit in the same box, at the plate's place, one line, smaller for a long name so it stays inside the plate.
 * Drawn in layers laid out alike, so each fits the name the same way: its shadow or glow (the name in that colour
 * with a shadow, padded so Android doesn't cut the shadow off), its outline (eight copies a little off each way), the
 * name; the band behind them hugs the name's measured width. The clip starts as this mounts: the name comes in at the
 * plate's `from` and goes at its `to`; with "hareketi azalt" growing and rising become fading. A plate whose name
 * isn't written draws nothing.
 */
export function PlateName({ name, plate }: { name: string; plate: Plate }) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [line, setLine] = useState<number | null>(null);
  const { reduceMotion } = useSettings();
  const { show, from, to, anim } = plate;
  const [shown] = useState(() => new Animated.Value(from === 0 && anim === 'none' ? 1 : 0));
  useEffect(() => {
    if (!show) return;
    const k = anim === 'none' ? 0 : 1;
    const a = Animated.sequence([
      Animated.delay(from * 1000),
      Animated.timing(shown, { toValue: 1, duration: k * PLATE_IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ...(to > from ? [Animated.delay(Math.max(0, (to - from) * 1000 - k * PLATE_IN_MS)), Animated.timing(shown, { toValue: 0, duration: k * PLATE_OUT_MS, useNativeDriver: true })] : []),
    ]);
    a.start();
    return () => a.stop();
  }, [shown, show, from, to, anim]);
  const measured = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const text = plateText(plate, name);
  const l = box && show ? plateLayout(plate, text, box.w, box.h) : null;
  if (!l) return <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={measured} />;

  const fs = l.fontSize;
  const motion = reduceMotion && anim !== 'none' ? 'fade' : anim;
  const base: TextStyle = { color: plate.color, fontSize: fs, fontWeight: plate.bold ? '800' : '500', letterSpacing: plate.spacing * fs, textAlign: 'center' };
  const glow = plate.shadow ? plate.shadow.size * fs : 0;
  const edge = plate.outline ? Math.max(1, plate.outline.size * fs) : 0;
  const band = fs * 1.5;
  const copy = (key: string, style: TextStyle, { pad = 0, dx = 0, dy = 0 } = {}) => (
    <View
      key={key}
      style={[s.layer, pad ? { left: -pad, right: -pad, top: -pad, bottom: -pad } : null, dx || dy ? { transform: [{ translateX: dx }, { translateY: dy }] } : null]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4} style={[base, style, pad ? { padding: pad } : null]}>
        {text}
      </Text>
    </View>
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={measured}>
      <Animated.View
        style={{
          position: 'absolute',
          left: l.cx - l.width / 2,
          top: l.cy - fs,
          width: l.width,
          height: fs * 2,
          opacity: shown,
          transform:
            motion === 'zoom'
              ? [{ scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }]
              : motion === 'rise'
                ? [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [fs, 0] }) }]
                : [],
        }}>
        {plate.back && line !== null && (
          <View style={[StyleSheet.absoluteFill, s.center]}>
            <View style={{ width: line + fs, height: band, borderRadius: band / 2, backgroundColor: withAlpha(plate.back.color, plate.back.alpha) }} />
          </View>
        )}
        {plate.shadow && copy('glow', { color: plate.shadow.color, textShadowColor: plate.shadow.color, textShadowRadius: glow, textShadowOffset: { width: 0, height: 0 } }, { pad: Math.ceil(glow) })}
        {plate.outline && AROUND.map(([x, y], i) => copy(`edge${i}`, { color: plate.outline!.color }, { dx: x * edge, dy: y * edge }))}
        <View style={s.layer}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.4}
            accessibilityLabel={`${name} odaya girdi`}
            onTextLayout={(e) => setLine(e.nativeEvent.lines[0]?.width ?? null)}
            style={base}>
            {text}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

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
  layer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  banner: { position: 'absolute', top: 120, alignSelf: 'center', maxWidth: '86%', backgroundColor: 'rgba(22,14,18,0.72)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  bannerText: { color: '#FFE7A3', fontWeight: '800', fontSize: 14 },
});
