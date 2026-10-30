import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { cosmeticById } from '@/data/catalog';
import { vipTier } from '@/data/economy';
import { charmTier } from '@/data/charm';
import { wealthTier, type LevelTier } from '@/data/wealth';
import { AnimatedFrame, FRAME_LOOKS, type FrameFx } from '@/components/fx/frames';
import { goBack } from '@/lib/nav';
import { pressHaptic, tapHaptic } from '@/lib/haptics';
import { ArtFrame, frameArtOf } from '@/components/fx/frame-art';
import { useApp } from '@/store';
import { colors, fonts, gradient, semantic } from '@/theme';
import { Icon3D } from '@/components/Icon3D';
import { Art } from '@/components/Art';

export function Avatar({ uri, size = 44, online, ring }: { uri: string; size?: number; online?: boolean; ring?: boolean }) {
  return (
    <View style={{ width: size, height: size }}>
      {ring ? (
        <LinearGradient colors={gradient} style={{ width: size, height: size, borderRadius: size / 2, padding: 2 }}>
          <Image source={{ uri }} style={{ flex: 1, borderRadius: size / 2, borderWidth: 2, borderColor: colors.bg }} />
        </LinearGradient>
      ) : (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.cardAlt }} />
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
  const c = tone === 'money' ? semantic.money : tone === 'social' ? semantic.social : semantic.action;
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: `${c}1A`, borderWidth: 1, borderColor: `${c}4D` }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name={name} size={Math.round(size * 0.44)} color={c} />
    </View>
  );
}

export function VerifiedBadge({ size = 14 }: { size?: number }) {
  return <Ionicons name="checkmark-circle" size={size} color="#38BDF8" />;
}

export function VipBadge() {
  return (
    <LinearGradient colors={semantic.status} style={styles.vip}>
      <Text style={[styles.vipText, { color: semantic.statusInk }]}>VIP</Text>
    </LinearGradient>
  );
}

export type ButtonVariant = 'hero' | 'money' | 'tonal' | 'ghost' | 'danger';

/**
 * One button, five jobs. Only `hero` (one per screen) and `money` (coins/gifts) get the raised,
 * press-down "key" look, so the eye finds them first; the rest stay flat.
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
  const raised = variant === 'hero' || variant === 'money';
  // A thin key edge: enough to feel pressable, not a toy.
  const edge = 2;
  const fg = variant === 'money' ? semantic.moneyInk : variant === 'tonal' ? semantic.tonalText : variant === 'ghost' ? colors.primaryText : variant === 'danger' ? semantic.danger : semantic.actionInk;
  const body = [styles.btn, small && styles.btnSmall, !raised && { backgroundColor: variant === 'tonal' ? semantic.tonal : 'transparent' }, variant === 'danger' && styles.btnDanger];
  const label = (
    <>
      {icon && <Ionicons name={icon} size={small ? 15 : 19} color={fg} />}
      <Text style={[styles.btnText, small && { fontSize: 13 }, { color: fg }]}>{title}</Text>
    </>
  );
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
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [{ opacity: disabled ? 0.5 : 1 }, !raised && pressed && { transform: [{ scale: 0.96 }] }, style]}
    >
      {({ pressed }) =>
        raised ? (
          // The darker edge below the face is the "key"; pressing moves the face down onto it.
          <View style={{ borderRadius: 999, backgroundColor: variant === 'money' ? semantic.moneyEdge : semantic.actionEdge, paddingBottom: pressed ? 0 : edge, marginTop: pressed ? edge : 0 }}>
            {variant === 'money' ? (
              <View style={[...body, { backgroundColor: semantic.money }]}>{label}</View>
            ) : (
              <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={body}>
                {label}
              </LinearGradient>
            )}
          </View>
        ) : (
          <View style={body}>{label}</View>
        )
      }
    </Pressable>
  );
}

/** The screen's primary action. Kept for existing call sites; same as `<Button variant="hero" />`. */
export function GradientButton(props: { title: string; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap; style?: StyleProp<ViewStyle>; small?: boolean }) {
  return <Button {...props} variant="hero" />;
}

