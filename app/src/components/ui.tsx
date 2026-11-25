import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useState, type ReactNode } from 'react';
import { Image, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { LuxeFace, luxeMinWidth, type LuxeFaceName } from '@/components/luxe-face';
import { Text } from '@/components/text';
import { cosmeticById } from '@/data/catalog';
import { vipTier } from '@/data/economy';
import { charmTier } from '@/data/charm';
import { wealthTier, type LevelTier } from '@/data/wealth';
import { tierFor, tiersOf } from '@/lib/levels-live-core';
import { useLevels } from '@/lib/live/levels-live';
import { AnimatedFrame, FRAME_LOOKS, type FrameFx } from '@/components/fx/frames';
import { goBack } from '@/lib/nav';
import { pressHaptic, tapHaptic } from '@/lib/haptics';
import { ArtFrame, frameArtOf } from '@/components/fx/frame-art';
import type { SeatRoom } from '@/lib/seat-cell';
import { useSettings } from '@/store';
import { fonts, makeStyles, useTheme } from '@/theme';
import { Icon3D } from '@/components/Icon3D';
import { Art } from '@/components/Art';
import { FadeImage, useImageRetry } from '@/components/photo';
import { RollingNumber } from '@/components/fx/rolling-number';
import { MarkLayer } from '@/components/profile-mark';
import { VIP_LEVEL_ART } from '@/components/vip/level-art';
import { WealthPlate } from '@/components/wealth-art';
import { LEVEL_ART_TOP, levelArtFor } from '@/lib/vip-screen';

export function Avatar({ uri, size = 44, online, ring, name }: { uri?: string; size?: number; online?: boolean; ring?: boolean; name?: string }) {
  const { colors, semantic, gradient } = useTheme();
  // A photo that can't be loaded counts as none (no blank disc) while it waits to be tried again (components/photo
  // useImageRetry), and for good after the last try; a new address starts over.
  const img = useImageRetry(uri);
  // No photo (sample people carry none): a tinted disc with the name's initial, or a person glyph.
  const face = (style: object) =>
    uri && img.show ? (
      <FadeImage key={img.key} source={{ uri }} style={style} onError={img.onError} />
    ) : (
      <View style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt }]}>
        {name?.trim() ? (
          <Text style={{ color: semantic.actionText, fontSize: Math.round(size * 0.42), fontWeight: '800' }}>{name.trim().charAt(0).toLocaleUpperCase('tr-TR')}</Text>
        ) : (
          <Ionicons name="person" size={Math.round(size * 0.5)} color={semantic.actionText} />
        )}
      </View>
    );
  return (
    <View style={{ width: size, height: size }}>
      {ring ? (
        <LinearGradient colors={gradient} style={{ width: size, height: size, borderRadius: size / 2, padding: 2 }}>
          {face({ flex: 1, borderRadius: size / 2, borderWidth: 2, borderColor: colors.bg })}
        </LinearGradient>
      ) : (
        face({ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.cardAlt })
      )}
      {online && (
        <View
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: size * 0.28,
            height: size * 0.28,
            borderRadius: size,
            backgroundColor: semantic.live,
            borderWidth: 2,
            borderColor: colors.bg,
          }}
        />
      )}
    </View>
  );
}

/** Icon for empty, locked and permission states: a line icon in a soft tinted disc, never a big emoji. */
export function StateIcon({ name, size = 64, tone = 'action' }: { name: keyof typeof Ionicons.glyphMap; size?: number; tone?: 'action' | 'money' | 'social' }) {
  const { semantic } = useTheme();
  // The disc is tinted with the fill color; the glyph uses the text color so it reads on light screens too.
  const c = tone === 'money' ? semantic.money : tone === 'social' ? semantic.social : semantic.action;
  const ink = tone === 'money' ? semantic.moneyText : tone === 'social' ? semantic.socialText : semantic.actionText;
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: `${c}1A`, borderWidth: 1, borderColor: `${c}4D` }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name={name} size={Math.round(size * 0.44)} color={ink} />
    </View>
  );
}

export function VerifiedBadge({ size = 14 }: { size?: number }) {
  return <Ionicons name="checkmark-circle" size={size} color="#38BDF8" />;
}

export function VipBadge() {
  const { semantic } = useTheme();
  const styles = useStyles();
  return (
    <LinearGradient colors={semantic.status} style={styles.vip}>
      <Text style={[styles.vipText, { color: semantic.statusInk }]}>VIP</Text>
    </LinearGradient>
  );
}

export type ButtonVariant = 'hero' | 'money' | 'tonal' | 'ghost' | 'danger';

const BUTTON_HEIGHT = 48;
const BUTTON_SMALL = 34;

/**
 * One button, five jobs, each on its gold-rimmed face (components/luxe-face). `ghost` is words alone, and a button
 * that can't be pressed wears the pale face.
 */
