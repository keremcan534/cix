// The VIP tab under the hero: "VIP n Hakları x/y" between two crowns, the rights as glass cards (the design's pictures
// for the rights it draws, the app's own art for any other the server adds) and the gold-rimmed points panel.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Art } from '@/components/Art';
import { Text } from '@/components/text';
import { BADGE_COLORS, artGlows, artScaleFor, cardMetrics, gridColumns, levelArtFor, lowerCrownFits, rightArtKey, vipTint, wideSpaces, type ListRight, type VipTint } from '@/lib/vip-screen';
import { DECO, LOWER_GLOW, PX, RIGHT_ART, SOFT_GLOW } from './assets';
import { GoldText } from './gold-text';
import { VIP_LEVEL_ART } from './level-art';

const HEADING_BANDS = ['#fcefc0', '#f4dfa6', '#eed495', '#eacc8d'] as const;
const HEADING_STOPS = [0.36, 0.47, 0.58, 1] as const;
/** The dark scheme's dim text, for a locked right's name (the tab is always drawn dark). */
const DIM = '#b9a8c9';
/** Between the last row of cards and the points panel (the lower crown reaches 3 dp under the panel's rim). */
const PANEL_GAP = 16;
/** The picked level's colours (its badge's, with the VIP set's rim tones), or null: the design's purple. */
export const tintOfLevel = (level: number): VipTint | null => {
  const at = levelArtFor(level);
  const badge = at ? BADGE_COLORS[at] : undefined;
  const card = at ? VIP_LEVEL_ART[at]?.card : undefined;
  return badge && card ? vipTint({ inner: [badge, badge], rim: card.rim }) : null;
};

export function RightsHeading({ title }: { title: string }) {
  return (
    <View style={s.heading} accessibilityRole="header" accessible accessibilityLabel={title}>
      <Image source={DECO.crownLeft.source} style={{ width: DECO.crownLeft.w * PX, height: DECO.crownLeft.h * PX }} resizeMode="contain" />
      <GoldText bands={HEADING_BANDS} stops={HEADING_STOPS} shadow="rgba(20,8,0,0.6)" fit wrap={{ flexShrink: 1 }} style={s.headingText}>
        {wideSpaces(title)}
      </GoldText>
      <Image source={DECO.crownRight.source} style={{ width: DECO.crownRight.w * PX, height: DECO.crownRight.h * PX }} resizeMode="contain" />
    </View>
  );
}

export function RightsGrid({
  rights,
  level,
  width,
  fontScale,
  onPress,
}: {
  rights: ListRight[];
  /** The level picked in the carousel: its rights are open, the rest locked; the set's pictures are its own. */
  level: number;
  width: number;
  fontScale: number;
  onPress: (r: ListRight, open: boolean) => void;
}) {
  const cols = gridColumns(width, fontScale);
  const m = cardMetrics(width, cols, fontScale);
  const crownW = DECO.lowerCrown.w * PX;
  const crown = lowerCrownFits(rights.length, cols, m.cardW, m.gap, crownW);
  const k = width / 841; // dp per design px
  const tint = tintOfLevel(level);
  return (
    <View style={{ paddingHorizontal: m.margin }}>
      {/* The design's purple wave behind the last row's empty cells and the crown, on down the panel's right side
          and faded out under it (the panel, drawn after, covers the rest): its row 264 is the panel's top. */}
      {crown && (
        <Image
          source={LOWER_GLOW.source}
          resizeMode="stretch"
          style={{
            position: 'absolute',
            right: 0,
            bottom: -PANEL_GAP - (LOWER_GLOW.h - LOWER_GLOW.panelTop) * k,
            width: LOWER_GLOW.w * k,
            height: LOWER_GLOW.h * k,
            pointerEvents: 'none',
          }}
        />
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: m.gap, rowGap: m.rowGap }}>
        {rights.map((r) => (
          <RightCard key={r.name} right={r} level={level} tint={tint} open={r.level <= level} m={m} onPress={() => onPress(r, r.level <= level)} />
        ))}
      </View>
      {/* The design's crown in the last row's empty cells, its cut bottom edge under the panel's rim. */}
      {crown && (
        <Image source={DECO.lowerCrown.source} style={{ position: 'absolute', right: m.margin + 2, bottom: -PANEL_GAP - 3, width: crownW, height: DECO.lowerCrown.h * PX }} resizeMode="contain" />
      )}
    </View>
  );
}

type Metrics = ReturnType<typeof cardMetrics>;

