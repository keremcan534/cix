// Code-drawn animated avatar frames. No image files: every frame is layered views animated on the
// native driver (transform + opacity only), so they stay smooth in lists and cost nothing to ship.
// Layers, back to front: glow halo → effect layer (ripples / embers) → spinning gradient ring →
// avatar → foreground ornaments (orbit lights, sparkles, crown).
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, View } from 'react-native';

import { Text } from '@/components/text';
import { colors } from '@/theme';

export type FrameFx = 'pulse' | 'orbit' | 'aurora' | 'flame' | 'crown';

type FrameLook = { ring: string[]; glow: string; spinMs: number; label: string };
export const FRAME_LOOKS: Record<FrameFx, FrameLook> = {
  // Sound: turquoise ripples, the app's signature.
  pulse: { ring: ['#13D9DF', '#076A70', '#13D9DF', '#A5F3F5'], glow: '#13D9DF', spinMs: 3600, label: 'Ses dalgası' },
  orbit: { ring: ['#38BDF8', '#13D9DF', '#E0F2FE', '#38BDF8'], glow: '#38BDF8', spinMs: 3000, label: 'Dönen ışıklar' },
  aurora: { ring: ['#13D9DF', '#38BDF8', '#FF6576', '#F6BD60', '#13D9DF'], glow: '#13D9DF', spinMs: 4200, label: 'Renk geçişi + kıvılcım' },
  flame: { ring: ['#F97316', '#EF4444', '#FDE047', '#F97316', '#B91C1C'], glow: '#F97316', spinMs: 2200, label: 'Alev + kor' },
  // Status (VIP) is gold in palette v2.
  crown: { ring: ['#FDE68A', '#E89B2C', '#FFF7E0', '#B7832E', '#FDE68A'], glow: '#F6BD60', spinMs: 5200, label: 'Altın + taç' },
};

/** A 0→1 linear loop on the native driver; frozen at `rest` when motion is reduced. */
function useLoop(ms: number, still?: boolean, rest = 0) {
  const [v] = useState(() => new Animated.Value(rest));
  useEffect(() => {
    if (still) {
      v.setValue(rest);
      return;
    }
    const a = Animated.loop(Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [v, ms, still, rest]);
  return v;
}
/** Same loop shifted by `phase` (0..1), so several particles share one clock. */
const ID = { inputRange: [0, 1], outputRange: [0, 1] };
const shifted = (v: Animated.Value, phase: number): Animated.AnimatedInterpolation<number> => Animated.modulo(Animated.add(v, phase), 1).interpolate(ID);

export function AnimatedFrame({ fx, size, still, children }: { fx: FrameFx; size: number; still?: boolean; children: ReactNode }) {
  const look = FRAME_LOOKS[fx];
  const ring = Math.max(3, Math.round(size * 0.075));
  const spin = useLoop(look.spinMs, still);
  const breathe = useLoop(2000, still, 0.5);
  const fast = useLoop(1400, still, 0.3);
  const inner = size - ring * 2;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const wave = (v: Animated.AnimatedInterpolation<number>) => v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] });
  const breatheI = breathe.interpolate(ID);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} pointerEvents="box-none">
      {/* Glow halo: two soft layers breathing out of phase */}
      {[0, 1].map((i) => (
        <Animated.View
          key={`g${i}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: look.glow,
            opacity: wave(i ? shifted(breathe, 0.5) : breatheI).interpolate({ inputRange: [0, 1], outputRange: [0.1, i ? 0.16 : 0.26] }),
            transform: [{ scale: wave(i ? shifted(breathe, 0.5) : breatheI).interpolate({ inputRange: [0, 1], outputRange: [1.04, i ? 1.3 : 1.16] }) }],
          }}
        />
      ))}

      {/* Ripples: sound waves leaving the avatar */}
      {fx === 'pulse' &&
        [0, 0.5].map((p) => {
          const r = shifted(fast, p);
          return (
            <Animated.View
              key={`r${p}`}
              pointerEvents="none"
              style={{
                position: 'absolute',
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: Math.max(1.5, ring * 0.45),
                borderColor: look.glow,
                opacity: r.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
                transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
              }}
            />
          );
        })}

      {/* Embers rising around the flame ring */}
      {fx === 'flame' &&
        [0, 0.2, 0.4, 0.6, 0.8].map((p, i) => {
          const e = shifted(fast, p);
          const x = [-0.42, 0.38, -0.15, 0.25, 0.05][i] * size;
          return (
            <Animated.View
              key={`e${p}`}
              pointerEvents="none"
              style={{
                position: 'absolute',
                bottom: size * 0.1,
                left: size / 2 + x,
                width: Math.max(3, size * 0.06),
                height: Math.max(3, size * 0.06),
                borderRadius: size,
                backgroundColor: i % 2 ? '#FDE047' : '#F97316',
                opacity: e.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
                transform: [
                  { translateY: e.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.85] }) },
                  { translateX: e.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, i % 2 ? 4 : -4, 0] }) },
                  { scale: e.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) },
                ],
              }}
            />
          );
        })}

      {/* Spinning gradient ring; the inner disc masks it to a ring */}
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ position: 'absolute', width: size * 1.5, height: size * 1.5, transform: [{ rotate }] }}>
          <LinearGradient colors={look.ring as unknown as readonly [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
        </Animated.View>
        <View style={{ width: inner, height: inner, borderRadius: inner / 2, overflow: 'hidden', backgroundColor: colors.bg }}>{children}</View>
      </View>

      {/* Orbiting lights */}
      {fx === 'orbit' &&
        [0, 0.33, 0.66].map((p, i) => (
          <Animated.View
            key={`o${p}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: size,
              height: size,
              transform: [{ rotate: shifted(spin, p).interpolate({ inputRange: [0, 1], outputRange: i === 2 ? ['360deg', '0deg'] : ['0deg', '360deg'] }) }],
            }}
          >
            <View
              style={{
                position: 'absolute',
                top: ring / 2 - size * 0.045,
                left: size / 2 - size * 0.045,
                width: size * 0.09,
                height: size * 0.09,
                borderRadius: size,
                backgroundColor: i === 2 ? '#13D9DF' : '#E0F2FE',
                shadowColor: '#38BDF8',
                shadowOpacity: 0.9,
                shadowRadius: 6,
              }}
            />
          </Animated.View>
        ))}

      {/* Twinkling sparkles at the diagonals */}
      {(fx === 'aurora' || fx === 'crown') &&
        [
          [0.86, 0.12],
          [0.08, 0.3],
          [0.9, 0.78],
          [0.16, 0.9],
        ].map(([x, y], i) => {
          const t = shifted(fast, i * 0.25);
          return (
            <Animated.Text
              key={`s${i}`}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: x * size - size * 0.1,
                top: y * size - size * 0.12,
                fontSize: Math.max(9, size * 0.2),
                color: i % 2 ? '#FFFFFF' : fx === 'crown' ? '#FDE68A' : '#7DEBEF',
                opacity: t.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: [0, 1, 0, 0] }),
                transform: [{ scale: t.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: [0.3, 1, 0.3, 0.3] }) }, { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) }],
              }}
            >
              ✦
            </Animated.Text>
          );
        })}

      {/* Crown floating above */}
      {fx === 'crown' && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -size * 0.3,
            transform: [{ translateY: wave(breatheI).interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.05] }) }, { rotate: wave(breatheI).interpolate({ inputRange: [0, 1], outputRange: ['-6deg', '6deg'] }) }],
          }}
        >
          <Text style={{ fontSize: size * 0.34 }}>👑</Text>
        </Animated.View>
      )}
    </View>
  );
}