export function Button({
  title,
  onPress,
  icon,
  style,
  small,
  variant = 'hero',
  disabled,
}: {
  title: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  variant?: ButtonVariant;
  disabled?: boolean;
}) {
  const { colors, semantic, dark } = useTheme();
  const styles = useStyles();
  const raised = variant === 'hero' || variant === 'money';
  const face: LuxeFaceName | null = variant === 'ghost' ? null : disabled ? 'off' : variant === 'money' ? 'money' : variant === 'danger' ? 'coral' : variant === 'tonal' ? (dark ? 'plum' : 'glass') : 'hero';
  const down: LuxeFaceName | undefined = face === 'hero' ? 'heroDown' : face === 'money' ? 'moneyDown' : undefined;
  const faceHeight = small ? BUTTON_SMALL : BUTTON_HEIGHT;
  // Each ink is the one that reads on its face.
  const fg = face === 'off' ? '#6B4C5A' : variant === 'money' ? semantic.moneyInk : variant === 'tonal' ? semantic.tonalText : variant === 'ghost' ? colors.primaryText : variant === 'danger' ? semantic.actionInk : '#fff';
  return (
    <Pressable
      onPress={
        onPress &&
        (() => {
          if (raised) pressHaptic();
          else tapHaptic();
          onPress();
        })
      }
      disabled={disabled}
      // Up and down only: a small button is wide enough, and its neighbour in a row may be close (approve, reject).
      hitSlop={small ? { top: 5, bottom: 5 } : undefined}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [{ opacity: disabled && !face ? 0.5 : 1 }, pressed && { transform: [{ scale: 0.97 }] }, style]}
    >
      {({ pressed }) => (
        <View style={[styles.btn, small && styles.btnSmall, !!face && { minWidth: luxeMinWidth(faceHeight) }]}>
          {face && <LuxeFace name={face} h={faceHeight} down={down} pressed={pressed} />}
          {icon && <Ionicons name={icon} size={small ? 15 : 19} color={fg} />}
          <Text style={[styles.btnText, small && { fontSize: 13 }, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** The screen's primary action. Kept for existing call sites; same as `<Button variant="hero" />`. */
export function GradientButton(props: { title: string; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap; style?: StyleProp<ViewStyle>; small?: boolean }) {
  return <Button {...props} variant="hero" />;
}

export function Screen({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>{children}</View>;
}

export function CoinPill({ coins, onPress }: { coins: number; onPress?: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} hitSlop={onPress ? 8 : undefined} style={styles.coin}>
      <Icon3D name="coin" size={18} />
      <RollingNumber value={coins} style={styles.coinText} />
      {onPress && <Ionicons name="add-circle" size={16} color={colors.gold} />}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  vip: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  vipText: { color: '#3B2300', fontSize: 11, fontWeight: '800' },
  btn: {
    // Beside a taller neighbour (a label on two lines) the face fills the row's height too.
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: BUTTON_HEIGHT,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  btnSmall: { minHeight: BUTTON_SMALL, paddingVertical: 5, paddingHorizontal: 14 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.1, flexShrink: 1, textAlign: 'center' },
  coin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(251,191,36,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  coinText: { color: colors.gold, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, minHeight: 52 },
  wealthBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 20, paddingLeft: 2, paddingRight: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  wealthDot: { width: 15, height: 15, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  // No font padding (Android): it sat the level low in the round chip, beside the centred dot.
  wealthNum: { fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'], includeFontPadding: false, textAlignVertical: 'center' },
  levelChip: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  levelChipText: { fontSize: 12, fontWeight: '800' },
  textLink: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  textLinkCenter: { alignSelf: 'center' },
  headerTitle: { color: colors.text, fontSize: 18, fontFamily: fonts.displayBold, letterSpacing: -0.2, flexShrink: 1, maxWidth: '60%', textAlign: 'center', marginHorizontal: 6 },
  headerRight: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  headerSide: { flex: 1, flexBasis: 0, minWidth: 40, flexDirection: 'row', alignItems: 'center' },
  headerBack: { width: 40, height: 40, justifyContent: 'center' },
}));

/** Secondary action inside a card: colored text with a chevron instead of a typed arrow. */
export function TextLink({ title, onPress, color: own, center }: {
  title: string; onPress: () => void; color?: string;
  /** In a centred column or row; otherwise the link keeps to the start edge, as inside a card. */
  center?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const color = own ?? colors.primaryText;
  return (
    <Pressable onPress={onPress} hitSlop={{ top: 13, bottom: 13, left: 6, right: 6 }} accessibilityRole="link" style={[styles.textLink, center && styles.textLinkCenter]}>
      <Text style={{ color, fontWeight: '700' }}>{title}</Text>
      <Ionicons name="chevron-forward" size={14} color={color} />
    </Pressable>
  );
}

export function Header({ title, right, onBack }: { title: string; right?: ReactNode; onBack?: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  // The right side is at least as wide as what sits on it (a coin pill, a text action); the left only keeps the back
  // button. The title stays on the screen's centre line while there is room and moves left, whole, when the right is wide.
  const [rightW, setRightW] = useState(0);
  const side = rightW > 40 ? { minWidth: rightW } : null;
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>
        <Pressable onPress={() => (onBack ? onBack() : goBack())} hitSlop={8} style={styles.headerBack} accessibilityRole="button" accessibilityLabel="Geri">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
      </View>
      <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.headerSide, { justifyContent: 'flex-end' }, side]}>
        {right != null && (
          <View style={styles.headerRight} onLayout={(e) => setRightW(Math.ceil(e.nativeEvent.layout.width))}>
            {right}
          </View>
        )}
      </View>
    </View>
  );
}

/** The photo, or the person glyph Avatar shows when there is none (new users have no photo yet). */
function FaceImage({ uri, size, style }: { uri?: string; size: number; style: object }) {
  const { colors, semantic } = useTheme();
  // A photo that can't be loaded counts as none while it waits to be tried again, as in Avatar.
  const img = useImageRetry(uri);
  if (uri && img.show) return <FadeImage key={img.key} source={{ uri }} style={style} onError={img.onError} />;
  return (
    <View style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt }]}>
      <Ionicons name="person" size={Math.round(size * 0.5)} color={semantic.actionText} />
    </View>
  );
}

/** Avatar with the nobility (VIP) frame color, if any. */
// Memoized: props are plain values and settings come from their own context, so rows re-render only when they change.
export const FramedAvatar = memo(FramedAvatarBase);
// `room`: a room seat's cell around the avatar (lib/seat-cell): the frame keeps inside it, off the name and the next seats.
// `markUid`: whose Profil izleri to draw on the photo (components/profile-mark), under the frame's ring.
function FramedAvatarBase({ uri, size = 44, vipLevel = 0, frameId, online, artScale, room, markUid }: { uri: string; size?: number; vipLevel?: number; frameId?: string; online?: boolean; /** How far illustrated frames may spread (see ArtFrame). */ artScale?: number; room?: SeatRoom; markUid?: string }) {
  const settings = useSettings();
  const { colors } = useTheme();
  const tier = vipTier(vipLevel);
  const frame = cosmeticById(frameId);
  const art = frameArtOf(frame?.id);
  const mark = markUid ? <MarkLayer uid={markUid} size={size} /> : null;
  if (art) {
    return (
      <ArtFrame art={art} size={size} still={settings.reduceMotion} maxScale={artScale} room={room}>
        <FaceImage uri={uri} size={size} style={{ width: '100%', height: '100%' }} />
        {mark}
      </ArtFrame>
    );
  }
  if (frame?.fx && frame.fx in FRAME_LOOKS) {
    return (
      <View style={{ width: size, height: size }}>
        <AnimatedFrame fx={frame.fx as FrameFx} size={size} still={settings.reduceMotion} headroom={room?.top}>
          <FaceImage uri={uri} size={size} style={{ width: '100%', height: '100%' }} />
          {mark}
        </AnimatedFrame>
        {tier && <Art name={tier.art} size={size * 0.38} style={{ position: 'absolute', top: -size * 0.14, right: -size * 0.07 }} />}
      </View>
    );
  }
  // A purchased frame overrides the VIP frame color; the VIP badge emoji stays.
  const frameColors = frame?.color ?? tier?.color;
  if (!frameColors)
    return mark ? (
      <View style={{ width: size, height: size }}>
        <Avatar uri={uri} size={size} online={online} />
        {mark}
      </View>
    ) : (
      <Avatar uri={uri} size={size} online={online} />
    );
  return (
    <View style={{ width: size, height: size }}>
      <LinearGradient colors={frameColors} style={{ width: size, height: size, borderRadius: size / 2, padding: 3 }}>
        <FaceImage uri={uri} size={size} style={{ flex: 1, borderRadius: size / 2, borderWidth: 2, borderColor: colors.bg }} />
        {mark && <View style={{ position: 'absolute', left: 5, top: 5, right: 5, bottom: 5 }}>{mark}</View>}
      </LinearGradient>
      {tier ? (
        <Art name={tier.art} size={size * 0.38} style={{ position: 'absolute', top: -size * 0.14, right: -size * 0.07 }} />
      ) : (
        frame && <Text style={{ position: 'absolute', top: -size * 0.12, right: -size * 0.05, fontSize: size * 0.3 }}>{frame.emoji}</Text>
      )}
    </View>
  );
}

/** A level chip's size: 'sm' in lists and chats, 'md' under the Profil tab's big name, 'lg' on its own. */
/** xs: a list card's row beside the name (the owners, 25 Nov 2026: small, not over the design). */
export type ChipSize = 'xs' | 'sm' | 'md' | 'lg';
/** Per size: the chip's height and side padding, the picture's dot and the number's size. */
const CHIP: Record<ChipSize, { height: number; left: number; right: number; dot: number; glyph: number; text: number }> = {
  xs: { height: 15, left: 2, right: 6, dot: 11, glyph: 8, text: 10 },
  sm: { height: 20, left: 2, right: 8, dot: 15, glyph: 10, text: 12 },
  md: { height: 25, left: 2, right: 9, dot: 19, glyph: 12, text: 14 },
  lg: { height: 30, left: 4, right: 12, dot: 22, glyph: 13, text: 15 },
};

/** Cömertlik Seviyesi badge: the level group's colors and symbol plus the level number (groups as Seviye ve VIP ayarları name them). */
export function WealthBadge({ level, size = 'sm' }: { level: number; size?: ChipSize }) {
  const levels = useLevels();
  return <TierBadge tier={levels?.wealth ? tierFor(tiersOf(levels, 'wealth'), level) : wealthTier(level)} level={level} size={size} label={`Cömertlik seviyesi ${level}`} />;
}
/** Yankı Seviyesi badge (same shape, its own colors and symbols). */
export function CharmBadge({ level, size = 'sm' }: { level: number; size?: ChipSize }) {
  const levels = useLevels();
  return <TierBadge tier={levels?.charm ? tierFor(tiersOf(levels, 'charm'), level) : charmTier(level)} level={level} size={size} label={`Yankı seviyesi ${level}`} />;
}
function TierBadge({ tier: t, level, size, label }: { tier: LevelTier; level: number; size: ChipSize; label: string }) {
  const styles = useStyles();
  const c = CHIP[size];
  // Cömertlik: the group's designed plate with the level written in it (components/wealth-art).
  if (t.look) return <WealthPlate look={t.look} level={level} height={c.height} label={`${label}, ${t.name}`} />;
  return (
    <LinearGradient
      colors={t.colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.wealthBadge, { height: c.height, paddingLeft: c.left, paddingRight: c.right, borderRadius: c.height / 2 }]}
      accessibilityLabel={`${label}, ${t.name}`}
    >
      <View style={[styles.wealthDot, { width: c.dot, height: c.dot, borderRadius: c.dot / 2 }]}>
        {/* The group's picture fills the dot (the art keeps its own margin); the Ionicons glyph is the fallback. */}
        {t.art ? <Art name={t.art} size={c.dot} /> : <Ionicons name={t.icon} size={c.glyph} color={t.colors[1]} />}
      </View>
      <Text style={[styles.wealthNum, { color: t.ink, fontSize: c.text }]}>{level}</Text>
    </LinearGradient>
  );
}

/** Wealth / charm level chips (separate from VIP). */
export function LevelChips({ wealth, charm, hideWealth, hideCharm, size = 'sm' }: { wealth: number; charm: number; hideWealth?: boolean; hideCharm?: boolean; size?: ChipSize }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {!hideWealth && <WealthBadge level={wealth} size={size} />}
      {!hideCharm && <CharmBadge level={charm} size={size} />}
    </View>
  );
}

/** The level badge's size in the name rows (profile, person card): the shield's "VIP n" still reads. */
const VIP_BADGE_SIZE = 30;

export function VipTitle({ level }: { level: number }) {
  const styles = useStyles();
  const tier = vipTier(level);
  // VIP seti: the level's own badge (components/vip/level-art), its "VIP n" drawn in it; the chip for any other level.
  const set = level <= LEVEL_ART_TOP ? levelArtFor(level) : null;
  if (set) return <Image source={VIP_LEVEL_ART[set].badge.source} style={{ width: VIP_BADGE_SIZE, height: VIP_BADGE_SIZE }} resizeMode="contain" accessibilityLabel={`VIP ${set}`} />;
  if (!tier) return null;
  return (
    <LinearGradient colors={tier.color} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.vip, { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 2 }]}>
      <Art name={tier.art} size={15} />
      <Text style={[styles.vipText, { color: '#fff' }]}>VIP {tier.level}</Text>
    </LinearGradient>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, lift } = useTheme();
  return <View style={[{ backgroundColor: colors.card, borderRadius: 18, padding: 16 }, lift, style]}>{children}</View>;
}

export function DiamondPill({ diamonds }: { diamonds: number }) {
  const { semantic } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.coin, { backgroundColor: 'rgba(56,189,248,0.15)' }]}>
      <Icon3D name="diamond" size={17} />
      <RollingNumber value={diamonds} style={[styles.coinText, { color: semantic.diamondText }]} />
    </View>
  );
}
