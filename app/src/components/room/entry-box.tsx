// The person card's entry box (lib/entry-box; the owners' design, 20 Nov 2026): the person's own room entrance playing
// round and round in a small glassy box beside their name, what everyone in a room sees when they come in. Their clip
// when it is already on this phone and may play: muted, the whole picture fitted in the box, started again each time
// it ends; the team's own with their name on its plate (PlateName, its timing from the top each round), the app's own
// with their name under it. Otherwise the room's drawn banner made small: their photo and name in the banner's
// colours, the ride or creature crossing behind, the light sweep and the sparkle burst, one round every 3.2 s. Every
// move runs on the native driver from one looping value: no JS per frame. "Hareketi azalt" or effects off: the banner
// standing still; Düşük veri modu: never the clip. The card never downloads a clip (entryClipKept), and closing it
// stops the loop and frees the player.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { ENTRY_LOOKS, type EntryShow } from '@/components/fx/entry';
import { entryShowOfPlan } from '@/components/fx/entry-show';
import { PlateName, entryClipKept, type FxMedia } from '@/components/fx/video-fx';
import { Photo } from '@/components/photo';
import { SHOW } from '@/components/person-showcase';
import { clipStage, entryBoxShow } from '@/lib/entry-box';
import { useFxState } from '@/lib/fx-videos';
import { fxSafetyMs } from '@/lib/fx-videos-core';
import type { EntryPlan } from '@/lib/room-entrance';
import type { Plate } from '@/lib/shop-live-core';
import { useSettings } from '@/store';

import { AlphaVideoView } from '../../../modules/similar-alpha-video';

/** One round of the drawn banner, as long as the room's (components/fx/entry). */
const ROUND_MS = 3200;
/** A clip whose player isn't ready by then gives way to the drawn banner. */
const START_MS = 5000;
const SPARKS = 8;

export function EntryBox({ plan, name, avatar, w, h }: { plan: EntryPlan; name: string; avatar: string; w: number; h: number }) {
  const { reduceMotion, lowData, effectsOff, entryFx } = useSettings();
  // A clip that lands on the phone while the card is open plays from then on.
  useFxState();
  const show = entryShowOfPlan(plan, name, avatar);
  const media = show ? entryClipKept(show) : null;
  const [failed, setFailed] = useState<string | null>(null);
  const what = entryBoxShow(plan, { reduceMotion, lowData, effectsOff: effectsOff || !entryFx, clipKept: !!media && failed !== media.uri });
  if (!show || !what) return null;
  return (
    // Both stand in the glass box of the design (owners, 23 Nov 2026: the card looks orderly with it; on 21 Nov the
    // clip had none, and a clip that starts with a thin streak then looked like a stray line beside the name).
    <View style={[s.box, what.kind === 'video' && media && s.clipBox, { width: w, height: h }]} pointerEvents="none" accessible accessibilityLabel={`Giriş efekti${show.badge ? `, ${show.badge}` : ''}`}>
      {what.kind === 'video' && media ? (
        <LoopClip key={media.uri} media={media} plate={what.plate} show={show} w={w} h={h} onFail={() => setFailed(media.uri)} />
      ) : (
        <MiniBanner show={show} w={w} h={h} still={what.kind === 'banner' && what.still} />
      )}
    </View>
  );
}

/** The banner's three colours: its own, or the VIP tier's first two over its last (as components/fx/entry). */
const colorsOf = (show: EntryShow) => {
  const look = ENTRY_LOOKS[show.fx] ?? ENTRY_LOOKS.vip;
  return show.colors ? ([show.colors[0], show.colors[1], look.colors[2]] as const) : look.colors;
};

/**
 * The clip as large as it fits, started again each time it ends: in the middle of the box beside the name (their name
 * under it unless a plate writes it), at the left of a strip under the head with the room banner's line beside it.
 */
