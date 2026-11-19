// The VIP tab's hero ("tabela"): one card per VIP level in a snapping carousel, each on its level's coloured
// background (assets/vip/hero-<n>.webp: VIP 1 is the design's purple, the others recoloured) inside the design's gold
// light (hero-glow.webp, the same on every level), with live text on the left, clear of the winged ring: the level's
// name and where the member stands (open, progress, points left).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, type ComponentRef } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { Text } from '@/components/text';
import { HERO_ART, HERO_BOX, HERO_GLOW, HERO_LOAD, HERO_LOCK, HERO_TEXT, groupDigits, heroFor, snapIndex, statusLine, titleFit, wideSpaces, type HeroStatus } from '@/lib/vip-screen';
import { useSettings } from '@/store';
import { DECO, HERO_GLOW_IMAGE, HERO_IMAGES } from './assets';
import { GoldText } from './gold-text';

type Level = { level: number; xp: number; name: string };

export function VipHeroCarousel({
  levels,
  index,
  onIndex,
  width,
  myLevel,
  myPoints,
  decay,
  onLoad,
}: {
  levels: Level[];
  index: number;
  onIndex: (i: number) => void;
  /** The content width (the screen's, capped on wide windows). */
  width: number;
  myLevel: number;
  myPoints: number;
  decay: boolean;
  /** Yükle: the wallet. */
  onLoad: () => void;
}) {
  const settings = useSettings();
  // The design's hero is 812 of 841 px wide: a 7 dp margin each side on a phone.
  const heroW = Math.round(width * (HERO_BOX.w / 841));
  const pad = (width - heroW) / 2;
  const gap = 10;
  const step = heroW + gap;
  // Room above and below the cards for their gold light (a horizontal list clips what leaves it), taken back by
  // the margins so the cards stay where the design has them.
  const u = heroW / HERO_BOX.w;
  const glowPad = Math.ceil(Math.max(-HERO_GLOW.top, HERO_GLOW.top + HERO_GLOW.h - HERO_BOX.h) * u);
  // The carousel opens on the member's own level and a tapped card slides to the centre, so the card in view always
  // matches the rights listed under it.
  const carousel = useRef<ComponentRef<typeof ScrollView>>(null);
  // The content width the carousel was last placed for: placed once it has a size, and again when a turned phone
  // or a resized window changes the card width, so the same card stays in view.
  const placedFor = useRef(0);
  const select = (i: number) => {
    onIndex(i);
    carousel.current?.scrollTo({ x: i * step, animated: !settings.reduceMotion });
  };
  // The web has no momentum end and no snapping to an interval: once a swipe has been still for a moment, the
  // nearest card is picked and slid to the middle there.
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );
  const onWebScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      settle.current = null;
      const i = snapIndex(x, step, levels.length);
      onIndex(i);
      if (Math.abs(x - i * step) > 1) carousel.current?.scrollTo({ x: i * step, animated: !settings.reduceMotion });
    }, 150);
  };
  return (
    <View>
      <ScrollView
        ref={carousel}
        horizontal
        snapToInterval={step}
        decelerationRate="fast"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: index * step, y: 0 }}
        onContentSizeChange={(w) => {
          if (w === placedFor.current) return;
          placedFor.current = w;
          carousel.current?.scrollTo({ x: index * step, animated: false });
        }}
        style={{ marginVertical: -glowPad }}
        contentContainerStyle={{ paddingHorizontal: pad, paddingVertical: glowPad, gap }}
        onMomentumScrollEnd={(e) => onIndex(snapIndex(e.nativeEvent.contentOffset.x, step, levels.length))}
        onScroll={Platform.OS === 'web' ? onWebScroll : undefined}
        scrollEventThrottle={Platform.OS === 'web' ? 32 : undefined}>
        {levels.map((l, i) => (
          <VipHero
            key={l.level}
            level={l}
            width={heroW}
            selected={index === i}
            status={statusLine({ level: l.level, points: l.xp, myLevel, myPoints, decay })}
            onPress={() => select(i)}
            onLoad={onLoad}
          />
        ))}
      </ScrollView>
      {levels.length > 1 && (
        <View style={s.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {levels.map((l, i) => (
            <View key={l.level} style={[s.dot, i === index && s.dotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

function VipHero({ level, width, selected, status, onPress, onLoad }: { level: Level; width: number; selected: boolean; status: HeroStatus; onPress: () => void; onLoad: () => void }) {
  const u = width / HERO_BOX.w; // dp per design px
  const locked = status.kind !== 'open';
  const statusSize = (locked ? HERO_TEXT.statusLocked : HERO_TEXT.status) * u;
  const tick = status.kind === 'open' && status.text.startsWith('✓ ');
  const fit = titleFit(level.name);
  return (
    <View style={{ width, aspectRatio: HERO_BOX.w / HERO_BOX.h }}>
      <Image
        source={HERO_GLOW_IMAGE}
        resizeMode="stretch"
        style={{ position: 'absolute', left: HERO_GLOW.left * u, top: HERO_GLOW.top * u, width: HERO_GLOW.w * u, height: HERO_GLOW.h * u, pointerEvents: 'none' }}
        accessibilityIgnoresInvertColors
      />
      <Image
        source={HERO_IMAGES[heroFor(level.level)]}
        resizeMode="stretch"
        style={{ position: 'absolute', left: `${HERO_ART.left * 100}%`, top: `${HERO_ART.top * 100}%`, width: `${HERO_ART.width * 100}%`, height: `${HERO_ART.height * 100}%` }}
        accessibilityIgnoresInvertColors
      />
      {/* The whole card selects its level; Yükle is its own button on top. */}
      <Pressable
        onPress={onPress}
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={`${level.name}${locked ? ', kilitli' : ''}. ${spoken(status)}`}
        // aria-selected rather than accessibilityState: the same on phones, and the web (react-native-web) keeps it.
        aria-selected={selected}
      />
      <View pointerEvents="box-none" style={{ position: 'absolute', left: HERO_TEXT.left * u, top: HERO_TEXT.top * u, width: HERO_TEXT.width * u }}>
        {/* Bold italic gold: the slant is a skew, so it is the same on every phone (the brand face has no italic).
            The name and the line under it are read out by the card's label, and a tap on them selects the card. */}
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <GoldText
            fit
            maxFontSizeMultiplier={1}
            wrap={{ alignSelf: 'flex-start', maxWidth: '100%', transform: [{ skewX: '-11deg' }] }}
            style={{ fontSize: HERO_TEXT.title * u * fit, lineHeight: HERO_TEXT.title * u * 1.18, fontWeight: '900', paddingRight: 6 * u, letterSpacing: -0.5 }}>
            {level.name}
          </GoldText>
        </View>
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ marginTop: HERO_TEXT.statusGap * u }}>
          <View style={s.statusRow}>
            {/* The design's own calligraphic gold tick (the brand face has no ✓ of its own; a font's is thin), its
                foot a little under the baseline as in the design. */}
            {tick && (
              <Image
                source={DECO.heroTick.source}
                style={{ width: DECO.heroTick.w * u, height: DECO.heroTick.h * u, marginLeft: -5 * u, marginRight: 5 * u, transform: [{ translateY: statusSize * 0.08 }] }}
                resizeMode="contain"
              />
            )}
            {/* The hero keeps its shape, so its lines keep their size whatever the phone's text size (as the title):
                grown, two lines and Yükle would cross the gold border. The card's label reads them out. */}
            <Text
              style={[s.status, { fontSize: status.kind === 'locked' ? statusSize * 0.9 : statusSize, lineHeight: statusSize * 1.3 }]}
              numberOfLines={2}
              maxFontSizeMultiplier={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}>
              {wideSpaces(tick ? status.text.slice(2) : status.text)}
            </Text>
          </View>
          {status.kind === 'next' && (
            <View style={s.track}>
              <LinearGradient colors={['#f8e7b0', '#e2b067']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: '100%', width: `${status.progress * 100}%`, borderRadius: 2 }} />
            </View>
          )}
        </View>
        {locked && (
          // Sized with the card (HERO_LOAD), so it stays inside the border on a 320 dp phone too; the slop keeps the
          // touch area near 44 dp there.
          <Pressable
            onPress={onLoad}
            hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={`Jeton yükle: ${level.name}`}
            style={[s.load, { marginTop: HERO_LOAD.gap * u, minHeight: HERO_LOAD.h * u, paddingHorizontal: HERO_LOAD.padX * u }]}>
            <LinearGradient colors={['#fbecb6', '#f6d585', '#e9ad52', '#f8d983']} locations={[0, 0.35, 0.7, 1]} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} />
            <Text style={[s.loadText, { fontSize: HERO_LOAD.font * u, lineHeight: HERO_LOAD.font * u * 1.25 }]} numberOfLines={1} maxFontSizeMultiplier={1}>
              Yükle
            </Text>
          </Pressable>
        )}
      </View>
      {locked && (
        // Sized with the card (HERO_LOCK), so it keeps its gap above the title on a narrow phone.
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            s.lock,
            {
              top: HERO_LOCK.top * u,
              left: HERO_TEXT.left * u,
              gap: HERO_LOCK.gap * u,
              borderRadius: HERO_LOCK.radius * u,
              paddingHorizontal: HERO_LOCK.padX * u,
              paddingVertical: HERO_LOCK.padY * u,
            },
          ]}>
          <Ionicons name="lock-closed" size={HERO_LOCK.icon * u} color="#fff" />
          <Text style={[s.lockText, { fontSize: HERO_LOCK.font * u, lineHeight: HERO_LOCK.font * u * 1.25 }]} maxFontSizeMultiplier={1}>
            Kilitli
          </Text>
        </View>
      )}
    </View>
  );
}

const spoken = (st: HeroStatus) =>
  st.kind === 'open' ? st.text.replace('✓ ', '') : st.kind === 'next' ? `${st.text} puan, yüzde ${Math.floor(st.progress * 100)}` : `Bu seviyeye ${groupDigits(st.left)} puan kaldı`;

const s = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  status: { flexShrink: 1, color: '#f2e4b9', fontWeight: '600', textShadowColor: 'rgba(20,6,30,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  track: { height: 4, borderRadius: 2, marginTop: 6, marginRight: 24, backgroundColor: 'rgba(255,240,205,0.2)', overflow: 'hidden' },
  load: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fff0c2',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxShadow: '0 2px 6px rgba(30,10,0,0.55)',
  },
  loadText: { color: '#2a150d', fontWeight: '800' },
  lock: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(12,6,24,0.62)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,240,200,0.35)',
  },
  lockText: { color: '#fff', fontWeight: '800' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(203,189,234,0.28)' },
  dotOn: { width: 14, backgroundColor: '#f3d28b' },
});
