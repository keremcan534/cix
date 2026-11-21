// Şanslı hediyelerin odadaki şeridi (Güncelleme 8): no chat line per send (thousands would bury the chat); once a send
// (a wheel's repeats included) is over, one strip slides in from the left in the middle of the screen: the sender's
// photo and name, "Gönderdi › whom", the gift and ×how many, and the best multiplier when it won. At most two show at
// once, stacked; each leaves after a few seconds. Not touchable; it says itself to screen readers.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { GiftArt } from '@/components/GiftArt';
import { Text } from '@/components/text';
import { Avatar } from '@/components/ui';

export type LuckyStrip = {
  key: string;
  fromName: string;
  fromAvatar?: string;
  /** "Ayşe", "4 kişi", "Tüm mikrofonlar". */
  toText: string;
  giftId: string;
  emoji: string;
  count: number;
  /** The best multiplier won (0: none). */
  mult: number;
};

export const STRIP_MS = 3600;
const SLIDE_MS = 320;

export function LuckyStrips({ strips, onDone }: { strips: LuckyStrip[]; onDone: (key: string) => void }) {
  // The two newest; older ones wait their turn underneath (they are dropped by the caller after their time).
  const shown = strips.slice(0, 2);
  return (
    <View pointerEvents="none" style={s.wrap}>
      {shown.map((x) => (
        <Strip key={x.key} strip={x} onDone={onDone} />
      ))}
    </View>
  );
}

function Strip({ strip, onDone }: { strip: LuckyStrip; onDone: (key: string) => void }) {
  const [t] = useState(() => new Animated.Value(0));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const a = Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: SLIDE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(STRIP_MS - SLIDE_MS * 2),
      Animated.timing(t, { toValue: 2, duration: SLIDE_MS, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]);
    a.start(() => done.current(strip.key));
    return () => a.stop();
  }, [t, strip.key]);
  const label = `${strip.fromName}, ${strip.toText} ${strip.count} şanslı hediye gönderdi${strip.mult > 1 ? `, ${strip.mult} kat kazandı` : ''}`;
  return (
    <Animated.View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
      style={[
        s.strip,
        {
          opacity: t.interpolate({ inputRange: [0, 0.4, 1, 1.6, 2], outputRange: [0, 1, 1, 1, 0] }),
          transform: [{ translateX: t.interpolate({ inputRange: [0, 1, 2], outputRange: [-280, 0, -40] }) }],
        },
      ]}
    >
      <Avatar uri={strip.fromAvatar} name={strip.fromName} size={34} />
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text style={s.name} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {strip.fromName}
        </Text>
        <Text style={s.to} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          Gönderdi › {strip.toText}
        </Text>
      </View>
      <GiftArt giftId={strip.giftId} emoji={strip.emoji} size={34} />
      <View style={{ alignItems: 'flex-start' }}>
        <Text style={s.count} maxFontSizeMultiplier={1.2}>
          ×{strip.count.toLocaleString('tr-TR')}
        </Text>
        {strip.mult > 1 && (
          <Text style={s.win} maxFontSizeMultiplier={1.2}>
            {strip.mult.toLocaleString('tr-TR')} kat
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 8, top: '52%', gap: 6, zIndex: 60 },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 300,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(124,58,237,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  name: { color: '#FFE7A3', fontSize: 13, fontWeight: '800' },
  to: { color: '#fff', fontSize: 11.5 },
  count: { color: '#fff', fontSize: 17, fontWeight: '900', fontStyle: 'italic' },
  win: { color: '#FFD54A', fontSize: 11, fontWeight: '800' },
});