function LoopClip({ media, plate, show, w, h, onFail }: { media: FxMedia; plate: Plate | null; show: EntryShow; w: number; h: number; onFail: () => void }) {
  const wide = w >= h * 1.6;
  // The whole place: no box around a clip.
  const fit = clipStage(w, h);
  const stage = wide ? { ...fit, left: 12 } : fit;
  const [round, setRound] = useState(0);
  const [ready, setReady] = useState(false);
  const fail = useRef(onFail);
  useEffect(() => {
    fail.current = onFail;
  });
  // A player that never gets ready gives way to the drawn banner; one that never says it ended starts again anyway.
  useEffect(() => {
    const t = setTimeout(() => (ready ? setRound((r) => r + 1) : fail.current()), ready ? fxSafetyMs(media.ms) : START_MS);
    return () => clearTimeout(t);
  }, [ready, round, media.ms]);
  return (
    <>
      <View style={{ position: 'absolute', left: stage.left, top: stage.top, width: stage.w, height: stage.h }}>
        <AlphaVideoView
          source={media.uri}
          muted
          restartKey={round}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          onReady={() => setReady(true)}
          onEnd={() => setRound((r) => r + 1)}
          onError={() => fail.current()}
        />
        {ready && plate && <PlateName key={round} name={show.name} plate={plate} />}
      </View>
      {wide && (
        <View style={[s.clipLine, { left: stage.left + stage.w + 10 }]}>
          <Text style={s.wideName} numberOfLines={1}>
            {show.badge ? `${show.badge} · ${show.name}` : show.name}
          </Text>
          <Text style={s.wideSub} numberOfLines={1}>
            {show.ride ? `${show.ride} ile odaya girdi` : 'odaya girdi'}
          </Text>
        </View>
      )}
      {ready && !wide && !plate && (
        <LinearGradient colors={colorsOf(show)} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[s.tag, { maxWidth: w - 8 }]}>
          <Text style={s.tagText} numberOfLines={1}>
            {show.name}
          </Text>
        </LinearGradient>
      )}
    </>
  );
}

/**
 * The room's drawn banner made small: upright in a box beside the name (their photo, their badge and name under it),
 * a strip under the head when the box is wide (photo, name and line in a row, as in the room). One looping value
 * drives every move; still: everything in place, the ride standing by the photo.
 */
