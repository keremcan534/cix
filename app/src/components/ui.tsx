import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { vipTier } from '@/data/economy';
import { colors, gradient } from '@/theme';

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
            backgroundColor: colors.green,
            borderWidth: 2,
            borderColor: colors.bg,
          }}
        />
      )}
    </View>
  );
}

export function VerifiedBadge({ size = 14 }: { size?: number }) {
  return <Ionicons name="checkmark-circle" size={size} color="#38BDF8" />;
}

export function VipBadge() {
  return (
    <LinearGradient colors={['#F59E0B', '#FBBF24']} style={styles.vip}>
      <Text style={styles.vipText}>VIP</Text>
    </LinearGradient>
  );
}

export function GradientButton({
  title,
  onPress,
  icon,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }, style]}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.btn, small && { paddingVertical: 7, paddingHorizontal: 14 }]}
      >
        {icon && <Ionicons name={icon} size={small ? 14 : 18} color="#fff" />}
        <Text style={[styles.btnText, small && { fontSize: 13 }]}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>{children}</View>;
}

export function CoinPill({ coins, onPress }: { coins: number; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.coin}>
      <Text style={{ fontSize: 14 }}>🪙</Text>
      <Text style={styles.coinText}>{coins.toLocaleString('tr-TR')}</Text>
      {onPress && <Ionicons name="add-circle" size={16} color={colors.gold} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  vip: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  vipText: { color: '#3B2300', fontSize: 10, fontWeight: '800' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
});

export function Header({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 32 }} accessibilityLabel="Geri">
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
export function FramedAvatar({ uri, size = 44, vipLevel = 0, online }: { uri: string; size?: number; vipLevel?: number; online?: boolean }) {
  const tier = vipTier(vipLevel);
  if (!tier) return <Avatar uri={uri} size={size} online={online} />;
  return (
    <View style={{ width: size, height: size }}>
      <LinearGradient colors={tier.color} style={{ width: size, height: size, borderRadius: size / 2, padding: 3 }}>
        <Image source={{ uri }} style={{ flex: 1, borderRadius: size / 2, borderWidth: 2, borderColor: colors.bg }} />
      </LinearGradient>
      <Text style={{ position: 'absolute', top: -size * 0.12, right: -size * 0.05, fontSize: size * 0.3 }}>{tier.emoji}</Text>
    </View>
  );
}

export function VipTitle({ level }: { level: number }) {
  const tier = vipTier(level);
  if (!tier) return null;
  return (
    <LinearGradient colors={tier.color} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.vip}>
      <Text style={[styles.vipText, { color: '#fff' }]}>
        {tier.emoji} {tier.name}
      </Text>
    </LinearGradient>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: colors.card, borderRadius: 18, padding: 16 }, style]}>{children}</View>;
}

export function DiamondPill({ diamonds }: { diamonds: number }) {
  return (
    <View style={[styles.coin, { backgroundColor: 'rgba(56,189,248,0.15)' }]}>
      <Text style={{ fontSize: 13 }}>💎</Text>
      <Text style={[styles.coinText, { color: '#7DD3FC' }]}>{diamonds.toLocaleString('tr-TR')}</Text>
    </View>
  );
}
