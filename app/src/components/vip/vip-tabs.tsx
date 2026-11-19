// The privilege centre's top bar (back, VIP / Abonelik / Rütbe, help) and the VIP tab's second row (Ayrıcalıklar,
// Üyelere Özel), drawn as the client's designs: on the night VIP tab a dark glass pill with a glossy gold one for the
// open tab; on the light Abonelik design a mauve pill with a soft peach one.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { DECO, PX, SOFT_GLOW } from './assets';

export type PrivilegeTab = 'svip' | 'vip' | 'noble';
const TABS: [PrivilegeTab, string][] = [
  ['svip', 'VIP'],
  ['vip', 'Abonelik'],
  ['noble', 'Rütbe'],
];

/** The glossy gold of the open tab: highlight, honey, amber middle, a lighter rim at the bottom. */
const GOLD_PILL = ['#fbecb6', '#f6d585', '#e9ad52', '#f8d983'] as const;

/**
 * `night`: the VIP tab's design (dark glass, glossy gold, white icons). `light`: the Abonelik tab's design (a mauve
 * pill, a peach one for the open tab, dark plum icons), also used by Rütbe in the light scheme.
 */
export type TopBarVariant = 'night' | 'light';

export function PrivilegeTopBar({
  tab,
  onTab,
  onBack,
  onHelp,
  variant,
}: {
  tab: PrivilegeTab;
  onTab: (t: PrivilegeTab) => void;
  onBack: () => void;
  onHelp: () => void;
  variant: TopBarVariant;
}) {
  // A narrow phone (320–359 dp) gets tighter tabs, so the three names stay whole. The names keep the design's size
  // whatever the phone's text size: a larger one would cut them on a 360 dp phone (the web can't shrink text).
  const narrow = useWindowDimensions().width < 360;
  if (variant === 'light') return <LightTopBar tab={tab} onTab={onTab} onBack={onBack} onHelp={onHelp} narrow={narrow} />;
  const icon = '#ffffff';
  return (
    <View style={s.bar}>
      <Pressable onPress={onBack} style={[s.iconBtn, narrow && s.iconNarrow]} accessibilityRole="button" accessibilityLabel="Geri">
        <Ionicons name="chevron-back" size={33} color={icon} style={[s.lift, { marginLeft: -3 }]} />
      </Pressable>
      <View style={s.middle}>
        <View accessibilityRole="tablist" style={[s.pill, s.pillNight]}>
          <LinearGradient colors={['#110b26', '#0a061c', '#080418']} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} />
          {TABS.map(([k, label]) => {
            const on = tab === k;
            return (
              <Pressable key={k} onPress={() => onTab(k)} accessibilityRole="tab" accessibilityLabel={label} aria-selected={on} style={[s.tab, on && s.tabOn, narrow && s.tabNarrow]}>
                {/* The open tab's orange light spills out at its bottom left, around a bright spark on the rim, as in
                    the design (drawn first, so the gold covers the part inside). */}
                {on && <Image source={SOFT_GLOW} style={s.pillFlare} />}
                {on && <LinearGradient colors={GOLD_PILL} locations={[0, 0.35, 0.7, 1]} style={[StyleSheet.absoluteFill, s.gold]} />}
                {on && <Spark style={s.pillSpark} />}
                <Text
                  style={[s.tabText, narrow && { fontSize: 13.5 }, on ? [s.tabTextOn, narrow && { fontSize: 18.5 }] : { color: '#cbbdea' }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Pressable onPress={onHelp} style={[s.iconBtn, narrow && s.iconNarrow]} accessibilityRole="button" accessibilityLabel="Yardım">
        <View style={[s.help, s.lift, { borderColor: icon, marginLeft: 4 }]}>
          <Text style={[s.helpMark, { color: icon }]} maxFontSizeMultiplier={1}>
            ?
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

/**
 * The Abonelik design's bar: a 237 × 33 dp mauve track, the open tab a peach pill 1.7 dp inside it and wider than a
 * third (93.7 dp), the three names in the same heavy 12.8 dp. The tabs reach 44 dp for the finger above and below.
 */
function LightTopBar({ tab, onTab, onBack, onHelp, narrow }: { tab: PrivilegeTab; onTab: (t: PrivilegeTab) => void; onBack: () => void; onHelp: () => void; narrow: boolean }) {
  return (
    <View style={[s.bar, s.barLight]}>
      <Pressable onPress={onBack} style={[s.iconBtn, narrow && s.iconNarrow]} accessibilityRole="button" accessibilityLabel="Geri">
        <Ionicons name="chevron-back" size={21} color="#200A1B" />
      </Pressable>
      <View style={s.middle}>
        <View accessibilityRole="tablist" style={s.lTrack}>
          {TABS.map(([k, label]) => {
            const on = tab === k;
            return (
              <Pressable
                key={k}
                onPress={() => onTab(k)}
                accessibilityRole="tab"
                accessibilityLabel={label}
                aria-selected={on}
                hitSlop={{ top: 6, bottom: 6 }}
                style={[s.lTab, { flexGrow: on ? L_ON : L_OFF }]}>
                {on && <LinearGradient colors={['#FEE0B5', '#FDDCAB', '#FDDBA8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, s.gold]} />}
                <Text style={[s.lText, narrow && { fontSize: 12 }, { color: on ? '#2E1D05' : '#6B395D' }]} numberOfLines={1} maxFontSizeMultiplier={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Pressable onPress={onHelp} style={[s.iconBtn, narrow && s.iconNarrow]} accessibilityRole="button" accessibilityLabel="Yardım">
        <Ionicons name="help-circle-outline" size={21} color="#23081E" />
      </Pressable>
    </View>
  );
}
/** The open tab's share of the light track and each other one's (93.7 dp and the rest of 237 less the insets). */
const L_ON = 93.7;
const L_OFF = (237 - 3.4 - L_ON) / 2;

/** Ayrıcalıklar (this page, gold outline) and Üyelere Özel (opens the shop). */
export function VipSubTabs({ onMembers }: { onMembers: () => void }) {
  const narrow = useWindowDimensions().width < 360;
  const tight = narrow && s.subNarrow;
  return (
    <View style={s.subRow} accessibilityRole="tablist">
      <View accessibilityRole="tab" accessibilityLabel="Ayrıcalıklar" aria-selected style={[s.sub, tight, s.subOn]}>
        <LinearGradient colors={['#4f3429', '#472e26', '#5e3c26', '#9a6a36']} locations={[0, 0.45, 0.75, 1]} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} />
        {/* The design's flare on the gold rim's bottom, under the crown: a light streak along the rim and a bright core
            whose glow spills in and out of it. */}
        <LinearGradient colors={['rgba(255,226,160,0)', 'rgba(255,236,185,0.95)', 'rgba(255,226,160,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.subStreak} pointerEvents="none" />
        <Spark style={s.subSpot} />
        <Image source={DECO.tabCrown.source} style={narrow ? { width: 21, height: 17 } : { width: 26, height: 21 }} resizeMode="contain" />
        <Text style={[s.subText, narrow && { fontSize: 13.5 }, { color: '#f6e6b8' }]} numberOfLines={1} maxFontSizeMultiplier={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          Ayrıcalıklar
        </Text>
      </View>
      <Pressable onPress={onMembers} accessibilityRole="tab" accessibilityLabel="Üyelere Özel" accessibilityHint="Mağazayı açar" aria-selected={false} style={[s.sub, tight, s.subOff]}>
        <LinearGradient colors={['#1a102d', '#120c26', '#0f081e']} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} />
        <Image source={DECO.tabDiamond.source} style={narrow ? { width: 19, height: 17 } : { width: 23, height: 20 }} resizeMode="contain" />
        {/* Lighter and a little smaller than Ayrıcalıklar, as in the design. */}
        <Text style={[s.subText, s.membersText, narrow && { fontSize: 12.5 }]} numberOfLines={1} maxFontSizeMultiplier={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          Üyelere Özel
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * A spark on a gold rim, as in the design: a tiny bright core inside a warm glow that fades out (a bare white dash
 * with a shadow read as a hard line). Its box is centred on the spot; the style places it.
 */
function Spark({ style }: { style: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.spark, style]} pointerEvents="none">
      <Image source={SOFT_GLOW} resizeMode="stretch" style={s.sparkGlow} />
      <Image source={SOFT_GLOW} resizeMode="stretch" style={s.sparkHeart} />
      <Image source={SOFT_GLOW} resizeMode="stretch" style={s.sparkCore} />
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2, paddingTop: 2, minHeight: 48 },
  iconBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  iconNarrow: { width: 44 },
  middle: { flex: 1, alignItems: 'center' },
  // The design's back arrow and help ring sit a little above the bar's middle.
  lift: { transform: [{ translateY: -2 }] },
  // The open tab fills the bar's inner height, as in the design (37 dp of a 40 dp bar).
  pill: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: 1, padding: 1, maxWidth: '100%' },
  // Not clipped: the open tab's gold light spills over the bar's rim, as in the design.
  pillNight: { borderColor: '#3c3150' },
  tab: { minHeight: 36, paddingHorizontal: 15, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexShrink: 1 },
  tabNarrow: { paddingHorizontal: 9 },
  // The open tab is snug around its word, as the design's gold pill.
  tabOn: { minWidth: 58, paddingHorizontal: 11, borderWidth: 1, borderColor: '#fff0c2', boxShadow: '0 0 18px 4px rgba(245,160,50,0.75), 0 1px 2px rgba(80,40,0,0.5)' },
  gold: { borderRadius: 999 },
  pillFlare: { position: 'absolute', left: -12, bottom: -13, width: 46, height: 28, tintColor: '#ffa83c', opacity: 0.45, pointerEvents: 'none' },
  // On the rim where its bottom starts to curve up at the left, as in the design.
  pillSpark: { left: '13%', bottom: -6, marginLeft: -14 },
  // Three soft lights, no hard edge: the warm glow, a pale heart and a small white core.
  spark: { position: 'absolute', width: 28, height: 14 },
  sparkGlow: { position: 'absolute', left: 0, top: 0, width: 28, height: 14, tintColor: '#ffa83a' },
  sparkHeart: { position: 'absolute', left: 7, top: 3.5, width: 14, height: 7, tintColor: '#ffe9b0' },
  sparkCore: { position: 'absolute', left: 10.5, top: 5.25, width: 7, height: 3.5 },
  tabText: { fontSize: 14.5, fontWeight: '800' },
  tabTextOn: { color: '#2a150d', fontSize: 21 },
  help: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.6, alignItems: 'center', justifyContent: 'center' },
  helpMark: { fontSize: 15.5, lineHeight: 19, fontWeight: '700' },
  // The design's icon centres: 31 dp from the left, 28 from the right; the track centred 24 dp from the top.
  barLight: { paddingLeft: 7, paddingRight: 4, paddingTop: 0 },
  lTrack: { flexDirection: 'row', width: 237, maxWidth: '100%', height: 33.2, padding: 1.7, borderRadius: 999, backgroundColor: '#E9D8E2' },
  lTab: { flexBasis: 0, minWidth: 0, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  lText: { fontSize: 12.8, fontWeight: '800' },
  subRow: { flexDirection: 'row', justifyContent: 'center', gap: 46 * PX, paddingHorizontal: 14, marginTop: 6 },
  sub: { flexShrink: 1, minWidth: 0, minHeight: 34, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10 },
  subNarrow: { gap: 5, paddingHorizontal: 8 },
  subOn: { borderWidth: 1.2, borderColor: '#e9cf9f', boxShadow: '0 0 8px rgba(240,180,90,0.35)' },
  subOff: { borderWidth: 1, borderColor: '#43365a' },
  // On the rim (the 1.2 dp under the padding box).
  subStreak: { position: 'absolute', bottom: -1.9, left: '6%', right: '46%', height: 2.6, borderRadius: 1.5 },
  subSpot: { bottom: -7.6, left: '28%', marginLeft: -14 },
  subText: { fontSize: 14.5, fontWeight: '700', flexShrink: 1 },
  membersText: { fontSize: 13, fontWeight: '600', color: '#c2b1dc' },
});
