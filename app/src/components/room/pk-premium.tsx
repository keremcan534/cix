// The PK screens' look (SimilarClub PK Premium V3 concept, güncelleme 6): deep purple, gold rims, pink against blue,
// crowns and laurels. The ornaments are alpha pictures cut from the concept (app/scripts/pk-art-cut.py →
// assets/pk/*.png); every name, photo, score, time and rank on them is a real component drawn over them.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { Art, type ArtName } from '@/components/Art';
import { Icon3D } from '@/components/Icon3D';
import { Photo } from '@/components/photo';

export const PK_ART = {
  crest: require('../../../assets/pk/pk-crest.png'),
  laurelPink: require('../../../assets/pk/pk-laurel-pink.png'),
  laurelBlue: require('../../../assets/pk/pk-laurel-blue.png'),
  vs: require('../../../assets/pk/pk-vs.png'),
  lion: require('../../../assets/pk/pk-lion.png'),
  wolf: require('../../../assets/pk/pk-wolf.png'),
  trophy: require('../../../assets/pk/pk-trophy.png'),
  target: require('../../../assets/pk/pk-target.png'),
} as const;

/** Each picture's size (px) and, for the laurel frames, the photo's hole in it (measured from the alpha). */
const ART_SIZE = {
  crest: [600, 174],
  vs: [166, 170],
  lion: [218, 208],
  wolf: [199, 207],
  trophy: [175, 275],
  target: [90, 91],
} as const;
type Hole = { w: number; h: number; cx: number; cy: number; r: number };
const LAUREL: Record<'pink' | 'blue', Hole> = {
  pink: { w: 360, h: 322, cx: 179, cy: 213.5, r: 100 },
  blue: { w: 360, h: 325, cx: 184.5, cy: 217, r: 100 },
};

/** The palette: a night-purple stage, gold metal, the pink (red team, left) and blue (right) sides. */
export const PK = {
  bg: ['#3A0F5C', '#200937', '#12051F'] as const,
  panel: 'rgba(30,8,48,0.78)',
  glass: 'rgba(255,255,255,0.06)',
  gold: ['#FFF4B8', '#F7C85A', '#D18F25', '#8E5A10'] as const,
  goldText: '#FFD86B',
  goldEdge: '#E7A93A',
  pink: ['#FF5BB0', '#C2187A', '#6E0B49'] as const,
  blue: ['#43B5FF', '#2357E0', '#13286E'] as const,
  pinkGlow: 'rgba(255,79,163,0.55)',
  blueGlow: 'rgba(67,160,255,0.55)',
  ribbon: ['#A3127A', '#6A0C5A'] as const,
  win: ['#E3263F', '#8E0B22'] as const,
  ink: '#FFFFFF',
  dim: '#D9C3EC',
} as const;

const shadow = (color: string, r = 6) => ({ textShadowColor: color, textShadowRadius: r, textShadowOffset: { width: 0, height: 1 } });

/** A rim of gold round anything: a gold gradient `width` px thick, the content's own background inside. */
export function GoldRim({ children, radius = 18, width = 2, style, inner, sheet }: { children: ReactNode; radius?: number; width?: number; style?: StyleProp<ViewStyle>; inner?: StyleProp<ViewStyle>; sheet?: boolean }) {
  // A bottom sheet: round and rimmed on top only, it runs off the screen's bottom edge.
  const corners = sheet ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : null;
  return (
    <LinearGradient colors={PK.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: radius, padding: width }, sheet && { paddingBottom: 0 }, corners, style]}>
      <View style={[{ borderRadius: radius - width, overflow: 'hidden' }, corners, inner]}>{children}</View>
    </LinearGradient>
  );
}

