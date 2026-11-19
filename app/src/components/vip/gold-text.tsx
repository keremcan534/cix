// Gold lettering without a native gradient: the text is drawn once (its layout, shadow and screen-reader text), then
// once more per colour band, each copy clipped to its horizontal slice, so the letters go from pale gold at the top
// to deep gold at the bottom like the design's "VIP 1" and heading.
import { useState } from 'react';
import { View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';

/** Pale at the top, rich amber at the bottom (the design's "VIP 1": ink ~#f4e2ac at the top, ~#dfab62 at the foot). */
export const GOLD_BANDS = ['#f5e3ae', '#f0d494', '#e8bf78', '#e0ae64', '#d89f55'] as const;
/** Where each band ends, as a fraction of the line's height (the letters' ink sits between ~0.25 and ~0.8). */
export const GOLD_STOPS = [0.33, 0.44, 0.55, 0.66, 1] as const;

export function GoldText({
  children,
  style,
  wrap,
  bands = GOLD_BANDS,
  stops = GOLD_STOPS,
  shadow = 'rgba(38,14,0,0.75)',
  numberOfLines = 1,
  maxFontSizeMultiplier,
  fit,
}: {
  children: string;
  style: StyleProp<TextStyle>;
  wrap?: StyleProp<ViewStyle>;
  bands?: readonly string[];
  /** Where each band ends (fractions of the line's height; one per band, the last 1). */
  stops?: readonly number[];
  shadow?: string;
  numberOfLines?: number;
  maxFontSizeMultiplier?: number;
  /** Shrink to fit the width (one line). */
  fit?: boolean;
}) {
  const [h, setH] = useState(0);
  const last = bands.length - 1;
  // maxFontSizeMultiplier only when given: an explicit undefined would override Text's own cap (MAX_FONT_SCALE) and
  // let the letters grow with the phone's full text size.
  const same = {
    numberOfLines,
    adjustsFontSizeToFit: fit,
    minimumFontScale: fit ? 0.5 : undefined,
    ...(maxFontSizeMultiplier !== undefined && { maxFontSizeMultiplier }),
  };
  return (
    <View style={wrap}>
      <Text
        {...same}
        style={[style, { color: bands[last], textShadowColor: shadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 }]}
        onLayout={(e) => setH(e.nativeEvent.layout.height)}>
        {children}
      </Text>
      {h > 0 &&
        bands.slice(0, last).map((color, i) => {
          const top = i === 0 ? 0 : stops[i - 1] * h;
          return (
            <View
              key={color}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ position: 'absolute', left: 0, right: 0, top, height: stops[i] * h - top, overflow: 'hidden' }}>
              <Text {...same} style={[style, { color, marginTop: -top }]}>
                {children}
              </Text>
            </View>
          );
        })}
    </View>
  );
}