function RightCard({ right, level, tint, open, m, onPress }: { right: ListRight; level: number; tint: VipTint | null; open: boolean; m: Metrics; onPress: () => void }) {
  const key = rightArtKey(right);
  // VIP seti: the picked level's own badge, frame, bubble or entry effect picture, fitted to the picture's box.
  const setLevel = right.set ? levelArtFor(level) : null;
  const pic = right.set && setLevel ? VIP_LEVEL_ART[setLevel]?.[right.set] : null;
  const art = pic ? null : key ? RIGHT_ART[key] : null;
  const k = artScaleFor(m.cardW);
  const radius = 14.5;
  const glow = artGlows(right.set === 'frame' ? 'frame' : key);
  const picFit = pic ? Math.min((m.cardW - 10) / pic.w, (m.artH - 4) / pic.h) : 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // "Kilitli" in the name rather than a disabled state: the card still answers a tap (which level opens it), and
      // the web (react-native-web) drops accessibilityState.
      accessibilityLabel={open ? right.name : `${right.name}, kilitli`}
      accessibilityHint={open ? undefined : 'Hangi seviyede açıldığını gösterir'}
      style={({ pressed }) => [{ width: m.cardW, height: m.cardH }, pressed && { opacity: 0.85 }]}>
      {/* The warm light pooled under the bottom rim and over the top one, as in the design (between two rows the
          two meet): halves of soft glows centred on the rims, clipped to outside the card. */}
      <View style={s.pool}>
        <Image source={SOFT_GLOW} resizeMode="stretch" style={s.poolGlow} />
      </View>
      <View style={s.topPool}>
        <Image source={SOFT_GLOW} resizeMode="stretch" style={s.topPoolGlow} />
      </View>
      {/* A thin rim, pale lavender at the top, gold at the bottom, then the dark purple glass; in the picked level's
          rim and inner colours when it has them (VIP seti). */}
      <LinearGradient colors={tint?.rim ?? ['#e0cde0', '#8a6f84', '#7c5f72', '#ecc99e']} locations={[0, 0.25, 0.75, 1]} style={[s.rim, { padding: m.rim, borderRadius: radius }]}>
        <LinearGradient colors={tint?.glass ?? ['#3e2862', '#281a45', '#1a102e', '#140a1e']} locations={[0, 0.22, 0.5, 1]} style={[s.glass, { borderRadius: radius - m.rim }]}>
          {/* The lavender light under the rim's top middle (a soft glow centred on the top edge, no band) and the
              purple at the bottom right. Gradient offsets are in locations, not start/end points: the web keeps
              only a gradient's angle, so both draw it the same. */}
          <Image source={SOFT_GLOW} resizeMode="stretch" style={[s.topGlow, { top: -m.cardH * 0.34, height: m.cardH * 0.68 }, tint && { tintColor: tint.glow }]} />
          <LinearGradient
            colors={tint ? ['rgba(0,0,0,0)', 'rgba(0,0,0,0)', tint.corner] : ['rgba(70,36,118,0)', 'rgba(70,36,118,0)', 'rgba(70,36,118,0.6)']}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[s.artBox, { marginTop: m.artTop, height: m.artH }, !open && { opacity: 0.38 }]}>
            {/* The warm light behind the picture, as in the design (not inside the frame's empty ring). */}
            {glow && <Image source={SOFT_GLOW} resizeMode="stretch" style={[s.artGlow, { height: m.artH + 12 }]} />}
            {pic ? (
              <Image source={pic.source} style={{ width: pic.w * picFit, height: pic.h * picFit }} resizeMode="contain" />
            ) : art ? (
              <Image source={art.source} style={{ width: Math.min(art.w * k, m.cardW - 8), height: Math.min(art.h * k, m.artH) }} resizeMode="contain" />
            ) : right.art ? (
              <Art name={right.art} size={Math.min(m.artH - 6, m.cardW * 0.55)} />
            ) : (
              <Text style={{ fontSize: m.artH * 0.55, lineHeight: m.artH * 0.75 }} maxFontSizeMultiplier={1}>
                {right.emoji}
              </Text>
            )}
          </View>
          {/* Right under the picture, as in the design: one line sits where a two-line name's first line does. */}
          <View style={[s.labelBox, { marginTop: m.labelTop - m.artTop - m.artH, paddingHorizontal: m.padX }]}>
            {/* The design's word gap (without the wider space the words ran together: 7 design px against its 9–10). */}
            <Text style={[s.label, { fontSize: m.font, lineHeight: m.lineH, letterSpacing: m.letterSpacing }, !open && { color: DIM }]} numberOfLines={2}>
              {wideSpaces(right.name)}
            </Text>
          </View>
          {!open && (
            <View style={s.lock} pointerEvents="none">
              <Ionicons name="lock-closed" size={10} color="#f3e2b2" />
            </View>
          )}
        </LinearGradient>
      </LinearGradient>
      {/* The light on the rim: a gold flare at the bottom middle and a warm one at the top middle, each a light
          streak along the rim in a flat glow, with a small bright core. */}
      <Image source={SOFT_GLOW} resizeMode="stretch" style={s.flare} />
      <LinearGradient colors={STREAK} locations={STREAK_AT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.streak} pointerEvents="none" />
      <View style={s.spot} pointerEvents="none" />
      <Image source={SOFT_GLOW} resizeMode="stretch" style={s.topFlare} />
      <LinearGradient colors={STREAK} locations={STREAK_AT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.topStreak} pointerEvents="none" />
      <View style={s.topSpot} pointerEvents="none" />
    </Pressable>
  );
}