/** The screens' backdrop: the purple night with a soft light from the top. */
export function PkBackdrop({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  return (
    <LinearGradient colors={PK.bg} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={style}>
      <LinearGradient pointerEvents="none" colors={['rgba(255,200,120,0.22)', 'rgba(255,120,200,0.06)', 'transparent']} style={styles.topLight} />
      {children}
    </LinearGradient>
  );
}

/** The winged crown over a screen's title. */
export function Crest({ width }: { width: number }) {
  const [w, h] = ART_SIZE.crest;
  return <Image source={PK_ART.crest} style={{ width, height: (width * h) / w }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}

/** A title on a ribbon with a gold rim ("PK Başlat", "PK Sonuçları", "Taç Kazandıranlar"). */
export function Ribbon({ title, sub, size = 22, colors = PK.ribbon }: { title: string; sub?: string; size?: number; colors?: readonly [string, string, ...string[]] }) {
  return (
    <GoldRim radius={14} width={2} style={styles.ribbonWrap}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.ribbon}>
        <Text style={[styles.ribbonTitle, { fontSize: size, lineHeight: size + 4 }]} accessibilityRole="header">
          {title}
        </Text>
        {sub ? (
          <Text style={styles.ribbonSub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </LinearGradient>
    </GoldRim>
  );
}

/** The VS shield. */
export function VsBadge({ size }: { size: number }) {
  const [w, h] = ART_SIZE.vs;
  return <Image source={PK_ART.vs} style={{ width: size, height: (size * h) / w }} resizeMode="contain" accessibilityLabel="karşı" />;
}

/** Red team's lion or blue team's wolf banner. */
export function TeamBanner({ team, height }: { team: 'red' | 'blue'; height: number }) {
  const [w, h] = team === 'red' ? ART_SIZE.lion : ART_SIZE.wolf;
  return <Image source={team === 'red' ? PK_ART.lion : PK_ART.wolf} style={{ height, width: (height * w) / h }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}

export function Trophy({ height }: { height: number }) {
  const [w, h] = ART_SIZE.trophy;
  return <Image source={PK_ART.trophy} style={{ height, width: (height * w) / h }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}

export function TargetIcon({ size }: { size: number }) {
  return <Image source={PK_ART.target} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}

/**
 * A photo in the laurel frame with its crown, pink (left, the red side) or blue (right). `face` is the photo's
 * diameter; the frame spreads round it (≈1.8 × wide). `cover` draws a room's cover instead of a face; `children`
 * stand in for the photo (an empty side, a team's banner).
 */
export function LaurelFace({ uri, cover, seed, face, tone, onPress, label, children, glow }: { uri?: string; cover?: boolean; seed?: string; face: number; tone: 'pink' | 'blue'; onPress?: () => void; label?: string; children?: ReactNode; glow?: boolean }) {
  const hole = LAUREL[tone];
  const k = face / (2 * hole.r);
  const w = hole.w * k;
  const h = hole.h * k;
  // The photo reaches a little under the ring, so no gap shows at its edge.
  const photo = face * 1.05;
  const left = hole.cx * k - photo / 2;
  const top = hole.cy * k - photo / 2;
  const body = (
    <View style={{ width: w, height: h }}>
      {glow && <View pointerEvents="none" style={[styles.faceGlow, { left: left - 6, top: top - 6, width: photo + 12, height: photo + 12, borderRadius: photo, boxShadow: `0 0 ${Math.round(face * 0.35)}px ${tone === 'pink' ? PK.pinkGlow : PK.blueGlow}` }]} />}
      <View style={{ position: 'absolute', left, top, width: photo, height: photo, borderRadius: photo / 2, overflow: 'hidden', backgroundColor: '#1B0830', alignItems: 'center', justifyContent: 'center' }}>
        {children ?? <Photo uri={uri} kind={cover ? 'cover' : 'face'} seed={seed} style={{ width: photo, height: photo }} />}
      </View>
      <Image source={tone === 'pink' ? PK_ART.laurelPink : PK_ART.laurelBlue} style={{ position: 'absolute', left: 0, top: 0, width: w, height: h }} resizeMode="contain" accessibilityIgnoresInvertColors />
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
      {body}
    </Pressable>
  );
}

/** A name on a dark plate with a gold rim, under a face. */
export function NamePlate({ text, width, tone }: { text: string; width: number; tone?: 'pink' | 'blue' }) {
  return (
    <GoldRim radius={10} width={1.5} style={{ width }}>
      <LinearGradient colors={tone === 'blue' ? ['#1D2C6E', '#0E1638'] : tone === 'pink' ? ['#5E0E45', '#2B0722'] : ['#3A1458', '#1C0930']} style={styles.plate}>
        <Text style={styles.plateText} numberOfLines={1}>
          {text}
        </Text>
      </LinearGradient>
    </GoldRim>
  );
}

/** A score with the gift icon, in the side's colour. */
export function GiftScore({ text, tone, size = 20 }: { text: string; tone: 'pink' | 'blue' | 'gold'; size?: number }) {
  const color = tone === 'pink' ? '#FF8FD0' : tone === 'blue' ? '#9CD3FF' : PK.goldText;
  return (
    <View style={styles.giftScore}>
      <Icon3D name="gift" size={Math.round(size * 1.05)} />
      <Text style={[styles.giftScoreText, { color, fontSize: size, lineHeight: size + 6 }, shadow(tone === 'blue' ? 'rgba(40,120,255,0.8)' : 'rgba(255,60,160,0.8)', 8)]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** Two sides' shares: pink from the left, blue from the right, "%60" and "%40" written on them. */
export function ShareBar({ left, right, height = 22 }: { left: number; right: number; height?: number }) {
  const total = left + right;
  // Whole percents that add up to 100; nothing scored yet: half each. A side never draws under 18 of the bar, so its
  // percent stays readable; the number written on it is the exact one.
  const l = total > 0 ? Math.round((left / total) * 100) : 50;
  const r = 100 - l;
  return (
    <GoldRim radius={height} width={1.5} style={{ alignSelf: 'stretch' }}>
      <View style={[styles.shareTrack, { height }]} accessibilityLabel={`Sol yüzde ${l}, sağ yüzde ${r}`}>
        <LinearGradient colors={['#FF4FA3', '#D21C7F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: Math.max(l, 18), justifyContent: 'center', paddingLeft: 10 }}>
          <Text style={styles.shareText} numberOfLines={1}>
            %{l}
          </Text>
        </LinearGradient>
        <View style={styles.shareCut} />
        <LinearGradient colors={['#2F7BFF', '#45B8FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: Math.max(r, 18), justifyContent: 'center', alignItems: 'flex-end', paddingRight: 10 }}>
          <Text style={styles.shareText} numberOfLines={1}>
            %{r}
          </Text>
        </LinearGradient>
      </View>
    </GoldRim>
  );
}

const MEDALS: Record<1 | 2 | 3, readonly [string, string, string]> = {
  1: ['#FFF1A8', '#F2B735', '#9A6410'],
  2: ['#FFFFFF', '#C9D3E6', '#7D8AA5'],
  3: ['#FFD2A6', '#D68A45', '#7A3F12'],
};
/** A place: a metal disc (gold, silver, bronze) with the number and a little crown for the first three, else the number. */
export function RankBadge({ rank, size = 26 }: { rank: number; size?: number }) {
  const medal = rank >= 1 && rank <= 3 ? MEDALS[rank as 1 | 2 | 3] : null;
  if (!medal)
    return (
      <View style={{ width: size, alignItems: 'center' }}>
        <Text style={styles.rankPlain}>{rank}</Text>
      </View>
    );
  return (
    <View style={{ width: size, height: size + 6, alignItems: 'center', justifyContent: 'flex-end' }}>
      <Icon3D name="crown" size={Math.round(size * 0.55)} style={{ position: 'absolute', top: -2, zIndex: 1 }} />
      <LinearGradient colors={medal} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ width: size - 4, height: size - 4, borderRadius: size, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' }}>
        <Text style={[styles.rankMedal, { fontSize: Math.round(size * 0.46) }]}>{rank}</Text>
      </LinearGradient>
    </View>
  );
}

/** A round photo in a thin metal ring (gold for the first, silver, bronze, else plain gold-dim). */
export function RingFace({ uri, size, rank = 0, dim }: { uri?: string; size: number; rank?: number; dim?: boolean }) {
  const metal = rank >= 1 && rank <= 3 ? MEDALS[rank as 1 | 2 | 3] : (['#C9A24F', '#7A5A1E', '#C9A24F'] as const);
  return (
    <LinearGradient colors={metal} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, padding: Math.max(2, Math.round(size * 0.06)), opacity: dim ? 0.55 : 1 }}>
      <Photo uri={uri} kind="face" style={{ flex: 1, borderRadius: size / 2 }} />
    </LinearGradient>
  );
}

/** A glowing platform (an ellipse) under a winner. */
export function Podium({ width, tone }: { width: number; tone: 'pink' | 'blue' | 'gold' }) {
  const glow = tone === 'pink' ? PK.pinkGlow : tone === 'blue' ? PK.blueGlow : 'rgba(255,200,90,0.55)';
  const top = tone === 'pink' ? ['#FF7CC4', '#B0176F'] : tone === 'blue' ? ['#7CC8FF', '#1F55C8'] : ['#FFE59A', '#B47A1E'];
  return (
    <View style={{ width, height: width * 0.32, alignItems: 'center' }} pointerEvents="none">
      <LinearGradient colors={PK.gold} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: 'absolute', top: width * 0.06, width, height: width * 0.24, borderRadius: width }} />
      <LinearGradient colors={top as [string, string]} style={{ width: width * 0.94, height: width * 0.2, borderRadius: width, boxShadow: `0 0 ${Math.round(width * 0.25)}px ${glow}` }} />
    </View>
  );
}

/** The main button: a pink pill with a gold rim, a crown and arrows. */
export function GlowButton({ title, onPress, disabled, label, crown = true }: { title: string; onPress: () => void; disabled?: boolean; label?: string; crown?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label ?? title} style={({ pressed }) => [{ opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }]}>
      <GoldRim radius={26} width={2}>
        <LinearGradient colors={['#E0288F', '#9E0F68', '#6A0A4A']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.button}>
          <Text style={styles.chev}>›››</Text>
          <View style={styles.buttonMid}>
            {crown && <Icon3D name="crown" size={20} />}
            <Text style={styles.buttonText} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <Text style={styles.chev}>›››</Text>
        </LinearGradient>
      </GoldRim>
    </Pressable>
  );
}

/** A round close button with a gold rim. */
export function CloseBtn({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={label}>
      <GoldRim radius={18} width={1.5}>
        <View style={styles.close}>
          <Ionicons name="close" size={20} color="#fff" />
        </View>
      </GoldRim>
    </Pressable>
  );
}

/** A small timer pill: a stopwatch and the time. */
export function TimerPill({ text }: { text: string }) {
  return (
    <GoldRim radius={14} width={1.5}>
      <View style={styles.timer}>
        <Ionicons name="stopwatch-outline" size={14} color={PK.goldText} />
        <Text style={styles.timerText} numberOfLines={1}>
          {text}
        </Text>
      </View>
    </GoldRim>
  );
}

/** A section title between two thin gold lines with laurel-like stars. */
export function SectionTitle({ text, art }: { text: string; art?: ArtName }) {
  return (
    <View style={styles.section}>
      <LinearGradient colors={['transparent', PK.goldEdge]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sectionLine} />
      {art ? <Art name={art} size={22} /> : null}
      <Text style={styles.sectionText} numberOfLines={1}>
        {text}
      </Text>
      <LinearGradient colors={[PK.goldEdge, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sectionLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  topLight: { position: 'absolute', left: 0, right: 0, top: 0, height: 220 },
  ribbonWrap: { alignSelf: 'center', flexShrink: 0 },
  ribbon: { paddingHorizontal: 18, paddingVertical: 3, alignItems: 'center' },
  ribbonTitle: { color: PK.goldText, fontWeight: '800', textAlign: 'center', ...shadow('rgba(0,0,0,0.6)', 4) },
  ribbonSub: { color: '#FFE9F6', fontSize: 12, fontWeight: '700', marginTop: -1 },
  faceGlow: { position: 'absolute' },
  plate: { paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' },
  plateText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  giftScore: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  giftScoreText: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  shareTrack: { flexDirection: 'row', overflow: 'hidden', borderRadius: 999 },
  shareCut: { width: 3, backgroundColor: '#fff', transform: [{ skewX: '-20deg' }], marginHorizontal: -1, zIndex: 1 },
  shareText: { color: '#fff', fontSize: 12, fontWeight: '800', ...shadow('rgba(0,0,0,0.5)', 3) },
  rankPlain: { color: PK.dim, fontWeight: '800', fontSize: 14, fontVariant: ['tabular-nums'] },
  rankMedal: { color: '#3B1A00', fontWeight: '800' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 14, gap: 6 },
  buttonMid: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  buttonText: { color: PK.goldText, fontSize: 18, fontWeight: '800', ...shadow('rgba(0,0,0,0.6)', 4) },
  chev: { color: 'rgba(255,190,230,0.75)', fontSize: 16, fontWeight: '800', letterSpacing: -2 },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#3D0F3E' },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: '#1A0A26' },
  timerText: { color: '#fff', fontWeight: '800', fontSize: 13, fontVariant: ['tabular-nums'] },
  section: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionLine: { flex: 1, height: 1.5 },
  sectionText: { color: PK.goldText, fontWeight: '800', fontSize: 15, ...shadow('rgba(0,0,0,0.6)', 4) },
});
