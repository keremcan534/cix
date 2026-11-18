// Icons as objects, not stickers in boxes: a 3D icon stands free on a pool of its own colored light with a
// small contact shadow, and on cards it is bigger than the card and breaks out over its top edge. Each item
// gets its own hue, so a grid reads as a set of different things instead of one repeated tile.
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Image, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { EdgeLight, PressableScale } from '@/components/fx/surface';
import { LuxeFace, luxeMinWidth, type LuxeFaceName } from '@/components/luxe-face';
import { useSettings } from '@/store';
import { fonts, makeStyles, useTheme } from '@/theme';

const GLOW = require('../../../assets/fx/glow.png');

/** Item colors, picked by position when an item has no hue of its own. */
export const HUES = ['#FF8A5B', '#F6BD60', '#A78BFA', '#13D9DF', '#F472B6', '#4ADE80', '#60A5FA'] as const;
export const hueAt = (i: number) => HUES[i % HUES.length];

export type IconSource = { source?: number; emoji?: string };

/** A 3D icon (or emoji) floating on its own light. `bob` lets it hover gently (off with reduceMotion). */
// Memoized: plain-value props; settings come from their own context.
export const FloatIcon = memo(FloatIconBase);
function FloatIconBase({ source, emoji, size = 48, hue = HUES[3], bob = false, delay = 0 }: IconSource & { size?: number; hue?: string; bob?: boolean; delay?: number }) {
  const settings = useSettings();
  const s = useStyles();
  const still = !bob || settings.reduceMotion;
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (still) return;
    const ease = Easing.inOut(Easing.sin);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: 1700, easing: ease, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 1700, easing: ease, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [still, t, delay]);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.07] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Halo size={size} hue={hue} />
      <View style={[s.contact, { width: size * 0.5, height: Math.max(3, size * 0.06), bottom: size * 0.03 }]} />
      <Animated.View style={{ transform: [{ translateY }] }}>
        {source ? (
          <Image source={source} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
        ) : (
          <Text style={[s.emoji, { fontSize: size * 0.74, lineHeight: size }]}>{emoji}</Text>
        )}
      </Animated.View>
    </View>
  );
}

/** A pool of colored light centered behind a `size` box (place it first inside that box). */
export function Halo({ size, hue, strength = 0.5 }: { size: number; hue: string; strength?: number }) {
  const s = useStyles();
  const g = size * 2.1;
  return <Image source={GLOW} style={[s.glow, { width: g, height: g, left: (size - g) / 2, top: (size - g) / 2, tintColor: hue, opacity: strength }]} />;
}

/**
 * A card lit in the item's color with its icon breaking out over the top edge. `featured` is the wide hero
 * version (icon on the right, overflowing); otherwise the icon sits on the top-left corner.
 */
export function BreakoutCard({
  icon,
  hue,
  iconSize = 72,
  featured,
  dim,
  onPress,
  label,
  style,
  delay = 0,
  children,
}: {
  icon: IconSource;
  hue: string;
  iconSize?: number;
  featured?: boolean;
  dim?: boolean;
  onPress: () => void;
  label: string;
  style?: StyleProp<ViewStyle>;
  delay?: number;
  children: ReactNode;
}) {
  const { dark } = useTheme();
  const s = useStyles();
  const lift = iconSize * (featured ? 0.3 : 0.42);
  return (
    <PressableScale fill onPress={onPress} accessibilityLabel={label} accessibilityRole="button" style={[{ marginTop: lift }, dim && { opacity: 0.5 }, style]}>
      <LinearGradient
        colors={[`${hue}59`, `${hue}14`, dark ? '#101C30' : '#FFFFFF']}
        locations={[0, 0.45, 1]}
        start={{ x: featured ? 1 : 0, y: 0 }}
        end={{ x: featured ? 0.1 : 0.7, y: 1 }}
        style={[s.card, { borderColor: `${hue}40`, boxShadow: `${dark ? '0 10px 24px rgba(0,0,0,0.4)' : '0 1px 2px rgba(64,20,40,0.05), 0 8px 20px rgba(64,20,40,0.08)'}, 0 0 18px ${hue}22` }, featured ? { paddingRight: iconSize, minHeight: iconSize * 0.95 } : { paddingTop: iconSize - lift + 2 }]}
      >
        <EdgeLight inset={18} strength={0.4} />
        {children}
      </LinearGradient>
      <View style={[s.icon, featured ? { right: -2, top: -lift } : { left: 8, top: -lift }]}>
        <FloatIcon {...icon} size={iconSize} hue={hue} bob delay={delay} />
      </View>
    </PressableScale>
  );
}

/** The primary call to action on a card: glossy, lit, in the display face. */
export function GlossButton({ label, tone = 'money', small, icon }: { label: string; tone?: 'money' | 'action' | 'locked'; small?: boolean; /** Drawn before the label, e.g. a coin. */ icon?: ReactNode }) {
  const s = useStyles();
  const look = TONES[tone];
  return (
    <View style={[s.btn, small && s.btnSmall]}>
      <LuxeFace name={look.face} h={small ? GLOSS_SMALL : GLOSS_HEIGHT} />
      {icon}
      <Text style={[s.btnText, small && { fontSize: 14 }, { color: look.ink }]}>{label}</Text>
    </View>
  );
}
const GLOSS_HEIGHT = 36;
const GLOSS_SMALL = 30;
const TONES: Record<'money' | 'action' | 'locked', { face: LuxeFaceName; ink: string }> = {
  money: { face: 'money', ink: '#3B2300' },
  action: { face: 'hero', ink: '#fff' },
  locked: { face: 'off', ink: '#6B4C5A' },
};

const useStyles = makeStyles(({ dark }) => ({
  glow: { position: 'absolute', pointerEvents: 'none' },
  // The contact shadow is softer and navy on paper, where a black blot would look muddy.
  contact: { position: 'absolute', alignSelf: 'center', borderRadius: 999, backgroundColor: dark ? 'rgba(0,0,0,0.22)' : 'rgba(64,20,40,0.12)', boxShadow: dark ? '0 0 10px 5px rgba(0,0,0,0.28)' : '0 0 10px 5px rgba(64,20,40,0.10)' },
  emoji: { textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 6 },
  card: { flexGrow: 1, borderRadius: 22, borderWidth: 1, padding: 14, gap: 6 },
  icon: { position: 'absolute', pointerEvents: 'none' },
  btn: { flexDirection: 'row', gap: 4, minHeight: GLOSS_HEIGHT, minWidth: luxeMinWidth(GLOSS_HEIGHT), paddingHorizontal: 20, paddingVertical: 5, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  btnSmall: { minHeight: GLOSS_SMALL, minWidth: luxeMinWidth(GLOSS_SMALL), paddingHorizontal: 14, paddingVertical: 3 },
  btnText: { fontFamily: fonts.displayBold, fontSize: 15, lineHeight: 21 },
}));