const STREAK = ['rgba(255,214,140,0)', 'rgba(255,224,160,0.6)', 'rgba(255,246,218,1)', 'rgba(255,224,160,0.6)', 'rgba(255,214,140,0)'] as const;
const STREAK_AT = [0, 0.3, 0.5, 0.7, 1] as const;

/** The bottom panel: how VIP points are earned (the server's rule, as today), then the level drop rule if one is on. */
export function VipPointsInfo({ decay, width, level = 0 }: { decay: string | null; width: number; /** The picked level: its colours. */ level?: number }) {
  const tint = tintOfLevel(level);
  // Under 370 dp a slightly smaller text and crown and tighter padding keep the rule in three lines, as in the design.
  const narrow = width < 370;
  const crownK = narrow ? 0.8 : 1;
  const text = [s.infoText, narrow && s.infoTextNarrow];
  return (
    // The purple light around and under the panel, then its cream-gold rim (rose down the sides) with a light line
    // along the top.
    <View style={s.infoGlow}>
      <LinearGradient colors={tint?.infoRim ?? ['#f4dccb', '#d9b2b4', '#b98b9e', '#d3a9a6', '#fde6cd']} locations={[0, 0.15, 0.5, 0.85, 1]} style={s.infoRim}>
        <LinearGradient
          colors={tint?.info ?? ['#4c336b', '#372452', '#221535', '#170c26', '#170b25', '#1e0f30']}
          locations={[0, 0.12, 0.32, 0.5, 0.8, 1]}
          style={[s.info, narrow && s.infoNarrow]}>
          {/* Dark behind the words, violet growing toward the right edge, lavender sheens at the right corners and a
              rose one at the bottom left, as in the design. */}
          <LinearGradient
            colors={tint ? [tint.infoSide[0], tint.infoSide[0], tint.infoSide[1], tint.infoSide[2]] : ['rgba(110,52,175,0)', 'rgba(110,52,175,0)', 'rgba(120,56,190,0.45)', 'rgba(150,70,215,0.8)']}
            locations={[0, 0.58, 0.86, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <Image source={SOFT_GLOW} resizeMode="stretch" style={[s.infoSheen, tint && { tintColor: tint.glow }]} />
          <Image source={SOFT_GLOW} resizeMode="stretch" style={[s.infoSheenLow, tint && { tintColor: tint.glow }]} />
          <Image source={SOFT_GLOW} resizeMode="stretch" style={s.infoSheenLeft} />
          <LinearGradient colors={['rgba(255,226,195,0)', 'rgba(255,232,205,0.4)', 'rgba(255,226,195,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.infoTopLight} />
          {/* The design's faint second line just inside the rim. */}
          <View style={s.infoInner} pointerEvents="none" />
          <Image source={DECO.infoCrown.source} style={{ width: DECO.infoCrown.w * PX * crownK, height: DECO.infoCrown.h * PX * crownK }} resizeMode="contain" />
          <View style={{ flex: 1, gap: 6 }}>
            {/* Grown past 1.1 the rule's last line is left with one word. */}
            <Text style={text} textBreakStrategy="balanced" maxFontSizeMultiplier={1.1}>
              {'Yüklediğin her jeton 1 VIP puanı kazandırır.\nBonus jetonlar ve hediye gelen jetonlar sayılmaz; iade edilen yüklemenin puanı geri alınır.'}
            </Text>
            {decay && (
              <Text style={[text, { color: '#cdb9c9' }]} textBreakStrategy="balanced" maxFontSizeMultiplier={1.1}>
                Seviye düşmesi: {decay}
              </Text>
            )}
          </View>
        </LinearGradient>
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  headingText: { fontSize: 17.5, lineHeight: 24, fontWeight: '800' },
  rim: { flex: 1, boxShadow: '0 2px 6px rgba(5,0,15,0.4)' },
  glass: { flex: 1, overflow: 'hidden', boxShadow: 'inset 0 1px 0 rgba(160,120,190,0.45)' },
  // The glows give a width and height of their own: an image's size (its file's, by default) wins over left + right.
  topGlow: { position: 'absolute', left: '2%', width: '96%', tintColor: '#9c74d2', opacity: 0.42, pointerEvents: 'none' },
  artBox: { alignItems: 'center', justifyContent: 'center' },
  artGlow: { position: 'absolute', left: '10%', width: '80%', top: -6, tintColor: '#ffbe6e', opacity: 0.26, pointerEvents: 'none' },
  labelBox: { flex: 1 },
  label: { color: '#f7ebc7', fontWeight: '700', textAlign: 'center' },
  lock: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,4,20,0.6)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(243,226,178,0.5)',
  },
  // The flares on the rim (the rim's 1.5 dp): a flat warm glow centred on it, a light streak along it and a small
  // bright core.
  flare: { position: 'absolute', bottom: -5, left: '18%', width: '64%', height: 10, tintColor: '#ffc868', opacity: 0.85, pointerEvents: 'none' },
  streak: { position: 'absolute', bottom: -0.5, left: '12%', right: '12%', height: 2.2, borderRadius: 1.1 },
  spot: { position: 'absolute', bottom: 0, left: '50%', marginLeft: -2.5, width: 5, height: 1.5, borderRadius: 1, backgroundColor: '#fffbee', boxShadow: '0 0 6px 2px rgba(255,205,120,0.9)' },
  topFlare: { position: 'absolute', top: -4, left: '26%', width: '48%', height: 8, tintColor: '#ffdc98', opacity: 0.75, pointerEvents: 'none' },
  topStreak: { position: 'absolute', top: -0.3, left: '24%', right: '24%', height: 2, borderRadius: 1, opacity: 0.9 },
  topSpot: { position: 'absolute', top: 0, left: '50%', marginLeft: -2, width: 4, height: 1.4, borderRadius: 1, backgroundColor: '#fff8e6', boxShadow: '0 0 5px 2px rgba(255,200,120,0.8)' },
  // The pools outside the card: clipped to below the bottom rim and above the top one, so they never light the
  // glass or the name.
  pool: { position: 'absolute', top: '100%', left: '4%', right: '4%', height: 16, overflow: 'hidden', pointerEvents: 'none' },
  poolGlow: { position: 'absolute', left: 0, width: '100%', top: -16, height: 32, tintColor: '#ffae50', opacity: 0.45 },
  topPool: { position: 'absolute', bottom: '100%', left: '16%', right: '16%', height: 12, overflow: 'hidden', pointerEvents: 'none' },
  topPoolGlow: { position: 'absolute', left: 0, width: '100%', top: 0, height: 24, tintColor: '#ffbc62', opacity: 0.35 },
  infoGlow: { marginTop: PANEL_GAP, marginHorizontal: 12, borderRadius: 14.5, boxShadow: '0 0 12px rgba(190,120,255,0.45), 0 6px 16px rgba(120,60,200,0.3)' },
  infoRim: { borderRadius: 14.5, padding: 1.3 },
  info: { borderRadius: 13.2, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16.5, paddingRight: 10, paddingVertical: 11, minHeight: 66, overflow: 'hidden' },
  infoNarrow: { gap: 8, paddingLeft: 12, paddingRight: 8 },
  infoSheen: { position: 'absolute', top: -28, right: -50, width: 150, height: 56, tintColor: '#b866f0', opacity: 0.75, pointerEvents: 'none' },
  infoSheenLow: { position: 'absolute', bottom: -28, right: -50, width: 150, height: 56, tintColor: '#b45ae6', opacity: 0.7, pointerEvents: 'none' },
  infoSheenLeft: { position: 'absolute', bottom: -22, left: -40, width: 110, height: 44, tintColor: '#c486b4', opacity: 0.45, pointerEvents: 'none' },
  infoTopLight: { position: 'absolute', top: 0, left: '6%', right: '6%', height: 1.2 },
  // About 6 design px (2.8 dp) inside the rim's outer edge, rose-tinted as in the design.
  infoInner: { position: 'absolute', top: 1.5, left: 1.5, right: 1.5, bottom: 1.5, borderRadius: 11.7, borderWidth: 0.75, borderColor: 'rgba(240,180,205,0.24)' },
  infoText: { color: '#d8c29c', fontSize: 12, lineHeight: 15.5, letterSpacing: 0, fontWeight: '600' },
  infoTextNarrow: { fontSize: 11.5, lineHeight: 15 },
});