function MiniBanner({ show, w, h, still }: { show: EntryShow; w: number; h: number; still: boolean }) {
  const look = ENTRY_LOOKS[show.fx] ?? ENTRY_LOOKS.vip;
  const traveller = show.ride ?? look.creature;
  const wide = w >= h * 1.6;
  const face = wide ? Math.min(46, h - 22) : Math.max(28, Math.min(42, w - 22));
  const size = Math.round(face * 0.95);
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (still) return;
    t.setValue(0);
    // The phones loop it on the native driver; the web's Animated runs a "native" loop once only, so it loops in JS there.
    const a = Animated.loop(Animated.timing(t, { toValue: 1, duration: ROUND_MS, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }));
    a.start();
    return () => a.stop();
  }, [still, t]);

  // The ride or creature crosses behind the photo in the first three quarters of a round.
  const cross = {
    opacity: t.interpolate({ inputRange: [0, 0.04, 0.7, 0.75], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' }),
    transform: [
      { translateX: t.interpolate({ inputRange: [0, 0.75], outputRange: [-size, w + 4], extrapolate: 'clamp' }) },
      { translateY: t.interpolate({ inputRange: [0, 0.19, 0.38, 0.56, 0.75], outputRange: [2, -3, 2, -3, 0], extrapolate: 'clamp' }) },
      // Ride pictures face left: turned to face the way they go (as in the room).
      { scaleX: show.rideArt || show.fx === 'dragon' ? -1 : 1 },
    ],
  };
  const pop = { transform: [{ scale: t.interpolate({ inputRange: [0, 0.06, 0.12, 0.92, 1], outputRange: [0.9, 1.06, 1, 1, 0.9] }) }] };
  const lane = (top: number) =>
    traveller &&
    !still &&
    (show.rideArt ? (
      <Animated.Image source={show.rideArt} style={[{ position: 'absolute', left: 0, top: top - size / 2, width: size, height: size }, cross]} resizeMode="contain" />
    ) : (
      <Animated.Text style={[{ position: 'absolute', left: 0, top: top - size * 0.62, fontSize: size * 0.8 }, cross]}>{traveller}</Animated.Text>
    ));
  const sparks = (cx: number, cy: number) =>
    !still &&
    Array.from({ length: SPARKS }, (_, i) => {
      const a = (i / SPARKS) * Math.PI * 2;
      const d = face * (0.75 + (i % 3) * 0.18);
      return (
        <Animated.View
          key={i}
          style={[
            s.spark,
            {
              left: cx - 2.5,
              top: cy - 2.5,
              backgroundColor: look.particle[i % look.particle.length],
              opacity: t.interpolate({ inputRange: [0, 0.03, 0.32], outputRange: [0, 1, 0], extrapolate: 'clamp' }),
              transform: [
                { translateX: t.interpolate({ inputRange: [0, 0.32], outputRange: [0, Math.cos(a) * d], extrapolate: 'clamp' }) },
                { translateY: t.interpolate({ inputRange: [0, 0.32], outputRange: [0, Math.sin(a) * d * 0.8], extrapolate: 'clamp' }) },
                { scale: t.interpolate({ inputRange: [0, 0.32], outputRange: [1.2, 0.3], extrapolate: 'clamp' }) },
              ],
            },
          ]}
        />
      );
    });
  // Their photo in the banner's white ring, the sparks bursting from it; a ride standing by it when nothing moves.
  const photo = (
    <View style={{ width: face, height: face }}>
      <Animated.View style={[s.ring, { width: face, height: face, borderRadius: face / 2 }, !still && pop]}>
        <Photo uri={show.avatar} kind="face" style={{ flex: 1, borderRadius: face / 2 }} />
      </Animated.View>
      {sparks(face / 2, face / 2)}
      {traveller &&
        still &&
        (show.rideArt ? (
          <Image source={show.rideArt} style={[s.parked, { width: Math.round(face * 0.62), height: Math.round(face * 0.62) }]} resizeMode="contain" />
        ) : (
          <Text style={[s.parked, { fontSize: Math.round(face * 0.45) }]}>{traveller}</Text>
        ))}
    </View>
  );

  return (
    <>
      <LinearGradient colors={colorsOf(show)} start={{ x: 0, y: 0 }} end={wide ? { x: 1, y: 0.5 } : { x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* Glass: a soft light over the top, a little shade under the name so it reads on the light VIP colours. */}
      <LinearGradient colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']} style={s.sheen} />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.38)']} style={wide ? StyleSheet.absoluteFill : s.shade} />
      {!still && (
        <Animated.View style={[s.sweep, { transform: [{ translateX: t.interpolate({ inputRange: [0.1, 0.42], outputRange: [-60, w + 30], extrapolate: 'clamp' }) }, { rotate: '18deg' }] }]}>
          <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
        </Animated.View>
      )}
      {wide ? (
        <>
          {lane(h / 2)}
          <View style={s.row}>
            {photo}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.wideName} numberOfLines={1}>
                {show.badge ? `${show.badge} · ${show.name}` : show.name}
              </Text>
              <Text style={s.wideSub} numberOfLines={1}>
                {show.ride ? `${show.ride} ile odaya girdi` : 'odaya girdi'}
              </Text>
            </View>
            {!!look.mark && <Text style={s.wideMark}>{look.mark}</Text>}
          </View>
        </>
      ) : (
        <>
          <View style={s.col}>
            <View style={[s.faceLane, { height: face }]}>
              {lane(face / 2)}
              {photo}
            </View>
            {!!show.badge && (
              <Text style={s.badge} numberOfLines={1}>
                {show.badge}
              </Text>
            )}
            <Text style={s.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {show.name}
            </Text>
          </View>
          {!!look.mark && <Text style={s.mark}>{look.mark}</Text>}
        </>
      )}
    </>
  );
}

const s = StyleSheet.create({
  // No frame or fill of its own (owners, 24 Nov 2026): the effect plays straight on the card, clipped to its place.
  box: { borderRadius: 16, overflow: 'hidden' },
  clipBox: {},
  sheen: { position: 'absolute', left: 0, right: 0, top: 0, height: '45%' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%' },
  sweep: { position: 'absolute', top: -30, bottom: -30, left: 0, width: 34 },
  ring: { padding: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
  spark: { position: 'absolute', width: 5, height: 5, borderRadius: 2.5 },
  parked: { position: 'absolute', right: -10, bottom: -6 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 5 },
  faceLane: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  badge: { color: SHOW.gold, fontSize: 9.5, lineHeight: 12, fontWeight: '800', maxWidth: '100%', paddingHorizontal: 5, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.35)' },
  name: { color: '#fff', fontSize: 11.5, lineHeight: 14, fontWeight: '900', maxWidth: '100%', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  mark: { position: 'absolute', right: 5, top: 4, fontSize: 13 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10, paddingRight: 12 },
  wideName: { color: '#fff', fontWeight: '900', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  wideSub: { color: 'rgba(255,255,255,0.9)', fontSize: 11.5, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 2 },
  wideMark: { fontSize: 20 },
  clipLine: { position: 'absolute', top: 0, bottom: 0, right: 12, justifyContent: 'center' },
  tag: { position: 'absolute', bottom: 5, alignSelf: 'center', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  tagText: { color: '#fff', fontSize: 10.5, lineHeight: 13, fontWeight: '900' },
});
