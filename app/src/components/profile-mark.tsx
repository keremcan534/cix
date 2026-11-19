// Profil izleri on a photo (lib/profile-marks, lib/mark-store): the dirt a Kaka left (assets/marks/kaka-iz.png, drawn
// by scripts/mark-art.py) with the gift's own small picture on it, and the water's splash when a Su washes it off.
// Drawn inside the photo's circle, so a frame (components/fx/frame-art, ui FramedAvatar) lies over it: the mark is on the
// photo, under the frame's ring. A kind the app has no picture for (a pair the panel made) shows the gift's badge alone.
// A mark landing splats on; "hareketi azalt" shows it still. MarkLayer fills its parent; `size` is the photo's.
import { useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { GiftArt } from '@/components/GiftArt';
import { Text } from '@/components/text';
import { cleanGiftFor, markKeyOf } from '@/lib/live/marks-live';
import { useMarkOf } from '@/lib/mark-store';
import { ownMarkNote } from '@/lib/profile-marks';
import { useSettings } from '@/store';

/** The dirt each kind draws (the panel's other kinds: the badge alone). */
const DIRT: Record<string, ImageSourcePropType> = { kaka: require('../../assets/marks/kaka-iz.png') };
const SPLASH = require('../../assets/marks/su-sicrama.png');

/**
 * The mark on `uid`'s photo (a local id: 'me', a server id, a sample id), over a photo of `size` px. Nothing when there
 * is none. `badge`: the gift's little picture on the photo (off where the photo is too small to carry it).
 */
export function MarkLayer({ uid, size, badge = true }: { uid: string | null | undefined; size: number; badge?: boolean }) {
  const { mark, fresh } = useMarkOf(markKeyOf(uid));
  const { reduceMotion } = useSettings();
  const [land] = useState(() => new Animated.Value(1));
  const [wash] = useState(() => new Animated.Value(1));
  // What just happened (lib/mark-store keeps it a few seconds): a mark landing, or the water washing it off.
  const landing = !reduceMotion && fresh?.type === 'land' && !!mark;
  const washing = !reduceMotion && fresh?.type === 'wash' && !mark ? fresh.mark : null;
  const at = fresh?.at ?? 0;
  useEffect(() => {
    if (!landing) return;
    land.setValue(0);
    Animated.timing(land, { toValue: 1, duration: 460, easing: Easing.out(Easing.back(1.7)), useNativeDriver: true }).start();
  }, [landing, at, land]);
  useEffect(() => {
    if (!washing) return;
    wash.setValue(0);
    Animated.timing(wash, { toValue: 1, duration: 950, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [washing, at, wash]);
  const shown = mark ?? washing;
  if (!shown) return null;
  const dirt = DIRT[shown.kind];
  // The badge sits low on the photo, right of the middle: clear of the corners where the mic, camera and heart badges go.
  const b = Math.max(14, Math.round(size * 0.32));
  const look = mark
    ? landing
      ? { opacity: land.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }), transform: [{ scale: land.interpolate({ inputRange: [0, 1], outputRange: [1.4, 1] }) }] }
      : null
    : { opacity: wash.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 0.75, 0] }), transform: [{ translateY: wash.interpolate({ inputRange: [0, 1], outputRange: [0, size * 0.14] }) }] };
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.clip]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[StyleSheet.absoluteFill, look]}>
        {dirt && <Image source={dirt} style={s.fill} resizeMode="cover" accessibilityIgnoresInvertColors />}
        {badge && (
          <View style={[s.badge, { width: b, height: b, left: `${60 - (b / size) * 50}%`, top: `${63 - (b / size) * 50}%` }]}>
            <GiftArt giftId={shown.gift} emoji={shown.emoji} size={b} />
          </View>
        )}
      </Animated.View>
      {washing && (
        <Animated.Image
          source={SPLASH}
          resizeMode="contain"
          style={[
            s.fill,
            {
              opacity: wash.interpolate({ inputRange: [0, 0.12, 0.65, 1], outputRange: [0, 1, 0.85, 0] }),
              transform: [{ scale: wash.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1.2] }) }],
            },
          ]}
        />
      )}
    </View>
  );
}

/**
 * My own profile's line while a mark shows on my photo: who left it, how long it stays and what cleans it (and that
 * Gizlilik can refuse marks). Nothing when there is none.
 */
export function OwnMarkNote({ style, textColor }: { style?: object; textColor?: string }) {
  const { mark } = useMarkOf(markKeyOf('me'));
  if (!mark) return null;
  const clean = cleanGiftFor(mark.kind);
  return (
    <View style={[s.note, style]} accessibilityRole="text">
      <GiftArt giftId={mark.gift} emoji={mark.emoji} size={22} />
      <Text style={[s.noteText, textColor ? { color: textColor } : null]} numberOfLines={3}>
        {ownMarkNote(mark, clean?.emoji ?? null)} İstemezsen Ayarlar › Gizlilik’ten kapatabilirsin.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  clip: { borderRadius: 9999, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
  badge: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(146, 84, 38, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(146, 84, 38, 0.35)',
  },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
});
