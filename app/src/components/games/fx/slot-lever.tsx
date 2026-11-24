// The machine's pull lever on its right side, as on a real slot cabinet: a chrome arm from a gold socket with a red
// glass ball on top. It comes down with every round (whichever way the round was started) and springs back, and the
// player can pull it: drag the ball down past the middle (or tap it) and the round starts as with Çevir. Seen from
// the front, the arm swings down through its socket: the ball drops below the socket and comes nearer (bigger).
// Decoration and an extra way to start a round; the round itself is the game's (onPull is its play()).
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, View } from 'react-native';

import { playSfx } from '@/lib/game-sound';
import { heavyHaptic, tapHaptic } from '@/lib/haptics';

/** The lever's width on the stage (px): the machine leaves this much on its right. */
export const LEVER_W = 34;
const BALL = 30;
const ROD = 8;
const SOCKET = 23;
/** How far below the socket the ball comes, as a part of the arm's length above it. */
const DOWN = 0.8;

/**
 * The lever's hand pull, made once (a gesture can't change handlers halfway): it reads the latest round state the
 * component gives it, and remembers that a round was started by hand so its own coming down isn't shown twice.
 */
class LeverPull {
  disabled = false;
  arm = 30;
  onPull: () => void = () => {};
  /** The last round was started by this pull (already shown). */
  private own = false;
  /** Whether the round just started was this pull's; asking forgets it. */
  takeOwn() {
    const was = this.own;
    this.own = false;
    return was;
  }
  constructor(private v: Animated.Value) {}
  set(disabled: boolean, arm: number, onPull: () => void) {
    this.disabled = disabled;
    this.arm = arm;
    this.onPull = onPull;
  }
  release = () => Animated.spring(this.v, { toValue: 0, friction: 4.2, tension: 70, useNativeDriver: true }).start();
  /** The lever latching at the bottom: a clunk in the ear and the hand. */
  slam = () => {
    playSfx('lever', 0.9);
    heavyHaptic();
  };
  readonly pan = PanResponder.create({
    onStartShouldSetPanResponder: () => !this.disabled,
    onMoveShouldSetPanResponder: (_, g) => !this.disabled && Math.abs(g.dy) > 4,
    onPanResponderGrant: () => {
      this.v.stopAnimation();
      tapHaptic();
    },
    onPanResponderMove: (_, g) => this.v.setValue(Math.max(0, Math.min(1, g.dy / (this.arm * (1 + DOWN))))),
    onPanResponderRelease: (_, g) => {
      const far = g.dy / (this.arm * (1 + DOWN));
      // A tap (hardly moved) or a pull past the middle starts the round; a short drag just springs back.
      if (far > 0.5 || (Math.abs(g.dy) < 6 && Math.abs(g.dx) < 6)) {
        this.own = true;
        Animated.timing(this.v, { toValue: 1, duration: 90, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => this.release());
        this.slam();
        this.onPull();
      } else this.release();
    },
    onPanResponderTerminate: () => this.release(),
  });
}

export function SlotLever({ height, pulls, disabled, still, onPull }: { height: number; /** Counts rounds started: each brings it down once. */ pulls: number; disabled?: boolean; still?: boolean; onPull: () => void }) {
  const arm = Math.max(30, Math.round(height * 0.46));
  const [v] = useState(() => new Animated.Value(0));
  const [pull] = useState(() => new LeverPull(v));
  useEffect(() => {
    pull.set(!!disabled, arm, onPull);
  });
  useEffect(() => {
    if (!pulls) return;
    // A pull the player made by hand has already been shown: the round it starts doesn't bring the lever down again.
    if (pull.takeOwn()) return;
    if (still) return;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
      if (finished) pull.release();
    });
    // The game plays the round's own start; the lever adds the latch.
    pull.slam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulls]);
  const pan = pull.pan;

  // The arm: drawn upward from the socket, flipped through it as the ball comes down.
  const flip = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.02, -DOWN] });
  const drop = v.interpolate({ inputRange: [0, 1], outputRange: [0, arm * (1 + DOWN)] });
  const near = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] });
  const mid = height / 2;
  return (
    <View style={[s.box, { height }]} pointerEvents="box-none">
      {/* The arm, its foot on the socket. */}
      <Animated.View style={[s.rod, { top: mid - arm, height: arm, transformOrigin: 'bottom', transform: [{ scaleY: flip }] }]}>
        <LinearGradient colors={['#3B3F48', '#F6F8FC', '#A3AAB8', '#4A4F5A']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      {/* The socket the arm turns in, bolted to the cabinet. */}
      <LinearGradient colors={['#FFF4C8', '#E0A33C', '#7A440A']} style={[s.socket, { top: mid - SOCKET / 2 }]}>
        <View style={s.bolt} />
      </LinearGradient>
      {/* The ball: red glass with a hot highlight; the part the player takes hold of. */}
      <Animated.View
        {...pan.panHandlers}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel="Kolu çek ve çevir"
        accessibilityState={{ disabled: !!disabled }}
        onAccessibilityTap={() => !disabled && onPull()}
        style={[s.ballBox, { top: mid - arm - BALL / 2, transform: [{ translateY: drop }, { scale: near }] }, disabled && { opacity: 0.75 }]}
      >
        <LinearGradient colors={['#FF8A8A', '#E2142C', '#6E0010']} start={{ x: 0.25, y: 0.1 }} end={{ x: 0.8, y: 1 }} style={s.ball}>
          <View style={s.shine} />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  box: { width: LEVER_W, alignItems: 'center' },
  rod: { position: 'absolute', width: ROD, left: (LEVER_W - ROD) / 2, borderRadius: ROD / 2, overflow: 'hidden', boxShadow: '1px 0 3px rgba(0,0,0,0.5)' },
  socket: { position: 'absolute', width: SOCKET, height: SOCKET, left: (LEVER_W - SOCKET) / 2, borderRadius: SOCKET / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#4A2A06', boxShadow: '0 2px 5px rgba(0,0,0,0.6)' },
  bolt: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#3A2205', borderWidth: 1, borderColor: '#FFE2A0' },
  ballBox: { position: 'absolute', width: BALL, height: BALL, left: (LEVER_W - BALL) / 2 },
  ball: { width: BALL, height: BALL, borderRadius: BALL / 2, boxShadow: '0 3px 6px rgba(0,0,0,0.55), inset 0 -3px 5px rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(80,0,10,0.9)' },
  shine: { position: 'absolute', left: 6, top: 4, width: 9, height: 6, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.85)', transform: [{ rotate: '-25deg' }] },
});
