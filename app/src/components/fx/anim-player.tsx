// Data-driven animation player: draws a catalog record's asset with its motion preset, starting from a
// point (a mic seat) or the screen. Transform/opacity only, native driver. Overlays never take touches,
// so names, mic controls and safety buttons stay usable underneath.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';

import { Icon3D } from '@/components/Icon3D';
import type { Animation, Asset } from '@/data/animations';
import { semantic } from '@/theme';

export type Pt = { x: number; y: number };
const NATIVE_FORMATS: Animation['format'][] = ['emoji', 'image', 'code'];

/** Formats without a bundled player fall back to the preview asset (same motion). */
export const playableAsset = (a: Animation): Asset => (NATIVE_FORMATS.includes(a.format) && a.animation_asset.kind !== 'file' ? (a.animation_asset as Asset) : a.preview_asset);

export function AssetView({ asset, size }: { asset: Asset; size: number }) {
  if (asset.kind === 'icon') return <Icon3D name={asset.value} size={size} />;
  if (asset.kind === 'url') return <Image source={{ uri: asset.value }} style={{ width: size, height: size }} resizeMode="contain" />;
  return <Text style={{ fontSize: size * 0.85, lineHeight: size }}>{asset.value}</Text>;
}

type P = { dx: number; dy: number; delay: number; rot: number; size: number };

export function AnimPlay({ anim, origin, screen, lite, onDone }: { anim: Animation; origin: Pt | null; screen: { width: number; height: number }; lite?: boolean; onDone: () => void }) {
  const full = anim.display_type === 'fullscreen';
  const motion = lite && full ? 'zoom' : anim.motion;
  const count = Math.max(1, lite ? Math.ceil(anim.count / 3) : anim.count);
  const base = anim.display_type === 'mic_effect' ? 18 : anim.display_type === 'reaction' ? 28 : full ? 46 : 40;
  const o = origin ?? { x: screen.width / 2, y: screen.height * 0.45 };
  const [t] = useState(() => new Animated.Value(0));
  // Per-particle randomness fixed once per play.
  const [ps] = useState<P[]>(() =>
    Array.from({ length: count }, (_, i) => ({
      dx: (Math.random() - 0.5) * (full ? screen.width : 90),
      dy: 80 + Math.random() * (full ? screen.height * 0.6 : 120),
      delay: (i / count) * 0.45,
      rot: (Math.random() - 0.5) * 60,
      size: base * (0.75 + Math.random() * 0.5),
    })),
  );
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const a = Animated.timing(t, { toValue: 1, duration: anim.duration_ms, easing: Easing.linear, useNativeDriver: true });
    a.start(() => done.current());
    return () => a.stop();
  }, [t, anim.duration_ms]);

  const asset = playableAsset(anim);
  // Local time of particle i (0..1 within its own window).
  const local = (p: P) => t.interpolate({ inputRange: [0, p.delay, Math.min(1, p.delay + 0.55), 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' });
  const at = (x: number, y: number, size: number) => ({ position: 'absolute' as const, left: x - size / 2, top: y - size / 2, width: size, height: size, alignItems: 'center' as const, justifyContent: 'center' as const });

  if (motion === 'ring' || motion === 'wave') {
    const rings = motion === 'ring' ? 2 : 3;
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {Array.from({ length: rings }, (_, i) => {
          const lt = t.interpolate({ inputRange: [0, i * 0.2, Math.min(1, i * 0.2 + 0.7), 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' });
          const size = 70;
          return (
            <Animated.View
              key={i}
              style={[
                at(o.x, o.y, size),
                {
                  borderRadius: size / 2,
                  borderWidth: motion === 'ring' ? 3 : 2,
                  borderColor: motion === 'ring' ? semantic.action : 'rgba(165,243,245,0.9)',
                  opacity: lt.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.9, 0] }),
                  transform: [{ scale: lt.interpolate({ inputRange: [0, 1], outputRange: [0.9, motion === 'ring' ? 1.45 : 1.8] }) }],
                },
              ]}
            />
          );
        })}
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {ps.map((p, i) => {
        const lt = local(p);
        const fade = lt.interpolate({ inputRange: [0, 0.12, 0.75, 1], outputRange: [0, 1, 1, 0] });
        let style;
        if (motion === 'rise') {
          const height = full ? screen.height * 0.9 : p.dy;
          style = {
            ...at(o.x, o.y, full ? base * 2 : p.size),
            opacity: fade,
            transform: [
              { translateX: lt.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, (full ? 0 : p.dx) * 0.6, full ? 0 : p.dx] }) },
              { translateY: lt.interpolate({ inputRange: [0, 1], outputRange: [0, -height] }) },
              { scale: lt.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.5, 1.1, 0.9] }) },
            ],
          };
        } else if (motion === 'burst') {
          const ang = (i / ps.length) * Math.PI * 2;
          const dist = full ? 140 + p.dy * 0.4 : 50 + p.dy * 0.3;
          style = {
            ...at(o.x, o.y, p.size),
            opacity: fade,
            transform: [
              { translateX: lt.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(ang) * dist] }) },
              { translateY: lt.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(ang) * dist - 30] }) },
              { scale: lt.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.3, 1.15, 0.8] }) },
            ],
          };
        } else if (motion === 'rain') {
          const x = screen.width / 2 + p.dx;
          style = {
            ...at(x, -40, p.size),
            opacity: fade,
            transform: [
              { translateY: lt.interpolate({ inputRange: [0, 1], outputRange: [0, screen.height + 80] }) },
              { rotate: lt.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.rot * 4}deg`] }) },
            ],
          };
        } else if (motion === 'fly') {
          const size = full ? 120 : 60;
          style = {
            ...at(-size, screen.height * 0.38, size),
            opacity: t.interpolate({ inputRange: [0, 0.08, 0.9, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, screen.width + size * 2] }) },
              { translateY: t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [10, -14, 8, -16, 0] }) },
            ],
          };
        } else if (motion === 'orbit') {
          const steps = 12;
          const r = 44;
          const phase = (i / ps.length) * Math.PI * 2;
          const pts = Array.from({ length: steps + 1 }, (_, k) => phase + (k / steps) * Math.PI * 2);
          style = {
            ...at(o.x, o.y, p.size),
            opacity: t.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: t.interpolate({ inputRange: pts.map((_, k) => k / steps), outputRange: pts.map((a) => Math.cos(a) * r) }) },
              { translateY: t.interpolate({ inputRange: pts.map((_, k) => k / steps), outputRange: pts.map((a) => Math.sin(a) * r) }) },
            ],
          };
        } else {
          // zoom: from the seat to the middle of the screen, grows, holds, fades.
          const size = full || anim.display_type === 'gift' ? 150 : 90;
          const cx = screen.width / 2;
          const cy = screen.height * 0.42;
          style = {
            ...at(o.x, o.y, size),
            opacity: t.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, cx - o.x, cx - o.x] }) },
              { translateY: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, cy - o.y, cy - o.y] }) },
              { scale: t.interpolate({ inputRange: [0, 0.3, 0.45, 0.8, 1], outputRange: [0.2, 1.1, 1, 1.05, 1.3] }) },
            ],
          };
          return (
            <Animated.View key={i} style={style}>
              <AssetView asset={asset} size={size} />
            </Animated.View>
          );
        }
        return (
          <Animated.View key={i} style={style}>
            <AssetView asset={asset} size={motion === 'rise' && full ? base * 2 : p.size} />
          </Animated.View>
        );
      })}
    </View>
  );
}
