// The app's on-off switch: a gold-rimmed track that lights up and a cream knob that slides (app/assets/luxe).
import { useEffect, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { tapHaptic } from '@/lib/haptics';
import { useSettings } from '@/store';

const TRACK_ON = require('../../assets/luxe/anahtar-acik.png');
const TRACK_OFF = require('../../assets/luxe/anahtar-kapali.png');
const KNOB_ART = require('../../assets/luxe/anahtar-topuz.png');

const WIDTH = 56;
const HEIGHT = 28;
const KNOB = 23;
const INSET = (HEIGHT - KNOB) / 2;

export function Switch({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
  style,
}: {
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { reduceMotion } = useSettings();
  const on = !!value;
  const [at] = useState(() => new Animated.Value(on ? 1 : 0));
  useEffect(() => {
    Animated.timing(at, { toValue: on ? 1 : 0, duration: reduceMotion ? 0 : 170, useNativeDriver: true }).start();
  }, [on, at, reduceMotion]);
  const translateX = at.interpolate({ inputRange: [0, 1], outputRange: [INSET, WIDTH - KNOB - INSET] });
  return (
    <Pressable
      onPress={() => {
        tapHaptic();
        onValueChange?.(!on);
      }}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: on, disabled: !!disabled }}
      aria-checked={on}
      style={[s.track, disabled && s.disabled, style]}
    >
      <Image source={TRACK_OFF} style={s.fill} resizeMode="stretch" accessibilityIgnoresInvertColors />
      <Animated.Image source={TRACK_ON} style={[s.fill, { opacity: at }]} resizeMode="stretch" accessibilityIgnoresInvertColors />
      <Animated.Image source={KNOB_ART} style={[s.knob, { transform: [{ translateX }] }]} resizeMode="contain" accessibilityIgnoresInvertColors />
    </Pressable>
  );
}

const s = StyleSheet.create({
  track: { width: WIDTH, height: HEIGHT },
  disabled: { opacity: 0.45 },
  fill: { position: 'absolute', left: 0, top: 0, width: WIDTH, height: HEIGHT },
  knob: { position: 'absolute', left: 0, top: INSET, width: KNOB, height: KNOB },
});