export function Screen({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>{children}</View>;
}

export function CoinPill({ coins, onPress }: { coins: number; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.coin}>
      <Icon3D name="coin" size={18} />
      <Text style={styles.coinText}>{coins.toLocaleString('tr-TR')}</Text>
      {onPress && <Ionicons name="add-circle" size={16} color={colors.gold} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  vip: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  vipText: { color: '#3B2300', fontSize: 11, fontWeight: '800' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: 999,
  },
  btnSmall: { paddingVertical: 7, paddingHorizontal: 14 },
  btnDanger: { borderWidth: 1.5, borderColor: semantic.danger },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.1 },
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
  wealthNum: { fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  levelChip: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  levelChipText: { fontSize: 12, fontWeight: '800' },
  headerTitle: { color: '#fff', fontSize: 18, fontFamily: fonts.displayBold, letterSpacing: -0.2, flex: 1, textAlign: 'center' },
});

export function Header({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={() => goBack()} hitSlop={10} style={{ width: 32 }} accessibilityLabel="Geri">
        <Ionicons name="chevron-back" size={26} color="#fff" />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ minWidth: 32, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

/** Avatar with the nobility (VIP) frame color, if any. */
export function FramedAvatar({ uri, size = 44, vipLevel = 0, frameId, online, artScale }: { uri: string; size?: number; vipLevel?: number; frameId?: string; online?: boolean; /** How far illustrated frames may spread (see ArtFrame). */ artScale?: number }) {
  const { settings } = useApp();
  const tier = vipTier(vipLevel);
  const frame = cosmeticById(frameId);
  const art = frameArtOf(frame?.id);
  if (art) {
    return (
      <ArtFrame art={art} size={size} still={settings.reduceMotion} maxScale={artScale}>
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
      </ArtFrame>
    );
  }
  if (frame?.fx && frame.fx in FRAME_LOOKS) {
    return (
      <View style={{ width: size, height: size }}>
        <AnimatedFrame fx={frame.fx as FrameFx} size={size} still={settings.reduceMotion}>
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
        </AnimatedFrame>
        {tier && <Art name={tier.art} size={size * 0.38} style={{ position: 'absolute', top: -size * 0.14, right: -size * 0.07 }} />}
      </View>
    );
  }
  // A purchased frame overrides the VIP frame color; the VIP badge emoji stays.
  const frameColors = frame?.color ?? tier?.color;
  if (!frameColors) return <Avatar uri={uri} size={size} online={online} />;
  return (
    <View style={{ width: size, height: size }}>
      <LinearGradient colors={frameColors} style={{ width: size, height: size, borderRadius: size / 2, padding: 3 }}>
        <Image source={{ uri }} style={{ flex: 1, borderRadius: size / 2, borderWidth: 2, borderColor: colors.bg }} />
      </LinearGradient>
      {tier ? (
        <Art name={tier.art} size={size * 0.38} style={{ position: 'absolute', top: -size * 0.14, right: -size * 0.07 }} />
      ) : (
        frame && <Text style={{ position: 'absolute', top: -size * 0.12, right: -size * 0.05, fontSize: size * 0.3 }}>{frame.emoji}</Text>
      )}
    </View>
  );
}

/** Servet Seviyesi badge: the level group's colors and symbol plus the level number. */
export function WealthBadge({ level, size = 'sm' }: { level: number; size?: 'sm' | 'lg' }) {
  return <TierBadge tier={wealthTier(level)} level={level} size={size} label={`Servet seviyesi ${level}`} />;
}
/** Cazibe Seviyesi badge (same shape, its own colors and symbols). */
export function CharmBadge({ level, size = 'sm' }: { level: number; size?: 'sm' | 'lg' }) {
  return <TierBadge tier={charmTier(level)} level={level} size={size} label={`Cazibe seviyesi ${level}`} />;
}
function TierBadge({ tier: t, level, size, label }: { tier: LevelTier; level: number; size: 'sm' | 'lg'; label: string }) {
  const lg = size === 'lg';
  return (
    <LinearGradient
      colors={t.colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.wealthBadge, lg && { height: 30, paddingLeft: 4, paddingRight: 12, borderRadius: 15 }]}
      accessibilityLabel={`${label}, ${t.name}`}
    >
      <View style={[styles.wealthDot, lg && { width: 22, height: 22, borderRadius: 11 }]}>
        <Ionicons name={t.icon} size={lg ? 13 : 10} color={t.colors[1]} />
      </View>
      <Text style={[styles.wealthNum, { color: t.ink }, lg && { fontSize: 15 }]}>{level}</Text>
    </LinearGradient>
  );
}

/** Wealth / charm level chips (separate from VIP). */
export function LevelChips({ wealth, charm, hideWealth, hideCharm }: { wealth: number; charm: number; hideWealth?: boolean; hideCharm?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {!hideWealth && <WealthBadge level={wealth} />}
      {!hideCharm && <CharmBadge level={charm} />}
    </View>
  );
}

export function VipTitle({ level }: { level: number }) {
  const tier = vipTier(level);
  if (!tier) return null;
  return (
    <LinearGradient colors={tier.color} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.vip, { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 2 }]}>
      <Art name={tier.art} size={15} />
      <Text style={[styles.vipText, { color: '#fff' }]}>VIP {tier.level}</Text>
    </LinearGradient>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: colors.card, borderRadius: 18, padding: 16 }, style]}>{children}</View>;
}

export function DiamondPill({ diamonds }: { diamonds: number }) {
  return (
    <View style={[styles.coin, { backgroundColor: 'rgba(56,189,248,0.15)' }]}>
      <Icon3D name="diamond" size={17} />
      <Text style={[styles.coinText, { color: '#7DD3FC' }]}>{diamonds.toLocaleString('tr-TR')}</Text>
    </View>
  );
}
