// The app's on-off switch: a gold-rimmed track that lights up and a cream knob that slides (app/assets/luxe).
import { useEffect, useState } from 'react';
import { Animated, Image, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { tapHaptic } from '@/lib/haptics';
import { useSettings } from '@/store';

const TRACK_ON = require('../../assets/luxe/anahtar-acik.png');
const TRACK_OFF = require('../../assets/luxe/anahtar-kapali.png');
const KNOB_ART = require('../../assets/luxe/anahtar-topuz.png');

/**
 * Track width and height and the knob, in dp. `sm` is the Abonelik design's 44 × 22 switch (the same art, smaller);
 * its touch area still reaches 44 dp in height.
 */
const SIZES = {
  md: { width: 56, height: 28, knob: 23, slop: 8 },
  sm: { width: 44, height: 22, knob: 18, slop: { top: 11, bottom: 11, left: 8, right: 8 } },
} as const;

export function Switch({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
  style,
  size = 'md',
}: {
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  size?: keyof typeof SIZES;
}) {
  const { reduceMotion } = useSettings();
  const on = !!value;
  const d = SIZES[size];
  const inset = (d.height - d.knob) / 2;
  const [at] = useState(() => new Animated.Value(on ? 1 : 0));
  useEffect(() => {
    Animated.timing(at, { toValue: on ? 1 : 0, duration: reduceMotion ? 0 : 170, useNativeDriver: true }).start();
  }, [on, at, reduceMotion]);
  const translateX = at.interpolate({ inputRange: [0, 1], outputRange: [inset, d.width - d.knob - inset] });
  const fill = { position: 'absolute', left: 0, top: 0, width: d.width, height: d.height } as const;
  return (
    <Pressable
      onPress={() => {
        tapHaptic();
        onValueChange?.(!on);
      }}
      disabled={disabled}
      hitSlop={d.slop}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: on, disabled: !!disabled }}
      aria-checked={on}
      style={[{ width: d.width, height: d.height }, disabled && { opacity: 0.45 }, style]}
    >
      <Image source={TRACK_OFF} style={fill} resizeMode="stretch" accessibilityIgnoresInvertColors />
      <Animated.Image source={TRACK_ON} style={[fill, { opacity: at }]} resizeMode="stretch" accessibilityIgnoresInvertColors />
      <Animated.Image
        source={KNOB_ART}
        style={{ position: 'absolute', left: 0, top: inset, width: d.knob, height: d.knob, transform: [{ translateX }] }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </Pressable>
  );
}
