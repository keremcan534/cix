// Soft shapes in the place of what is still loading, with a light passing over them: the screen has its shape at
// once and the wait reads as "almost there" instead of a spinner. One light for every shape on screen, so they shine
// together. With "Animasyonları azalt" the shapes stay still.
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactElement } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, useWindowDimensions, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { DepthCard } from '@/components/fx/surface';
import { useSettings } from '@/store';
import { useTheme } from '@/theme';

const SWEEP_MS = 1300;
const LIGHT_W = 140;

/** The one light all shapes share; it runs while at least one shape is on screen. */
const sweep = new Animated.Value(0);
let users = 0;
let loop: Animated.CompositeAnimation | null = null;
function useSweep(on: boolean) {
  useEffect(() => {
    if (!on) return;
    users += 1;
    if (!loop) {
      sweep.setValue(0);
      loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: SWEEP_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }));
      loop.start();
    }
    return () => {
      users -= 1;
      if (users === 0 && loop) {
        loop.stop();
        loop = null;
      }
    };
  }, [on]);
}

/** One shape: a bar of text, a picture, a round face. */
export function Skeleton({ width = '100%', height, radius = 8, style }: { width?: DimensionValue; height: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { dark } = useTheme();
  const { reduceMotion } = useSettings();
  const { width: screen } = useWindowDimensions();
  useSweep(!reduceMotion);
  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-LIGHT_W, screen] });
  return (
    <View style={[{ width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: dark ? 'rgba(255,255,255,0.07)' : 'rgba(11,26,46,0.06)' }, style]}>
      {!reduceMotion && (
        <Animated.View style={[s.light, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={dark ? ['rgba(255,255,255,0)', 'rgba(255,255,255,0.09)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

/** A room card while the rooms load: the cover, the title, the line under it and the chips (Odalar). */
export function RoomCardSkeleton() {
  return (
    <DepthCard style={s.roomCard}>
      <Skeleton width={84} height={84} radius={12} />
      <View style={{ flex: 1, gap: 9, justifyContent: 'center' }}>
        <Skeleton width="72%" height={14} />
        <Skeleton width="92%" height={11} />
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Skeleton width={64} height={18} radius={9} />
          <Skeleton width={48} height={18} radius={9} />
        </View>
      </View>
    </DepthCard>
  );
}

/** A row with a face and two lines (people, chats, the wallet's history, rankings). */
export function RowSkeleton({ face = 44 }: { face?: number }) {
  return (
    <View style={s.row}>
      <Skeleton width={face} height={face} radius={face / 2} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="55%" height={13} />
        <Skeleton width="85%" height={11} />
      </View>
    </View>
  );
}

/** A post in Anlar: who shared it, a line, the picture. */
export function PostSkeleton() {
  return (
    <View style={s.post}>
      <RowSkeleton face={38} />
      <Skeleton height={220} radius={16} />
    </View>
  );
}

/** `count` copies of a skeleton, in a column with the screen's gaps. */
export function Skeletons({ count, children, gap = 12, style }: { count: number; children: ReactElement; gap?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap }, style]} accessibilityRole="progressbar" accessibilityLabel="Yükleniyor">
      {Array.from({ length: count }, (_, i) => (
        <View key={i}>{children}</View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  light: { position: 'absolute', top: 0, bottom: 0, left: 0, width: LIGHT_W },
  roomCard: { flexDirection: 'row', gap: 12, padding: 10, marginHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  post: { gap: 12, paddingHorizontal: 16 },
});
